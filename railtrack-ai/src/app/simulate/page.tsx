'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import LiveTrackMap from '@/components/LiveTrackMap';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Train } from '@/lib/mockData';

// Helper to grab token on the client
function getClientToken() {
  const match = document.cookie.match(/(?:^|;\s*)railtrack_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

type SimState = 'IDLE' | 'RUNNING' | 'RESULTS';

export default function SimulatePage() {
  const [simState, setSimState] = useState<SimState>('IDLE');
  const [selectedTrains, setSelectedTrains] = useState<string[]>([]);
  const [objective, setObjective] = useState('DELAY');
  const [simResults, setSimResults] = useState<any>(null);

  const { data: trains = [] } = useQuery({
    queryKey: ['trains'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) throw new Error('No token');
      const res = await fetch('http://localhost:8000/api/trains/?section=NR-42', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) window.location.href = '/login';
      return res.json() as Promise<Train[]>;
    }
  });

  // Pre-select ALL trains by default when data loads
  useEffect(() => {
    if (trains.length > 0 && selectedTrains.length === 0 && simState === 'IDLE') {
      setSelectedTrains(trains.map(t => t.id));
    }
  }, [trains, simState]);

  const simulateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const token = getClientToken();
      const res = await fetch('http://localhost:8000/api/simulate/run', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.status === 401) window.location.href = '/login';
      if (!res.ok) throw new Error('Failed to run simulation');
      return res.json();
    },
    onSuccess: (data) => {
      setSimResults(data);
      setSimState('RESULTS');
    }
  });

  const handleRun = () => {
    setSimState('RUNNING');
    const payload = {
      train_ids: selectedTrains,
      disruption_type: 'HEAVY_WEATHER',
      disruption_location: 'AGC',
      disruption_duration_minutes: 120,
      objective: objective === 'DELAY' ? 'MINIMIZE_DELAY' : objective
    };
    console.log('Sending to solver:', JSON.stringify(payload));
    simulateMutation.mutate(payload);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      {/* Top Nav */}
      <header style={{ height: '52px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '16px', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.05em' }}>
          RAILTRACK AI
        </div>
        <div style={{ width: '1px', height: '24px', background: 'var(--bg-border)' }} />
        <nav style={{ display: 'flex', gap: '4px' }}>
          {[
            { label: 'Dashboard', href: '/dashboard/controller' },
            { label: 'Simulate', href: '/simulate', active: true },
            { label: 'Analytics', href: '/analytics' },
            { label: 'Admin', href: '/admin' },
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

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT PANEL (Form) ── */}
        <aside style={{ width: '320px', background: 'var(--bg-surface)', borderRight: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--bg-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '14px', fontWeight: 700 }}>Scenario Simulator</h2>
            <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => setSimState('IDLE')}>Reset</button>
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Disruption Target */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>TARGET TRAINS</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-ghost" style={{ fontSize: '10px', padding: '2px 4px' }} onClick={() => setSelectedTrains(trains.map(t => t.id))}>All</button>
                  <button className="btn-ghost" style={{ fontSize: '10px', padding: '2px 4px' }} onClick={() => setSelectedTrains([])}>Clear</button>
                </div>
              </div>
              <select className="input" multiple style={{ height: '120px' }} value={selectedTrains} onChange={e => setSelectedTrains(Array.from(e.target.selectedOptions, option => option.value))}>
                {trains.map(t => (
                  <option key={t.id} value={t.id} style={{ padding: '4px', background: selectedTrains.includes(t.id) ? 'var(--bg-active)' : 'transparent' }}>{t.id} - {t.name}</option>
                ))}
              </select>
            </div>

            {/* Event Type */}
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>DISRUPTION EVENT</label>
              <select className="input" defaultValue="weather">
                <option value="weather">Heavy Weather (Speed restrictions)</option>
                <option value="breakdown">Engine Breakdown</option>
                <option value="signal">Signal Failure</option>
                <option value="maintenance">Emergency Track Maintenance</option>
              </select>
            </div>

            {/* Parameters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>LOCATION</label>
                <select className="input">
                  <option>Agra Cantt (J1)</option>
                  <option>Gwalior (J2)</option>
                  <option>Track Seg NR-42</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>DURATION</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="number" className="input" defaultValue={120} />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>min</span>
                </div>
              </div>
            </div>

            {/* Optimization Objective */}
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>AI OBJECTIVE</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="radio" name="obj" checked={objective === 'DELAY'} onChange={() => setObjective('DELAY')} />
                  <span style={{ fontSize: '13px' }}>Minimize Total System Delay</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="radio" name="obj" checked={objective === 'EXPRESS'} onChange={() => setObjective('EXPRESS')} />
                  <span style={{ fontSize: '13px' }}>Prioritize Express/Premium</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="radio" name="obj" checked={objective === 'THROUGHPUT'} onChange={() => setObjective('THROUGHPUT')} />
                  <span style={{ fontSize: '13px' }}>Maximize Section Throughput</span>
                </label>
              </div>
            </div>

            {/* Run Button */}
            <div style={{ marginTop: '16px' }}>
              <button
                className="btn-primary"
                onClick={handleRun}
                disabled={simState === 'RUNNING'}
                style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '14px' }}>
                {simState === 'RUNNING' ? (
                  <>
                    <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #0A0C10', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                    Running Simulation...
                  </>
                ) : '▶ Run OR-Tools Solver'}
              </button>
            </div>
          </div>
        </aside>

        {/* ── CENTER AREA (Map & Results) ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px', overflowY: 'auto' }}>
          
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '16px', marginBottom: '16px' }}>Scenario Context: T-0</h3>
            <LiveTrackMap />
          </div>

          {simState === 'IDLE' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--bg-border)', borderRadius: '8px', color: 'var(--text-muted)' }}>
              Configure scenario parameters on the left and run simulation to see what-if outcomes.
            </div>
          )}

          {simState === 'RUNNING' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
              <div className="skeleton" style={{ width: '100%', maxWidth: '800px', height: '240px', borderRadius: '8px' }} />
              <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '12px', color: 'var(--accent-primary)', animation: 'pulse-live 1s infinite' }}>
                Evaluating combinatorial precedence constraints...
              </div>
            </div>
          )}

          {simState === 'RESULTS' && (
            <div className="animate-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Metrics Header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div className="panel" style={{ padding: '16px' }}>
                  <div className="panel-header" style={{ marginBottom: '8px' }}>Total System Delay</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '28px', fontWeight: 700, color: 'var(--accent-safe)' }}>{simResults?.delay_delta}m</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>vs Baseline (+{simResults?.baseline_delay}m)</span>
                  </div>
                </div>
                <div className="panel" style={{ padding: '16px' }}>
                  <div className="panel-header" style={{ marginBottom: '8px' }}>Throughput (trains/hr)</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>14.2</span>
                    <span className="badge-warn" style={{ marginBottom: '6px' }}>{simResults?.throughput_change} drop</span>
                  </div>
                </div>
                <div className="panel" style={{ padding: '16px' }}>
                  <div className="panel-header" style={{ marginBottom: '8px' }}>Conflicts Avoided</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '28px', fontWeight: 700, color: 'var(--accent-primary)' }}>{simResults?.conflicts_avoided}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>Resolved recursively</span>
                  </div>
                </div>
              </div>

              {/* Table Comparison */}
              <div className="panel" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px', borderBottom: '1px solid var(--bg-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="panel-header">Train Outcomes (Baseline vs AI Optimized)</span>
                  <button className="btn-ghost" style={{ fontSize: '11px', padding: '4px 12px' }}>Export CSV</button>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Train ID</th>
                      <th>Priority</th>
                      <th>Baseline Action</th>
                      <th>AI Proposed Action</th>
                      <th>Delay Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(simResults?.actions || []).map((act: any, i: number) => (
                      <tr key={i}>
                        <td style={{ fontFamily: 'var(--font-jetbrains)', fontWeight: 700, color: 'var(--accent-primary)' }}>{act.train}</td>
                        <td><span className="badge-rail">OP</span></td>
                        <td>Calculated Base Delay</td>
                        <td>{act.action}</td>
                        <td style={{ fontFamily: 'var(--font-jetbrains)', color: act.delta < 0 ? 'var(--accent-safe)' : (act.delta > 0 ? 'var(--accent-danger)' : 'var(--text-secondary)') }}>
                          {act.delta > 0 ? '+' : ''}{act.delta} min
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Gantt Timeline Mock */}
              <div className="panel" style={{ padding: '16px', position: 'relative' }}>
                <div className="panel-header" style={{ marginBottom: '16px' }}>Time-Space Gantt Projection</div>
                
                {/* Y-axis stations */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', marginBottom: '24px', opacity: 0.5 }}>
                  <div style={{ fontSize: '11px', fontFamily: 'var(--font-space-mono)', color: 'var(--text-muted)' }}>NDLS</div>
                  <div style={{ fontSize: '11px', fontFamily: 'var(--font-space-mono)', color: 'var(--text-muted)' }}>MTJ</div>
                  <div style={{ fontSize: '11px', fontFamily: 'var(--font-space-mono)', color: 'var(--text-muted)' }}>AGC</div>
                </div>

                {/* X-axis time */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--bg-border)', paddingTop: '8px', opacity: 0.5 }}>
                  <div style={{ fontSize: '11px', fontFamily: 'var(--font-jetbrains)' }}>15:00</div>
                  <div style={{ fontSize: '11px', fontFamily: 'var(--font-jetbrains)' }}>16:00</div>
                  <div style={{ fontSize: '11px', fontFamily: 'var(--font-jetbrains)' }}>17:00</div>
                  <div style={{ fontSize: '11px', fontFamily: 'var(--font-jetbrains)' }}>18:00</div>
                </div>

                {/* Train paths (SVG SVG layer) */}
                <svg style={{ position: 'absolute', inset: '40px 16px 40px 60px', width: 'calc(100% - 76px)', height: 'calc(100% - 80px)' }} preserveAspectRatio="none">
                  {/* Baseline (dashed) */}
                  <line x1="0%" y1="0%" x2="60%" y2="100%" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="4 4" />
                  <line x1="20%" y1="100%" x2="80%" y2="0%" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="4 4" />
                  
                  {/* Optimized (solid) */}
                  <line x1="0%" y1="0%" x2="40%" y2="100%" stroke="var(--accent-primary)" strokeWidth="2.5" />
                  <line x1="30%" y1="100%" x2="50%" y2="50%" stroke="var(--accent-warn)" strokeWidth="2.5" />
                  <line x1="50%" y1="50%" x2="70%" y2="50%" stroke="var(--accent-warn)" strokeWidth="2.5" /> {/* Loop hold */}
                  <line x1="70%" y1="50%" x2="90%" y2="0%" stroke="var(--accent-warn)" strokeWidth="2.5" />
                </svg>

                <div style={{ position: 'absolute', right: '24px', top: '24px', display: 'flex', gap: '16px', fontSize: '11px', fontFamily: 'var(--font-space-mono)' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <div style={{ width: '12px', height: '2px', background: 'var(--text-muted)' }} /> Baseline
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <div style={{ width: '12px', height: '2px', background: 'var(--accent-primary)' }} /> Optimized Flight Path
                  </div>
                </div>
              </div>

            </div>
          )}
        </main>
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
