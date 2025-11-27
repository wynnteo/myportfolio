import { cachedJsonFetch } from './cache';
import { quoteEnv } from './env';
import { DividendEntry, PricePayload, QuoteMetadata, QuotePayload, QuoteFetcherOptions } from './types';

interface YahooQuoteResponse {
  price?: {
    exchangeName?: string;
    currency?: string;
    symbol?: string;
    shortName?: string;
    longName?: string;
    regularMarketPrice?: { raw?: number };
    regularMarketChange?: { raw?: number };
    regularMarketChangePercent?: { raw?: number };
    regularMarketOpen?: { raw?: number };
    regularMarketDayHigh?: { raw?: number };
    regularMarketDayLow?: { raw?: number };
    regularMarketPreviousClose?: { raw?: number };
    regularMarketTime?: number;
  };
  summaryDetail?: {
    currency?: string;
    exDividendDate?: { raw?: number };
    dividendRate?: { raw?: number };
    trailingAnnualDividendRate?: { raw?: number };
  };
  summaryProfile?: {
    exchangeName?: string;
  };
  quoteType?: {
    longName?: string;
  };
}

interface YahooDividendEventsResponse {
  eventsData?: {
    dividends?: Record<
      string,
      {
        amount?: number;
        date?: number;
      }
    >;
  };
}

function parseYahooMetadata(symbol: string, payload: YahooQuoteResponse): QuoteMetadata {
  const price = payload.price ?? {};
  const summaryProfile = payload.summaryProfile ?? {};
  const quoteType = payload.quoteType ?? {};

  return {
    symbol: symbol.toUpperCase(),
    exchange: price.exchangeName ?? summaryProfile.exchangeName,
    currency: price.currency ?? payload.summaryDetail?.currency,
    name: price.shortName ?? price.longName ?? quoteType.longName,
  };
}

function parseYahooPrice(payload: YahooQuoteResponse): PricePayload | undefined {
  const price = payload.price;

  if (!price) return undefined;

  return {
    last: price.regularMarketPrice?.raw,
    change: price.regularMarketChange?.raw,
    changePercent: price.regularMarketChangePercent?.raw,
    open: price.regularMarketOpen?.raw,
    high: price.regularMarketDayHigh?.raw,
    low: price.regularMarketDayLow?.raw,
    previousClose: price.regularMarketPreviousClose?.raw,
    currency: price.currency ?? payload.summaryDetail?.currency,
    timestamp: price.regularMarketTime,
  };
}

function parseYahooDividends(payload: YahooQuoteResponse): DividendEntry[] {
  const dividends: DividendEntry[] = [];
  const summaryDetail = payload.summaryDetail;

  if (summaryDetail?.exDividendDate?.raw && summaryDetail.dividendRate?.raw) {
    dividends.push({
      exDate: new Date(summaryDetail.exDividendDate.raw * 1000).toISOString().split('T')[0],
      amount: summaryDetail.dividendRate.raw,
      currency: summaryDetail.currency,
      source: 'yahoo-finance',
    });
  }

  return dividends;
}

async function fetchYahooDividendEvents(
  symbol: string,
  options?: QuoteFetcherOptions,
): Promise<DividendEntry[]> {
  if (!quoteEnv.YAHOO_FINANCE_RAPIDAPI_KEY) return [];

  try {
    const now = new Date();
    const yearAgo = new Date();
    yearAgo.setFullYear(now.getFullYear() - 3);
    const params = new URLSearchParams({
      symbol,
      region: 'US',
      events: 'div',
      lang: 'en',
      from: yearAgo.toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
    });

    const data = await cachedJsonFetch<YahooDividendEventsResponse>(
      `https://yh-finance.p.rapidapi.com/stock/v3/get-historical-data?${params.toString()}`,
      {
        cacheTag: `${options?.cacheTag ?? 'quote'}-yahoo-dividends-${symbol}`,
        revalidateSeconds: options?.revalidateSeconds,
        init: {
          headers: {
            'x-rapidapi-host': 'yh-finance.p.rapidapi.com',
            'x-rapidapi-key': quoteEnv.YAHOO_FINANCE_RAPIDAPI_KEY,
          },
        },
      },
    );

    const events = data.eventsData?.dividends ?? {};
    return Object.values(events)
      .filter((entry): entry is { amount: number; date: number } => typeof entry.amount === 'number' && typeof entry.date === 'number')
      .map((entry): DividendEntry => ({
        exDate: new Date(entry.date * 1000).toISOString().split('T')[0],
        amount: entry.amount,
        source: 'yahoo-finance',
      }));
  } catch {
    return [];
  }
}

export async function fetchYahooFinanceQuote(
  symbol: string,
  options?: QuoteFetcherOptions,
): Promise<QuotePayload | null> {
  if (!quoteEnv.YAHOO_FINANCE_RAPIDAPI_KEY) return null;

  const params = new URLSearchParams({
    symbol,
    region: 'US',
    lang: 'en',
  });

  try {
    const data = await cachedJsonFetch<YahooQuoteResponse>(
      `https://yh-finance.p.rapidapi.com/stock/v2/get-summary?${params.toString()}`,
      {
        cacheTag: `${options?.cacheTag ?? 'quote'}-yahoo-${symbol}`,
        revalidateSeconds: options?.revalidateSeconds,
        init: {
          headers: {
            'x-rapidapi-host': 'yh-finance.p.rapidapi.com',
            'x-rapidapi-key': quoteEnv.YAHOO_FINANCE_RAPIDAPI_KEY,
          },
        },
      },
    );

    const metadata = parseYahooMetadata(symbol, data);
    const price = parseYahooPrice(data);
    const dividends = [...parseYahooDividends(data), ...(await fetchYahooDividendEvents(symbol, options))];

    return {
      source: 'yahoo-finance',
      metadata,
      price,
      dividends,
    };
  } catch {
    return null;
  }
}
