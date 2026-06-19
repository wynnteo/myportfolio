import type { BatchQuoteResult } from '../pages/api/quote';

export type QuoteMap = BatchQuoteResult;

/**
 * Fetch prices for non-unit-trust symbols using the batch Yahoo endpoint.
 * Returns a map of symbol → { price, currency, asOf }.
 */
export async function fetchBatchQuotes(symbols: string[]): Promise<QuoteMap> {
  if (symbols.length === 0) return {};
  try {
    const res = await fetch(
      `/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`
    );
    if (!res.ok) return {};
    return res.json();
  } catch {
    return {};
  }
}

/**
 * Fetch price for a single unit trust symbol from FT/Aberdeen.
 * Returns { price, asOf } or null on failure.
 */
export async function fetchFundQuote(
  symbol: string,
  productName: string
): Promise<{ price: number; asOf: string | null } | null> {
  try {
    const s = symbol.includes(':') ? symbol : `${symbol}:SGD`;
    const res = await fetch(
      `/api/fund-quote?s=${encodeURIComponent(s)}&name=${encodeURIComponent(productName)}`
    );
    if (!res.ok) return null;
    const j = await res.json();
    if (typeof j.price !== 'number') return null;
    return { price: j.price, asOf: j.lastUpdated ?? null };
  } catch {
    return null;
  }
}

/**
 * Fetch all quotes for a mixed list of holdings.
 * Unit trusts go through fund-quote; everything else goes through the batch endpoint.
 */
export async function fetchAllHoldingQuotes(
  holdings: Array<{ symbol: string; productName: string; category: string }>
): Promise<QuoteMap> {
  const utHoldings = holdings.filter(h => h.category === 'Unit Trusts');
  const otherHoldings = holdings.filter(h => h.category !== 'Unit Trusts');

  const otherSymbols = Array.from(new Set(otherHoldings.map(h => h.symbol)));
  const utSymbols = Array.from(new Set(utHoldings.map(h => h.symbol)));

  const [batchResult, ...utResults] = await Promise.all([
    fetchBatchQuotes(otherSymbols),
    ...utSymbols.map(sym => {
      const h = utHoldings.find(x => x.symbol === sym)!;
      return fetchFundQuote(sym, h.productName).then(r =>
        r ? ({ sym, r }) : null
      );
    }),
  ]);

  const combined: QuoteMap = { ...batchResult };

  for (const ut of utResults) {
    if (!ut) continue;
    combined[ut.sym] = {
      symbol: ut.sym,
      currency: 'SGD',
      price: ut.r.price,
      asOf: ut.r.asOf,
    };
  }

  return combined;
}