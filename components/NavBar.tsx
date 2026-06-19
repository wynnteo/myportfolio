import Link from 'next/link';
import { useAuth } from '../lib/AuthContext';

export default function NavBar() {
  const { user, logout } = useAuth();

  return (
    <header className="site-header">
      <nav className="site-nav">
        <Link href="/" className="site-logo">📊 Portfolio Tracker</Link>
        <div className="nav-menu">
          <Link href="/">Home</Link>
          {user ? (
            <>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/transactions">Transactions</Link>
              <Link href="/accounts">Accounts</Link>
              <Link href="/bills">Bills</Link>
              <Link href="/watchlist">Watchlist</Link>
              <Link href="/insights">Insights</Link>
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
  );
}