
import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Bottleneck from 'bottleneck';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 60 * 15 /* 15 minutes */ });

const limiter = new Bottleneck({
  minTime: 700, // at most ~1.4 requests/sec; tune lower if you need
  maxConcurrent: 2,
});

function ftUrlFromS(s: string) {
  // sanitize s
  return `https://markets.ft.com/data/funds/tearsheet/summary?s=${encodeURIComponent(s)}`;
}

async function fetchFtPage(url: string) {
  // All requests go through limiter
  return limiter.schedule(async () => {
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://markets.ft.com/',
    };
    const resp = await axios.get(url, { headers, timeout: 15_000 });
    return resp.data as string;
  });
}

function parsePriceAndTime(html: string) {
  const $ = cheerio.load(html);

  let priceText: string | null = null;

  // 1) try more specific: data list with "Price" label
  $('dl.mod-ui-data-list').each((i, dl) => {
    const label = $(dl).find('dt').first().text().trim().toLowerCase();
    if (label.includes('price') && !priceText) {
      priceText = $(dl).find('dd.mod-ui-data-list__value').first().text().trim();
    }
  });

  // 2) general fallback: first .mod-ui-data-list__value
  if (!priceText) {
    const v = $('.mod-ui-data-list__value').first().text().trim();
    if (v) priceText = v;
  }

  // normalize price
  let price: number | null = null;
  if (priceText) {
    const cleaned = priceText.replace(/[,$\s]/g, '').replace(/—/g, '');
    const n = Number(cleaned);
    if (!Number.isNaN(n)) price = n;
  }

  // parse disclaimer time
  const disclaimer = $('div.mod-disclaimer').first().text().trim();
  let lastUpdated: string | null = null;
  if (disclaimer) {
    // Example: "Data delayed at least 15 minutes, as of Dec 10 2025."
    const m = disclaimer.match(/as of\s+(.+?)\./i);
    if (m && m[1]) {
      lastUpdated = m[1].trim();
    } else {
      lastUpdated = disclaimer;
    }
  }

  return { price, priceText, lastUpdated, disclaimer };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const s = (req.query.s as string) ?? req.body?.s;
    if (!s) return res.status(400).json({ error: 'missing s parameter (e.g. LU0320765646:SGD)' });

    const cacheKey = `ft:${s}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.status(200).json({ ...cached, cached: true });

    const url = ftUrlFromS(s);

    // Optional robots check could be added here (fetch /robots.txt and inspect)
    const html = await fetchFtPage(url);
    const parsed = parsePriceAndTime(html);

    if (!parsed.price) {
      // fallback: return found text and raw HTML snippet for debugging
      cache.set(cacheKey, { ...parsed }, 60 * 5);
      return res.status(200).json({ ...parsed, note: 'price not parsed to number; see priceText', url });
    }

    const result = {
      s,
      url,
      price: parsed.price,
      priceText: parsed.priceText,
      lastUpdated: parsed.lastUpdated,
      disclaimer: parsed.disclaimer,
      cached: false,
    };

    cache.set(cacheKey, result, 60 * 15);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('fund-quote error', err?.message || err);
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
}
