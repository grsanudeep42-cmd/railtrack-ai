'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth, getClientToken } from '@/lib/auth';
import { SYSTEM_HEALTH } from '@/lib/mockData';
import { useQuery } from '@tanstack/react-query';
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
      const res = await fetch('http://localhost:8000/api/auth/users/', {
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
      const res = await fetch('http://localhost:8000/api/admin/health', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) return [];
      return res.json() as Promise<any[]>;
    },
    enabled: !!user && user.role === 'ADMIN',
    refetchInterval: 10000,
  });

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
                  <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>+ Invite User</button>
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
                      ) : usersData.map(u => (
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
                            <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: '11px' }}>Edit</button>
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


      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* Sidebar Nav */}
        <aside style={{ width: '240px', background: 'var(--bg-surface)', borderRight: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '24px 16px', borderBottom: '1px solid var(--bg-border)' }}>
            <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>ADMIN CONSOLE</div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>System Configuration</div>
          </div>
          <nav style={{ padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                background: activeTab === tab.id ? 'var(--bg-elevated)' : 'transparent',
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: 'none', borderRadius: '6px', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-space-mono)', fontSize: '12px',
                borderLeft: activeTab === tab.id ? '3px solid var(--accent-primary)' : '3px solid transparent',
              }}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          <div style={{ maxWidth: '1000px' }}>
            
            {activeTab === 'users' && (
              <div className="animate-slide-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
                  <div>
                    <h2 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '24px', fontWeight: 700 }}>User Management</h2>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>Manage controller roles, zones, and access levels.</p>
                  </div>
                  <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '12px' }}>+ Add User</button>
                </div>
                
                <div className="panel" style={{ overflow: 'hidden' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Operator</th>
                        <th>Role</th>
                        <th>Section / Zone</th>
                        <th>Status</th>
                        <th>Last Login</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>Loading users...</td></tr>
                      ) : usersData.map(u => (
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
                            <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: '11px' }}>Edit</button>
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
                  {SYSTEM_HEALTH.map(service => (
                    <div key={service.name} className="panel" style={{ padding: '20px', borderLeft: `3px solid ${service.status === 'UP' ? 'var(--accent-safe)' : 'var(--accent-warn)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {service.name.includes('DB') || service.name.includes('Storage') ? <Database size={18} /> : 
                             service.name.includes('API') || service.name.includes('Router') ? <Network size={18} /> : 
                             service.name.includes('Core') ? <HardDrive size={18} /> : <Cpu size={18} />}
                          </span>
                          <div>
                            <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '13px', fontWeight: 700 }}>{service.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{(service as any).message || service.details}</div>
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
    </div>
  );
}
