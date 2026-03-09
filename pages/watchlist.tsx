import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { fetchWithAuth } from '../lib/api';
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

interface QuoteResponse {
  symbol: string;
  currency: string | null;
  price: number;
  asOf: string | null;
}

interface StockPosition {
  symbol: string;
  productName: string;
  broker: string;
  currency: string;
  quantity: number;
  avgPrice: number;
  totalCost: number;
  currentPrice: number | null;
  marketValue: number | null;
  pl: number | null;
  plPct: number | null;
}

function formatCurrency(value: number | null, currency: string = 'SGD') {
  if (value === null || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(value);
}

function formatQuantity(value: number) {
  if (value === Math.floor(value)) {
    return value.toString();
  }
  return value.toFixed(4).replace(/\.?0+$/, '');
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

export default function WatchlistPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<Record<string, QuoteResponse>>({});
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortField, setSortField] = useState<string | null>('symbol');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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

  async function loadTransactions() {
    try {
      setLoading(true);
      const response = await fetchWithAuth('/api/transactions');
      if (response.ok) {
        const data: Transaction[] = await response.json();
        setTransactions(data);
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoading(false);
    }
  }

  // Calculate stock positions
  const stockPositions = useMemo(() => {
    const positions = new Map<string, StockPosition>();

    transactions
      .filter(tx => tx.category === 'Stocks' && (tx.type === 'BUY' || tx.type === 'SELL'))
      .forEach(tx => {
        const key = `${tx.symbol}__${tx.broker}`;
        const existing = positions.get(key) || {
          symbol: tx.symbol,
          productName: tx.product_name,
          broker: tx.broker,
          currency: tx.currency,
          quantity: 0,
          avgPrice: 0,
          totalCost: 0,
          currentPrice: null,
          marketValue: null,
          pl: null,
          plPct: null,
        };

        if (tx.type === 'BUY' || tx.type === 'SELL') {
          const qty = tx.quantity ?? 0;
          const price = tx.price ?? 0;
          const commission = tx.commission ?? 0;
          existing.quantity += qty;
          existing.totalCost += qty * price + commission;
        }

        positions.set(key, existing);
      });

    // Calculate average price
    positions.forEach(pos => {
      if (pos.quantity !== 0) {
        pos.avgPrice = pos.totalCost / pos.quantity;
      }
    });

    // Filter out positions with zero or negative quantity
    return Array.from(positions.values()).filter(pos => pos.quantity > 0.0001);
  }, [transactions]);

  // Fetch prices for all stocks
  async function fetchPrices() {
    const symbols = Array.from(new Set(stockPositions.map(p => p.symbol))).filter(Boolean);
    if (symbols.length === 0) {
      setQuotes({});
      setLastPriceUpdate(null);
      return;
    }

    setIsRefreshing(true);
    const nextQuotes: Record<string, QuoteResponse> = {};

    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const resp = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
          if (!resp.ok) return;
          const data: QuoteResponse = await resp.json();
          nextQuotes[symbol] = data;
        } catch (err) {
          // ignore individual failures
        }
      })
    );

    setQuotes(nextQuotes);
    setLastPriceUpdate(new Date());
    setIsRefreshing(false);
  }

  // Auto-refresh prices every 5 minutes
  useEffect(() => {
    if (stockPositions.length > 0) {
      void fetchPrices();

      const intervalId = setInterval(() => {
        void fetchPrices();
      }, 5 * 60 * 1000); // 5 minutes

      return () => clearInterval(intervalId);
    }
  }, [stockPositions.length]);

  // Combine positions with current prices
  const displayPositions = useMemo(() => {
    return stockPositions.map(pos => {
      const quote = quotes[pos.symbol];
      const currentPrice = quote ? quote.price : null;
      let marketValue: number | null = null;
      let pl: number | null = null;
      let plPct: number | null = null;

      if (currentPrice !== null && !Number.isNaN(currentPrice)) {
        marketValue = currentPrice * pos.quantity;
        pl = marketValue - pos.totalCost;
        plPct = pos.totalCost !== 0 ? (pl / pos.totalCost) * 100 : null;
      }

      return {
        ...pos,
        currentPrice,
        marketValue,
        pl,
        plPct,
      };
    });
  }, [stockPositions, quotes]);

  // Sort positions
  const sortedPositions = useMemo(() => {
    if (!sortField) return displayPositions;

    return [...displayPositions].sort((a, b) => {
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
  }, [displayPositions, sortField, sortDirection]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Calculate totals
  const totals = useMemo(() => {
    const totalCost = sortedPositions.reduce((sum, p) => sum + p.totalCost, 0);
    const totalMarketValue = sortedPositions.reduce((sum, p) => sum + (p.marketValue ?? 0), 0);
    const totalPL = totalMarketValue - totalCost;
    const totalPLPct = totalCost !== 0 ? (totalPL / totalCost) * 100 : 0;

    return { totalCost, totalMarketValue, totalPL, totalPLPct };
  }, [sortedPositions]);

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
            <Link href="/transactions">Transactions</Link>
            <Link href="/watchlist">Watchlist</Link>
            <Link href="/insights">Insights</Link>
            <Link href="/calculator">Calculator</Link>
            <Link href="/referrals">Referrals</Link>
            <button onClick={() => void logout()}>Logout</button>
          </div>
        </nav>
      </header>

      <main>
        <div className="page-header">
          <div>
            <h1>Stocks Watchlist</h1>
            <p>Real-time tracking of your stock positions with auto-refreshing prices</p>
          </div>
          <div className="price-update-info">
            {isRefreshing ? (
              <span className="update-time loading">
                <span className="loading-spinner"></span>
                Refreshing prices...
              </span>
            ) : lastPriceUpdate ? (
              <span className="update-time">Last update: {formatLastUpdate(lastPriceUpdate)}</span>
            ) : null}
            <button
              type="button"
              className="refresh-btn"
              onClick={() => void fetchPrices()}
              disabled={isRefreshing}
              title="Refresh prices now"
            >
              <span className={`refresh-icon ${isRefreshing ? 'spinning' : ''}`}>↻</span>
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="overview-grid" style={{ marginBottom: '32px' }}>
          <div className="summary-card">
            <div className="stat-title">Total Invested</div>
            <div className="stat-value">{formatCurrency(totals.totalCost, 'SGD')}</div>
            <div className="stat-sub">{sortedPositions.length} stock positions</div>
          </div>
          <div className="summary-card">
            <div className="stat-title">Market Value</div>
            <div className="stat-value">{formatCurrency(totals.totalMarketValue, 'SGD')}</div>
            <div className="stat-sub">Live prices from Yahoo Finance</div>
          </div>
          <div className={`summary-card ${totals.totalPL > 0 ? 'profit' : totals.totalPL < 0 ? 'loss' : ''}`}>
            <div className="stat-title">Total P/L</div>
            <div className="stat-value">{formatCurrency(totals.totalPL, 'SGD')}</div>
            <div className="stat-sub">
              {totals.totalPLPct !== null && totals.totalPLPct !== 0
                ? `${totals.totalPLPct > 0 ? '+' : ''}${totals.totalPLPct.toFixed(2)}%`
                : '—'}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Loading watchlist...</div>
        ) : sortedPositions.length === 0 ? (
          <div className="empty-state">
            <p>No stock positions found. Add some stock transactions to see them here!</p>
            <Link href="/dashboard" className="btn-primary" style={{ marginTop: '16px' }}>
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <section className="watchlist-section">
            <div className="section-title">
              <h2>Stock Positions</h2>
              <p className="muted">Auto-refreshes every 5 minutes</p>
            </div>

            <div className="table-wrapper">
              <table className="holdings-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('symbol')} className="sortable">
                      Symbol {sortField === 'symbol' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('productName')} className="sortable">
                      Product Name {sortField === 'productName' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('broker')} className="sortable">
                      Broker {sortField === 'broker' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('quantity')} className="sortable" style={{ textAlign: 'right' }}>
                      Units {sortField === 'quantity' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('avgPrice')} className="sortable" style={{ textAlign: 'right' }}>
                      Avg Price {sortField === 'avgPrice' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('currentPrice')} className="sortable" style={{ textAlign: 'right' }}>
                      Current Price {sortField === 'currentPrice' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('totalCost')} className="sortable" style={{ textAlign: 'right' }}>
                      Total Buy {sortField === 'totalCost' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('marketValue')} className="sortable" style={{ textAlign: 'right' }}>
                      Market Value {sortField === 'marketValue' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSort('plPct')} className="sortable" style={{ textAlign: 'right' }}>
                      P/L {sortField === 'plPct' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPositions.map((pos, idx) => {
                    const plClass = pos.pl && pos.pl !== 0 ? (pos.pl > 0 ? 'positive' : 'negative') : 'neutral';

                    return (
                      <tr key={idx}>
                        <td>
                          <div className="symbol-cell">
                            <div className="symbol-main" style={{ fontWeight: 700, fontSize: '14px' }}>
                              {pos.symbol}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="product-cell">{pos.productName || '-'}</div>
                        </td>
                        <td>{pos.broker}</td>
                        <td className="value-cell">{formatQuantity(pos.quantity)}</td>
                        <td className="value-cell">{formatCurrency(pos.avgPrice, pos.currency)}</td>
                        <td className="value-cell">
                          {pos.currentPrice !== null ? (
                            <span style={{ fontWeight: 700 }}>
                              {formatCurrency(pos.currentPrice, pos.currency)}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="value-cell">{formatCurrency(pos.totalCost, pos.currency)}</td>
                        <td className="value-cell">
                          {pos.marketValue !== null ? formatCurrency(pos.marketValue, pos.currency) : '-'}
                        </td>
                        <td className="pl-cell">
                          <div className={`pl-value ${plClass}`}>
                            <span className="pl-amount">
                              {pos.pl !== null ? formatCurrency(pos.pl, pos.currency) : '-'}
                            </span>
                            {pos.plPct !== null && (
                              <span className="pl-percentage">
                                {pos.plPct > 0 ? '+' : ''}
                                {pos.plPct.toFixed(2)}%
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </>
  );
}