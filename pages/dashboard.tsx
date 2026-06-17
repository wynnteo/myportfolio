import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart as RechartsPieChart, Pie,
} from 'recharts';
import { fetchWithAuth } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  thisYearDividends: number;
  dividendYield: number | null;
}

interface QuoteResponse {
  symbol: string;
  currency: string | null;
  price: number;
  asOf: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BROKERS = ['Moo Moo', 'CMC Invest', 'OCBC', 'DBS', 'HSBC', 'Longbridge', 'POEMS', 'FSMOne', 'IBKR', 'Other'];
const CATEGORIES = ['Unit Trusts', 'Stocks', 'ETF', 'Bond', 'Cash', 'Crypto', 'Other'];
const CURRENCIES = ['SGD', 'USD', 'MYR'];
const ITEMS_PER_PAGE = 10;

const CATEGORY_COLORS: Record<string, string> = {
  'Unit Trusts': '#64acdb',
  Stocks: '#f8c268',
  ETF: '#6fd2df',
  Bond: '#f4609f',
  Cash: '#fa9228',
  Crypto: '#8b5cf6',
  Other: '#94a3b8',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value: number | null, currency = 'SGD', decimals = 2): string {
  if (value === null || isNaN(value)) return '—';
  return new Intl.NumberFormat('en-SG', {
    style: 'currency', currency,
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(value);
}

function fmtQty(value: number | null): string {
  if (value === null || isNaN(value)) return '—';
  return value === Math.floor(value) ? value.toString() : value.toFixed(4).replace(/\.?0+$/, '');
}

function fmtNum(value: number | null, decimals = 5): string {
  if (value === null || isNaN(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function getHoldingKey(symbol: string, broker: string) {
  return `${broker || 'Unknown'}__${symbol}`;
}

function getCategoryColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? '#64748b';
}

function formatLastUpdate(date: Date | null): string {
  if (!date) return 'Never';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleString('en-SG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Small UI components ──────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color, highlight }: {
  label: string; value: string; sub?: string; color?: string; highlight?: 'profit' | 'loss';
}) {
  const bg = highlight === 'profit' ? '#f0fdf4' : highlight === 'loss' ? '#fef2f2' : '#fff';
  const border = highlight === 'profit' ? '#86efac' : highlight === 'loss' ? '#fca5a5' : '#e2e8f0';
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: '16px 20px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? '#0f172a', marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#64748b' }}>{sub}</div>}
    </div>
  );
}

function AlertBox({ type, icon, title, body }: {
  type: 'warn' | 'good' | 'info'; icon: string; title: string; body: string;
}) {
  const s = {
    warn: { bg: '#FAEEDA', border: '#EF9F27', color: '#633806' },
    good: { bg: '#EAF3DE', border: '#639922', color: '#27500A' },
    info: { bg: '#E6F1FB', border: '#85B7EB', color: '#0C447C' },
  }[type];
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10 }}>
      <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: s.color, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 12, color: s.color, lineHeight: 1.5, opacity: 0.9 }}>{body}</div>
      </div>
    </div>
  );
}

// ─── Add Transaction Form ─────────────────────────────────────────────────────

function AddTransactionForm({ onAdded, uniqueSymbols, uniqueProducts }: {
  onAdded: () => void;
  uniqueSymbols: string[];
  uniqueProducts: string[];
}) {
  const [collapsed, setCollapsed] = useState(true);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const type = fd.get('type')?.toString() as Transaction['type'];
    const payload = {
      symbol: fd.get('symbol')?.toString().trim(),
      productName: fd.get('productName')?.toString().trim(),
      category: fd.get('category')?.toString(),
      broker: fd.get('broker')?.toString(),
      currency: fd.get('currency')?.toString(),
      type,
      quantity: fd.get('quantity') ? Number(fd.get('quantity')) : undefined,
      price: fd.get('price') ? Number(fd.get('price')) : undefined,
      commission: fd.get('commission') ? Number(fd.get('commission')) : 0,
      dividendAmount: fd.get('dividendAmount') ? Number(fd.get('dividendAmount')) : undefined,
      tradeDate: fd.get('tradeDate')?.toString(),
      notes: fd.get('notes')?.toString(),
    };
    const res = await fetchWithAuth('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (res.ok) { form.reset(); setCollapsed(true); onAdded(); }
    else { const err = await res.json().catch(() => ({})); alert(`Failed: ${(err as any)?.error ?? 'Unknown'}`); }
  }

  return (
    <section style={{ marginBottom: 20 }}>
      <div className="section-title">
        <div><p className="eyebrow">Journal</p><h2>Add Transaction</h2></div>
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #cbd5e1', background: collapsed ? '#00257c' : '#fff', color: collapsed ? '#fff' : '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
          {collapsed ? '+ Add Transaction' : '✕ Cancel'}
        </button>
      </div>

      {!collapsed && (
        <form onSubmit={e => void handleSubmit(e)} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20 }}>
          <AddFormFields uniqueSymbols={uniqueSymbols} uniqueProducts={uniqueProducts} loading={loading} />
        </form>
      )}
    </section>
  );
}

function AddFormFields({ uniqueSymbols, uniqueProducts, loading }: {
  uniqueSymbols: string[]; uniqueProducts: string[]; loading: boolean;
}) {
  const [txType, setTxType] = useState<'BUY' | 'SELL' | 'DIVIDEND'>('BUY');
  const isDividend = txType === 'DIVIDEND';

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Type *
          <select name="type" value={txType} onChange={e => setTxType(e.target.value as any)} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }}>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
            <option value="DIVIDEND">DIVIDEND</option>
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Symbol *
          <input name="symbol" type="text" required placeholder="e.g. M44U" list="sym-list" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
          <datalist id="sym-list">{uniqueSymbols.map(s => <option key={s} value={s} />)}</datalist>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Product Name
          <input name="productName" type="text" placeholder="Full fund / stock name" list="prod-list" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
          <datalist id="prod-list">{uniqueProducts.map(p => <option key={p} value={p} />)}</datalist>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Category
          <select name="category" defaultValue="Stocks" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {!isDividend && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Broker
            <select name="broker" defaultValue="Moo Moo" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }}>
              {BROKERS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Currency
          <select name="currency" defaultValue="SGD" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {!isDividend && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
              Quantity *
              <input name="quantity" type="number" step="0.00001" min="0" required style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
              Price *
              <input name="price" type="number" step="0.00001" min="0" required style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
              Commission
              <input name="commission" type="number" step="0.01" min="0" defaultValue={0} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
            </label>
          </>
        )}
        {isDividend && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Dividend Amount *
            <input name="dividendAmount" type="number" step="0.01" min="0" required style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
          </label>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Trade Date
          <input name="tradeDate" type="date" defaultValue={new Date().toISOString().split('T')[0]} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Notes
          <input name="notes" type="text" placeholder="Optional" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
        </label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
        <button type="submit" disabled={loading}
          style={{ padding: '10px 28px', background: '#00257c', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Adding...' : 'Add Transaction'}
        </button>
      </div>
    </>
  );
}

// ─── Holdings Modal ───────────────────────────────────────────────────────────

function HoldingModal({ holding, transactions, onClose, onReload }: {
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

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteResponse>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [priceLoadingSymbols, setPriceLoadingSymbols] = useState<Set<string>>(new Set());
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);
  const [statusText, setStatusText] = useState('Connecting...');
  const [statusTone, setStatusTone] = useState<'info' | 'success' | 'error'>('info');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [brokerFilter, setBrokerFilter] = useState('All');
  const [currencyFilter, setCurrencyFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [selectedHoldingKey, setSelectedHoldingKey] = useState<string | null>(null);
  const [dividendYear, setDividendYear] = useState(new Date().getFullYear());
  const [showDivModal, setShowDivModal] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) void loadTransactions();
  }, [user]);

  async function loadTransactions() {
    try {
      setLoadingData(true);
      setStatusText('Loading...');
      const res = await fetchWithAuth('/api/transactions');
      if (!res.ok) { setStatusText('Failed to load data'); setStatusTone('error'); return; }
      setTransactions(await res.json());
      setStatusText('Connected');
      setStatusTone('success');
    } catch { setStatusText('Connection error'); setStatusTone('error'); }
    finally { setLoadingData(false); }
  }

  const currentYear = new Date().getFullYear();

  // ── Build holdings ──────────────────────────────────────────────────────────

  const allHoldings = useMemo(() => {
    const map = new Map<string, HoldingRow>();
    for (const tx of transactions) {
      const key = getHoldingKey(tx.symbol, tx.broker);
      const row = map.get(key) ?? {
        key, symbol: tx.symbol, productName: tx.product_name, category: tx.category,
        broker: tx.broker, currency: tx.currency, quantity: 0, averagePrice: 0,
        totalCost: 0, totalCommission: 0, dividends: 0, currentPrice: null,
        currentValue: null, pl: null, plPct: null, lastPriceTimestamp: -Infinity,
        thisYearDividends: 0, dividendYield: null,
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
      }
      if (tx.current_price !== null) {
        const ts = new Date(tx.trade_date ?? tx.created_at).getTime();
        if (ts >= row.lastPriceTimestamp) { row.currentPrice = tx.current_price; row.lastPriceTimestamp = ts; }
      }
      if (tx.product_name) row.productName = tx.product_name;
      map.set(key, row);
    }
    map.forEach(row => {
      if (row.quantity > 0.0001) row.averagePrice = row.totalCost / row.quantity;
      if (row.currentPrice !== null) {
        row.currentValue = row.currentPrice * row.quantity;
        row.pl = row.currentValue - row.totalCost;
        row.plPct = row.totalCost > 0 ? (row.pl / row.totalCost) * 100 : null;
        row.dividendYield = row.totalCost > 0 ? (row.thisYearDividends / row.totalCost) * 100 : null;
      }
    });
    return Array.from(map.values()).filter(r => r.quantity > 0.0001);
  }, [transactions, currentYear]);

  // ── Fetch quotes ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (allHoldings.length === 0) return;
    void fetchAllQuotes();
    const id = setInterval(() => void fetchAllQuotes(), 900000);
    return () => clearInterval(id);
  }, [allHoldings.length]);

  async function fetchAllQuotes() {
    const utSymbols = Array.from(new Set(allHoldings.filter(h => h.category === 'Unit Trusts').map(h => h.symbol)));
    const otherSymbols = Array.from(new Set(allHoldings.filter(h => h.category !== 'Unit Trusts').map(h => h.symbol)));
    const allSymbols = [...utSymbols, ...otherSymbols];

    setLoadingPrices(true);
    setPriceLoadingSymbols(new Set(allSymbols));
    const next: Record<string, any> = {};

    await Promise.all(utSymbols.map(async sym => {
      const h = allHoldings.find(x => x.symbol === sym);
      try {
        const r = await fetch(`/api/fund-quote?s=${encodeURIComponent(sym.includes(':') ? sym : sym + ':SGD')}&name=${encodeURIComponent(h?.productName ?? '')}`);
        if (!r.ok) return;
        const j = await r.json();
        if (typeof j.price === 'number') next[sym] = { price: j.price, asOf: j.lastUpdated ?? null };
      } catch {}
      finally { setPriceLoadingSymbols(p => { const s = new Set(p); s.delete(sym); return s; }); }
    }));

    await Promise.all(otherSymbols.map(async sym => {
      try {
        const r = await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`);
        if (!r.ok) return;
        next[sym] = await r.json();
      } catch {}
      finally { setPriceLoadingSymbols(p => { const s = new Set(p); s.delete(sym); return s; }); }
    }));

    setQuotes(prev => ({ ...prev, ...next }));
    setLastPriceUpdate(new Date());
    setLoadingPrices(false);
  }

  // ── Enrich holdings with live prices ───────────────────────────────────────

  const displayHoldings = useMemo(() => {
    return allHoldings.map(row => {
      const q = quotes[row.symbol];
      const cp = q?.price ?? row.currentPrice;
      const cv = cp !== null ? cp * row.quantity : null;
      const pl = cv !== null ? cv - row.totalCost : null;
      const plPct = pl !== null && row.totalCost > 0 ? (pl / row.totalCost) * 100 : null;
      const divYield = row.totalCost > 0 && row.thisYearDividends > 0 ? (row.thisYearDividends / row.totalCost) * 100 : null;
      return { ...row, currentPrice: cp, currentValue: cv, pl, plPct, dividendYield: divYield };
    });
  }, [allHoldings, quotes]);

  // ── Filtered holdings ───────────────────────────────────────────────────────

  const filteredHoldings = useMemo(() => {
    return displayHoldings.filter(h =>
      (categoryFilter === 'All' || h.category === categoryFilter) &&
      (brokerFilter === 'All' || h.broker === brokerFilter) &&
      (currencyFilter === 'All' || h.currency === currencyFilter)
    );
  }, [displayHoldings, categoryFilter, brokerFilter, currencyFilter]);

  // ── Sort ────────────────────────────────────────────────────────────────────

  const sortedHoldings = useMemo(() => {
    if (!sortField) return filteredHoldings;
    return [...filteredHoldings].sort((a, b) => {
      const av = (a as any)[sortField], bv = (b as any)[sortField];
      if (av === null) return 1; if (bv === null) return -1;
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [filteredHoldings, sortField, sortDir]);

  const totalPages = Math.ceil(sortedHoldings.length / ITEMS_PER_PAGE);
  const pagedHoldings = sortedHoldings.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  function handleSort(field: string) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
    setPage(1);
  }

  // ── Portfolio totals ────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const capital = displayHoldings.reduce((s, h) => s + h.totalCost, 0);
    const marketValue = displayHoldings.filter(h => h.currentValue !== null).reduce((s, h) => s + (h.currentValue ?? 0), 0);
    const unrealisedPL = displayHoldings.filter(h => h.pl !== null).reduce((s, h) => s + (h.pl ?? 0), 0);
    const unrealisedPct = capital > 0 ? (unrealisedPL / capital) * 100 : 0;
    const ytdDividends = transactions.filter(tx => tx.type === 'DIVIDEND' && tx.trade_date && new Date(tx.trade_date).getFullYear() === dividendYear).reduce((s, tx) => s + (tx.dividend_amount ?? 0), 0);
    const allTimeDividends = transactions.filter(tx => tx.type === 'DIVIDEND').reduce((s, tx) => s + (tx.dividend_amount ?? 0), 0);
    const ytdYield = capital > 0 ? (ytdDividends / capital) * 100 : 0;
    return { capital, marketValue, unrealisedPL, unrealisedPct, ytdDividends, allTimeDividends, ytdYield };
  }, [displayHoldings, transactions, dividendYear]);

  // ── Allocation ──────────────────────────────────────────────────────────────

  const allocationData = useMemo(() => {
    const byCat = new Map<string, number>();
    displayHoldings.forEach(h => byCat.set(h.category, (byCat.get(h.category) ?? 0) + h.totalCost));
    const total = Array.from(byCat.values()).reduce((s, v) => s + v, 0);
    return Array.from(byCat.entries()).map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 })).sort((a, b) => b.value - a.value);
  }, [displayHoldings]);

  // ── Monthly dividends for chart ─────────────────────────────────────────────

  const monthlyDivData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data = months.map(m => ({ month: m, value: 0 }));
    transactions.filter(tx => tx.type === 'DIVIDEND' && tx.trade_date && new Date(tx.trade_date).getFullYear() === dividendYear)
      .forEach(tx => { data[new Date(tx.trade_date!).getMonth()].value += tx.dividend_amount ?? 0; });
    return data;
  }, [transactions, dividendYear]);

  // ── Category breakdown ──────────────────────────────────────────────────────

  const categoryBreakdowns = useMemo(() => {
    return CATEGORIES.map(cat => {
      const hs = displayHoldings.filter(h => h.category === cat);
      if (hs.length === 0) return null;
      const capital = hs.reduce((s, h) => s + h.totalCost, 0);
      const currentValue = hs.filter(h => h.currentValue !== null).reduce((s, h) => s + (h.currentValue ?? 0), 0);
      const pl = currentValue - capital;
      const plPct = capital > 0 ? (pl / capital) * 100 : 0;
      const ytdDiv = transactions.filter(tx => tx.type === 'DIVIDEND' && tx.category === cat && tx.trade_date && new Date(tx.trade_date).getFullYear() === dividendYear).reduce((s, tx) => s + (tx.dividend_amount ?? 0), 0);
      const divYield = capital > 0 ? (ytdDiv / capital) * 100 : 0;
      const best = hs.filter(h => h.plPct !== null).sort((a, b) => (b.plPct ?? 0) - (a.plPct ?? 0))[0] ?? null;
      const worst = hs.filter(h => h.plPct !== null).sort((a, b) => (a.plPct ?? 0) - (b.plPct ?? 0))[0] ?? null;
      return { category: cat, capital, currentValue, pl, plPct, ytdDiv, divYield, count: hs.length, best, worst };
    }).filter((item) => item !== null);
  }, [displayHoldings, transactions, dividendYear]);

  // ── Alerts ──────────────────────────────────────────────────────────────────

  const alerts = useMemo(() => {
    const list: { type: 'warn' | 'good' | 'info'; icon: string; title: string; body: string }[] = [];
    const top = allocationData[0];
    if (top && top.pct >= 50) list.push({ type: 'warn', icon: '⚠️', title: 'Concentration risk', body: `${top.name} is ${top.pct.toFixed(0)}% of your portfolio. One bad quarter there drags everything.` });
    if (totals.unrealisedPL > 0) list.push({ type: 'good', icon: '✅', title: 'Sitting on gains', body: `You have ${fmt(totals.unrealisedPL)} unrealised gains. Consider whether it's time to lock in any profits.` });
    const lastYearDiv = transactions.filter(tx => tx.type === 'DIVIDEND' && tx.trade_date && new Date(tx.trade_date).getFullYear() === currentYear - 1).reduce((s, tx) => s + (tx.dividend_amount ?? 0), 0);
    if (lastYearDiv > 0 && totals.ytdDividends > lastYearDiv) list.push({ type: 'good', icon: '💰', title: 'Dividend growing', body: `YTD dividends (${fmt(totals.ytdDividends)}) are already ahead of full-year ${currentYear - 1} (${fmt(lastYearDiv)}). Great trajectory!` });
    return list;
  }, [allocationData, totals, transactions, currentYear]);

  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  const selectedHolding = useMemo(() => displayHoldings.find(h => h.key === selectedHoldingKey) ?? null, [displayHoldings, selectedHoldingKey]);
  const uniqueSymbols = useMemo(() => Array.from(new Set(transactions.map(t => t.symbol))).sort(), [transactions]);
  const uniqueProducts = useMemo(() => Array.from(new Set(transactions.map(t => t.product_name).filter(Boolean))).sort(), [transactions]);

  if (authLoading || loadingData) {
    return (
      <>
        <header className="site-header"><nav className="site-nav"><Link href="/" className="site-logo">📊 Portfolio Tracker</Link></nav></header>
        <main><div className="loading-state">Loading dashboard...</div></main>
      </>
    );
  }

  return (
    <>
      <header className="site-header">
        <nav className="site-nav">
          <Link href="/" className="site-logo">📊 Portfolio Tracker</Link>
          <div className="nav-menu">
            <Link href="/">Home</Link>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/transactions">Transactions</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/bills">Bills</Link>
            <Link href="/watchlist">Watchlist</Link>
            <Link href="/insights">Insights</Link>
            <Link href="/calculator">Calculator</Link>
            <Link href="/referrals">Referrals</Link>
            <button onClick={() => void logout()}>Logout</button>
          </div>
        </nav>
      </header>

      <main>
        {/* ── Top bar ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #e5e5e5', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: '0 0 4px' }}>Portfolio Dashboard</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Track your holdings, performance, and income at a glance</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="badge" data-tone={statusTone}>{statusText}</span>
            {(loadingPrices || lastPriceUpdate) && (
              <div className="price-update-info">
                {loadingPrices && priceLoadingSymbols.size > 0 ? (
                  <span className="update-time loading"><span className="loading-spinner" />{priceLoadingSymbols.size} remaining</span>
                ) : lastPriceUpdate ? (
                  <span className="update-time">Prices: {formatLastUpdate(lastPriceUpdate)}</span>
                ) : null}
                <button className="refresh-btn" onClick={() => void fetchAllQuotes()} disabled={loadingPrices} title="Refresh prices">
                  <span className={`refresh-icon ${loadingPrices ? 'spinning' : ''}`}>↻</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Section 1: Summary cards ── */}
        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">Overview</p><h2>Portfolio snapshot</h2></div>
            <div className="chip-group">
              <span className="chip">{displayHoldings.length} holdings</span>
              <span className="chip">{transactions.length} transactions</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
            <MetricCard label="Total invested" value={fmt(totals.capital)} sub={`${displayHoldings.length} holdings`} />
            <MetricCard label="Market value" value={totals.marketValue > 0 ? fmt(totals.marketValue) : '—'} sub={`${Object.keys(quotes).length} live prices`} />
            <MetricCard
              label="Unrealised P/L"
              value={totals.marketValue > 0 ? fmt(totals.unrealisedPL) : '—'}
              sub={totals.marketValue > 0 ? `${totals.unrealisedPct > 0 ? '+' : ''}${totals.unrealisedPct.toFixed(2)}%` : 'Awaiting prices'}
              color={totals.unrealisedPL >= 0 ? '#059669' : '#dc2626'}
              highlight={totals.unrealisedPL >= 0 ? 'profit' : 'loss'}
            />
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>Dividends</div>
                <select value={dividendYear} onChange={e => setDividendYear(Number(e.target.value))}
                  style={{ padding: '2px 8px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff', fontWeight: 600 }}>
                  {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginBottom: 4 }}>{fmt(totals.ytdDividends)}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{totals.ytdYield > 0 ? `${totals.ytdYield.toFixed(2)}% yield · ` : ''}All-time: {fmt(totals.allTimeDividends)}</div>
            </div>
          </div>

          {/* Alert signals */}
          {alerts.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, marginBottom: 16 }}>
              {alerts.map((a, i) => <AlertBox key={i} {...a} />)}
            </div>
          )}

          {/* Charts */}
          <div className="chart-grid-two-col">
            {/* Allocation donut */}
            <div className="chart-card">
              <div className="chart-header">Allocation by asset class</div>
              {allocationData.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#94a3b8', fontWeight: 600 }}>No data</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={180}>
                    <RechartsPieChart>
                      <Pie data={allocationData} cx="50%" cy="50%" outerRadius={75} dataKey="value" labelLine={false}>
                        {allocationData.map((entry, i) => <Cell key={i} fill={getCategoryColor(entry.name)} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                  <div className="stacked-legend">
                    {allocationData.map((d, i) => (
                      <div key={i} className="legend-item">
                        <span className="legend-swatch" style={{ background: getCategoryColor(d.name) }} />
                        <div className="legend-text">
                          <span className="legend-name">{d.name}</span>
                          <span className="legend-value">{d.pct.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Monthly dividends */}
            <div className="chart-card">
              <div className="chart-header-with-action">
                <span>Monthly Dividends ({dividendYear})</span>
                <button className="chart-action-btn" onClick={() => setShowDivModal(true)}>View Details</button>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyDivData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#64748b" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#64748b" />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }} />
                  <Bar dataKey="value" fill="#378ADD" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* ── Section 2: Category breakdown ── */}
        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">By Asset Class</p><h2>Category breakdown</h2></div></div>
          <div className="category-grid">
            {(categoryBreakdowns as any[]).map((bd: any) => {
              const catHoldings = displayHoldings.filter(h => h.category === bd.category);
              const total = catHoldings.reduce((s, h) => s + h.totalCost, 0);
              const pieData = catHoldings.map(h => ({ name: h.symbol, product: h.productName, value: h.totalCost, total })).sort((a, b) => b.value - a.value);
              const COLORS = ['#64acdb', '#f8c268', '#b57edc', '#6fd2df', '#f4609f', '#fa9228', '#d38278', '#51c9b2'];

              return (
                <div key={bd.category} className="category-compact-card">
                  <div className="category-compact-header">
                    <span className="category-dot-inline" style={{ backgroundColor: getCategoryColor(bd.category) }} />
                    <span className="category-compact-title">{bd.category}</span>
                    <span className="category-compact-count">{bd.count}</span>
                  </div>
                  {pieData.length > 0 && (
                    <div className="category-mini-chart">
                      <ResponsiveContainer width="100%" height={110}>
                        <RechartsPieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={22} outerRadius={42} paddingAngle={2} dataKey="value">
                            {pieData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 11, padding: '4px 8px' }} />
                        </RechartsPieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="category-compact-stats">
                    <div className="category-stat-row"><span className="category-stat-label">Capital</span><span className="category-stat-value">{fmt(bd.capital)}</span></div>
                    <div className="category-stat-row"><span className="category-stat-label">Market value</span><span className="category-stat-value">{bd.currentValue > 0 ? fmt(bd.currentValue) : '—'}</span></div>
                    <div className={`category-stat-row highlight ${bd.pl > 0 ? 'positive' : bd.pl < 0 ? 'negative' : ''}`}>
                      <span className="category-stat-label">Unrealised P/L</span>
                      <span className="category-stat-value-large">
                        {bd.currentValue > 0 ? fmt(bd.pl) : '—'}
                        {bd.currentValue > 0 && <span className="category-stat-pct">{bd.plPct > 0 ? '+' : ''}{bd.plPct.toFixed(2)}%</span>}
                      </span>
                    </div>
                    <div className="category-stat-row">
                      <span className="category-stat-label">Dividends {dividendYear}</span>
                      <span className="category-stat-value">
                        {bd.ytdDiv > 0 ? fmt(bd.ytdDiv) : '—'}
                        {bd.divYield > 0 && <span className="stat-yield-badge" style={{ marginLeft: 6 }}>{bd.divYield.toFixed(2)}%</span>}
                      </span>
                    </div>
                  </div>
                  {(bd.best || bd.worst) && (
                    <div className="category-performers">
                      {bd.best && bd.best.plPct !== null && bd.best.plPct > 0 && (
                        <div className="category-performer positive">
                          <span className="performer-icon">↑</span>
                          <div className="performer-info"><div className="performer-symbol">{bd.best.symbol}</div><div className="performer-product">{bd.best.productName}</div></div>
                          <span className="performer-value">+{bd.best.plPct.toFixed(1)}%</span>
                        </div>
                      )}
                      {bd.worst && bd.worst.plPct !== null && bd.worst.plPct < 0 && (
                        <div className="category-performer negative">
                          <span className="performer-icon">↓</span>
                          <div className="performer-info"><div className="performer-symbol">{bd.worst.symbol}</div><div className="performer-product">{bd.worst.productName}</div></div>
                          <span className="performer-value">{bd.worst.plPct.toFixed(1)}%</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Section 3: Add Transaction (collapsible) ── */}
        <AddTransactionForm onAdded={() => void loadTransactions()} uniqueSymbols={uniqueSymbols} uniqueProducts={uniqueProducts} />

        {/* ── Section 4: Holdings table ── */}
        <section>
          <div className="section-title" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div><p className="eyebrow">Positions</p><h2>Holdings</h2></div>
            <div className="holdings-controls">
              <div className="view-toggle">
                <button className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => setViewMode('grid')}>◫</button>
                <button className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>☰</button>
              </div>
              <div className="filters">
                <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}>
                  <option value="All">All categories</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={brokerFilter} onChange={e => { setBrokerFilter(e.target.value); setPage(1); }}>
                  <option value="All">All brokers</option>
                  {BROKERS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <select value={currencyFilter} onChange={e => { setCurrencyFilter(e.target.value); setPage(1); }}>
                  <option value="All">All currencies</option>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {viewMode === 'table' ? (
            <div className="holdings-table-wrapper">
              <table className="holdings-table">
                <thead>
                  <tr>
                    {[
                      { key: 'category', label: 'Category' },
                      { key: 'symbol', label: 'Symbol' },
                      { key: 'quantity', label: '#Units', right: true },
                      { key: 'totalCost', label: 'Capital', right: true },
                      { key: 'averagePrice', label: 'Avg Cost' },
                      { key: 'currentPrice', label: 'Live Price' },
                      { key: 'currentValue', label: 'Mkt Value', right: true },
                      { key: 'plPct', label: 'P/L', right: true },
                      { key: 'dividendYield', label: 'Div Yield', right: true },
                      { key: null, label: '' },
                    ].map(({ key, label, right }) => (
                      <th key={label} onClick={key ? () => handleSort(key) : undefined}
                        className={key ? 'sortable' : ''} style={{ textAlign: right ? 'right' : 'left' }}>
                        {label}{key && sortField === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedHoldings.map(row => {
                    const plClass = (row.pl ?? 0) > 0 ? 'positive' : (row.pl ?? 0) < 0 ? 'negative' : 'neutral';
                    return (
                      <tr key={row.key}>
                        <td>
                          <div className="category-badge">
                            <span className="category-dot-small" style={{ backgroundColor: getCategoryColor(row.category) }} />
                            {row.category}
                          </div>
                        </td>
                        <td>
                          <div className="symbol-cell">
                            <div className="symbol-main">{row.productName || row.symbol}</div>
                            <div className="symbol-product">{row.symbol} · {row.broker}</div>
                          </div>
                        </td>
                        <td className="value-cell">{fmtQty(row.quantity)}</td>
                        <td className="value-cell">{fmt(row.totalCost, row.currency)}</td>
                        <td className="value-cell">{fmtNum(row.averagePrice)}</td>
                        <td className="value-cell">
                          {loadingPrices && priceLoadingSymbols.has(row.symbol)
                            ? <span style={{ fontSize: 11, color: '#94a3b8' }}>Loading...</span>
                            : fmtNum(row.currentPrice)}
                        </td>
                        <td className="value-cell">{row.currentValue !== null ? fmt(row.currentValue, row.currency) : '—'}</td>
                        <td className="pl-cell">
                          <div className={`pl-value ${plClass}`}>
                            <span className="pl-amount">{row.pl !== null ? fmt(row.pl, row.currency) : '—'}</span>
                            {row.plPct !== null && <span className="pl-percentage">{row.plPct > 0 ? '+' : ''}{row.plPct.toFixed(2)}%</span>}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {row.dividendYield !== null && row.dividendYield > 0
                            ? <span style={{ fontSize: 12, fontWeight: 700, color: '#059669', background: '#dcfce7', padding: '2px 7px', borderRadius: 4 }}>{row.dividendYield.toFixed(2)}%</span>
                            : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                        </td>
                        <td className="action-cell">
                          <button className="view-btn" onClick={() => setSelectedHoldingKey(row.key)}>View</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="holdings-grid">
              {pagedHoldings.map(row => {
                const plClass = (row.pl ?? 0) > 0 ? 'positive' : (row.pl ?? 0) < 0 ? 'negative' : 'neutral';
                return (
                  <div key={row.key} className="holding-card">
                    <div className="holding-card-header">
                      <div className="holding-card-title">
                        <span className="holding-symbol">{row.productName || row.symbol}</span>
                        <div className="category-badge-small"><span className="category-dot-small" style={{ backgroundColor: getCategoryColor(row.category) }} /><span>{row.category}</span></div>
                      </div>
                      <div className="holding-product-name">{row.symbol} · {row.broker}</div>
                    </div>
                    <div className="holding-card-stats">
                      <div className="holding-stat-row"><span className="holding-stat-label">Units</span><span className="holding-stat-value">{fmtQty(row.quantity)}</span></div>
                      <div className="holding-stat-row"><span className="holding-stat-label">Avg price</span><span className="holding-stat-value">{fmtNum(row.averagePrice)}</span></div>
                      <div className="holding-stat-row"><span className="holding-stat-label">Live price</span><span className="holding-stat-value">{fmtNum(row.currentPrice)}</span></div>
                      {row.dividendYield !== null && row.dividendYield > 0 && (
                        <div className="holding-stat-row"><span className="holding-stat-label">Div yield</span><span style={{ fontSize: 12, fontWeight: 700, color: '#059669', background: '#dcfce7', padding: '2px 7px', borderRadius: 4 }}>{row.dividendYield.toFixed(2)}%</span></div>
                      )}
                    </div>
                    <div className="holding-card-values">
                      <div className="holding-value-item"><span className="holding-value-label">Capital</span><span className="holding-value-amount">{fmt(row.totalCost, row.currency)}</span></div>
                      <div className="holding-value-divider">→</div>
                      <div className="holding-value-item"><span className="holding-value-label">Current</span><span className="holding-value-amount">{row.currentValue !== null ? fmt(row.currentValue, row.currency) : '—'}</span></div>
                    </div>
                    <div className={`holding-card-pl ${plClass}`}>
                      <span className="holding-pl-amount">{row.pl !== null ? fmt(row.pl, row.currency) : '—'}</span>
                      {row.plPct !== null && <span className="holding-pl-pct">{row.plPct > 0 ? '+' : ''}{row.plPct.toFixed(2)}%</span>}
                    </div>
                    <button className="holding-card-btn" onClick={() => setSelectedHoldingKey(row.key)}>View Details</button>
                  </div>
                );
              })}
            </div>
          )}

          {totalPages > 1 && (
            <div className="pagination-controls">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</button>
              <span style={{ fontSize: 13, color: '#64748b' }}>Page {page} of {totalPages} · {sortedHoldings.length} holdings</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</button>
            </div>
          )}
        </section>

        {/* ── Dividend details modal ── */}
        {showDivModal && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal">
              <div className="modal-header">
                <div>
                  <div className="modal-title">Dividend Transactions — {dividendYear}</div>
                  <div className="modal-meta">
                    <span>Total: {fmt(totals.ytdDividends)}</span>
                    <span>{transactions.filter(tx => tx.type === 'DIVIDEND' && tx.trade_date && new Date(tx.trade_date).getFullYear() === dividendYear).length} transactions</span>
                  </div>
                </div>
                <button className="ghost" onClick={() => setShowDivModal(false)}>Close</button>
              </div>
              <div className="table-wrapper">
                <table className="modal-transaction-table">
                  <thead><tr><th>Date</th><th>Symbol</th><th>Product</th><th>Broker</th><th>Amount</th><th>Notes</th></tr></thead>
                  <tbody>
                    {transactions.filter(tx => tx.type === 'DIVIDEND' && tx.trade_date && new Date(tx.trade_date).getFullYear() === dividendYear)
                      .sort((a, b) => new Date(b.trade_date!).getTime() - new Date(a.trade_date!).getTime())
                      .map(tx => (
                        <tr key={tx.id}>
                          <td>{tx.trade_date}</td>
                          <td style={{ fontWeight: 700 }}>{tx.symbol}</td>
                          <td style={{ fontSize: 12, color: '#64748b' }}>{tx.product_name || '—'}</td>
                          <td style={{ fontSize: 12 }}>{tx.broker}</td>
                          <td><span style={{ fontWeight: 700, color: '#059669' }}>{fmt(tx.dividend_amount, tx.currency)}</span></td>
                          <td style={{ fontSize: 12, color: '#64748b' }}>{tx.notes || '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Holding detail modal ── */}
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