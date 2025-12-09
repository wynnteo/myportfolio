import Link from 'next/link';
import { useState } from 'react';

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
    referralCode: 'YOUR_CODE',
    referralLink: 'https://j.moomoo.com/YOUR_LINK',
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
    referralCode: 'YOUR_CODE',
    referralLink: 'https://www.webull.com.sg/YOUR_LINK',
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
    referralCode: 'YOUR_CODE',
    referralLink: 'https://www.tigerbrokers.com.sg/YOUR_LINK',
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
    ],
    requirements: 'Deposit S$2,000-10,000, complete 3-5 trades, maintain 30-90 days',
    referralCode: 'YOUR_CODE',
    referralLink: 'https://longbridge.sg/YOUR_LINK',
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
    referralCode: 'YOUR_CODE',
    referralLink: 'https://www.maribank.sg/YOUR_LINK',
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
    referralCode: 'YOUR_CODE',
    referralLink: 'https://www.poems.com.sg/YOUR_LINK',
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
    referralCode: 'YOUR_CODE',
    referralLink: 'https://www.usmart.sg/YOUR_LINK',
    category: 'stocks',
  },
];

export default function ReferralHub() {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'stocks' | 'savings'>('all');
  const [editingBroker, setEditingBroker] = useState<string | null>(null);
  const [tempCode, setTempCode] = useState('');
  const [tempLink, setTempLink] = useState('');

  const filteredPromos = brokerPromos.filter(
    (promo) => selectedCategory === 'all' || promo.category === selectedCategory
  );

  const handleEdit = (broker: BrokerPromo) => {
    setEditingBroker(broker.name);
    setTempCode(broker.referralCode || '');
    setTempLink(broker.referralLink);
  };

  const handleCancel = () => {
    setEditingBroker(null);
    setTempCode('');
    setTempLink('');
  };

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">Referral hub</p>
          <h1>Share broker sign-up promos</h1>
          <p className="muted">Your one-stop referral center with the latest promotions (Dec 2024)</p>
        </div>
        <Link className="ghost" href="/">
          Back to dashboard
        </Link>
      </header>

      <section className="panel" aria-labelledby="promo-list">
        <div className="section-title">
          <div>
            <p className="eyebrow">Spotlight</p>
            <h2 id="promo-list">Latest broker promotions</h2>
            <p className="muted">
              Click "Edit Link" to add your personal referral codes and share with friends
            </p>
          </div>
          <div className="chip-group">
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

              {editingBroker === promo.name ? (
                <div className="edit-form">
                  <label>
                    Referral Code
                    <input
                      type="text"
                      value={tempCode}
                      onChange={(e) => setTempCode(e.target.value)}
                      placeholder="Enter your code"
                    />
                  </label>
                  <label>
                    Referral Link
                    <input
                      type="text"
                      value={tempLink}
                      onChange={(e) => setTempLink(e.target.value)}
                      placeholder="Enter your link"
                    />
                  </label>
                  <div className="action-row">
                    <button type="button" onClick={() => alert('Saved! (Demo only)')}>
                      Save
                    </button>
                    <button type="button" className="ghost" onClick={handleCancel}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="referral-actions">
                  {promo.referralCode && promo.referralCode !== 'YOUR_CODE' ? (
                    <>
                      <div className="referral-info">
                        <div className="info-row">
                          <span className="info-label">Code:</span>
                          <code className="info-value">{promo.referralCode}</code>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Link:</span>
                          <a
                            href={promo.referralLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="info-link"
                          >
                            Open link →
                          </a>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${promo.name} Referral Code: ${promo.referralCode}\nLink: ${promo.referralLink}`
                          );
                          alert('Copied to clipboard!');
                        }}
                      >
                        Copy Details
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => handleEdit(promo)}>
                      Add My Link
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="tips-section">
        <div className="section-title">
          <div>
            <p className="eyebrow">Tips</p>
            <h2>Maximize your referrals</h2>
          </div>
        </div>
        <div className="tips-grid">
          <div className="tip-card">
            <div className="tip-icon">💡</div>
            <h3>Read the fine print</h3>
            <p>
              Always check deposit requirements, holding periods, and trading minimums to ensure
              both you and your referral qualify for rewards.
            </p>
          </div>
          <div className="tip-card">
            <div className="tip-icon">🎯</div>
            <h3>Target the right audience</h3>
            <p>
              Share stock trading promos with investment-minded friends and banking offers with
              those looking for better savings rates.
            </p>
          </div>
          <div className="tip-card">
            <div className="tip-icon">📅</div>
            <h3>Stay updated</h3>
            <p>
              Promotions change monthly. Check broker websites regularly and update your links to
              take advantage of the best offers.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}