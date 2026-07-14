import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message || 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-showcase" aria-label="BlankTex catalog management">
        <div className="login-showcase-inner">
          <div className="login-mark"><span>▣</span> BlankTex</div>
          <div className="login-copy">
            <div className="login-eyebrow">PRODUCT OPERATIONS</div>
            <h1>Your complete blank apparel catalog, in one place.</h1>
            <p>Manage styles, suppliers, sizes, colors and decoration specifications from a single secure workspace.</p>
          </div>
          <div className="login-points">
            <span>✓ Verified product catalog</span>
            <span>✓ Centralized specifications</span>
            <span>✓ Secure admin access</span>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="login-mobile-brand"><span>▣</span> BlankTex</div>
          <div className="login-icon">↗</div>
          <h2>Welcome back</h2>
          <p className="login-subtitle">Sign in to continue to your catalog dashboard.</p>

          <form onSubmit={submit} className="login-form">
            {error && <div className="login-error" role="alert">{error}</div>}
            <label>
              <span>Email address</span>
              <div className="login-input-wrap">
                <span className="login-input-icon">@</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@company.com"
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
            </label>
            <label>
              <span>Password</span>
              <div className="login-input-wrap">
                <span className="login-input-icon">⌁</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((shown) => !shown)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <button className="login-submit" type="submit" disabled={submitting}>
              {submitting ? <><span className="login-spinner" /> Signing in…</> : <>Sign in <span>→</span></>}
            </button>
          </form>

          <p className="login-security">🔒 Protected admin workspace</p>
        </div>
      </section>
    </main>
  );
}
