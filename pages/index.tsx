import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

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
}

interface QuoteResponse {
  symbol: string;
  currency: string | null;
  price: number;
  asOf: string | null;
}

const brokers = ['Moo Moo', 'Webull', 'OCBC', 'CMC Invest', 'DBS', 'HSBC', 'POEMS', 'FSMOne', 'IBKR', 'Other'];
const categories = ['Unit Trusts', 'Stocks', 'ETF', 'Bond', 'Cash', 'Other'];
const currencies = ['SGD', 'USD', 'MYR'];

function formatCurrency(value: number | null, currency: string) {
  if (value === null || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency }).format(value);
}

function formatNumber(value: number | null, decimals = 2) {
  if (value === null || Number.isNaN(value)) return '-';
  return value.toFixed(decimals);
}

export default function HomePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [statusText, setStatusText] = useState('Connecting to database...');
  const [statusTone, setStatusTone] = useState<'info' | 'success' | 'error'>('info');
  const [brokerFilter, setBrokerFilter] = useState<string>('All');
  const [currencyFilter, setCurrencyFilter] = useState<string>('All');
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [priceStatus, setPriceStatus] = useState<{ message: string; tone: 'info' | 'success' | 'error' } | null>(
    null
  );
  const [quotes, setQuotes] = useState<Record<string, QuoteResponse>>({});
  const formRef = useRef<HTMLFormElement | null>(null);

  async function loadTransactions() {
    try {
      setStatusText('Loading transactions from database...');
      const response = await fetch('/api/transactions');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.log(errorData);
        const message: string = (errorData as any)?.error ?? 'Unknown error';

        if (
          message.includes('TURSO_DATABASE_URL') ||
          message.includes('TURSO_AUTH_TOKEN') ||
          message.includes('Missing database keys')
        ) {
          setStatusText(
            'Missing database keys (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN). Add them in .env.local or Vercel project settings.'
          );
        } else {
          setStatusText('Unable to load data from the database. Verify Turso credentials and connectivity.');
        }

        setStatusTone('error');
        return;
      }

      const data: Transaction[] = await response.json();
      setTransactions(data);
      setStatusText('Connected to database');
      setStatusTone('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (
        message.includes('TURSO_DATABASE_URL') ||
        message.includes('TURSO_AUTH_TOKEN') ||
        message.includes('Missing database keys')
      ) {
        setStatusText(
          'Missing database keys (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN). Add them in .env.local or Vercel project settings.'
        );
      } else {
        setStatusText('Unable to load data from the database. Verify Turso credentials and connectivity.');
      }

      setStatusTone('error');
    }
  }

  useEffect(() => {
    void loadTransactions();
  }, []);

  // Base holdings calculated from transactions (including any stored current_price)
  const holdings = useMemo(() => {
    const map = new Map<string, HoldingRow>();

    const getKey = (tx: Transaction) => `${tx.broker || 'Unknown'}__${tx.symbol}`;

    for (const tx of transactions) {
      const key = getKey(tx);
      const existing: HoldingRow =
        map.get(key) ??
        ({
          key,
          symbol: tx.symbol,
          productName: tx.product_name,
          category: tx.category,
          broker: tx.broker,
          currency: tx.currency,
          quantity: 0,
          averagePrice: 0,
          totalCost: 0,
          totalCommission: 0,
          dividends: 0,
          currentPrice: null,
          currentValue: null,
          pl: null,
          plPct: null,
          lastPriceTimestamp: -Infinity,
        } as HoldingRow);

      if (tx.type === 'BUY' || tx.type === 'SELL') {
        const qty = tx.quantity ?? 0;
        const price = tx.price ?? 0;
        const commission = tx.commission ?? 0;
        existing.quantity += qty;
        // treat commission as part of cost
        existing.totalCost += qty * price + commission;
        existing.totalCommission += commission;
      }

      if (tx.type === 'DIVIDEND') {
        existing.dividends += tx.dividend_amount ?? 0;
      }

      // Use stored current_price if present and newer
      if (tx.current_price !== null && !Number.isNaN(tx.current_price)) {
        const txDate = new Date(tx.trade_date ?? tx.created_at).getTime();
        if (txDate >= existing.lastPriceTimestamp) {
          existing.currentPrice = tx.current_price;
          existing.lastPriceTimestamp = txDate;
        }
      }

      map.set(key, existing);
    }

    // Compute average price & P/L based on whatever currentPrice we have so far
    map.forEach((row) => {
      if (row.quantity !== 0) {
        row.averagePrice = row.totalCost / row.quantity;
      }

      if (row.currentPrice !== null) {
        row.currentValue = row.currentPrice * row.quantity;
        row.pl = row.currentValue - row.totalCost;
        row.plPct = row.totalCost !== 0 ? (row.pl / row.totalCost) * 100 : null;
      }
    });

    const filtered = Array.from(map.values()).filter((row) => {
      const brokerOk = brokerFilter === 'All' || row.broker === brokerFilter;
      const currencyOk = currencyFilter === 'All' || row.currency === currencyFilter;
      return brokerOk && currencyOk;
    });

    return filtered;
  }, [transactions, brokerFilter, currencyFilter]);

  // Fetch latest quotes from /api/quote for the symbols in current holdings
  useEffect(() => {
    async function fetchQuotesForHoldings() {
      const symbols = Array.from(new Set(holdings.map((h) => h.symbol))).filter(Boolean);
      if (symbols.length === 0) {
        setQuotes({});
        return;
      }

      const nextQuotes: Record<string, QuoteResponse> = {};

      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const resp = await fetch(`/api/quote?symbol=${encodeURIComponent(symbol)}`);
            if (!resp.ok) {
              // Don't break everything if one fails
              return;
            }
            const data: QuoteResponse = await resp.json();
            nextQuotes[symbol] = data;
          } catch {
            // Ignore individual failures
          }
        })
      );

      setQuotes(nextQuotes);
    }

    void fetchQuotesForHoldings();
  }, [holdings]);

  // Holdings with latest prices from Yahoo (if available)
  const displayHoldings = useMemo(() => {
    return holdings.map((row) => {
      const quote = quotes[row.symbol];

      const currentPrice = quote ? quote.price : row.currentPrice;
      let currentValue: number | null = null;
      let pl: number | null = null;
      let plPct: number | null = null;

      if (currentPrice !== null && !Number.isNaN(currentPrice)) {
        currentValue = currentPrice * row.quantity;
        pl = currentValue - row.totalCost;
        plPct = row.totalCost !== 0 ? (pl / row.totalCost) * 100 : null;
      }

      return {
        ...row,
        currentPrice,
        currentValue,
        pl,
        plPct,
        lastPriceTimestamp: quote?.asOf ? Date.parse(quote.asOf) : row.lastPriceTimestamp,
      };
    });
  }, [holdings, quotes]);

  const allocations = useMemo(() => {
    const byCategory = new Map<string, number>();
    const byCurrency = new Map<string, number>();

    for (const row of displayHoldings) {
      byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.totalCost);
      byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + row.totalCost);
    }

    const totalCapital = Array.from(byCurrency.values()).reduce((sum, val) => sum + val, 0);

    return {
      byCategory: Array.from(byCategory.entries()).map(([name, value]) => ({
        name,
        value,
        pct: totalCapital ? (value / totalCapital) * 100 : 0,
      })),
      byCurrency: Array.from(byCurrency.entries()).map(([name, value]) => ({
        name,
        value,
        pct: totalCapital ? (value / totalCapital) * 100 : 0,
      })),
    };
  }, [displayHoldings]);

  const totals = useMemo(() => {
    const capitalByCurrency = new Map<string, number>();
    const currentValueByCurrency = new Map<string, number>();
    const plByCurrency = new Map<string, number>();
    const dividendsByCurrency = new Map<string, number>();

    for (const row of displayHoldings) {
      capitalByCurrency.set(row.currency, (capitalByCurrency.get(row.currency) ?? 0) + row.totalCost);
      dividendsByCurrency.set(row.currency, (dividendsByCurrency.get(row.currency) ?? 0) + row.dividends);
      if (row.currentValue !== null) {
        currentValueByCurrency.set(
          row.currency,
          (currentValueByCurrency.get(row.currency) ?? 0) + row.currentValue
        );
        plByCurrency.set(row.currency, (plByCurrency.get(row.currency) ?? 0) + (row.pl ?? 0));
      }
    }

    return {
      capitalByCurrency,
      currentValueByCurrency,
      plByCurrency,
      dividendsByCurrency,
    };
  }, [displayHoldings]);

  const symbols = useMemo(() => new Set(displayHoldings.map((h) => h.symbol)), [displayHoldings]);

  const sortedTransactions = useMemo(
    () =>
      [...transactions].sort(
        (a, b) =>
          new Date(b.trade_date ?? b.created_at).getTime() - new Date(a.trade_date ?? a.created_at).getTime()
      ),
    [transactions]
  );

  async function fetchLatestPrice() {
    const symbolInput = formRef.current?.elements.namedItem('symbol') as HTMLInputElement | null;
    const currentPriceInput = formRef.current?.elements.namedItem('currentPrice') as HTMLInputElement | null;

    if (!symbolInput?.value) {
      setPriceStatus({ message: 'Enter a symbol before fetching the latest price.', tone: 'error' });
      return;
    }

    try {
      setIsFetchingPrice(true);
      setPriceStatus({ message: 'Fetching latest price...', tone: 'info' });
      const response = await fetch(`/api/quote?symbol=${encodeURIComponent(symbolInput.value.trim())}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setPriceStatus({ message: (errorData as any)?.error ?? 'Unable to fetch price.', tone: 'error' });
        return;
      }

      const data: { price: number; currency?: string | null; symbol: string; asOf?: string | null } =
        await response.json();
      const formatted = `${data.symbol} latest price: ${data.price}${
        data.currency ? ` ${data.currency}` : ''
      }`;
      const dated = data.asOf ? `${formatted} (as of ${new Date(data.asOf).toLocaleString()})` : formatted;

      if (currentPriceInput) {
        currentPriceInput.value = data.price.toString();
      }

      setPriceStatus({ message: dated, tone: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch price.';
      setPriceStatus({ message, tone: 'error' });
    } finally {
      setIsFetchingPrice(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const type = formData.get('type')?.toString() as Transaction['type'];
    const payload = {
      symbol: formData.get('symbol')?.toString().trim(),
      productName: formData.get('productName')?.toString().trim(),
      category: formData.get('category')?.toString(),
      broker: formData.get('broker')?.toString(),
      currency: formData.get('currency')?.toString(),
      type,
      quantity: formData.get('quantity') ? Number(formData.get('quantity')) : undefined,
      price: formData.get('price') ? Number(formData.get('price')) : undefined,
      commission: formData.get('commission') ? Number(formData.get('commission')) : 0,
      dividendAmount: formData.get('dividendAmount') ? Number(formData.get('dividendAmount')) : undefined,
      tradeDate: formData.get('tradeDate')?.toString(),
      notes: formData.get('notes')?.toString(),
      currentPrice: formData.get('currentPrice') ? Number(formData.get('currentPrice')) : undefined,
    };

    const response = await fetch('/api/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      alert(`Failed to add transaction: ${(error as any)?.error ?? 'Unknown error'}`);
      return;
    }

    form.reset();
    await loadTransactions();
  }

  return (
    <main>
      <header>
        <h1>Personal Portfolio Tracker</h1>
        <span id="sync-status" className="badge" data-tone={statusTone}>
          {statusText}
        </span>
      </header>

      <section aria-labelledby="add-transaction">
        <div className="section-title">
          <h2 id="add-transaction">Add transaction</h2>
        </div>
        <form ref={formRef} onSubmit={(event) => void handleSubmit(event)} className="form-grid">
          <label>
            Symbol
            <input name="symbol" type="text" required placeholder="e.g. M44U" />
          </label>
          <label>
            Product Name
            <input name="productName" type="text" placeholder="Full fund / stock name" />
          </label>
          <label>
            Category
            <select name="category" defaultValue="Stocks">
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </label>
          <label>
            Broker
            <select name="broker" defaultValue="Moo Moo">
              {brokers.map((br) => (
                <option key={br} value={br}>
                  {br}
                </option>
              ))}
            </select>
          </label>
          <label>
            Currency
            <select name="currency" defaultValue="SGD">
              {currencies.map((ccy) => (
                <option key={ccy} value={ccy}>
                  {ccy}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select name="type" defaultValue="BUY">
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
              <option value="DIVIDEND">DIVIDEND</option>
            </select>
          </label>
          <label>
            Quantity
            <input name="quantity" type="number" step="0.0001" min="0" />
          </label>
          <label>
            Price
            <input name="price" type="number" step="0.0001" min="0" />
          </label>
          <label>
            Commission
            <input name="commission" type="number" step="0.01" min="0" defaultValue={0} />
          </label>
          <label>
            Dividend Amount
            <input name="dividendAmount" type="number" step="0.01" min="0" defaultValue={0} />
          </label>
          <label>
            <div className="field-header">
              <span>Current Price (optional)</span>
              <button type="button" onClick={() => void fetchLatestPrice()} disabled={isFetchingPrice}>
                {isFetchingPrice ? 'Fetching...' : 'Fetch latest price'}
              </button>
            </div>
            <input name="currentPrice" type="number" step="0.0001" min="0" />
            {priceStatus && (
              <span className={`helper-text ${priceStatus.tone}`}>{priceStatus.message}</span>
            )}
          </label>
          <label>
            Trade Date
            <input name="tradeDate" type="date" />
          </label>
          <label>
            Notes
            <textarea name="notes" placeholder="Optional notes" />
          </label>
          <div style={{ alignSelf: 'end' }}>
            <button type="submit">Add Transaction</button>
          </div>
        </form>
      </section>

      <section aria-labelledby="summary">
        <div className="section-title">
          <h2 id="summary">Summary / Stats</h2>
        </div>
        <div className="summary-grid">
          <div className="summary-card">
            <div className="stat-text">Holdings</div>
            <div className="stat-text">
              <strong>{displayHoldings.length}</strong> positions /{' '}
              <strong>{symbols.size}</strong> symbols
            </div>
            <div className="stat-text">Transactions: {transactions.length}</div>
          </div>
          <div className="summary-card">
            <div className="stat-text">Capital by currency</div>
            {[...totals.capitalByCurrency.entries()].map(([ccy, val]) => (
              <div key={ccy} className="stat-text">
                {ccy}: {formatCurrency(val, ccy)}
              </div>
            ))}
          </div>
          <div className="summary-card">
            <div className="stat-text">Current value / P&L</div>
            {[...totals.currentValueByCurrency.entries()].map(([ccy, val]) => (
              <div key={ccy} className="stat-text">
                {ccy}: {formatCurrency(val, ccy)} (
                {formatCurrency(totals.plByCurrency.get(ccy) ?? 0, ccy)})
              </div>
            ))}
            <div className="small">Based on holdings with a provided current price.</div>
          </div>
          <div className="summary-card">
            <div className="stat-text">Dividends received</div>
            {[...totals.dividendsByCurrency.entries()].map(([ccy, val]) => (
              <div key={ccy} className="stat-text">
                {ccy}: {formatCurrency(val, ccy)}
              </div>
            ))}
          </div>
        </div>
        <div className="section-title" style={{ marginTop: 12 }}>
          <div>
            <div className="stat-text">Allocation by category</div>
            {allocations.byCategory.map((entry) => (
              <div key={entry.name} className="stat-text">
                {entry.name}: {formatCurrency(entry.value, 'SGD')} ({entry.pct.toFixed(1)}%)
              </div>
            ))}
          </div>
          <div>
            <div className="stat-text">Allocation by currency</div>
            {allocations.byCurrency.map((entry) => (
              <div key={entry.name} className="stat-text">
                {entry.name}: {formatCurrency(entry.value, entry.name)} ({entry.pct.toFixed(1)}%)
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="holdings">
        <div className="section-title">
          <h2 id="holdings">Holdings</h2>
          <div className="filters">
            <select value={brokerFilter} onChange={(e) => setBrokerFilter(e.target.value)}>
              <option value="All">All brokers</option>
              {brokers.map((br) => (
                <option key={br} value={br}>
                  {br}
                </option>
              ))}
            </select>
            <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)}>
              <option value="All">All currencies</option>
              {currencies.map((ccy) => (
                <option key={ccy} value={ccy}>
                  {ccy}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Product</th>
                <th>Category</th>
                <th>Broker</th>
                <th>Currency</th>
                <th>Quantity</th>
                <th>Avg Price</th>
                <th>Current Price</th>
                <th>Capital</th>
                <th>Current Value</th>
                <th>P/L</th>
                <th>P/L %</th>
                <th>Dividends</th>
                <th>Total Commission</th>
              </tr>
            </thead>
            <tbody>
              {displayHoldings.map((row) => (
                <tr key={row.key}>
                  <td>{row.symbol}</td>
                  <td>{row.productName}</td>
                  <td>{row.category}</td>
                  <td>{row.broker}</td>
                  <td>{row.currency}</td>
                  <td>{formatNumber(row.quantity, 2)}</td>
                  <td>{row.averagePrice !== null ? row.averagePrice.toFixed(4) : '-'}</td>
                  <td>{formatCurrency(row.currentPrice, row.currency)}</td>
                  <td>{formatCurrency(row.totalCost, row.currency)}</td>
                  <td>{formatCurrency(row.currentValue, row.currency)}</td>
                  <td>{formatCurrency(row.pl, row.currency)}</td>
                  <td>{row.plPct !== null ? `${row.plPct.toFixed(4)}%` : '-'}</td>
                  <td>{formatCurrency(row.dividends, row.currency)}</td>
                  <td>{formatCurrency(row.totalCommission, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="transactions">
        <div className="section-title">
          <h2 id="transactions">Transactions</h2>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category</th>
                <th>Product</th>
                <th>Symbol</th>
                <th>Broker</th>
                <th>Currency</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Commission</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {sortedTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{tx.trade_date ?? '-'}</td>
                  <td>{tx.type}</td>
                  <td>{tx.category}</td>
                  <td>{tx.product_name}</td>
                  <td>{tx.symbol}</td>
                  <td>{tx.broker}</td>
                  <td>{tx.currency}</td>
                  <td>{tx.quantity !== null ? tx.quantity : '-'}</td>
                  <td>{tx.price !== null ? tx.price : '-'}</td>
                  <td>{tx.commission !== null ? tx.commission : '-'}</td>
                  <td>{tx.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
