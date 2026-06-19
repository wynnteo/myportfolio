import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useAuth } from '../lib/AuthContext';
import { fetchWithAuth } from '../lib/api';
import NavBar from '../components/NavBar';
import { AlertBox } from '../components/AlertBox';

// ─── Types ───────────────────────────────────────────────────────────────────

type AccountType =
  | 'Savings'
  | 'Investment'
  | 'Crypto'
  | 'Liability'
  | 'Property'
  | 'Cash'
  | 'eWallet'
  | 'Retirement'
  | 'Insurance'
  | 'Loan'
  | 'Credit Card'
  | 'Fixed Deposit'
  | 'Other';

interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  tags: string;
  currency: string;
  starting_balance: number;
  include_in_networth: number;
  created_at: string;
}

interface MonthlySnapshot {
  id: string;
  account_id: string;
  year: number;
  month: number;
  balance: number;
  note: string | null;
  updated_at: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCOUNT_TYPES: AccountType[] = [
  'Savings', 'Investment', 'Crypto', 'Liability', 'Property',
  'Cash', 'eWallet', 'Retirement', 'Insurance', 'Loan',
  'Credit Card', 'Fixed Deposit', 'Other',
];

const CURRENCIES = ['SGD', 'USD', 'MYR', 'EUR', 'GBP', 'JPY', 'AUD', 'CNY', 'HKD'];

const TYPE_COLORS: Record<AccountType, string> = {
  Savings: '#64acdb',
  Investment: '#f8c268',
  Crypto: '#8b5cf6',
  Liability: '#ef4444',
  Property: '#10b981',
  Cash: '#fa9228',
  eWallet: '#06b6d4',
  Retirement: '#3b82f6',
  Insurance: '#84cc16',
  Loan: '#f43f5e',
  'Credit Card': '#e11d48',
  'Fixed Deposit': '#0ea5e9',
  Other: '#94a3b8',
};

const LIABILITY_TYPES: AccountType[] = ['Liability', 'Loan', 'Credit Card'];
const ASSET_TYPES: AccountType[] = ['Savings', 'Investment', 'Crypto', 'Property', 'Cash', 'eWallet', 'Retirement', 'Insurance', 'Fixed Deposit', 'Other'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(value: number, currency = 'SGD') {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

function currentYM() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function ymKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getEffectiveBalance(
  snapMap: Record<string, MonthlySnapshot>,
  startingBalance: number,
  targetYear: number,
  targetMonth: number,
  currentYear: number,
  currentMonth: number
): number | null {
  if (targetYear > currentYear || (targetYear === currentYear && targetMonth > currentMonth)) return null;
  for (let m = targetMonth; m >= 1; m--) {
    const snap = snapMap[ymKey(targetYear, m)];
    if (snap) return snap.balance;
  }
  for (let y = targetYear - 1; y >= targetYear - 5; y--) {
    for (let m = 12; m >= 1; m--) {
      const snap = snapMap[ymKey(y, m)];
      if (snap) return snap.balance;
    }
  }
  return startingBalance;
}

async function apiAccounts(method: string, body?: object, id?: string) {
  const url = id ? `/api/accounts?id=${id}` : '/api/accounts';
  return fetchWithAuth(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function apiSnapshots(method: string, body?: object, id?: string) {
  const url = id ? `/api/account-snapshots?id=${id}` : '/api/account-snapshots';
  return fetchWithAuth(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: AccountType }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700,
      background: `${TYPE_COLORS[type]}22`, color: TYPE_COLORS[type],
      border: `1px solid ${TYPE_COLORS[type]}44`,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: TYPE_COLORS[type], display: 'inline-block' }} />
      {type}
    </span>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color, highlight }: {
  label: string; value: string; sub?: string; color?: string; highlight?: 'profit' | 'loss' | 'neutral';
}) {
  const bgMap = { profit: '#f0fdf4', loss: '#fef2f2', neutral: '#f8fafc' };
  const borderMap = { profit: '#86efac', loss: '#fca5a5', neutral: '#e2e8f0' };
  return (
    <div style={{
      background: highlight ? bgMap[highlight] : '#fff',
      border: `1px solid ${highlight ? borderMap[highlight] : '#e2e8f0'}`,
      borderRadius: 12, padding: '16px 20px',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color ?? '#0f172a', marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#64748b' }}>{sub}</div>}
    </div>
  );
}


// ─── Donut chart ─────────────────────────────────────────────────────────────

function NetWorthDonut({ data }: { data: { name: string; value: number; type: AccountType }[] }) {
  if (data.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180, color: '#94a3b8', fontWeight: 600, fontSize: 13 }}>No data yet</div>
  );
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" labelLine={false}>
          {data.map((entry, i) => <Cell key={i} fill={TYPE_COLORS[entry.type]} />)}
        </Pie>
        <Tooltip formatter={(v: number) => fmt(v)} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Account Form ─────────────────────────────────────────────────────────────

interface AccountFormProps {
  initial?: Partial<Account>;
  onSave: (data: Partial<Account>) => void;
  onCancel: () => void;
  loading?: boolean;
}

function AccountForm({ initial = {}, onSave, onCancel, loading }: AccountFormProps) {
  const [form, setForm] = useState({
    name: initial.name ?? '',
    type: (initial.type ?? 'Savings') as AccountType,
    tags: initial.tags ?? '',
    currency: initial.currency ?? 'SGD',
    starting_balance: initial.starting_balance?.toString() ?? '0',
    include_in_networth: initial.include_in_networth !== undefined ? !!initial.include_in_networth : true,
  });

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Account Name *
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. DBS Savings" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Type *
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as AccountType }))}
            style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }}>
            {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Currency
          <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
            style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Starting Balance
          <input type="number" step="0.01" value={form.starting_balance}
            onChange={e => setForm(f => ({ ...f, starting_balance: e.target.value }))}
            style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Tags (comma-separated)
          <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
            placeholder="e.g. bank, joint, SG"
            style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Include in Net Worth
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 6 }}>
            <input type="checkbox" checked={form.include_in_networth}
              onChange={e => setForm(f => ({ ...f, include_in_networth: e.target.checked }))}
              style={{ width: 18, height: 18, cursor: 'pointer' }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>
              {form.include_in_networth ? 'Yes, include' : 'No, exclude'}
            </span>
          </div>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          Cancel
        </button>
        <button
          onClick={() => onSave({ ...form, starting_balance: parseFloat(form.starting_balance) || 0, include_in_networth: form.include_in_networth ? 1 : 0 } as any)}
          disabled={loading || !form.name.trim()}
          style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#00257c', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Saving...' : 'Save Account'}
        </button>
      </div>
    </div>
  );
}

// ─── Snapshot Modal ───────────────────────────────────────────────────────────

interface SnapshotModalProps {
  account: Account;
  snapshots: MonthlySnapshot[];
  onClose: () => void;
  onSaved: () => void;
}

function SnapshotModal({ account, snapshots, onClose, onSaved }: SnapshotModalProps) {
  const { year: curYear, month: curMonth } = currentYM();
  const [selectedYear, setSelectedYear] = useState(curYear);
  const [balance, setBalance] = useState('');
  const [note, setNote] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(curMonth);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const snapMap = useMemo(() => {
    const m: Record<string, MonthlySnapshot> = {};
    snapshots.forEach(s => { m[ymKey(s.year, s.month)] = s; });
    return m;
  }, [snapshots]);

  useEffect(() => {
    const existing = snapMap[ymKey(selectedYear, selectedMonth)];
    if (existing) {
      setBalance(existing.balance.toString());
      setNote(existing.note ?? '');
    } else {
      let fallback = account.starting_balance;
      for (let m2 = selectedMonth - 1; m2 >= 1; m2--) {
        const prev = snapMap[ymKey(selectedYear, m2)];
        if (prev) { fallback = prev.balance; break; }
      }
      if (fallback === account.starting_balance) {
        for (let y = selectedYear - 1; y >= selectedYear - 5; y--) {
          let found = false;
          for (let m2 = 12; m2 >= 1; m2--) {
            const prev = snapMap[ymKey(y, m2)];
            if (prev) { fallback = prev.balance; found = true; break; }
          }
          if (found) break;
        }
      }
      setBalance(fallback.toString());
      setNote('');
    }
  }, [selectedYear, selectedMonth, snapMap, account.starting_balance]);

  async function handleSave() {
    setSaving(true); setMsg('');
    const body = { account_id: account.id, year: selectedYear, month: selectedMonth, balance: parseFloat(balance) || 0, note: note.trim() || null };
    const resp = await apiSnapshots('POST', body);
    setSaving(false);
    if (resp.ok) { setMsg('Saved!'); onSaved(); setTimeout(() => setMsg(''), 2000); }
    else setMsg('Failed to save');
  }

  async function handleDelete(snap: MonthlySnapshot) {
    if (!confirm('Delete this snapshot?')) return;
    await apiSnapshots('DELETE', undefined, snap.id);
    onSaved();
  }

  const chartData = useMemo(() => {
    const maxMonth = selectedYear === curYear ? curMonth : 12;
    const months: { label: string; balance: number }[] = [];
    for (let m = 1; m <= maxMonth; m++) {
      const bal = getEffectiveBalance(snapMap, account.starting_balance, selectedYear, m, curYear, curMonth);
      months.push({ label: MONTHS[m - 1], balance: bal ?? account.starting_balance });
    }
    return months;
  }, [snapMap, selectedYear, account.starting_balance, curYear, curMonth]);

  const years = [];
  for (let y = curYear; y >= curYear - 5; y--) years.push(y);

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 'min(900px, 92vw)', maxHeight: '85vh' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{account.name} — Monthly Snapshots</div>
            <div className="modal-meta">
              <TypeBadge type={account.type} />
              <span>{account.currency}</span>
              <span>Starting: {fmt(account.starting_balance, account.currency)}</span>
            </div>
          </div>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>

        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 20, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Balance Trend</span>
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13 }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmt(v, account.currency)} />
              <Bar dataKey="balance" fill={TYPE_COLORS[account.type]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: '#f0f9ff', borderRadius: 10, padding: 14, marginBottom: 20, border: '1px solid #bfdbfe' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1e40af', marginBottom: 12 }}>Update Monthly Balance</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, alignItems: 'end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 600 }}>
              Month
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }}>
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 600 }}>
              Balance ({account.currency})
              <input type="number" step="0.01" value={balance} onChange={e => setBalance(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, fontWeight: 600 }}>
              Note (optional)
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. after bonus"
                style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
            </label>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '9px 18px', borderRadius: 7, border: 'none', background: '#1e40af', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, height: 38, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : snapMap[ymKey(selectedYear, selectedMonth)] ? 'Update' : 'Save'}
            </button>
          </div>
          {msg && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: msg === 'Saved!' ? '#059669' : '#dc2626' }}>{msg}</div>}
        </div>

        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: '#0f172a' }}>All Snapshots ({selectedYear})</div>
        <div className="table-wrapper">
          <table className="modal-transaction-table">
            <thead>
              <tr>
                <th>Month</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
                <th>Note</th>
                <th>Updated</th>
                <th className="actions-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((label, idx) => {
                const m = idx + 1;
                const snap = snapMap[ymKey(selectedYear, m)];
                const isCurrent = m === curMonth && selectedYear === curYear;
                const isFuture = selectedYear > curYear || (selectedYear === curYear && m > curMonth);
                const displayBalance = isFuture ? null : getEffectiveBalance(snapMap, account.starting_balance, selectedYear, m, curYear, curMonth);
                const isCarryForward = !snap && displayBalance !== null && !isFuture;
                return (
                  <tr key={m} style={{ background: isCurrent ? '#f0f9ff' : isFuture ? '#fafafa' : 'transparent' }}>
                    <td>
                      <span style={{ fontWeight: isCurrent ? 700 : 500, color: isFuture ? '#cbd5e1' : 'inherit' }}>
                        {label} {selectedYear}
                        {isCurrent && <span style={{ marginLeft: 6, fontSize: 10, background: '#1e40af', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>Current</span>}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: snap ? '#0f172a' : isCarryForward ? '#94a3b8' : '#e2e8f0', fontStyle: isCarryForward ? 'italic' : 'normal' }}>
                      {isFuture ? <span style={{ color: '#e2e8f0' }}>—</span>
                        : displayBalance !== null ? <>{fmt(displayBalance, account.currency)}{isCarryForward && <span style={{ fontSize: 10, color: '#94a3b8', display: 'block' }}>carry-forward</span>}</> : '—'}
                    </td>
                    <td style={{ fontSize: 12, color: isFuture ? '#e2e8f0' : '#64748b' }}>{snap?.note || (isFuture ? '' : '—')}</td>
                    <td style={{ fontSize: 11, color: '#94a3b8' }}>{snap ? new Date(snap.updated_at).toLocaleDateString('en-SG') : '—'}</td>
                    <td className="actions-cell">
                      {snap && !isFuture && (
                        <div className="modal-action-buttons">
                          <button className="edit-btn" onClick={() => { setSelectedMonth(m); setBalance(snap.balance.toString()); setNote(snap.note ?? ''); }}>Edit</button>
                          <button className="delete-btn" onClick={() => void handleDelete(snap)}>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AccountsPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [snapshots, setSnapshots] = useState<MonthlySnapshot[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [filterCountry, setFilterCountry] = useState<'All' | 'SG' | 'MY'>('All');
  const [filterType, setFilterType] = useState<string>('All');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) void load();
  }, [user]);

  async function load() {
    setLoadingData(true);
    try {
      const [acRes, snRes] = await Promise.all([
        fetchWithAuth('/api/accounts'),
        fetchWithAuth('/api/account-snapshots'),
      ]);
      if (acRes.ok) setAccounts(await acRes.json());
      if (snRes.ok) setSnapshots(await snRes.json());
    } finally { setLoadingData(false); }
  }

  async function handleAddAccount(data: Partial<Account>) {
    setSavingAccount(true);
    const resp = await apiAccounts('POST', data);
    setSavingAccount(false);
    if (resp.ok) { setShowAddForm(false); setActionMsg('Account added!'); void load(); }
    else { const err = await resp.json().catch(() => ({})); setActionMsg((err as any).error ?? 'Failed'); }
    setTimeout(() => setActionMsg(''), 3000);
  }

  async function handleEditAccount(data: Partial<Account>) {
    if (!editingAccount) return;
    setSavingAccount(true);
    const resp = await apiAccounts('PUT', { ...data, id: editingAccount.id }, editingAccount.id);
    setSavingAccount(false);
    if (resp.ok) { setEditingAccount(null); setActionMsg('Account updated!'); void load(); }
    else { const err = await resp.json().catch(() => ({})); setActionMsg((err as any).error ?? 'Failed'); }
    setTimeout(() => setActionMsg(''), 3000);
  }

  async function handleDeleteAccount(id: string) {
    if (!confirm('Delete this account and all its snapshots?')) return;
    await apiAccounts('DELETE', undefined, id);
    void load();
  }

  const { year: curYear, month: curMonth } = currentYM();

  const accountSnapMaps = useMemo(() => {
    const maps: Record<string, Record<string, MonthlySnapshot>> = {};
    accounts.forEach(acc => { maps[acc.id] = {}; });
    snapshots.forEach(s => {
      if (!maps[s.account_id]) maps[s.account_id] = {};
      maps[s.account_id][ymKey(s.year, s.month)] = s;
    });
    return maps;
  }, [accounts, snapshots]);

  const accountCurrentBalances = useMemo(() => {
    const result: Record<string, number> = {};
    accounts.forEach(acc => {
      const snapMap = accountSnapMaps[acc.id] ?? {};
      const bal = getEffectiveBalance(snapMap, acc.starting_balance, curYear, curMonth, curYear, curMonth);
      result[acc.id] = bal ?? acc.starting_balance;
    });
    return result;
  }, [accounts, accountSnapMaps, curYear, curMonth]);

  const includedAccounts = accounts.filter(a => a.include_in_networth === 1);

  const totalAssets = useMemo(() =>
    includedAccounts.filter(a => !LIABILITY_TYPES.includes(a.type))
      .reduce((s, a) => s + (accountCurrentBalances[a.id] ?? a.starting_balance), 0),
    [includedAccounts, accountCurrentBalances]);

  const totalLiabilities = useMemo(() =>
    includedAccounts.filter(a => LIABILITY_TYPES.includes(a.type))
      .reduce((s, a) => s + (accountCurrentBalances[a.id] ?? a.starting_balance), 0),
    [includedAccounts, accountCurrentBalances]);

  const netWorth = totalAssets - totalLiabilities;

  // Investment accounts total (type = Investment, Crypto, Retirement)
  const investmentTotal = useMemo(() =>
    includedAccounts.filter(a => ['Investment', 'Crypto', 'Retirement'].includes(a.type))
      .reduce((s, a) => s + (accountCurrentBalances[a.id] ?? a.starting_balance), 0),
    [includedAccounts, accountCurrentBalances]);

  // Pie by type (assets only)
  const pieData = useMemo(() => {
    const byType: Record<string, { type: AccountType; value: number }> = {};
    includedAccounts.filter(a => !LIABILITY_TYPES.includes(a.type)).forEach(acc => {
      const bal = accountCurrentBalances[acc.id] ?? acc.starting_balance;
      if (!byType[acc.type]) byType[acc.type] = { type: acc.type, value: 0 };
      byType[acc.type].value += bal;
    });
    return Object.entries(byType).map(([name, d]) => ({ name, ...d })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [includedAccounts, accountCurrentBalances]);

  // Net worth trend
  const nwTrend = useMemo(() => {
    const result: { label: string; netWorth: number }[] = [];
    for (let m = 1; m <= curMonth; m++) {
      let assets = 0, liabilities = 0;
      includedAccounts.forEach(acc => {
        const snapMap = accountSnapMaps[acc.id] ?? {};
        const bal = getEffectiveBalance(snapMap, acc.starting_balance, curYear, m, curYear, curMonth);
        if (bal === null) return;
        if (LIABILITY_TYPES.includes(acc.type)) liabilities += bal;
        else assets += bal;
      });
      result.push({ label: MONTHS[m - 1], netWorth: assets - liabilities });
    }
    return result;
  }, [includedAccounts, accountSnapMaps, curYear, curMonth]);

  // Insight alerts
  const alerts = useMemo(() => {
    const list: { type: 'warn' | 'good' | 'info'; icon: string; title: string; body: string }[] = [];
    const debtRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;
    if (debtRatio > 40) {
      list.push({ type: 'warn', icon: '⚠️', title: 'High liability ratio', body: `Your liabilities are ${debtRatio.toFixed(0)}% of your total assets. Consider prioritising debt reduction.` });
    }
    if (netWorth > 0) {
      list.push({ type: 'good', icon: '✅', title: 'Positive net worth', body: `Your net worth is ${fmt(netWorth)}. Assets exceed liabilities by ${((totalAssets / (totalLiabilities || 1)) ).toFixed(1)}×.` });
    }
    const investPct = totalAssets > 0 ? (investmentTotal / totalAssets) * 100 : 0;
    if (investPct > 0) {
      list.push({ type: 'info', icon: 'ℹ️', title: 'Investment allocation', body: `${investPct.toFixed(0)}% of your assets (${fmt(investmentTotal)}) are in investment/crypto/retirement accounts.` });
    }
    return list;
  }, [netWorth, totalAssets, totalLiabilities, investmentTotal]);

  // Filtered accounts for table
  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      const tags = acc.tags?.toLowerCase() ?? '';
      const countryOk = filterCountry === 'All'
        || (filterCountry === 'SG' && (tags.includes('sg') || tags.includes('singapore') || acc.currency === 'SGD'))
        || (filterCountry === 'MY' && (tags.includes('my') || tags.includes('malaysia') || tags.includes('msia') || acc.currency === 'MYR'));
      const typeOk = filterType === 'All' || acc.type === filterType;
      return countryOk && typeOk;
    });
  }, [accounts, filterCountry, filterType]);

  if (authLoading || loadingData) {
    return (
      <>
        <header className="site-header">
          <nav className="site-nav"><Link href="/" className="site-logo">📊 Portfolio Tracker</Link></nav>
        </header>
        <main><div className="loading-state">Loading accounts...</div></main>
      </>
    );
  }

  return (
    <>
      <NavBar />

      <main>
        {/* ── Page Header ── */}
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>Accounts & Net Worth</h1>
            <p>Track all your accounts across Singapore and Malaysia — savings, investments, property, and liabilities</p>
          </div>
          <button
            onClick={() => { setShowAddForm(true); setEditingAccount(null); }}
            style={{ padding: '10px 20px', background: '#00257c', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14, whiteSpace: 'nowrap', marginTop: 8 }}>
            + Add Account
          </button>
        </div>

        {actionMsg && (
          <div style={{ padding: '10px 16px', background: '#dcfce7', color: '#166534', borderRadius: 8, marginBottom: 16, fontWeight: 600, fontSize: 13 }}>
            {actionMsg}
          </div>
        )}

        {/* ── Summary Cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
          <MetricCard label="Total Assets" value={fmt(totalAssets)} sub={`${includedAccounts.filter(a => !LIABILITY_TYPES.includes(a.type)).length} asset accounts`} color="#059669" />
          <MetricCard label="Total Liabilities" value={fmt(totalLiabilities)} sub={`${includedAccounts.filter(a => LIABILITY_TYPES.includes(a.type)).length} liability accounts`} color="#dc2626" />
          <MetricCard label="Net Worth" value={fmt(netWorth)} sub={`As of ${MONTHS[curMonth - 1]} ${curYear}`} color={netWorth >= 0 ? '#059669' : '#dc2626'} highlight={netWorth >= 0 ? 'profit' : 'loss'} />
          <MetricCard label="Investments & Crypto" value={fmt(investmentTotal)} sub="Investment + Crypto + Retirement" color="#00257c" />
          <MetricCard label="Total Accounts" value={String(accounts.length)} sub={`${accounts.filter(a => a.include_in_networth === 1).length} in net worth`} />
        </div>

        {/* ── Insight Alerts ── */}
        {alerts.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <div className="section-title"><div><p className="eyebrow">Signals</p><h2>What your accounts are telling you</h2></div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {alerts.map((a, i) => <AlertBox key={i} {...a} />)}
            </div>
          </section>
        )}

        {/* ── Charts ── */}
        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">Analytics</p><h2>Net worth overview</h2></div></div>
          <div className="chart-grid-two-col">
            {/* Donut */}
            <div className="chart-card">
              <div className="chart-header">Balance by account type (assets)</div>
              <NetWorthDonut data={pieData} />
              <div className="stacked-legend" style={{ marginTop: 8 }}>
                {pieData.map((d, i) => (
                  <div key={i} className="legend-item">
                    <span className="legend-swatch" style={{ background: TYPE_COLORS[d.type] }} />
                    <div className="legend-text">
                      <span className="legend-name">{d.name}</span>
                      <span className="legend-value">{fmt(d.value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* NW trend */}
            <div className="chart-card">
              <div className="chart-header">Net worth trend {curYear} <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>(up to {MONTHS[curMonth - 1]})</span></div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={nwTrend} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="netWorth" radius={[4, 4, 0, 0]}>
                    {nwTrend.map((entry, index) => (
                      <Cell key={index} fill={entry.netWorth >= 0 ? '#00257c' : '#dc2626'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* ── Accounts Table ── */}
        <section>
          <div className="section-title" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p className="eyebrow">Manage</p>
              <h2>All Accounts</h2>
            </div>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
                {(['All', 'SG', 'MY'] as const).map(c => (
                  <button key={c} onClick={() => setFilterCountry(c)} style={{
                    padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    background: filterCountry === c ? '#fff' : 'transparent',
                    color: filterCountry === c ? '#00257c' : '#64748b',
                    boxShadow: filterCountry === c ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}>{c === 'All' ? '🌐 All' : c === 'SG' ? '🇸🇬 SG' : '🇲🇾 MY'}</button>
                ))}
              </div>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}>
                <option value="All">All types</option>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {showAddForm && !editingAccount && (
            <AccountForm onSave={handleAddAccount} onCancel={() => setShowAddForm(false)} loading={savingAccount} />
          )}
          {editingAccount && (
            <AccountForm initial={editingAccount} onSave={handleEditAccount} onCancel={() => setEditingAccount(null)} loading={savingAccount} />
          )}

          {filteredAccounts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏦</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>No accounts found</div>
              <div style={{ fontSize: 13 }}>Add your first account or adjust the filters above</div>
            </div>
          ) : (
            <div className="holdings-table-wrapper">
              <table className="holdings-table">
                <thead>
                  <tr>
                    <th>Account Name</th>
                    <th>Type</th>
                    <th>Tags / Country</th>
                    <th>Currency</th>
                    <th style={{ textAlign: 'right' }}>Current Balance</th>
                    <th style={{ textAlign: 'right' }}>Change</th>
                    <th style={{ textAlign: 'center' }}>In Net Worth</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map(acc => {
                    const currentBal = accountCurrentBalances[acc.id] ?? acc.starting_balance;
                    const delta = currentBal - acc.starting_balance;
                    const isLiability = LIABILITY_TYPES.includes(acc.type);
                    return (
                      <tr key={acc.id}>
                        <td>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{acc.name}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Starting: {fmt(acc.starting_balance, acc.currency)}</div>
                        </td>
                        <td><TypeBadge type={acc.type} /></td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {acc.tags ? acc.tags.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                              <span key={tag} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>
                                {tag}
                              </span>
                            )) : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                          </div>
                        </td>
                        <td style={{ fontWeight: 600, color: '#475569' }}>{acc.currency}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, color: isLiability ? '#dc2626' : '#0f172a' }}>
                            {fmt(currentBal, acc.currency)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {delta !== 0 ? (
                            <span style={{ fontSize: 12, fontWeight: 700, color: delta > 0 ? '#059669' : '#dc2626' }}>
                              {delta > 0 ? '+' : ''}{fmt(delta, acc.currency)}
                            </span>
                          ) : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                            background: acc.include_in_networth ? '#dcfce7' : '#f1f5f9',
                            color: acc.include_in_networth ? '#166534' : '#94a3b8',
                          }}>
                            {acc.include_in_networth ? '✓ Yes' : '✗ No'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="modal-action-buttons" style={{ justifyContent: 'center' }}>
                            <button className="view-btn" onClick={() => setSelectedAccount(acc)}>Snapshots</button>
                            <button className="edit-btn" onClick={() => { setEditingAccount(acc); setShowAddForm(false); }}>Edit</button>
                            <button className="delete-btn" onClick={() => void handleDeleteAccount(acc.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {selectedAccount && (
        <SnapshotModal
          account={selectedAccount}
          snapshots={snapshots.filter(s => s.account_id === selectedAccount.id)}
          onClose={() => setSelectedAccount(null)}
          onSaved={() => void load()}
        />
      )}
    </>
  );
}