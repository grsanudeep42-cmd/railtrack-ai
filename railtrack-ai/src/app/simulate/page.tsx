'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LiveTrackMap from '@/components/LiveTrackMap';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Train } from '@/lib/mockData';
import { API_BASE } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Helper to grab token on the client
function getClientToken() {
  const match = document.cookie.match(/(?:^|;\s*)railtrack_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

type SimState = 'IDLE' | 'RUNNING' | 'RESULTS';

export default function SimulatePage() {
  const { user, isAuthReady } = useAuth();
  const router = useRouter();
  const [simState, setSimState] = useState<SimState>('IDLE');
  const [selectedTrains, setSelectedTrains] = useState<string[]>([]);
  const [objective, setObjective] = useState('DELAY');
  const [disruptionType, setDisruptionType] = useState('HEAVY_WEATHER');
  const [disruptionLocation, setDisruptionLocation] = useState('AGC');
  const [disruptionDuration, setDisruptionDuration] = useState(120);
  const [simResults, setSimResults] = useState<any>(null);

  const { data: trains = [], isLoading: trainsLoading, error: trainsError } = useQuery({
    queryKey: ['trains'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) { router.push('/login'); throw new Error('No token'); }
      const res = await fetch(`${API_BASE}/api/trains/?section=${user?.section || 'NR-42'}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) { router.push('/login'); throw new Error('Unauthorized'); }
      return res.json() as Promise<Train[]>;
    },
    enabled: isAuthReady,
  });

  // Pre-select ALL trains by default when data loads
  useEffect(() => {
    if (trains.length > 0 && selectedTrains.length === 0 && simState === 'IDLE') {
      setSelectedTrains(trains.map(t => t.id));
    }
  }, [trains, simState]);

  // Build unique location options from fetched trains (origin + destination codes)
  const locationOptions: { value: string; label: string }[] = (() => {
    const seen = new Set<string>();
    const opts: { value: string; label: string }[] = [];
    trains.forEach(t => {
      if (t.origin && !seen.has(t.origin)) {
        seen.add(t.origin);
        opts.push({ value: t.origin, label: t.origin });
      }
      if (t.destination && !seen.has(t.destination)) {
        seen.add(t.destination);
        opts.push({ value: t.destination, label: t.destination });
      }
    });
    // Fallback to hardcoded if no trains loaded yet
    if (opts.length === 0) {
      opts.push({ value: 'AGC', label: 'AGC — Agra Cantt' });
      opts.push({ value: 'GWL', label: 'GWL — Gwalior' });
    }
    return opts;
  })();

  const simulateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const token = getClientToken();
      if (!token) { router.push('/login'); throw new Error('No token'); }
      const res = await fetch(`${API_BASE}/api/simulate/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.status === 401) { router.push('/login'); throw new Error('Unauthorized'); }
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
    // Payload matches SimulationRequest schema exactly
    const payload = {
      train_ids: selectedTrains.length > 0 ? selectedTrains : undefined,
      disruption_type: disruptionType,
      disruption_location: disruptionLocation,
      disruption_duration_minutes: disruptionDuration,
      objective: objective === 'DELAY' ? 'MINIMIZE_DELAY'
               : objective === 'EXPRESS' ? 'PRIORITIZE_EXPRESS'
               : objective === 'THROUGHPUT' ? 'MAXIMIZE_THROUGHPUT'
               : objective,
    };
    console.log('Sending to solver:', JSON.stringify(payload));
    simulateMutation.mutate(payload);
  };

  // Show loading spinner while auth is hydrating
  if (!isAuthReady) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-base)',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <div style={{
          width: '32px', height: '32px',
          border: '3px solid var(--bg-border)',
          borderTopColor: 'var(--accent-primary)',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '12px', color: 'var(--text-muted)' }}>
          AUTHENTICATING...
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

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
            <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={() => { setSimState('IDLE'); setSimResults(null); }}>Reset</button>
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
              {trainsError ? (
                <div style={{ padding: '8px', fontSize: '11px', color: 'var(--accent-danger)', fontFamily: 'var(--font-space-mono)' }}>
                  Failed to load trains. Please refresh.
                </div>
              ) : trainsLoading ? (
                <div style={{ padding: '8px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)', fontStyle: 'italic' }}>
                  Loading trains…
                </div>
              ) : (
                <select className="input" multiple style={{ height: '120px' }} value={selectedTrains} onChange={e => setSelectedTrains(Array.from(e.target.selectedOptions, option => option.value))}>
                  {trains.map(t => (
                    <option key={t.id} value={t.id} style={{ padding: '4px', background: selectedTrains.includes(t.id) ? 'var(--bg-active)' : 'transparent' }}>
                      {t.id} — {t.origin} → {t.destination}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Event Type */}
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>DISRUPTION EVENT</label>
              <select className="input" value={disruptionType} onChange={e => setDisruptionType(e.target.value)}>
                <option value="HEAVY_WEATHER">Heavy Weather (Speed restrictions)</option>
                <option value="ENGINE_BREAKDOWN">Engine Breakdown</option>
                <option value="SIGNAL_FAILURE">Signal Failure</option>
                <option value="MAINTENANCE">Emergency Track Maintenance</option>
              </select>
            </div>

            {/* Parameters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>LOCATION</label>
                <select className="input" value={disruptionLocation} onChange={e => setDisruptionLocation(e.target.value)}>
                  {locationOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                  {/* Always include the user's section as an option */}
                  {!locationOptions.find(o => o.value === (user?.section || 'NR-42')) && (
                    <option value={user?.section || 'NR-42'}>Seg: {user?.section || 'NR-42'}</option>
                  )}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>DURATION</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="number" className="input" value={disruptionDuration} onChange={e => setDisruptionDuration(Number(e.target.value))} />
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
                  <div className="panel-header" style={{ marginBottom: '8px' }}>Optimized Delay</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '28px', fontWeight: 700, color: 'var(--accent-safe)' }}>{simResults?.optimized_delay ?? '—'}m</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      Baseline {simResults?.baseline_delay ?? '—'}m
                      {simResults?.delay_delta != null
                        ? ` (${simResults.delay_delta > 0 ? '+' : ''}${simResults.delay_delta}m)`
                        : ''}
                    </span>
                  </div>
                </div>
                <div className="panel" style={{ padding: '16px' }}>
                  <div className="panel-header" style={{ marginBottom: '8px' }}>Throughput Retained</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {simResults?.throughput_change ?? '—'}%
                    </span>
                    <span className={simResults?.throughput_change >= 80 ? 'badge-safe' : 'badge-warn'} style={{ marginBottom: '6px' }}>
                      {simResults?.throughput_change >= 80 ? 'good' : 'reduced'}
                    </span>
                  </div>
                </div>
                <div className="panel" style={{ padding: '16px' }}>
                  <div className="panel-header" style={{ marginBottom: '8px' }}>Conflicts Avoided</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '28px', fontWeight: 700, color: 'var(--accent-primary)' }}>{simResults?.conflicts_avoided ?? '—'}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>HOLD/REROUTE actions</span>
                  </div>
                </div>
              </div>

              {/* AI Recommendations (derived from actions array) */}
              {(simResults?.actions?.length ?? 0) > 0 && (
                <div className="panel" style={{ padding: '16px' }}>
                  <div className="panel-header" style={{ marginBottom: '12px' }}>AI Recommendations</div>
                  <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(simResults.actions as any[]).map((act: any, i: number) => (
                      <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        <span style={{ fontFamily: 'var(--font-jetbrains)', fontWeight: 700, color: 'var(--accent-primary)' }}>{act.train}</span>
                        {' — '}
                        <span style={{
                          fontWeight: 600,
                          color: act.action === 'PROCEED' ? 'var(--accent-safe)'
                               : act.action === 'HOLD'    ? '#F59E0B'
                               : 'var(--accent-danger)'
                        }}>{act.action}</span>
                        {act.delta !== 0 && (
                          <span style={{
                            marginLeft: '8px',
                            fontFamily: 'var(--font-jetbrains)',
                            fontSize: '12px',
                            color: act.delta < 0 ? 'var(--accent-safe)' : 'var(--accent-danger)',
                          }}>
                            ({act.delta > 0 ? '+' : ''}{act.delta}m delay delta)
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

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

              {/* Dynamic Gantt Timeline */}
              <div className="panel" style={{ padding: '16px', minHeight: '300px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <span className="panel-header">Time-Space Gantt Projection</span>
                  <div style={{ display: 'flex', gap: '16px', fontSize: '10px', fontFamily: 'var(--font-space-mono)' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#00E676' }} /> PROCEED
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#FFD600' }} /> HOLD
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#FF5252' }} /> REROUTE
                    </div>
                  </div>
                </div>
                
                <div style={{ position: 'relative', height: '200px', display: 'flex', gap: '12px' }}>
                  {/* Y-axis Labels (Trains) */}
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', width: '80px', borderRight: '1px solid var(--bg-border)' }}>
                    {Array.from(new Set((simResults?.schedule || []).map((s: any) => s.train_number))).map((tn: any) => (
                      <div key={tn} style={{ fontSize: '10px', fontFamily: 'var(--font-space-mono)', color: 'var(--accent-primary)', fontWeight: 600 }}>
                        {tn}
                      </div>
                    ))}
                  </div>

                  {/* SVG Layer */}
                  <div style={{ flex: 1, position: 'relative' }}>
                    <svg style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                     {(() => {
                        const schedule = simResults?.schedule || [];
                        console.log('Gantt schedule data:', schedule);
                        if (schedule.length === 0) return (
                          <text x="50%" y="50%" fill="var(--text-muted)" fontSize="12" textAnchor="middle">
                            No schedule data returned from solver
                          </text>
                        );

                        const uniqueTrains = Array.from(new Set(schedule.map((s: any) => s.train_number))) as string[];
                        const rowHeight = 100 / uniqueTrains.length;

                        const arrivals = schedule.map((s: any) => Number(s.scheduled_arrival) || 0);
                        const minT = Math.min(...arrivals);
                        const maxT = Math.max(...arrivals);
                        const hasRealTime = maxT - minT > 3600;

                        const range = hasRealTime ? (maxT - minT) : (schedule.length * 900);

                        const formatSecs = (s: number) => {
                          const h = Math.floor(s / 3600) % 24;
                          const m = Math.floor((s % 3600) / 60);
                          return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                        };

                        return (
                          <>
                            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
                              <g key={i}>
                                <line
                                  x1={`${pct * 100}%`} y1="0" x2={`${pct * 100}%`} y2="100%"
                                  stroke="var(--bg-border)" strokeWidth="1" strokeDasharray="4 4"
                                />
                                <text
                                  x={`${pct * 100}%`} y="110%"
                                  fill="var(--text-muted)" fontSize="9" textAnchor="middle" fontFamily="var(--font-jetbrains)"
                                >
                                  {hasRealTime ? formatSecs(minT + pct * range) : `+${Math.round(pct * schedule.length * 15)}m`}
                                </text>
                              </g>
                            ))}

                            {schedule.map((entry: any, i: number) => {
                              const trainIdx = uniqueTrains.indexOf(entry.train_number);
                              const slotWidth = 100 / schedule.length;

                              const startPct = hasRealTime
                                ? ((arrivals[i] - minT) / range) * 100
                                : i * slotWidth;

                              const delayMins = Number(entry.delay_minutes) || 0;
                              const widthPct = hasRealTime
                                ? Math.max(((delayMins * 60) / range) * 100, 3)
                                : Math.max(slotWidth * 0.4, 3);

                              const color = entry.action === 'PROCEED' ? '#00E676'
                                : entry.action === 'HOLD' ? '#FFD600'
                                : '#FF5252';

                              return (
                                <g key={i}>
                                  <rect
                                    x={`${startPct}%`}
                                    y={`${trainIdx * rowHeight + 5}%`}
                                    width={`${widthPct}%`}
                                    height={`${rowHeight * 0.7}%`}
                                    fill={color}
                                    fillOpacity="0.5"
                                    stroke={color}
                                    strokeWidth="1"
                                    rx="2"
                                  />
                                  <text
                                    x={`${startPct + widthPct / 2}%`}
                                    y={`${trainIdx * rowHeight + rowHeight / 2 + 3}%`}
                                    fill="white" fontSize="8" textAnchor="middle" fontFamily="var(--font-space-mono)"
                                  >
                                    {delayMins > 0 ? `${delayMins}m` : entry.action?.slice(0, 4) || '—'}
                                  </text>
                                </g>
                              );
                            })}
                          </>
                        );
                      })()}
                    </svg>
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
