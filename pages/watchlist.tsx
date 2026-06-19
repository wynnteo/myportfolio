import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { fetchWithAuth } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import NavBar from '../components/NavBar';
import { fetchBatchQuotes } from '../lib/quotes';

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
  currency: string;
  quantity: number;
  avgPrice: number;
  totalCost: number;
  currentPrice: number | null;
  marketValue: number | null;
  pl: number | null;
  plPct: number | null;
}

function formatCurrency(value: number | null, currency: string = 'SGD', decimals: number = 2) {
  if (value === null || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatQuantity(value: number) {
  if (value === Math.floor(value)) return value.toString();
  return value.toFixed(4).replace(/\.?0+$/, '');
}

function formatLastUpdate(date: Date | null) {
  if (!date) return 'Never';
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1 min ago';
  if (diffMins < 60) return `${diffMins} mins ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  return date.toLocaleString('en-SG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function WatchlistPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<Record<string, QuoteResponse>>({});
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortField, setSortField] = useState<string | null>('symbol');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) void loadTransactions();
  }, [user]);

  async function loadTransactions() {
    try {
      setLoading(true);
      const response = await fetchWithAuth('/api/transactions');
      if (response.ok) setTransactions(await response.json());
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoading(false);
    }
  }

  const stockPositions = useMemo(() => {
    const positions = new Map<string, {
      symbol: string;
      productName: string;
      currency: string;
      buyLots: Array<{ qty: number; costPerShare: number; totalCost: number }>;
    }>();

    const txBySymbol = new Map<string, Transaction[]>();
    transactions
      .filter(tx => tx.category === 'Stocks' && (tx.type === 'BUY' || tx.type === 'SELL'))
      .forEach(tx => {
        if (!txBySymbol.has(tx.symbol)) txBySymbol.set(tx.symbol, []);
        txBySymbol.get(tx.symbol)!.push(tx);
      });

    txBySymbol.forEach((txList, symbol) => {
      const sortedTx = [...txList].sort((a, b) =>
        new Date(a.trade_date || a.created_at).getTime() -
        new Date(b.trade_date || b.created_at).getTime()
      );

      const position = { symbol, productName: '', currency: '', buyLots: [] as Array<{ qty: number; costPerShare: number; totalCost: number }> };

      sortedTx.forEach(tx => {
        if (tx.type === 'BUY') {
          const qty = tx.quantity ?? 0;
          const price = tx.price ?? 0;
          const commission = tx.commission ?? 0;
          const costPerShare = qty > 0 ? (qty * price + commission) / qty : 0;
          position.buyLots.push({ qty, costPerShare, totalCost: qty * price + commission });
          position.productName = tx.product_name;
          position.currency = tx.currency;
        } else if (tx.type === 'SELL') {
          let qtyToSell = Math.abs(tx.quantity ?? 0);
          while (qtyToSell > 0 && position.buyLots.length > 0) {
            const oldest = position.buyLots[0];
            if (oldest.qty <= qtyToSell) {
              qtyToSell -= oldest.qty;
              position.buyLots.shift();
            } else {
              oldest.qty -= qtyToSell;
              oldest.totalCost = oldest.qty * oldest.costPerShare;
              qtyToSell = 0;
            }
          }
        }
      });

      if (position.buyLots.length > 0) positions.set(symbol, position);
    });

    const result: StockPosition[] = [];
    positions.forEach(pos => {
      const totalQty = pos.buyLots.reduce((s, l) => s + l.qty, 0);
      const totalCost = pos.buyLots.reduce((s, l) => s + l.totalCost, 0);
      if (totalQty > 0.0001) {
        result.push({
          symbol: pos.symbol,
          productName: pos.productName,
          currency: pos.currency,
          quantity: totalQty,
          avgPrice: totalQty > 0 ? totalCost / totalQty : 0,
          totalCost,
          currentPrice: null,
          marketValue: null,
          pl: null,
          plPct: null,
        });
      }
    });
    return result;
  }, [transactions]);

  // ── FIX: useCallback so the interval always calls the latest version ──────
  const fetchPrices = useCallback(async () => {
    const symbols = Array.from(new Set(stockPositions.map(p => p.symbol))).filter(Boolean);
    if (symbols.length === 0) {
      setQuotes({});
      setLastPriceUpdate(null);
      return;
    }
    setIsRefreshing(true);
    // ── FIX: use batch endpoint instead of N individual calls ──────────────
    const result = await fetchBatchQuotes(symbols);
    setQuotes(result as Record<string, QuoteResponse>);
    setLastPriceUpdate(new Date());
    setIsRefreshing(false);
  }, [stockPositions]);

  // ── FIX: depend on fetchPrices (stable reference via useCallback) ─────────
  useEffect(() => {
    if (stockPositions.length === 0) return;
    void fetchPrices();
    const id = setInterval(() => void fetchPrices(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchPrices]);

  const displayPositions = useMemo(() => {
    return stockPositions.map(pos => {
      const quote = quotes[pos.symbol];
      const currentPrice = quote?.price ?? null;
      const marketValue = currentPrice !== null ? currentPrice * pos.quantity : null;
      const pl = marketValue !== null ? marketValue - pos.totalCost : null;
      const plPct = pl !== null && pos.totalCost !== 0 ? (pl / pos.totalCost) * 100 : null;
      return { ...pos, currentPrice, marketValue, pl, plPct };
    });
  }, [stockPositions, quotes]);

  const sortedPositions = useMemo(() => {
    if (!sortField) return displayPositions;
    return [...displayPositions].sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'string') return sortDirection === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDirection === 'asc' ? av - bv : bv - av;
    });
  }, [displayPositions, sortField, sortDirection]);

  function handleSort(field: string) {
    if (sortField === field) setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('asc'); }
  }

  const totals = useMemo(() => {
    const totalCost = sortedPositions.reduce((s, p) => s + p.totalCost, 0);
    const totalMarketValue = sortedPositions.reduce((s, p) => s + (p.marketValue ?? 0), 0);
    const totalPL = totalMarketValue - totalCost;
    const totalPLPct = totalCost !== 0 ? (totalPL / totalCost) * 100 : 0;
    return { totalCost, totalMarketValue, totalPL, totalPLPct };
  }, [sortedPositions]);

  if (authLoading || loading) {
    return (
      <>
        <NavBar />
        <main><div className="loading-state">Loading watchlist...</div></main>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <main>
        <div className="page-header">
          <div>
            <h1>Stocks Watchlist</h1>
            <p>Real-time tracking of your stock positions with auto-refreshing prices</p>
          </div>
          <div className="price-update-info">
            {isRefreshing ? (
              <span className="update-time loading">
                <span className="loading-spinner" />
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

        <div className="overview-grid" style={{ marginBottom: 32 }}>
          <div className="summary-card">
            <div className="stat-title">Total Invested</div>
            <div className="stat-value">{formatCurrency(totals.totalCost)}</div>
            <div className="stat-sub">{sortedPositions.length} stock positions</div>
          </div>
          <div className="summary-card">
            <div className="stat-title">Market Value</div>
            <div className="stat-value">{formatCurrency(totals.totalMarketValue)}</div>
            <div className="stat-sub">Live prices from Yahoo Finance</div>
          </div>
          <div className={`summary-card ${totals.totalPL > 0 ? 'profit' : totals.totalPL < 0 ? 'loss' : ''}`}>
            <div className="stat-title">Total P/L</div>
            <div className="stat-value">{formatCurrency(totals.totalPL)}</div>
            <div className="stat-sub">
              {totals.totalPLPct !== 0
                ? `${totals.totalPLPct > 0 ? '+' : ''}${totals.totalPLPct.toFixed(2)}%`
                : '—'}
            </div>
          </div>
        </div>

        {sortedPositions.length === 0 ? (
          <div className="empty-state">
            <p>No stock positions found. Add some stock transactions to see them here!</p>
            <Link href="/dashboard" className="btn-primary" style={{ marginTop: 16 }}>
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
                    {[
                      { key: 'symbol', label: 'Symbol' },
                      { key: 'productName', label: 'Product Name' },
                      { key: 'quantity', label: 'Units', right: true },
                      { key: 'avgPrice', label: 'Avg Price', right: true },
                      { key: 'currentPrice', label: 'Current Price', right: true },
                      { key: 'totalCost', label: 'Total Buy', right: true },
                      { key: 'marketValue', label: 'Market Value', right: true },
                      { key: 'plPct', label: 'P/L', right: true },
                    ].map(({ key, label, right }) => (
                      <th key={key} onClick={() => handleSort(key)} className="sortable"
                        style={{ textAlign: right ? 'right' : 'left' }}>
                        {label}{sortField === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedPositions.map((pos, idx) => {
                    const plClass = pos.pl && pos.pl !== 0 ? (pos.pl > 0 ? 'positive' : 'negative') : 'neutral';
                    return (
                      <tr key={idx}>
                        <td><div className="symbol-main" style={{ fontWeight: 700, fontSize: 14 }}>{pos.symbol}</div></td>
                        <td><div className="product-cell">{pos.productName || '-'}</div></td>
                        <td className="value-cell">{formatQuantity(pos.quantity)}</td>
                        <td className="value-cell">{formatCurrency(pos.avgPrice, pos.currency, 4)}</td>
                        <td className="value-cell">
                          {pos.currentPrice !== null
                            ? <span style={{ fontWeight: 700 }}>{formatCurrency(pos.currentPrice, pos.currency, 4)}</span>
                            : isRefreshing ? <span style={{ fontSize: 11, color: '#94a3b8' }}>Loading...</span> : '-'}
                        </td>
                        <td className="value-cell">{formatCurrency(pos.totalCost, pos.currency)}</td>
                        <td className="value-cell">{pos.marketValue !== null ? formatCurrency(pos.marketValue, pos.currency) : '-'}</td>
                        <td className="pl-cell">
                          <div className={`pl-value ${plClass}`}>
                            <span className="pl-amount">{pos.pl !== null ? formatCurrency(pos.pl, pos.currency) : '-'}</span>
                            {pos.plPct !== null && (
                              <span className="pl-percentage">{pos.plPct > 0 ? '+' : ''}{pos.plPct.toFixed(2)}%</span>
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