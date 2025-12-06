import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

interface Transaction {
  id: string;
  user_id: string;
  symbol: string;
  product_name: string;
  category: string;
  broker: string;
  currency: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND';
  quantity: number | null;
  price: number | null;
  commission: number | null;
  dividend_amount: number | null;
  trade_date: string | null;
  notes: string | null;
  current_price: number | null;
  created_at: string;
}

interface HoldingRow {
  key: string;
  symbol: string;
  productName: string;
  category: string;
  broker: string;
  currency: string;
  quantity: number;
  averagePrice: number;
  totalCost: number;
  totalCommission: number;
  dividends: number;
  currentPrice: number | null;
  currentValue: number | null;
  pl: number | null;
  plPct: number | null;
  lastPriceTimestamp: number;
}

interface QuoteResponse {
  symbol: string;
  currency: string | null;
  price: number;
  asOf: string | null;
}

interface TransactionFormState {
  symbol?: string;
  productName?: string;
  category?: string;
  broker?: string;
  currency?: string;
  type?: Transaction['type'];
  quantity?: string;
  price?: string;
  commission?: string;
  dividendAmount?: string;
  tradeDate?: string;
  notes?: string;
}

const brokers = ['Moo Moo', 'CMC Invest', 'DBS', 'HSBC', 'POEMS', 'FSMOne', 'IBKR', 'Other'];
const categories = ['Unit Trusts', 'Stocks', 'REITs', 'ETF', 'Bond', 'Cash', 'Other'];
const currencies = ['SGD', 'USD', 'MYR'];

const chartPalette = ['#1e40af', '#7c3aed', '#059669', '#d97706', '#dc2626', '#db2777', '#0891b2', '#65a30d', '#ea580c'];

function formatCurrency(value: number | null, currency: string) {
  if (value === null || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(value);
}

function formatNumber(value: number | null, decimals = 2) {
  if (value === null || Number.isNaN(value)) return '-';
  return value.toFixed(decimals);
}

function getHoldingKey(symbol: string, broker: string | null | undefined) {
  return `${broker || 'Unknown'}__${symbol}`;
}

function getCategoryColor(category: string) {
  const palette: Record<string, string> = {
    'Unit Trusts': '#1e40af',
    Stocks: '#7c3aed',
    REITs: '#059669',
    ETF: '#d97706',
    Bond: '#0891b2',
    Cash: '#64748b',
    Other: '#94a3b8',
  };

  return palette[category] || '#64748b';
}

function parseInputNumber(value?: string) {
  if (value === undefined) return undefined;
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function PieChart({
  data,
  title,
}: {
  data: Array<{ name: string; pct: number; value: number }>;
  title: string;
}) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (data.length === 0 || data.every((entry) => entry.value === 0)) {
    return (
      <div className="pie-chart empty">
        <div className="empty-pie">No data</div>
      </div>
    );
  }

  // Get color based on category name or use chart palette
  const getColor = (name: string, index: number) => {
    const categoryColors: Record<string, string> = {
      'Unit Trusts': '#1e40af',
      Stocks: '#7c3aed',
      REITs: '#059669',
      ETF: '#d97706',
      Bond: '#0891b2',
      Cash: '#64748b',
      Other: '#94a3b8',
    };
    return categoryColors[name] || chartPalette[index % chartPalette.length];
  };

  return (
    <div className="chart-card">
      <div className="chart-header">{title}</div>
      <div className="chart-body">
        <svg viewBox="0 0 120 120" role="img" aria-label={title}>
          <g transform="rotate(-90 60 60)">
            {data.map((entry, index) => {
              const dash = (entry.pct / 100) * circumference;
              const circle = (
                <circle
                  key={entry.name}
                  r={radius}
                  cx="60"
                  cy="60"
                  fill="transparent"
                  stroke={getColor(entry.name, index)}
                  strokeWidth="18"
                  strokeDasharray={`${dash} ${circumference}`}
                  strokeDashoffset={offset}
                />
              );
              offset -= dash;
              return circle;
            })}
          </g>
        </svg>
        <div className="chart-legend">
          {data.map((entry, index) => (
            <div key={entry.name} className="legend-row">
              <span
                className="legend-swatch"
                style={{ background: getColor(entry.name, index) }}
              />
              <div className="legend-content">
                <div className="legend-name">{entry.name}</div>
                <div className="legend-subtext">{entry.pct.toFixed(1)}%</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [statusText, setStatusText] = useState('Connecting to database...');
  const [statusTone, setStatusTone] = useState<'info' | 'success' | 'error'>('info');
  const [brokerFilter, setBrokerFilter] = useState<string>('All');
  const [currencyFilter, setCurrencyFilter] = useState<string>('All');
  const [quotes, setQuotes] = useState<Record<string, QuoteResponse>>({});
  const [selectedHoldingKey, setSelectedHoldingKey] = useState<string | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TransactionFormState>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showAddDividend, setShowAddDividend] = useState(false);
  const [dividendForm, setDividendForm] = useState({ amount: '', date: '', notes: '' });

  async function loadTransactions() {
    try {
      setStatusText('Loading transactions from database...');
      const response = await fetch('/api/transactions');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.log(errorData);
        const message: string = (errorData as any)?.error ?? 'Unknown error';

        if (
          message.includes('TURSO_DATABASE_URL') ||
          message.includes('TURSO_AUTH_TOKEN') ||
          message.includes('Missing database keys')
        ) {
          setStatusText(
            'Missing database keys (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN). Add them in .env.local or Vercel project settings.'
          );
        } else {
          setStatusText('Unable to load data from the database. Verify Turso credentials and connectivity.');
        }

        setStatusTone('error');
        return;
      }

      const data: Transaction[] = await response.json();
      setTransactions(data);
      setStatusText('Connected to database');
      setStatusTone('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (
        message.includes('TURSO_DATABASE_URL') ||
        message.includes('TURSO_AUTH_TOKEN') ||
        message.includes('Missing database keys')
      ) {
        setStatusText(
          'Missing database keys (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN). Add them in .env.local or Vercel project settings.'
        );
      } else {
        setStatusText('Unable to load data from the database. Verify Turso credentials and connectivity.');
      }

      setStatusTone('error');
    }
  }

  useEffect(() => {
    void loadTransactions();
  }, []);

  const holdings = useMemo(() => {
    const map = new Map<string, HoldingRow>();

    for (const tx of transactions) {
      const key = getHoldingKey(tx.symbol, tx.broker);
      const existing: HoldingRow =
        map.get(key) ??
        ({
          key,
          symbol: tx.symbol,
          productName: tx.product_name,
          category: tx.category,
          broker: tx.broker,
          currency: tx.currency,
          quantity: 0,
          averagePrice: 0,
          totalCost: 0,
          totalCommission: 0,
          dividends: 0,
          currentPrice: null,
          currentValue: null,
          pl: null,
          plPct: null,
          lastPriceTimestamp: -Infinity,
        } as HoldingRow);

      if (tx.type === 'BUY' || tx.type === 'SELL') {
        const qty = tx.quantity ?? 0;
        const price = tx.price ?? 0;
        const commission = tx.commission ?? 0;
        existing.quantity += qty;
        existing.totalCost += qty * price + commission;
        existing.totalCommission += commission;
      }

      if (tx.type === 'DIVIDEND') {
        existing.dividends += tx.dividend_amount ?? 0;
      }

      if (tx.current_price !== null && !Number.isNaN(tx.current_price)) {
        const txDate = new Date(tx.trade_date ?? tx.created_at).getTime();
        if (txDate >= existing.lastPriceTimestamp) {
          existing.currentPrice = tx.current_price;
          existing.lastPriceTimestamp = txDate;
        }
      }

      map.set(key, existing);
    }

    map.forEach((row) => {
      if (row.quantity !== 0) {
        row.averagePrice = row.totalCost / row.quantity;
      }

      if (row.currentPrice !== null) {
        row.currentValue = row.currentPrice * row.quantity;
        row.pl = row.currentValue - row.totalCost;
        row.plPct = row.totalCost !== 0 ? (row.pl / row.totalCost) * 100 : null;
      }
    });

    const filtered = Array.from(map.values()).filter((row) => {
      const brokerOk = brokerFilter === 'All' || row.broker === brokerFilter;
      const currencyOk = currencyFilter === 'All' || row.currency === currencyFilter;
      return brokerOk && currencyOk;
    });

    return filtered;
  }, [transactions, brokerFilter, currencyFilter]);

  useEffect(() => {
    async function fetchQuotesForHoldings() {
      const symbols = Array.from(new Set(holdings.map((h) => h.symbol))).filter(Boolean);
      if (symbols.length === 0) {
        setQuotes({});
        return;
      }

      const nextQuotes: Record<string, QuoteResponse> = {};

      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const resp = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
            if (!resp.ok) {
              return;
            }
            const data: QuoteResponse = await resp.json();
            nextQuotes[symbol] = data;
          } catch {
            // Ignore individual failures
          }
        })
      );

      setQuotes(nextQuotes);
    }

    void fetchQuotesForHoldings();
  }, [holdings]);

  const displayHoldings = useMemo(() => {
    return holdings.map((row) => {
      const quote = quotes[row.symbol];

      const currentPrice = quote ? quote.price : row.currentPrice;
      let currentValue: number | null = null;
      let pl: number | null = null;
      let plPct: number | null = null;

      if (currentPrice !== null && !Number.isNaN(currentPrice)) {
        currentValue = currentPrice * row.quantity;
        pl = currentValue - row.totalCost;
        plPct = row.totalCost !== 0 ? (pl / row.totalCost) * 100 : null;
      }

      return {
        ...row,
        currentPrice,
        currentValue,
        pl,
        plPct,
        lastPriceTimestamp: quote?.asOf ? Date.parse(quote.asOf) : row.lastPriceTimestamp,
      };
    });
  }, [holdings, quotes]);

  const allocations = useMemo(() => {
    const byCategory = new Map<string, number>();
    const byCurrency = new Map<string, number>();
    const byHolding = new Map<string, number>();

    for (const row of displayHoldings) {
      byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.totalCost);
      byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + row.totalCost);
      byHolding.set(row.symbol, (byHolding.get(row.symbol) ?? 0) + row.totalCost);
    }

    const totalCapital = Array.from(byCurrency.values()).reduce((sum, val) => sum + val, 0);

    return {
      byCategory: Array.from(byCategory.entries()).map(([name, value]) => ({
        name,
        value,
        pct: totalCapital ? (value / totalCapital) * 100 : 0,
      })),
      byCurrency: Array.from(byCurrency.entries()).map(([name, value]) => ({
        name,
        value,
        pct: totalCapital ? (value / totalCapital) * 100 : 0,
      })),
      byHolding: Array.from(byHolding.entries()).map(([name, value]) => ({
        name,
        value,
        pct: totalCapital ? (value / totalCapital) * 100 : 0,
      })).sort((a, b) => b.value - a.value),
    };
  }, [displayHoldings]);

  const totals = useMemo(() => {
    const capitalByCurrency = new Map<string, number>();
    const currentValueByCurrency = new Map<string, number>();
    const plByCurrency = new Map<string, number>();
    const dividendsByCurrency = new Map<string, number>();

    for (const row of displayHoldings) {
      capitalByCurrency.set(row.currency, (capitalByCurrency.get(row.currency) ?? 0) + row.totalCost);
      dividendsByCurrency.set(row.currency, (dividendsByCurrency.get(row.currency) ?? 0) + row.dividends);
      if (row.currentValue !== null) {
        currentValueByCurrency.set(
          row.currency,
          (currentValueByCurrency.get(row.currency) ?? 0) + row.currentValue
        );
        plByCurrency.set(row.currency, (plByCurrency.get(row.currency) ?? 0) + (row.pl ?? 0));
      }
    }

    return {
      capitalByCurrency,
      currentValueByCurrency,
      plByCurrency,
      dividendsByCurrency,
    };
  }, [displayHoldings]);

  const symbols = useMemo(() => new Set(displayHoldings.map((h) => h.symbol)), [displayHoldings]);

  const sortedTransactions = useMemo(
    () =>
      [...transactions].sort(
        (a, b) =>
          new Date(b.trade_date ?? b.created_at).getTime() - new Date(a.trade_date ?? a.created_at).getTime()
      ),
    [transactions]
  );

  const selectedHolding = useMemo(
    () => displayHoldings.find((h) => h.key === selectedHoldingKey) ?? null,
    [displayHoldings, selectedHoldingKey]
  );

  const selectedHoldingTransactions = useMemo(
    () => sortedTransactions.filter((tx) => getHoldingKey(tx.symbol, tx.broker) === selectedHoldingKey && tx.type !== 'DIVIDEND'),
    [sortedTransactions, selectedHoldingKey]
  );

  const selectedHoldingDividends = useMemo(
    () => sortedTransactions.filter((tx) => getHoldingKey(tx.symbol, tx.broker) === selectedHoldingKey && tx.type === 'DIVIDEND'),
    [sortedTransactions, selectedHoldingKey]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const type = formData.get('type')?.toString() as Transaction['type'];
    const payload = {
      symbol: formData.get('symbol')?.toString().trim(),
      productName: formData.get('productName')?.toString().trim(),
      category: formData.get('category')?.toString(),
      broker: formData.get('broker')?.toString(),
      currency: formData.get('currency')?.toString(),
      type,
      quantity: formData.get('quantity') ? Number(formData.get('quantity')) : undefined,
      price: formData.get('price') ? Number(formData.get('price')) : undefined,
      commission: formData.get('commission') ? Number(formData.get('commission')) : 0,
      dividendAmount: formData.get('dividendAmount') ? Number(formData.get('dividendAmount')) : undefined,
      tradeDate: formData.get('tradeDate')?.toString(),
      notes: formData.get('notes')?.toString(),
    };

    const response = await fetch('/api/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      alert(`Failed to add transaction: ${(error as any)?.error ?? 'Unknown error'}`);
      return;
    }

    form.reset();
    await loadTransactions();
  }

  function startEditing(tx: Transaction) {
    setEditingTransactionId(tx.id);
    setActionMessage(null);
    
    if (tx.type === 'DIVIDEND') {
      setEditForm({
        symbol: tx.symbol,
        broker: tx.broker,
        currency: tx.currency,
        type: tx.type,
        dividendAmount: tx.dividend_amount !== null ? tx.dividend_amount.toString() : '',
        tradeDate: tx.trade_date ?? '',
        notes: tx.notes ?? '',
      });
    } else {
      setEditForm({
        symbol: tx.symbol,
        productName: tx.product_name,
        category: tx.category,
        broker: tx.broker,
        currency: tx.currency,
        type: tx.type,
        quantity: tx.quantity !== null ? Math.abs(tx.quantity).toString() : '',
        price: tx.price !== null ? tx.price.toString() : '',
        commission: tx.commission !== null ? tx.commission.toString() : '',
        tradeDate: tx.trade_date ?? '',
        notes: tx.notes ?? '',
      });
    }
  }

  function cancelEditing() {
    setEditingTransactionId(null);
    setEditForm({});
  }

  async function saveEdit() {
    if (!editingTransactionId) return;
    const original = transactions.find((tx) => tx.id === editingTransactionId);
    if (!original) return;

    const payload: any = {
      id: editingTransactionId,
      symbol: editForm.symbol ?? original.symbol,
      broker: editForm.broker ?? original.broker,
      currency: editForm.currency ?? original.currency,
      type: (editForm.type as Transaction['type']) ?? original.type,
      tradeDate: editForm.tradeDate ?? original.trade_date ?? undefined,
      notes: editForm.notes ?? original.notes ?? undefined,
    };

    if (original.type === 'DIVIDEND') {
      payload.dividendAmount = parseInputNumber(editForm.dividendAmount) ?? original.dividend_amount ?? undefined;
      payload.quantity = undefined;
      payload.price = undefined;
      payload.commission = 0;
      payload.productName = original.product_name;
      payload.category = original.category;
    } else {
      payload.productName = editForm.productName ?? original.product_name;
      payload.category = editForm.category ?? original.category;
      payload.quantity = parseInputNumber(editForm.quantity) ?? Math.abs(original.quantity ?? 0);
      payload.price = parseInputNumber(editForm.price) ?? original.price ?? undefined;
      payload.commission = parseInputNumber(editForm.commission) ?? original.commission ?? 0;
      payload.dividendAmount = undefined;
    }

    const response = await fetch('/api/transactions', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      setActionMessage((error as any)?.error ?? 'Failed to update transaction');
      return;
    }

    setActionMessage('Transaction updated.');
    setEditingTransactionId(null);
    setEditForm({});
    await loadTransactions();
  }

  async function deleteTransaction(id: string) {
    const confirmed = window.confirm('Delete this transaction?');
    if (!confirmed) return;

    const response = await fetch(`/api/transactions?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      setActionMessage((error as any)?.error ?? 'Failed to delete transaction');
      return;
    }

    setActionMessage('Transaction deleted.');
    if (editingTransactionId === id) {
      setEditingTransactionId(null);
      setEditForm({});
    }
    await loadTransactions();
  }

  const totalCapital = useMemo(
    () => Array.from(totals.capitalByCurrency.values()).reduce((sum, val) => sum + val, 0),
    [totals.capitalByCurrency]
  );
  const totalCurrentValue = useMemo(
    () => Array.from(totals.currentValueByCurrency.values()).reduce((sum, val) => sum + val, 0),
    [totals.currentValueByCurrency]
  );
  const totalPl = useMemo(
    () => Array.from(totals.plByCurrency.values()).reduce((sum, val) => sum + val, 0),
    [totals.plByCurrency]
  );
  const totalPlPct = useMemo(
    () => (totalCapital !== 0 ? (totalPl / totalCapital) * 100 : 0),
    [totalPl, totalCapital]
  );
  const totalDividends = useMemo(
    () => Array.from(totals.dividendsByCurrency.values()).reduce((sum, val) => sum + val, 0),
    [totals.dividendsByCurrency]
  );

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>Personal Portfolio Tracker</h1>
          <p className="muted">Stay on top of holdings, performance, and income at a glance.</p>
        </div>
        <nav className="nav-links" aria-label="Primary navigation">
          <Link href="/">Dashboard</Link>
          <Link href="/referrals">Referral hub</Link>
        </nav>
        <span id="sync-status" className="badge" data-tone={statusTone}>
          {statusText}
        </span>
      </header>

      <section aria-labelledby="summary">
        <div className="section-title">
          <div>
            <p className="eyebrow">Overview</p>
            <h2 id="summary">Portfolio snapshot</h2>
          </div>
          <div className="chip-group">
            <span className="chip">{displayHoldings.length} holdings</span>
            <span className="chip">{transactions.length} transactions</span>
          </div>
        </div>
        <div className="overview-grid">
          <div className="summary-card">
            <div className="stat-title">Invested capital</div>
            <div className="stat-value">{formatCurrency(totalCapital || null, 'SGD')}</div>
            <div className="stat-sub">Across {allocations.byCurrency.length} currencies</div>
          </div>
          <div className="summary-card">
            <div className="stat-title">Current value</div>
            <div className="stat-value">{formatCurrency(totalCurrentValue || null, 'SGD')}</div>
            <div className="stat-sub">Live prices for {Object.keys(quotes).length} symbols</div>
          </div>
          <div className={`summary-card ${totalPl > 0 ? 'profit' : totalPl < 0 ? 'loss' : ''}`}>
            <div className="stat-title">Total P/L</div>
            <div className="stat-value">{formatCurrency(totalPl, 'SGD')}</div>
            <div className="stat-sub">{totalPlPct !== null && totalPlPct !== 0 ? `${totalPlPct.toFixed(2)}% ${totalPl >= 0 ? 'gain' : 'loss'}` : 'Unrealised basis'}</div>
          </div>
          <div className="summary-card">
            <div className="stat-title">Dividends received</div>
            <div className="stat-value">{formatCurrency(totalDividends || null, 'SGD')}</div>
            <div className="stat-sub">All currencies included</div>
          </div>
        </div>
        <div className="chart-grid">
          <PieChart title="Allocation by category" data={allocations.byCategory} />
          <PieChart title="Allocation by holding" data={allocations.byHolding} />
          <PieChart title="Allocation by currency" data={allocations.byCurrency} />
        </div>
      </section>

      <section aria-labelledby="add-transaction" className="panel">
        <div className="section-title">
          <div>
            <p className="eyebrow">Journal</p>
            <h2 id="add-transaction">Add transaction</h2>
            <p className="muted">Keep the form lean—no manual current price entry needed.</p>
          </div>
        </div>
        <form onSubmit={(event) => void handleSubmit(event)} className="form-grid">
          <label>
            Symbol
            <input name="symbol" type="text" required placeholder="e.g. M44U" />
          </label>
          <label>
            Product Name
            <input name="productName" type="text" placeholder="Full fund / stock name" />
          </label>
          <label>
            Category
            <select name="category" defaultValue="Stocks">
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>
          <label>
            Broker
            <select name="broker" defaultValue="Moo Moo">
              {brokers.map((br) => (
                <option key={br} value={br}>
                  {br}
                </option>
              ))}
            </select>
          </label>
          <label>
            Currency
            <select name="currency" defaultValue="SGD">
              {currencies.map((ccy) => (
                <option key={ccy} value={ccy}>
                  {ccy}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select name="type" defaultValue="BUY">
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="DIVIDEND">DIVIDEND</option>
            </select>
          </label>
          <label>
            Quantity
            <input name="quantity" type="number" step="0.0001" min="0" />
          </label>
          <label>
            Price
            <input name="price" type="number" step="0.0001" min="0" />
          </label>
          <label>
            Commission
            <input name="commission" type="number" step="0.01" min="0" defaultValue={0} />
          </label>
          <label>
            Dividend Amount
            <input name="dividendAmount" type="number" step="0.01" min="0" defaultValue={0} />
          </label>
          <label>
            Trade Date
            <input name="tradeDate" type="date" />
          </label>
          <label>
            Notes
            <textarea name="notes" placeholder="Optional notes" />
          </label>
          <div className="form-actions">
            <button type="submit">Add transaction</button>
          </div>
        </form>
      </section>

      <section aria-labelledby="holdings">
        <div className="section-title">
          <div>
            <p className="eyebrow">Positions</p>
            <h2 id="holdings">Holdings</h2>
          </div>
          <div className="filters">
            <select value={brokerFilter} onChange={(e) => setBrokerFilter(e.target.value)}>
              <option value="All">All brokers</option>
              {brokers.map((br) => (
                <option key={br} value={br}>
                  {br}
                </option>
              ))}
            </select>
            <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)}>
              <option value="All">All currencies</option>
              {currencies.map((ccy) => (
                <option key={ccy} value={ccy}>
                  {ccy}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Instrument</th>
                <th>Category</th>
                <th>Currency</th>
                <th>Quantity</th>
                <th>Avg Price</th>
                <th>Current Price</th>
                <th>Capital</th>
                <th>Current Value</th>
                <th>Total Dividends</th>
                <th>P/L</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayHoldings.map((row) => {
                const plClass = row.pl && row.pl !== 0 ? (row.pl > 0 ? 'pl-positive' : 'pl-negative') : 'pl-neutral';

                return (
                  <tr key={row.key}>
                    <td>
                      <div className="instrument-cell">
                        <div className="cell-main">{row.symbol}</div>
                        {row.productName && <div className="muted small">{row.productName}</div>}
                      </div>
                    </td>
                    <td>
                      <span className="category-pill">
                        <span
                          className="category-dot"
                          style={{ backgroundColor: getCategoryColor(row.category) }}
                          aria-hidden
                        />
                        {row.category}
                      </span>
                    </td>
                    <td>{row.currency}</td>
                    <td>{formatNumber(row.quantity, 4)}</td>
                    <td>{row.averagePrice !== null ? row.averagePrice.toFixed(4) : '-'}</td>
                    <td>{row.currentPrice !== null ? row.currentPrice.toFixed(4) : '-'}</td>
                    <td>{formatCurrency(row.totalCost, row.currency)}</td>
                    <td>{formatCurrency(row.currentValue, row.currency)}</td>
                    <td>{formatCurrency(row.dividends, row.currency)}</td>
                    <td>
                      <div className="pl-stack">
                        <span className={plClass}>{formatCurrency(row.pl, row.currency)}</span>
                        <span className={`pl-percent ${plClass}`}>
                          {row.plPct !== null ? `${row.plPct.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <button type="button" onClick={() => setSelectedHoldingKey(row.key)}>
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selectedHolding && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-title">
                  {selectedHolding.symbol} · {selectedHolding.productName}
                </div>
                <div className="modal-meta">
                  <span>Broker: {selectedHolding.broker}</span>
                  <span>Currency: {selectedHolding.currency}</span>
                  <span>Quantity: {selectedHolding.quantity.toFixed(4)}</span>
                </div>
              </div>
              <button type="button" className="ghost" onClick={() => setSelectedHoldingKey(null)}>
                Close
              </button>
            </div>
            <div className="modal-stats">
              <div className="modal-stat-item">
                <div className="modal-stat-label">Capital Invested</div>
                <div className="modal-stat-value">{formatCurrency(selectedHolding.totalCost, selectedHolding.currency)}</div>
              </div>
              <div className="modal-stat-item">
                <div className="modal-stat-label">Current Value</div>
                <div className="modal-stat-value">{formatCurrency(selectedHolding.currentValue, selectedHolding.currency)}</div>
              </div>
              <div className="modal-stat-item">
                <div className="modal-stat-label">Total Dividends</div>
                <div className="modal-stat-value">{formatCurrency(selectedHolding.dividends, selectedHolding.currency)}</div>
              </div>
              <div className="modal-stat-item">
                <div className="modal-stat-label">Total Commission</div>
                <div className="modal-stat-value">{formatCurrency(selectedHolding.totalCommission, selectedHolding.currency)}</div>
              </div>
              <div className="modal-stat-item">
                <div className="modal-stat-label">P/L</div>
                <div className={`modal-stat-value ${selectedHolding.pl && selectedHolding.pl > 0 ? 'pl-positive' : selectedHolding.pl && selectedHolding.pl < 0 ? 'pl-negative' : ''}`}>
                  {formatCurrency(selectedHolding.pl, selectedHolding.currency)}
                  {selectedHolding.plPct !== null && (
                    <span className="modal-stat-pct"> ({selectedHolding.plPct.toFixed(2)}%)</span>
                  )}
                </div>
              </div>
            </div>
            {actionMessage && <div className="helper-text info">{actionMessage}</div>}
            
            <div className="modal-section">
              <h3 className="modal-section-title">Buy/Sell Transactions</h3>
              {selectedHoldingTransactions.length === 0 ? (
                <p className="muted">No transactions for this holding yet.</p>
              ) : (
                <div className="table-wrapper modal-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Category</th>
                        <th>Product</th>
                        <th>Quantity</th>
                        <th>Price ({selectedHolding.currency})</th>
                        <th>Commission ({selectedHolding.currency})</th>
                        <th>Notes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedHoldingTransactions.map((tx) => {
                        const isEditing = editingTransactionId === tx.id;
                        return (
                          <tr key={tx.id}>
                            <td>
                              {isEditing ? (
                                <input
                                  type="date"
                                  value={editForm.tradeDate ?? tx.trade_date ?? ''}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, tradeDate: e.target.value }))}
                                />
                              ) : (
                                tx.trade_date ?? '-'
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <select
                                  value={(editForm.type as Transaction['type']) ?? tx.type}
                                  onChange={(e) =>
                                    setEditForm((prev) => ({ ...prev, type: e.target.value as Transaction['type'] }))
                                  }
                                >
                                  <option value="BUY">BUY</option>
                                  <option value="SELL">SELL</option>
                                </select>
                              ) : (
                                tx.type
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editForm.category ?? tx.category}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, category: e.target.value }))}
                                />
                              ) : (
                                tx.category
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editForm.productName ?? tx.product_name}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, productName: e.target.value }))}
                                />
                              ) : (
                                tx.product_name
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={editForm.quantity ?? (tx.quantity !== null ? Math.abs(tx.quantity) : '')}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, quantity: e.target.value }))}
                                />
                              ) : tx.quantity !== null ? (
                                Math.abs(tx.quantity).toFixed(4)
                              ) : (
                                '-'
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={editForm.price ?? (tx.price ?? '')}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, price: e.target.value }))}
                                />
                              ) : tx.price !== null ? (
                                tx.price.toFixed(4)
                              ) : (
                                '-'
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editForm.commission ?? (tx.commission ?? '')}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, commission: e.target.value }))}
                                />
                              ) : tx.commission !== null ? (
                                tx.commission.toFixed(2)
                              ) : (
                                '-'
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editForm.notes ?? (tx.notes ?? '')}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                                />
                              ) : (
                                tx.notes
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <div className="action-row">
                                  <button type="button" onClick={() => void saveEdit()}>
                                    Save
                                  </button>
                                  <button type="button" className="ghost" onClick={() => cancelEditing()}>
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="action-row">
                                  <button type="button" onClick={() => startEditing(tx)}>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="ghost danger"
                                    onClick={() => void deleteTransaction(tx.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-section">
              <h3 className="modal-section-title">Dividend History</h3>
              {selectedHoldingDividends.length === 0 ? (
                <p className="muted">No dividends received yet.</p>
              ) : (
                <div className="table-wrapper modal-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount ({selectedHolding.currency})</th>
                        <th>Notes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedHoldingDividends.map((tx) => {
                        const isEditing = editingTransactionId === tx.id;
                        return (
                          <tr key={tx.id}>
                            <td>
                              {isEditing ? (
                                <input
                                  type="date"
                                  value={editForm.tradeDate ?? tx.trade_date ?? ''}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, tradeDate: e.target.value }))}
                                />
                              ) : (
                                tx.trade_date ?? '-'
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editForm.dividendAmount ?? (tx.dividend_amount ?? '')}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, dividendAmount: e.target.value }))}
                                />
                              ) : tx.dividend_amount !== null ? (
                                tx.dividend_amount.toFixed(2)
                              ) : (
                                '-'
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editForm.notes ?? (tx.notes ?? '')}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                                />
                              ) : (
                                tx.notes
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <div className="action-row">
                                  <button type="button" onClick={() => void saveEdit()}>
                                    Save
                                  </button>
                                  <button type="button" className="ghost" onClick={() => cancelEditing()}>
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="action-row">
                                  <button type="button" onClick={() => startEditing(tx)}>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="ghost danger"
                                    onClick={() => void deleteTransaction(tx.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}