import { fetchFinnhubQuoteBundle } from './finnhub';
import { fetchYahooFinanceQuote } from './yahoo';
import { DividendEntry, QuotePayload, QuoteResponse, QuoteFetcherOptions, QuoteSource } from './types';

interface FetchQuoteOptions extends QuoteFetcherOptions {
  manualDividends?: DividendEntry[];
  preferSource?: QuoteSource;
}

function mergeDividends(remote: DividendEntry[], manual?: DividendEntry[], fallbackCurrency?: string): DividendEntry[] {
  const normalizedManual = (manual ?? []).map((entry) => ({
    ...entry,
    currency: entry.currency ?? fallbackCurrency,
    source: entry.source ?? 'manual',
  }));

  const combined = [...remote, ...normalizedManual];

  return combined
    .filter((entry) => Boolean(entry.exDate) && typeof entry.amount === 'number')
    .sort((a, b) => new Date(b.exDate).getTime() - new Date(a.exDate).getTime());
}

function normalizePayload(payload: QuotePayload): QuotePayload {
  const normalizedCurrency = payload.metadata.currency ?? payload.price?.currency;

  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      currency: normalizedCurrency,
      symbol: payload.metadata.symbol.toUpperCase(),
    },
    price: payload.price
      ? {
          ...payload.price,
          currency: payload.price.currency ?? normalizedCurrency,
        }
      : undefined,
    dividends: payload.dividends.map((dividend) => ({
      ...dividend,
      currency: dividend.currency ?? normalizedCurrency,
    })),
  };
}

async function tryYahoo(symbol: string, options?: QuoteFetcherOptions): Promise<QuotePayload | null> {
  return fetchYahooFinanceQuote(symbol, options);
}

async function tryFinnhub(symbol: string, options?: QuoteFetcherOptions): Promise<QuotePayload | null> {
  return fetchFinnhubQuoteBundle(symbol, options);
}

export async function fetchQuote(symbol: string, options?: FetchQuoteOptions): Promise<QuoteResponse> {
  const errors: string[] = [];
  const orderedSources: QuoteSource[] = options?.preferSource
    ? [options.preferSource, options.preferSource === 'yahoo-finance' ? 'finnhub' : 'yahoo-finance']
    : ['yahoo-finance', 'finnhub'];

  let payload: QuotePayload | null = null;

  for (const source of orderedSources) {
    const result = source === 'yahoo-finance'
      ? await tryYahoo(symbol, options)
      : await tryFinnhub(symbol, options);

    if (result) {
      payload = normalizePayload(result);
      break;
    }

    errors.push(`Unable to fetch quote from ${source} for ${symbol}.`);
  }

  if (!payload) {
    return { errors };
  }

  const combinedDividends = mergeDividends(payload.dividends, options?.manualDividends, payload.metadata.currency);

  return {
    payload: {
      ...payload,
      dividends: combinedDividends,
    },
    errors,
  };
}

export type {
  DividendEntry,
  FetchQuoteOptions,
  QuotePayload,
  QuoteResponse,
  QuoteFetcherOptions,
  QuoteSource,
} from './types';
