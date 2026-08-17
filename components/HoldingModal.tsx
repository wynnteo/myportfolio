import { useState } from 'react';
import { fetchWithAuth } from '../lib/api';

// ─── Shared types ───────────────────────────────────────────────────────────

export interface Transaction {
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

export interface HoldingRow {
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
  thisYearDividends: number;
  lastYearDividends: number;
  dividendYield: number | null;
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

export function fmt(value: number | null, currency = 'SGD', decimals = 2): string {
  if (value === null || isNaN(value)) return '—';
  return new Intl.NumberFormat('en-SG', {
    style: 'currency', currency,
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(value);
}

export function fmtQty(value: number | null): string {
  if (value === null || isNaN(value)) return '—';
  return value === Math.floor(value) ? value.toString() : value.toFixed(4).replace(/\.?0+$/, '');
}

export function fmtNum(value: number | null, decimals = 5): string {
  if (value === null || isNaN(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function getHoldingKey(symbol: string, broker: string) {
  return `${broker || 'Unknown'}__${symbol}`;
}

// P/L tier for background highlighting: deeper color = bigger swing.
// >20% dark green · >10% green · >0% light green, mirrored for losses.
export function getPLTierClass(plPct: number | null): string {
  if (plPct === null || plPct === 0) return '';
  if (plPct > 0) {
    if (plPct > 20) return 'tier-gain-high';
    if (plPct > 10) return 'tier-gain-mid';
    return 'tier-gain-low';
  }
  if (plPct < -20) return 'tier-loss-high';
  if (plPct < -10) return 'tier-loss-mid';
  return 'tier-loss-low';
}

// True once lifetime dividends collected on a position cover its total cost basis.
export function isDividendBreakeven(row: Pick<HoldingRow, 'dividends' | 'totalCost'>): boolean {
  return row.totalCost > 0 && row.dividends >= row.totalCost;
}

// ─── Holdings Modal ───────────────────────────────────────────────────────────

export function HoldingModal({ holding, transactions, onClose, onReload }: {
  holding: HoldingRow;
  transactions: Transaction[];
  onClose: () => void;
  onReload: () => void;
}) {
  const [showAddTx, setShowAddTx] = useState(false);
  const [showAddDiv, setShowAddDiv] = useState(false);
  const [txForm, setTxForm] = useState({ type: 'BUY' as 'BUY' | 'SELL', quantity: '', price: '', commission: '', tradeDate: new Date().toISOString().split('T')[0], notes: '' });
  const [divForm, setDivForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], notes: '' });
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [msg, setMsg] = useState('');

  const txns = transactions.filter(tx => getHoldingKey(tx.symbol, tx.broker) === holding.key && tx.type !== 'DIVIDEND');
  const divs = transactions.filter(tx => getHoldingKey(tx.symbol, tx.broker) === holding.key && tx.type === 'DIVIDEND');

  async function addTx() {
    const payload = { symbol: holding.symbol, productName: holding.productName, category: holding.category, broker: holding.broker, currency: holding.currency, type: txForm.type, quantity: Number(txForm.quantity), price: Number(txForm.price), commission: Number(txForm.commission) || 0, tradeDate: txForm.tradeDate, notes: txForm.notes };
    const res = await fetchWithAuth('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) { setMsg('Transaction added.'); setShowAddTx(false); setTxForm({ type: 'BUY', quantity: '', price: '', commission: '', tradeDate: new Date().toISOString().split('T')[0], notes: '' }); onReload(); }
    else setMsg('Failed to add transaction');
  }

  async function addDiv() {
    const payload = { symbol: holding.symbol, productName: holding.productName, category: holding.category, broker: holding.broker, currency: holding.currency, type: 'DIVIDEND', dividendAmount: Number(divForm.amount), tradeDate: divForm.date, notes: divForm.notes };
    const res = await fetchWithAuth('/api/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) { setMsg('Dividend added.'); setShowAddDiv(false); setDivForm({ amount: '', date: new Date().toISOString().split('T')[0], notes: '' }); onReload(); }
    else setMsg('Failed to add dividend');
  }

  async function saveEdit() {
    const orig = transactions.find(t => t.id === editId);
    if (!orig) return;
    const payload: any = { id: editId, symbol: orig.symbol, productName: orig.product_name, category: orig.category, broker: orig.broker, currency: orig.currency, type: orig.type, tradeDate: editForm.tradeDate ?? orig.trade_date, notes: editForm.notes ?? orig.notes };
    if (orig.type === 'DIVIDEND') payload.dividendAmount = Number(editForm.dividendAmount ?? orig.dividend_amount);
    else { payload.quantity = Number(editForm.quantity ?? Math.abs(orig.quantity ?? 0)); payload.price = Number(editForm.price ?? orig.price); payload.commission = Number(editForm.commission ?? orig.commission ?? 0); }
    const res = await fetchWithAuth('/api/transactions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) { setMsg('Updated.'); setEditId(null); setEditForm({}); onReload(); }
    else setMsg('Failed to update');
  }

  async function deleteTx(id: string) {
    if (!confirm('Delete this transaction?')) return;
    await fetchWithAuth(`/api/transactions?id=${id}`, { method: 'DELETE' });
    setMsg('Deleted.'); onReload();
  }

  const plClass = (holding.pl ?? 0) > 0 ? 'positive' : (holding.pl ?? 0) < 0 ? 'negative' : '';

  // Total P/L after accounting for all dividends collected (i.e. market value vs.
  // capital reduced by dividends received — equivalent to unrealised P/L + dividends)
  const totalPl = holding.pl !== null ? holding.pl + (holding.dividends ?? 0) : null;
  const totalPlClass = totalPl !== null ? (totalPl > 0 ? 'positive' : totalPl < 0 ? 'negative' : '') : '';
  const totalPlPct = totalPl !== null && holding.totalCost ? (totalPl / holding.totalCost) * 100 : null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal" style={{ width: 'min(960px, 90vw)', maxHeight: '85vh' }}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-title">{holding.symbol} · {holding.productName || '—'}</div>
            <div className="modal-meta">
              <span>Broker: {holding.broker}</span>
              <span>Currency: {holding.currency}</span>
              <span>Qty: {fmtQty(holding.quantity)}</span>
              <span>Avg cost: {fmtNum(holding.averagePrice)}</span>
              <span>Commission paid: {fmt(holding.totalCommission, holding.currency)}</span>
            </div>
          </div>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div><div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Capital</div><div style={{ fontWeight: 700, fontSize: 18 }}>{fmt(holding.totalCost, holding.currency)}</div></div>
              <div style={{ fontSize: 20, color: '#cbd5e1' }}>→</div>
              <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Market value</div><div style={{ fontWeight: 700, fontSize: 18 }}>{holding.currentValue !== null ? fmt(holding.currentValue, holding.currency) : '—'}</div></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#fff', borderRadius: 8, border: `1px solid ${plClass === 'positive' ? '#86efac' : plClass === 'negative' ? '#fca5a5' : '#e2e8f0'}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: plClass === 'positive' ? '#059669' : plClass === 'negative' ? '#dc2626' : '#64748b' }}>
                Unrealised P/L: {holding.pl !== null ? fmt(holding.pl, holding.currency) : '—'}
              </span>
              {holding.plPct !== null && (
                <span style={{ padding: '3px 10px', borderRadius: 6, fontWeight: 700, fontSize: 13, background: plClass === 'positive' ? '#059669' : plClass === 'negative' ? '#dc2626' : '#94a3b8', color: '#fff' }}>
                  {holding.plPct > 0 ? '+' : ''}{holding.plPct.toFixed(2)}%
                </span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#fff', borderRadius: 8, border: `1px solid ${totalPlClass === 'positive' ? '#86efac' : totalPlClass === 'negative' ? '#fca5a5' : '#e2e8f0'}`, marginTop: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: totalPlClass === 'positive' ? '#059669' : totalPlClass === 'negative' ? '#dc2626' : '#64748b' }}>
                Total P/L (incl. dividends): {totalPl !== null ? fmt(totalPl, holding.currency) : '—'}
              </span>
              {totalPlPct !== null && (
                <span style={{ padding: '3px 10px', borderRadius: 6, fontWeight: 700, fontSize: 13, background: totalPlClass === 'positive' ? '#059669' : totalPlClass === 'negative' ? '#dc2626' : '#94a3b8', color: '#fff' }}>
                  {totalPlPct > 0 ? '+' : ''}{totalPlPct.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>💰 Dividends</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div><div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>All-time</div><div style={{ fontWeight: 700, fontSize: 16, color: '#059669' }}>{fmt(holding.dividends, holding.currency)}</div></div>
              <div style={{ width: 1, background: '#e2e8f0' }} />
              <div><div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>YTD {new Date().getFullYear()}</div><div style={{ fontWeight: 700, fontSize: 16, color: '#059669' }}>{fmt(holding.thisYearDividends, holding.currency)}</div>
                {holding.dividendYield !== null && holding.dividendYield > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#059669', padding: '2px 7px', borderRadius: 4, display: 'inline-block', marginTop: 4 }}>{holding.dividendYield.toFixed(2)}% yield</span>
                )}</div>
              <div style={{ width: 1, background: '#e2e8f0' }} />
              <div><div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>{new Date().getFullYear() - 1}</div><div style={{ fontWeight: 700, fontSize: 16, color: '#059669' }}>{fmt(holding.lastYearDividends, holding.currency)}</div></div>
            </div>
          </div>
        </div>

        {msg && <div style={{ padding: '8px 14px', background: '#f0fdf4', color: '#166534', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600 }}>{msg}</div>}

        {/* Buy/Sell transactions */}
        <div className="modal-transactions-section">
          <div className="modal-section-header">
            <h3 className="modal-section-title">Buy / Sell Transactions</h3>
            <button className="add-dividend-btn" onClick={() => setShowAddTx(v => !v)}>{showAddTx ? 'Cancel' : '+ Add Transaction'}</button>
          </div>
          {showAddTx && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, padding: 14, background: '#f8fafc', borderRadius: 8, marginBottom: 14 }}>
              {(['type', 'quantity', 'price', 'commission', 'tradeDate', 'notes'] as const).map(field => (
                <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
                  {field === 'tradeDate' ? 'Date' : field === 'type' ? 'Type' : field.charAt(0).toUpperCase() + field.slice(1)}
                  {field === 'type' ? (
                    <select value={txForm.type} onChange={e => setTxForm(f => ({ ...f, type: e.target.value as any }))} style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }}>
                      <option value="BUY">BUY</option><option value="SELL">SELL</option>
                    </select>
                  ) : (
                    <input type={['quantity', 'price', 'commission'].includes(field) ? 'number' : field === 'tradeDate' ? 'date' : 'text'}
                      step="0.00001" value={(txForm as any)[field]} onChange={e => setTxForm(f => ({ ...f, [field]: e.target.value }))}
                      style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }} />
                  )}
                </label>
              ))}
              <button onClick={() => void addTx()} style={{ alignSelf: 'flex-end', padding: '8px 16px', background: '#00257c', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 12, height: 34 }}>Save</button>
            </div>
          )}
          {txns.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>No transactions yet</div>
          ) : (
            <div className="table-wrapper">
              <table className="modal-transaction-table">
                <thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Price</th><th>Commission</th><th>Notes</th><th className="actions-header">Actions</th></tr></thead>
                <tbody>
                  {txns.map(tx => {
                    const isEditing = editId === tx.id;
                    return (
                      <tr key={tx.id}>
                        <td>{isEditing ? <input type="date" value={editForm.tradeDate ?? tx.trade_date ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, tradeDate: e.target.value }))} /> : tx.trade_date ?? '—'}</td>
                        <td><span style={{ fontWeight: 700, color: tx.type === 'BUY' ? '#059669' : '#dc2626' }}>{tx.type}</span></td>
                        <td>{isEditing ? <input type="number" step="0.0001" value={editForm.quantity ?? Math.abs(tx.quantity ?? 0)} onChange={e => setEditForm((f: any) => ({ ...f, quantity: e.target.value }))} style={{ width: 80 }} /> : fmtQty(Math.abs(tx.quantity ?? 0))}</td>
                        <td>{isEditing ? <input type="number" step="0.00001" value={editForm.price ?? tx.price ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, price: e.target.value }))} style={{ width: 90 }} /> : fmtNum(tx.price)}</td>
                        <td>{isEditing ? <input type="number" step="0.01" value={editForm.commission ?? tx.commission ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, commission: e.target.value }))} style={{ width: 80 }} /> : fmt(tx.commission, holding.currency)}</td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>{isEditing ? <input type="text" value={editForm.notes ?? tx.notes ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} style={{ width: 120 }} /> : tx.notes || '—'}</td>
                        <td className="actions-cell">
                          {isEditing ? (
                            <div className="modal-action-buttons">
                              <button className="save-btn" onClick={() => void saveEdit()}>Save</button>
                              <button className="cancel-btn" onClick={() => { setEditId(null); setEditForm({}); }}>Cancel</button>
                            </div>
                          ) : (
                            <div className="modal-action-buttons">
                              <button className="edit-btn" onClick={() => { setEditId(tx.id); setEditForm({ quantity: Math.abs(tx.quantity ?? 0), price: tx.price, commission: tx.commission, tradeDate: tx.trade_date, notes: tx.notes }); }}>Edit</button>
                              <button className="delete-btn" onClick={() => void deleteTx(tx.id)}>Delete</button>
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

        {/* Dividend history */}
        <div className="dividend-history-section">
          <div className="modal-section-header">
            <h3 className="modal-section-title">Dividend History</h3>
            <button className="add-dividend-btn" onClick={() => setShowAddDiv(v => !v)}>{showAddDiv ? 'Cancel' : '+ Add Dividend'}</button>
          </div>
          {showAddDiv && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, padding: 14, background: '#f8fafc', borderRadius: 8, marginBottom: 14 }}>
              {[{ key: 'amount', label: `Amount (${holding.currency})`, type: 'number' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'notes', label: 'Notes', type: 'text' }].map(({ key, label, type }) => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600 }}>
                  {label}
                  <input type={type} step="0.01" value={(divForm as any)[key]} onChange={e => setDivForm(f => ({ ...f, [key]: e.target.value }))} style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12 }} />
                </label>
              ))}
              <button onClick={() => void addDiv()} style={{ alignSelf: 'flex-end', padding: '8px 16px', background: '#00257c', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 12, height: 34 }}>Save</button>
            </div>
          )}
          {divs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>No dividends recorded yet</div>
          ) : (
            <div className="table-wrapper">
              <table className="modal-transaction-table">
                <thead><tr><th>Date</th><th>Amount</th><th>Notes</th><th className="actions-header">Actions</th></tr></thead>
                <tbody>
                  {divs.map(tx => {
                    const isEditing = editId === tx.id;
                    return (
                      <tr key={tx.id}>
                        <td>{isEditing ? <input type="date" value={editForm.tradeDate ?? tx.trade_date ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, tradeDate: e.target.value }))} /> : tx.trade_date ?? '—'}</td>
                        <td>{isEditing ? <input type="number" step="0.01" value={editForm.dividendAmount ?? tx.dividend_amount ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, dividendAmount: e.target.value }))} style={{ width: 100 }} /> : <span style={{ fontWeight: 700, color: '#059669' }}>{fmt(tx.dividend_amount, holding.currency)}</span>}</td>
                        <td style={{ fontSize: 12, color: '#64748b' }}>{isEditing ? <input type="text" value={editForm.notes ?? tx.notes ?? ''} onChange={e => setEditForm((f: any) => ({ ...f, notes: e.target.value }))} style={{ width: 140 }} /> : tx.notes || '—'}</td>
                        <td className="actions-cell">
                          {isEditing ? (
                            <div className="modal-action-buttons">
                              <button className="save-btn" onClick={() => void saveEdit()}>Save</button>
                              <button className="cancel-btn" onClick={() => { setEditId(null); setEditForm({}); }}>Cancel</button>
                            </div>
                          ) : (
                            <div className="modal-action-buttons">
                              <button className="edit-btn" onClick={() => { setEditId(tx.id); setEditForm({ dividendAmount: tx.dividend_amount, tradeDate: tx.trade_date, notes: tx.notes }); }}>Edit</button>
                              <button className="delete-btn" onClick={() => void deleteTx(tx.id)}>Delete</button>
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
  );
}