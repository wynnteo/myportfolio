import Link from 'next/link';

const brokerPromos = [
  {
    name: 'Moo Moo',
    perk: 'Up to $200 welcome bundle',
    summary: 'Free shares and cash coupons when new users fund and trade.',
  },
  {
    name: 'CMC Invest',
    perk: 'Commission-free trades (first 60 days)',
    summary: 'Kickstart investing with zero brokerage on your first trades.',
  },
  {
    name: 'IBKR',
    perk: 'Tiered referral rebates',
    summary: 'Share your link to let friends earn fee rebates while you unlock bonuses.',
  },
];

export default function ReferralHub() {
  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">Referral hub</p>
          <h1>Share broker sign-up promos</h1>
          <p className="muted">Park your referral links and perks in one place for quick sharing.</p>
        </div>
        <Link className="ghost" href="/">
          Back to dashboard
        </Link>
      </header>

      <section className="panel" aria-labelledby="promo-list">
        <div className="section-title">
          <div>
            <p className="eyebrow">Spotlight</p>
            <h2 id="promo-list">Featured broker promotions</h2>
            <p className="muted">Replace these placeholders with the latest referral details for each platform.</p>
          </div>
        </div>
        <div className="promo-grid">
          {brokerPromos.map((promo) => (
            <article key={promo.name} className="summary-card">
              <div className="stat-title">{promo.name}</div>
              <div className="stat-value">{promo.perk}</div>
              <div className="stat-sub">{promo.summary}</div>
              <button className="ghost" type="button">
                Add my link
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
