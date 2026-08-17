import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { fetchWithAuth } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import NavBar from '../components/NavBar';
import { fetchBatchQuotes } from '../lib/quotes';
import {
  HoldingModal, Transaction, HoldingRow, fmt, fmtQty, getHoldingKey, getPLTierClass, isDividendBreakeven,
} from '../components/HoldingModal';

interface QuoteResponse {
  symbol: string;
  currency: string | null;
  price: number;
  asOf: string | null;
}

// Local aliases so the rest of this file reads the same as before
const formatCurrency = fmt;
const formatQuantity = fmtQty;

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
  const [selectedHoldingKey, setSelectedHoldingKey] = useState<string | null>(null);

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

  const currentYear = new Date().getFullYear();

  // Same aggregation as the dashboard's holdings builder, restricted to Stocks,
  // so the shared HoldingModal gets data in exactly the shape it expects.
  const stockPositions = useMemo(() => {
    const map = new Map<string, HoldingRow>();
    for (const tx of transactions) {
      if (tx.category !== 'Stocks') continue;
      const key = getHoldingKey(tx.symbol, tx.broker);
      const row = map.get(key) ?? {
        key, symbol: tx.symbol, productName: tx.product_name, category: tx.category,
        broker: tx.broker, currency: tx.currency, quantity: 0, averagePrice: 0,
        totalCost: 0, totalCommission: 0, dividends: 0, currentPrice: null,
        currentValue: null, pl: null, plPct: null, lastPriceTimestamp: -Infinity,
        thisYearDividends: 0, lastYearDividends: 0, dividendYield: null,
      };
      if (tx.type === 'BUY' || tx.type === 'SELL') {
        row.quantity += tx.quantity ?? 0;
        row.totalCost += (tx.quantity ?? 0) * (tx.price ?? 0) + (tx.commission ?? 0);
        row.totalCommission += tx.commission ?? 0;
      }
      if (tx.type === 'DIVIDEND') {
        row.dividends += tx.dividend_amount ?? 0;
        if (tx.trade_date && new Date(tx.trade_date).getFullYear() === currentYear) {
          row.thisYearDividends += tx.dividend_amount ?? 0;
        }
        if (tx.trade_date && new Date(tx.trade_date).getFullYear() === currentYear - 1) {
          row.lastYearDividends += tx.dividend_amount ?? 0;
        }
      }
      if (tx.product_name) row.productName = tx.product_name;
      map.set(key, row);
    }
    map.forEach(row => {
      if (row.quantity > 0.0001) row.averagePrice = row.totalCost / row.quantity;
    });
    return Array.from(map.values()).filter(r => r.quantity > 0.0001);
  }, [transactions, currentYear]);

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

  const displayPositions: HoldingRow[] = useMemo(() => {
    return stockPositions.map(pos => {
      const quote = quotes[pos.symbol];
      const currentPrice = quote?.price ?? null;
      const currentValue = currentPrice !== null ? currentPrice * pos.quantity : null;
      const pl = currentValue !== null ? currentValue - pos.totalCost : null;
      const plPct = pl !== null && pos.totalCost !== 0 ? (pl / pos.totalCost) * 100 : null;
      const dividendYield = pos.totalCost > 0 && pos.thisYearDividends > 0 ? (pos.thisYearDividends / pos.totalCost) * 100 : null;
      return { ...pos, currentPrice, currentValue, pl, plPct, dividendYield };
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

  const selectedHolding = useMemo(
    () => displayPositions.find(h => h.key === selectedHoldingKey) ?? null,
    [displayPositions, selectedHoldingKey]
  );

  const totals = useMemo(() => {
    const totalCost = sortedPositions.reduce((s, p) => s + p.totalCost, 0);
    const totalMarketValue = sortedPositions.reduce((s, p) => s + (p.currentValue ?? 0), 0);
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
                      { key: 'averagePrice', label: 'Avg Price', right: true },
                      { key: 'currentPrice', label: 'Current Price', right: true },
                      { key: 'totalCost', label: 'Total Buy', right: true },
                      { key: 'currentValue', label: 'Market Value', right: true },
                      { key: 'plPct', label: 'P/L', right: true },
                    ].map(({ key, label, right }) => (
                      <th key={key} onClick={() => handleSort(key)} className="sortable"
                        style={{ textAlign: right ? 'right' : 'left' }}>
                        {label}{sortField === key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                    ))}
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPositions.map((pos) => {
                    const plClass = pos.pl && pos.pl !== 0 ? (pos.pl > 0 ? 'positive' : 'negative') : 'neutral';
                    const tierClass = getPLTierClass(pos.plPct);
                    const divBreakeven = isDividendBreakeven(pos);
                    return (
                      <tr key={pos.key}>
                        <td>
                          <div className="symbol-main" style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center' }}>
                            {pos.symbol}
                            {divBreakeven && (
                              <span
                                className="div-breakeven-badge"
                                title={`Dividends collected (${formatCurrency(pos.dividends, pos.currency)}) have covered your total cost (${formatCurrency(pos.totalCost, pos.currency)}). This position is now paying you for free.`}
                              >
                                <span className="badge-icon">🎯</span>Div B/E
                              </span>
                            )}
                          </div>
                        </td>
                        <td><div className="product-cell">{pos.productName || '-'}</div></td>
                        <td className="value-cell">{formatQuantity(pos.quantity)}</td>
                        <td className="value-cell">{formatCurrency(pos.averagePrice, pos.currency, 4)}</td>
                        <td className="value-cell">
                          {pos.currentPrice !== null
                            ? <span style={{ fontWeight: 700 }}>{formatCurrency(pos.currentPrice, pos.currency, 4)}</span>
                            : isRefreshing ? <span style={{ fontSize: 11, color: '#94a3b8' }}>Loading...</span> : '-'}
                        </td>
                        <td className="value-cell">{formatCurrency(pos.totalCost, pos.currency)}</td>
                        <td className="value-cell">{pos.currentValue !== null ? formatCurrency(pos.currentValue, pos.currency) : '-'}</td>
                        <td className={`pl-cell ${tierClass}`}>
                          <div className={`pl-value ${plClass}`}>
                            <span className="pl-amount">{pos.pl !== null ? formatCurrency(pos.pl, pos.currency) : '-'}</span>
                            {pos.plPct !== null && (
                              <span className="pl-percentage">{pos.plPct > 0 ? '+' : ''}{pos.plPct.toFixed(2)}%</span>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="view-btn" onClick={() => setSelectedHoldingKey(pos.key)}>View</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {selectedHolding && (
          <HoldingModal
            holding={selectedHolding}
            transactions={transactions}
            onClose={() => setSelectedHoldingKey(null)}
            onReload={() => void loadTransactions()}
          />
        )}
      </main>
    </>
  );
}