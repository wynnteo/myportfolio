import type { NextApiRequest, NextApiResponse } from 'next';

const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        currency?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
      };
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string };
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).end('Method Not Allowed');
    return;
  }

  const symbol = Array.isArray(req.query.symbol) ? req.query.symbol[0] : req.query.symbol;

  if (!symbol || typeof symbol !== 'string') {
    res.status(400).json({ error: 'symbol is required' });
    return;
  }

  try {
    const url = `${BASE_URL}/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const response = await fetch(url);

    if (!response.ok) {
      res.status(response.status).json({ error: `Failed to fetch quote for ${symbol}` });
      return;
    }

    const data = (await response.json()) as YahooChartResponse;

    const result = data.chart?.result?.[0];

    if (!result) {
      const description = data.chart?.error?.description ?? 'Quote not found';
      res.status(404).json({ error: description });
      return;
    }

    const priceCandidate =
      result.meta?.regularMarketPrice ?? result.indicators?.quote?.[0]?.close?.filter((p) => p !== null).at(-1);

    if (!Number.isFinite(priceCandidate)) {
      res.status(502).json({ error: 'Unable to parse latest price from Yahoo Finance response' });
      return;
    }

    const asOfTimestamp = result.meta?.regularMarketTime;

    res.status(200).json({
      symbol: result.meta?.symbol ?? symbol,
      currency: result.meta?.currency ?? null,
      price: priceCandidate,
      asOf: Number.isFinite(asOfTimestamp) ? new Date((asOfTimestamp as number) * 1000).toISOString() : null,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unexpected error' });
  }
}
