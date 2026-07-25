import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { fetchWithAuth } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import NavBar from '../components/NavBar';
import { AlertBox } from '../components/AlertBox';
import { fetchAllHoldingQuotes } from '../lib/quotes';

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

const CATEGORIES = ['Unit Trusts', 'Stocks', 'ETF', 'Bond', 'Cash', 'Crypto', 'Other'];

const CATEGORY_COLORS: Record<string, string> = {
  'Unit Trusts': '#64acdb',
  Stocks: '#f8c268',
  ETF: '#6fd2df',
  Bond: '#f4609f',
  Cash: '#fa9228',
  Crypto: '#8b5cf6',
  Other: '#94a3b8',
};

function fmt(value: number, currency = 'SGD') {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

function fmtPct(value: number, showPlus = true) {
  return `${showPlus && value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

// ─── Monthly Activity Summary ─────────────────────────────────────────────────
// This month's activity, grouped by category: how many buys, sells, and
// dividend payouts landed this month, plus the $ amounts behind each.

interface CategoryActivity {
  category: string;
  buyCount: number; buyAmount: number;
  sellCount: number; sellAmount: number;
  divCount: number; divAmount: number;
}

function MonthlyActivitySummary({ transactions }: { transactions: Transaction[] }) {
  const now = new Date();
  const monthLabel = now.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' });

  const { rows, totals, txCount } = useMemo(() => {
    const monthTx = transactions.filter(tx => {
      if (!tx.trade_date) return false;
      const d = new Date(tx.trade_date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });

    const map = new Map<string, CategoryActivity>();
    const get = (cat: string) => {
      const ex = map.get(cat) ?? { category: cat, buyCount: 0, buyAmount: 0, sellCount: 0, sellAmount: 0, divCount: 0, divAmount: 0 };
      map.set(cat, ex);
      return ex;
    };

    for (const tx of monthTx) {
      const cat = tx.category || 'Other';
      const entry = get(cat);
      if (tx.type === 'BUY') {
        entry.buyCount += 1;
        entry.buyAmount += (tx.quantity ?? 0) * (tx.price ?? 0) + (tx.commission ?? 0);
      } else if (tx.type === 'SELL') {
        entry.sellCount += 1;
        entry.sellAmount += (tx.quantity ?? 0) * (tx.price ?? 0) - (tx.commission ?? 0);
      } else if (tx.type === 'DIVIDEND') {
        entry.divCount += 1;
        entry.divAmount += tx.dividend_amount ?? 0;
      }
    }

    const rows = Array.from(map.values())
      .filter(r => r.buyCount + r.sellCount + r.divCount > 0)
      .sort((a, b) => (b.buyAmount + b.sellAmount + b.divAmount) - (a.buyAmount + a.sellAmount + a.divAmount));

    const totals = rows.reduce((s, r) => ({
      buyCount: s.buyCount + r.buyCount, buyAmount: s.buyAmount + r.buyAmount,
      sellCount: s.sellCount + r.sellCount, sellAmount: s.sellAmount + r.sellAmount,
      divCount: s.divCount + r.divCount, divAmount: s.divAmount + r.divAmount,
    }), { buyCount: 0, buyAmount: 0, sellCount: 0, sellAmount: 0, divCount: 0, divAmount: 0 });

    return { rows, totals, txCount: monthTx.length };
  }, [transactions, now]);

  if (txCount === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{monthLabel}</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>No transactions logged this month yet.</div>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{monthLabel} — what you did this month</div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#64748b' }}>
          <span><b style={{ color: '#0f172a' }}>{totals.buyCount}</b> buys <span style={{ color: '#94a3b8' }}>({fmt(totals.buyAmount)})</span></span>
          {totals.sellCount > 0 && <span><b style={{ color: '#0f172a' }}>{totals.sellCount}</b> sells <span style={{ color: '#94a3b8' }}>({fmt(totals.sellAmount)})</span></span>}
          <span><b style={{ color: '#059669' }}>{totals.divCount}</b> dividends <span style={{ color: '#94a3b8' }}>({fmt(totals.divAmount)})</span></span>
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Category', 'Buys', 'Sells', 'Dividends'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Category' ? 'left' : 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.category} style={{ borderBottom: i < rows.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: CATEGORY_COLORS[r.category] ?? '#94a3b8', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{r.category}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                  {r.buyCount > 0
                    ? <span><b style={{ color: '#0f172a' }}>{r.buyCount}笔</b> <span style={{ color: '#64748b', fontSize: 12 }}>{fmt(r.buyAmount)}</span></span>
                    : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                  {r.sellCount > 0
                    ? <span><b style={{ color: '#0f172a' }}>{r.sellCount}笔</b> <span style={{ color: '#64748b', fontSize: 12 }}>{fmt(r.sellAmount)}</span></span>
                    : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                  {r.divCount > 0
                    ? <span><b style={{ color: '#059669' }}>{r.divCount}笔</b> <span style={{ color: '#64748b', fontSize: 12 }}>{fmt(r.divAmount)}</span></span>
                    : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Mini YoY Dividend Chart ──────────────────────────────────────────────────

function DividendYoYChart({ transactions }: { transactions: Transaction[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  const data = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const thisYear = Array(12).fill(0);
    const prevYear = Array(12).fill(0);
    transactions.filter(tx => tx.type === 'DIVIDEND' && tx.trade_date).forEach(tx => {
      const d = new Date(tx.trade_date!);
      const yr = d.getFullYear();
      const mo = d.getMonth();
      const amt = tx.dividend_amount ?? 0;
      if (yr === currentYear) thisYear[mo] += amt;
      if (yr === lastYear) prevYear[mo] += amt;
    });
    return { months, thisYear, prevYear };
  }, [transactions, currentYear, lastYear]);

  useEffect(() => {
    if (!canvasRef.current) return;
    function render() {
      const ChartJS = (window as any).Chart;
      if (!ChartJS || !canvasRef.current) return;
      if (chartRef.current) chartRef.current.destroy();
      chartRef.current = new ChartJS(canvasRef.current, {
        type: 'bar',
        data: {
          labels: data.months,
          datasets: [
            { label: String(lastYear), data: data.prevYear, backgroundColor: '#B5D4F4', borderRadius: 3, borderSkipped: false },
            { label: String(currentYear), data: data.thisYear, backgroundColor: '#378ADD', borderRadius: 3, borderSkipped: false },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx: any) => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: { grid: { color: 'rgba(0,0,0,0.06)' }, beginAtZero: true, ticks: { font: { size: 11 }, callback: (v: any) => 'S$' + (Number(v) >= 1000 ? (Number(v) / 1000).toFixed(1) + 'k' : v) } },
          },
        },
      });
    }
    const win = window as any;
    if (win.Chart) { render(); }
    else {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
      s.onload = render;
      document.head.appendChild(s);
    }
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [data, currentYear, lastYear]);

  const thisYearTotal = data.thisYear.reduce((a, b) => a + b, 0);
  const lastYearTotal = data.prevYear.reduce((a, b) => a + b, 0);
  const growth = lastYearTotal > 0 ? ((thisYearTotal - lastYearTotal) / lastYearTotal) * 100 : 0;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Dividend income — year on year</div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#B5D4F4', display: 'inline-block' }} />
              {lastYear}: {fmt(lastYearTotal)}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#378ADD', display: 'inline-block' }} />
              {currentYear} YTD: {fmt(thisYearTotal)}
            </span>
            {growth !== 0 && (
              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: growth > 0 ? '#EAF3DE' : '#FCEBEB', color: growth > 0 ? '#3B6D11' : '#A32D2D' }}>
                {growth > 0 ? '↑' : '↓'} {Math.abs(growth).toFixed(1)}% vs last year
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Monthly avg ({currentYear})</div>
          {/* ── FIX: was `/ new Date().getMonth() || 1` which divides by 0 in January ── */}
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
            {fmt(thisYearTotal / (new Date().getMonth() + 1))}
          </div>
        </div>
      </div>
      <div style={{ position: 'relative', height: 200 }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

// ─── Allocation Bar ───────────────────────────────────────────────────────────

function AllocationBar({ breakdown }: { breakdown: { category: string; pct: number; capital: number }[] }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Portfolio allocation</div>
      <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', gap: 2, marginBottom: 16 }}>
        {breakdown.map(d => (
          <div key={d.category} style={{ width: `${d.pct}%`, background: CATEGORY_COLORS[d.category] ?? '#94a3b8', minWidth: d.pct > 1 ? 2 : 0 }} title={`${d.category}: ${d.pct.toFixed(1)}%`} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {breakdown.map(d => {
          const isHeavy = d.pct >= 50;
          const isWatch = d.category === 'Crypto';
          const badge = isHeavy ? { label: 'Heavy', bg: '#FAEEDA', color: '#854F0B' }
            : isWatch ? { label: 'Watch', bg: '#E6F1FB', color: '#185FA5' }
            : { label: 'OK', bg: '#EAF3DE', color: '#3B6D11' };
          return (
            <div key={d.category} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: CATEGORY_COLORS[d.category] ?? '#94a3b8', flexShrink: 0 }} />
              <span style={{ flex: 1, color: '#475569', fontWeight: 500 }}>{d.category}</span>
              <span style={{ fontWeight: 700, color: '#0f172a', minWidth: 50, textAlign: 'right' }}>{fmt(d.capital)}</span>
              <span style={{ fontWeight: 700, color: '#64748b', minWidth: 38, textAlign: 'right' }}>{d.pct.toFixed(1)}%</span>
              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color, minWidth: 46, textAlign: 'center' }}>{badge.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Category Return Table ────────────────────────────────────────────────────

function CategoryReturnTable({ rows }: {
  rows: { category: string; capital: number; currentValue: number; capitalGainPct: number; dividendYield: number; totalReturnPct: number; ytdDividends: number; hasLivePrice: boolean }[]
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
        Performance by category — what&apos;s working, what isn&apos;t
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Category', 'Capital', 'Market value', 'Capital gain', 'Div yield on cost', 'Total return', 'YTD dividends'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Category' ? 'left' : 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.category} style={{ borderBottom: i < rows.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: CATEGORY_COLORS[row.category] ?? '#94a3b8', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{row.category}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right', color: '#475569' }}>{fmt(row.capital)}</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', color: '#0f172a', fontWeight: 500 }}>{row.hasLivePrice ? fmt(row.currentValue) : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                <td style={{ padding: '12px 14px', textAlign: 'right' }}>{row.hasLivePrice ? <span style={{ fontWeight: 700, color: row.capitalGainPct >= 0 ? '#059669' : '#dc2626' }}>{fmtPct(row.capitalGainPct)}</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                <td style={{ padding: '12px 14px', textAlign: 'right' }}><span style={{ fontWeight: 700, color: row.dividendYield > 0 ? '#059669' : '#94a3b8' }}>{row.dividendYield > 0 ? fmtPct(row.dividendYield, false) : '—'}</span></td>
                <td style={{ padding: '12px 14px', textAlign: 'right' }}>{row.hasLivePrice ? <span style={{ fontWeight: 700, color: row.totalReturnPct >= 0 ? '#059669' : '#dc2626', padding: '3px 8px', borderRadius: 4, background: row.totalReturnPct >= 0 ? '#EAF3DE' : '#FCEBEB' }}>{fmtPct(row.totalReturnPct)}</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                <td style={{ padding: '12px 14px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>{row.ytdDividends > 0 ? fmt(row.ytdDividends) : <span style={{ color: '#94a3b8' }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: '10px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>
        Total return = unrealised capital gain % + dividend yield on cost (YTD). Live prices required for capital gain.
      </div>
    </div>
  );
}

// ─── Performers Row ───────────────────────────────────────────────────────────

function RankedList({ title, icon, rows, color, bg, arrow }: {
  title: string; icon: string; color: string; bg: string; arrow: string;
  rows: { symbol: string; productName: string; plPct: number; pl: number | null; currency: string }[];
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', flex: 1, minWidth: 240 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>{icon} {title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: '#94a3b8', padding: '8px 0' }}>No data</div>
      ) : (
        <div>
          {rows.map((h, i) => (
            <div key={h.symbol + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ width: 18, fontSize: 12, fontWeight: 700, color: '#94a3b8', flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.symbol}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.productName}</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 800, fontSize: 13, color, background: bg, padding: '4px 9px', borderRadius: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 10 }}>{arrow}</span>{fmtPct(h.plPct)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PerformersRow({ holdings }: {
  holdings: { symbol: string; productName: string; category: string; plPct: number | null; pl: number | null; currency: string; ytdDividends: number; capital: number }[]
}) {
  const categoriesPresent = useMemo(
    () => CATEGORIES.filter(cat => holdings.some(h => h.category === cat)),
    [holdings]
  );
  const [filter, setFilter] = useState('All');

  const filtered = useMemo(
    () => filter === 'All' ? holdings : holdings.filter(h => h.category === filter),
    [holdings, filter]
  );
  const withPrices = filtered.filter(h => h.plPct !== null) as (typeof filtered[number] & { plPct: number })[];
  const topGainers = [...withPrices].sort((a, b) => b.plPct - a.plPct).slice(0, 3);
  const topLosers = [...withPrices].sort((a, b) => a.plPct - b.plPct).slice(0, 3);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10, marginBottom: 12 }}>
        {['All', ...categoriesPresent].map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: filter === cat ? '1px solid #0f172a' : '1px solid #e2e8f0',
              background: filter === cat ? '#0f172a' : '#fff',
              color: filter === cat ? '#fff' : '#475569',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {withPrices.length === 0 ? (
        <div style={{ fontSize: 12, color: '#94a3b8', padding: '12px 0' }}>No priced holdings in this category</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <RankedList title="Top gainers" icon="🔥" color="#059669" bg="#EAF3DE" arrow="▲" rows={topGainers} />
          <RankedList title="Top losers" icon="📉" color="#dc2626" bg="#FCEBEB" arrow="▼" rows={topLosers} />
        </div>
      )}
    </div>
  );
}

// ─── Broker Table ─────────────────────────────────────────────────────────────

function BrokerTable({ data }: { data: { broker: string; invested: number; currentValue: number; hasLivePrice: boolean }[] }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>By broker</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {['Broker', 'Invested', 'Current value', 'Gain / Loss'].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Broker' ? 'left' : 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => {
            const gl = d.currentValue - d.invested;
            const glPct = d.invested > 0 ? (gl / d.invested) * 100 : 0;
            return (
              <tr key={d.broker} style={{ borderBottom: i < data.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>{d.broker}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#475569' }}>{fmt(d.invested)}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#0f172a', fontWeight: 500 }}>{d.hasLivePrice ? fmt(d.currentValue) : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  {d.hasLivePrice
                    ? <span style={{ fontWeight: 700, color: gl >= 0 ? '#059669' : '#dc2626' }}>{gl >= 0 ? '+' : ''}{fmt(gl)} ({fmtPct(glPct)})</span>
                    : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const DIV_GOAL = 3000;

export default function InsightsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteResponse>>({});
  const [loading, setLoading] = useState(true);
  const [loadingPrices, setLoadingPrices] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) void loadData();
  }, [user]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/transactions');
      if (res.ok) setTransactions(await res.json());
    } catch {}
    finally { setLoading(false); }
  }

  const currentHoldings = useMemo(() => {
    const map = new Map<string, { symbol: string; productName: string; category: string; broker: string; currency: string; quantity: number; totalCost: number }>();
    for (const tx of transactions) {
      const key = `${tx.symbol}__${tx.broker}`;
      const existing = map.get(key) ?? { symbol: tx.symbol, productName: tx.product_name, category: tx.category, broker: tx.broker, currency: tx.currency, quantity: 0, totalCost: 0 };
      if (tx.type === 'BUY' || tx.type === 'SELL') {
        existing.quantity += tx.quantity ?? 0;
        existing.totalCost += (tx.quantity ?? 0) * (tx.price ?? 0) + (tx.commission ?? 0);
      }
      if (tx.product_name) existing.productName = tx.product_name;
      map.set(key, existing);
    }
    return Array.from(map.values()).filter(h => h.quantity > 0.0001);
  }, [transactions]);

  // ── FIX: use shared fetchAllHoldingQuotes instead of duplicated fetch logic ──
  useEffect(() => {
    if (currentHoldings.length === 0) return;
    setLoadingPrices(true);
    fetchAllHoldingQuotes(currentHoldings).then(result => {
      setQuotes(result as Record<string, QuoteResponse>);
      setLoadingPrices(false);
    });
  }, [currentHoldings]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const lastYear = currentYear - 1;

  const enrichedHoldings = useMemo(() => {
    return currentHoldings.map(h => {
      const quote = quotes[h.symbol];
      const currentPrice = quote?.price ?? null;
      const currentValue = currentPrice !== null ? currentPrice * h.quantity : null;
      const pl = currentValue !== null ? currentValue - h.totalCost : null;
      const plPct = pl !== null && h.totalCost > 0 ? (pl / h.totalCost) * 100 : null;
      const ytdDividends = transactions
        .filter(tx => tx.type === 'DIVIDEND' && tx.symbol === h.symbol && tx.broker === h.broker && tx.trade_date && new Date(tx.trade_date).getFullYear() === currentYear)
        .reduce((s, tx) => s + (tx.dividend_amount ?? 0), 0);
      return { ...h, capital: h.totalCost, currentPrice, currentValue, pl, plPct, ytdDividends, hasLivePrice: currentPrice !== null };
    });
  }, [currentHoldings, quotes, transactions, currentYear]);

  const totals = useMemo(() => {
    const totalCapital = enrichedHoldings.reduce((s, h) => s + h.totalCost, 0);
    const totalCurrentValue = enrichedHoldings.filter(h => h.hasLivePrice).reduce((s, h) => s + (h.currentValue ?? 0), 0);
    const totalUnrealised = enrichedHoldings.filter(h => h.hasLivePrice).reduce((s, h) => s + (h.pl ?? 0), 0);
    const totalUnrealisedPct = totalCapital > 0 ? (totalUnrealised / totalCapital) * 100 : 0;
    const allTimeDividends = transactions.filter(tx => tx.type === 'DIVIDEND').reduce((s, tx) => s + (tx.dividend_amount ?? 0), 0);
    const ytdDividends = transactions.filter(tx => tx.type === 'DIVIDEND' && tx.trade_date && new Date(tx.trade_date).getFullYear() === currentYear).reduce((s, tx) => s + (tx.dividend_amount ?? 0), 0);
    const lastYearDividends = transactions.filter(tx => tx.type === 'DIVIDEND' && tx.trade_date && new Date(tx.trade_date).getFullYear() === lastYear).reduce((s, tx) => s + (tx.dividend_amount ?? 0), 0);
    const totalReturn = totalUnrealised + allTimeDividends;
    const totalReturnPct = totalCapital > 0 ? (totalReturn / totalCapital) * 100 : 0;
    const divGrowth = lastYearDividends > 0 ? ((ytdDividends - lastYearDividends) / lastYearDividends) * 100 : null;
    const monthlyAvgDiv = ytdDividends / (now.getMonth() + 1);
    return { totalCapital, totalCurrentValue, totalUnrealised, totalUnrealisedPct, allTimeDividends, ytdDividends, lastYearDividends, divGrowth, totalReturn, totalReturnPct, monthlyAvgDiv };
  }, [enrichedHoldings, transactions, currentYear, lastYear]);

  const categoryRows = useMemo(() => {
    return CATEGORIES.map(cat => {
      const hs = enrichedHoldings.filter(h => h.category === cat);
      if (hs.length === 0) return null;
      const capital = hs.reduce((s, h) => s + h.totalCost, 0);
      const priced = hs.filter(h => h.hasLivePrice);
      const currentValue = priced.reduce((s, h) => s + (h.currentValue ?? 0), 0);
      const pricedCapital = priced.reduce((s, h) => s + h.totalCost, 0);
      const capitalGainPct = pricedCapital > 0 ? ((currentValue - pricedCapital) / pricedCapital) * 100 : 0;
      const ytdDividends = hs.reduce((s, h) => s + h.ytdDividends, 0);
      const dividendYield = capital > 0 ? (ytdDividends / capital) * 100 : 0;
      return { category: cat, capital, currentValue, capitalGainPct, dividendYield, totalReturnPct: capitalGainPct + dividendYield, ytdDividends, hasLivePrice: priced.length > 0 };
    }).filter(Boolean) as any[];
  }, [enrichedHoldings]);

  const allocationBreakdown = useMemo(() => {
    const total = categoryRows.reduce((s, r) => s + r.capital, 0);
    return categoryRows.map(r => ({ category: r.category, capital: r.capital, pct: total > 0 ? (r.capital / total) * 100 : 0 })).sort((a, b) => b.pct - a.pct);
  }, [categoryRows]);

  const alerts = useMemo(() => {
    const list: { type: 'warn' | 'good' | 'info'; icon: string; title: string; body: string }[] = [];
    const top = allocationBreakdown[0];
    if (top && top.pct >= 50) list.push({ type: 'warn', icon: '⚠️', title: 'Concentration risk', body: `${top.category} makes up ${top.pct.toFixed(0)}% of your portfolio. A single category dip drags everything.` });
    if (totals.divGrowth !== null && totals.divGrowth > 0) list.push({ type: 'good', icon: '✅', title: 'Dividend growing well', body: `Your YTD dividend income is up ${totals.divGrowth.toFixed(1)}% vs last year. Keep topping up.` });
    const bigUnrealised = enrichedHoldings.filter(h => h.pl !== null && h.pl > 0).sort((a, b) => (b.pl ?? 0) - (a.pl ?? 0))[0];
    if (bigUnrealised) list.push({ type: 'info', icon: 'ℹ️', title: 'Unrealised gains sitting idle', body: `${bigUnrealised.symbol} has +${fmt(bigUnrealised.pl!, bigUnrealised.currency)} unrealised gain. Consider whether it's time to rebalance.` });
    if (list.length === 0) list.push({ type: 'info', icon: 'ℹ️', title: 'Portfolio looks balanced', body: 'No major concentration risks detected. Keep tracking your dividends and review quarterly.' });
    return list;
  }, [allocationBreakdown, totals, enrichedHoldings]);

  const brokerBreakdown = useMemo(() => {
    const map = new Map<string, { invested: number; currentValue: number; hasLivePrice: boolean }>();
    for (const h of enrichedHoldings) {
      const b = h.broker || 'Unknown';
      const ex = map.get(b) ?? { invested: 0, currentValue: 0, hasLivePrice: false };
      ex.invested += h.totalCost;
      if (h.currentValue !== null) { ex.currentValue += h.currentValue; ex.hasLivePrice = true; }
      map.set(b, ex);
    }
    return Array.from(map.entries()).map(([broker, d]) => ({ broker, ...d })).sort((a, b) => b.invested - a.invested);
  }, [enrichedHoldings]);

  if (authLoading || loading) {
    return (
      <>
        <NavBar />
        <main><div className="loading-state">Loading insights...</div></main>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <main>
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>Investment Insights</h1>
            <p>Understand your portfolio — not just the numbers, but what they mean</p>
          </div>
          {loadingPrices && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#64748b', padding: '8px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span className="loading-spinner" style={{ width: 12, height: 12 }} />
              Loading live prices...
            </div>
          )}
        </div>

        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">Overview</p><h2>Net worth snapshot</h2></div></div>
          <div className="overview-grid">
            <div className="summary-card">
              <div className="stat-title">Total invested</div>
              <div className="stat-value">{fmt(totals.totalCapital)}</div>
              <div className="stat-sub">{currentHoldings.length} active holdings</div>
            </div>
            <div className={`summary-card ${totals.totalUnrealised >= 0 ? 'profit' : 'loss'}`}>
              <div className="stat-title">Unrealised P/L</div>
              <div className="stat-value">{fmt(totals.totalUnrealised)}</div>
              <div className="stat-sub">{fmtPct(totals.totalUnrealisedPct)} on invested capital</div>
            </div>
            <div className="summary-card profit">
              <div className="stat-title">Total return (capital + dividends)</div>
              <div className="stat-value" style={{ color: totals.totalReturn >= 0 ? '#059669' : '#dc2626' }}>{fmt(totals.totalReturn)}</div>
              <div className="stat-sub">{fmtPct(totals.totalReturnPct)} all-in return</div>
            </div>
            <div className="summary-card">
              <div className="stat-title">Dividend income YTD {currentYear}</div>
              <div className="stat-value">{fmt(totals.ytdDividends)}</div>
              <div className="stat-sub">
                {fmt(totals.monthlyAvgDiv)}/mo avg
                {totals.divGrowth !== null && (
                  <span style={{ marginLeft: 8, padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: totals.divGrowth >= 0 ? '#EAF3DE' : '#FCEBEB', color: totals.divGrowth >= 0 ? '#3B6D11' : '#A32D2D' }}>
                    {totals.divGrowth >= 0 ? '↑' : '↓'} {Math.abs(totals.divGrowth).toFixed(1)}% vs {lastYear}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">This month</p><h2>Monthly activity summary</h2></div></div>
          <MonthlyActivitySummary transactions={transactions} />
        </section>

        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">Signals</p><h2>What the numbers are telling you</h2></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {alerts.map((a, i) => <AlertBox key={i} {...a} />)}
          </div>
        </section>

        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">Goals</p><h2>Passive income progress</h2></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>Monthly dividend goal</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                {fmt(totals.monthlyAvgDiv)}<span style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}> / mo</span>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Target: {fmt(DIV_GOAL)}/mo</div>
              <div style={{ background: '#f1f5f9', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min((totals.monthlyAvgDiv / DIV_GOAL) * 100, 100)}%`, height: '100%', background: '#378ADD', borderRadius: 4 }} />
              </div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                {((totals.monthlyAvgDiv / DIV_GOAL) * 100).toFixed(0)}% of goal
                {totals.monthlyAvgDiv < DIV_GOAL && ` · need ${fmt(DIV_GOAL - totals.monthlyAvgDiv)}/mo more`}
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>All-time dividends collected</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#059669', marginBottom: 4 }}>{fmt(totals.allTimeDividends)}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>YTD {currentYear}: {fmt(totals.ytdDividends)}<br />{lastYear}: {fmt(totals.lastYearDividends)}</div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>Effective yield on cost (YTD)</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                {totals.totalCapital > 0 ? ((totals.ytdDividends / totals.totalCapital) * 100).toFixed(2) : '0.00'}%
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Based on {fmt(totals.ytdDividends)} YTD dividends<br />on {fmt(totals.totalCapital)} total invested</div>
            </div>
          </div>
        </section>

        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">Performance</p><h2>By asset class</h2></div></div>
          <CategoryReturnTable rows={categoryRows} />
        </section>

        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">Diversification</p><h2>Portfolio allocation</h2></div></div>
          <AllocationBar breakdown={allocationBreakdown} />
        </section>

        {enrichedHoldings.some(h => h.hasLivePrice) && (
          <section style={{ marginBottom: 20 }}>
            <div className="section-title"><div><p className="eyebrow">Rankings</p><h2>Best & worst performers</h2></div></div>
            <PerformersRow holdings={enrichedHoldings} />
          </section>
        )}

        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">Income</p><h2>Dividend trend</h2></div></div>
          <DividendYoYChart transactions={transactions} />
        </section>

        {brokerBreakdown.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <div className="section-title"><div><p className="eyebrow">Brokers</p><h2>By broker</h2></div></div>
            <BrokerTable data={brokerBreakdown} />
          </section>
        )}

        {currentHoldings.length === 0 && (
          <div className="empty-state">
            <p>No transaction data yet. Add some transactions in the Dashboard to see your insights.</p>
          </div>
        )}
      </main>
    </>
  );
}