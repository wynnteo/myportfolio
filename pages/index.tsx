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

const chartPalette = ['#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff', '#7c3aed'];

function formatCurrency(value: number | null, currency: string) {
  if (value === null || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(value);
}

function getCurrencySymbol(currency: string) {
  const symbols: Record<string, string> = {
    SGD: 'S$',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CNY: '¥',
    AUD: 'A$',
    MYR: 'RM',
  };

  return symbols[currency.toUpperCase()] || currency;
}

function formatQuantity(value: number | null) {
  if (value === null || Number.isNaN(value)) return '-';
  // If it's a whole number, show no decimals
  if (value === Math.floor(value)) {
    return value.toString();
  }
  // Otherwise show up to 4 decimals, removing trailing zeros
  return value.toFixed(4).replace(/\.?0+$/, '');
}

function getHoldingKey(symbol: string, broker: string | null | undefined) {
  return `${broker || 'Unknown'}__${symbol}`;
}

// Generate gradient colors based on position with more obvious differences
function getGradientColor(index: number, total: number) {
  // Navy blue to sky blue gradient with better contrast
  const colors = [
    '#1e3a8a', // Very dark navy
    '#1e40af', // Dark navy
    '#2563eb', // Navy blue
    '#3b82f6', // Blue
    '#60a5fa', // Light blue
    '#93c5fd', // Sky blue
    '#bfdbfe', // Very light blue
    '#dbeafe', // Pale blue
  ];
  
  if (total <= colors.length) {
    return colors[index] || colors[colors.length - 1];
  }
  
  // For more items, interpolate
  const colorIndex = (index / (total - 1)) * (colors.length - 1);
  const lowerIndex = Math.floor(colorIndex);
  const upperIndex = Math.ceil(colorIndex);
  
  return colors[lowerIndex] || colors[0];
}

function getCategoryColor(category: string) {
  const palette: Record<string, string> = {
    'Unit Trusts': '#1e40af',
    Stocks: '#2563eb',
    REITs: '#3b82f6',
    ETF: '#60a5fa',
    Bond: '#93c5fd',
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
      Stocks: '#2563eb',
      REITs: '#3b82f6',
      ETF: '#60a5fa',
      Bond: '#93c5fd',
      Cash: '#64748b',
      Other: '#94a3b8',
    };
    
    // For categories, use fixed colors
    if (categoryColors[name]) {
      return categoryColors[name];
    }
    
    // For holdings and currencies, use gradient based on position
    return getGradientColor(index, data.length);
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
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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

      // Calculate this year's dividends for yield
      const currentYear = new Date().getFullYear();
      const thisYearDividends = transactions
        .filter(tx => 
          tx.type === 'DIVIDEND' && 
          tx.symbol === row.symbol && 
          tx.broker === row.broker &&
          tx.trade_date && 
          new Date(tx.trade_date).getFullYear() === currentYear
        )
        .reduce((sum, tx) => sum + (tx.dividend_amount ?? 0), 0);
      
      const dividendYield = row.totalCost !== 0 ? (thisYearDividends / row.totalCost) * 100 : null;

      return {
        ...row,
        currentPrice,
        currentValue,
        pl,
        plPct,
        thisYearDividends,
        dividendYield,
        lastPriceTimestamp: quote?.asOf ? Date.parse(quote.asOf) : row.lastPriceTimestamp,
      };
    });
  }, [holdings, quotes, transactions]);

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

  const sortedHoldings = useMemo(() => {
    if (!sortField) return displayHoldings;
    
    return [...displayHoldings].sort((a, b) => {
      let aVal: any = a[sortField as keyof typeof a];
      let bVal: any = b[sortField as keyof typeof b];
      
      // Handle null values
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      
      // String comparison for category and symbol
      if (typeof aVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      // Number comparison
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [displayHoldings, sortField, sortDirection]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedTransactions = useMemo(
    () =>
      [...transactions].sort(
        (a, b) =>
          new Date(b.trade_date ?? b.created_at).getTime() - new Date(a.trade_date ?? a.created_at).getTime()
      ),
    [transactions]
  );

  const selectedHolding = useMemo(
    () => {
      const holding = displayHoldings.find((h) => h.key === selectedHoldingKey);
      if (!holding) return null;
      
      // Calculate this year's dividends for the selected holding
      const currentYear = new Date().getFullYear();
      const thisYearDividends = transactions
        .filter(tx => 
          tx.type === 'DIVIDEND' && 
          getHoldingKey(tx.symbol, tx.broker) === selectedHoldingKey &&
          tx.trade_date && 
          new Date(tx.trade_date).getFullYear() === currentYear
        )
        .reduce((sum, tx) => sum + (tx.dividend_amount ?? 0), 0);
      
      const dividendYield = holding.totalCost !== 0 ? (thisYearDividends / holding.totalCost) * 100 : null;
      
      return {
        ...holding,
        thisYearDividends,
        dividendYield,
      };
    },
    [displayHoldings, selectedHoldingKey, transactions]
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

  async function handleAddDividend() {
    if (!selectedHolding) return;
    
    const payload = {
      symbol: selectedHolding.symbol,
      productName: selectedHolding.productName,
      category: selectedHolding.category,
      broker: selectedHolding.broker,
      currency: selectedHolding.currency,
      type: 'DIVIDEND',
      dividendAmount: Number(dividendForm.amount),
      tradeDate: dividendForm.date,
      notes: dividendForm.notes,
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
      setActionMessage(`Failed to add dividend: ${(error as any)?.error ?? 'Unknown error'}`);
      return;
    }

    setActionMessage('Dividend added successfully.');
    setShowAddDividend(false);
    setDividendForm({ amount: '', date: '', notes: '' });
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
  
  // Calculate YTD dividends and yield
  const currentYear = new Date().getFullYear();
  const ytdDividends = useMemo(
    () => transactions
      .filter(tx => tx.type === 'DIVIDEND' && tx.trade_date && new Date(tx.trade_date).getFullYear() === currentYear)
      .reduce((sum, tx) => sum + (tx.dividend_amount ?? 0), 0),
    [transactions, currentYear]
  );
  const ytdYield = useMemo(
    () => (totalCapital !== 0 ? (ytdDividends / totalCapital) * 100 : 0),
    [ytdDividends, totalCapital]
  );
  
  // Calculate top performers
  const topGainer = useMemo(
    () => displayHoldings.reduce((top, holding) => 
      (holding.plPct !== null && (top === null || (holding.plPct > (top.plPct ?? -Infinity)))) ? holding : top
    , null as typeof displayHoldings[0] | null),
    [displayHoldings]
  );
  
  const topLoser = useMemo(
    () => displayHoldings.reduce((bottom, holding) => 
      (holding.plPct !== null && (bottom === null || (holding.plPct < (bottom.plPct ?? Infinity)))) ? holding : bottom
    , null as typeof displayHoldings[0] | null),
    [displayHoldings]
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
            <div className="stat-sub">{displayHoldings.length} holdings · {allocations.byCurrency.length} currencies</div>
          </div>
          <div className="summary-card">
            <div className="stat-title">Current value</div>
            <div className="stat-value">{formatCurrency(totalCurrentValue || null, 'SGD')}</div>
            <div className="stat-sub">{Object.keys(quotes).length} live prices</div>
          </div>
          <div className={`summary-card ${totalPl > 0 ? 'profit' : totalPl < 0 ? 'loss' : ''}`}>
            <div className="stat-title">Total P/L</div>
            <div className="stat-value">{formatCurrency(totalPl, 'SGD')}</div>
            <div className="stat-sub">{totalPlPct !== null && totalPlPct !== 0 ? `${totalPlPct > 0 ? '+' : ''}${totalPlPct.toFixed(2)}%` : '—'}</div>
          </div>
          <div className="summary-card">
            <div className="stat-title">Dividends ({currentYear})</div>
            <div className="stat-value">{formatCurrency(ytdDividends || null, 'SGD')}</div>
            <div className="stat-sub">{ytdYield > 0 ? `${ytdYield.toFixed(2)}% yield` : 'Total: ' + formatCurrency(totalDividends, 'SGD')}</div>
          </div>
        </div>
        
        {(topGainer || topLoser) && (
          <div className="insights-grid">
            {topGainer && topGainer.plPct !== null && topGainer.plPct > 0 && (
              <div className="insight-card positive">
                <div className="insight-label">Top Performer</div>
                <div className="insight-symbol">{topGainer.symbol}</div>
                <div className="insight-value">+{topGainer.plPct.toFixed(2)}%</div>
              </div>
            )}
            {topLoser && topLoser.plPct !== null && topLoser.plPct < 0 && (
              <div className="insight-card negative">
                <div className="insight-label">Worst Performer</div>
                <div className="insight-symbol">{topLoser.symbol}</div>
                <div className="insight-value">{topLoser.plPct.toFixed(2)}%</div>
              </div>
            )}
          </div>
        )}
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
            </select>
          </label>
          <label>
            Quantity
            <input name="quantity" type="number" step="0.0001" min="0" required />
          </label>
          <label>
            Price
            <input name="price" type="number" step="0.0001" min="0" required />
          </label>
          <label>
            Commission
            <input name="commission" type="number" step="0.01" min="0" defaultValue={0} />
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
                <th onClick={() => handleSort('category')} className="sortable">
                  Category {sortField === 'category' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('symbol')} className="sortable">
                  Instrument {sortField === 'symbol' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Currency</th>
                <th onClick={() => handleSort('quantity')} className="sortable">
                  Quantity {sortField === 'quantity' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('averagePrice')} className="sortable">
                  Avg Price {sortField === 'averagePrice' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('currentPrice')} className="sortable">
                  Current Price {sortField === 'currentPrice' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('totalCost')} className="sortable">
                  Capital {sortField === 'totalCost' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('currentValue')} className="sortable">
                  Current Value {sortField === 'currentValue' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('dividends')} className="sortable">
                  Total Dividends {sortField === 'dividends' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSort('plPct')} className="sortable">
                  P/L {sortField === 'plPct' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedHoldings.map((row) => {
                const plClass = row.pl && row.pl !== 0 ? (row.pl > 0 ? 'pl-positive' : 'pl-negative') : 'pl-neutral';

                return (
                  <tr key={row.key}>
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
                    <td>
                      <div className="instrument-cell">
                        <div className="cell-main">{row.symbol}</div>
                        {row.productName && <div className="muted small">{row.productName}</div>}
                      </div>
                    </td>
                    <td>{row.currency}</td>
                    <td>{formatQuantity(row.quantity)}</td>
                    <td>{row.averagePrice !== null ? `${getCurrencySymbol(row.currency)}${row.averagePrice.toFixed(4)}` : '-'}</td>
                    <td>{row.currentPrice !== null ? `${getCurrencySymbol(row.currency)}${row.currentPrice.toFixed(4)}` : '-'}</td>
                    <td>{row.totalCost !== null ? `${getCurrencySymbol(row.currency)}${row.totalCost.toFixed(2)}` : '-'}</td>
                    <td>{row.currentValue !== null ? `${getCurrencySymbol(row.currency)}${row.currentValue.toFixed(2)}` : '-'}</td>
                    <td>{row.dividends !== null ? `${getCurrencySymbol(row.currency)}${row.dividends.toFixed(2)}` : '-'}</td>
                    
                    <td>
                      <div className="pl-stack">
                        <span className={plClass}>{row.pl !== null ? `${getCurrencySymbol(row.currency)}${row.pl.toFixed(2)}` : '-'}</span>
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
                  <span>Qty: {formatQuantity(selectedHolding.quantity)}</span>
                  <span>Commission: {formatCurrency(selectedHolding.totalCommission, selectedHolding.currency)}</span>
                </div>
              </div>
              <button type="button" className="ghost" onClick={() => setSelectedHoldingKey(null)}>
                Close
              </button>
            </div>
            <div className="modal-stats-grid">
              <div className="modal-stat-card highlight">
                <div className="stat-row">
                  <div className="stat-group">
                    <div className="stat-label-inline">Capital</div>
                    <div className="stat-value-inline">{formatCurrency(selectedHolding.totalCost, selectedHolding.currency)}</div>
                  </div>
                  <div className="stat-divider">→</div>
                  <div className="stat-group">
                    <div className="stat-label-inline">Current</div>
                    <div className="stat-value-inline">{formatCurrency(selectedHolding.currentValue, selectedHolding.currency)}</div>
                  </div>
                </div>
                <div className={`stat-pl ${selectedHolding.pl && selectedHolding.pl > 0 ? 'positive' : selectedHolding.pl && selectedHolding.pl < 0 ? 'negative' : ''}`}>
                  <span className="pl-amount">{formatCurrency(selectedHolding.pl, selectedHolding.currency)}</span>
                  {selectedHolding.plPct !== null && (
                    <span className="pl-badge">{selectedHolding.plPct > 0 ? '+' : ''}{selectedHolding.plPct.toFixed(2)}%</span>
                  )}
                </div>
              </div>

              <div className="modal-stat-card">
                <div className="stat-card-header">
                  <span className="stat-icon">💰</span>
                  <span className="stat-card-title">Dividends</span>
                </div>
                <div className="stat-dual">
                  <div className="stat-item-small">
                    <div className="stat-label-small">Total Collected</div>
                    <div className="stat-value-small">{formatCurrency(selectedHolding.dividends, selectedHolding.currency)}</div>
                  </div>
                  <div className="stat-divider-vertical"></div>
                  <div className="stat-item-small">
                    <div className="stat-label-small">YTD {new Date().getFullYear()}</div>
                    <div className="stat-value-small">{formatCurrency(selectedHolding.thisYearDividends, selectedHolding.currency)}</div>
                    {selectedHolding.dividendYield !== null && (
                      <div className="stat-yield-badge">{selectedHolding.dividendYield.toFixed(2)}% yield</div>
                    )}
                  </div>
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
                        <th>Price</th>
                        <th>Commission</th>
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
                                formatQuantity(Math.abs(tx.quantity))
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
                                `${getCurrencySymbol(selectedHolding.currency)}${tx.price.toFixed(4)}`
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
                                `${getCurrencySymbol(selectedHolding.currency)}${tx.commission.toFixed(2)}`
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
              <div className="section-header">
                <h3 className="modal-section-title">Dividend History</h3>
                <button type="button" onClick={() => setShowAddDividend(!showAddDividend)}>
                  {showAddDividend ? 'Cancel' : '+ Add Dividend'}
                </button>
              </div>
              
              {showAddDividend && (
                <div className="add-dividend-form">
                  <label>
                    Amount ({selectedHolding.currency})
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={dividendForm.amount}
                      onChange={(e) => setDividendForm({ ...dividendForm, amount: e.target.value })}
                      placeholder="0.00"
                      required
                    />
                  </label>
                  <label>
                    Date
                    <input
                      type="date"
                      value={dividendForm.date}
                      onChange={(e) => setDividendForm({ ...dividendForm, date: e.target.value })}
                    />
                  </label>
                  <label>
                    Notes
                    <input
                      type="text"
                      value={dividendForm.notes}
                      onChange={(e) => setDividendForm({ ...dividendForm, notes: e.target.value })}
                      placeholder="Optional notes"
                    />
                  </label>
                  <button type="button" onClick={() => void handleAddDividend()}>
                    Save Dividend
                  </button>
                </div>
              )}
              
              {selectedHoldingDividends.length === 0 ? (
                <p className="muted">No dividends received yet.</p>
              ) : (
                <div className="table-wrapper modal-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
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
                                `${getCurrencySymbol(selectedHolding.currency)}${tx.dividend_amount.toFixed(2)}`
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