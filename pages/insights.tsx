import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
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
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtPct(value: number, showPlus = true) {
  const sign = showPlus && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

// ─── Mini YoY Dividend Chart ─────────────────────────────────────────────────

function DividendYoYChart({ transactions }: { transactions: Transaction[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;

  const data = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const thisYear = Array(12).fill(0);
    const prevYear = Array(12).fill(0);

    transactions
      .filter(tx => tx.type === 'DIVIDEND' && tx.trade_date)
      .forEach(tx => {
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
            {
              label: String(lastYear),
              data: data.prevYear,
              backgroundColor: '#B5D4F4',
              borderRadius: 3,
              borderSkipped: false,
            },
            {
              label: String(currentYear),
              data: data.thisYear,
              backgroundColor: '#378ADD',
              borderRadius: 3,
              borderSkipped: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx: any) => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`,
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 11 } } },
            y: {
              grid: { color: 'rgba(0,0,0,0.06)' },
              beginAtZero: true,
              ticks: {
                font: { size: 11 },
                callback: (v: any) => 'S$' + (Number(v) >= 1000 ? (Number(v) / 1000).toFixed(1) + 'k' : v),
              },
            },
          },
        },
      });
    }

    const win = window as any;
    if (win.Chart) {
      render();
    } else {
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
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
            Dividend income — year on year
          </div>
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
              <span style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                background: growth > 0 ? '#EAF3DE' : '#FCEBEB',
                color: growth > 0 ? '#3B6D11' : '#A32D2D',
              }}>
                {growth > 0 ? '↑' : '↓'} {Math.abs(growth).toFixed(1)}% vs last year
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>Monthly avg ({currentYear})</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
            {fmt(thisYearTotal / new Date().getMonth() || 1)}
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

function AllocationBar({ breakdown }: {
  breakdown: { category: string; pct: number; capital: number }[]
}) {
  const CONCENTRATION_THRESHOLD = 50;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
        Portfolio allocation
      </div>
      {/* Stacked bar */}
      <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', gap: 2, marginBottom: 16 }}>
        {breakdown.map(d => (
          <div
            key={d.category}
            style={{ width: `${d.pct}%`, background: CATEGORY_COLORS[d.category] ?? '#94a3b8', minWidth: d.pct > 1 ? 2 : 0 }}
            title={`${d.category}: ${d.pct.toFixed(1)}%`}
          />
        ))}
      </div>
      {/* Legend rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {breakdown.map(d => {
          const isHeavy = d.pct >= CONCENTRATION_THRESHOLD;
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
              <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: badge.bg, color: badge.color, minWidth: 46, textAlign: 'center' }}>
                {badge.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Category Return Table ────────────────────────────────────────────────────

function CategoryReturnTable({ rows }: {
  rows: {
    category: string;
    capital: number;
    currentValue: number;
    capitalGainPct: number;
    dividendYield: number;
    totalReturnPct: number;
    ytdDividends: number;
    hasLivePrice: boolean;
  }[]
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
                <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Category' ? 'left' : 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
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
                <td style={{ padding: '12px 14px', textAlign: 'right', color: '#0f172a', fontWeight: 500 }}>
                  {row.hasLivePrice ? fmt(row.currentValue) : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                  {row.hasLivePrice ? (
                    <span style={{ fontWeight: 700, color: row.capitalGainPct >= 0 ? '#059669' : '#dc2626' }}>
                      {fmtPct(row.capitalGainPct)}
                    </span>
                  ) : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                  <span style={{ fontWeight: 700, color: row.dividendYield > 0 ? '#059669' : '#94a3b8' }}>
                    {row.dividendYield > 0 ? fmtPct(row.dividendYield, false) : '—'}
                  </span>
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                  {row.hasLivePrice ? (
                    <span style={{
                      fontWeight: 700,
                      color: row.totalReturnPct >= 0 ? '#059669' : '#dc2626',
                      padding: '3px 8px', borderRadius: 4,
                      background: row.totalReturnPct >= 0 ? '#EAF3DE' : '#FCEBEB',
                    }}>
                      {fmtPct(row.totalReturnPct)}
                    </span>
                  ) : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
                <td style={{ padding: '12px 14px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>
                  {row.ytdDividends > 0 ? fmt(row.ytdDividends) : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
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

// ─── Alert Box ────────────────────────────────────────────────────────────────

function AlertBox({ type, icon, title, body }: {
  type: 'warn' | 'good' | 'info';
  icon: string;
  title: string;
  body: string;
}) {
  const styles = {
    warn: { bg: '#FAEEDA', border: '#EF9F27', color: '#633806' },
    good: { bg: '#EAF3DE', border: '#639922', color: '#27500A' },
    info: { bg: '#E6F1FB', border: '#85B7EB', color: '#0C447C' },
  }[type];

  return (
    <div style={{ background: styles.bg, border: `1px solid ${styles.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: styles.color, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: styles.color, lineHeight: 1.5, opacity: 0.9 }}>{body}</div>
      </div>
    </div>
  );
}

// ─── Top / Worst Performer ────────────────────────────────────────────────────

function PerformersRow({ holdings }: {
  holdings: { symbol: string; productName: string; plPct: number | null; pl: number | null; currency: string; ytdDividends: number; capital: number }[]
}) {

  const withPrices = holdings.filter(h => h.plPct !== null);
  if (withPrices.length === 0) return null;

  const best = withPrices.reduce((a, b) => (b.plPct! > a.plPct! ? b : a));
  const worst = withPrices.reduce((a, b) => (b.plPct! < a.plPct! ? b : a));

  // best dividend yield on cost
  const bestDiv = holdings
    .filter(h => h.capital > 0 && h.ytdDividends > 0)
    .sort((a, b) => (b.ytdDividends / b.capital) - (a.ytdDividends / a.capital))[0];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
      {[
        { label: '🔥 Top performer', holding: best, color: '#059669', bg: '#EAF3DE', pctStr: fmtPct(best.plPct!) },
        { label: '📉 Worst performer', holding: worst, color: '#dc2626', bg: '#FCEBEB', pctStr: fmtPct(worst.plPct!) },
        ...(bestDiv ? [{ label: '💰 Best dividend yield', holding: bestDiv, color: '#185FA5', bg: '#E6F1FB', pctStr: fmtPct((bestDiv.ytdDividends / bestDiv.capital) * 100, false) + ' yield' }] : []),
      ].map(({ label, holding, color, bg, pctStr }) => (
        <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>{label}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{holding.symbol}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{holding.productName}</div>
            </div>
            <span style={{ fontWeight: 800, fontSize: 16, color, background: bg, padding: '4px 10px', borderRadius: 6 }}>
              {pctStr}
            </span>
          </div>
          {holding.pl !== null && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
              {holding.pl >= 0 ? '+' : ''}{fmt(holding.pl, holding.currency)} unrealised
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Broker Table ─────────────────────────────────────────────────────────────

function BrokerTable({ data }: {
  data: { broker: string; invested: number; currentValue: number; hasLivePrice: boolean }[]
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
        By broker
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {['Broker', 'Invested', 'Current value', 'Gain / Loss'].map(h => (
              <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Broker' ? 'left' : 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                {h}
              </th>
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
                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#0f172a', fontWeight: 500 }}>
                  {d.hasLivePrice ? fmt(d.currentValue) : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  {d.hasLivePrice ? (
                    <span style={{ fontWeight: 700, color: gl >= 0 ? '#059669' : '#dc2626' }}>
                      {gl >= 0 ? '+' : ''}{fmt(gl)} ({fmtPct(glPct)})
                    </span>
                  ) : <span style={{ color: '#94a3b8' }}>—</span>}
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

export default function InsightsPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
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

  // Current holdings (quantity > 0)
  const currentHoldings = useMemo(() => {
    const map = new Map<string, {
      symbol: string; productName: string; category: string;
      broker: string; currency: string; quantity: number; totalCost: number;
    }>();
    for (const tx of transactions) {
      const key = `${tx.symbol}__${tx.broker}`;
      const existing = map.get(key) ?? {
        symbol: tx.symbol, productName: tx.product_name, category: tx.category,
        broker: tx.broker, currency: tx.currency, quantity: 0, totalCost: 0,
      };
      if (tx.type === 'BUY' || tx.type === 'SELL') {
        existing.quantity += tx.quantity ?? 0;
        existing.totalCost += (tx.quantity ?? 0) * (tx.price ?? 0) + (tx.commission ?? 0);
      }
      if (tx.product_name) existing.productName = tx.product_name;
      map.set(key, existing);
    }
    return Array.from(map.values()).filter(h => h.quantity > 0.0001);
  }, [transactions]);

  // Fetch quotes
  useEffect(() => {
    if (currentHoldings.length === 0) return;
    void (async () => {
      setLoadingPrices(true);
      const next: Record<string, QuoteResponse> = {};

      const utHoldings = currentHoldings.filter(h => h.category === 'Unit Trusts');
      const otherHoldings = currentHoldings.filter(h => h.category !== 'Unit Trusts');

      await Promise.all(Array.from(new Set(utHoldings.map(h => h.symbol))).map(async sym => {
        const h = currentHoldings.find(x => x.symbol === sym);
        try {
          const r = await fetch(`/api/fund-quote?s=${encodeURIComponent(sym.includes(':') ? sym : sym + ':SGD')}&name=${encodeURIComponent(h?.productName ?? '')}`);
          if (!r.ok) return;
          const j = await r.json();
          if (typeof j.price === 'number') next[sym] = { symbol: sym, currency: 'SGD', price: j.price, asOf: j.lastUpdated ?? null };
        } catch {}
      }));

      await Promise.all(Array.from(new Set(otherHoldings.map(h => h.symbol))).map(async sym => {
        try {
          const r = await fetch(`/api/quote?symbol=${encodeURIComponent(sym)}`);
          if (!r.ok) return;
          next[sym] = await r.json();
        } catch {}
      }));

      setQuotes(next);
      setLoadingPrices(false);
    })();
  }, [currentHoldings]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const lastYear = currentYear - 1;

  // Per-holding enriched data
  const enrichedHoldings = useMemo(() => {
    return currentHoldings.map(h => {
      const quote = quotes[h.symbol];
      const currentPrice = quote?.price ?? null;
      const currentValue = currentPrice !== null ? currentPrice * h.quantity : null;
      const pl = currentValue !== null ? currentValue - h.totalCost : null;
      const plPct = pl !== null && h.totalCost > 0 ? (pl / h.totalCost) * 100 : null;

      const ytdDividends = transactions
        .filter(tx => tx.type === 'DIVIDEND' && tx.symbol === h.symbol && tx.broker === h.broker
          && tx.trade_date && new Date(tx.trade_date).getFullYear() === currentYear)
        .reduce((s, tx) => s + (tx.dividend_amount ?? 0), 0);

      return { ...h, capital: h.totalCost, currentPrice, currentValue, pl, plPct, ytdDividends, hasLivePrice: currentPrice !== null };
    });
  }, [currentHoldings, quotes, transactions, currentYear]);

  // Totals
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
    const currentMonth = new Date().getMonth() + 1;
    const monthlyAvgDiv = ytdDividends / currentMonth;

    return {
      totalCapital, totalCurrentValue, totalUnrealised, totalUnrealisedPct,
      allTimeDividends, ytdDividends, lastYearDividends, divGrowth,
      totalReturn, totalReturnPct, monthlyAvgDiv,
    };
  }, [enrichedHoldings, transactions, currentYear, lastYear]);

  // Category breakdown for table
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
      const totalReturnPct = capitalGainPct + dividendYield;

      return { category: cat, capital, currentValue, capitalGainPct, dividendYield, totalReturnPct, ytdDividends, hasLivePrice: priced.length > 0 };
    }).filter(Boolean) as any[];
  }, [enrichedHoldings]);

  // Allocation for bar
  const allocationBreakdown = useMemo(() => {
    const total = categoryRows.reduce((s, r) => s + r.capital, 0);
    return categoryRows.map(r => ({ category: r.category, capital: r.capital, pct: total > 0 ? (r.capital / total) * 100 : 0 }))
      .sort((a, b) => b.pct - a.pct);
  }, [categoryRows]);

  // Alerts
  const alerts = useMemo(() => {
    const list: { type: 'warn' | 'good' | 'info'; icon: string; title: string; body: string }[] = [];
    const top = allocationBreakdown[0];
    if (top && top.pct >= 50) {
      list.push({ type: 'warn', icon: '⚠️', title: 'Concentration risk', body: `${top.category} makes up ${top.pct.toFixed(0)}% of your portfolio. A single category dip drags everything. Consider if you're comfortable with this.` });
    }
    if (totals.divGrowth !== null && totals.divGrowth > 0) {
      list.push({ type: 'good', icon: '✅', title: 'Dividend growing well', body: `Your YTD dividend income is up ${totals.divGrowth.toFixed(1)}% vs last year. You're building a solid passive income stream — keep topping up.` });
    }
    const bigUnrealised = enrichedHoldings.filter(h => h.pl !== null && h.pl > 0).sort((a, b) => (b.pl ?? 0) - (a.pl ?? 0))[0];
    if (bigUnrealised) {
      list.push({ type: 'info', icon: 'ℹ️', title: 'Unrealised gains sitting idle', body: `${bigUnrealised.symbol} has +${fmt(bigUnrealised.pl!, bigUnrealised.currency)} unrealised gain. Consider whether it's time to take some profit or rebalance.` });
    }
    if (list.length === 0) {
      list.push({ type: 'info', icon: 'ℹ️', title: 'Portfolio looks balanced', body: 'No major concentration risks detected. Keep tracking your dividends and review quarterly.' });
    }
    return list;
  }, [allocationBreakdown, totals, enrichedHoldings]);

  // Broker breakdown
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
        <header className="site-header">
          <nav className="site-nav">
            <Link href="/" className="site-logo">📊 Portfolio Tracker</Link>
          </nav>
        </header>
        <main><div className="loading-state">Loading insights...</div></main>
      </>
    );
  }

  const DIV_GOAL = 500; // monthly dividend goal in SGD

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

        {/* ── Section 1: Net worth snapshot ── */}
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
              <div className="stat-value" style={{ color: totals.totalReturn >= 0 ? '#059669' : '#dc2626' }}>
                {fmt(totals.totalReturn)}
              </div>
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

        {/* ── Section 2: What the numbers mean ── */}
        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">Signals</p><h2>What the numbers are telling you</h2></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {alerts.map((a, i) => <AlertBox key={i} {...a} />)}
          </div>
        </section>

        {/* ── Section 3: Passive income goal ── */}
        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">Goals</p><h2>Passive income progress</h2></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
            {/* Monthly dividend goal */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>Monthly dividend goal</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                {fmt(totals.monthlyAvgDiv)}
                <span style={{ fontSize: 14, fontWeight: 500, color: '#64748b' }}> / mo</span>
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
            {/* All-time dividends */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>All-time dividends collected</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#059669', marginBottom: 4 }}>{fmt(totals.allTimeDividends)}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                YTD {currentYear}: {fmt(totals.ytdDividends)}<br />
                {lastYear}: {fmt(totals.lastYearDividends)}
              </div>
            </div>
            {/* Effective yield */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>Effective yield on cost (YTD)</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                {totals.totalCapital > 0 ? ((totals.ytdDividends / totals.totalCapital) * 100).toFixed(2) : '0.00'}%
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Based on {fmt(totals.ytdDividends)} YTD dividends<br />
                on {fmt(totals.totalCapital)} total invested
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 4: Performance by category ── */}
        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">Performance</p><h2>By asset class</h2></div></div>
          <CategoryReturnTable rows={categoryRows} />
        </section>

        {/* ── Section 5: Allocation ── */}
        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">Diversification</p><h2>Portfolio allocation</h2></div></div>
          <AllocationBar breakdown={allocationBreakdown} />
        </section>

        {/* ── Section 6: Best / Worst ── */}
        {enrichedHoldings.some(h => h.hasLivePrice) && (
          <section style={{ marginBottom: 20 }}>
            <div className="section-title"><div><p className="eyebrow">Rankings</p><h2>Best & worst performers</h2></div></div>
            <PerformersRow holdings={enrichedHoldings} />
          </section>
        )}

        {/* ── Section 7: Dividend YoY chart ── */}
        <section style={{ marginBottom: 20 }}>
          <div className="section-title"><div><p className="eyebrow">Income</p><h2>Dividend trend</h2></div></div>
          <DividendYoYChart transactions={transactions} />
        </section>

        {/* ── Section 8: By broker ── */}
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