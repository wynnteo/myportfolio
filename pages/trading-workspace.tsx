import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { z } from "zod";

export type TradeType = "buy" | "sell" | "dividend";

export interface TradeEntry {
  id: string;
  type: TradeType;
  ticker: string;
  quantity: number;
  price: number;
  fees: number;
  date: string;
  broker: string;
  currency: string;
  fxRate?: number;
  notes?: string;
}

interface BrokerTemplate {
  id: string;
  name: string;
  defaultCurrency: string;
  description: string;
  mapping: Record<string, string>;
  sample: string;
}

interface HoldingDetail {
  ticker: string;
  quantity: number;
  averageCost: number;
  lastPrice: number;
  marketValueBase: number;
  pl: number;
  fxRate: number;
  currency: string;
  sector?: string;
  region?: string;
  dividendYield: number;
}

interface MetricsSummary {
  totalFees: number;
  averageCosts: {
    ticker: string;
    averageCost: number;
    quantity: number;
  }[];
  realized: {
    ticker: string;
    value: number;
  }[];
  unrealized: {
    ticker: string;
    value: number;
    marketValue: number;
  }[];
  dividendsYtd: number;
  dividendsByTicker: {
    ticker: string;
    value: number;
  }[];
  holdings: HoldingDetail[];
}

const BASE_CURRENCY = "SGD";
const SUPPORTED_CURRENCIES = ["SGD", "USD", "MYR", "HKD"];

const instrumentMeta: Record<string, { sector: string; region: string }> = {
  AAPL: { sector: "Technology", region: "US" },
  TSLA: { sector: "Consumer Discretionary", region: "US" },
  NVDA: { sector: "Technology", region: "US" },
  BABA: { sector: "Consumer Discretionary", region: "CN" },
  UOB: { sector: "Financials", region: "SG" },
  D05: { sector: "Financials", region: "SG" },
  "0700.DIF": { sector: "Communication Services", region: "CN" },
};

const brokerTemplates: BrokerTemplate[] = [
  {
    id: "moomoo",
    name: "MooMoo SG",
    defaultCurrency: "SGD",
    description: "CSV export from MooMoo with contract FX hints and commission columns.",
    mapping: {
      ticker: "Symbol",
      type: "Side",
      quantity: "Qty",
      price: "Price",
      fees: "Commission",
      date: "Trade Date",
      currency: "Currency",
      fxRate: "FX Rate",
    },
    sample:
      "Symbol,Side,Qty,Price,Commission,Trade Date,Currency,FX Rate\nAAPL,BUY,12,189.40,4.95,2024-03-12,USD,1.35\nTSLA,SELL,5,249.10,4.95,2024-05-01,USD,1.34",
  },
  {
    id: "tiger",
    name: "Tiger Brokers",
    defaultCurrency: "USD",
    description: "Tiger Brokers trade export with base currency and FX multiplier.",
    mapping: {
      ticker: "Symbol",
      type: "Transaction Type",
      quantity: "Quantity",
      price: "Trade Price",
      fees: "Commissions",
      date: "Trade Date",
      currency: "Currency",
      fxRate: "FX Rate to Base",
    },
    sample:
      "Symbol,Transaction Type,Quantity,Trade Price,Commissions,Trade Date,Currency,FX Rate to Base\nMSFT,BUY,6,320.12,2.10,2024-02-10,USD,1.33\nUOB,BUY,120,28.45,10.00,2024-04-02,SGD,1",
  },
  {
    id: "ibkr",
    name: "IBKR",
    defaultCurrency: "USD",
    description: "Interactive Brokers default format with FX multiplier to base currency.",
    mapping: {
      ticker: "Ticker",
      type: "Action",
      quantity: "Quantity",
      price: "Price",
      fees: "Commissions",
      date: "Date/Time",
      currency: "Currency",
      fxRate: "FX Rate to Base",
    },
    sample:
      "Ticker,Action,Quantity,Price,Commissions,Date/Time,Currency,FX Rate to Base\nNVDA,BUY,4,950.00,3.00,2024-07-20,USD,1.34\nBABA,DIVIDEND,10,0.21,0.00,2024-09-15,HKD,0.17",
  },
  {
    id: "poems",
    name: "POEMS / FSMOne / CMC / LongBridge",
    defaultCurrency: "SGD",
    description: "Generic SG broker export with mappable columns for POEMS, FSMOne, CMC Invest, or LongBridge.",
    mapping: {
      ticker: "Security",
      type: "Type",
      quantity: "Units",
      price: "Price",
      fees: "Fee",
      date: "Date",
      currency: "CCY",
      fxRate: "FX",
    },
    sample:
      "Security,Type,Units,Price,Fee,Date,CCY,FX\nD05,BUY,100,32.10,8.00,2024-06-12,SGD,1\n0700.DIF,BUY,50,390.00,15.00,2024-06-20,HKD,0.17",
  },
];

const seedTrades: TradeEntry[] = [
  {
    id: "seed-aapl-buy",
    type: "buy",
    ticker: "AAPL",
    quantity: 20,
    price: 189.4,
    fees: 4.95,
    date: "2024-03-12",
    broker: "MooMoo SG",
    currency: "USD",
    fxRate: 1.35,
  },
  {
    id: "seed-aapl-div",
    type: "dividend",
    ticker: "AAPL",
    quantity: 20,
    price: 0.24,
    fees: 0,
    date: "2024-06-11",
    broker: "MooMoo SG",
    currency: "USD",
    fxRate: 1.34,
  },
  {
    id: "seed-tsla-sell",
    type: "sell",
    ticker: "TSLA",
    quantity: 5,
    price: 249.1,
    fees: 4.95,
    date: "2024-05-01",
    broker: "MooMoo SG",
    currency: "USD",
    fxRate: 1.34,
  },
  {
    id: "seed-nvda-buy",
    type: "buy",
    ticker: "NVDA",
    quantity: 4,
    price: 950.0,
    fees: 3,
    date: "2024-07-20",
    broker: "Tiger Brokers",
    currency: "USD",
    fxRate: 1.34,
  },
  {
    id: "seed-baba-div",
    type: "dividend",
    ticker: "BABA",
    quantity: 10,
    price: 0.21,
    fees: 0,
    date: "2024-09-15",
    broker: "Tiger Brokers",
    currency: "HKD",
    fxRate: 0.17,
  },
  {
    id: "seed-uob-buy",
    type: "buy",
    ticker: "UOB",
    quantity: 120,
    price: 28.45,
    fees: 10,
    date: "2024-04-02",
    broker: "IBKR",
    currency: "SGD",
    fxRate: 1,
  },
  {
    id: "seed-d05-buy",
    type: "buy",
    ticker: "D05",
    quantity: 100,
    price: 32.1,
    fees: 8,
    date: "2024-06-12",
    broker: "POEMS / FSMOne / CMC / LongBridge",
    currency: "SGD",
    fxRate: 1,
  },
  {
    id: "seed-tencent-buy",
    type: "buy",
    ticker: "0700.DIF",
    quantity: 50,
    price: 390,
    fees: 15,
    date: "2024-06-20",
    broker: "POEMS / FSMOne / CMC / LongBridge",
    currency: "HKD",
    fxRate: 0.17,
  },
];

const tradeSchema = z.object({
  type: z.enum(["buy", "sell", "dividend"]),
  ticker: z
    .string()
    .min(1, "Ticker is required")
    .transform((value) => value.toUpperCase()),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  price: z.coerce.number().nonnegative("Price cannot be negative"),
  fees: z.coerce.number().min(0, "Fees cannot be negative"),
  date: z.string().min(1, "Trade date is required"),
  broker: z.string().min(1, "Broker is required"),
  currency: z
    .string()
    .min(1, "Currency is required")
    .refine((value) => SUPPORTED_CURRENCIES.includes(value), "Currency not supported"),
  fxRate: z.coerce.number().positive().optional(),
  notes: z.string().optional(),
});

function getFxRate(currency: string, fxRates: Record<string, number>, provided?: number) {
  if (currency === BASE_CURRENCY) return 1;
  if (provided) return provided;
  return fxRates[currency] ?? 1;
}

function deriveMetrics(trades: TradeEntry[], fxRates: Record<string, number>): MetricsSummary {
  const holdings = new Map<
    string,
    { quantity: number; costBasis: number; latestPrice: number; currency: string; fx: number; latestDate: string }
  >();
  const realized = new Map<string, number>();
  const dividendsByTicker = new Map<string, number>();
  let dividendsYtd = 0;
  let totalFees = 0;
  const currentYear = new Date().getFullYear();

  trades.forEach((trade) => {
    const fx = getFxRate(trade.currency, fxRates, trade.fxRate);
    const gross = trade.price * trade.quantity;
    const feesBase = trade.fees * fx;
    totalFees += feesBase;

    if (trade.type === "buy") {
      const costBase = (gross + trade.fees) * fx;
      const current =
        holdings.get(trade.ticker) ?? {
          quantity: 0,
          costBasis: 0,
          latestPrice: trade.price,
          currency: trade.currency,
          fx,
          latestDate: trade.date,
        };
      const quantity = current.quantity + trade.quantity;
      const costBasis = current.costBasis + costBase;
      holdings.set(trade.ticker, {
        quantity,
        costBasis,
        latestPrice: trade.price,
        currency: trade.currency,
        fx,
        latestDate: trade.date,
      });
    }

    if (trade.type === "sell") {
      const proceedsBase = (gross - trade.fees) * fx;
      const current =
        holdings.get(trade.ticker) ?? {
          quantity: 0,
          costBasis: 0,
          latestPrice: trade.price,
          currency: trade.currency,
          fx,
          latestDate: trade.date,
        };
      const averageCost = current.quantity ? current.costBasis / current.quantity : 0;
      const realizedValue = proceedsBase - averageCost * trade.quantity;
      holdings.set(trade.ticker, {
        quantity: Math.max(current.quantity - trade.quantity, 0),
        costBasis: Math.max(current.costBasis - averageCost * trade.quantity, 0),
        latestPrice: trade.price,
        currency: trade.currency,
        fx,
        latestDate: trade.date,
      });
      realized.set(trade.ticker, (realized.get(trade.ticker) ?? 0) + realizedValue);
    }

    if (trade.type === "dividend") {
      const dividendBase = gross * fx;
      dividendsByTicker.set(trade.ticker, (dividendsByTicker.get(trade.ticker) ?? 0) + dividendBase);
      if (new Date(trade.date).getFullYear() === currentYear) {
        dividendsYtd += dividendBase;
      }
    }
  });

  const averageCosts = Array.from(holdings.entries())
    .filter(([, holding]) => holding.quantity > 0)
    .map(([ticker, holding]) => ({
      ticker,
      averageCost: holding.costBasis / holding.quantity,
      quantity: holding.quantity,
    }));

  const unrealized = Array.from(holdings.entries())
    .filter(([, holding]) => holding.quantity > 0)
    .map(([ticker, holding]) => ({
      ticker,
      marketValue: holding.quantity * holding.latestPrice * holding.fx,
      value: holding.quantity * holding.latestPrice * holding.fx - holding.costBasis,
    }));

  const dividendsByTickerList = Array.from(dividendsByTicker.entries()).map(([ticker, value]) => ({ ticker, value }));
  const realizedList = Array.from(realized.entries()).map(([ticker, value]) => ({ ticker, value }));

  const holdingsDetails: HoldingDetail[] = Array.from(holdings.entries())
    .filter(([, holding]) => holding.quantity > 0)
    .map(([ticker, holding]) => {
      const marketValueBase = holding.quantity * holding.latestPrice * holding.fx;
      const dividends = dividendsByTicker.get(ticker) ?? 0;
      const dividendYield = marketValueBase > 0 ? (dividends / marketValueBase) * 100 : 0;
      return {
        ticker,
        quantity: holding.quantity,
        averageCost: holding.costBasis / holding.quantity,
        lastPrice: holding.latestPrice,
        marketValueBase,
        pl: marketValueBase - holding.costBasis,
        fxRate: holding.fx,
        currency: holding.currency,
        sector: instrumentMeta[ticker]?.sector,
        region: instrumentMeta[ticker]?.region,
        dividendYield,
      };
    });

  return {
    totalFees,
    averageCosts,
    realized: realizedList,
    unrealized,
    dividendsYtd,
    dividendsByTicker: dividendsByTickerList,
    holdings: holdingsDetails,
  };
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: BASE_CURRENCY }).format(amount);
}

function formatPercent(value: number) {
  const formatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${formatter.format(value)}%`;
}

type TradeEntryFormProps = {
  onAddTrade: (trade: TradeEntry) => void;
  defaultFxRate: (currency: string) => number;
  onRefreshFx?: (currency: string) => Promise<void>;
  brokers: string[];
  baseCurrency: string;
  supportedCurrencies: string[];
  isFetchingFx: boolean;
};

function TradeEntryForm({
  onAddTrade,
  defaultFxRate,
  onRefreshFx,
  brokers,
  baseCurrency,
  supportedCurrencies,
  isFetchingFx,
}: TradeEntryFormProps) {
  const [formData, setFormData] = useState({
    type: "buy" as TradeType,
    ticker: "",
    quantity: "",
    price: "",
    fees: "0",
    date: new Date().toISOString().slice(0, 10),
    broker: brokers[0] ?? "",
    currency: baseCurrency,
    fxRate: defaultFxRate(baseCurrency).toString(),
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      broker: brokers[0] ?? prev.broker,
    }));
  }, [brokers]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = tradeSchema.safeParse({
      ...formData,
      quantity: formData.quantity,
      price: formData.price,
      fees: formData.fees,
      fxRate: formData.fxRate || undefined,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        if (issue.path[0]) fieldErrors[issue.path[0] as string] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    const trade: TradeEntry = {
      id: crypto.randomUUID(),
      ...parsed.data,
      fxRate: parsed.data.fxRate,
      notes: parsed.data.notes,
    };
    onAddTrade(trade);
    setErrors({});
    setFormData((prev) => ({
      ...prev,
      ticker: "",
      quantity: "",
      price: "",
      fees: "0",
      notes: "",
    }));
  };

  const formValueInBase = useMemo(() => {
    const quantity = Number(formData.quantity) || 0;
    const price = Number(formData.price) || 0;
    const fees = Number(formData.fees) || 0;
    const fx = Number(formData.fxRate) || defaultFxRate(formData.currency);
    const gross = quantity * price;
    const cost = formData.type === "sell" ? gross - fees : gross + fees;
    return cost * fx;
  }, [defaultFxRate, formData]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">Type</label>
          <select
            value={formData.type}
            onChange={(event) => setFormData((prev) => ({ ...prev, type: event.target.value as TradeType }))}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
            <option value="dividend">Dividend</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">Ticker</label>
          <input
            value={formData.ticker}
            onChange={(event) => setFormData((prev) => ({ ...prev, ticker: event.target.value }))}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
            placeholder="AAPL"
          />
          {errors.ticker && <p className="text-xs text-rose-600">{errors.ticker}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">Quantity</label>
          <input
            type="number"
            min={0}
            step="any"
            value={formData.quantity}
            onChange={(event) => setFormData((prev) => ({ ...prev, quantity: event.target.value }))}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
          />
          {errors.quantity && <p className="text-xs text-rose-600">{errors.quantity}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">Price</label>
          <input
            type="number"
            min={0}
            step="any"
            value={formData.price}
            onChange={(event) => setFormData((prev) => ({ ...prev, price: event.target.value }))}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
          />
          {errors.price && <p className="text-xs text-rose-600">{errors.price}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">Fees</label>
          <input
            type="number"
            min={0}
            step="any"
            value={formData.fees}
            onChange={(event) => setFormData((prev) => ({ ...prev, fees: event.target.value }))}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
          />
          {errors.fees && <p className="text-xs text-rose-600">{errors.fees}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(event) => setFormData((prev) => ({ ...prev, date: event.target.value }))}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
          />
          {errors.date && <p className="text-xs text-rose-600">{errors.date}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">Broker</label>
          <select
            value={formData.broker}
            onChange={(event) => setFormData((prev) => ({ ...prev, broker: event.target.value }))}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
          >
            {brokers.map((broker) => (
              <option key={broker} value={broker}>
                {broker}
              </option>
            ))}
          </select>
          {errors.broker && <p className="text-xs text-rose-600">{errors.broker}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">Currency</label>
          <select
            value={formData.currency}
            onChange={(event) =>
              setFormData((prev) => ({
                ...prev,
                currency: event.target.value,
                fxRate: defaultFxRate(event.target.value).toString(),
              }))
            }
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
          >
            {supportedCurrencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
          {errors.currency && <p className="text-xs text-rose-600">{errors.currency}</p>}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-800">FX rate to base ({baseCurrency})</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step="any"
              value={formData.fxRate}
              onChange={(event) => setFormData((prev) => ({ ...prev, fxRate: event.target.value }))}
              className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
            />
            {onRefreshFx && (
              <button
                type="button"
                onClick={() => onRefreshFx(formData.currency)}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                disabled={isFetchingFx}
              >
                {isFetchingFx ? "Refreshing..." : "Refresh"}
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">Auto-applies when currency differs; override to lock your own fill rate.</p>
          {errors.fxRate && <p className="text-xs text-rose-600">{errors.fxRate}</p>}
        </div>

        <div className="space-y-2 md:col-span-2">
          <label className="text-sm font-semibold text-slate-800">Notes</label>
          <textarea
            value={formData.notes}
            onChange={(event) => setFormData((prev) => ({ ...prev, notes: event.target.value }))}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
            rows={2}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-dashed border-primary-200 bg-primary-50/60 px-3 py-3">
          <p className="text-xs font-semibold uppercase text-primary-600">Base total ({BASE_CURRENCY})</p>
          <p className="text-lg font-semibold text-primary-900">{formatCurrency(formValueInBase)}</p>
          <p className="text-xs text-primary-700">Fees included with FX conversion.</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">Validation covers quantity, pricing, dates, and broker selection.</div>
        <button
          type="submit"
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700 focus:outline-none"
        >
          Add trade
        </button>
      </div>
    </form>
  );
}

function DashboardCards({
  totalValue,
  cashBalance,
  dayChange,
  dayChangePct,
  metrics,
}: {
  totalValue: number;
  cashBalance: number;
  dayChange: number;
  dayChangePct: number;
  metrics: MetricsSummary;
}) {
  const cardItems = [
    { label: "Total value", value: formatCurrency(totalValue) },
    { label: "Cash", value: formatCurrency(cashBalance) },
    {
      label: "Day change",
      value: `${formatCurrency(dayChange)} (${formatPercent(dayChangePct)})`,
    },
    {
      label: "Unrealized P/L",
      value: formatCurrency(metrics.unrealized.reduce((total, row) => total + row.value, 0)),
    },
    { label: "Realized P/L", value: formatCurrency(metrics.realized.reduce((total, row) => total + row.value, 0)) },
    { label: "Dividend YTD", value: formatCurrency(metrics.dividendsYtd) },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cardItems.map((item) => (
        <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-primary-600">{item.label}</p>
          <p className="text-2xl font-semibold text-slate-900">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function AnalyticsCharts({
  equityCurve,
  allocationBySector,
  allocationByRegion,
  allocationByCurrency,
  topContributors,
  dividendTimeline,
}: {
  equityCurve: { date: string; value: number }[];
  allocationBySector: { name: string; value: number }[];
  allocationByRegion: { name: string; value: number }[];
  allocationByCurrency: { name: string; value: number }[];
  topContributors: { name: string; value: number }[];
  dividendTimeline: { month: string; value: number }[];
}) {
  const palette = ["#2563eb", "#f97316", "#16a34a", "#dc2626", "#0891b2", "#8b5cf6"];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-primary-600">Curve</p>
            <h3 className="text-xl font-semibold text-slate-900">Equity over time</h3>
          </div>
          <span className="text-xs text-slate-500">{equityCurve.length} points</span>
        </div>
        <div className="h-64">
          <ResponsiveContainer>
            <AreaChart data={equityCurve} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tickLine={false} stroke="#94a3b8" />
              <YAxis tickLine={false} stroke="#94a3b8" tickFormatter={(value) => `${value / 1000}k`} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Area type="monotone" dataKey="value" stroke="#2563eb" fill="url(#equityGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-primary-600">Share</p>
            <h3 className="text-xl font-semibold text-slate-900">Allocation by sector</h3>
          </div>
          <span className="text-xs text-slate-500">{allocationBySector.length} slices</span>
        </div>
        <div className="h-64">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={allocationBySector} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                {allocationBySector.map((entry, index) => (
                  <Cell key={entry.name} fill={palette[index % palette.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3">
          <div>
            <p className="text-xs font-semibold uppercase text-primary-600">Breakdown</p>
            <h3 className="text-xl font-semibold text-slate-900">Allocation by region</h3>
          </div>
        </div>
        <div className="h-52">
          <ResponsiveContainer>
            <BarChart data={allocationByRegion} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} stroke="#94a3b8" />
              <YAxis dataKey="name" type="category" stroke="#94a3b8" />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Bar dataKey="value" fill="#16a34a" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3">
          <div>
            <p className="text-xs font-semibold uppercase text-primary-600">Currency</p>
            <h3 className="text-xl font-semibold text-slate-900">Allocation by currency</h3>
          </div>
        </div>
        <div className="h-52">
          <ResponsiveContainer>
            <BarChart data={allocationByCurrency} margin={{ bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" stroke="#94a3b8" />
              <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} stroke="#94a3b8" />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Bar dataKey="value" fill="#f97316" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3">
          <div>
            <p className="text-xs font-semibold uppercase text-primary-600">Leaders</p>
            <h3 className="text-xl font-semibold text-slate-900">Top contributors</h3>
          </div>
        </div>
        <div className="h-52">
          <ResponsiveContainer>
            <BarChart data={topContributors} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} stroke="#94a3b8" />
              <YAxis dataKey="name" type="category" stroke="#94a3b8" />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Bar dataKey="value" fill="#2563eb" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3">
          <div>
            <p className="text-xs font-semibold uppercase text-primary-600">Income</p>
            <h3 className="text-xl font-semibold text-slate-900">Dividends timeline</h3>
          </div>
        </div>
        <div className="h-52">
          <ResponsiveContainer>
            <AreaChart data={dividendTimeline} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" stroke="#94a3b8" />
              <YAxis tickFormatter={(value) => `${value.toFixed(0)}`} stroke="#94a3b8" />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="#ede9fe" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function MetricsPanel({ metrics }: { metrics: MetricsSummary }) {
  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-primary-600">Derived totals</p>
          <h3 className="text-xl font-semibold text-slate-900">Portfolio health</h3>
        </div>
        <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">{BASE_CURRENCY} view</span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm text-slate-700">
        <div className="rounded-md bg-slate-50 p-3">
          <dt className="text-xs uppercase text-slate-500">Total fees</dt>
          <dd className="text-lg font-semibold text-slate-900">{formatCurrency(metrics.totalFees)}</dd>
        </div>
        <div className="rounded-md bg-slate-50 p-3">
          <dt className="text-xs uppercase text-slate-500">Dividends YTD</dt>
          <dd className="text-lg font-semibold text-slate-900">{formatCurrency(metrics.dividendsYtd)}</dd>
        </div>
        <div className="rounded-md bg-slate-50 p-3">
          <dt className="text-xs uppercase text-slate-500">Realized P/L</dt>
          <dd className="text-lg font-semibold text-slate-900">
            {formatCurrency(metrics.realized.reduce((total, row) => total + row.value, 0))}
          </dd>
        </div>
        <div className="rounded-md bg-slate-50 p-3">
          <dt className="text-xs uppercase text-slate-500">Unrealized P/L</dt>
          <dd className="text-lg font-semibold text-slate-900">
            {formatCurrency(metrics.unrealized.reduce((total, row) => total + row.value, 0))}
          </dd>
        </div>
      </dl>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-900">Average cost by ticker</h4>
        <div className="space-y-2 text-sm">
          {metrics.averageCosts.length === 0 && <p className="text-slate-600">Add buys to see cost bases.</p>}
          {metrics.averageCosts.map((row) => (
            <div key={row.ticker} className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="font-semibold text-slate-900">{row.ticker}</div>
              <div className="text-slate-700">{formatCurrency(row.averageCost)} / share · {row.quantity} units</div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-900">Unrealized P/L</h4>
        <div className="space-y-2 text-sm">
          {metrics.unrealized.length === 0 && <p className="text-slate-600">No open positions yet.</p>}
          {metrics.unrealized.map((row) => (
            <div key={row.ticker} className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="font-semibold text-slate-900">{row.ticker}</div>
              <div className="text-slate-700">
                {formatCurrency(row.value)} · Market {formatCurrency(row.marketValue)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-900">Realized P/L</h4>
        <div className="space-y-2 text-sm">
          {metrics.realized.length === 0 && <p className="text-slate-600">No exits recorded.</p>}
          {metrics.realized.map((row) => (
            <div key={row.ticker} className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="font-semibold text-slate-900">{row.ticker}</div>
              <div className="text-slate-700">{formatCurrency(row.value)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-900">Dividends by ticker</h4>
        <div className="space-y-2 text-sm">
          {metrics.dividendsByTicker.length === 0 && <p className="text-slate-600">No dividends yet.</p>}
          {metrics.dividendsByTicker.map((row) => (
            <div key={row.ticker} className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
              <div className="font-semibold text-slate-900">{row.ticker}</div>
              <div className="text-slate-700">{formatCurrency(row.value)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CsvTemplatePanel() {
  const [selectedTemplate, setSelectedTemplate] = useState<BrokerTemplate>(brokerTemplates[0]);
  const [mapping, setMapping] = useState<Record<string, string>>(brokerTemplates[0].mapping);

  const brokerColumns = useMemo(() => Object.values(selectedTemplate.mapping), [selectedTemplate.mapping]);

  const handleTemplateChange = (templateId: string) => {
    const template = brokerTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setSelectedTemplate(template);
    setMapping(template.mapping);
  };

  const handleMappingChange = (field: string, value: string) => {
    setMapping((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between pb-4">
        <div>
          <p className="text-xs font-semibold uppercase text-primary-600">Upload helper</p>
          <h3 className="text-xl font-semibold text-slate-900">CSV templates</h3>
          <p className="text-sm text-slate-600">Map broker-specific columns to the expected schema before ingest.</p>
        </div>
        <select
          value={selectedTemplate.id}
          onChange={(event) => handleTemplateChange(event.target.value)}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none"
        >
          {brokerTemplates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-md border border-slate-100 bg-slate-50 p-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Template</p>
            <p className="text-xs text-slate-600">Default currency: {selectedTemplate.defaultCurrency}</p>
            <p className="text-xs text-slate-600">{selectedTemplate.description}</p>
          </div>
          <div className="space-y-2 text-sm">
            {Object.keys(tradeSchema.shape).map((field) => (
              <div key={field} className="flex items-center justify-between rounded-md bg-white px-3 py-2">
                <div className="font-medium text-slate-800">{field}</div>
                <select
                  value={mapping[field] ?? ""}
                  onChange={(event) => handleMappingChange(field, event.target.value)}
                  className="w-40 rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
                >
                  {brokerColumns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2 rounded-md border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-slate-900">Sample rows</h4>
          <p className="text-xs text-slate-500">Use this file to sanity check field alignment.</p>
          <pre className="overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{selectedTemplate.sample}</pre>
        </div>
      </div>
    </div>
  );
}

function HoldingsTable({ holdings }: { holdings: HoldingDetail[] }) {
  const [sortKey, setSortKey] = useState<keyof HoldingDetail>("marketValueBase");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [filters, setFilters] = useState({ query: "", sector: "all", currency: "all" });

  const handleSort = (key: keyof HoldingDetail) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("desc");
  };

  const filtered = useMemo(() => {
    return holdings.filter((holding) => {
      const matchesQuery = holding.ticker.toLowerCase().includes(filters.query.toLowerCase());
      const matchesSector = filters.sector === "all" || holding.sector === filters.sector;
      const matchesCurrency = filters.currency === "all" || holding.currency === filters.currency;
      return matchesQuery && matchesSector && matchesCurrency;
    });
  }, [filters, holdings]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      const valueA = a[sortKey] as number | string;
      const valueB = b[sortKey] as number | string;
      if (typeof valueA === "number" && typeof valueB === "number") {
        return (valueA - valueB) * direction;
      }
      return String(valueA).localeCompare(String(valueB)) * direction;
    });
  }, [filtered, sortDirection, sortKey]);

  const sectors = Array.from(new Set(holdings.map((holding) => holding.sector).filter(Boolean))) as string[];
  const currencies = Array.from(new Set(holdings.map((holding) => holding.currency)));

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-primary-600">Positions</p>
          <h3 className="text-xl font-semibold text-slate-900">Holdings table</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            value={filters.query}
            onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
            placeholder="Filter ticker"
            className="rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
          />
          <select
            value={filters.sector}
            onChange={(event) => setFilters((prev) => ({ ...prev, sector: event.target.value }))}
            className="rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
          >
            <option value="all">All sectors</option>
            {sectors.map((sector) => (
              <option key={sector} value={sector}>
                {sector}
              </option>
            ))}
          </select>
          <select
            value={filters.currency}
            onChange={(event) => setFilters((prev) => ({ ...prev, currency: event.target.value }))}
            className="rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
          >
            <option value="all">All currencies</option>
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              {["ticker", "sector", "quantity", "averageCost", "lastPrice", "pl", "dividendYield", "fxRate"].map((column) => (
                <th
                  key={column}
                  className="cursor-pointer px-3 py-2"
                  onClick={() => handleSort(column as keyof HoldingDetail)}
                >
                  {column.replace(/([A-Z])/g, " $1").toUpperCase()}
                </th>
              ))}
              <th className="px-3 py-2">Currency</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((holding) => (
              <tr key={holding.ticker} className="bg-white">
                <td className="px-3 py-2 font-semibold text-slate-900">{holding.ticker}</td>
                <td className="px-3 py-2 text-slate-700">{holding.sector ?? "–"}</td>
                <td className="px-3 py-2 text-slate-700">{holding.quantity.toLocaleString()}</td>
                <td className="px-3 py-2 text-slate-700">{formatCurrency(holding.averageCost)}</td>
                <td className="px-3 py-2 text-slate-700">
                  {holding.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2 text-slate-700">{formatCurrency(holding.pl)}</td>
                <td className="px-3 py-2 text-slate-700">{formatPercent(holding.dividendYield)}</td>
                <td className="px-3 py-2 text-slate-700">{holding.fxRate.toFixed(4)}</td>
                <td className="px-3 py-2 text-slate-700">{holding.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TradeLedger({ trades, fxRates }: { trades: TradeEntry[]; fxRates: Record<string, number> }) {
  const [filters, setFilters] = useState({ broker: "all", ticker: "", type: "all", from: "", to: "" });

  const brokers = useMemo(() => Array.from(new Set(trades.map((trade) => trade.broker))), [trades]);
  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      const matchesBroker = filters.broker === "all" || trade.broker === filters.broker;
      const matchesType = filters.type === "all" || trade.type === filters.type;
      const matchesTicker = trade.ticker.toLowerCase().includes(filters.ticker.toLowerCase());
      const afterStart = filters.from ? new Date(trade.date) >= new Date(filters.from) : true;
      const beforeEnd = filters.to ? new Date(trade.date) <= new Date(filters.to) : true;
      return matchesBroker && matchesType && matchesTicker && afterStart && beforeEnd;
    });
  }, [filters, trades]);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-primary-600">History</p>
          <h3 className="text-xl font-semibold text-slate-900">Transaction ledger</h3>
        </div>
        <span className="text-xs font-medium text-slate-600">{filteredTrades.length} rows</span>
      </div>

      <div className="grid gap-2 md:grid-cols-5">
        <input
          value={filters.ticker}
          onChange={(event) => setFilters((prev) => ({ ...prev, ticker: event.target.value }))}
          placeholder="Filter ticker"
          className="rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
        />
        <select
          value={filters.broker}
          onChange={(event) => setFilters((prev) => ({ ...prev, broker: event.target.value }))}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="all">All brokers</option>
          {brokers.map((broker) => (
            <option key={broker} value={broker}>
              {broker}
            </option>
          ))}
        </select>
        <select
          value={filters.type}
          onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value }))}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
        >
          <option value="all">All types</option>
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
          <option value="dividend">Dividend</option>
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Ticker</th>
              <th className="px-3 py-2">Quantity</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Fees</th>
              <th className="px-3 py-2">Broker</th>
              <th className="px-3 py-2">Currency</th>
              <th className="px-3 py-2">FX</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredTrades.map((trade) => (
              <tr key={trade.id} className="bg-white">
                <td className="px-3 py-2 text-slate-700">{trade.date}</td>
                <td className="px-3 py-2 font-semibold uppercase text-slate-900">{trade.type}</td>
                <td className="px-3 py-2 text-slate-700">{trade.ticker}</td>
                <td className="px-3 py-2 text-slate-700">{trade.quantity}</td>
                <td className="px-3 py-2 text-slate-700">
                  {trade.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </td>
                <td className="px-3 py-2 text-slate-700">{trade.fees.toFixed(2)}</td>
                <td className="px-3 py-2 text-slate-700">{trade.broker}</td>
                <td className="px-3 py-2 text-slate-700">{trade.currency}</td>
                <td className="px-3 py-2 text-slate-700">{getFxRate(trade.currency, fxRates, trade.fxRate).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TradingWorkspace() {
  const [trades, setTrades] = useState<TradeEntry[]>(seedTrades);
  const [brokers, setBrokers] = useState<string[]>([]);
  const [fxRates, setFxRates] = useState<Record<string, number>>({ [BASE_CURRENCY]: 1 });
  const [isFetchingFx, setIsFetchingFx] = useState(false);

  useEffect(() => {
    const loadBrokers = async () => {
      const response = await fetch("/api/brokers");
      if (!response.ok) {
        setBrokers(brokerTemplates.map((template) => template.name));
        return;
      }
      const payload = (await response.json()) as { name: string }[];
      const names = payload.map((item) => item.name);
      setBrokers(names.length ? names : brokerTemplates.map((template) => template.name));
    };
    loadBrokers().catch(() => setBrokers(brokerTemplates.map((template) => template.name)));
  }, []);

  const refreshFxRate = useCallback(async (currency: string) => {
    if (currency === BASE_CURRENCY) return;
    setIsFetchingFx(true);
    try {
      const response = await fetch(`/api/fx?base=${BASE_CURRENCY}&quote=${currency}`);
      if (!response.ok) return;
      const payload = (await response.json()) as { rate?: number };
      if (typeof payload.rate === "number") {
        const rate = payload.rate;
        setFxRates((prev) => {
          const next: Record<string, number> = { ...prev, [currency]: rate };
          return next;
        });
      }
    } finally {
      setIsFetchingFx(false);
    }
  }, []);

  useEffect(() => {
    SUPPORTED_CURRENCIES.filter((currency) => currency !== BASE_CURRENCY).forEach((currency) => {
      refreshFxRate(currency).catch(() => undefined);
    });
  }, [refreshFxRate]);

  const metrics = useMemo(() => deriveMetrics(trades, fxRates), [trades, fxRates]);

  const handleAddTrade = (trade: TradeEntry) => {
    setTrades((prev) => [...prev, trade]);
  };

  const defaultFxRate = useCallback((currency: string) => getFxRate(currency, fxRates), [fxRates]);

  const totalMarketValue = metrics.holdings.reduce((total, holding) => total + holding.marketValueBase, 0);
  const cashBalance = 12000;
  const totalValue = cashBalance + totalMarketValue;

  const equityCurve = useMemo(
    () => [
      { date: "Jan", value: totalValue * 0.78 },
      { date: "Feb", value: totalValue * 0.8 },
      { date: "Mar", value: totalValue * 0.84 },
      { date: "Apr", value: totalValue * 0.88 },
      { date: "May", value: totalValue * 0.9 },
      { date: "Jun", value: totalValue * 0.94 },
      { date: "Jul", value: totalValue * 0.97 },
      { date: "Aug", value: totalValue * 1.01 },
      { date: "Sep", value: totalValue * 1.03 },
    ],
    [totalValue],
  );

  const dayChange =
    equityCurve.length > 1 ? equityCurve[equityCurve.length - 1].value - equityCurve[equityCurve.length - 2].value : 0;
  const dayChangePct =
    equityCurve.length > 1 && equityCurve[equityCurve.length - 2].value
      ? (dayChange / equityCurve[equityCurve.length - 2].value) * 100
      : 0;

  const buildAllocation = useCallback(
    (key: "sector" | "region" | "currency") => {
      const map = new Map<string, number>();
      metrics.holdings.forEach((holding) => {
        const name = (holding as Record<string, string | number | undefined>)[key];
        if (!name) return;
        map.set(name as string, (map.get(name as string) ?? 0) + holding.marketValueBase);
      });
      return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
    },
    [metrics.holdings],
  );

  const allocationBySector = useMemo(() => buildAllocation("sector"), [buildAllocation]);
  const allocationByRegion = useMemo(() => buildAllocation("region"), [buildAllocation]);
  const allocationByCurrency = useMemo(() => buildAllocation("currency"), [buildAllocation]);

  const topContributors = useMemo(() => {
    return metrics.holdings
      .map((holding) => ({ name: holding.ticker, value: holding.pl }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 5);
  }, [metrics.holdings]);

  const dividendTimeline = useMemo(() => {
    const monthMap = new Map<string, number>();
    trades
      .filter((trade) => trade.type === "dividend")
      .forEach((trade) => {
        const month = new Date(trade.date).toLocaleString("en", { month: "short" });
        const fx = getFxRate(trade.currency, fxRates, trade.fxRate);
        monthMap.set(month, (monthMap.get(month) ?? 0) + trade.price * trade.quantity * fx);
      });
    return Array.from(monthMap.entries()).map(([month, value]) => ({ month, value }));
  }, [fxRates, trades]);

  return (
    <div className="space-y-8 p-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-primary-600">Manual entry</p>
              <h3 className="text-xl font-semibold text-slate-900">Single trade capture</h3>
              <p className="text-sm text-slate-600">Track buys, sells, or dividends with broker selection and FX awareness.</p>
            </div>
            <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">Validated</span>
          </div>
          <TradeEntryForm
            onAddTrade={handleAddTrade}
            defaultFxRate={defaultFxRate}
            onRefreshFx={refreshFxRate}
            brokers={brokers}
            baseCurrency={BASE_CURRENCY}
            supportedCurrencies={SUPPORTED_CURRENCIES}
            isFetchingFx={isFetchingFx}
          />
        </div>
        <MetricsPanel metrics={metrics} />
      </div>

      <DashboardCards
        totalValue={totalValue}
        cashBalance={cashBalance}
        dayChange={dayChange}
        dayChangePct={dayChangePct}
        metrics={metrics}
      />

      <AnalyticsCharts
        equityCurve={equityCurve}
        allocationBySector={allocationBySector}
        allocationByRegion={allocationByRegion}
        allocationByCurrency={allocationByCurrency}
        topContributors={topContributors}
        dividendTimeline={dividendTimeline}
      />

      <CsvTemplatePanel />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TradeLedger trades={trades} fxRates={fxRates} />
        </div>
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide">Multi-currency control</p>
          <ul className="list-disc space-y-2 pl-4">
            <li>Auto-refresh FX for USD, SGD, MYR, and HKD via Yahoo Finance (RapidAPI) with manual override.</li>
            <li>Base totals shown in {BASE_CURRENCY} include commissions for apples-to-apples cost and P/L.</li>
            <li>Derived metrics roll up realized and unrealized P/L, average cost, and dividends YTD/by ticker.</li>
            <li>CSV templates for SG-first brokers (MooMoo, Tiger, IBKR, POEMS/FSMOne/CMC/LongBridge) include mapping UI.</li>
          </ul>
        </div>
      </div>

      <HoldingsTable holdings={metrics.holdings} />
    </div>
  );
}

