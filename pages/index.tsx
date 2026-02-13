import Link from 'next/link';
import { useAuth } from '../lib/AuthContext';

export default function LandingPage() {
  const { user, logout } = useAuth();

  return (
    <div className="landing-page">
      <header className="site-header">
        <nav className="site-nav">
          <Link href="/" className="site-logo">
            📊 Portfolio Tracker
          </Link>
          <div className="nav-menu">
            {user ? (
              <>
                <Link href="/dashboard">Dashboard</Link>
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

      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            Track Your Investments With Confidence
          </h1>
          <p className="hero-subtitle">
            A simple portfolio tracker for stocks, Unit Trusts, ETFs, and more. Monitor your holdings, 
            track dividends, and see your investment performance—all in one place.
          </p>
          <div className="hero-actions">
            <Link href="/register" className="btn-primary">
              Start Tracking Free
            </Link>
            <Link href="/referrals" className="btn-secondary">
              View Broker Promos
            </Link>
          </div>
        </div>
      </section>

      <section className="features-section">
        <div className="section-header">
          <h2>Everything you need to manage your portfolio</h2>
          <p>Simple tools for tracking and understanding your investments</p>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Portfolio Dashboard</h3>
            <p>
              View all your investments with real-time prices, 
              P&L tracking, and performance analytics.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💵</div>
            <h3>Dividend Tracking</h3>
            <p>
              Monitor dividend income across holdings with year-to-date 
              summaries and yield calculations.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📈</div>
            <h3>Live Market Data</h3>
            <p>
              Stay updated with real-time stock prices from Yahoo Finance 
              for accurate valuations.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🏦</div>
            <h3>Multi-Broker Support</h3>
            <p>
              Track holdings across multiple brokers and currencies in a 
              single dashboard.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📱</div>
            <h3>Mobile Responsive</h3>
            <p>
              Access your portfolio anywhere with a fully responsive design 
              for mobile devices.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🎁</div>
            <h3>Referral Hub</h3>
            <p>
              Discover the latest broker sign-up promotions and referral 
              codes to maximize rewards.
            </p>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-content">
          <h2>Ready to take control of your investments?</h2>
          <p>Join investors tracking their portfolios with confidence.</p>
          <Link href="/register" className="btn-primary">
            Create Free Account
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <Link href="/" className="site-logo">
              📊 Portfolio Tracker
            </Link>
            <p>Simple portfolio management for investors</p>
          </div>
          <div className="footer-column">
            <h4>Product</h4>
            <Link href="/register">Get Started</Link>
            <Link href="/referrals">Broker Promos</Link>
            <Link href="/dashboard">Dashboard</Link>
          </div>
          <div className="footer-column">
            <h4>Account</h4>
            <Link href="/login">Login</Link>
            <Link href="/register">Sign Up</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2024 Portfolio Tracker. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}