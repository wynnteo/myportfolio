import Link from 'next/link';
import { useState, FormEvent, useMemo } from 'react';
import { useAuth } from '../lib/AuthContext';

type CalculatorTab = 'breakeven' | 'average' | 'profit' | 'position' | 'dividend' | 'sgtax';

export default function CalculatorPage() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<CalculatorTab>('breakeven');

  return (
    <>
      <header className="site-header">
        <nav className="site-nav">
          <Link href="/" className="site-logo">
            📊 Portfolio Tracker
          </Link>
          <div className="nav-menu">
            <Link href="/">Home</Link>
            {user ? (
              <>
                <Link href="/dashboard">Dashboard</Link>
                <Link href="/transactions">Transactions</Link>
                <Link href="/calculator">Calculator</Link>
                <Link href="/referrals">Referrals</Link>
                <button onClick={() => void logout()}>Logout</button>
              </>
            ) : (
              <>
                <Link href="/calculator">Calculator</Link>
                <Link href="/referrals">Referrals</Link>
                <Link href="/login">Login</Link>
                <Link href="/register" className="nav-primary">Get Started</Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main>
        <div className="page-header">
          <h1>Stock Calculators</h1>
          <p>Essential tools for stock trading calculations</p>
        </div>

        <div className="calculator-tabs">
          <button className={`calc-tab ${activeTab === 'breakeven' ? 'active' : ''}`} onClick={() => setActiveTab('breakeven')}>Breakeven</button>
          <button className={`calc-tab ${activeTab === 'average' ? 'active' : ''}`} onClick={() => setActiveTab('average')}>Average Price</button>
          <button className={`calc-tab ${activeTab === 'profit' ? 'active' : ''}`} onClick={() => setActiveTab('profit')}>Profit/Loss</button>
          <button className={`calc-tab ${activeTab === 'position' ? 'active' : ''}`} onClick={() => setActiveTab('position')}>Position Size</button>
          <button className={`calc-tab ${activeTab === 'dividend' ? 'active' : ''}`} onClick={() => setActiveTab('dividend')}>Dividend Yield</button>
          <button className={`calc-tab ${activeTab === 'sgtax' ? 'active' : ''}`} onClick={() => setActiveTab('sgtax')}>🇸🇬 Income Tax</button>
        </div>

        <div className="calculator-content">
          {activeTab === 'breakeven' && <BreakevenCalculator />}
          {activeTab === 'average' && <AveragePriceCalculator />}
          {activeTab === 'profit' && <ProfitLossCalculator />}
          {activeTab === 'position' && <PositionSizeCalculator />}
          {activeTab === 'dividend' && <DividendYieldCalculator />}
          {activeTab === 'sgtax' && <SGIncomeTaxCalculator />}
        </div>
      </main>
    </>
  );
}

// ─── Singapore Income Tax Calculator ────────────────────────────────────────

interface TaxBracket {
  upTo: number;        // cumulative upper limit
  rate: number;        // marginal rate %
  baseTax: number;     // tax already paid on income up to previous bracket
}

// YA 2024 tax table (resident individuals)
const TAX_BRACKETS: TaxBracket[] = [
  { upTo: 20_000,    rate: 0,    baseTax: 0 },
  { upTo: 30_000,    rate: 2,    baseTax: 0 },
  { upTo: 40_000,    rate: 3.5,  baseTax: 200 },
  { upTo: 80_000,    rate: 7,    baseTax: 550 },
  { upTo: 120_000,   rate: 11.5, baseTax: 3_350 },
  { upTo: 160_000,   rate: 15,   baseTax: 7_950 },
  { upTo: 200_000,   rate: 18,   baseTax: 13_950 },
  { upTo: 240_000,   rate: 19,   baseTax: 21_150 },
  { upTo: 280_000,   rate: 19.5, baseTax: 28_750 },
  { upTo: 320_000,   rate: 20,   baseTax: 36_550 },
  { upTo: 500_000,   rate: 22,   baseTax: 44_550 },
  { upTo: 1_000_000, rate: 23,   baseTax: 84_150 },
  { upTo: Infinity,  rate: 24,   baseTax: 199_150 },
];

function computeTax(chargeableIncome: number): number {
  if (chargeableIncome <= 0) return 0;
  for (const bracket of TAX_BRACKETS) {
    if (chargeableIncome <= bracket.upTo) {
      const prevLimit = TAX_BRACKETS[TAX_BRACKETS.indexOf(bracket) - 1]?.upTo ?? 0;
      return bracket.baseTax + ((chargeableIncome - prevLimit) * bracket.rate) / 100;
    }
  }
  return 0;
}

function fmt(val: number): string {
  return val.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SGIncomeTaxCalculator() {
  // ── Income ───────────────────────────────────────────────────────────────
  const [salary, setSalary]   = useState('');
  const [bonus, setBonus]     = useState('');
  const [others, setOthers]   = useState('');

  // ── Deductions ───────────────────────────────────────────────────────────
  const [donationAmt, setDonationAmt] = useState('');          // raw donation amount before multiplier
  const [child2Relief, setChild2Relief] = useState('10000');
  const [cpfTopUp, setCpfTopUp]     = useState('');
  const [srsTopUp, setSrsTopUp]     = useState('');

  // ── Results ───────────────────────────────────────────────────────────────
  const result = useMemo(() => {
    const salaryNum  = parseFloat(salary)  || 0;
    const bonusNum   = parseFloat(bonus)   || 0;
    const othersNum  = parseFloat(others)  || 0;
    const totalIncome = salaryNum + bonusNum + othersNum;

    if (totalIncome <= 0) return null;

    // CPF Relief (employee OW + AW)
    // Ordinary Wage ceiling: $7,400/month → $88,800/year contribution base
    // Additional Wage (bonus) ceiling: $102,000 - OW contributed
    // Employee CPF rate assumed 20% (age ≤ 55)
    const owContrib = Math.min(salaryNum, 88800) * 0.20;
    const awCeiling = Math.max(0, 102_000 - Math.min(salaryNum, 88800));
    const awContrib = Math.min(bonusNum, awCeiling) * 0.20;
    const cpfRelief = owContrib + awContrib;

    // Child 1: 15% of earned income (salary + bonus)
    const earnedIncome = salaryNum + bonusNum;
    const child1Relief = earnedIncome * 0.15;

    // Donation: amount * (donation% / 100) → actual deduction at 2.5×
    const donAmt = parseFloat(donationAmt) || 0;
    const donationDeduction = donAmt * 2.5;

    const child2  = parseFloat(child2Relief) || 0;
    const cpfTop  = parseFloat(cpfTopUp)     || 0;
    const srsTop  = parseFloat(srsTopUp)     || 0;

    const totalDeductions = donationDeduction + child1Relief + child2 + cpfRelief + cpfTop + srsTop;
    const chargeableIncome = Math.max(0, totalIncome - totalDeductions);
    const taxPayable = computeTax(chargeableIncome);
    const effectiveRate = totalIncome > 0 ? (taxPayable / totalIncome) * 100 : 0;

    return {
      totalIncome,
      donationDeduction,
      child1Relief,
      child2,
      cpfRelief,
      cpfTop,
      srsTop,
      totalDeductions,
      chargeableIncome,
      taxPayable,
      effectiveRate,
      earnedIncome,
    };
  }, [salary, bonus, others, donationAmt, child2Relief, cpfTopUp, srsTopUp]);

  function handleReset() {
    setSalary(''); setBonus(''); setOthers('');
    setDonation('90'); setDonationAmt('');
    setChild2Relief('10000'); setCpfTopUp(''); setSrsTopUp('');
  }

  return (
    <div className="calculator-card" style={{ maxWidth: '900px' }}>
      <div className="calc-header">
        <h2>🇸🇬 Singapore Income Tax Estimator</h2>
        <p className="calc-description">
          Estimate your YA 2024 personal income tax based on your income and reliefs
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>

        {/* ── LEFT: Income + Deductions ── */}
        <div>
          {/* Income Section */}
          <div className="calc-section">
            <h3 className="calc-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ background: '#3b82f6', color: '#fff', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em' }}>INCOME</span>
            </h3>
            <div className="calc-input-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>
                Annual Salary (S$)
                <input type="number" step="1" min="0" value={salary}
                  onChange={e => setSalary(e.target.value)} placeholder="e.g. 96000" />
              </label>
              <label>
                Bonus (S$)
                <input type="number" step="1" min="0" value={bonus}
                  onChange={e => setBonus(e.target.value)} placeholder="e.g. 12000" />
              </label>
              <label>
                Other Income (S$)
                <input type="number" step="1" min="0" value={others}
                  onChange={e => setOthers(e.target.value)} placeholder="e.g. rental, freelance" />
              </label>
            </div>
            {result && (
              <div style={{ marginTop: '8px', padding: '10px 14px', background: '#f0f9ff', borderRadius: '8px', fontSize: '13px', color: '#0369a1', fontWeight: 600 }}>
                Total Income: S${fmt(result.totalIncome)}
              </div>
            )}
          </div>

          {/* Deductions Section */}
          <div className="calc-section" style={{ marginTop: '20px' }}>
            <h3 className="calc-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ background: '#10b981', color: '#fff', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em' }}>DEDUCTIONS</span>
            </h3>
            <div className="calc-input-grid" style={{ gridTemplateColumns: '1fr' }}>

              {/* Donation */}
              <label>
                Donation Amount (S$)
                <input type="number" step="1" min="0" value={donationAmt}
                  onChange={e => setDonationAmt(e.target.value)} placeholder="e.g. 500" />
              </label>

              {/* Child Relief */}
              <label>
                Child 1 Relief
                <input
                  type="text"
                  readOnly
                  value={result ? `S$${fmt(result.child1Relief)} (15% of earned income)` : '15% of salary + bonus'}
                  style={{ background: '#f8fafc', color: '#64748b', cursor: 'default' }}
                />
              </label>
              <label>
                Child 2 Relief (S$)
                <input type="number" step="1" min="0" value={child2Relief}
                  onChange={e => setChild2Relief(e.target.value)} placeholder="10000" />
              </label>

              {/* CPF Relief – auto-computed */}
              <label>
                CPF Relief (auto-computed)
                <input
                  type="text"
                  readOnly
                  value={result ? `S$${fmt(result.cpfRelief)}` : 'Enter salary & bonus first'}
                  style={{ background: '#f8fafc', color: '#64748b', cursor: 'default' }}
                />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  Employee CPF @ 20% on OW (≤S$6K/mo) + AW (≤S$102K − OW ceiling)
                </span>
              </label>

              {/* CPF Top Up */}
              <label>
                CPF Voluntary Top-Up (S$)
                <input type="number" step="1" min="0" max="8000" value={cpfTopUp}
                  onChange={e => setCpfTopUp(e.target.value)} placeholder="Max S$8,000" />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  Cash top-up to own CPF SA/RA — relief capped at S$8,000
                </span>
              </label>

              {/* SRS Top Up */}
              <label>
                SRS Contribution (S$)
                <input type="number" step="1" min="0" max="15300" value={srsTopUp}
                  onChange={e => setSrsTopUp(e.target.value)} placeholder="Max S$15,300" />
                <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', display: 'block' }}>
                  SRS contribution — relief capped at S$15,300 (Singapore Citizens/PRs)
                </span>
              </label>
            </div>
          </div>

          <div className="calc-actions" style={{ marginTop: '16px' }}>
            <button type="button" onClick={handleReset} className="calc-reset">Reset</button>
          </div>
        </div>

        {/* ── RIGHT: Results ── */}
        <div>
          {!result ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '100%', minHeight: '300px', color: '#94a3b8', textAlign: 'center', gap: '12px'
            }}>
              <span style={{ fontSize: '48px' }}>🧮</span>
              <p style={{ fontSize: '14px' }}>Enter your income on the left to see your tax estimate</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Deductions breakdown */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Deductions Breakdown
                </div>
                {[
                  { label: 'Donation Relief (2.5×)', value: result.donationDeduction },
                  { label: 'Child 1 Relief (15%)', value: result.child1Relief },
                  { label: `Child 2 Relief`, value: result.child2 },
                  { label: 'CPF Employee Relief', value: result.cpfRelief },
                  { label: 'CPF Top-Up Relief', value: result.cpfTop },
                  { label: 'SRS Relief', value: result.srsTop },
                ].filter(r => r.value > 0).map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '4px 0', borderBottom: '1px solid #dcfce7' }}>
                    <span style={{ color: '#374151' }}>{r.label}</span>
                    <span style={{ fontWeight: 600, color: '#059669' }}>−S${fmt(r.value)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700, color: '#166534', paddingTop: '8px', marginTop: '4px' }}>
                  <span>Total Deductions</span>
                  <span>−S${fmt(result.totalDeductions)}</span>
                </div>
              </div>

              {/* Chargeable income */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chargeable Income</div>
                    <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '2px' }}>Total Income − Total Deductions</div>
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#1e40af' }}>
                    S${fmt(result.chargeableIncome)}
                  </div>
                </div>
              </div>

              {/* Tax payable */}
              <div style={{
                background: result.taxPayable === 0 ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${result.taxPayable === 0 ? '#bbf7d0' : '#fecaca'}`,
                borderRadius: '12px',
                padding: '20px',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: result.taxPayable === 0 ? '#166534' : '#991b1b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  Estimated Tax Payable
                </div>
                <div style={{ fontSize: '36px', fontWeight: 900, color: result.taxPayable === 0 ? '#059669' : '#dc2626', lineHeight: 1 }}>
                  S${fmt(result.taxPayable)}
                </div>
                <div style={{ marginTop: '8px', fontSize: '13px', color: '#64748b' }}>
                  Effective rate: <strong>{result.effectiveRate.toFixed(2)}%</strong> of total income
                </div>
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1, background: '#ffffff', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Monthly Tax Equivalent</div>
                    <div style={{ fontWeight: 700, fontSize: '16px', color: '#0f172a' }}>S${fmt(result.taxPayable / 12)}</div>
                  </div>
                  <div style={{ flex: 1, background: '#ffffff', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Tax Savings from Relief</div>
                    <div style={{ fontWeight: 700, fontSize: '16px', color: '#059669' }}>
                      S${fmt(computeTax(result.totalIncome) - result.taxPayable)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tax bracket indicator */}
              <TaxBracketIndicator chargeableIncome={result.chargeableIncome} />

              <div style={{ fontSize: '11px', color: '#94a3b8', padding: '8px', background: '#f8fafc', borderRadius: '8px', lineHeight: 1.6 }}>
                ⚠️ This is an estimate only. Actual tax may differ. Consult IRAS or a tax professional for accurate filing. Does not account for all reliefs (e.g. NSman, Parent Relief, Handicapped Relief).
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaxBracketIndicator({ chargeableIncome }: { chargeableIncome: number }) {
  const brackets = [
    { label: '≤$20K', limit: 20_000, rate: '0%' },
    { label: '$30K', limit: 30_000, rate: '2%' },
    { label: '$40K', limit: 40_000, rate: '3.5%' },
    { label: '$80K', limit: 80_000, rate: '7%' },
    { label: '$120K', limit: 120_000, rate: '11.5%' },
    { label: '$160K', limit: 160_000, rate: '15%' },
    { label: '$200K', limit: 200_000, rate: '18%' },
    { label: '$240K', limit: 240_000, rate: '19%' },
    { label: '$280K', limit: 280_000, rate: '19.5%' },
    { label: '$320K', limit: 320_000, rate: '20%' },
    { label: '>$320K', limit: Infinity, rate: '22–24%' },
  ];

  const activeBracket = brackets.findIndex(b => chargeableIncome <= b.limit);

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
        Tax Bracket
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {brackets.map((b, i) => {
          const isActive = i === activeBracket;
          const isPast = activeBracket !== -1 && i < activeBracket;
          return (
            <div key={b.label} style={{
              padding: '4px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: isActive ? 700 : 500,
              background: isActive ? '#1e40af' : isPast ? '#dbeafe' : '#f1f5f9',
              color: isActive ? '#ffffff' : isPast ? '#1e40af' : '#94a3b8',
              border: isActive ? '2px solid #1e40af' : '2px solid transparent',
              transition: 'all 0.2s',
            }}>
              {b.label}
              {isActive && <span style={{ marginLeft: '4px', opacity: 0.85 }}>← {b.rate}</span>}
            </div>
          );
        })}
      </div>
      {activeBracket !== -1 && (
        <div style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
          Marginal rate on the next dollar: <strong style={{ color: '#1e40af' }}>{brackets[activeBracket].rate}</strong>
        </div>
      )}
    </div>
  );
}

// ─── Existing calculators (unchanged) ────────────────────────────────────────

function BreakevenCalculator() {
  const [buyPrice, setBuyPrice] = useState('');
  const [buyCommission, setBuyCommission] = useState('');
  const [sellCommission, setSellCommission] = useState('');
  const [result, setResult] = useState<number | null>(null);

  function handleCalculate(e: FormEvent) {
    e.preventDefault();
    const buy = parseFloat(buyPrice);
    const buyComm = parseFloat(buyCommission) || 0;
    const sellComm = parseFloat(sellCommission) || 0;
    if (!isNaN(buy)) setResult(buy + buyComm + sellComm);
  }

  function handleReset() { setBuyPrice(''); setBuyCommission(''); setSellCommission(''); setResult(null); }

  return (
    <div className="calculator-card">
      <div className="calc-header">
        <h2>Breakeven Price Calculator</h2>
        <p className="calc-description">Calculate the minimum selling price needed to breakeven after commissions</p>
      </div>
      <form onSubmit={handleCalculate} className="calc-form">
        <div className="calc-input-grid">
          <label>Buy Price per Share<input type="number" step="0.001" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="e.g., 10.50" required /></label>
          <label>Buy Commission (per share)<input type="number" step="0.001" value={buyCommission} onChange={e => setBuyCommission(e.target.value)} placeholder="e.g., 0.05" /></label>
          <label>Sell Commission (per share)<input type="number" step="0.001" value={sellCommission} onChange={e => setSellCommission(e.target.value)} placeholder="e.g., 0.05" /></label>
        </div>
        <div className="calc-actions">
          <button type="submit" className="calc-submit">Calculate</button>
          <button type="button" onClick={handleReset} className="calc-reset">Reset</button>
        </div>
      </form>
      {result !== null && (
        <div className="calc-result">
          <div className="result-label">Breakeven Price</div>
          <div className="result-value">${result.toFixed(3)}</div>
          <div className="result-note">You need to sell at <strong>${result.toFixed(3)}</strong> per share to breakeven</div>
        </div>
      )}
    </div>
  );
}

function AveragePriceCalculator() {
  const [currentQty, setCurrentQty] = useState('');
  const [currentAvgPrice, setCurrentAvgPrice] = useState('');
  const [addQty, setAddQty] = useState('');
  const [addPrice, setAddPrice] = useState('');
  const [result, setResult] = useState<{ newAvgPrice: number; totalQty: number; totalCost: number } | null>(null);

  function handleCalculate(e: FormEvent) {
    e.preventDefault();
    const currQty = parseFloat(currentQty), currAvg = parseFloat(currentAvgPrice);
    const newQty = parseFloat(addQty), newPrice = parseFloat(addPrice);
    if (!isNaN(currQty) && !isNaN(currAvg) && !isNaN(newQty) && !isNaN(newPrice)) {
      const totalCost = currQty * currAvg + newQty * newPrice;
      const totalQty = currQty + newQty;
      setResult({ newAvgPrice: totalCost / totalQty, totalQty, totalCost });
    }
  }

  function handleReset() { setCurrentQty(''); setCurrentAvgPrice(''); setAddQty(''); setAddPrice(''); setResult(null); }

  return (
    <div className="calculator-card">
      <div className="calc-header">
        <h2>Average Price Calculator</h2>
        <p className="calc-description">Calculate your new average price when averaging down or up</p>
      </div>
      <form onSubmit={handleCalculate} className="calc-form">
        <div className="calc-section">
          <h3 className="calc-section-title">Current Position</h3>
          <div className="calc-input-grid">
            <label>Current Quantity<input type="number" step="0.0001" value={currentQty} onChange={e => setCurrentQty(e.target.value)} placeholder="e.g., 100" required /></label>
            <label>Current Average Price<input type="number" step="0.001" value={currentAvgPrice} onChange={e => setCurrentAvgPrice(e.target.value)} placeholder="e.g., 10.50" required /></label>
          </div>
        </div>
        <div className="calc-section">
          <h3 className="calc-section-title">Additional Purchase</h3>
          <div className="calc-input-grid">
            <label>Additional Quantity<input type="number" step="0.0001" value={addQty} onChange={e => setAddQty(e.target.value)} placeholder="e.g., 50" required /></label>
            <label>Purchase Price<input type="number" step="0.001" value={addPrice} onChange={e => setAddPrice(e.target.value)} placeholder="e.g., 9.50" required /></label>
          </div>
        </div>
        <div className="calc-actions">
          <button type="submit" className="calc-submit">Calculate</button>
          <button type="button" onClick={handleReset} className="calc-reset">Reset</button>
        </div>
      </form>
      {result && (
        <div className="calc-result">
          <div className="result-grid">
            <div className="result-item"><div className="result-label">New Average Price</div><div className="result-value">${result.newAvgPrice.toFixed(3)}</div></div>
            <div className="result-item"><div className="result-label">Total Quantity</div><div className="result-value">{result.totalQty.toFixed(4)}</div></div>
            <div className="result-item"><div className="result-label">Total Cost</div><div className="result-value">${result.totalCost.toFixed(2)}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfitLossCalculator() {
  const [quantity, setQuantity] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [buyCommission, setBuyCommission] = useState('');
  const [sellCommission, setSellCommission] = useState('');
  const [result, setResult] = useState<{ profitLoss: number; profitLossPct: number; totalBuyCost: number; totalSellValue: number } | null>(null);

  function handleCalculate(e: FormEvent) {
    e.preventDefault();
    const qty = parseFloat(quantity), buy = parseFloat(buyPrice), sell = parseFloat(sellPrice);
    const buyComm = parseFloat(buyCommission) || 0, sellComm = parseFloat(sellCommission) || 0;
    if (!isNaN(qty) && !isNaN(buy) && !isNaN(sell)) {
      const totalBuyCost = qty * buy + buyComm * qty;
      const totalSellValue = qty * sell - sellComm * qty;
      const profitLoss = totalSellValue - totalBuyCost;
      setResult({ profitLoss, profitLossPct: (profitLoss / totalBuyCost) * 100, totalBuyCost, totalSellValue });
    }
  }

  function handleReset() { setQuantity(''); setBuyPrice(''); setSellPrice(''); setBuyCommission(''); setSellCommission(''); setResult(null); }

  return (
    <div className="calculator-card">
      <div className="calc-header">
        <h2>Profit/Loss Calculator</h2>
        <p className="calc-description">Calculate potential profit or loss including commissions</p>
      </div>
      <form onSubmit={handleCalculate} className="calc-form">
        <div className="calc-input-grid">
          <label>Quantity<input type="number" step="0.0001" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="e.g., 100" required /></label>
          <label>Buy Price per Share<input type="number" step="0.001" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="e.g., 10.00" required /></label>
          <label>Sell Price per Share<input type="number" step="0.001" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="e.g., 12.00" required /></label>
          <label>Buy Commission (per share)<input type="number" step="0.001" value={buyCommission} onChange={e => setBuyCommission(e.target.value)} placeholder="e.g., 0.05" /></label>
          <label>Sell Commission (per share)<input type="number" step="0.001" value={sellCommission} onChange={e => setSellCommission(e.target.value)} placeholder="e.g., 0.05" /></label>
        </div>
        <div className="calc-actions">
          <button type="submit" className="calc-submit">Calculate</button>
          <button type="button" onClick={handleReset} className="calc-reset">Reset</button>
        </div>
      </form>
      {result && (
        <div className={`calc-result ${result.profitLoss >= 0 ? 'profit' : 'loss'}`}>
          <div className="result-grid">
            <div className="result-item highlight">
              <div className="result-label">{result.profitLoss >= 0 ? 'Profit' : 'Loss'}</div>
              <div className="result-value large">${Math.abs(result.profitLoss).toFixed(2)}</div>
              <div className="result-pct">{result.profitLoss >= 0 ? '+' : ''}{result.profitLossPct.toFixed(2)}%</div>
            </div>
            <div className="result-item"><div className="result-label">Total Buy Cost</div><div className="result-value">${result.totalBuyCost.toFixed(2)}</div></div>
            <div className="result-item"><div className="result-label">Total Sell Value</div><div className="result-value">${result.totalSellValue.toFixed(2)}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

function PositionSizeCalculator() {
  const [accountSize, setAccountSize] = useState('');
  const [riskPercent, setRiskPercent] = useState('2');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [result, setResult] = useState<{ positionSize: number; shares: number; riskAmount: number; riskPerShare: number } | null>(null);

  function handleCalculate(e: FormEvent) {
    e.preventDefault();
    const account = parseFloat(accountSize), risk = parseFloat(riskPercent);
    const entry = parseFloat(entryPrice), stop = parseFloat(stopLoss);
    if (!isNaN(account) && !isNaN(risk) && !isNaN(entry) && !isNaN(stop)) {
      const riskAmount = account * (risk / 100);
      const riskPerShare = Math.abs(entry - stop);
      const shares = Math.floor(riskAmount / riskPerShare);
      setResult({ positionSize: shares * entry, shares, riskAmount, riskPerShare });
    }
  }

  function handleReset() { setAccountSize(''); setRiskPercent('2'); setEntryPrice(''); setStopLoss(''); setResult(null); }

  return (
    <div className="calculator-card">
      <div className="calc-header">
        <h2>Position Size Calculator</h2>
        <p className="calc-description">Calculate optimal position size based on risk management</p>
      </div>
      <form onSubmit={handleCalculate} className="calc-form">
        <div className="calc-input-grid">
          <label>Account Size ($)<input type="number" step="0.01" value={accountSize} onChange={e => setAccountSize(e.target.value)} placeholder="e.g., 10000" required /></label>
          <label>Risk Per Trade (%)<input type="number" step="0.1" value={riskPercent} onChange={e => setRiskPercent(e.target.value)} placeholder="e.g., 2" required /></label>
          <label>Entry Price<input type="number" step="0.001" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} placeholder="e.g., 50.00" required /></label>
          <label>Stop Loss Price<input type="number" step="0.001" value={stopLoss} onChange={e => setStopLoss(e.target.value)} placeholder="e.g., 48.00" required /></label>
        </div>
        <div className="calc-actions">
          <button type="submit" className="calc-submit">Calculate</button>
          <button type="button" onClick={handleReset} className="calc-reset">Reset</button>
        </div>
      </form>
      {result && (
        <div className="calc-result">
          <div className="result-grid">
            <div className="result-item highlight"><div className="result-label">Shares to Buy</div><div className="result-value large">{result.shares}</div></div>
            <div className="result-item"><div className="result-label">Position Size</div><div className="result-value">${result.positionSize.toFixed(2)}</div></div>
            <div className="result-item"><div className="result-label">Risk Amount</div><div className="result-value">${result.riskAmount.toFixed(2)}</div></div>
            <div className="result-item"><div className="result-label">Risk Per Share</div><div className="result-value">${result.riskPerShare.toFixed(3)}</div></div>
          </div>
        </div>
      )}
    </div>
  );
}

function DividendYieldCalculator() {
  const [sharePrice, setSharePrice] = useState('');
  const [annualDividend, setAnnualDividend] = useState('');
  const [shares, setShares] = useState('');
  const [result, setResult] = useState<{ dividendYield: number; annualIncome: number; monthlyIncome: number } | null>(null);

  function handleCalculate(e: FormEvent) {
    e.preventDefault();
    const price = parseFloat(sharePrice), dividend = parseFloat(annualDividend), qty = parseFloat(shares) || 1;
    if (!isNaN(price) && !isNaN(dividend)) {
      setResult({ dividendYield: (dividend / price) * 100, annualIncome: dividend * qty, monthlyIncome: (dividend * qty) / 12 });
    }
  }

  function handleReset() { setSharePrice(''); setAnnualDividend(''); setShares(''); setResult(null); }

  return (
    <div className="calculator-card">
      <div className="calc-header">
        <h2>Dividend Yield Calculator</h2>
        <p className="calc-description">Calculate dividend yield and projected income</p>
      </div>
      <form onSubmit={handleCalculate} className="calc-form">
        <div className="calc-input-grid">
          <label>Share Price ($)<input type="number" step="0.01" value={sharePrice} onChange={e => setSharePrice(e.target.value)} placeholder="e.g., 50.00" required /></label>
          <label>Annual Dividend per Share ($)<input type="number" step="0.01" value={annualDividend} onChange={e => setAnnualDividend(e.target.value)} placeholder="e.g., 2.00" required /></label>
          <label>Number of Shares (optional)<input type="number" step="0.0001" value={shares} onChange={e => setShares(e.target.value)} placeholder="e.g., 100" /></label>
        </div>
        <div className="calc-actions">
          <button type="submit" className="calc-submit">Calculate</button>
          <button type="button" onClick={handleReset} className="calc-reset">Reset</button>
        </div>
      </form>
      {result && (
        <div className="calc-result">
          <div className="result-grid">
            <div className="result-item highlight"><div className="result-label">Dividend Yield</div><div className="result-value large">{result.dividendYield.toFixed(2)}%</div></div>
            {shares && (
              <>
                <div className="result-item"><div className="result-label">Annual Income</div><div className="result-value">${result.annualIncome.toFixed(2)}</div></div>
                <div className="result-item"><div className="result-label">Monthly Income</div><div className="result-value">${result.monthlyIncome.toFixed(2)}</div></div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}