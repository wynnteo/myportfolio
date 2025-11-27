"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
}

const BASE_CURRENCY = "SGD";
const SUPPORTED_CURRENCIES = ["SGD", "USD", "MYR"];

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
      ticker: "Ticker",
      type: "Action",
      quantity: "Quantity",
      price: "Fill Price",
      fees: "Fees",
      date: "Trade Time",
      currency: "Currency",
      fxRate: "FX",
    },
    sample:
      "Ticker,Action,Quantity,Fill Price,Fees,Trade Time,Currency,FX\nNVDA,BUY,4,950.00,3.00,2024-07-20,USD,1.34\nBABA,DIVIDEND,10,0.21,0,2024-09-15,HKD,0.17",
  },
  {
    id: "ibkr",
    name: "IBKR",
    defaultCurrency: "USD",
    description: "Interactive Brokers flex query with CCY and FX rate columns.",
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
  const holdings = new Map<string, { quantity: number; costBasis: number; latestPriceBase: number }>();
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
      const current = holdings.get(trade.ticker) ?? { quantity: 0, costBasis: 0, latestPriceBase: trade.price * fx };
      const quantity = current.quantity + trade.quantity;
      const costBasis = current.costBasis + costBase;
      holdings.set(trade.ticker, { quantity, costBasis, latestPriceBase: trade.price * fx });
    }

    if (trade.type === "sell") {
      const proceedsBase = (gross - trade.fees) * fx;
      const current = holdings.get(trade.ticker) ?? { quantity: 0, costBasis: 0, latestPriceBase: trade.price * fx };
      const averageCost = current.quantity ? current.costBasis / current.quantity : 0;
      const realizedValue = proceedsBase - averageCost * trade.quantity;
      holdings.set(trade.ticker, {
        quantity: Math.max(current.quantity - trade.quantity, 0),
        costBasis: Math.max(current.costBasis - averageCost * trade.quantity, 0),
        latestPriceBase: trade.price * fx,
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
      marketValue: holding.quantity * holding.latestPriceBase,
      value: holding.quantity * holding.latestPriceBase - holding.costBasis,
    }));

  const dividendsByTickerList = Array.from(dividendsByTicker.entries()).map(([ticker, value]) => ({ ticker, value }));
  const realizedList = Array.from(realized.entries()).map(([ticker, value]) => ({ ticker, value }));

  return { totalFees, averageCosts, realized: realizedList, unrealized, dividendsYtd, dividendsByTicker: dividendsByTickerList };
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: BASE_CURRENCY }).format(amount);
}

/* eslint-disable no-unused-vars */
type TradeEntryFormProps = {
  onAddTrade: (trade: TradeEntry) => void;
  defaultFxRate: (currency: string) => number;
  onRefreshFx?: (currency: string) => Promise<void>;
  brokers: string[];
  baseCurrency: string;
  supportedCurrencies: string[];
  isFetchingFx: boolean;
};
/* eslint-enable no-unused-vars */

function TradeEntryForm({ onAddTrade, defaultFxRate, onRefreshFx, brokers, baseCurrency, supportedCurrencies, isFetchingFx }: TradeEntryFormProps) {
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
    if (!formData.broker && brokers[0]) {
      setFormData((prev) => ({ ...prev, broker: brokers[0] }));
    }
  }, [brokers, formData.broker]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === "currency") {
      const suggestedFx = defaultFxRate(value);
      setFormData((prev) => ({ ...prev, currency: value, fxRate: suggestedFx.toString() }));
      if (onRefreshFx) onRefreshFx(value).catch(() => undefined);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = tradeSchema.safeParse({
      ...formData,
      quantity: formData.quantity,
      price: formData.price,
      fees: formData.fees,
      fxRate: formData.fxRate,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    onAddTrade({ id: crypto.randomUUID(), ...parsed.data });
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
    const gross = price * quantity;
    const total = (gross + fees * (formData.type === "sell" ? -1 : 1)) * fx;
    return Number.isFinite(total) ? total : 0;
  }, [formData, defaultFxRate]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Trade type</label>
          <select
            value={formData.type}
            onChange={(event) => handleChange("type", event.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
            <option value="dividend">Dividend</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Broker</label>
          <select
            value={formData.broker}
            onChange={(event) => handleChange("broker", event.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
            disabled={brokers.length === 0}
          >
            {brokers.length === 0 && <option value="">Loading brokers…</option>}
            {brokers.map((broker) => (
              <option key={broker} value={broker}>
                {broker}
              </option>
            ))}
          </select>
          {errors.broker && <p className="text-sm text-red-600">{errors.broker}</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Ticker</label>
          <input
            value={formData.ticker}
            onChange={(event) => handleChange("ticker", event.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
            placeholder="AAPL"
          />
          {errors.ticker && <p className="text-sm text-red-600">{errors.ticker}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Quantity</label>
          <input
            type="number"
            min={0}
            value={formData.quantity}
            onChange={(event) => handleChange("quantity", event.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
            placeholder="10"
          />
          {errors.quantity && <p className="text-sm text-red-600">{errors.quantity}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Price</label>
          <input
            type="number"
            min={0}
            value={formData.price}
            onChange={(event) => handleChange("price", event.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
            placeholder="189.50"
            step="0.01"
          />
          {errors.price && <p className="text-sm text-red-600">{errors.price}</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Fees</label>
          <input
            type="number"
            min={0}
            value={formData.fees}
            onChange={(event) => handleChange("fees", event.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
            placeholder="0"
            step="0.01"
          />
          {errors.fees && <p className="text-sm text-red-600">{errors.fees}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(event) => handleChange("date", event.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
          />
          {errors.date && <p className="text-sm text-red-600">{errors.date}</p>}
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Notes</label>
          <input
            value={formData.notes}
            onChange={(event) => handleChange("notes", event.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
            placeholder="Lot tag, dividend memo, etc."
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">Currency</label>
          <select
            value={formData.currency}
            onChange={(event) => handleChange("currency", event.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
          >
            {supportedCurrencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
          {errors.currency && <p className="text-sm text-red-600">{errors.currency}</p>}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm font-medium text-slate-700">
            <label>FX rate</label>
            {isFetchingFx && <span className="text-xs font-semibold uppercase text-primary-600">Refreshing…</span>}
          </div>
          <input
            type="number"
            min={0}
            step="0.0001"
            value={formData.fxRate}
            onChange={(event) => handleChange("fxRate", event.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 focus:border-primary-500 focus:outline-none"
          />
          <p className="text-xs text-slate-500">Auto-applies when currency differs; override to lock your own fill rate.</p>
        </div>
        <div className="flex items-center rounded-md border border-dashed border-primary-200 bg-primary-50/60 px-3">
          <div>
            <p className="text-xs font-semibold uppercase text-primary-600">Base total ({BASE_CURRENCY})</p>
            <p className="text-lg font-semibold text-primary-900">{formatCurrency(formValueInBase)}</p>
            <p className="text-xs text-primary-700">Fees included with FX conversion.</p>
          </div>
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

  const internalFields = ["ticker", "type", "quantity", "price", "fees", "date", "currency", "fxRate"];
  const brokerColumns = Object.values(selectedTemplate.mapping);

  const handleTemplateChange = (templateId: string) => {
    const template = brokerTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setSelectedTemplate(template);
    setMapping(template.mapping);
  };

  const handleMappingChange = (field: string, brokerColumn: string) => {
    setMapping((prev) => ({ ...prev, [field]: brokerColumn }));
  };

  const downloadHref = `data:text/csv;charset=utf-8,${encodeURIComponent(selectedTemplate.sample)}`;

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-primary-600">CSV import</p>
          <h3 className="text-xl font-semibold text-slate-900">Templates per broker</h3>
          <p className="text-sm text-slate-600">Map any broker column to internal fields before uploading.</p>
        </div>
        <div className="flex items-center gap-3">
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
          <a
            href={downloadHref}
            download={`${selectedTemplate.id}-sample.csv`}
            className="rounded-md border border-primary-200 bg-primary-50 px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"
          >
            Download sample
          </a>
        </div>
      </div>

      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">{selectedTemplate.name}</p>
        <p className="text-sm text-slate-600">Default currency: {selectedTemplate.defaultCurrency}</p>
        <p className="text-sm text-slate-600">{selectedTemplate.description}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-md border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-semibold text-slate-900">Column mapping</h4>
          <p className="text-xs text-slate-500">Use the dropdown to align broker columns to internal fields.</p>
          <div className="space-y-3 text-sm">
            {internalFields.map((field) => (
              <div key={field} className="flex items-center justify-between gap-3">
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

function TradeLedger({ trades, fxRates }: { trades: TradeEntry[]; fxRates: Record<string, number> }) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-primary-600">History</p>
          <h3 className="text-xl font-semibold text-slate-900">Recorded trades</h3>
        </div>
        <span className="text-xs font-medium text-slate-600">{trades.length} rows</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Ticker</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Fees</th>
              <th className="px-3 py-2">Broker</th>
              <th className="px-3 py-2">Currency</th>
              <th className="px-3 py-2">FX</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trades.map((trade) => (
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

export function TradingWorkspace() {
  const [trades, setTrades] = useState<TradeEntry[]>([]);
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
    loadBrokers().catch(() => undefined);
  }, []);

  const refreshFxRate = useCallback(async (currency: string) => {
    if (currency === BASE_CURRENCY) return;
    setIsFetchingFx(true);
    try {
      const response = await fetch(`/api/fx?base=${BASE_CURRENCY}&quote=${currency}`);
      if (!response.ok) return;
      const payload = (await response.json()) as { rate?: number };
      if (typeof payload.rate === "number") {
        setFxRates((prev) => ({ ...prev, [currency]: payload.rate }));
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

  return (
    <div className="space-y-8">
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

      <CsvTemplatePanel />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TradeLedger trades={trades} fxRates={fxRates} />
        </div>
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide">Multi-currency control</p>
          <ul className="list-disc space-y-2 pl-4">
            <li>Auto-refresh FX for USD, SGD, and MYR via Yahoo Finance (RapidAPI) with manual override.</li>
            <li>Base totals shown in {BASE_CURRENCY} include commissions for apples-to-apples cost and P/L.</li>
            <li>Derived metrics roll up realized and unrealized P/L, average cost, and dividends YTD/by ticker.</li>
            <li>CSV templates for SG-first brokers (MooMoo, Tiger, IBKR, POEMS/FSMOne/CMC/LongBridge) include mapping UI.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
