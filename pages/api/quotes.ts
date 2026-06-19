import type { NextApiRequest, NextApiResponse } from 'next';

const SPARK_URL = 'https://query1.finance.yahoo.com/v7/finance/spark';

interface SparkResponse {
  spark?: {
    result?: Array<{
      symbol: string;
      response?: Array<{
        meta?: {
          symbol?: string;
          currency?: string;
          regularMarketPrice?: number;
          regularMarketTime?: number;
        };
        indicators?: {
          quote?: Array<{ close?: Array<number | null> }>;
        };
      }>;
    }>;
    error?: { description?: string };
  };
}

export type BatchQuoteResult = Record<string, {
  symbol: string;
  currency: string | null;
  price: number;
  asOf: string | null;
}>;

// Yahoo caps spark at ~20 symbols per call
const BATCH_SIZE = 20;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end('Method Not Allowed');
  }

  const raw = Array.isArray(req.query.symbols)
    ? req.query.symbols[0]
    : req.query.symbols;

  if (!raw) return res.status(400).json({ error: 'symbols is required' });

  const symbols = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (symbols.length === 0) return res.status(400).json({ error: 'No valid symbols' });

  const results: BatchQuoteResult = {};

  // Process in batches of 20
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const chunk = symbols.slice(i, i + BATCH_SIZE);
    try {
      const url = `${SPARK_URL}?symbols=${encodeURIComponent(chunk.join(','))}&range=1d&interval=1d`;
      const r = await fetch(url);
      if (!r.ok) continue;

      const data = (await r.json()) as SparkResponse;

      for (const item of data.spark?.result ?? []) {
        const meta = item.response?.[0]?.meta;
        const closes = item.response?.[0]?.indicators?.quote?.[0]?.close;
        const price = meta?.regularMarketPrice
          ?? closes?.filter((p): p is number => p !== null).at(-1);

        if (!Number.isFinite(price)) continue;

        const ts = meta?.regularMarketTime;
        results[item.symbol] = {
          symbol: meta?.symbol ?? item.symbol,
          currency: meta?.currency ?? null,
          price: price as number,
          asOf: Number.isFinite(ts)
            ? new Date((ts as number) * 1000).toISOString()
            : null,
        };
      }
    } catch {
      // continue — partial results are fine
    }
  }

  return res.status(200).json(results);
}