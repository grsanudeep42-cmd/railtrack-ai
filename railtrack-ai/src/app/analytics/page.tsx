'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import {
  SPARKLINE_DELAY, SPARKLINE_PUNCTUALITY, SPARKLINE_THROUGHPUT,
  SPARKLINE_CONFLICTS, SPARKLINE_OVERRIDE, SPARKLINE_AI,
  DELAY_CHART, THROUGHPUT_CHART, AI_ACCEPTANCE_CHART, CONFLICT_HEATMAP,
  MOCK_INCIDENTS
} from '@/lib/mockData';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

function getClientToken() {
  const match = document.cookie.match(/(?:^|;\s*)railtrack_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function Sparkline({ data, color }: { data: number[], color: string }) {
  const chartData = data.map((val, i) => ({ i, val }));
  return (
    <div style={{ width: '80px', height: '32px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line type="monotone" dataKey="val" stroke={color} strokeWidth={2} dot={false} isAnimationActive={true} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function AnimatedNumber({ value, suffix = '', precision = 1 }: { value: number; suffix?: string; precision?: number }) {
  const [disp, setDisp] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    let start: number | null = null;
    const duration = 1500;
    const animate = (t: number) => {
      if (!start) start = t;
      const progress = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - Math.min(progress, 1), 3);
      setDisp(eased * value);
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return <span>{disp.toFixed(precision)}{suffix}</span>;
}

function KPICard({ label, value, suffix = '', precision = 1, delta, data, color, loading = false }: { label: string, value: number, suffix?: string, precision?: number, delta: number, data: number[], color: string, loading?: boolean }) {
  const isPositiveGood = ['punctuality', 'throughput', 'aiAcceptance', 'conflicts resolved', 'ai acceptance'].includes(label.toLowerCase());
  const isGood = isPositiveGood ? delta > 0 : delta < 0;
  return (
    <div className="panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {label}
        </div>
        <Sparkline data={data} color={color} />
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '32px', fontWeight: 700, color: loading ? 'var(--text-muted)' : 'var(--text-primary)', lineHeight: 1 }}>
          {loading ? '—' : <AnimatedNumber value={value} suffix={suffix} precision={precision} />}
        </div>
        {!loading && (
          <div className={isGood ? 'badge-safe' : delta === 0 ? 'badge-rail' : 'badge-danger'} style={{ fontSize: '10px', marginBottom: '6px' }}>
            {delta > 0 ? '+' : ''}{delta}{['throughput', 'conflicts resolved'].includes(label.toLowerCase()) ? '' : '%'}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();

  // ── Fetch real KPIs from backend ─────────────────────────────────────────
  const { data: kpiData, isLoading: kpiLoading } = useQuery({
    queryKey: ['analytics-kpis'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) throw new Error('No token');
      const res = await fetch('http://localhost:8000/api/analytics/kpis', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized'); }
      if (!res.ok) throw new Error('Failed to fetch KPIs');
      return res.json() as Promise<{
        punctuality_pct: number;
        avg_delay_minutes: number;
        conflicts_resolved: number;
        ai_acceptance_rate: number;
        throughput_today: number;
        override_rate: number;
      }>;
    },
    refetchInterval: 30000,
  });

  // ── Fetch real Chart Data ────────────────────────────────────────────────
  const { data: delayData = [], isLoading: delayLoading } = useQuery({
    queryKey: ['analytics-delay', 7],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) return [];
      const res = await fetch('http://localhost:8000/api/analytics/delay-chart?period=7', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) window.location.href = '/login';
      return res.json() as Promise<any[]>;
    }
  });

  const { data: throughputData = [], isLoading: throughputLoading } = useQuery({
    queryKey: ['analytics-throughput', 7],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) return [];
      const res = await fetch('http://localhost:8000/api/analytics/throughput-chart?period=7', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) window.location.href = '/login';
      return res.json() as Promise<any[]>;
    }
  });

  const { data: heatmapData = [], isLoading: heatmapLoading } = useQuery({
    queryKey: ['analytics-heatmap'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) return [];
      const res = await fetch('http://localhost:8000/api/analytics/heatmap', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) window.location.href = '/login';
      return res.json() as Promise<{day: string, hour: number, value: number}[]>;
    }
  });

  // Custom tooltips
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="panel" style={{ padding: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--accent-primary)' }}>
          <p style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px' }}>{label}</p>
          {payload.map((p: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontFamily: 'var(--font-jetbrains)', color: p.color }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.color }} />
              {p.name}: {p.value}
            </div>
          ))}
        </div>
      );
    }
    return null;
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
            { label: 'Simulate', href: '/simulate' },
            { label: 'Analytics', href: '/analytics', active: true },
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

      {/* Content */}
      <main style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
          
          {/* Controls Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-space-mono)', fontSize: '24px', fontWeight: 700 }}>Performance Analytics</h1>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>Section NR-42 · Last 7 Days Overview</p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <select className="input" style={{ width: '200px', height: '36px', padding: '0 12px' }}>
                <option>Last 7 Days</option>
                <option>Last 30 Days</option>
                <option>Yesterday</option>
              </select>
              <select className="input" style={{ width: '200px', height: '36px', padding: '0 12px' }}>
                <option>Section: NR-42 (Default)</option>
                <option>Zone: Northern (All)</option>
              </select>
            </div>
          </div>

          {/* KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <KPICard 
              label="Avg Delay" 
              value={kpiData?.avg_delay_minutes ?? 0} 
              suffix="m" 
              delta={0} 
              data={SPARKLINE_DELAY} 
              color="var(--accent-warn)" 
              loading={kpiLoading} 
            />
            <KPICard 
              label="Punctuality" 
              value={kpiData?.punctuality_pct ?? 0} 
              suffix="%" 
              delta={0} 
              data={SPARKLINE_PUNCTUALITY} 
              color="var(--accent-safe)" 
              loading={kpiLoading} 
            />
            <KPICard 
              label="Throughput" 
              value={kpiData?.throughput_today ?? 0} 
              precision={0} 
              delta={0} 
              data={SPARKLINE_THROUGHPUT} 
              color="var(--accent-primary)" 
              loading={kpiLoading} 
            />
            <KPICard 
              label="Conflicts Resolved" 
              value={kpiData?.conflicts_resolved ?? 0} 
              precision={0}
              delta={0} 
              data={SPARKLINE_CONFLICTS} 
              color="var(--accent-danger)" 
              loading={kpiLoading} 
            />
            <KPICard 
              label="Override Rate" 
              value={kpiData?.override_rate ?? 0} 
              suffix="%" 
              delta={0} 
              data={SPARKLINE_OVERRIDE} 
              color="var(--text-muted)" 
              loading={kpiLoading} 
            />
            <KPICard 
              label="AI Acceptance" 
              value={kpiData?.ai_acceptance_rate ?? 0} 
              suffix="%" 
              delta={0} 
              data={SPARKLINE_AI} 
              color="var(--accent-rail)" 
              loading={kpiLoading} 
            />
          </div>

          {/* Charts Row 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
            
            <div className="panel" style={{ padding: '24px', height: '360px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div className="panel-header">Delay Distribution (Avg Mins)</div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '11px', fontFamily: 'var(--font-space-mono)' }}>
                  <span style={{ color: '#00D4FF' }}>● Express</span>
                  <span style={{ color: '#F59E0B' }}>● Freight</span>
                  <span style={{ color: '#6366F1' }}>● Local</span>
                </div>
              </div>
              {delayLoading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading...</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={delayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-border)" vertical={false} />
                    <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="express" stroke="#00D4FF" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="freight" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="local" stroke="#6366F1" strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="panel" style={{ padding: '24px', height: '360px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div className="panel-header">Daily Throughput (Trains Scanned)</div>
              </div>
              {throughputLoading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading...</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={throughputData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-border)" vertical={false} />
                    <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                    <Bar dataKey="express" stackId="a" fill="#00D4FF" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="freight" stackId="a" fill="#F59E0B" />
                    <Bar dataKey="local" stackId="a" fill="#6366F1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

          </div>

          {/* Charts Row 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>

            {/* AI Acceptance Area */}
            <div className="panel" style={{ padding: '24px', height: '340px', display: 'flex', flexDirection: 'column' }}>
              <div className="panel-header" style={{ marginBottom: '24px' }}>AI Match Rate (2 Weeks)</div>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={AI_ACCEPTANCE_CHART}>
                  <defs>
                    <linearGradient id="colorAI" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} domain={[60, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="acceptance" stroke="var(--accent-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorAI)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Custom Heatmap */}
            <div className="panel" style={{ padding: '24px', height: '340px' }}>
              <div className="panel-header" style={{ marginBottom: '24px' }}>Conflict Density Heatmap</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'min-content 1fr', gap: '8px', height: 'calc(100% - 40px)' }}>
                {/* Y Axis labels (Days) */}
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>
                  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <div key={d} style={{ height: '30px', display: 'flex', alignItems: 'center' }}>{d}</div>)}
                </div>
                {/* Heatmap Grid */}
                <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gap: '4px' }}>
                  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                    <div key={d} style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: '4px' }}>
                      {heatmapLoading ? (
                        Array.from({ length: 24 }).map((_, i) => (
                           <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: '2px' }} />
                        ))
                      ) : heatmapData.filter(h => h.day === d).map((h, i) => (
                        <div key={i} title={`${h.day} ${h.hour}:00 - ${h.value} conflicts`} style={{
                          background: `rgba(239, 68, 68, ${Math.min(h.value / 4, 1)})`,
                          borderRadius: '2px',
                          border: `1px solid rgba(239, 68, 68, ${Math.min(h.value / 2, 1)})`,
                          minWidth: '0',
                        }} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* Incidents Table */}
          <div className="panel" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--bg-border)' }}>
              <span className="panel-header">Recent Section Incidents</span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Incident ID</th>
                  <th>Timestamp</th>
                  <th>Type</th>
                  <th>Location</th>
                  <th>Involved</th>
                  <th>Severity</th>
                  <th>Resolved In</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_INCIDENTS.map(inc => (
                  <tr key={inc.id}>
                    <td style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--text-primary)' }}>{inc.id}</td>
                    <td style={{ fontFamily: 'var(--font-jetbrains)' }}>{inc.timestamp}</td>
                    <td>{inc.type}</td>
                    <td>{inc.location}</td>
                    <td>{inc.trains.map(t => <span key={t} className="badge-rail" style={{ marginRight: '6px' }}>{t}</span>)}</td>
                    <td><span className={`badge-${inc.severity === 'HIGH' ? 'conflict' : inc.severity === 'MEDIUM' ? 'warn' : 'safe'}`}>{inc.severity}</span></td>
                    <td style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--accent-primary)' }}>{inc.resolvedIn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      </main>
    </div>
  );
}
