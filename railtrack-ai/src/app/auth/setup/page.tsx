'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE } from '@/lib/api';

function SetupForm() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const [formData, setFormData] = useState({ name: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (formData.password !== formData.confirm) {
      setError('Passwords do not match');
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: formData.password })
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Setup failed');
      }
      
      // on success, redirect to login
      window.location.href = '/login';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#13161e', border: '1px solid #1e2330', borderRadius: '12px', padding: '32px', width: '100%', maxWidth: '448px', position: 'relative' }}>
      
      <h1 style={{ color: '#e8eaf0', fontSize: '24px', fontFamily: 'var(--font-space-mono)', fontWeight: 'bold', textAlign: 'center', margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
        Complete Your Setup
      </h1>
      <p style={{ color: '#6b7280', textAlign: 'center', fontSize: '14px', margin: '0 0 32px 0' }}>
        Welcome aboard. Set your password to activate your RailTrack account.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px', fontFamily: 'var(--font-space-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email Address</label>
          <input 
            type="email" 
            value={email} 
            disabled
            style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: '8px', padding: '10px 16px', color: '#6b7280', fontFamily: 'var(--font-jetbrains)', outline: 'none', cursor: 'not-allowed', boxSizing: 'border-box' }}
          />
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px', fontFamily: 'var(--font-space-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Full Name</label>
          <input 
            required 
            placeholder="Your name"
            value={formData.name} 
            onChange={e => setFormData({...formData, name: e.target.value})}
            style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: '8px', padding: '10px 16px', color: '#e8eaf0', fontFamily: 'var(--font-jetbrains)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px', fontFamily: 'var(--font-space-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password</label>
          <input 
            required 
            type="password" 
            placeholder="••••••••"
            value={formData.password} 
            onChange={e => setFormData({...formData, password: e.target.value})}
            style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: '8px', padding: '10px 16px', color: '#e8eaf0', fontFamily: 'var(--font-jetbrains)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px', fontFamily: 'var(--font-space-mono)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confirm Password</label>
          <input 
            required 
            type="password" 
            placeholder="••••••••"
            value={formData.confirm} 
            onChange={e => setFormData({...formData, confirm: e.target.value})}
            style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: '8px', padding: '10px 16px', color: '#e8eaf0', fontFamily: 'var(--font-jetbrains)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', padding: '12px', marginTop: '4px' }}>
            <p style={{ color: '#f87171', fontSize: '14px', fontFamily: 'var(--font-jetbrains)', textAlign: 'center', margin: 0 }}>{error}</p>
          </div>
        )}

        <button 
          type="submit" 
          disabled={loading || !email}
          style={{ width: '100%', background: '#00e5ff', color: '#0d0f14', fontWeight: 'bold', borderRadius: '8px', padding: '14px', border: 'none', cursor: (loading || !email) ? 'not-allowed' : 'pointer', opacity: (loading || !email) ? 0.5 : 1, transition: 'background 0.2s', fontFamily: 'var(--font-space-mono)', marginTop: '8px', boxSizing: 'border-box' }}
        >
          {loading ? 'Setting up...' : 'Activate Account'}
        </button>
      </form>
    </div>
  );
}

export default function SetupPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0d0f14', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' }}>
      <Suspense fallback={<div style={{ color: '#00e5ff', fontFamily: 'var(--font-space-mono)' }}>Loading setup...</div>}>
        <SetupForm />
      </Suspense>
    </div>
  );
}
