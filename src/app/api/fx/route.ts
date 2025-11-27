import { NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";

const SUPPORTED = ["USD", "SGD", "MYR"] as const;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const base = (searchParams.get("base") || "SGD").toUpperCase();
  const quote = (searchParams.get("quote") || "").toUpperCase();

  if (!quote || !SUPPORTED.includes(base as (typeof SUPPORTED)[number]) || !SUPPORTED.includes(quote as (typeof SUPPORTED)[number])) {
    return NextResponse.json({ error: "Unsupported currency" }, { status: 400 });
  }

  if (base === quote) {
    return NextResponse.json({ rate: 1 });
  }

  try {
    const response = await fetch(
      `https://apidojo-yahoo-finance-v1.p.rapidapi.com/market/v3/get-quotes?region=US&symbols=${base}${quote}=X`,
      {
        headers: {
          "X-RapidAPI-Key": env.NEXT_PUBLIC_YAHOO_FINANCE_RAPIDAPI_KEY,
          "X-RapidAPI-Host": "apidojo-yahoo-finance-v1.p.rapidapi.com",
        },
        next: { revalidate: 60 * 15 },
      },
    );

    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch FX" }, { status: 502 });
    }

    const payload = (await response.json()) as {
      quoteResponse?: { result?: { regularMarketPrice?: number }[] };
    };
    const rate = payload.quoteResponse?.result?.[0]?.regularMarketPrice;

    if (!rate || Number.isNaN(rate)) {
      return NextResponse.json({ error: "No FX result" }, { status: 404 });
    }

    return NextResponse.json({ rate });
  } catch (error) {
    console.error("FX fetch failed", error);
    return NextResponse.json({ error: "FX fetch failed" }, { status: 500 });
  }
}
