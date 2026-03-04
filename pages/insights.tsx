import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { fetchWithAuth } from '../lib/AuthContext';
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

interface CategoryData {
  totalInvested: number;
  investedThisYear: number;
  totalDividends: number;
  dividendsThisYear: number;
  realizedReturn: number;
}

interface YearInsight {
  year: number;
  totalInvested: number;
  totalDividends: number;
  totalRealizedPL: number;
  categories: Record<string, CategoryData>;
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
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [compareYear, setCompareYear] = useState<number | null>(null);

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

  // Calculate insights by year
  const yearInsights = useMemo(() => {
    const insights: Record<number, YearInsight> = {};
    const currentYear = new Date().getFullYear();

    // Build a complete view of all positions across all time
    interface GlobalPosition {
      category: string;
      totalBought: number;
      totalBuyCost: number;
      buys: Array<{ year: number; quantity: number; cost: number }>;
      sells: Array<{ year: number; quantity: number; value: number }>;
    }

    const globalPositions: Record<string, GlobalPosition> = {};

    // Collect all buys and sells
    transactions.forEach((tx) => {
      if (tx.type !== 'BUY' && tx.type !== 'SELL') return;
      
      const key = `${tx.symbol}__${tx.broker}`;
      const year = new Date(tx.trade_date || tx.created_at).getFullYear();

      if (!globalPositions[key]) {
        globalPositions[key] = {
          category: tx.category,
          totalBought: 0,
          totalBuyCost: 0,
          buys: [],
          sells: [],
        };
      }

      const position = globalPositions[key];

      if (tx.type === 'BUY' && tx.quantity && tx.price !== null) {
        const qty = tx.quantity;
        const cost = qty * tx.price + (tx.commission || 0);
        position.totalBought += qty;
        position.totalBuyCost += cost;
        position.buys.push({ year, quantity: qty, cost });
      } else if (tx.type === 'SELL' && tx.quantity && tx.price !== null) {
        const qty = Math.abs(tx.quantity);
        const value = qty * tx.price - (tx.commission || 0);
        position.sells.push({ year, quantity: qty, value });
      }
    });

    // Calculate realized P/L for each year based on sells in that year
    Object.values(globalPositions).forEach((position) => {
      if (position.totalBought === 0) return;
      
      const avgBuyPrice = position.totalBuyCost / position.totalBought;

      position.sells.forEach((sell) => {
        if (!insights[sell.year]) {
          insights[sell.year] = {
            year: sell.year,
            totalInvested: 0,
            totalDividends: 0,
            totalRealizedPL: 0,
            categories: {} as Record<string, CategoryData>,
          };
        }

        if (!insights[sell.year].categories[position.category]) {
          insights[sell.year].categories[position.category] = {
            totalInvested: 0,
            investedThisYear: 0,
            totalDividends: 0,
            dividendsThisYear: 0,
            realizedReturn: 0,
          };
        }

        const soldCost = sell.quantity * avgBuyPrice;
        const realizedPL = sell.value - soldCost;
        
        insights[sell.year].totalRealizedPL += realizedPL;
        insights[sell.year].categories[position.category].realizedReturn += realizedPL;
      });
    });

    // Calculate cumulative investments and dividends per category
    transactions.forEach((tx) => {
      const year = new Date(tx.trade_date || tx.created_at).getFullYear();

      if (!insights[year]) {
        insights[year] = {
          year,
          totalInvested: 0,
          totalDividends: 0,
          totalRealizedPL: 0,
          categories: {} as Record<string, CategoryData>,
        };
      }

      const yearData = insights[year];

      // Initialize category if needed
      if (!yearData.categories[tx.category]) {
        yearData.categories[tx.category] = {
          totalInvested: 0,
          investedThisYear: 0,
          totalDividends: 0,
          dividendsThisYear: 0,
          realizedReturn: 0,
        };
      }

      const categoryData = yearData.categories[tx.category];

      // Track investments (BUY)
      if (tx.type === 'BUY' && tx.quantity && tx.price !== null) {
        const invested = tx.quantity * tx.price + (tx.commission || 0);
        yearData.totalInvested += invested;
        categoryData.investedThisYear += invested;
      }

      // Track dividends
      if (tx.type === 'DIVIDEND' && tx.dividend_amount) {
        yearData.totalDividends += tx.dividend_amount;
        categoryData.dividendsThisYear += tx.dividend_amount;
      }
    });

    // Calculate cumulative totals for each category
    const sortedYears = Object.keys(insights).map(Number).sort((a, b) => a - b);
    const cumulativeByCategory: Record<string, { invested: number; dividends: number }> = {};

    sortedYears.forEach((year) => {
      const yearData = insights[year];
      
      Object.entries(yearData.categories).forEach(([category, data]) => {
        if (!cumulativeByCategory[category]) {
          cumulativeByCategory[category] = { invested: 0, dividends: 0 };
        }
        
        cumulativeByCategory[category].invested += data.investedThisYear;
        cumulativeByCategory[category].dividends += data.dividendsThisYear;
        
        // Set cumulative totals
        data.totalInvested = cumulativeByCategory[category].invested;
        data.totalDividends = cumulativeByCategory[category].dividends;
      });
    });

    return insights;
  }, [transactions]);

  const availableYears = useMemo(() => {
    return Object.keys(yearInsights)
      .map(Number)
      .sort((a, b) => b - a)
      .slice(0, 2); // Show only latest 2 years
  }, [yearInsights]);

  const selectedYearData = yearInsights[selectedYear];
  const compareYearData = compareYear ? yearInsights[compareYear] : null;

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
          <p>Year-by-year breakdown of your investment performance and passive income</p>
        </div>

        {/* Year Selector */}
        <div className="insights-controls">
          <div className="year-selector-group">
            <label className="selector-label">Primary Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="year-selector"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="year-selector-group">
            <label className="selector-label">Compare With</label>
            <select
              value={compareYear || ''}
              onChange={(e) => setCompareYear(e.target.value ? Number(e.target.value) : null)}
              className="year-selector"
            >
              <option value="">No comparison</option>
              {availableYears
                .filter((y) => y !== selectedYear)
                .map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {selectedYearData && (
          <>
            {/* Year Overview */}
            <section className="insights-overview-section">
              <div className="section-title">
                <h2>{selectedYear} Performance Overview</h2>
              </div>

              <div className="insights-overview-grid">
                <div className="insight-overview-card">
                  <div className="overview-label">Total Invested</div>
                  <div className="overview-value">{formatCurrency(selectedYearData.totalInvested)}</div>
                  <div className="overview-sub">Capital deployed in {selectedYear}</div>
                </div>

                <div className="insight-overview-card highlight-dividends">
                  <div className="overview-label">Total Dividends Collected</div>
                  <div className="overview-value positive">
                    {formatCurrency(selectedYearData.totalDividends)}
                  </div>
                  <div className="overview-sub">Passive income earned in {selectedYear}</div>
                </div>

                <div className="insight-overview-card highlight-return">
                  <div className="overview-label">Realized Return</div>
                  <div className={`overview-value ${selectedYearData.totalRealizedPL >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(selectedYearData.totalRealizedPL)}
                  </div>
                  <div className="overview-sub">
                    {selectedYearData.totalRealizedPL >= 0 ? 'Gain' : 'Loss'} from closed positions
                  </div>
                </div>
              </div>
            </section>

            {/* Category Breakdown */}
            <section className="insights-category-section">
              <div className="section-title">
                <h2>Breakdown by Category</h2>
              </div>

              <div className="insights-category-grid">
                {categories
                  .filter((cat) => selectedYearData.categories[cat]?.investedThisYear > 0 || selectedYearData.categories[cat]?.totalInvested > 0)
                  .map((category) => {
                    const data = selectedYearData.categories[category] || {
                      totalInvested: 0,
                      investedThisYear: 0,
                      totalDividends: 0,
                      dividendsThisYear: 0,
                      realizedReturn: 0,
                    };
                    
                    return (
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
                            <span className="metric-label">Total Invested (All-Time)</span>
                            <span className="metric-value">{formatCurrency(data.totalInvested)}</span>
                          </div>
                          <div className="metric-row">
                            <span className="metric-label">Invested in {selectedYear}</span>
                            <span className="metric-value">{formatCurrency(data.investedThisYear)}</span>
                          </div>
                          <div className="metric-row highlight-row">
                            <span className="metric-label">Total Dividends (All-Time)</span>
                            <span className="metric-value positive">
                              {formatCurrency(data.totalDividends)}
                            </span>
                          </div>
                          <div className="metric-row highlight-row">
                            <span className="metric-label">Dividends in {selectedYear}</span>
                            <span className="metric-value positive">
                              {formatCurrency(data.dividendsThisYear)}
                            </span>
                          </div>
                          <div className="metric-row total-row">
                            <span className="metric-label">Realized Return</span>
                            <span className={`metric-value ${data.realizedReturn >= 0 ? 'positive' : 'negative'}`}>
                              {formatCurrency(data.realizedReturn)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>

            {/* Year Comparison */}
            {compareYearData && (
              <section className="insights-comparison-section">
                <div className="section-title">
                  <h2>
                    {selectedYear} vs {compareYear} Comparison
                  </h2>
                </div>

                <div className="comparison-grid">
                  <div className="comparison-card">
                    <div className="comparison-metric">Total Invested</div>
                    <div className="comparison-values">
                      <div className="comparison-value-item">
                        <span className="comparison-year">{selectedYear}</span>
                        <span className="comparison-amount">
                          {formatCurrency(selectedYearData.totalInvested)}
                        </span>
                      </div>
                      <div className="comparison-divider">vs</div>
                      <div className="comparison-value-item">
                        <span className="comparison-year">{compareYear}</span>
                        <span className="comparison-amount">
                          {formatCurrency(compareYearData.totalInvested)}
                        </span>
                      </div>
                    </div>
                    <div className="comparison-diff">
                      {selectedYearData.totalInvested > compareYearData.totalInvested ? '↑' : '↓'}
                      {formatCurrency(Math.abs(selectedYearData.totalInvested - compareYearData.totalInvested))}
                    </div>
                  </div>

                  <div className="comparison-card">
                    <div className="comparison-metric">Dividends Collected</div>
                    <div className="comparison-values">
                      <div className="comparison-value-item">
                        <span className="comparison-year">{selectedYear}</span>
                        <span className="comparison-amount positive">
                          {formatCurrency(selectedYearData.totalDividends)}
                        </span>
                      </div>
                      <div className="comparison-divider">vs</div>
                      <div className="comparison-value-item">
                        <span className="comparison-year">{compareYear}</span>
                        <span className="comparison-amount positive">
                          {formatCurrency(compareYearData.totalDividends)}
                        </span>
                      </div>
                    </div>
                    <div className="comparison-diff">
                      {selectedYearData.totalDividends > compareYearData.totalDividends ? '↑' : '↓'}
                      {formatCurrency(Math.abs(selectedYearData.totalDividends - compareYearData.totalDividends))}
                    </div>
                  </div>

                  <div className="comparison-card">
                    <div className="comparison-metric">Realized Return</div>
                    <div className="comparison-values">
                      <div className="comparison-value-item">
                        <span className="comparison-year">{selectedYear}</span>
                        <span className={`comparison-amount ${selectedYearData.totalRealizedPL >= 0 ? 'positive' : 'negative'}`}>
                          {formatCurrency(selectedYearData.totalRealizedPL)}
                        </span>
                      </div>
                      <div className="comparison-divider">vs</div>
                      <div className="comparison-value-item">
                        <span className="comparison-year">{compareYear}</span>
                        <span className={`comparison-amount ${compareYearData.totalRealizedPL >= 0 ? 'positive' : 'negative'}`}>
                          {formatCurrency(compareYearData.totalRealizedPL)}
                        </span>
                      </div>
                    </div>
                    <div className="comparison-diff">
                      {selectedYearData.totalRealizedPL > compareYearData.totalRealizedPL ? '↑' : '↓'}
                      {formatCurrency(Math.abs(selectedYearData.totalRealizedPL - compareYearData.totalRealizedPL))}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {!selectedYearData && (
          <div className="empty-state">
            <p>No transaction data available for {selectedYear}</p>
          </div>
        )}
      </main>
    </>
  );
}