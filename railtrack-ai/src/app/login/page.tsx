'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, UserRole } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

function setCookie(name: string, value: string, maxAgeSeconds = 86400) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

const ROLES: { key: UserRole; icon: string; label: string; desc: string }[] = [
  { key: 'CONTROLLER',  icon: '🎛️', label: 'Section Controller',    desc: 'Live track map, conflict resolution' },
  { key: 'SUPERVISOR',  icon: '📈', label: 'Traffic Supervisor',     desc: 'Aggregate KPIs, multi-section view' },
  { key: 'LOGISTICS',   icon: '🚚', label: 'Logistics Operator',     desc: 'Freight scheduling, cargo ETAs' },
  { key: 'ADMIN',       icon: '⚙️', label: 'System Administrator',   desc: 'Users, config, system health' },
];

export default function LoginPage() {
  const [selectedRole, setSelectedRole] = useState<UserRole>('CONTROLLER');
  const [email, setEmail] = useState('controller@demo.rail');
  const [password, setPassword] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const { login, isLoading, error } = useAuth();
  const router = useRouter();

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setEmail(`${role.toLowerCase()}@demo.rail`);
    // Note: Intentional removal of password auto-fill to prevent shipping plaintext keys in JS bundle
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login({ email, password, role: selectedRole });
  };

  const handleGoogleSignIn = () => {
    setGoogleLoading(true);
    setGoogleError(null);

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
    if (!clientId) {
      setGoogleError('Google Sign-In is not configured (missing NEXT_PUBLIC_GOOGLE_CLIENT_ID).');
      setGoogleLoading(false);
      return;
    }

    // Dynamically load the Google Identity Services script
    const loadGsi = () => new Promise<void>((resolve, reject) => {
      if (typeof (window as any).google !== 'undefined') { resolve(); return; }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
      document.head.appendChild(script);
    });

    loadGsi()
      .then(() => {
        (window as any).google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response: { credential: string }) => {
            try {
              const res = await fetch(`${API_URL}/api/auth/google-verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: response.credential }),
              });

              if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Google sign-in failed' }));
                throw new Error(err.detail ?? 'Google sign-in failed');
              }

              const data = await res.json();
              const { access_token, user: apiUser } = data;

              // Same cookie logic as auth.tsx login()
              setCookie('railtrack_token', access_token, 86400);
              setCookie('rt_role', apiUser.role, 86400);

              // Same role-based routing as auth.tsx login()
              switch (apiUser.role as UserRole) {
                case 'CONTROLLER': router.push('/dashboard/controller'); break;
                case 'SUPERVISOR': router.push('/analytics');             break;
                case 'LOGISTICS':  router.push('/simulate');              break;
                case 'ADMIN':      router.push('/admin');                 break;
                default:           router.push('/dashboard/controller');
              }
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Google sign-in failed';
              setGoogleError(message);
              setGoogleLoading(false);
            }
          },
        });
        (window as any).google.accounts.id.prompt();
      })
      .catch((err: Error) => {
        setGoogleError(err.message);
        setGoogleLoading(false);
      });
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
    }}>
      {/* Background grid lines */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)', backgroundSize: '48px 48px', opacity: 0.5 }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '480px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '24px', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.1em' }}>
            RAILTRACK AI
          </div>
          <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '6px' }}>
            Decision Support System
          </div>
        </div>

        <div className="panel" style={{ padding: '32px' }}>
          {/* Role selector */}
          <div style={{ marginBottom: '24px' }}>
            <div className="panel-header" style={{ marginBottom: '12px' }}>Select Role</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {ROLES.map(role => (
                <button key={role.key}
                  onClick={() => handleRoleSelect(role.key)}
                  style={{
                    background: selectedRole === role.key ? 'rgba(0,212,255,0.08)' : 'var(--bg-elevated)',
                    border: `1px solid ${selectedRole === role.key ? 'var(--accent-primary)' : 'var(--bg-border)'}`,
                    borderRadius: '8px',
                    padding: '14px 12px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    color: 'var(--text-primary)',
                  }}>
                  <div style={{ fontSize: '20px', marginBottom: '6px' }}>{role.icon}</div>
                  <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', fontWeight: 700, color: selectedRole === role.key ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                    {role.label}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {role.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>
                Email
              </label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter email address"
                required
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '6px' }}>
                Password
              </label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </div>

            {/* Error message */}
            {error && (
              <div style={{
                marginBottom: '16px',
                padding: '10px 14px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '6px',
                fontFamily: 'var(--font-space-mono)',
                fontSize: '12px',
                color: '#f87171',
              }}>
                ⚠ {error}
              </div>
            )}

            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: '15px', padding: '12px' }} disabled={isLoading}>
              {isLoading ? (
                <>
                  <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #0A0C10', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                  Authenticating...
                </>
              ) : 'Sign In →'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--bg-border)' }} />
            <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>OR</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--bg-border)' }} />
          </div>

          {/* Google Sign-In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="btn-ghost"
            style={{
              width: '100%',
              justifyContent: 'center',
              fontSize: '14px',
              padding: '11px',
              gap: '10px',
              opacity: googleLoading ? 0.7 : 1,
            }}
          >
            {googleLoading ? (
              <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid var(--text-muted)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Sign in with Google
          </button>

          {/* Google auth error */}
          {googleError && (
            <div style={{
              marginTop: '10px',
              padding: '10px 14px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '6px',
              fontFamily: 'var(--font-space-mono)',
              fontSize: '12px',
              color: '#f87171',
            }}>
              ⚠ {googleError}
            </div>
          )}

          {/* Demo hint */}
          <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '6px' }}>
            <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--accent-warn)', letterSpacing: '0.1em', marginBottom: '6px' }}>
              DEMO CREDENTIALS
            </div>
            <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '12px', color: 'var(--text-secondary)' }}>
              Email: {selectedRole.toLowerCase()}@demo.rail<br />
              Password: demo1234 <span style={{ color: 'var(--text-muted)' }}>(dev environment only)</span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
