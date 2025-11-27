export type QuoteSource = 'yahoo-finance' | 'finnhub';

export interface QuoteMetadata {
  symbol: string;
  exchange?: string;
  currency?: string;
  name?: string;
}

export interface PricePayload {
  last?: number;
  change?: number;
  changePercent?: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  currency?: string;
  timestamp?: number;
}

export interface DividendEntry {
  exDate: string;
  payDate?: string;
  amount: number;
  currency?: string;
  source?: QuoteSource | 'manual';
}

export interface QuotePayload {
  source: QuoteSource;
  metadata: QuoteMetadata;
  price?: PricePayload;
  dividends: DividendEntry[];
}

export interface QuoteFetcherOptions {
  cacheTag?: string;
  revalidateSeconds?: number;
}

export interface QuoteResponse {
  payload?: QuotePayload;
  errors: string[];
}
