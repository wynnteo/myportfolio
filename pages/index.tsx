import Link from 'next/link';
import { useAuth } from '../lib/AuthContext';

export default function LandingPage() {
  const { user, logout } = useAuth();

  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="landing-nav">
          <div className="logo">
            <span className="logo-icon">📊</span>
            <span className="logo-text">Portfolio Tracker</span>
          </div>
          <div className="nav-actions">
            {user ? (
              <>
                <Link href="/dashboard" className="nav-link">Dashboard</Link>
                <button onClick={() => void logout()} className="nav-btn">Logout</button>
              </>
            ) : (
              <>
                <Link href="/login" className="nav-link">Login</Link>
                <Link href="/register" className="nav-btn">Get Started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            Track Your Investments
            <span className="gradient-text"> With Confidence</span>
          </h1>
          <p className="hero-subtitle">
            A powerful portfolio tracker for stocks, REITs, ETFs, and more. Monitor your holdings, 
            track dividends, and visualize your investment performance—all in one place.
          </p>
          <div className="hero-actions">
            <Link href="/register" className="primary-action">
              Start Tracking Free
            </Link>
            <Link href="/referrals" className="secondary-action">
              View Broker Promos
            </Link>
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-card card-1">
            <div className="card-icon">📈</div>
            <div className="card-title">Real-time Prices</div>
            <div className="card-value">+12.5%</div>
          </div>
          <div className="visual-card card-2">
            <div className="card-icon">💰</div>
            <div className="card-title">Dividends</div>
            <div className="card-value">$342.50</div>
          </div>
          <div className="visual-card card-3">
            <div className="card-icon">🎯</div>
            <div className="card-title">Holdings</div>
            <div className="card-value">15 Assets</div>
          </div>
        </div>
      </section>

      <section className="features-section">
        <div className="section-header">
          <p className="eyebrow">Features</p>
          <h2>Everything you need to manage your portfolio</h2>
        </div>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Portfolio Dashboard</h3>
            <p>
              Get a complete view of your investments with real-time prices, 
              P&L tracking, and performance analytics.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💵</div>
            <h3>Dividend Tracking</h3>
            <p>
              Monitor dividend income across all holdings with year-to-date 
              summaries and yield calculations.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📈</div>
            <h3>Live Market Data</h3>
            <p>
              Stay updated with real-time stock prices from Yahoo Finance 
              for accurate portfolio valuations.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🏦</div>
            <h3>Multi-Broker Support</h3>
            <p>
              Track holdings across multiple brokers and currencies in a 
              single unified dashboard.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📱</div>
            <h3>Mobile Responsive</h3>
            <p>
              Access your portfolio anywhere with a fully responsive design 
              optimized for mobile devices.
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🎁</div>
            <h3>Referral Hub</h3>
            <p>
              Discover the latest broker sign-up promotions and referral 
              codes to maximize your rewards.
            </p>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-content">
          <h2>Ready to take control of your investments?</h2>
          <p>Join thousands of investors tracking their portfolios with confidence.</p>
          <Link href="/register" className="cta-button">
            Create Free Account
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <span className="logo-icon">📊</span>
              <span className="logo-text">Portfolio Tracker</span>
            </div>
            <p className="footer-tagline">Smart portfolio management for modern investors</p>
          </div>
          <div className="footer-links">
            <div className="footer-column">
              <h4>Product</h4>
              <Link href="/register">Get Started</Link>
              <Link href="/referrals">Broker Promos</Link>
            </div>
            <div className="footer-column">
              <h4>Account</h4>
              <Link href="/login">Login</Link>
              <Link href="/register">Sign Up</Link>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2024 Portfolio Tracker. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}