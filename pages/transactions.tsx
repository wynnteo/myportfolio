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

interface TradeAnalysis {
  symbol: string;
  productName: string;
  category: string;
  broker: string;
  currency: string;
  buyTransactions: Transaction[];
  sellTransactions: Transaction[];
  totalBought: number;
  totalSold: number;
  avgBuyPrice: number;
  avgSellPrice: number;
  totalBuyCost: number;
  totalSellValue: number;
  realizedPL: number;
  realizedPLPct: number;
  isClosed: boolean;
}

const brokers = ['All', 'Moo Moo', 'CMC Invest', 'OCBC', 'DBS', 'HSBC', 'POEMS', 'FSMOne', 'IBKR', 'Other'];
const categories = ['All', 'Unit Trusts', 'Stocks', 'ETF', 'Bond', 'Cash', 'Crypto', 'Other'];

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(value);
}

function formatQuantity(value: number) {
  if (value === Math.floor(value)) {
    return value.toString();
  }
  return value.toFixed(4).replace(/\.?0+$/, '');
}

export default function TransactionHistoryPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'all' | 'closed' | 'summary'>('all');
  const [brokerFilter, setBrokerFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'DIVIDEND'>('ALL');

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

  // Analyze trades by symbol to calculate realized P/L
  const tradeAnalyses = useMemo(() => {
    const grouped = new Map<string, TradeAnalysis>();

    transactions.forEach(tx => {
      if (tx.type === 'DIVIDEND') return;

      const key = `${tx.symbol}__${tx.broker}`;
      let analysis = grouped.get(key);

      if (!analysis) {
        analysis = {
          symbol: tx.symbol,
          productName: tx.product_name,
          category: tx.category,
          broker: tx.broker,
          currency: tx.currency,
          buyTransactions: [],
          sellTransactions: [],
          totalBought: 0,
          totalSold: 0,
          avgBuyPrice: 0,
          avgSellPrice: 0,
          totalBuyCost: 0,
          totalSellValue: 0,
          realizedPL: 0,
          realizedPLPct: 0,
          isClosed: false,
        };
        grouped.set(key, analysis);
      }

      if (tx.type === 'BUY' && tx.quantity && tx.price !== null) {
        analysis.buyTransactions.push(tx);
        analysis.totalBought += tx.quantity;
        analysis.totalBuyCost += (tx.quantity * tx.price) + (tx.commission || 0);
      } else if (tx.type === 'SELL' && tx.quantity && tx.price !== null) {
        analysis.sellTransactions.push(tx);
        analysis.totalSold += Math.abs(tx.quantity);
        analysis.totalSellValue += (Math.abs(tx.quantity) * tx.price) - (tx.commission || 0);
      }
    });

    // Calculate averages and P/L
    grouped.forEach(analysis => {
      if (analysis.totalBought > 0) {
        analysis.avgBuyPrice = analysis.totalBuyCost / analysis.totalBought;
      }
      if (analysis.totalSold > 0) {
        analysis.avgSellPrice = analysis.totalSellValue / analysis.totalSold;
      }

      // For closed positions, calculate realized P/L on the sold portion
      if (analysis.totalSold > 0) {
        const soldCost = analysis.totalSold * analysis.avgBuyPrice;
        analysis.realizedPL = analysis.totalSellValue - soldCost;
        if (soldCost !== 0) {
          analysis.realizedPLPct = (analysis.realizedPL / soldCost) * 100;
        }
      }

      // Position is closed if all bought shares have been sold
      analysis.isClosed = analysis.totalBought > 0 && Math.abs(analysis.totalBought - analysis.totalSold) < 0.0001;
    });

    return Array.from(grouped.values());
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const brokerOk = brokerFilter === 'All' || tx.broker === brokerFilter;
      const categoryOk = categoryFilter === 'All' || tx.category === categoryFilter;
      const typeOk = typeFilter === 'ALL' || tx.type === typeFilter;
      return brokerOk && categoryOk && typeOk;
    });
  }, [transactions, brokerFilter, categoryFilter, typeFilter]);

  const closedPositions = useMemo(() => {
    return tradeAnalyses.filter(a => a.isClosed);
  }, [tradeAnalyses]);

  const totalRealizedPL = useMemo(() => {
    return closedPositions.reduce((sum, p) => sum + p.realizedPL, 0);
  }, [closedPositions]);

  const totalRealizedPLPct = useMemo(() => {
    const totalCost = closedPositions.reduce((sum, p) => sum + (p.totalSold * p.avgBuyPrice), 0);
    return totalCost !== 0 ? (totalRealizedPL / totalCost) * 100 : 0;
  }, [closedPositions, totalRealizedPL]);

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
            <Link href="/calculator">Calculator</Link>
            <Link href="/referrals">Referrals</Link>
            <button onClick={() => void logout()}>Logout</button>
          </div>
        </nav>
      </header>

      <main>
        <div className="page-header">
          <h1>Transaction History</h1>
          <p>Track all your buy, sell, and dividend transactions</p>
        </div>

        {/* View Mode Tabs */}
        <div className="transaction-view-tabs">
          <button
            className={`trans-tab ${viewMode === 'all' ? 'active' : ''}`}
            onClick={() => setViewMode('all')}
          >
            <span>All Transactions</span>
            <span className="trans-tab-count">{filteredTransactions.length}</span>
          </button>
          <button
            className={`trans-tab ${viewMode === 'closed' ? 'active' : ''}`}
            onClick={() => setViewMode('closed')}
          >
            <span>Closed Positions</span>
            <span className="trans-tab-count">{closedPositions.length}</span>
          </button>
          <button
            className={`trans-tab ${viewMode === 'summary' ? 'active' : ''}`}
            onClick={() => setViewMode('summary')}
          >
            <span>Trade Summary</span>
          </button>
        </div>

        {/* Filters */}
        <div className="transaction-filters">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat === 'All' ? 'All Categories' : cat}</option>
            ))}
          </select>
          <select value={brokerFilter} onChange={(e) => setBrokerFilter(e.target.value)}>
            {brokers.map(br => (
              <option key={br} value={br}>{br === 'All' ? 'All Brokers' : br}</option>
            ))}
          </select>
          {viewMode === 'all' && (
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
              <option value="ALL">All Types</option>
              <option value="BUY">Buy Only</option>
              <option value="SELL">Sell Only</option>
              <option value="DIVIDEND">Dividend Only</option>
            </select>
          )}
        </div>

        {loading ? (
          <div className="loading-state">Loading transactions...</div>
        ) : (
          <>
            {/* All Transactions View */}
            {viewMode === 'all' && (
              <section className="transaction-list-section">
                <div className="section-title">
                  <h2>Transaction Log</h2>
                </div>
                <div className="table-wrapper">
                  <table className="transaction-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Symbol</th>
                        <th>Product Name</th>
                        <th>Broker</th>
                        <th style={{textAlign: 'right'}}>Quantity</th>
                        <th style={{textAlign: 'right'}}>Price</th>
                        <th style={{textAlign: 'right'}}>Commission</th>
                        <th style={{textAlign: 'right'}}>Total Value</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map(tx => {
                        const totalValue = tx.type === 'DIVIDEND' 
                          ? (tx.dividend_amount || 0)
                          : ((Math.abs(tx.quantity || 0) * (tx.price || 0)) + (tx.commission || 0));
                        
                        return (
                          <tr key={tx.id}>
                            <td>{tx.trade_date || tx.created_at.split('T')[0]}</td>
                            <td>
                              <span className={`type-badge ${tx.type.toLowerCase()}`}>
                                {tx.type}
                              </span>
                            </td>
                            <td className="symbol-cell">{tx.symbol}</td>
                            <td className="product-cell">{tx.product_name || '-'}</td>
                            <td>{tx.broker}</td>
                            <td style={{textAlign: 'right'}}>
                              {tx.type !== 'DIVIDEND' ? formatQuantity(Math.abs(tx.quantity || 0)) : '-'}
                            </td>
                            <td style={{textAlign: 'right'}}>
                              {tx.price !== null && tx.type !== 'DIVIDEND' ? formatCurrency(tx.price, tx.currency) : '-'}
                            </td>
                            <td style={{textAlign: 'right'}}>
                              {tx.commission !== null && tx.type !== 'DIVIDEND' ? formatCurrency(tx.commission, tx.currency) : '-'}
                            </td>
                            <td style={{textAlign: 'right', fontWeight: 700}}>
                              {formatCurrency(totalValue, tx.currency)}
                            </td>
                            <td className="notes-cell">{tx.notes || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Closed Positions View */}
            {viewMode === 'closed' && (
              <section className="closed-positions-section">
                <div className="section-title">
                  <div>
                    <h2>Closed Positions</h2>
                    <p className="muted">Positions where all bought shares have been sold</p>
                  </div>
                  <div className={`total-realized ${totalRealizedPL >= 0 ? 'profit' : 'loss'}`}>
                    <div className="total-label">Total Realized P/L</div>
                    <div className="total-value">{formatCurrency(totalRealizedPL, 'SGD')}</div>
                    <div className="total-pct">
                      {totalRealizedPL >= 0 ? '+' : ''}{totalRealizedPLPct.toFixed(2)}%
                    </div>
                  </div>
                </div>

                <div className="table-wrapper">
                  <table className="closed-positions-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Product Name</th>
                        <th>Broker</th>
                        <th style={{textAlign: 'right'}}>Total Bought</th>
                        <th style={{textAlign: 'right'}}>Avg Buy Price</th>
                        <th style={{textAlign: 'right'}}>Total Sold</th>
                        <th style={{textAlign: 'right'}}>Avg Sell Price</th>
                        <th style={{textAlign: 'right'}}>Realized P/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closedPositions.map((pos, idx) => (
                        <tr key={idx}>
                          <td className="symbol-cell">{pos.symbol}</td>
                          <td className="product-cell">{pos.productName || '-'}</td>
                          <td>{pos.broker}</td>
                          <td style={{textAlign: 'right'}}>{formatQuantity(pos.totalBought)}</td>
                          <td style={{textAlign: 'right'}}>{formatCurrency(pos.avgBuyPrice, pos.currency)}</td>
                          <td style={{textAlign: 'right'}}>{formatQuantity(pos.totalSold)}</td>
                          <td style={{textAlign: 'right'}}>{formatCurrency(pos.avgSellPrice, pos.currency)}</td>
                          <td style={{textAlign: 'right'}}>
                            <div className={`pl-display ${pos.realizedPL >= 0 ? 'profit' : 'loss'}`}>
                              <span className="pl-amount">{formatCurrency(pos.realizedPL, pos.currency)}</span>
                              <span className="pl-pct">
                                {pos.realizedPL >= 0 ? '+' : ''}{pos.realizedPLPct.toFixed(2)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {closedPositions.length === 0 && (
                        <tr>
                          <td colSpan={8} style={{textAlign: 'center', padding: '40px', color: '#64748b'}}>
                            No closed positions yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Trade Summary View */}
            {viewMode === 'summary' && (
              <section className="trade-summary-section">
                <div className="section-title">
                  <h2>Trade Summary by Position</h2>
                  <p className="muted">Overview of all your trading positions (open and closed)</p>
                </div>

                <div className="summary-grid">
                  {tradeAnalyses.map((analysis, idx) => {
                    const remainingQty = analysis.totalBought - analysis.totalSold;
                    const brokerMatches = brokerFilter === 'All' || analysis.broker === brokerFilter;
                    const categoryMatches = categoryFilter === 'All' || analysis.category === categoryFilter;
                    
                    if (!brokerMatches || !categoryMatches) return null;

                    return (
                      <div key={idx} className={`summary-card ${analysis.isClosed ? 'closed' : 'open'}`}>
                        <div className="summary-card-header">
                          <div className="summary-symbol">{analysis.symbol}</div>
                          {analysis.isClosed && <span className="closed-badge">Closed</span>}
                        </div>
                        {analysis.productName && (
                          <div className="summary-product">{analysis.productName}</div>
                        )}
                        <div className="summary-meta">
                          <span>{analysis.broker}</span>
                          <span>•</span>
                          <span>{analysis.category}</span>
                        </div>

                        <div className="summary-stats">
                          <div className="stat-row">
                            <span className="stat-label">Bought</span>
                            <span className="stat-value">
                              {formatQuantity(analysis.totalBought)} @ {formatCurrency(analysis.avgBuyPrice, analysis.currency)}
                            </span>
                          </div>
                          {analysis.totalSold > 0 && (
                            <div className="stat-row">
                              <span className="stat-label">Sold</span>
                              <span className="stat-value">
                                {formatQuantity(analysis.totalSold)} @ {formatCurrency(analysis.avgSellPrice, analysis.currency)}
                              </span>
                            </div>
                          )}
                          {!analysis.isClosed && remainingQty > 0 && (
                            <div className="stat-row highlight">
                              <span className="stat-label">Remaining</span>
                              <span className="stat-value">{formatQuantity(remainingQty)}</span>
                            </div>
                          )}
                        </div>

                        {analysis.totalSold > 0 && (
                          <div className={`summary-pl ${analysis.realizedPL >= 0 ? 'profit' : 'loss'}`}>
                            <span className="pl-label">Realized P/L</span>
                            <span className="pl-value">
                              {formatCurrency(analysis.realizedPL, analysis.currency)}
                              <span className="pl-badge">
                                {analysis.realizedPL >= 0 ? '+' : ''}{analysis.realizedPLPct.toFixed(2)}%
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}