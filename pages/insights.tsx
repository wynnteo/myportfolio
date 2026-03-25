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

interface CategoryBreakdown {
  totalInvested: number;
  totalDividends: number;
  ytdDividends: number;
  realizedReturn: number;
  unrealizedReturn: number;
  unrealizedReturnPct: number;
}

const categories = ['Unit Trusts', 'Stocks', 'ETF', 'Bond', 'Cash', 'Crypto', 'Other'];

function formatCurrency(value: number, currency: string = 'SGD') {
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(value);
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

export default function InsightsPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteResponse>>({});
  const [loading, setLoading] = useState(true);
  const [loadingPrices, setLoadingPrices] = useState(false);

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

  const currentHoldings = useMemo(() => {
    const map = new Map<string, {
      symbol: string;
      productName: string;
      category: string;
      broker: string;
      currency: string;
      quantity: number;
      totalCost: number;
    }>();

    for (const tx of transactions) {
      const key = `${tx.symbol}__${tx.broker}`;
      const existing = map.get(key) ?? {
        symbol: tx.symbol,
        productName: tx.product_name,
        category: tx.category,
        broker: tx.broker,
        currency: tx.currency,
        quantity: 0,
        totalCost: 0,
      };

      if (tx.type === 'BUY' || tx.type === 'SELL') {
        const qty = tx.quantity ?? 0;
        const price = tx.price ?? 0;
        const commission = tx.commission ?? 0;
        existing.quantity += qty;
        existing.totalCost += qty * price + commission;
      }

      if (tx.product_name) {
        existing.productName = tx.product_name;
      }

      map.set(key, existing);
    }

    return Array.from(map.values()).filter(h => h.quantity > 0.0001);
  }, [transactions]);

  useEffect(() => {
    async function fetchQuotes() {
      if (currentHoldings.length === 0) {
        setQuotes({});
        return;
      }

      setLoadingPrices(true);
      const nextQuotes: Record<string, QuoteResponse> = {};

      const unitTrustHoldings = currentHoldings.filter(h => h.category === 'Unit Trusts');
      const otherHoldings = currentHoldings.filter(h => h.category !== 'Unit Trusts');

      const unitTrustSymbols = Array.from(new Set(unitTrustHoldings.map(h => h.symbol))).filter(Boolean);
      const otherSymbols = Array.from(new Set(otherHoldings.map(h => h.symbol))).filter(Boolean);

      await Promise.all(
        unitTrustSymbols.map(async (sym) => {
          const holding = currentHoldings.find(h => h.symbol === sym);
          const sParam = sym.includes(':') ? sym : `${sym}:SGD`;
          const fundName = holding?.productName ?? '';
          try {
            const resp = await fetch(
              `/api/fund-quote?s=${encodeURIComponent(sParam)}&name=${encodeURIComponent(fundName)}`
            );
            if (!resp.ok) return;
            const j = await resp.json();
            if (typeof j.price === 'number') {
              nextQuotes[sym] = {
                symbol: sym,
                currency: 'SGD',
                price: j.price,
                asOf: j.lastUpdated ?? null,
              };
            }
          } catch {
            // ignore
          }
        })
      );

      await Promise.all(
        otherSymbols.map(async (symbol) => {
          try {
            const resp = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
            if (!resp.ok) return;
            const data: QuoteResponse = await resp.json();
            nextQuotes[symbol] = data;
          } catch {
            // ignore
          }
        })
      );

      setQuotes(nextQuotes);
      setLoadingPrices(false);
    }

    void fetchQuotes();
  }, [currentHoldings]);

  const categoryBreakdowns = useMemo(() => {
    const breakdowns = new Map<string, CategoryBreakdown>();
    const currentYear = new Date().getFullYear();

    categories.forEach(category => {
      const breakdown: CategoryBreakdown = {
        totalInvested: 0,
        totalDividends: 0,
        ytdDividends: 0,
        realizedReturn: 0,
        unrealizedReturn: 0,
        unrealizedReturnPct: 0,
      };

      // Calculate total invested
      transactions
        .filter(tx => tx.category === category && tx.type === 'BUY')
        .forEach(tx => {
          if (tx.quantity && tx.price !== null) {
            breakdown.totalInvested += tx.quantity * tx.price + (tx.commission || 0);
          }
        });

      // Calculate total dividends
      transactions
        .filter(tx => tx.category === category && tx.type === 'DIVIDEND')
        .forEach(tx => {
          breakdown.totalDividends += tx.dividend_amount || 0;

          if (tx.trade_date && new Date(tx.trade_date).getFullYear() === currentYear) {
            breakdown.ytdDividends += tx.dividend_amount || 0;
          }
        });

      // Calculate realized returns (from closed positions)
      const positionsMap = new Map<string, {
        totalBought: number;
        totalBuyCost: number;
        totalSold: number;
        totalSellValue: number;
      }>();

      transactions
        .filter(tx => tx.category === category && (tx.type === 'BUY' || tx.type === 'SELL'))
        .forEach(tx => {
          const key = `${tx.symbol}__${tx.broker}`;
          const position = positionsMap.get(key) ?? {
            totalBought: 0,
            totalBuyCost: 0,
            totalSold: 0,
            totalSellValue: 0,
          };

          if (tx.type === 'BUY' && tx.quantity && tx.price !== null) {
            position.totalBought += tx.quantity;
            position.totalBuyCost += tx.quantity * tx.price + (tx.commission || 0);
          } else if (tx.type === 'SELL' && tx.quantity && tx.price !== null) {
            position.totalSold += Math.abs(tx.quantity);
            position.totalSellValue += Math.abs(tx.quantity) * tx.price - (tx.commission || 0);
          }

          positionsMap.set(key, position);
        });

      positionsMap.forEach(position => {
        if (position.totalSold > 0 && position.totalBought > 0) {
          const avgBuyPrice = position.totalBuyCost / position.totalBought;
          const soldCost = position.totalSold * avgBuyPrice;
          const realizedPL = position.totalSellValue - soldCost;
          breakdown.realizedReturn += realizedPL;
        }
      });

      // Calculate unrealized returns (from current holdings with live prices)
      const categoryHoldings = currentHoldings.filter(h => h.category === category);
      let totalCurrentValue = 0;
      let totalCost = 0;

      categoryHoldings.forEach(holding => {
        const quote = quotes[holding.symbol];
        if (quote && typeof quote.price === 'number') {
          totalCurrentValue += quote.price * holding.quantity;
          totalCost += holding.totalCost;
        }
      });

      breakdown.unrealizedReturn = totalCurrentValue - totalCost;
      breakdown.unrealizedReturnPct = totalCost !== 0 ? (breakdown.unrealizedReturn / totalCost) * 100 : 0;

      if (breakdown.totalInvested > 0 || breakdown.totalDividends > 0 || breakdown.unrealizedReturn !== 0) {
        breakdowns.set(category, breakdown);
      }
    });

    return breakdowns;
  }, [transactions, currentHoldings, quotes]);

  // Calculate totals
  const totals = useMemo(() => {
    let totalInvested = 0;
    let totalDividends = 0;
    let ytdDividends = 0;
    let totalRealized = 0;
    let totalUnrealized = 0;

    categoryBreakdowns.forEach(breakdown => {
      totalInvested += breakdown.totalInvested;
      totalDividends += breakdown.totalDividends;
      ytdDividends += breakdown.ytdDividends;
      totalRealized += breakdown.realizedReturn;
      totalUnrealized += breakdown.unrealizedReturn;
    });

    const unrealizedPct = totalInvested !== 0 ? (totalUnrealized / totalInvested) * 100 : 0;

    return {
      totalInvested,
      totalDividends,
      ytdDividends,
      totalRealized,
      totalUnrealized,
      unrealizedPct,
    };
  }, [categoryBreakdowns]);

  if (authLoading || loading) {
    return (
      <>
        <header className="site-header">
          <nav className="site-nav">
            <Link href="/" className="site-logo">
              📊 Portfolio Tracker
            </Link>
          </nav>
        </header>
        <main>
          <div className="loading-state">Loading insights...</div>
        </main>
      </>
    );
  }

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
          <h1>Investment Insights</h1>
          <p>Breakdown of your investment performance and passive income by category</p>
        </div>

        {/* Overall Summary */}
        <section className="insights-overview-section">
          <div className="section-title">
            <h2>Portfolio Overview</h2>
          </div>

          <div className="insights-overview-grid">
            <div className="insight-overview-card">
              <div className="overview-label">Total Invested</div>
              <div className="overview-value">{formatCurrency(totals.totalInvested)}</div>
              <div className="overview-sub">Total capital deployed</div>
            </div>

            <div className="insight-overview-card highlight-dividends">
              <div className="overview-label">Total Dividends</div>
              <div className="overview-value positive">
                {formatCurrency(totals.totalDividends)}
              </div>
              <div className="overview-sub">
                YTD {new Date().getFullYear()}: {formatCurrency(totals.ytdDividends)}
              </div>
            </div>

            <div className="insight-overview-card highlight-return">
              <div className="overview-label">Realized Return</div>
              <div className={`overview-value ${totals.totalRealized >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(totals.totalRealized)}
              </div>
              <div className="overview-sub">
                {totals.totalRealized >= 0 ? 'Gain' : 'Loss'} from closed positions
              </div>
            </div>

            <div className="insight-overview-card highlight-return">
              <div className="overview-label">Unrealized Return</div>
              <div className={`overview-value ${totals.totalUnrealized >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(totals.totalUnrealized)}
              </div>
              <div className="overview-sub">
                {totals.totalUnrealized >= 0 ? '+' : ''}{totals.unrealizedPct.toFixed(2)}% from current holdings
              </div>
            </div>
          </div>
        </section>

        {/* Category Breakdown */}
        <section className="insights-category-section">
          <div className="section-title">
            <h2>Breakdown by Category</h2>
            {loadingPrices && (
              <span className="muted" style={{ fontSize: '14px' }}>
                <span className="loading-spinner" style={{ width: '12px', height: '12px', marginRight: '6px' }}></span>
                Loading current prices...
              </span>
            )}
          </div>

          <div className="insights-category-grid">
            {Array.from(categoryBreakdowns.entries()).map(([category, data]) => (
              <div key={category} className="insight-category-card">
                <div className="category-card-header">
                  <span
                    className="category-color-indicator"
                    style={{ backgroundColor: getCategoryColor(category) }}
                  />
                  <span className="category-card-title">{category}</span>
                </div>

                <div className="category-metrics">
                  <div className="metric-row">
                    <span className="metric-label">Total Invested</span>
                    <span className="metric-value">{formatCurrency(data.totalInvested)}</span>
                  </div>
                  <div className="metric-row highlight-row">
                    <span className="metric-label">Total Dividends</span>
                    <span className="metric-value positive">
                      {formatCurrency(data.totalDividends)}
                    </span>
                  </div>
                  <div className="metric-row highlight-row">
                    <span className="metric-label">YTD Dividends {new Date().getFullYear()}</span>
                    <span className="metric-value positive">
                      {formatCurrency(data.ytdDividends)}
                    </span>
                  </div>
                  <div className="metric-row total-row">
                    <span className="metric-label">Realized Return</span>
                    <span className={`metric-value ${data.realizedReturn >= 0 ? 'positive' : 'negative'}`}>
                      {formatCurrency(data.realizedReturn)}
                    </span>
                  </div>
                  <div className="metric-row total-row">
                    <span className="metric-label">Unrealized Return</span>
                    <span className={`metric-value ${data.unrealizedReturn >= 0 ? 'positive' : 'negative'}`}>
                      {formatCurrency(data.unrealizedReturn)}
                      {data.unrealizedReturnPct !== 0 && (
                        <span className="metric-pct" style={{ marginLeft: '6px', fontSize: '12px', opacity: 0.8 }}>
                          ({data.unrealizedReturn >= 0 ? '+' : ''}{data.unrealizedReturnPct.toFixed(2)}%)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {categoryBreakdowns.size === 0 && (
          <div className="empty-state">
            <p>No transaction data available</p>
          </div>
        )}
      </main>
    </>
  );
}