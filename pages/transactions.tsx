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

function parseInputNumber(value?: string) {
  if (value === undefined) return undefined;
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TransactionFormState>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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

  function startEditing(tx: Transaction) {
    setEditingTransactionId(tx.id);
    setActionMessage(null);
    
    if (tx.type === 'DIVIDEND') {
      setEditForm({
        symbol: tx.symbol,
        productName: tx.product_name,
        category: tx.category,
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
    setActionMessage(null);
  }

  async function saveEdit() {
    if (!editingTransactionId) return;
    const original = transactions.find((tx) => tx.id === editingTransactionId);
    if (!original) return;

    const payload: any = {
      id: editingTransactionId,
      symbol: editForm.symbol ?? original.symbol,
      productName: editForm.productName ?? original.product_name,
      category: editForm.category ?? original.category,
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
    } else {
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

    setActionMessage('Transaction updated successfully.');
    setEditingTransactionId(null);
    setEditForm({});
    await loadTransactions();
    
    // Clear success message after 3 seconds
    setTimeout(() => setActionMessage(null), 3000);
  }

  async function deleteTransaction(id: string) {
    const confirmed = window.confirm('Are you sure you want to delete this transaction?');
    if (!confirmed) return;

    const response = await fetchWithAuth(`/api/transactions?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      setActionMessage((error as any)?.error ?? 'Failed to delete transaction');
      return;
    }

    setActionMessage('Transaction deleted successfully.');
    if (editingTransactionId === id) {
      setEditingTransactionId(null);
      setEditForm({});
    }
    await loadTransactions();
    
    // Clear success message after 3 seconds
    setTimeout(() => setActionMessage(null), 3000);
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

        {actionMessage && (
          <div className="helper-text success" style={{ 
            padding: '12px 16px', 
            background: '#dcfce7', 
            color: '#166534',
            borderRadius: '8px',
            marginBottom: '16px',
            fontWeight: 600
          }}>
            {actionMessage}
          </div>
        )}

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
                        <th className="actions-header">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.map(tx => {
                        const isEditing = editingTransactionId === tx.id;
                        const totalValue = tx.type === 'DIVIDEND' 
                          ? (tx.dividend_amount || 0)
                          : ((Math.abs(tx.quantity || 0) * (tx.price || 0)) + (tx.commission || 0));
                        
                        return (
                          <tr key={tx.id}>
                            <td>
                              {isEditing ? (
                                <input
                                  type="date"
                                  value={editForm.tradeDate ?? tx.trade_date ?? ''}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, tradeDate: e.target.value }))}
                                  style={{ width: '100%', fontSize: '12px' }}
                                />
                              ) : (
                                tx.trade_date || tx.created_at.split('T')[0]
                              )}
                            </td>
                            <td>
                              {isEditing && tx.type !== 'DIVIDEND' ? (
                                <select
                                  value={(editForm.type as Transaction['type']) ?? tx.type}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, type: e.target.value as Transaction['type'] }))}
                                  style={{ width: '100%', fontSize: '12px' }}
                                >
                                  <option value="BUY">BUY</option>
                                  <option value="SELL">SELL</option>
                                </select>
                              ) : (
                                <span className={`type-badge ${tx.type.toLowerCase()}`}>
                                  {tx.type}
                                </span>
                              )}
                            </td>
                            <td className="symbol-cell">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editForm.symbol ?? tx.symbol}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, symbol: e.target.value }))}
                                  style={{ width: '100%', fontSize: '12px' }}
                                />
                              ) : (
                                tx.symbol
                              )}
                            </td>
                            <td className="product-cell">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editForm.productName ?? tx.product_name ?? ''}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, productName: e.target.value }))}
                                  style={{ width: '100%', fontSize: '12px' }}
                                />
                              ) : (
                                tx.product_name || '-'
                              )}
                            </td>
                            <td>
                              {isEditing ? (
                                <select
                                  value={editForm.broker ?? tx.broker}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, broker: e.target.value }))}
                                  style={{ width: '100%', fontSize: '12px' }}
                                >
                                  {brokers.filter(b => b !== 'All').map(br => (
                                    <option key={br} value={br}>{br}</option>
                                  ))}
                                </select>
                              ) : (
                                tx.broker
                              )}
                            </td>
                            <td style={{textAlign: 'right'}}>
                              {isEditing && tx.type !== 'DIVIDEND' ? (
                                <input
                                  type="number"
                                  step="0.0001"
                                  value={editForm.quantity ?? (tx.quantity !== null ? Math.abs(tx.quantity) : '')}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, quantity: e.target.value }))}
                                  style={{ width: '100%', fontSize: '12px', textAlign: 'right' }}
                                />
                              ) : tx.type !== 'DIVIDEND' ? (
                                formatQuantity(Math.abs(tx.quantity || 0))
                              ) : (
                                '-'
                              )}
                            </td>
                            <td style={{textAlign: 'right'}}>
                              {isEditing && tx.type !== 'DIVIDEND' ? (
                                <input
                                  type="number"
                                  step="0.00001"
                                  value={editForm.price ?? (tx.price ?? '')}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, price: e.target.value }))}
                                  style={{ width: '100%', fontSize: '12px', textAlign: 'right' }}
                                />
                              ) : tx.price !== null && tx.type !== 'DIVIDEND' ? (
                                formatCurrency(tx.price, tx.currency)
                              ) : (
                                '-'
                              )}
                            </td>
                            <td style={{textAlign: 'right'}}>
                              {isEditing && tx.type !== 'DIVIDEND' ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editForm.commission ?? (tx.commission ?? '')}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, commission: e.target.value }))}
                                  style={{ width: '100%', fontSize: '12px', textAlign: 'right' }}
                                />
                              ) : tx.commission !== null && tx.type !== 'DIVIDEND' ? (
                                formatCurrency(tx.commission, tx.currency)
                              ) : (
                                '-'
                              )}
                            </td>
                            <td style={{textAlign: 'right', fontWeight: 700}}>
                              {isEditing && tx.type === 'DIVIDEND' ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editForm.dividendAmount ?? (tx.dividend_amount ?? '')}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, dividendAmount: e.target.value }))}
                                  style={{ width: '100%', fontSize: '12px', textAlign: 'right' }}
                                />
                              ) : (
                                formatCurrency(totalValue, tx.currency)
                              )}
                            </td>
                            <td className="notes-cell">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editForm.notes ?? (tx.notes ?? '')}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                                  placeholder="Optional"
                                  style={{ width: '100%', fontSize: '12px' }}
                                />
                              ) : (
                                tx.notes || '-'
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