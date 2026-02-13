import Link from 'next/link';
import { useState, FormEvent } from 'react';
import { useAuth } from '../lib/AuthContext';

type CalculatorTab = 'breakeven' | 'average' | 'profit' | 'position' | 'dividend';

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
          <button
            className={`calc-tab ${activeTab === 'breakeven' ? 'active' : ''}`}
            onClick={() => setActiveTab('breakeven')}
          >
            Breakeven
          </button>
          <button
            className={`calc-tab ${activeTab === 'average' ? 'active' : ''}`}
            onClick={() => setActiveTab('average')}
          >
            Average Price
          </button>
          <button
            className={`calc-tab ${activeTab === 'profit' ? 'active' : ''}`}
            onClick={() => setActiveTab('profit')}
          >
            Profit/Loss
          </button>
          <button
            className={`calc-tab ${activeTab === 'position' ? 'active' : ''}`}
            onClick={() => setActiveTab('position')}
          >
            Position Size
          </button>
          <button
            className={`calc-tab ${activeTab === 'dividend' ? 'active' : ''}`}
            onClick={() => setActiveTab('dividend')}
          >
            Dividend Yield
          </button>
        </div>

        <div className="calculator-content">
          {activeTab === 'breakeven' && <BreakevenCalculator />}
          {activeTab === 'average' && <AveragePriceCalculator />}
          {activeTab === 'profit' && <ProfitLossCalculator />}
          {activeTab === 'position' && <PositionSizeCalculator />}
          {activeTab === 'dividend' && <DividendYieldCalculator />}
        </div>
      </main>
    </>
  );
}

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

    if (!isNaN(buy)) {
      // Breakeven = (Buy Price + Buy Commission + Sell Commission)
      const breakeven = buy + buyComm + sellComm;
      setResult(breakeven);
    }
  }

  function handleReset() {
    setBuyPrice('');
    setBuyCommission('');
    setSellCommission('');
    setResult(null);
  }

  return (
    <div className="calculator-card">
      <div className="calc-header">
        <h2>Breakeven Price Calculator</h2>
        <p className="calc-description">
          Calculate the minimum selling price needed to breakeven after commissions
        </p>
      </div>

      <form onSubmit={handleCalculate} className="calc-form">
        <div className="calc-input-grid">
          <label>
            Buy Price per Share
            <input
              type="number"
              step="0.001"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              placeholder="e.g., 10.50"
              required
            />
          </label>

          <label>
            Buy Commission (per share)
            <input
              type="number"
              step="0.001"
              value={buyCommission}
              onChange={(e) => setBuyCommission(e.target.value)}
              placeholder="e.g., 0.05"
            />
          </label>

          <label>
            Sell Commission (per share)
            <input
              type="number"
              step="0.001"
              value={sellCommission}
              onChange={(e) => setSellCommission(e.target.value)}
              placeholder="e.g., 0.05"
            />
          </label>
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
          <div className="result-note">
            You need to sell at <strong>${result.toFixed(3)}</strong> per share to breakeven
          </div>
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
  const [result, setResult] = useState<{
    newAvgPrice: number;
    totalQty: number;
    totalCost: number;
  } | null>(null);

  function handleCalculate(e: FormEvent) {
    e.preventDefault();
    const currQty = parseFloat(currentQty);
    const currAvg = parseFloat(currentAvgPrice);
    const newQty = parseFloat(addQty);
    const newPrice = parseFloat(addPrice);

    if (!isNaN(currQty) && !isNaN(currAvg) && !isNaN(newQty) && !isNaN(newPrice)) {
      const currentCost = currQty * currAvg;
      const newCost = newQty * newPrice;
      const totalCost = currentCost + newCost;
      const totalQty = currQty + newQty;
      const newAvgPrice = totalCost / totalQty;

      setResult({ newAvgPrice, totalQty, totalCost });
    }
  }

  function handleReset() {
    setCurrentQty('');
    setCurrentAvgPrice('');
    setAddQty('');
    setAddPrice('');
    setResult(null);
  }

  return (
    <div className="calculator-card">
      <div className="calc-header">
        <h2>Average Price Calculator</h2>
        <p className="calc-description">
          Calculate your new average price when averaging down or up
        </p>
      </div>

      <form onSubmit={handleCalculate} className="calc-form">
        <div className="calc-section">
          <h3 className="calc-section-title">Current Position</h3>
          <div className="calc-input-grid">
            <label>
              Current Quantity
              <input
                type="number"
                step="0.0001"
                value={currentQty}
                onChange={(e) => setCurrentQty(e.target.value)}
                placeholder="e.g., 100"
                required
              />
            </label>

            <label>
              Current Average Price
              <input
                type="number"
                step="0.001"
                value={currentAvgPrice}
                onChange={(e) => setCurrentAvgPrice(e.target.value)}
                placeholder="e.g., 10.50"
                required
              />
            </label>
          </div>
        </div>

        <div className="calc-section">
          <h3 className="calc-section-title">Additional Purchase</h3>
          <div className="calc-input-grid">
            <label>
              Additional Quantity
              <input
                type="number"
                step="0.0001"
                value={addQty}
                onChange={(e) => setAddQty(e.target.value)}
                placeholder="e.g., 50"
                required
              />
            </label>

            <label>
              Purchase Price
              <input
                type="number"
                step="0.001"
                value={addPrice}
                onChange={(e) => setAddPrice(e.target.value)}
                placeholder="e.g., 9.50"
                required
              />
            </label>
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
            <div className="result-item">
              <div className="result-label">New Average Price</div>
              <div className="result-value">${result.newAvgPrice.toFixed(3)}</div>
            </div>
            <div className="result-item">
              <div className="result-label">Total Quantity</div>
              <div className="result-value">{result.totalQty.toFixed(4)}</div>
            </div>
            <div className="result-item">
              <div className="result-label">Total Cost</div>
              <div className="result-value">${result.totalCost.toFixed(2)}</div>
            </div>
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
  const [result, setResult] = useState<{
    profitLoss: number;
    profitLossPct: number;
    totalBuyCost: number;
    totalSellValue: number;
  } | null>(null);

  function handleCalculate(e: FormEvent) {
    e.preventDefault();
    const qty = parseFloat(quantity);
    const buy = parseFloat(buyPrice);
    const sell = parseFloat(sellPrice);
    const buyComm = parseFloat(buyCommission) || 0;
    const sellComm = parseFloat(sellCommission) || 0;

    if (!isNaN(qty) && !isNaN(buy) && !isNaN(sell)) {
      const totalBuyCost = (qty * buy) + (buyComm * qty);
      const totalSellValue = (qty * sell) - (sellComm * qty);
      const profitLoss = totalSellValue - totalBuyCost;
      const profitLossPct = (profitLoss / totalBuyCost) * 100;

      setResult({ profitLoss, profitLossPct, totalBuyCost, totalSellValue });
    }
  }

  function handleReset() {
    setQuantity('');
    setBuyPrice('');
    setSellPrice('');
    setBuyCommission('');
    setSellCommission('');
    setResult(null);
  }

  return (
    <div className="calculator-card">
      <div className="calc-header">
        <h2>Profit/Loss Calculator</h2>
        <p className="calc-description">
          Calculate potential profit or loss including commissions
        </p>
      </div>

      <form onSubmit={handleCalculate} className="calc-form">
        <div className="calc-input-grid">
          <label>
            Quantity
            <input
              type="number"
              step="0.0001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g., 100"
              required
            />
          </label>

          <label>
            Buy Price per Share
            <input
              type="number"
              step="0.001"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              placeholder="e.g., 10.00"
              required
            />
          </label>

          <label>
            Sell Price per Share
            <input
              type="number"
              step="0.001"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="e.g., 12.00"
              required
            />
          </label>

          <label>
            Buy Commission (per share)
            <input
              type="number"
              step="0.001"
              value={buyCommission}
              onChange={(e) => setBuyCommission(e.target.value)}
              placeholder="e.g., 0.05"
            />
          </label>

          <label>
            Sell Commission (per share)
            <input
              type="number"
              step="0.001"
              value={sellCommission}
              onChange={(e) => setSellCommission(e.target.value)}
              placeholder="e.g., 0.05"
            />
          </label>
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
              <div className="result-label">
                {result.profitLoss >= 0 ? 'Profit' : 'Loss'}
              </div>
              <div className="result-value large">
                ${Math.abs(result.profitLoss).toFixed(2)}
              </div>
              <div className="result-pct">
                {result.profitLoss >= 0 ? '+' : ''}{result.profitLossPct.toFixed(2)}%
              </div>
            </div>
            <div className="result-item">
              <div className="result-label">Total Buy Cost</div>
              <div className="result-value">${result.totalBuyCost.toFixed(2)}</div>
            </div>
            <div className="result-item">
              <div className="result-label">Total Sell Value</div>
              <div className="result-value">${result.totalSellValue.toFixed(2)}</div>
            </div>
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
  const [result, setResult] = useState<{
    positionSize: number;
    shares: number;
    riskAmount: number;
    riskPerShare: number;
  } | null>(null);

  function handleCalculate(e: FormEvent) {
    e.preventDefault();
    const account = parseFloat(accountSize);
    const risk = parseFloat(riskPercent);
    const entry = parseFloat(entryPrice);
    const stop = parseFloat(stopLoss);

    if (!isNaN(account) && !isNaN(risk) && !isNaN(entry) && !isNaN(stop)) {
      const riskAmount = account * (risk / 100);
      const riskPerShare = Math.abs(entry - stop);
      const shares = Math.floor(riskAmount / riskPerShare);
      const positionSize = shares * entry;

      setResult({ positionSize, shares, riskAmount, riskPerShare });
    }
  }

  function handleReset() {
    setAccountSize('');
    setRiskPercent('2');
    setEntryPrice('');
    setStopLoss('');
    setResult(null);
  }

  return (
    <div className="calculator-card">
      <div className="calc-header">
        <h2>Position Size Calculator</h2>
        <p className="calc-description">
          Calculate optimal position size based on risk management
        </p>
      </div>

      <form onSubmit={handleCalculate} className="calc-form">
        <div className="calc-input-grid">
          <label>
            Account Size ($)
            <input
              type="number"
              step="0.01"
              value={accountSize}
              onChange={(e) => setAccountSize(e.target.value)}
              placeholder="e.g., 10000"
              required
            />
          </label>

          <label>
            Risk Per Trade (%)
            <input
              type="number"
              step="0.1"
              value={riskPercent}
              onChange={(e) => setRiskPercent(e.target.value)}
              placeholder="e.g., 2"
              required
            />
          </label>

          <label>
            Entry Price
            <input
              type="number"
              step="0.001"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              placeholder="e.g., 50.00"
              required
            />
          </label>

          <label>
            Stop Loss Price
            <input
              type="number"
              step="0.001"
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder="e.g., 48.00"
              required
            />
          </label>
        </div>

        <div className="calc-actions">
          <button type="submit" className="calc-submit">Calculate</button>
          <button type="button" onClick={handleReset} className="calc-reset">Reset</button>
        </div>
      </form>

      {result && (
        <div className="calc-result">
          <div className="result-grid">
            <div className="result-item highlight">
              <div className="result-label">Shares to Buy</div>
              <div className="result-value large">{result.shares}</div>
            </div>
            <div className="result-item">
              <div className="result-label">Position Size</div>
              <div className="result-value">${result.positionSize.toFixed(2)}</div>
            </div>
            <div className="result-item">
              <div className="result-label">Risk Amount</div>
              <div className="result-value">${result.riskAmount.toFixed(2)}</div>
            </div>
            <div className="result-item">
              <div className="result-label">Risk Per Share</div>
              <div className="result-value">${result.riskPerShare.toFixed(3)}</div>
            </div>
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
  const [result, setResult] = useState<{
    dividendYield: number;
    annualIncome: number;
    monthlyIncome: number;
  } | null>(null);

  function handleCalculate(e: FormEvent) {
    e.preventDefault();
    const price = parseFloat(sharePrice);
    const dividend = parseFloat(annualDividend);
    const qty = parseFloat(shares) || 1;

    if (!isNaN(price) && !isNaN(dividend)) {
      const dividendYield = (dividend / price) * 100;
      const annualIncome = dividend * qty;
      const monthlyIncome = annualIncome / 12;

      setResult({ dividendYield, annualIncome, monthlyIncome });
    }
  }

  function handleReset() {
    setSharePrice('');
    setAnnualDividend('');
    setShares('');
    setResult(null);
  }

  return (
    <div className="calculator-card">
      <div className="calc-header">
        <h2>Dividend Yield Calculator</h2>
        <p className="calc-description">
          Calculate dividend yield and projected income
        </p>
      </div>

      <form onSubmit={handleCalculate} className="calc-form">
        <div className="calc-input-grid">
          <label>
            Share Price ($)
            <input
              type="number"
              step="0.01"
              value={sharePrice}
              onChange={(e) => setSharePrice(e.target.value)}
              placeholder="e.g., 50.00"
              required
            />
          </label>

          <label>
            Annual Dividend per Share ($)
            <input
              type="number"
              step="0.01"
              value={annualDividend}
              onChange={(e) => setAnnualDividend(e.target.value)}
              placeholder="e.g., 2.00"
              required
            />
          </label>

          <label>
            Number of Shares (optional)
            <input
              type="number"
              step="0.0001"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="e.g., 100"
            />
          </label>
        </div>

        <div className="calc-actions">
          <button type="submit" className="calc-submit">Calculate</button>
          <button type="button" onClick={handleReset} className="calc-reset">Reset</button>
        </div>
      </form>

      {result && (
        <div className="calc-result">
          <div className="result-grid">
            <div className="result-item highlight">
              <div className="result-label">Dividend Yield</div>
              <div className="result-value large">{result.dividendYield.toFixed(2)}%</div>
            </div>
            {shares && (
              <>
                <div className="result-item">
                  <div className="result-label">Annual Income</div>
                  <div className="result-value">${result.annualIncome.toFixed(2)}</div>
                </div>
                <div className="result-item">
                  <div className="result-label">Monthly Income</div>
                  <div className="result-value">${result.monthlyIncome.toFixed(2)}</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}