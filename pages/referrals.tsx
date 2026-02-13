import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';

interface BrokerPromo {
  name: string;
  icon: string;
  highlight: string;
  perks: string[];
  requirements: string;
  referralCode?: string;
  referralLink: string;
  category: 'stocks' | 'savings';
  featured?: boolean;
}

const brokerPromos: BrokerPromo[] = [
  {
    name: 'Moo Moo',
    icon: '🐮',
    highlight: 'Up to S$2,246 rewards + TSLA shares',
    perks: [
      '6.8% p.a. on Cash Plus (30 days, up to S$50K)',
      'Free TSLA fractional shares',
      'Commission-free US stocks & options',
      'Real-time market data',
    ],
    requirements: 'Deposit S$3,000-S$100,000, complete trades, maintain 30-90 days',
    referralCode: '743XWRTM',
    referralLink: 'https://j.moomoo.com/0yj083',
    category: 'stocks',
    featured: true,
  },
  {
    name: 'Webull',
    icon: '🐂',
    highlight: 'Up to USD 280 Apple shares + 3.5% p.a.',
    perks: [
      'Free Apple (AAPL) fractional shares',
      '3.5% p.a. interest bonus (180 days)',
      'Zero commission US stocks',
      'Fractional shares from US$5',
    ],
    requirements: 'Deposit USD 2,000-10,000, maintain 30-90 days',
    referralCode: 'sg6BTi5pdv5A',
    referralLink: 'https://www.webull.com.sg/s/uIYsg6BTi5pdv5A60V',
    category: 'stocks',
    featured: true,
  },
  {
    name: 'Tiger Brokers',
    icon: '🐯',
    highlight: 'Up to S$1,000 welcome gifts',
    perks: [
      'Stock vouchers & free shares',
      '6.8% p.a. Tiger Vault bonus',
      'Tiger BOSS Debit Card (1% TSLA cashback)',
      'Commission-free SG stocks (1 year)',
    ],
    requirements: 'Deposit and maintain funds for 60 days',
    referralCode: 'CSV0PX',
    referralLink: 'https://tigr.link/s/80D2V0g',
    category: 'stocks',
  },
  {
    name: 'Longbridge',
    icon: '🌉',
    highlight: 'Lifetime $0 commission + NVDA/AAPL shares',
    perks: [
      'Lifetime $0 commission US & HK stocks',
      '1 NVIDIA share (deposit S$2K)',
      '1 Apple share (deposit S$10K)',
      'Real-time SG & HK market data',
      'Additional $18 Cash Coupon'
    ],
    requirements: 'Deposit S$2,000-10,000, complete 3-5 trades, maintain 30-90 days',
    referralCode: 'UI312291',
    referralLink: 'https://activity.longbridge.sg/pages/longbridge_sg/8650/index.html?app_id=longbridge_sg&org_id=1&account_channel=lb_sg&invite-code=UI312291',
    category: 'stocks',
  },
  {
    name: 'MariBank',
    icon: '🏦',
    highlight: 'S$15 cash + 2.88% p.a. + Shopee perks',
    perks: [
      'S$15 instant cash reward',
      '2.88% p.a. on first S$5K-20K (1 month)',
      'Up to 14.5% cashback on credit card',
      'S$50 Shopee voucher pack',
    ],
    requirements: 'Sign up with referral code, apply for Credit Card Bundle or Instant Loan',
    referralCode: '743XWRTM',
    referralLink: 'https://www.maribank.sg/promo',
    category: 'savings',
    featured: true,
  },
  {
    name: 'POEMS',
    icon: '📊',
    highlight: 'Up to S$200 stocks + S$500 coupons',
    perks: [
      'Free Amazon/Microsoft/NVDA shares',
      'US Stock Coupons',
      'SMART Park auto-sweep',
      'Access 40K+ products, 26 exchanges',
    ],
    requirements: 'Deposit S$3,000-10,000, complete trades, maintain 30-50 days',
    referralCode: 'POEMS2024',
    referralLink: 'https://www.poems.com.sg/refer-friend/?code=POEMS2024',
    category: 'stocks',
  },
  {
    name: 'uSmart',
    icon: '🎯',
    highlight: 'USD 198 bonus + $0 commission options',
    perks: [
      'Welcome vouchers up to USD 198',
      '$0 commission US options trading',
      'Just US$0.3 per contract fee',
      'Free OPRA options live quotes',
    ],
    requirements: 'Deposit USD 1,500, complete 3 trades within 30 days',
    referralCode: 'cb68',
    referralLink: 'https://m.usmartsg66.com/promo/overseas/bonus-dec.html?ICode=cb68&langType=3&Id=',
    category: 'stocks',
  },
];

export default function ReferralHub() {
  const { user, logout } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'stocks' | 'savings'>('all');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const filteredPromos = brokerPromos.filter(
    (promo) => selectedCategory === 'all' || promo.category === selectedCategory
  );

  const handleCopyCode = (code: string, brokerName: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(brokerName);
    setTimeout(() => setCopiedCode(null), 1500);
  };

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
          <h1>Broker Referral Hub</h1>
          <p>Latest sign-up promotions and referral codes (December 2024)</p>
          <div className="chip-group" style={{ marginTop: '16px' }}>
            <button
              className={`chip ${selectedCategory === 'all' ? 'success' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All ({brokerPromos.length})
            </button>
            <button
              className={`chip ${selectedCategory === 'stocks' ? 'success' : ''}`}
              onClick={() => setSelectedCategory('stocks')}
            >
              Trading ({brokerPromos.filter((p) => p.category === 'stocks').length})
            </button>
            <button
              className={`chip ${selectedCategory === 'savings' ? 'success' : ''}`}
              onClick={() => setSelectedCategory('savings')}
            >
              Banking ({brokerPromos.filter((p) => p.category === 'savings').length})
            </button>
          </div>
        </div>

        <div className="referral-grid">
          {filteredPromos.map((promo) => (
            <article
              key={promo.name}
              className={`referral-card ${promo.featured ? 'featured' : ''}`}
            >
              <div className="referral-header">
                <div className="broker-icon">{promo.icon}</div>
                <div className="broker-info">
                  <h3 className="broker-name">{promo.name}</h3>
                  {promo.featured && <span className="featured-badge">⭐ Featured</span>}
                </div>
              </div>

              <div className="highlight-box">{promo.highlight}</div>

              <div className="perks-list">
                {promo.perks.map((perk, idx) => (
                  <div key={idx} className="perk-item">
                    <span className="perk-bullet">✓</span>
                    <span>{perk}</span>
                  </div>
                ))}
              </div>

              <div className="requirements-box">
                <div className="requirements-label">Requirements:</div>
                <div className="requirements-text">{promo.requirements}</div>
              </div>

              <div className="button-group">
                {promo.referralCode && (
                  <button
                    type="button"
                    className="code-btn"
                    onClick={() => handleCopyCode(promo.referralCode!, promo.name)}
                    title="Click to copy code"
                  >
                    {copiedCode === promo.name ? (
                      <>
                        <span className="code-check">✓</span> Copied!
                      </>
                    ) : (
                      <>
                        <span className="code-label">Code:</span> {promo.referralCode}
                      </>
                    )}
                  </button>
                )}
                <a
                  href={promo.referralLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="primary-btn"
                >
                  Sign up now →
                </a>
              </div>
            </article>
          ))}
        </div>

        <section style={{ marginTop: '48px' }}>
          <div className="section-header">
            <h2>Tips for Maximizing Referrals</h2>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">💡</div>
              <h3>Read the Fine Print</h3>
              <p>
                Always check deposit requirements, holding periods, and trading minimums to ensure
                both you and your referral qualify for rewards.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🎯</div>
              <h3>Target the Right Audience</h3>
              <p>
                Share stock trading promos with investment-minded friends and banking offers with
                those looking for better savings rates.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📅</div>
              <h3>Stay Updated</h3>
              <p>
                Promotions change monthly. Check broker websites regularly and update your links to
                take advantage of the best offers.
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}