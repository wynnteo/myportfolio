import type { RequestInit as NextRequestInit } from 'next/dist/server/web/spec-extension/request';

import { quoteEnv } from './env';
import { QuoteFetcherOptions } from './types';

export const DEFAULT_REVALIDATE_SECONDS = quoteEnv.QUOTE_REVALIDATE_SECONDS ?? 900;

interface CachedFetchOptions extends QuoteFetcherOptions {
  init?: NextRequestInit;
}

export async function cachedJsonFetch<T>(url: string, options: CachedFetchOptions = {}): Promise<T> {
  const response = await fetch(url, {
    ...options.init,
    next: {
      revalidate: options.revalidateSeconds ?? DEFAULT_REVALIDATE_SECONDS,
      tags: options.cacheTag ? [options.cacheTag] : undefined,
    },
  });

  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}
