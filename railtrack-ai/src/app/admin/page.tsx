'use client';
import { useState } from 'react';
import { API_BASE } from '@/lib/api';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';

// Helper to grab token on the client
function getClientToken() {
  const match = document.cookie.match(/(?:^|;\s*)railtrack_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, Users, Key, Activity, Database, Shield, HardDrive, Cpu, Network } from 'lucide-react';

const TABS = [
  { id: 'users', label: 'User Management', icon: <Users size={16} /> },
  { id: 'health', label: 'System Health', icon: <Activity size={16} /> },
  { id: 'keys', label: 'API Keys', icon: <Key size={16} /> },
  { id: 'config', label: 'Section Config', icon: <Settings size={16} /> },
];

export default function AdminPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('users');

  const { data: usersData = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) throw new Error('No token');
      const res = await fetch(`${API_BASE}/api/auth/users/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) window.location.href = '/login';
      return res.json() as Promise<any[]>;
    },
    enabled: !!user && user.role === 'ADMIN'
  });

  const { data: healthData = [], isLoading: healthLoading } = useQuery({
    queryKey: ['admin-health'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) return [];
      const res = await fetch(`${API_BASE}/api/admin/health`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) return [];
      return res.json() as Promise<any[]>;
    },
    enabled: !!user && user.role === 'ADMIN',
    refetchInterval: 10000,
  });

  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'CONTROLLER', section: '' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  
  const [editUser, setEditUser] = useState<any>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  
  const [toast, setToast] = useState('');

  const handleInviteSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError('');
    try {
      const token = getClientToken();
      const res = await fetch(`${API_BASE}/api/admin/invite`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(inviteForm)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || 'Invite failed');
      }
      setShowInviteModal(false);
      setToast(`✉️ Invite sent to ${inviteForm.email}`);
      setTimeout(() => setToast(''), 4000);
      setInviteForm({ name: '', email: '', role: 'CONTROLLER', section: '' });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      setInviteError(err.message);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editUser) return;
    setEditLoading(true);
    setEditError('');
    try {
      const token = getClientToken();
      const res = await fetch(`${API_BASE}/api/admin/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          role: editUser.role,
          section: editUser.section,
          is_active: editUser.is_active
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || 'Edit failed');
      }
      setEditUser(null);
      setToast(`✅ User updated gracefully!`);
      setTimeout(() => setToast(''), 4000);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteSubmit = async () => {
    if (!editUser) return;
    if (!confirm(`Are you sure you want to completely delete ${editUser.name} (${editUser.email})?`)) return;
    
    setEditLoading(true);
    setEditError('');
    try {
      const token = getClientToken();
      const res = await fetch(`${API_BASE}/api/admin/users/${editUser.id}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || 'Delete failed');
      }
      setEditUser(null);
      setToast(`🗑️ User deleted permanently!`);
      setTimeout(() => setToast(''), 4000);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  if (user && user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ minHeight: '100vh', background: '#0d0f14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-center" style={{ textAlign: 'center' }}>
          <div className="text-6xl font-mono text-red-500 mb-4" style={{ fontSize: '60px', fontFamily: 'var(--font-space-mono)', color: '#ef4444', marginBottom: '16px' }}>403</div>
          <div className="text-white text-xl font-mono mb-2" style={{ color: '#e8eaf0', fontSize: '20px', fontFamily: 'var(--font-space-mono)', marginBottom: '8px' }}>Access Denied</div>
          <div className="text-gray-400 text-sm" style={{ color: '#6b7280', fontSize: '14px' }}>You don't have admin privileges.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      {/* Top Nav */}
      <header style={{ height: '52px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '16px', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.05em' }}>
          RAILTRACK AI
        </div>
        <div style={{ width: '1px', height: '24px', background: 'var(--bg-border)' }} />
        <nav style={{ display: 'flex', gap: '4px' }}>
          {[
            { label: 'Dashboard', href: '/dashboard/controller' },
            { label: 'Simulate', href: '/simulate' },
            { label: 'Analytics', href: '/analytics' },
            { label: 'Admin', href: '/admin', active: true },
          ].map(item => (
            <Link key={item.href} href={item.href} style={{
              padding: '6px 12px', borderRadius: '6px', fontSize: '13px', textDecoration: 'none',
              background: item.active ? 'rgba(0,212,255,0.1)' : 'transparent',
              color: item.active ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontFamily: 'var(--font-space-mono)',
              transition: 'all 0.15s ease',
            }}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <aside style={{ width: '240px', background: 'var(--bg-surface)', borderRight: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '24px 16px', flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '16px', marginLeft: '12px' }}>ADMINISTRATION</div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '6px', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', fontSize: '13px',
                    background: activeTab === tab.id ? 'var(--bg-elevated)' : 'transparent',
                    color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-muted)' }}>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            
            {activeTab === 'users' && (
              <div className="animate-slide-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '24px', fontWeight: 700 }}>User Management</h2>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Manage controller access and section assignments.</p>
                  </div>
                  <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={() => setShowInviteModal(true)}>+ Invite User</button>
                </div>

                <div className="panel" style={{ overflow: 'hidden' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Section</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>Loading users...</td></tr>
                      ) : usersData.map((u: any) => (
                        <tr key={u.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontFamily: 'var(--font-space-mono)', color: 'var(--text-muted)' }}>
                                {u.name ? u.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : 'U'}
                              </div>
                              <div>
                                <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{u.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-jetbrains)' }}>{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={u.role === 'ADMIN' ? 'badge-conflict' : u.role === 'CONTROLLER' ? 'badge-safe' : 'badge-rail'}>
                              {u.role}
                            </span>
                          </td>
                          <td><span style={{ fontFamily: 'var(--font-jetbrains)' }}>{u.section}</span></td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontFamily: 'var(--font-space-mono)', color: u.is_active ? 'var(--accent-safe)' : 'var(--text-muted)' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: u.is_active ? 'var(--accent-safe)' : 'var(--text-muted)' }} />
                              {u.is_active ? 'ACTIVE' : 'INACTIVE'}
                            </div>
                          </td>
                          <td style={{ fontFamily: 'var(--font-jetbrains)' }}>
                            {new Date(u.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td>
                            <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => setEditUser(u)}>Edit</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'health' && (
              <div className="animate-slide-in">
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '24px', fontWeight: 700 }}>System Health</h2>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Real-time telemetry for all backend services and IoT integrations.</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                  {healthLoading ? (
                    <div style={{ padding: '48px', textAlign: 'center', gridColumn: '1/-1', color: 'var(--text-muted)' }}>
                      Loading system telemetry...
                    </div>
                  ) : healthData.map((service: any) => (
                    <div key={service.service} className="panel" style={{ padding: '20px', borderLeft: `3px solid ${service.status === 'UP' ? 'var(--accent-safe)' : 'var(--accent-warn)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {service.service.includes('DB') || service.service.includes('Storage') ? <Database size={18} /> : 
                             service.service.includes('API') || service.service.includes('Router') ? <Network size={18} /> : 
                             service.service.includes('Core') ? <HardDrive size={18} /> : <Cpu size={18} />}
                          </span>
                          <div>
                            <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '13px', fontWeight: 700 }}>{service.service}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{service.message}</div>
                          </div>
                        </div>
                        <span className={service.status === 'UP' ? 'badge-safe' : 'badge-warn'}>{service.status}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)', marginBottom: '4px' }}>LATENCY</div>
                          <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '20px', color: service.latency_ms > 200 ? 'var(--accent-warn)' : 'var(--text-primary)' }}>
                            {service.latency_ms} <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ms</span>
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)', marginBottom: '4px' }}>UPTIME</div>
                          <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '20px', color: 'var(--text-primary)' }}>
                            {service.uptime}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(activeTab === 'keys' || activeTab === 'config') && (
              <div className="animate-slide-in" style={{ padding: '48px', textAlign: 'center', border: '1px dashed var(--bg-border)', borderRadius: '8px' }}>
                <Shield size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
                <h3 style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--text-primary)', marginBottom: '8px' }}>{TABS.find(t => t.id === activeTab)?.label} Locked</h3>
                <p style={{ color: 'var(--text-muted)' }}>This section is locked in the demo environment.</p>
              </div>
            )}

          </div>
        </main>
      </div>
      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-[#13161e] border border-[#1e2330] rounded-lg p-8 w-full max-w-md relative" style={{ background: '#13161e', border: '1px solid #1e2330', borderRadius: '8px', padding: '32px', width: '100%', maxWidth: '448px', position: 'relative' }}>
            <button onClick={() => setShowInviteModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white" style={{ position: 'absolute', top: '16px', right: '16px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            <h2 className="text-white font-mono text-xl mb-1" style={{ color: '#e8eaf0', fontFamily: 'var(--font-space-mono)', fontSize: '20px', margin: '0 0 4px 0' }}>Invite User</h2>
            <p className="text-gray-400 text-sm mb-6" style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 24px 0' }}>Send an invite link to grant system access.</p>
            
            <form onSubmit={handleInviteSubmit} className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input required placeholder="Full Name" value={inviteForm.name}
                onChange={e => setInviteForm({...inviteForm, name: e.target.value})}
                style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: '6px', padding: '8px 16px', color: '#e8eaf0', outline: 'none', boxSizing: 'border-box' }} />
              
              <input required type="email" placeholder="Email Address" value={inviteForm.email}
                onChange={e => setInviteForm({...inviteForm, email: e.target.value})}
                style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: '6px', padding: '8px 16px', color: '#e8eaf0', outline: 'none', boxSizing: 'border-box' }} />
              
              <select value={inviteForm.role} onChange={e => setInviteForm({...inviteForm, role: e.target.value})}
                style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: '6px', padding: '8px 16px', color: '#e8eaf0', outline: 'none', boxSizing: 'border-box' }}>
                <option value="CONTROLLER">CONTROLLER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="SUPERVISOR">SUPERVISOR</option>
                <option value="LOGISTICS">LOGISTICS</option>
              </select>
              
              <input required placeholder="Section (e.g. NR-42)" value={inviteForm.section}
                onChange={e => setInviteForm({...inviteForm, section: e.target.value})}
                style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: '6px', padding: '8px 16px', color: '#e8eaf0', outline: 'none', boxSizing: 'border-box' }} />
              
              {inviteError && <p style={{ color: '#ef4444', fontSize: '14px', margin: 0 }}>{inviteError}</p>}
              
              <button type="submit" disabled={inviteLoading}
                style={{ width: '100%', background: '#00e5ff', color: '#0d0f14', fontWeight: 600, borderRadius: '6px', padding: '10px', border: 'none', cursor: inviteLoading ? 'not-allowed' : 'pointer', opacity: inviteLoading ? 0.5 : 1, transition: 'background 0.2s', marginTop: '8px', boxSizing: 'border-box' }}>
                {inviteLoading ? 'Sending...' : 'Send Invite'}
              </button>
            </form>
          </div>
        </div>
      )}
      
      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-[#13161e] border border-[#1e2330] rounded-lg p-8 w-full max-w-md relative" style={{ background: '#13161e', border: '1px solid #1e2330', borderRadius: '8px', padding: '32px', width: '100%', maxWidth: '448px', position: 'relative' }}>
            <button onClick={() => setEditUser(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white" style={{ position: 'absolute', top: '16px', right: '16px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}>✕</button>
            <h2 className="text-white font-mono text-xl mb-1" style={{ color: '#e8eaf0', fontFamily: 'var(--font-space-mono)', fontSize: '20px', margin: '0 0 4px 0' }}>Edit User</h2>
            <p className="text-gray-400 text-sm mb-6" style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 24px 0' }}>{editUser.name} ({editUser.email})</p>
            
            <form onSubmit={handleEditSubmit} className="space-y-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Role</label>
                <select value={editUser.role} onChange={e => setEditUser({...editUser, role: e.target.value})}
                  style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: '6px', padding: '8px 16px', color: '#e8eaf0', outline: 'none', boxSizing: 'border-box' }}>
                  <option value="CONTROLLER">CONTROLLER</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SUPERVISOR">SUPERVISOR</option>
                  <option value="LOGISTICS">LOGISTICS</option>
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Section</label>
                <input required value={editUser.section}
                  onChange={e => setEditUser({...editUser, section: e.target.value})}
                  style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: '6px', padding: '8px 16px', color: '#e8eaf0', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Account Status</label>
                <select value={editUser.is_active ? 'ACTIVE' : 'INACTIVE'} onChange={e => setEditUser({...editUser, is_active: e.target.value === 'ACTIVE'})}
                  style={{ width: '100%', background: '#0d0f14', border: '1px solid #1e2330', borderRadius: '6px', padding: '8px 16px', color: '#e8eaf0', outline: 'none', boxSizing: 'border-box' }}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive / Suspended</option>
                </select>
              </div>
              
              {editError && <p style={{ color: '#ef4444', fontSize: '14px', margin: 0 }}>{editError}</p>}
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={handleDeleteSubmit} disabled={editLoading}
                  style={{ flex: 1, background: 'transparent', color: '#ef4444', fontWeight: 600, borderRadius: '6px', padding: '10px', border: '1px solid rgba(239, 68, 68, 0.5)', cursor: editLoading ? 'not-allowed' : 'pointer', opacity: editLoading ? 0.5 : 1, transition: 'background 0.2s', boxSizing: 'border-box' }}>
                  Delete
                </button>
                <button type="submit" disabled={editLoading}
                  style={{ flex: 2, background: '#00e5ff', color: '#0d0f14', fontWeight: 600, borderRadius: '6px', padding: '10px', border: 'none', cursor: editLoading ? 'not-allowed' : 'pointer', opacity: editLoading ? 0.5 : 1, transition: 'background 0.2s', boxSizing: 'border-box' }}>
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Toast UI */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#13161e] border border-cyan-400/30 text-cyan-400 px-5 py-3 rounded-lg font-mono text-sm shadow-lg z-50 animate-fade-in" style={{ position: 'fixed', bottom: '24px', right: '24px', background: '#13161e', border: '1px solid rgba(0, 229, 255, 0.3)', color: '#00e5ff', padding: '12px 20px', borderRadius: '8px', fontFamily: 'var(--font-space-mono)', fontSize: '14px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)', zIndex: 50 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
