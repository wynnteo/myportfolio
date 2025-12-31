import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart as RechartsPieChart, Pie } from 'recharts';
import { fetchWithAuth, getAuthHeaders } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

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

const brokers = ['Moo Moo', 'CMC Invest', 'OCBC', 'DBS', 'HSBC', 'POEMS', 'FSMOne', 'IBKR', 'Other'];
const categories = ['Unit Trusts', 'Stocks', 'ETF', 'Bond', 'Cash', 'Crypto', 'Other'];
const currencies = ['SGD', 'USD', 'MYR'];

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

function formatPrice(value: number | null, currency: string, decimals: number = 2): string {
  if (value === null || Number.isNaN(value)) return '-';
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${getCurrencySymbol(currency)}${formatted}`;
}

function formatPriceWithoutCurrency(value: number | null, currency: string, decimals: number = 2): string {
  if (value === null || Number.isNaN(value)) return '-';
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${formatted}`;
}

function formatQuantity(value: number | null) {
  if (value === null || Number.isNaN(value)) return '-';
  if (value === Math.floor(value)) {
    return value.toString();
  }
  return value.toFixed(4).replace(/\.?0+$/, '');
}

function getHoldingKey(symbol: string, broker: string | null | undefined) {
  return `${broker || 'Unknown'}__${symbol}`;
}

function getGradientColor(index: number, total: number) {
  const colors = [
    '#0f172a', '#1e40af', '#2563eb', '#3b82f6',
    '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4',
  ];
  return colors[index % colors.length];
}

function getCategoryColor(category: string) {
  const palette: Record<string, string> = {
    'Unit Trusts': '#64acdb',
    Stocks: '#f8c268',
    ETF: '#6fd2df',
    Bond: '#f4609f',
    Cash: '#fa9228',
    Crypto: '#8b5cf6',
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

function AssetAllocationChart({
  data,
}: {
  data: Array<{ name: string; pct: number; value: number; currency?: string }>;
}) {
  const COLORS = {
    'Unit Trusts': '#64acdb',
    'Stocks': '#f8c268',
    'ETF': '#6fd2df',
    'Bond': '#f4609f',
    'Cash': '#fa9228',
    'Crypto': '#8b5cf6',
    'Other': '#d38278',
  };

  const EXTENDED_COLORS = ['#64acdb', '#f8c268', '#b57edc', '#6fd2df', '#f4609f', '#fa9228', '#d38278', '#51c9b2', '#48b14c', '#fc8eac', '#009aad', '#8567ff'];

  if (data.length === 0 || data.every((entry) => entry.value === 0)) {
    return (
      <div className="chart-card">
        <div className="chart-header">Allocation by Asset</div>
        <div className="pie-chart empty">
          <div className="empty-pie">No data</div>
        </div>
      </div>
    );
  }

  const chartData = data.map(item => ({
    name: item.name,
    value: item.value,
    pct: item.pct,
  }));

  return (
    <div className="chart-card">
      <div className="chart-header">Allocation by Asset</div>
      <ResponsiveContainer width="100%" height={200}>
        <RechartsPieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS] || EXTENDED_COLORS[index % EXTENDED_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => formatPrice(value, 'SGD', 2)} />
        </RechartsPieChart>
      </ResponsiveContainer>
      <div className="stacked-legend">
        {data.map((entry, index) => (
          <div key={entry.name} className="legend-item">
            <span
              className="legend-swatch"
              style={{ background: COLORS[entry.name as keyof typeof COLORS] || EXTENDED_COLORS[index % EXTENDED_COLORS.length] }}
            />
            <div className="legend-text">
              <span className="legend-name">{entry.name}</span>
              <span className="legend-value">{entry.pct.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthlyDividendsChart({ transactions }: { transactions: Transaction[] }) {
  const currentYear = new Date().getFullYear();
  
  const monthlyData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data = months.map((name, index) => ({ month: name, value: 0, index }));
    
    transactions
      .filter(tx => tx.type === 'DIVIDEND' && tx.trade_date && new Date(tx.trade_date).getFullYear() === currentYear)
      .forEach(tx => {
        const month = new Date(tx.trade_date!).getMonth();
        data[month].value += tx.dividend_amount ?? 0;
      });
    
    return data;
  }, [transactions, currentYear]);
  
  return (
    <div className="chart-card">
      <div className="chart-header">Monthly Dividends ({currentYear})</div>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={monthlyData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#64748b" />
          <YAxis tick={{ fontSize: 12 }} stroke="#64748b" />
          <Tooltip 
            formatter={(value: number) => formatPrice(value, 'SGD', 2)}
            contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
          />
          <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PerformanceInsightsCard({ topGainer, topLoser }: { topGainer: HoldingRow | null; topLoser: HoldingRow | null }) {
  return (
    <div className="chart-card performance-insights-card">
      <div className="chart-header">Portfolio Performance</div>
      
      {!topGainer && !topLoser ? (
        <div className="pie-chart empty">
          <div className="empty-pie">No data</div>
        </div>
      ) : (
        <div className="insights-compact">
          {topGainer && topGainer.plPct !== null && topGainer.plPct > 0 && (
            <div className="insight-compact positive">
              <div className="insight-compact-label">🔥 Top Performer</div>
              <div className="insight-compact-main">
                <span className="insight-compact-symbol">{topGainer.symbol}</span>
                <span className="insight-compact-value">+{topGainer.plPct.toFixed(2)}%</span>
              </div>
              {topGainer.productName && (
                <div className="insight-compact-product">{topGainer.productName}</div>
              )}
              <div className="insight-compact-amount">{formatPrice(topGainer.pl ?? 0, topGainer.currency, 2)} gain</div>
            </div>
          )}
          
          {topLoser && topLoser.plPct !== null && topLoser.plPct < 0 && (
            <div className="insight-compact negative">
              <div className="insight-compact-label">📉 Worst Performer</div>
              <div className="insight-compact-main">
                <span className="insight-compact-symbol">{topLoser.symbol}</span>
                <span className="insight-compact-value">{topLoser.plPct.toFixed(2)}%</span>
              </div>
              {topLoser.productName && (
                <div className="insight-compact-product">{topLoser.productName}</div>
              )}
              <div className="insight-compact-amount">{formatPrice(topLoser.pl ?? 0, topLoser.currency, 2)} loss</div>
            </div>
          )}
          
          {(!topGainer || topGainer.plPct === null || topGainer.plPct <= 0) && (!topLoser || topLoser.plPct === null || topLoser.plPct >= 0) && (
            <div className="insight-compact neutral">
              <div className="insight-compact-label">📊 Portfolio Status</div>
              <div className="insight-compact-summary">
                <div>No significant gains or losses to display</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TopHoldingsChart({ holdings }: { holdings: HoldingRow[] }) {
  const EXTENDED_COLORS = ['#64acdb', '#f8c268', '#b57edc', '#6fd2df', '#f4609f', '#fa9228', '#d38278', '#51c9b2', '#48b14c', '#fc8eac', '#009aad', '#8567ff'];
  
  const topHoldings = useMemo(() => {
    return [...holdings]
      .filter((h) => h.category === "Stocks") 
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, 10);
  }, [holdings]);
  
  if (topHoldings.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-header">Top Stocks Holdings</div>
        <div className="pie-chart empty">
          <div className="empty-pie">No data</div>
        </div>
      </div>
    );
  }
  
  const totalValue = topHoldings.reduce((sum, h) => sum + h.totalCost, 0);
  
  // Transform data for stacked bar chart - single horizontal bar with dummy category
  const chartData = [
    {
      name: 'Holdings',
      ...topHoldings.reduce((acc, holding) => {
        acc[holding.symbol] = holding.totalCost;
        return acc;
      }, {} as Record<string, number>)
    }
  ];
  
  return (
    <div className="chart-card stacked-chart-card">
      <div className="chart-header">Top Stocks Holdings</div>
      <ResponsiveContainer width="100%" height={60}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" hide />
          {topHoldings.map((holding, index) => (
            <Bar 
              key={holding.symbol} 
              dataKey={holding.symbol} 
              stackId="a" 
              fill={EXTENDED_COLORS[index % EXTENDED_COLORS.length]}
              radius={index === 0 ? [4, 0, 0, 4] : index === topHoldings.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="holdings-legend">
        {topHoldings.map((holding, index) => {
          const pct = (holding.totalCost / totalValue) * 100;
          return (
            <div key={holding.symbol} className="legend-item">
              <span
                className="legend-swatch"
                style={{ background: EXTENDED_COLORS[index % EXTENDED_COLORS.length] }}
              />
              <div className="legend-text">
                <span className="legend-name">{holding.symbol}</span>
                <span className="legend-value">{pct.toFixed(1)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();

  const [loadingPrices, setLoadingPrices] = useState(false);
  const [priceLoadingSymbols, setPriceLoadingSymbols] = useState<Set<string>>(new Set());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [statusText, setStatusText] = useState('Connecting to database...');
  const [statusTone, setStatusTone] = useState<'info' | 'success' | 'error'>('info');
  const [brokerFilter, setBrokerFilter] = useState<string>('All');
  const [currencyFilter, setCurrencyFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [quotes, setQuotes] = useState<Record<string, QuoteResponse>>({});
  const [selectedHoldingKey, setSelectedHoldingKey] = useState<string | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TransactionFormState>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showAddDividend, setShowAddDividend] = useState(false);
  const [dividendForm, setDividendForm] = useState({ amount: '', date: '', notes: '' });
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('grid');
  const [holdingsPage, setHoldingsPage] = useState(1);
  const [transactionsPage, setTransactionsPage] = useState(1);
  const ITEMS_PER_PAGE = 6;

  async function loadTransactions() {
    try {
      setStatusText('Loading transactions from database...');
      const response = await fetchWithAuth('/api/transactions');

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
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) {
      void loadTransactions();
    }
  }, [user]);

  const allHoldings = useMemo(() => {
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

    return Array.from(map.values());
  }, [transactions]);

  const holdings = useMemo(() => {
    return allHoldings.filter((row) => {
      const brokerOk = brokerFilter === 'All' || row.broker === brokerFilter;
      const currencyOk = currencyFilter === 'All' || row.currency === currencyFilter;
      const categoryOk = categoryFilter === 'All' || row.category === categoryFilter;
      return brokerOk && currencyOk && categoryOk;
    });
  }, [allHoldings, brokerFilter, currencyFilter, categoryFilter]);

  useEffect(() => {
    async function fetchQuotesForHoldings() {
      const allSymbols = Array.from(new Set(holdings.map((h) => h.symbol))).filter(Boolean) as string[];
      if (allSymbols.length === 0) {
        setQuotes({});
        setLastPriceUpdate(null);
        setPriceLoadingSymbols(new Set());
        setLoadingPrices(false);
        return;
      }

      setLoadingPrices(true);
      setPriceLoadingSymbols(new Set(allSymbols));
      const nextQuotes: Record<string, QuoteResponse | { price: number | null; asOf?: string; source?: string; cached?: boolean }> = {};

      const unitTrustSymbols = Array.from(new Set(
        holdings.filter(h => h.category === 'Unit Trusts' && h.symbol).map(h => String(h.symbol))
      ));
      const otherSymbols = Array.from(new Set(
        holdings.filter(h => h.category !== 'Unit Trusts' && h.symbol).map(h => String(h.symbol))
      ));

      const ftSFromSymbol = (sym: string, currency = 'SGD') => sym.includes(':') ? sym : `${sym}:${currency}`;
      const ftFetchPromises = unitTrustSymbols.map(async (sym) => {
        const holding = holdings.find(h => h.symbol === sym);
        const sParam = ftSFromSymbol(sym, 'SGD');
        const fundName = holding?.productName ?? ''; 

        try {
          const resp = await fetch(`/api/fund-quote?s=${encodeURIComponent(sParam)}&name=${encodeURIComponent(fundName)}`);
          if (!resp.ok) {
            nextQuotes[sym] = { price: null, source: 'ft', cached: false };
            return;
          }
          const j = await resp.json();
          nextQuotes[sym] = { price: typeof j.price === 'number' ? j.price : null, asOf: j.lastUpdated ?? j.asOf ?? null, source: 'ft', cached: !!j.cached };
        } catch (e) {
          nextQuotes[sym] = { price: null, source: 'ft', cached: false };
        } finally {
          // Remove from loading set
          setPriceLoadingSymbols(prev => {
            const newSet = new Set(prev);
            newSet.delete(sym);
            return newSet;
          });
        }
      });

      const CHUNK = 5;
      for (let i = 0; i < ftFetchPromises.length; i += CHUNK) {
        await Promise.all(ftFetchPromises.slice(i, i + CHUNK));
      }

      await Promise.all(otherSymbols.map(async (symbol) => {
        try {
          const resp = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
          if (!resp.ok) {
            return;
          }
          const data: QuoteResponse = await resp.json();
          nextQuotes[symbol] = data;
        } catch (err) {
          // ignore individual failures
        } finally {
          // Remove from loading set
          setPriceLoadingSymbols(prev => {
            const newSet = new Set(prev);
            newSet.delete(symbol);
            return newSet;
          });
        }
      }));

      setQuotes(prev => {
        const merged: Record<string, any> = { ...prev };
        for (const k of Object.keys(nextQuotes)) {
          merged[k] = nextQuotes[k];
        }
        return merged;
      });

      setLastPriceUpdate(new Date());
      setLoadingPrices(false);
      setPriceLoadingSymbols(new Set());
    }

    void fetchQuotesForHoldings();

    const intervalId = setInterval(() => {
      void fetchQuotesForHoldings();
    }, 900000);

    return () => clearInterval(intervalId);
  }, [holdings]);


  const currentYear = new Date().getFullYear();

  const allDisplayHoldings = useMemo(() => {
    return allHoldings.map((row) => {
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
  }, [allHoldings, quotes, transactions]);

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
    const byCategory = new Map<string, { value: number; currency: string }>();
    const byCurrency = new Map<string, number>();
    const byHolding = new Map<string, { value: number; currency: string }>();

    for (const row of allDisplayHoldings) {
      const catData = byCategory.get(row.category) ?? { value: 0, currency: row.currency };
      catData.value += row.totalCost;
      byCategory.set(row.category, catData);
      
      byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + row.totalCost);
      
      const holdData = byHolding.get(row.symbol) ?? { value: 0, currency: row.currency };
      holdData.value += row.totalCost;
      byHolding.set(row.symbol, holdData);
    }

    const totalCapital = Array.from(byCurrency.values()).reduce((sum, val) => sum + val, 0);

    return {
      byCategory: Array.from(byCategory.entries()).map(([name, data]) => ({
        name,
        value: data.value,
        currency: data.currency,
        pct: totalCapital ? (data.value / totalCapital) * 100 : 0,
      })),
      byCurrency: Array.from(byCurrency.entries()).map(([name, value]) => ({
        name,
        value,
        currency: name,
        pct: totalCapital ? (value / totalCapital) * 100 : 0,
      })),
      byHolding: Array.from(byHolding.entries()).map(([name, data]) => ({
        name,
        value: data.value,
        currency: data.currency,
        pct: totalCapital ? (data.value / totalCapital) * 100 : 0,
      })).sort((a, b) => b.value - a.value),
    };
  }, [allDisplayHoldings]);

  const totals = useMemo(() => {
    const capitalByCurrency = new Map<string, number>();
    const currentValueByCurrency = new Map<string, number>();
    const plByCurrency = new Map<string, number>();
    const dividendsByCurrency = new Map<string, number>();

    for (const row of allDisplayHoldings) {
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
  }, [allDisplayHoldings]);

  const categoryBreakdowns = useMemo(() => {
    const breakdowns = new Map<string, {
      capital: number;
      currentValue: number;
      pl: number;
      plPct: number;
      ytdDividends: number;
      totalDividends: number;
      dividendYield: number;
      topGainer: typeof displayHoldings[0] | null;
      topLoser: typeof displayHoldings[0] | null;
      holdingsCount: number;
    }>();

    categories.forEach(category => {
      const categoryHoldings = allDisplayHoldings.filter(h => h.category === category);
      
      if (categoryHoldings.length === 0) {
        return;
      }

      const capital = categoryHoldings.reduce((sum, h) => sum + h.totalCost, 0);
      const currentValue = categoryHoldings.reduce((sum, h) => sum + (h.currentValue ?? 0), 0);
      const pl = currentValue - capital;
      const plPct = capital !== 0 ? (pl / capital) * 100 : 0;
      
      const totalDividends = categoryHoldings.reduce((sum, h) => sum + h.dividends, 0);
      
      const ytdDividends = transactions
        .filter(tx => 
          tx.type === 'DIVIDEND' && 
          tx.category === category &&
          tx.trade_date && 
          new Date(tx.trade_date).getFullYear() === currentYear
        )
        .reduce((sum, tx) => sum + (tx.dividend_amount ?? 0), 0);
      
      const dividendYield = capital !== 0 ? (ytdDividends / capital) * 100 : 0;

      const topGainer = categoryHoldings.reduce((top, holding) => 
        (holding.plPct !== null && (top === null || (holding.plPct > (top.plPct ?? -Infinity)))) ? holding : top
      , null as typeof displayHoldings[0] | null);
      
      const topLoser = categoryHoldings.reduce((bottom, holding) => 
        (holding.plPct !== null && (bottom === null || (holding.plPct < (bottom.plPct ?? Infinity)))) ? holding : bottom
      , null as typeof displayHoldings[0] | null);

      breakdowns.set(category, {
        capital,
        currentValue,
        pl,
        plPct,
        ytdDividends,
        totalDividends,
        dividendYield,
        topGainer,
        topLoser,
        holdingsCount: categoryHoldings.length,
      });
    });

    return breakdowns;
  }, [allDisplayHoldings, transactions, currentYear]);

  const symbols = useMemo(() => new Set(displayHoldings.map((h) => h.symbol)), [displayHoldings]);

  const sortedHoldings = useMemo(() => {
    if (!sortField) return displayHoldings;
    
    return [...displayHoldings].sort((a, b) => {
      let aVal: any = a[sortField as keyof typeof a];
      let bVal: any = b[sortField as keyof typeof b];
      
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      
      if (typeof aVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [displayHoldings, sortField, sortDirection]);

  const paginatedHoldings = useMemo(() => {
    const start = (holdingsPage - 1) * ITEMS_PER_PAGE;
    return sortedHoldings.slice(start, start + ITEMS_PER_PAGE);
  }, [sortedHoldings, holdingsPage]);

  const totalPages = Math.ceil(sortedHoldings.length / ITEMS_PER_PAGE);

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

    const response = await fetchWithAuth('/api/transactions', {
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

    const response = await fetchWithAuth('/api/transactions', {
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

    const response = await fetchWithAuth('/api/transactions', {
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

    const response = await fetchWithAuth(`/api/transactions?id=${encodeURIComponent(id)}`, {
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

async function handleRefreshPrices() {
  const symbols = Array.from(new Set(holdings.map((h) => h.symbol))).filter(Boolean);
  if (symbols.length === 0) return;

  setLoadingPrices(true);
  setPriceLoadingSymbols(new Set(symbols));
  const nextQuotes: Record<string, QuoteResponse> = {};

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const resp = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
        if (!resp.ok) return;
        const data: QuoteResponse = await resp.json();
        nextQuotes[symbol] = data;
      } catch {}
      finally {
        setPriceLoadingSymbols(prev => {
          const newSet = new Set(prev);
          newSet.delete(symbol);
          return newSet;
        });
      }
    })
  );

  setQuotes(nextQuotes);
  setLastPriceUpdate(new Date());
  setLoadingPrices(false);
  setPriceLoadingSymbols(new Set());
}

function formatLastUpdate(date: Date | null) {
  if (!date) return 'Never';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1 min ago';
  if (diffMins < 60) return `${diffMins} mins ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  
  return date.toLocaleString('en-SG', { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
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
  
  const topGainer = useMemo(
    () => allDisplayHoldings.reduce((top, holding) => 
      (holding.plPct !== null && (top === null || (holding.plPct > (top.plPct ?? -Infinity)))) ? holding : top
    , null as typeof displayHoldings[0] | null),
    [allDisplayHoldings]
  );
  
  const topLoser = useMemo(
    () => allDisplayHoldings.reduce((bottom, holding) => 
      (holding.plPct !== null && (bottom === null || (holding.plPct < (bottom.plPct ?? Infinity)))) ? holding : bottom
    , null as typeof displayHoldings[0] | null),
    [allDisplayHoldings]
  );

  return (
    <>
    <header className="site-header">
      <nav className="site-nav">
        <Link href="/" className="site-logo">
          📊 Portfolio Tracker
        </Link>
        <div className="nav-menu">
          <Link href="/">Home</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/referrals">Referrals</Link>
          <button onClick={() => void logout()}>Logout</button>
        </div>
      </nav>
    </header>
    <main>
      <div className="topbar">
        <div>
          <h1>Portfolio Dashboard</h1>
          <p className="muted">Track your holdings, performance, and income at a glance</p>
        </div>
        <div className="status-group">
          <span id="sync-status" className="badge" data-tone={statusTone}>
            {statusText}
          </span>
          {(loadingPrices || lastPriceUpdate) && (
            <div className="price-update-info">
              {loadingPrices && priceLoadingSymbols.size > 0 ? (
                <span className="update-time loading">
                  <span className="loading-spinner"></span>
                  Loading prices...
                  <span className="loading-count">{priceLoadingSymbols.size} remaining</span>
                </span>
              ) : lastPriceUpdate ? (
                <span className="update-time">Live prices: {formatLastUpdate(lastPriceUpdate)}</span>
              ) : null}
              <button 
                type="button" 
                className="refresh-btn"
                onClick={() => void handleRefreshPrices()}
                disabled={loadingPrices}
                title="Refresh live prices"
              >
                <span className={`refresh-icon ${loadingPrices ? 'spinning' : ''}`}>↻</span>
              </button>
            </div>
          )}
        </div>
      </div>

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
            <div className="stat-value">{formatPrice(totalCapital, 'SGD', 2)}</div>
            <div className="stat-sub">{displayHoldings.length} holdings · {allocations.byCurrency.length} currencies</div>
          </div>
          <div className="summary-card">
            <div className="stat-title">Current value</div>
            <div className="stat-value">{formatPrice(totalCurrentValue, 'SGD', 2)}</div>
            <div className="stat-sub">{Object.keys(quotes).length} live prices</div>
          </div>
          <div className={`summary-card ${totalPl > 0 ? 'profit' : totalPl < 0 ? 'loss' : ''}`}>
            <div className="stat-title">Total Unrealised P/L</div>
            <div className="stat-value">{formatPrice(totalPl, 'SGD', 2)}</div>
            <div className="stat-sub">{totalPlPct !== null && totalPlPct !== 0 ? `${totalPlPct > 0 ? '+' : ''}${totalPlPct.toFixed(2)}%` : '—'}</div>
          </div>
          <div className="summary-card">
            <div className="stat-title">Dividends ({currentYear})</div>
            <div className="stat-value">{formatPrice(ytdDividends, 'SGD', 2)}</div>
            <div className="stat-sub">{ytdYield > 0 ? `${ytdYield.toFixed(2)}% yield` : 'Total: ' + formatPrice(totalDividends, 'SGD', 2)}</div>
          </div>
        </div>
        <div className="chart-grid-two-col">
          <AssetAllocationChart data={allocations.byCategory} />
          <MonthlyDividendsChart transactions={transactions} />
          {/*<PerformanceInsightsCard topGainer={topGainer} topLoser={topLoser} />*/}
        </div>
      </section>

      <section className="category-grid-section" aria-labelledby="category-breakdown">
        <div className="section-title">
          <div>
            <p className="eyebrow">By Asset Class</p>
            <h2 id="category-breakdown">Category Breakdown</h2>
          </div>
        </div>
        
        <div className="category-grid">
          {Array.from(categoryBreakdowns.entries()).map(([category, breakdown]) => {
            // Get holdings for this category and prepare chart data
            const categoryHoldings = displayHoldings.filter(h => h.category === category);
            const categoryChartData = categoryHoldings
              .map(h => ({
                name: h.symbol,
                value: h.totalCost,
              }))
              .sort((a, b) => b.value - a.value)
              //.slice(0, 5); // Top 5 holdings
            
            const EXTENDED_COLORS = ['#64acdb', '#f8c268', '#b57edc', '#6fd2df', '#f4609f', '#fa9228', '#d38278', '#51c9b2', '#48b14c', '#fc8eac'];
            
            return (
              <div key={category} className="category-compact-card">
                {/* Header with category name */}
                <div className="category-compact-header">
                  <span
                    className="category-dot-inline"
                    style={{ backgroundColor: getCategoryColor(category) }}
                  />
                  <span className="category-compact-title">{category}</span>
                  <span className="category-compact-count">{breakdown.holdingsCount}</span>
                </div>
                
                {/* Mini donut chart showing top 5 holdings */}
                {categoryChartData.length > 0 && (
                  <div className="category-mini-chart">
                    <ResponsiveContainer width="100%" height={120}>
                      <RechartsPieChart>
                        <Pie
                          data={categoryChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={25}
                          outerRadius={45}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {categoryChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={EXTENDED_COLORS[index % EXTENDED_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => formatPrice(value, 'SGD', 2)}
                          contentStyle={{ fontSize: '11px', padding: '4px 8px' }}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                
                {/* Statistics */}
                <div className="category-compact-stats">
                  <div className="category-stat-row">
                    <span className="category-stat-label">Capital</span>
                    <span className="category-stat-value">{formatPrice(breakdown.capital, 'SGD', 2)}</span>
                  </div>
                  <div className="category-stat-row">
                    <span className="category-stat-label">Current</span>
                    <span className="category-stat-value">{formatPrice(breakdown.currentValue, 'SGD', 2)}</span>
                  </div>
                  <div className={`category-stat-row highlight ${breakdown.pl > 0 ? 'positive' : breakdown.pl < 0 ? 'negative' : ''}`}>
                    <span className="category-stat-label">Unrealised P/L</span>
                    <span className="category-stat-value-large">
                      {formatPrice(breakdown.pl, 'SGD', 2)}
                      <span className="category-stat-pct">{breakdown.plPct > 0 ? '+' : ''}{breakdown.plPct.toFixed(2)}%</span>
                    </span>
                  </div>
                  <div className="category-stat-row">
                    <span className="category-stat-label">Dividends {currentYear}</span>
                    <span className="category-stat-value">
                      {formatPrice(breakdown.ytdDividends, 'SGD', 2)}
                      {breakdown.dividendYield > 0 && (
                        <span className="stat-yield-badge" style={{marginLeft: '6px'}}>
                          {breakdown.dividendYield.toFixed(2)}% yield
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                
                {/* Top/Worst performers */}
                {(breakdown.topGainer || breakdown.topLoser) && (
                  <div className="category-performers">
                    {breakdown.topGainer && breakdown.topGainer.plPct !== null && breakdown.topGainer.plPct > 0 && (
                      <div className="category-performer positive">
                        <span className="performer-icon">↑</span>
                        <div className="performer-info">
                          <div className="performer-symbol">{breakdown.topGainer.symbol}</div>
                          {breakdown.topGainer.productName && (
                            <div className="performer-product">{breakdown.topGainer.productName}</div>
                          )}
                        </div>
                        <span className="performer-value">+{breakdown.topGainer.plPct.toFixed(1)}%</span>
                      </div>
                    )}
                    {breakdown.topLoser && breakdown.topLoser.plPct !== null && breakdown.topLoser.plPct < 0 && (
                      <div className="category-performer negative">
                        <span className="performer-icon">↓</span>
                        <div className="performer-info">
                          <div className="performer-symbol">{breakdown.topLoser.symbol}</div>
                          {breakdown.topLoser.productName && (
                            <div className="performer-product">{breakdown.topLoser.productName}</div>
                          )}
                        </div>
                        <span className="performer-value">{breakdown.topLoser.plPct.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
            <input name="quantity" type="number" step="0.00001" min="0" required />
          </label>
          <label>
            Price
            <input name="price" type="number" step="0.00001" min="0" required />
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
          <div className="holdings-controls">
            <div className="view-toggle">
              <button 
                className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid view"
              >
                <span>◫</span>
              </button>
              <button 
                className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                title="Table view"
              >
                <span>☰</span>
              </button>
            </div>
            <div className="filters">
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="All">All categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
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
        </div>
        
        {viewMode === 'table' ? (
          <div className="holdings-table-wrapper">
            <table className="holdings-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('symbol')} className="sortable">
                    Symbol {sortField === 'symbol' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('category')} className="sortable">
                    Category {sortField === 'category' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('quantity')} className="sortable" style={{textAlign: 'right'}}>
                    Quantity {sortField === 'quantity' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('averagePrice')} className="sortable">
                    Net Avg Price {sortField === 'averagePrice' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('currentPrice')} className="sortable">
                    Market Price {sortField === 'currentPrice' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('totalCost')} className="sortable" style={{textAlign: 'right'}}>
                    Capital {sortField === 'totalCost' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('currentValue')} className="sortable" style={{textAlign: 'right'}}>
                    Value {sortField === 'currentValue' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('plPct')} className="sortable" style={{textAlign: 'right'}}>
                    P&L {sortField === 'plPct' && (sortDirection === 'asc' ? '↑' : '↓')}
                  </th>
                  <th style={{textAlign: 'right'}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedHoldings.map((row) => {
                  const plClass = row.pl && row.pl !== 0 ? (row.pl > 0 ? 'positive' : 'negative') : 'neutral';

                  return (
                    <tr key={row.key}>
                      <td>
                        <div className="symbol-cell">
                          <div className="symbol-main">{row.symbol}</div>
                          {row.productName && (
                            <div className="symbol-product" title={row.productName}>
                              {row.productName}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="category-badge">
                          <span
                            className="category-dot-small"
                            style={{ backgroundColor: getCategoryColor(row.category) }}
                          />
                          {row.category}
                        </div>
                      </td>
                      <td className="value-cell">
                        {formatQuantity(row.quantity)}
                      </td>
                      <td className="value-cell">
                        {formatPriceWithoutCurrency(row.averagePrice, row.currency, 5)}
                      </td>
                      <td className="value-cell">
                        {formatPriceWithoutCurrency(row.currentPrice, row.currency, 5)}
                      </td>
                      <td className="value-cell">
                        {formatPrice(row.totalCost, row.currency, 2)}
                      </td>
                      <td className="value-cell">
                        {row.currentValue !== null ? formatPrice(row.currentValue, row.currency, 2) : '-'}
                      </td>
                      <td className="pl-cell">
                        <div className={`pl-value ${plClass}`}>
                          <span className="pl-amount">
                            {row.pl !== null ? formatPrice(row.pl, row.currency, 2) : '-'}
                          </span>
                          {row.plPct !== null && (
                            <span className="pl-percentage">
                              {row.plPct > 0 ? '+' : ''}{row.plPct.toFixed(2)}%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="action-cell">
                        <button 
                          type="button" 
                          className="view-btn"
                          onClick={() => setSelectedHoldingKey(row.key)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="holdings-grid">
            {paginatedHoldings.map((row) => {
              const plClass = row.pl && row.pl !== 0 ? (row.pl > 0 ? 'positive' : 'negative') : 'neutral';

              return (
                <div key={row.key} className="holding-card">
                  <div className="holding-card-header">
                    <div className="holding-card-title">
                      <span className="holding-symbol">{row.symbol}</span>
                      <div className="category-badge-small">
                        <span
                          className="category-dot-small"
                          style={{ backgroundColor: getCategoryColor(row.category) }}
                        />
                        <span>{row.category}</span>
                      </div>
                    </div>
                    {row.productName && (
                      <div className="holding-product-name">{row.productName}</div>
                    )}
                  </div>

                  <div className="holding-card-stats">
                    <div className="holding-stat-row">
                      <span className="holding-stat-label">Quantity</span>
                      <span className="holding-stat-value">{formatQuantity(row.quantity)}</span>
                    </div>
                    <div className="holding-stat-row">
                      <span className="holding-stat-label">Avg Price</span>
                      <span className="holding-stat-value">{formatPriceWithoutCurrency(row.averagePrice, row.currency, 5)}</span>
                    </div>
                    <div className="holding-stat-row">
                      <span className="holding-stat-label">Market Price</span>
                      <span className="holding-stat-value">{formatPriceWithoutCurrency(row.currentPrice, row.currency, 5)}</span>
                    </div>
                  </div>

                  <div className="holding-card-values">
                    <div className="holding-value-item">
                      <span className="holding-value-label">Capital</span>
                      <span className="holding-value-amount">{formatPrice(row.totalCost, row.currency, 2)}</span>
                    </div>
                    <div className="holding-value-divider">→</div>
                    <div className="holding-value-item">
                      <span className="holding-value-label">Current</span>
                      <span className="holding-value-amount">
                        {row.currentValue !== null ? formatPrice(row.currentValue, row.currency, 2) : '-'}
                      </span>
                    </div>
                  </div>

                  <div className={`holding-card-pl ${plClass}`}>
                    <span className="holding-pl-amount">
                      {row.pl !== null ? formatPrice(row.pl, row.currency, 2) : '-'}
                    </span>
                    {row.plPct !== null && (
                      <span className="holding-pl-pct">
                        {row.plPct > 0 ? '+' : ''}{row.plPct.toFixed(2)}%
                      </span>
                    )}
                  </div>

                  <button 
                    type="button" 
                    className="holding-card-btn"
                    onClick={() => setSelectedHoldingKey(row.key)}
                  >
                    View Details
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="pagination-controls">
            <button 
              onClick={() => setHoldingsPage(p => Math.max(1, p - 1))}
              disabled={holdingsPage === 1}
            >
              Previous
            </button>
            <span>Page {holdingsPage} of {totalPages}</span>
            <button 
              onClick={() => setHoldingsPage(p => Math.min(totalPages, p + 1))}
              disabled={holdingsPage === totalPages}
            >
              Next
            </button>
          </div>
        )}
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
                    <div className="stat-value-inline">{formatPrice(selectedHolding.totalCost, selectedHolding.currency, 2)}</div>
                  </div>
                  <div className="stat-divider">→</div>
                  <div className="stat-group">
                    <div className="stat-label-inline">Current</div>
                    <div className="stat-value-inline">{formatPrice(selectedHolding.currentValue ?? 0, selectedHolding.currency, 2)}</div>
                  </div>
                </div>
                <div className={`stat-pl ${selectedHolding.pl && selectedHolding.pl > 0 ? 'positive' : selectedHolding.pl && selectedHolding.pl < 0 ? 'negative' : ''}`}>
                  <span className="pl-amount">{formatPrice(selectedHolding.pl ?? 0, selectedHolding.currency, 2)}</span>
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
                    <div className="stat-value-small">{formatPrice(selectedHolding.dividends, selectedHolding.currency, 2)}</div>
                  </div>
                  <div className="stat-divider-vertical"></div>
                  <div className="stat-item-small">
                    <div className="stat-label-small">YTD {new Date().getFullYear()}</div>
                    <div className="stat-value-small">{formatPrice(selectedHolding.thisYearDividends, selectedHolding.currency, 2)}</div>
                    {selectedHolding.dividendYield !== null && (
                      <div className="stat-yield-badge">{selectedHolding.dividendYield.toFixed(2)}% yield</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {actionMessage && <div className="helper-text info">{actionMessage}</div>}
            
            {/* Buy/Sell Transactions Section */}
            <div className="modal-transactions-section">
              <div className="modal-section-header">
                <h3 className="modal-section-title">Buy/Sell Transactions</h3>
              </div>
              
              {selectedHoldingTransactions.length === 0 ? (
                <div className="dividend-empty-state">
                  <div className="dividend-empty-icon">📊</div>
                  <p className="dividend-empty-text">No transactions yet</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="modal-transaction-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Quantity</th>
                        <th>Price</th>
                        <th>Commission</th>
                        <th>Notes</th>
                        <th className="actions-header">Actions</th>
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
                                <span style={{fontWeight: 700, color: tx.type === 'BUY' ? '#059669' : '#dc2626'}}>
                                  {tx.type}
                                </span>
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
                                  step="0.00001"
                                  value={editForm.price ?? (tx.price ?? '')}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, price: e.target.value }))}
                                />
                              ) : tx.price !== null ? (
                                formatPrice(tx.price, selectedHolding.currency, 5)
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
                                formatPrice(tx.commission, selectedHolding.currency, 2)
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
                                  placeholder="Optional"
                                />
                              ) : (
                                <span style={{color: '#64748b', fontSize: '12px'}}>
                                  {tx.notes || '-'}
                                </span>
                              )}
                            </td>
                            <td className="actions-cell">
                              {isEditing ? (
                                <div className="modal-action-buttons">
                                  <button type="button" className="save-btn" onClick={() => void saveEdit()}>
                                    Save
                                  </button>
                                  <button type="button" className="cancel-btn" onClick={() => cancelEditing()}>
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="modal-action-buttons">
                                  <button type="button" className="edit-btn" onClick={() => startEditing(tx)}>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="delete-btn"
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

            {/* Dividend History Section */}
            <div className="dividend-history-section">
              <div className="modal-section-header">
                <h3 className="modal-section-title">Dividend History</h3>
                <button 
                  type="button" 
                  className="add-dividend-btn"
                  onClick={() => setShowAddDividend(!showAddDividend)}
                >
                  {showAddDividend ? 'Cancel' : '+ Add Dividend'}
                </button>
              </div>
              
              {showAddDividend && (
                <div className="dividend-form-inline">
                  <label>
                    Amount ({selectedHolding.currency})
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={dividendForm.amount}
                      onChange={(e) => setDividendForm({ ...dividendForm, amount: e.target.value })}
                      placeholder="0.00"
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
                      placeholder="Optional"
                    />
                  </label>
                  <button 
                    type="button" 
                    className="save-btn"
                    onClick={() => void handleAddDividend()}
                    style={{height: '38px', marginTop: 'auto'}}
                  >
                    Save
                  </button>
                </div>
              )}
              
              {selectedHoldingDividends.length === 0 ? (
                <div className="dividend-empty-state">
                  <div className="dividend-empty-icon">💵</div>
                  <p className="dividend-empty-text">No dividends recorded yet</p>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table className="modal-transaction-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Notes</th>
                        <th className="actions-header">Actions</th>
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
                                <span style={{fontWeight: 700, color: '#059669'}}>
                                  {formatPrice(tx.dividend_amount, selectedHolding.currency, 2)}
                                </span>
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
                                  placeholder="Optional"
                                />
                              ) : (
                                <span style={{color: '#64748b', fontSize: '12px'}}>
                                  {tx.notes || '-'}
                                </span>
                              )}
                            </td>
                            <td className="actions-cell">
                              {isEditing ? (
                                <div className="modal-action-buttons">
                                  <button type="button" className="save-btn" onClick={() => void saveEdit()}>
                                    Save
                                  </button>
                                  <button type="button" className="cancel-btn" onClick={() => cancelEditing()}>
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="modal-action-buttons">
                                  <button type="button" className="edit-btn" onClick={() => startEditing(tx)}>
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="delete-btn"
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
    </>
  );
}