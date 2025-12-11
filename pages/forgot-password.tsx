import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useAuth } from '../lib/AuthContext';

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLink, setResetLink] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      const result = await forgotPassword(email);
      setSuccess(true);
      // For testing purposes - in production, this wouldn't be returned
      if (result.resetLink) {
        setResetLink(result.resetLink);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <Link href="/" className="logo">
            <span className="logo-icon">📊</span>
            <span className="logo-text">Portfolio Tracker</span>
          </Link>
        </div>

        <div className="auth-card">
          <div className="auth-card-header">
            <h1>Reset your password</h1>
            <p>Enter your email and we'll send you a reset link</p>
          </div>

          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          {success && (
            <div className="alert alert-success">
              <p>Password reset link sent! Check your email.</p>
              {resetLink && (
                <div className="reset-link-dev">
                  <p className="small muted">For testing (remove in production):</p>
                  <Link href={resetLink} className="dev-link">
                    {resetLink}
                  </Link>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>

            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>

          <div className="auth-divider">
            <span>Remember your password?</span>
          </div>

          <Link href="/login" className="auth-link-button">
            Back to sign in
          </Link>
        </div>

        <div className="auth-footer">
          <Link href="/">Back to home</Link>
          <span>·</span>
          <Link href="/register">Create account</Link>
        </div>
      </div>
    </main>
  );
}