import { cachedJsonFetch } from './cache';
import { quoteEnv } from './env';
import { DividendEntry, PricePayload, QuoteFetcherOptions, QuoteMetadata, QuotePayload } from './types';

interface FinnhubProfileResponse {
  name?: string;
  ticker?: string;
  exchange?: string;
  currency?: string;
}

interface FinnhubQuoteResponse {
  c?: number; // current price
  d?: number; // change
  dp?: number; // percent change
  h?: number; // high
  l?: number; // low
  o?: number; // open
  pc?: number; // previous close
  t?: number; // timestamp
}

interface FinnhubDividendResponse {
  date?: string;
  amount?: number;
  paymentDate?: string;
  currency?: string;
}

async function fetchFinnhubProfile(symbol: string, options?: QuoteFetcherOptions): Promise<QuoteMetadata | null> {
  if (!quoteEnv.FINNHUB_API_KEY) return null;

  try {
    const params = new URLSearchParams({ symbol });
    const data = await cachedJsonFetch<FinnhubProfileResponse>(
      `https://finnhub.io/api/v1/stock/profile2?${params.toString()}`,
      {
        cacheTag: `${options?.cacheTag ?? 'quote'}-finnhub-profile-${symbol}`,
        revalidateSeconds: options?.revalidateSeconds,
        init: { headers: { 'X-Finnhub-Token': quoteEnv.FINNHUB_API_KEY } },
      },
    );

    return {
      symbol: (data.ticker ?? symbol).toUpperCase(),
      exchange: data.exchange,
      currency: data.currency,
      name: data.name,
    };
  } catch {
    return null;
  }
}

async function fetchFinnhubQuote(symbol: string, options?: QuoteFetcherOptions): Promise<PricePayload | null> {
  if (!quoteEnv.FINNHUB_API_KEY) return null;

  try {
    const params = new URLSearchParams({ symbol });
    const data = await cachedJsonFetch<FinnhubQuoteResponse>(
      `https://finnhub.io/api/v1/quote?${params.toString()}`,
      {
        cacheTag: `${options?.cacheTag ?? 'quote'}-finnhub-quote-${symbol}`,
        revalidateSeconds: options?.revalidateSeconds,
        init: { headers: { 'X-Finnhub-Token': quoteEnv.FINNHUB_API_KEY } },
      },
    );

    return {
      last: data.c,
      change: data.d,
      changePercent: data.dp,
      open: data.o,
      high: data.h,
      low: data.l,
      previousClose: data.pc,
      timestamp: data.t,
    };
  } catch {
    return null;
  }
}

async function fetchFinnhubDividends(symbol: string, options?: QuoteFetcherOptions): Promise<DividendEntry[]> {
  if (!quoteEnv.FINNHUB_API_KEY) return [];

  try {
    const now = new Date();
    const past = new Date();
    past.setFullYear(now.getFullYear() - 3);
    const params = new URLSearchParams({
      symbol,
      from: past.toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
    });

    const data = await cachedJsonFetch<FinnhubDividendResponse[]>(
      `https://finnhub.io/api/v1/stock/dividend?${params.toString()}`,
      {
        cacheTag: `${options?.cacheTag ?? 'quote'}-finnhub-dividends-${symbol}`,
        revalidateSeconds: options?.revalidateSeconds,
        init: { headers: { 'X-Finnhub-Token': quoteEnv.FINNHUB_API_KEY } },
      },
    );

    return data
      .filter(
        (entry): entry is FinnhubDividendResponse & { date: string; amount: number } =>
          typeof entry.date === 'string' && typeof entry.amount === 'number',
      )
      .map((entry) => ({
        exDate: entry.date,
        payDate: entry.paymentDate,
        amount: entry.amount,
        currency: entry.currency,
        source: 'finnhub',
      }));
  } catch {
    return [];
  }
}

export async function fetchFinnhubQuoteBundle(
  symbol: string,
  options?: QuoteFetcherOptions,
): Promise<QuotePayload | null> {
  if (!quoteEnv.FINNHUB_API_KEY) return null;

  const [metadata, price, dividends] = await Promise.all([
    fetchFinnhubProfile(symbol, options),
    fetchFinnhubQuote(symbol, options),
    fetchFinnhubDividends(symbol, options),
  ]);

  if (!metadata || !price) return null;

  return {
    source: 'finnhub',
    metadata,
    price,
    dividends,
  };
}
