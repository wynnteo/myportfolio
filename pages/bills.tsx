import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/AuthContext';
import { fetchWithAuth } from '../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

type BillFrequency = 'Monthly' | 'Quarterly' | 'Half-yearly' | 'Annual';
type BillCountry = 'SG' | 'MY';
type BillCategory =
  | 'Utilities'
  | 'Telecommunications'
  | 'Insurance'
  | 'Property Tax'
  | 'Credit Card'
  | 'Loan / Mortgage'
  | 'Subscriptions'
  | 'Children'
  | 'Transport'
  | 'Household'
  | 'Other';

interface Bill {
  id: string;
  user_id: string;
  name: string;
  category: BillCategory;
  country: BillCountry;
  currency: string;
  amount: number;
  frequency: BillFrequency;
  due_day: number | null;
  due_month: number | null;
  auto_debit: number;
  notes: string;
  is_active: number;
  created_at: string;
}

interface BillPayment {
  id: string;
  bill_id: string;
  user_id: string;
  paid_date: string;
  amount: number;
  notes: string;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BILL_CATEGORIES: BillCategory[] = [
  'Utilities', 'Telecommunications', 'Insurance', 'Property Tax',
  'Credit Card', 'Loan / Mortgage', 'Subscriptions', 'Children',
  'Transport', 'Household', 'Other',
];

const FREQUENCIES: BillFrequency[] = ['Monthly', 'Quarterly', 'Half-yearly', 'Annual'];

const CATEGORY_ICONS: Record<BillCategory, string> = {
  Utilities: '💡',
  Telecommunications: '📶',
  Insurance: '🛡️',
  'Property Tax': '🏠',
  'Credit Card': '💳',
  'Loan / Mortgage': '🏦',
  Subscriptions: '📱',
  Children: '👧',
  Transport: '🚗',
  Household: '🏡',
  Other: '📌',
};

const CATEGORY_COLORS: Record<BillCategory, string> = {
  Utilities: '#64acdb',
  Telecommunications: '#06b6d4',
  Insurance: '#84cc16',
  'Property Tax': '#10b981',
  'Credit Card': '#e11d48',
  'Loan / Mortgage': '#f43f5e',
  Subscriptions: '#8b5cf6',
  Children: '#f8c268',
  Transport: '#fa9228',
  Household: '#3b82f6',
  Other: '#94a3b8',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = 'SGD') {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount);
}

function monthlyEquivalent(amount: number, frequency: BillFrequency): number {
  switch (frequency) {
    case 'Monthly': return amount;
    case 'Quarterly': return amount / 3;
    case 'Half-yearly': return amount / 6;
    case 'Annual': return amount / 12;
  }
}

function annualEquivalent(amount: number, frequency: BillFrequency): number {
  switch (frequency) {
    case 'Monthly': return amount * 12;
    case 'Quarterly': return amount * 4;
    case 'Half-yearly': return amount * 2;
    case 'Annual': return amount;
  }
}

function getNextDueDate(bill: Bill): { label: string; daysUntil: number } | null {
  if (!bill.is_active) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  let next: Date | null = null;

  if (bill.frequency === 'Monthly' && bill.due_day) {
    const d = new Date(today.getFullYear(), today.getMonth(), bill.due_day);
    if (d.getTime() < todayMs) d.setMonth(d.getMonth() + 1);
    next = d;
  } else if (bill.frequency === 'Quarterly' && bill.due_day) {
    for (let i = 0; i < 5; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i * 3, bill.due_day);
      if (d.getTime() >= todayMs) { next = d; break; }
    }
  } else if (bill.frequency === 'Half-yearly' && bill.due_day) {
    for (let i = 0; i < 3; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i * 6, bill.due_day);
      if (d.getTime() >= todayMs) { next = d; break; }
    }
  } else if (bill.frequency === 'Annual' && bill.due_month && bill.due_day) {
    let d = new Date(today.getFullYear(), bill.due_month - 1, bill.due_day);
    if (d.getTime() < todayMs) d = new Date(today.getFullYear() + 1, bill.due_month - 1, bill.due_day);
    next = d;
  }

  if (!next) return null;
  const daysUntil = Math.ceil((next.getTime() - todayMs) / 86400000);
  const label = next.toLocaleDateString('en-SG', {
    day: 'numeric', month: 'short',
    year: next.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
  return { label, daysUntil };
}

// ─── Small components ─────────────────────────────────────────────────────────

function DueBadge({ daysUntil }: { daysUntil: number }) {
  const overdue = daysUntil < 0;
  const urgent = !overdue && daysUntil <= 7;
  const soon = !overdue && daysUntil <= 30;
  const bg = overdue ? '#FCEBEB' : urgent ? '#FAEEDA' : soon ? '#E6F1FB' : '#f1f5f9';
  const color = overdue ? '#A32D2D' : urgent ? '#854F0B' : soon ? '#185FA5' : '#64748b';
  const label = overdue ? `${Math.abs(daysUntil)}d overdue` : daysUntil === 0 ? 'Due today!' : `${daysUntil}d left`;
  return <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: bg, color }}>{label}</span>;
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

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiBills(method: string, body?: object, id?: string) {
  const url = id ? `/api/bills?id=${id}` : '/api/bills';
  return fetchWithAuth(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function apiPayments(method: string, body?: object, id?: string) {
  const url = id ? `/api/bills?resource=payments&id=${id}` : '/api/bills?resource=payments';
  return fetchWithAuth(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ─── Bill Form ────────────────────────────────────────────────────────────────

interface BillFormProps {
  initial?: Partial<Bill>;
  onSave: (data: Omit<Bill, 'id' | 'user_id' | 'created_at'>) => void;
  onCancel: () => void;
  loading?: boolean;
}

function BillForm({ initial = {}, onSave, onCancel, loading }: BillFormProps) {
  const [form, setForm] = useState({
    name: initial.name ?? '',
    category: (initial.category ?? 'Utilities') as BillCategory,
    country: (initial.country ?? 'SG') as BillCountry,
    currency: initial.currency ?? 'SGD',
    amount: initial.amount?.toString() ?? '',
    frequency: (initial.frequency ?? 'Monthly') as BillFrequency,
    due_day: initial.due_day?.toString() ?? '',
    due_month: initial.due_month?.toString() ?? '',
    auto_debit: !!(initial.auto_debit),
    notes: initial.notes ?? '',
    is_active: initial.is_active !== 0,
  });

  function handleCountryChange(country: BillCountry) {
    setForm(f => ({ ...f, country, currency: country === 'MY' ? 'MYR' : 'SGD' }));
  }

  function handleSubmit() {
    if (!form.name.trim()) return;
    onSave({
      name: form.name.trim(),
      category: form.category,
      country: form.country,
      currency: form.currency,
      amount: parseFloat(form.amount) || 0,
      frequency: form.frequency,
      due_day: form.due_day ? parseInt(form.due_day) : null,
      due_month: form.due_month ? parseInt(form.due_month) : null,
      auto_debit: form.auto_debit ? 1 : 0,
      notes: form.notes.trim(),
      is_active: form.is_active ? 1 : 0,
    });
  }

  const isAnnual = form.frequency === 'Annual';

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Bill Name *
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. TNB Electricity"
            style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Category
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as BillCategory }))}
            style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }}>
            {BILL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Country
          <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
            {(['SG', 'MY'] as BillCountry[]).map(c => (
              <button key={c} type="button" onClick={() => handleCountryChange(c)} style={{
                flex: 1, padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 600,
                background: form.country === c ? '#fff' : 'transparent',
                color: form.country === c ? '#00257c' : '#64748b',
                boxShadow: form.country === c ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{c === 'SG' ? '🇸🇬 SG' : '🇲🇾 MY'}</button>
            ))}
          </div>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Currency
          <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
            style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }}>
            {['SGD', 'MYR', 'USD'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Amount ({form.currency}) *
          <input type="number" step="0.01" min="0" value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            placeholder="e.g. 150.00"
            style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Frequency
          <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value as BillFrequency }))}
            style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }}>
            {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
        {isAnnual && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Due Month
            <select value={form.due_month} onChange={e => setForm(f => ({ ...f, due_month: e.target.value }))}
              style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }}>
              <option value="">— select —</option>
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </label>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Due Day (of month)
          <input type="number" min="1" max="31" value={form.due_day}
            onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))}
            placeholder="e.g. 15"
            style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Notes
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Optional reminder"
            style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.auto_debit}
              onChange={e => setForm(f => ({ ...f, auto_debit: e.target.checked }))}
              style={{ width: 16, height: 16 }} />
            Auto-debit / GIRO
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              style={{ width: 16, height: 16 }} />
            Active
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
        <button onClick={onCancel}
          style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          Cancel
        </button>
        <button onClick={handleSubmit} disabled={loading || !form.name.trim()}
          style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#00257c', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: (loading || !form.name.trim()) ? 0.5 : 1 }}>
          {loading ? 'Saving...' : 'Save Bill'}
        </button>
      </div>
    </div>
  );
}

// ─── Mark Paid Modal ──────────────────────────────────────────────────────────

function MarkPaidModal({ bill, onSave, onClose, saving }: {
  bill: Bill;
  onSave: (paid_date: string, amount: number, notes: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState(bill.amount.toString());
  const [notes, setNotes] = useState('');

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal" style={{ width: 'min(480px, 90vw)' }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Mark as Paid</div>
            <div className="modal-meta"><span>{bill.name}</span><span>{bill.currency}</span></div>
          </div>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Payment Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Amount Paid ({bill.currency})
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Notes (optional)
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. paid via PayNow"
              style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
          </label>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={onClose}
              style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              Cancel
            </button>
            <button onClick={() => onSave(date, parseFloat(amount) || bill.amount, notes)} disabled={saving}
              style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : '✓ Mark Paid'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillsPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();

  const [bills, setBills] = useState<Bill[]>([]);
  const [payments, setPayments] = useState<BillPayment[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [savingBill, setSavingBill] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [markingPaid, setMarkingPaid] = useState<Bill | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);
  const [filterCountry, setFilterCountry] = useState<'All' | 'SG' | 'MY'>('All');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterFrequency, setFilterFrequency] = useState<string>('All');
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) void load();
  }, [user]);

  async function load() {
    setLoadingData(true);
    try {
      const [bRes, pRes] = await Promise.all([
        fetchWithAuth('/api/bills'),
        fetchWithAuth('/api/bills?resource=payments'),
      ]);
      if (bRes.ok) setBills(await bRes.json());
      if (pRes.ok) setPayments(await pRes.json());
    } finally {
      setLoadingData(false);
    }
  }

  function showMsg(msg: string) {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3000);
  }

  async function handleAddBill(data: Omit<Bill, 'id' | 'user_id' | 'created_at'>) {
    setSavingBill(true);
    const res = await apiBills('POST', data);
    setSavingBill(false);
    if (res.ok) { setShowAddForm(false); showMsg('Bill added!'); void load(); }
    else { const e = await res.json().catch(() => ({})); showMsg((e as any).error ?? 'Failed to add bill'); }
  }

  async function handleUpdateBill(id: string, data: Omit<Bill, 'id' | 'user_id' | 'created_at'>) {
    setSavingBill(true);
    const res = await apiBills('PUT', { ...data, id });
    setSavingBill(false);
    if (res.ok) { setEditingBill(null); showMsg('Bill updated!'); void load(); }
    else { const e = await res.json().catch(() => ({})); showMsg((e as any).error ?? 'Failed to update'); }
  }

  async function handleDeleteBill(id: string) {
    if (!confirm('Delete this bill and all its payment history?')) return;
    const res = await apiBills('DELETE', undefined, id);
    if (res.ok) { showMsg('Bill deleted.'); void load(); }
    else showMsg('Failed to delete');
  }

  async function handleToggleActive(bill: Bill) {
    await apiBills('PUT', {
      id: bill.id, name: bill.name, category: bill.category, country: bill.country,
      currency: bill.currency, amount: bill.amount, frequency: bill.frequency,
      due_day: bill.due_day, due_month: bill.due_month,
      auto_debit: bill.auto_debit, notes: bill.notes,
      is_active: bill.is_active ? 0 : 1,
    });
    void load();
  }

  async function handleMarkPaid(bill: Bill, paid_date: string, amount: number, notes: string) {
    setSavingPayment(true);
    const res = await apiPayments('POST', { bill_id: bill.id, paid_date, amount, notes });
    setSavingPayment(false);
    if (res.ok) { setMarkingPaid(null); showMsg(`Recorded payment for ${bill.name}`); void load(); }
    else showMsg('Failed to record payment');
  }

  async function handleDeletePayment(id: string) {
    if (!confirm('Remove this payment record?')) return;
    const res = await apiPayments('DELETE', undefined, id);
    if (res.ok) { showMsg('Payment removed.'); void load(); }
    else showMsg('Failed to remove payment');
  }

  const filteredBills = useMemo(() => bills.filter(b => {
    const countryOk = filterCountry === 'All' || b.country === filterCountry;
    const catOk = filterCategory === 'All' || b.category === filterCategory;
    const freqOk = filterFrequency === 'All' || b.frequency === filterFrequency;
    return countryOk && catOk && freqOk;
  }), [bills, filterCountry, filterCategory, filterFrequency]);

  const summaryTotals = useMemo(() => {
    const active = bills.filter(b => b.is_active);
    return {
      sgMonthly: active.filter(b => b.country === 'SG').reduce((s, b) => s + monthlyEquivalent(b.amount, b.frequency), 0),
      myMonthly: active.filter(b => b.country === 'MY').reduce((s, b) => s + monthlyEquivalent(b.amount, b.frequency), 0),
      sgAnnual: active.filter(b => b.country === 'SG').reduce((s, b) => s + annualEquivalent(b.amount, b.frequency), 0),
      myAnnual: active.filter(b => b.country === 'MY').reduce((s, b) => s + annualEquivalent(b.amount, b.frequency), 0),
      autoDebitCount: active.filter(b => b.auto_debit).length,
      manualCount: active.filter(b => !b.auto_debit).length,
    };
  }, [bills]);

  const upcomingBills = useMemo(() => bills
    .filter(b => b.is_active)
    .map(b => ({ bill: b, due: getNextDueDate(b) }))
    .filter(x => x.due !== null && x.due.daysUntil <= 30)
    .sort((a, b) => (a.due?.daysUntil ?? 999) - (b.due?.daysUntil ?? 999)),
  [bills]);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, { sgMonthly: number; myMonthly: number; count: number }>();
    bills.filter(b => b.is_active).forEach(b => {
      const ex = map.get(b.category) ?? { sgMonthly: 0, myMonthly: 0, count: 0 };
      if (b.country === 'SG') ex.sgMonthly += monthlyEquivalent(b.amount, b.frequency);
      else ex.myMonthly += monthlyEquivalent(b.amount, b.frequency);
      ex.count++;
      map.set(b.category, ex);
    });
    return Array.from(map.entries()).sort((a, b) => (b[1].sgMonthly + b[1].myMonthly) - (a[1].sgMonthly + a[1].myMonthly));
  }, [bills]);

  const alerts = useMemo(() => {
    const list: { type: 'warn' | 'good' | 'info'; icon: string; title: string; body: string }[] = [];
    const overdueCount = upcomingBills.filter(x => (x.due?.daysUntil ?? 0) < 0).length;
    const urgentItems = upcomingBills.filter(x => (x.due?.daysUntil ?? 99) >= 0 && (x.due?.daysUntil ?? 99) <= 3);
    if (overdueCount > 0) list.push({ type: 'warn', icon: '⚠️', title: `${overdueCount} bill${overdueCount > 1 ? 's' : ''} overdue`, body: 'You have bills past their due date. Settle them to avoid late fees.' });
    if (urgentItems.length > 0) list.push({ type: 'warn', icon: '⏰', title: 'Due within 3 days', body: urgentItems.map(x => x.bill.name).join(', ') });
    if (summaryTotals.manualCount > 0) list.push({ type: 'info', icon: 'ℹ️', title: `${summaryTotals.manualCount} manual payment${summaryTotals.manualCount > 1 ? 's' : ''} this cycle`, body: `${summaryTotals.autoDebitCount} bills are on auto-debit. The other ${summaryTotals.manualCount} need manual action.` });
    return list;
  }, [upcomingBills, summaryTotals]);

  function billPayments(billId: string) {
    return payments.filter(p => p.bill_id === billId)
      .sort((a, b) => new Date(b.paid_date).getTime() - new Date(a.paid_date).getTime());
  }

  if (authLoading || loadingData) {
    return (
      <>
        <header className="site-header">
          <nav className="site-nav"><Link href="/" className="site-logo">📊 Portfolio Tracker</Link></nav>
        </header>
        <main><div className="loading-state">Loading bills...</div></main>
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
        {/* ── Page header ── */}
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1>Bills Manager</h1>
            <p>All your recurring bills — Singapore 🇸🇬 and Malaysia 🇲🇾</p>
          </div>
          <button onClick={() => { setShowAddForm(true); setEditingBill(null); }}
            style={{ padding: '10px 20px', background: '#00257c', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14, marginTop: 8 }}>
            + Add Bill
          </button>
        </div>

        {actionMsg && (
          <div style={{ padding: '10px 16px', background: '#dcfce7', color: '#166534', borderRadius: 8, marginBottom: 16, fontWeight: 600, fontSize: 13 }}>
            {actionMsg}
          </div>
        )}

        {/* ── Summary cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>🇸🇬 SG Monthly</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{fmt(summaryTotals.sgMonthly, 'SGD')}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Annual: {fmt(summaryTotals.sgAnnual, 'SGD')}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>🇲🇾 MY Monthly</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{fmt(summaryTotals.myMonthly, 'MYR')}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Annual: {fmt(summaryTotals.myAnnual, 'MYR')}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>Active Bills</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{bills.filter(b => b.is_active).length}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{summaryTotals.autoDebitCount} auto-debit · {summaryTotals.manualCount} manual</div>
          </div>
          <div style={{
            background: upcomingBills.some(x => (x.due?.daysUntil ?? 99) <= 7) ? '#FAEEDA' : '#fff',
            border: `1px solid ${upcomingBills.some(x => (x.due?.daysUntil ?? 99) <= 7) ? '#EF9F27' : '#e2e8f0'}`,
            borderRadius: 12, padding: '16px 20px',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>⏰ Due This Month</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{upcomingBills.length}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{upcomingBills.filter(x => (x.due?.daysUntil ?? 99) <= 7).length} due within 7 days</div>
          </div>
        </div>

        {/* ── Alerts ── */}
        {alerts.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <div className="section-title"><div><p className="eyebrow">Attention</p><h2>Needs your action</h2></div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
              {alerts.map((a, i) => <AlertBox key={i} {...a} />)}
            </div>
          </section>
        )}

        {/* ── Upcoming ── */}
        {upcomingBills.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <div className="section-title"><div><p className="eyebrow">Coming up</p><h2>Due in the next 30 days</h2></div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {upcomingBills.map(({ bill, due }) => (
                <div key={bill.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{CATEGORY_ICONS[bill.category]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bill.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{due!.label} · {fmt(bill.amount, bill.currency)}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <DueBadge daysUntil={due!.daysUntil} />
                      {!!bill.auto_debit && <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', background: '#dcfce7', padding: '2px 6px', borderRadius: 3 }}>GIRO</span>}
                    </div>
                  </div>
                  {!bill.auto_debit && (
                    <button onClick={() => setMarkingPaid(bill)}
                      style={{ padding: '5px 10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 11, flexShrink: 0 }}>
                      ✓ Paid
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Category breakdown ── */}
        {categoryTotals.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <div className="section-title"><div><p className="eyebrow">Breakdown</p><h2>By category (monthly equivalent)</h2></div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {categoryTotals.map(([cat, data]) => (
                <div key={cat} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORY_COLORS[cat as BillCategory] ?? '#94a3b8', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{CATEGORY_ICONS[cat as BillCategory]} {cat}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: 3 }}>{data.count}</span>
                  </div>
                  {data.sgMonthly > 0 && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>🇸🇬 {fmt(data.sgMonthly, 'SGD')}/mo</div>}
                  {data.myMonthly > 0 && <div style={{ fontSize: 12, color: '#64748b' }}>🇲🇾 {fmt(data.myMonthly, 'MYR')}/mo</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── All bills table ── */}
        <section>
          <div className="section-title" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div><p className="eyebrow">Manage</p><h2>All Bills</h2></div>
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
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}>
                <option value="All">All categories</option>
                {BILL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterFrequency} onChange={e => setFilterFrequency(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff' }}>
                <option value="All">All frequencies</option>
                {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          {showAddForm && !editingBill && <BillForm onSave={handleAddBill} onCancel={() => setShowAddForm(false)} loading={savingBill} />}
          {editingBill && <BillForm initial={editingBill} onSave={d => handleUpdateBill(editingBill.id, d)} onCancel={() => setEditingBill(null)} loading={savingBill} />}

          {filteredBills.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{bills.length === 0 ? 'No bills yet' : 'No bills match filters'}</div>
              <div style={{ fontSize: 13 }}>{bills.length === 0 ? 'Add your first bill using the button above' : 'Try changing the filters'}</div>
            </div>
          ) : (
            <div className="holdings-table-wrapper">
              <table className="holdings-table">
                <thead>
                  <tr>
                    <th>Bill</th>
                    <th>Category</th>
                    <th>Country</th>
                    <th>Frequency</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>Monthly equiv.</th>
                    <th>Next due</th>
                    <th style={{ textAlign: 'center' }}>Payment</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBills.map(bill => {
                    const due = getNextDueDate(bill);
                    const history = billPayments(bill.id);
                    const isExpanded = expandedHistory === bill.id;
                    return (
                      <>
                        <tr key={bill.id} style={{ opacity: bill.is_active ? 1 : 0.45 }}>
                          <td>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{CATEGORY_ICONS[bill.category]} {bill.name}</div>
                            {bill.notes && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{bill.notes}</div>}
                          </td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700, background: `${CATEGORY_COLORS[bill.category]}22`, color: CATEGORY_COLORS[bill.category], border: `1px solid ${CATEGORY_COLORS[bill.category]}44` }}>
                              {bill.category}
                            </span>
                          </td>
                          <td><span style={{ fontSize: 13, fontWeight: 600 }}>{bill.country === 'SG' ? '🇸🇬' : '🇲🇾'} {bill.country}</span></td>
                          <td><span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{bill.frequency}</span></td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(bill.amount, bill.currency)}</td>
                          <td style={{ textAlign: 'right', fontSize: 12, color: '#64748b' }}>{fmt(monthlyEquivalent(bill.amount, bill.frequency), bill.currency)}</td>
                          <td>
                            {due ? (
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 3 }}>{due.label}</div>
                                <DueBadge daysUntil={due.daysUntil} />
                              </div>
                            ) : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {bill.auto_debit
                              ? <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: '#dcfce7', padding: '2px 8px', borderRadius: 4 }}>GIRO</span>
                              : <span style={{ fontSize: 11, color: '#94a3b8' }}>Manual</span>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button onClick={() => void handleToggleActive(bill)} style={{ padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none', background: bill.is_active ? '#dcfce7' : '#f1f5f9', color: bill.is_active ? '#166534' : '#94a3b8' }}>
                              {bill.is_active ? '✓ Active' : '✗ Paused'}
                            </button>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div className="modal-action-buttons" style={{ justifyContent: 'center', flexWrap: 'wrap', gap: 4 }}>
                              {!bill.auto_debit && !!bill.is_active && (
                                <button className="save-btn" onClick={() => setMarkingPaid(bill)} style={{ background: '#059669', fontSize: 11, padding: '5px 10px' }}>✓ Paid</button>
                              )}
                              <button className="view-btn" style={{ fontSize: 11, padding: '5px 10px' }} onClick={() => setExpandedHistory(isExpanded ? null : bill.id)}>
                                {isExpanded ? 'Hide' : `History (${history.length})`}
                              </button>
                              <button className="edit-btn" onClick={() => { setEditingBill(bill); setShowAddForm(false); }}>Edit</button>
                              <button className="delete-btn" onClick={() => void handleDeleteBill(bill.id)}>Del</button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${bill.id}-hist`}>
                            <td colSpan={10} style={{ padding: 0 }}>
                              <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '14px 20px' }}>
                                <div style={{ fontWeight: 700, fontSize: 12, color: '#475569', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  Payment history — {bill.name}
                                </div>
                                {history.length === 0 ? (
                                  <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No payments recorded yet.</div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {history.map(p => (
                                      <div key={p.id} style={{ display: 'flex', gap: 20, alignItems: 'center', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                                        <span style={{ color: '#64748b', minWidth: 90, fontSize: 12 }}>{p.paid_date}</span>
                                        <span style={{ fontWeight: 700, color: '#059669', minWidth: 80 }}>{fmt(p.amount, bill.currency)}</span>
                                        <span style={{ color: '#94a3b8', flex: 1, fontSize: 12 }}>{p.notes || '—'}</span>
                                        <button onClick={() => void handleDeletePayment(p.id)}
                                          style={{ padding: '3px 10px', fontSize: 11, background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                                          Remove
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {markingPaid && (
        <MarkPaidModal
          bill={markingPaid}
          onSave={(d, a, n) => void handleMarkPaid(markingPaid, d, a, n)}
          onClose={() => setMarkingPaid(null)}
          saving={savingPayment}
        />
      )}
    </>
  );
}