import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/AuthContext';

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
  name: string;
  category: BillCategory;
  country: BillCountry;
  currency: string;
  amount: number;
  frequency: BillFrequency;
  due_day: number | null;       // day of month (1-31)
  due_month: number | null;     // for annual bills: month (1-12)
  auto_debit: boolean;
  notes: string;
  is_active: boolean;
}

interface BillPayment {
  id: string;
  bill_id: string;
  paid_date: string;
  amount: number;
  notes: string;
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CURRENCY_BY_COUNTRY: Record<BillCountry, string> = { SG: 'SGD', MY: 'MYR' };

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
  const todayMs = today.getTime();
  let next: Date | null = null;

  if (bill.frequency === 'Monthly' && bill.due_day) {
    const d = new Date(today.getFullYear(), today.getMonth(), bill.due_day);
    if (d.getTime() < todayMs) d.setMonth(d.getMonth() + 1);
    next = d;
  } else if (bill.frequency === 'Quarterly' && bill.due_day) {
    for (let i = 0; i < 4; i++) {
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
  const label = next.toLocaleDateString('en-SG', { day: 'numeric', month: 'short', year: next.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  return { label, daysUntil };
}

function DueBadge({ daysUntil }: { daysUntil: number }) {
  const overdue = daysUntil < 0;
  const urgent = daysUntil >= 0 && daysUntil <= 7;
  const soon = daysUntil > 7 && daysUntil <= 30;
  const bg = overdue ? '#FCEBEB' : urgent ? '#FAEEDA' : soon ? '#E6F1FB' : '#f1f5f9';
  const color = overdue ? '#A32D2D' : urgent ? '#854F0B' : soon ? '#185FA5' : '#64748b';
  const label = overdue ? `${Math.abs(daysUntil)}d overdue` : daysUntil === 0 ? 'Due today!' : `${daysUntil}d`;
  return <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: bg, color }}>{label}</span>;
}

// ─── localStorage helpers (no backend needed) ─────────────────────────────────

const BILLS_KEY = 'pf_bills_v1';
const PAYMENTS_KEY = 'pf_bill_payments_v1';

function loadBills(): Bill[] {
  try { return JSON.parse(localStorage.getItem(BILLS_KEY) ?? '[]'); } catch { return []; }
}
function saveBills(bills: Bill[]) {
  localStorage.setItem(BILLS_KEY, JSON.stringify(bills));
}
function loadPayments(): BillPayment[] {
  try { return JSON.parse(localStorage.getItem(PAYMENTS_KEY) ?? '[]'); } catch { return []; }
}
function savePayments(payments: BillPayment[]) {
  localStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments));
}
function newId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// ─── Prefill with common SG/MY bills ─────────────────────────────────────────

const PREFILL_TEMPLATES: Omit<Bill, 'id'>[] = [
  { name: 'TNB (Electricity)', category: 'Utilities', country: 'MY', currency: 'MYR', amount: 150, frequency: 'Monthly', due_day: 15, due_month: null, auto_debit: false, notes: '', is_active: true },
  { name: 'Air Selangor (Water)', category: 'Utilities', country: 'MY', currency: 'MYR', amount: 30, frequency: 'Monthly', due_day: 15, due_month: null, auto_debit: false, notes: '', is_active: true },
  { name: 'Unifi (Internet)', category: 'Telecommunications', country: 'MY', currency: 'MYR', amount: 99, frequency: 'Monthly', due_day: 1, due_month: null, auto_debit: true, notes: '', is_active: true },
  { name: 'Cukai Tanah (Quit Rent)', category: 'Property Tax', country: 'MY', currency: 'MYR', amount: 200, frequency: 'Annual', due_day: 31, due_month: 5, auto_debit: false, notes: 'Pay before 31 May', is_active: true },
  { name: 'Cukai Pintu (Assessment)', category: 'Property Tax', country: 'MY', currency: 'MYR', amount: 300, frequency: 'Half-yearly', due_day: 28, due_month: null, auto_debit: false, notes: 'Feb & Aug', is_active: true },
  { name: 'Car Insurance (MY)', category: 'Insurance', country: 'MY', currency: 'MYR', amount: 1200, frequency: 'Annual', due_day: null, due_month: null, auto_debit: false, notes: '', is_active: true },
  { name: 'House Fire Insurance (MY)', category: 'Insurance', country: 'MY', currency: 'MYR', amount: 250, frequency: 'Annual', due_day: null, due_month: null, auto_debit: false, notes: '', is_active: true },
  { name: 'SP Group (Electricity SG)', category: 'Utilities', country: 'SG', currency: 'SGD', amount: 120, frequency: 'Monthly', due_day: 10, due_month: null, auto_debit: true, notes: '', is_active: true },
  { name: 'Credit Card (SG)', category: 'Credit Card', country: 'SG', currency: 'SGD', amount: 0, frequency: 'Monthly', due_day: 1, due_month: null, auto_debit: false, notes: 'Variable amount', is_active: true },
  { name: 'Child 1 Insurance', category: 'Children', country: 'SG', currency: 'SGD', amount: 200, frequency: 'Monthly', due_day: 1, due_month: null, auto_debit: true, notes: '', is_active: true },
  { name: 'Child 2 Insurance', category: 'Children', country: 'SG', currency: 'SGD', amount: 200, frequency: 'Monthly', due_day: 1, due_month: null, auto_debit: true, notes: '', is_active: true },
];

// ─── Bill Form ────────────────────────────────────────────────────────────────

interface BillFormProps {
  initial?: Partial<Bill>;
  onSave: (bill: Omit<Bill, 'id'>) => void;
  onCancel: () => void;
}

function BillForm({ initial = {}, onSave, onCancel }: BillFormProps) {
  const [form, setForm] = useState({
    name: initial.name ?? '',
    category: (initial.category ?? 'Utilities') as BillCategory,
    country: (initial.country ?? 'SG') as BillCountry,
    currency: initial.currency ?? 'SGD',
    amount: initial.amount?.toString() ?? '',
    frequency: (initial.frequency ?? 'Monthly') as BillFrequency,
    due_day: initial.due_day?.toString() ?? '',
    due_month: initial.due_month?.toString() ?? '',
    auto_debit: initial.auto_debit ?? false,
    notes: initial.notes ?? '',
    is_active: initial.is_active !== undefined ? initial.is_active : true,
  });

  function handleCountryChange(country: BillCountry) {
    setForm(f => ({ ...f, country, currency: CURRENCY_BY_COUNTRY[country] }));
  }

  function handleSubmit() {
    if (!form.name.trim() || !form.amount) return;
    onSave({
      name: form.name.trim(),
      category: form.category,
      country: form.country,
      currency: form.currency,
      amount: parseFloat(form.amount) || 0,
      frequency: form.frequency,
      due_day: form.due_day ? parseInt(form.due_day) : null,
      due_month: form.due_month ? parseInt(form.due_month) : null,
      auto_debit: form.auto_debit,
      notes: form.notes.trim(),
      is_active: form.is_active,
    });
  }

  const isAnnual = form.frequency === 'Annual';

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Bill Name *
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. TNB Electricity" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
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
                flex: 1, padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
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
            placeholder="e.g. 150.00" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
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
            placeholder="e.g. 15" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
          Notes
          <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Optional" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.auto_debit} onChange={e => setForm(f => ({ ...f, auto_debit: e.target.checked }))} style={{ width: 16, height: 16 }} />
            Auto-debit / GIRO
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} style={{ width: 16, height: 16 }} />
            Active
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
        <button onClick={handleSubmit} disabled={!form.name.trim() || !form.amount}
          style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#00257c', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13, opacity: (!form.name.trim() || !form.amount) ? 0.5 : 1 }}>
          Save Bill
        </button>
      </div>
    </div>
  );
}

// ─── Mark Paid Modal ──────────────────────────────────────────────────────────

function MarkPaidModal({ bill, onSave, onClose }: { bill: Bill; onSave: (p: Omit<BillPayment, 'id'>) => void; onClose: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState(bill.amount.toString());
  const [notes, setNotes] = useState('');

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal" style={{ width: 'min(480px, 90vw)' }}>
        <div className="modal-header">
          <div><div className="modal-title">Mark as Paid — {bill.name}</div></div>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Payment Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Amount Paid ({bill.currency})
            <input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600 }}>
            Notes (optional)
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. paid via PayNow" style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13 }} />
          </label>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
            <button onClick={() => onSave({ bill_id: bill.id, paid_date: date, amount: parseFloat(amount) || bill.amount, notes })}
              style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              ✓ Mark Paid
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [markingPaid, setMarkingPaid] = useState<Bill | null>(null);
  const [filterCountry, setFilterCountry] = useState<'All' | 'SG' | 'MY'>('All');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterFrequency, setFilterFrequency] = useState<string>('All');
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [prefillDone, setPrefillDone] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    setBills(loadBills());
    setPayments(loadPayments());
  }, []);

  function addBill(data: Omit<Bill, 'id'>) {
    const updated = [...bills, { ...data, id: newId() }];
    setBills(updated); saveBills(updated);
    setShowAddForm(false);
  }

  function updateBill(id: string, data: Omit<Bill, 'id'>) {
    const updated = bills.map(b => b.id === id ? { ...data, id } : b);
    setBills(updated); saveBills(updated);
    setEditingBill(null);
  }

  function deleteBill(id: string) {
    if (!confirm('Delete this bill?')) return;
    const updatedBills = bills.filter(b => b.id !== id);
    const updatedPayments = payments.filter(p => p.bill_id !== id);
    setBills(updatedBills); saveBills(updatedBills);
    setPayments(updatedPayments); savePayments(updatedPayments);
  }

  function toggleActive(id: string) {
    const updated = bills.map(b => b.id === id ? { ...b, is_active: !b.is_active } : b);
    setBills(updated); saveBills(updated);
  }

  function addPayment(data: Omit<BillPayment, 'id'>) {
    const updated = [...payments, { ...data, id: newId() }];
    setPayments(updated); savePayments(updated);
    setMarkingPaid(null);
  }

  function deletePayment(id: string) {
    const updated = payments.filter(p => p.id !== id);
    setPayments(updated); savePayments(updated);
  }

  function prefillTemplates() {
    const newBills = PREFILL_TEMPLATES.map(t => ({ ...t, id: newId() }));
    const updated = [...bills, ...newBills];
    setBills(updated); saveBills(updated);
    setPrefillDone(true);
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  const filteredBills = useMemo(() => {
    return bills.filter(b => {
      const countryOk = filterCountry === 'All' || b.country === filterCountry;
      const catOk = filterCategory === 'All' || b.category === filterCategory;
      const freqOk = filterFrequency === 'All' || b.frequency === filterFrequency;
      return countryOk && catOk && freqOk;
    });
  }, [bills, filterCountry, filterCategory, filterFrequency]);

  // Monthly equivalent totals
  const summaryTotals = useMemo(() => {
    const activeBills = bills.filter(b => b.is_active);
    const sgMonthly = activeBills.filter(b => b.country === 'SG').reduce((s, b) => s + monthlyEquivalent(b.amount, b.frequency), 0);
    const myMonthly = activeBills.filter(b => b.country === 'MY').reduce((s, b) => s + monthlyEquivalent(b.amount, b.frequency), 0);
    const sgAnnual = activeBills.filter(b => b.country === 'SG').reduce((s, b) => s + annualEquivalent(b.amount, b.frequency), 0);
    const myAnnual = activeBills.filter(b => b.country === 'MY').reduce((s, b) => s + annualEquivalent(b.amount, b.frequency), 0);
    return { sgMonthly, myMonthly, sgAnnual, myAnnual };
  }, [bills]);

  // Upcoming bills (next 30 days)
  const upcomingBills = useMemo(() => {
    return bills
      .filter(b => b.is_active)
      .map(b => ({ bill: b, due: getNextDueDate(b) }))
      .filter(x => x.due !== null && x.due.daysUntil <= 30)
      .sort((a, b) => (a.due?.daysUntil ?? 999) - (b.due?.daysUntil ?? 999));
  }, [bills]);

  // Category breakdown
  const categoryTotals = useMemo(() => {
    const map = new Map<BillCategory, { sgMonthly: number; myMonthly: number; count: number }>();
    bills.filter(b => b.is_active).forEach(b => {
      const ex = map.get(b.category) ?? { sgMonthly: 0, myMonthly: 0, count: 0 };
      if (b.country === 'SG') ex.sgMonthly += monthlyEquivalent(b.amount, b.frequency);
      else ex.myMonthly += monthlyEquivalent(b.amount, b.frequency);
      ex.count++;
      map.set(b.category, ex);
    });
    return map;
  }, [bills]);

  // Payment history for a bill
  function billPayments(billId: string) {
    return payments.filter(p => p.bill_id === billId).sort((a, b) => new Date(b.paid_date).getTime() - new Date(a.paid_date).getTime());
  }

  if (authLoading) return null;

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
        {/* ── Header ── */}
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1>Bills Manager</h1>
            <p>Track all your recurring bills — Singapore 🇸🇬 and Malaysia 🇲🇾</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {bills.length === 0 && !prefillDone && (
              <button onClick={prefillTemplates} style={{ padding: '10px 18px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                📋 Load common bills
              </button>
            )}
            <button onClick={() => { setShowAddForm(true); setEditingBill(null); }}
              style={{ padding: '10px 20px', background: '#00257c', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
              + Add Bill
            </button>
          </div>
        </div>

        {/* ── Summary Cards ── */}
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
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>Total Active Bills</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{bills.filter(b => b.is_active).length}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{bills.filter(b => b.auto_debit && b.is_active).length} on auto-debit</div>
          </div>
          <div style={{ background: upcomingBills.some(x => (x.due?.daysUntil ?? 99) <= 7) ? '#FAEEDA' : '#fff', border: `1px solid ${upcomingBills.some(x => (x.due?.daysUntil ?? 99) <= 7) ? '#EF9F27' : '#e2e8f0'}`, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>⏰ Due This Month</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{upcomingBills.length}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{upcomingBills.filter(x => (x.due?.daysUntil ?? 99) <= 7).length} due within 7 days</div>
          </div>
        </div>

        {/* ── Upcoming dues ── */}
        {upcomingBills.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <div className="section-title"><div><p className="eyebrow">Action needed</p><h2>Upcoming in next 30 days</h2></div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
              {upcomingBills.map(({ bill, due }) => (
                <div key={bill.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{CATEGORY_ICONS[bill.category]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bill.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{due!.label} · {fmt(bill.amount, bill.currency)}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <DueBadge daysUntil={due!.daysUntil} />
                      {bill.auto_debit && <span style={{ fontSize: 10, fontWeight: 700, color: '#059669', background: '#dcfce7', padding: '2px 6px', borderRadius: 3 }}>Auto</span>}
                    </div>
                  </div>
                  {!bill.auto_debit && (
                    <button onClick={() => setMarkingPaid(bill)} style={{ padding: '5px 10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', fontSize: 11, flexShrink: 0, marginTop: 2 }}>
                      ✓ Paid
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Category breakdown ── */}
        {categoryTotals.size > 0 && (
          <section style={{ marginBottom: 20 }}>
            <div className="section-title"><div><p className="eyebrow">Breakdown</p><h2>By category (monthly equivalent)</h2></div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {Array.from(categoryTotals.entries()).map(([cat, data]) => (
                <div key={cat} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORY_COLORS[cat], flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{CATEGORY_ICONS[cat]} {cat}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#64748b', background: '#f1f5f9', padding: '1px 6px', borderRadius: 3 }}>{data.count}</span>
                  </div>
                  {data.sgMonthly > 0 && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>🇸🇬 {fmt(data.sgMonthly, 'SGD')}/mo</div>}
                  {data.myMonthly > 0 && <div style={{ fontSize: 12, color: '#64748b' }}>🇲🇾 {fmt(data.myMonthly, 'MYR')}/mo</div>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Add / Edit form ── */}
        <section>
          <div className="section-title" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div><p className="eyebrow">Manage</p><h2>All Bills</h2></div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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

          {showAddForm && !editingBill && <BillForm onSave={addBill} onCancel={() => setShowAddForm(false)} />}
          {editingBill && <BillForm initial={editingBill} onSave={d => updateBill(editingBill.id, d)} onCancel={() => setEditingBill(null)} />}

          {filteredBills.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>No bills found</div>
              <div style={{ fontSize: 13, marginBottom: 20 }}>Add your first bill or load the common bills template</div>
              {bills.length === 0 && <button onClick={prefillTemplates} style={{ padding: '10px 20px', background: '#00257c', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>📋 Load common bills</button>}
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
                    <th style={{ textAlign: 'center' }}>Auto</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBills.map(bill => {
                    const due = getNextDueDate(bill);
                    const history = billPayments(bill.id);
                    return (
                      <>
                        <tr key={bill.id} style={{ opacity: bill.is_active ? 1 : 0.5 }}>
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
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{fmt(bill.amount, bill.currency)}</td>
                          <td style={{ textAlign: 'right', fontSize: 12, color: '#64748b' }}>{fmt(monthlyEquivalent(bill.amount, bill.frequency), bill.currency)}</td>
                          <td>
                            {due ? (
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 2 }}>{due.label}</div>
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
                            <button onClick={() => toggleActive(bill.id)} style={{
                              padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                              background: bill.is_active ? '#dcfce7' : '#f1f5f9',
                              color: bill.is_active ? '#166534' : '#94a3b8',
                            }}>
                              {bill.is_active ? '✓ Active' : '✗ Paused'}
                            </button>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div className="modal-action-buttons" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                              {!bill.auto_debit && bill.is_active && (
                                <button className="save-btn" onClick={() => setMarkingPaid(bill)} style={{ background: '#059669', fontSize: 11 }}>✓ Paid</button>
                              )}
                              <button className="view-btn" style={{ fontSize: 11 }} onClick={() => setShowHistory(showHistory === bill.id ? null : bill.id)}>
                                {showHistory === bill.id ? 'Hide' : `History (${history.length})`}
                              </button>
                              <button className="edit-btn" onClick={() => { setEditingBill(bill); setShowAddForm(false); }}>Edit</button>
                              <button className="delete-btn" onClick={() => deleteBill(bill.id)}>Del</button>
                            </div>
                          </td>
                        </tr>
                        {showHistory === bill.id && (
                          <tr key={`${bill.id}-history`}>
                            <td colSpan={10} style={{ background: '#f8fafc', padding: 0 }}>
                              <div style={{ padding: '12px 16px' }}>
                                <div style={{ fontWeight: 700, fontSize: 12, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payment history — {bill.name}</div>
                                {history.length === 0 ? (
                                  <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No payments recorded yet</div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {history.map(p => (
                                      <div key={p.id} style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
                                        <span style={{ color: '#64748b', minWidth: 90 }}>{p.paid_date}</span>
                                        <span style={{ fontWeight: 700, color: '#059669', minWidth: 80 }}>{fmt(p.amount, bill.currency)}</span>
                                        <span style={{ color: '#94a3b8', flex: 1 }}>{p.notes || '—'}</span>
                                        <button onClick={() => deletePayment(p.id)} style={{ padding: '2px 8px', fontSize: 11, background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Remove</button>
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

      {/* Mark paid modal */}
      {markingPaid && <MarkPaidModal bill={markingPaid} onSave={addPayment} onClose={() => setMarkingPaid(null)} />}
    </>
  );
}