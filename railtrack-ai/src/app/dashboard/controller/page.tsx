'use client';
import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import LiveTrackMap from '@/components/LiveTrackMap';
import AIRecommendation from '@/components/AIRecommendation';
import { Train, Conflict, TrainPriority } from '@/lib/mockData';

// Helper to grab token on the client
function getClientToken() {
  const match = document.cookie.match(/(?:^|;\s*)railtrack_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const PRIORITY_COLORS: Record<TrainPriority, string> = {
  EXPRESS:     '#00D4FF',
  FREIGHT:     '#F59E0B',
  LOCAL:       '#6366F1',
  MAINTENANCE: '#94A3B8',
};

function LiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' }));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);
  return <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '24px', fontWeight: 700, color: 'var(--accent-primary)' }}>{time}</span>;
}

export default function ControllerDashboard() {
  const { user, logout } = useAuth();
  const [aiAssist, setAiAssist] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const [activeConflict, setActiveConflict] = useState<Conflict | null>(null);
  const [decisions, setDecisions] = useState<any[]>([]);
  // State for tracking live data from RapidAPI
  const [liveTrainData, setLiveTrainData] = useState<Record<string, {
    status: 'ok' | 'not_running' | 'loading';
    message?: string;
    delay?: number;
    currentStation?: string;
    currentStationName?: string;
    expectedArrival?: string;
    expectedArrivalNdls?: string;
    nextStation?: string;
    lastUpdated?: string;
    terminated?: boolean;
    isLive: boolean;
    loading: boolean;
  }>>({});

  const fetchLiveTrainData = async (e: React.MouseEvent, trainId: string) => {
    e.stopPropagation();
    try {
      setLiveTrainData(prev => ({ ...prev, [trainId]: { ...prev[trainId], status: 'loading', loading: true, isLive: false } }));
      const token = getClientToken();
      if (!token) throw new Error('No token');
      const digitsOnly = trainId.replace(/\D/g, '');
      const num = digitsOnly.length > 0 ? digitsOnly : trainId;
      
      const res = await fetch(`http://localhost:8000/api/trains/live/${num}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch live data');
      const data = await res.json();
      
      // Handle gracefully if the train is not running today
      if (data.status === 'not_running') {
        setLiveTrainData(prev => ({
          ...prev,
          [trainId]: {
            status: 'not_running',
            message: data.message || 'Train not running today or data unavailable',
            isLive: false,
            loading: false
          }
        }));
        return;
      }

      // Also silently fetch name/origin/destination to update DB and local state
      try {
        await fetch(`http://localhost:8000/api/trains/info/${num}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (e) {
        console.warn('Silent info fetch failed', e);
      }

      setLiveTrainData(prev => ({
        ...prev,
        [trainId]: {
          status: 'ok',
          delay: data.delay_minutes,
          currentStation: data.current_station,
          currentStationName: data.current_station_name,
          expectedArrival: data.expected_arrival_ndls || 'Unknown',
          expectedArrivalNdls: data.expected_arrival_ndls,
          nextStation: data.next_station,
          lastUpdated: data.last_updated,
          terminated: data.terminated,
          isLive: true,
          loading: false
        }
      }));
    } catch (err) {
      console.error('Error fetching live train data:', err);
      setLiveTrainData(prev => ({ 
        ...prev, 
        [trainId]: { 
          ...prev[trainId], 
          status: 'not_running',
          message: 'Could not reach live data service',
          loading: false, 
          isLive: false 
        } 
      }));
    }
  };

  const { data: trains = [], error: trainsErr } = useQuery({
    queryKey: ['trains'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) throw new Error('No token');
      const res = await fetch('http://localhost:8000/api/trains/?section=NR-42', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) window.location.href = '/login';
      if (!res.ok) throw new Error('Failed to fetch trains');
      return res.json() as Promise<Train[]>;
    },
    refetchInterval: 10000,
  });

  const { data: serverConflicts = [], error: confsErr } = useQuery({
    queryKey: ['conflicts'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) throw new Error('No token');
      const res = await fetch('http://localhost:8000/api/conflicts/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) window.location.href = '/login';
      if (!res.ok) throw new Error('Failed to fetch conflicts');
      // Normalise backend train_a_id -> trainA to match UI expectations
      const data = await res.json();
      return data.map((c: any) => ({
        ...c,
        trainA: c.train_a_id,
        trainB: c.train_b_id,
        timeToConflict: c.time_to_conflict || 0
      })) as Conflict[];
    },
    refetchInterval: 10000,
  });

  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [connectionState, setConnectionState] = useState<'ws' | 'polling'>('ws');

  useEffect(() => {
    if (serverConflicts.length > 0 && conflicts.length === 0) setConflicts(serverConflicts);
  }, [serverConflicts, conflicts.length]);

  useEffect(() => {
    let ws: WebSocket;
    let retryCount = 0;
    const maxRetries = 3;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      try {
        ws = new WebSocket('ws://localhost:8000/ws/telemetry');
        
        ws.onopen = () => {
          retryCount = 0;
          setConnectionState('ws');
        };

        ws.onmessage = (e) => console.log('Telemetry:', e.data);

        ws.onerror = () => {
          // Silent error
        };

        ws.onclose = () => {
          if (retryCount < maxRetries) {
            retryCount++;
            const backoff = Math.pow(2, retryCount) * 1000;
            reconnectTimeout = setTimeout(connect, backoff);
          } else {
            setConnectionState('polling');
          }
        };
      } catch (err) {
        setConnectionState('polling');
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);
  const [selectedTrain, setSelectedTrain] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai'; text: string }[]>([
    { role: 'ai', text: 'Hello! I\'m your AI assistant. Ask me about conflicts, train status, or optimization suggestions for section NR-42.' }
  ]);

  // Trigger a conflict scenario every 30 seconds
  useEffect(() => {
    if (!aiAssist) return;
    const interval = setInterval(() => {
      if (conflicts.length === 0) return;
      const conflict = conflicts[Math.floor(Math.random() * conflicts.length)];
      setActiveConflict(conflict);
      setShowAI(true);
    }, 30000);
    // Show first conflict after 5s
    const initial = setTimeout(() => {
      if (conflicts.length > 0) {
        setActiveConflict(conflicts[0]);
        setShowAI(true);
      }
    }, 5000);
    return () => { clearInterval(interval); clearTimeout(initial); };
  }, [aiAssist]);

  const handleAccept = useCallback(async (conflict: Conflict) => {
    try {
      const token = getClientToken();
      const res = await fetch(`http://localhost:8000/api/conflicts/${conflict.id}/resolve`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          action: `AI recommendation accepted — ${conflict.trainA} vs ${conflict.trainB} resolved`,
          operator_id: user?.id ?? 'system',
          source: 'AI',
          notes: 'Auto-resolved via UI dashboard'
        })
      });
      
      if (!res.ok) throw new Error('Failed to resolve');
      
      const newDecision = {
        id: `D-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        action: `AI recommendation accepted — ${conflict.trainA} vs ${conflict.trainB} resolved`,
        operator: user?.name ?? 'Controller',
        source: 'AI' as const,
        trains: [conflict.trainA, conflict.trainB],
      };
      setDecisions(prev => [newDecision, ...prev.slice(0, 4)]);
      setConflicts(prev => prev.filter(c => c.id !== conflict.id));
      setShowAI(false);
      setActiveConflict(null);
    } catch (err) {
      console.error('Failed to accept resolution', err);
    }
  }, [user]);

  const handleOverride = useCallback((conflict: Conflict) => {
    const newDecision = {
      id: `D-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action: `Manual override — ${conflict.trainA} vs ${conflict.trainB}`,
      operator: user?.name ?? 'Controller',
      source: 'MANUAL' as const,
      trains: [conflict.trainA, conflict.trainB],
    };
    setDecisions(prev => [newDecision, ...prev.slice(0, 4)]);
    setConflicts(prev => prev.filter(c => c.id !== conflict.id));
    setShowAI(false);
    setActiveConflict(null);
  }, [user]);

  const handleChat = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    // Simulate AI response
    setTimeout(() => {
      const responses: Record<string, string> = {
        default: `Based on current section NR-42 data: 2 active conflicts, overall punctuality at 84.2%. Recommend monitoring TN-1199 at Junction J-2.`,
        delay:   `Current average delay is 7.4 minutes. TN-4417 is delayed by 12 min, TN-3345 by 22 min. Suggest prioritizing express trains.`,
        conflict:`Active conflicts: CF-001 (TN-1199 vs TN-7823 at J-2, HIGH) and CF-002 (TN-4417 vs TN-5502 at Platform 1). Accept AI recommendations to save 18 mins total delay.`,
      };
      const lower = userMsg.toLowerCase();
      const response = lower.includes('delay') ? responses.delay
        : lower.includes('conflict') ? responses.conflict
        : responses.default;
      setChatHistory(prev => [...prev, { role: 'ai', text: response }]);
    }, 1200);
  }, [chatInput]);

  const hoveredTrain = selectedTrain ? trains.find(t => t.id === selectedTrain) : null;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Demo Banner */}
      {user?.isDemo && (
        <div className="demo-banner">
          ⚠ DEMO MODE — Section NR-42 (New Delhi–Jhansi Corridor) &nbsp;|&nbsp; User: {user.name} [{user.role}]
        </div>
      )}

      {/* Top Nav */}
      <header style={{ height: '52px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '16px', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '14px', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.05em' }}>
          RAILTRACK AI
        </div>
        <div style={{ width: '1px', height: '24px', background: 'var(--bg-border)' }} />
        <nav style={{ display: 'flex', gap: '4px' }}>
          {[
            { label: 'Dashboard', href: '/dashboard/controller', active: true },
            { label: 'Simulate', href: '/simulate' },
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
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: connectionState === 'ws' ? 'var(--accent-safe)' : 'var(--accent-warn)' }} className="animate-pulse-live" />
            {connectionState === 'ws' ? 'LIVE' : 'LIVE (polling)'}
          </div>
          <button
            onClick={logout}
            className="btn-ghost"
            style={{ padding: '6px 12px', fontSize: '12px', fontFamily: 'var(--font-space-mono)' }}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Main 3-column layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT COLUMN (240px) ── */}
        <aside style={{ width: '240px', flexShrink: 0, background: 'var(--bg-surface)', borderRight: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Section info */}
          <div style={{ padding: '16px', borderBottom: '1px solid var(--bg-border)' }}>
            <div className="panel-header" style={{ marginBottom: '12px' }}>Section Info</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Section: </span>
              <span style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--accent-primary)' }}>NR-42</span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Zone: </span>Northern Railway
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Controller: </span>{user?.name ?? 'R. Sharma'}
            </div>
            <LiveClock />
            <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>IST • Shift: 14:00–22:00</div>
          </div>

          {/* Train queue */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="panel-header">Train Queue</span>
              <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '12px', color: 'var(--accent-primary)' }}>{trains.length}</span>
            </div>
            {/* Informational note about live data */}
            <div style={{ padding: '6px 16px', background: 'rgba(0,212,255,0.04)', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)' }}>
                ℹ Live data available for trains currently running
              </span>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {trains.map(train => (
                <div
                  key={train.id}
                  onClick={() => setSelectedTrain(selectedTrain === train.id ? null : train.id)}
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid var(--bg-border)',
                    cursor: 'pointer',
                    background: selectedTrain === train.id ? 'rgba(0,212,255,0.05)' : 'transparent',
                    borderLeft: selectedTrain === train.id ? '3px solid var(--accent-primary)' : '3px solid transparent',
                    transition: 'all 0.15s ease',
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', fontWeight: 700, color: PRIORITY_COLORS[train.priority] }}>
                      {train.id}
                    </span>
                    <span className={
                      liveTrainData[train.id]?.status === 'not_running' ? 'badge-rail'
                        : liveTrainData[train.id]?.isLive 
                          ? (liveTrainData[train.id].delay === 0 ? 'badge-safe' : (liveTrainData[train.id].delay ?? 0) <= 30 ? 'badge-warn' : 'badge-conflict')
                          : train.status === 'CONFLICT' ? 'badge-conflict' :
                            train.status === 'DELAYED'  ? 'badge-warn' :
                            train.status === 'ON_TIME'  ? 'badge-safe' : 'badge-rail'
                    } style={{ 
                      fontSize: '9px',
                      opacity: liveTrainData[train.id]?.status === 'not_running' ? 0.6 : 1
                    }}
                    title={liveTrainData[train.id]?.status === 'not_running' 
                      ? (liveTrainData[train.id].message || 'Train not running today or data unavailable') 
                      : undefined
                    }>
                      {liveTrainData[train.id]?.status === 'not_running' ? 'NO DATA'
                        : liveTrainData[train.id]?.isLive 
                          ? (liveTrainData[train.id].delay === 0 ? '● ON TIME' : `+${liveTrainData[train.id].delay}m`)
                          : (train.status === 'ON_TIME' ? '●' : train.status === 'DELAYED' ? `+${train.delay}m` : train.status)
                      }
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {liveTrainData[train.id]?.isLive 
                        ? <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Currently: {liveTrainData[train.id].currentStationName}</span>
                        : liveTrainData[train.id]?.status === 'not_running'
                          ? <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{train.origin} → {train.destination}</span>
                          : `${train.origin} → ${train.destination}`
                      }
                    </div>
                    <button 
                      onClick={(e) => fetchLiveTrainData(e, train.id)}
                      disabled={liveTrainData[train.id]?.loading}
                      title={liveTrainData[train.id]?.status === 'not_running' 
                        ? 'Train not running today or data unavailable' 
                        : undefined}
                      style={{ 
                        fontSize: '9px', padding: '2px 6px', borderRadius: '4px',
                        background: liveTrainData[train.id]?.isLive 
                          ? 'rgba(34, 197, 94, 0.15)' 
                          : liveTrainData[train.id]?.status === 'not_running'
                            ? 'rgba(148, 163, 184, 0.08)'
                            : 'var(--bg-elevated)',
                        color: liveTrainData[train.id]?.isLive 
                          ? 'var(--accent-safe)' 
                          : liveTrainData[train.id]?.status === 'not_running'
                            ? 'var(--text-muted)'
                            : 'var(--text-secondary)',
                        border: liveTrainData[train.id]?.isLive 
                          ? '1px solid var(--accent-safe)' 
                          : '1px solid var(--bg-border)',
                        cursor: liveTrainData[train.id]?.loading ? 'wait' : 'pointer',
                        fontFamily: 'var(--font-space-mono)',
                        fontWeight: 600
                      }}
                    >
                      {liveTrainData[train.id]?.loading ? '...' 
                        : liveTrainData[train.id]?.isLive ? 'REFRESH' 
                        : liveTrainData[train.id]?.status === 'not_running' ? 'RETRY'
                        : 'Fetch'}
                    </button>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                      ETA <span style={{ fontFamily: 'var(--font-jetbrains)', color: 'var(--text-secondary)' }}>
                        {liveTrainData[train.id]?.isLive && liveTrainData[train.id].expectedArrivalNdls ? liveTrainData[train.id].expectedArrivalNdls : train.eta}
                      </span>
                      &nbsp;· {Math.round(train.speed)} km/h
                    </span>
                    {liveTrainData[train.id]?.isLive && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ 
                          animation: 'pulse-live 1.5s ease-in-out infinite', 
                          display: 'inline-block', width: '6px', height: '6px', 
                          borderRadius: '50%', background: 'var(--accent-safe)' 
                        }} />
                        <span style={{ color: 'var(--accent-safe)', fontFamily: 'var(--font-space-mono)', fontSize: '9px', fontWeight: 700 }}>
                          LIVE
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ padding: '12px', borderTop: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div className="panel-header" style={{ marginBottom: '4px' }}>Quick Actions</div>
            <button className="btn-danger" style={{ fontSize: '12px', padding: '8px', justifyContent: 'center', width: '100%' }}>
              🛑 Halt Selected
            </button>
            <button className="btn-ghost" style={{ fontSize: '12px', padding: '8px', justifyContent: 'center', width: '100%' }}>
              🔄 Clear Section
            </button>
            <button className="btn-danger" style={{ fontSize: '12px', padding: '8px', justifyContent: 'center', width: '100%', background: '#7f1d1d', color: '#fca5a5' }}>
              ⚠ Emergency Stop
            </button>
          </div>
        </aside>

        {/* ── CENTER COLUMN ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* Section header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-surface)' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-space-mono)' }}>
              NR / NR-42 / <span style={{ color: 'var(--text-secondary)' }}>Controller View</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {conflicts.length > 0 && (
                <span className="badge-conflict" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ animation: 'pulse-live 1s ease-in-out infinite', display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-danger)' }} />
                  {conflicts.length} CONFLICT{conflicts.length > 1 ? 'S' : ''}
                </span>
              )}
              {/* AI Assist Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>AI ASSIST</span>
                <button
                  onClick={() => setAiAssist(a => !a)}
                  style={{
                    width: '40px', height: '22px', borderRadius: '11px',
                    background: aiAssist ? 'var(--accent-primary)' : 'var(--bg-border)',
                    border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s ease',
                  }}>
                  <div style={{
                    width: '16px', height: '16px', borderRadius: '50%', background: '#0A0C10',
                    position: 'absolute', top: '3px',
                    left: aiAssist ? '21px' : '3px',
                    transition: 'left 0.2s ease',
                  }} />
                </button>
              </div>
            </div>
          </div>

          {/* Track map area */}
          <div style={{ flex: 1, padding: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative' }}>
            <LiveTrackMap
              conflictSegment={activeConflict ? 'SEG-04' : null}
              onTrainClick={setSelectedTrain}
            />

            {/* AI panel overlay */}
            {showAI && aiAssist && (
              <div style={{ position: 'absolute', top: '16px', right: '16px', bottom: '16px', pointerEvents: 'none' }}>
                <div style={{ pointerEvents: 'all', height: '100%' }}>
                  <AIRecommendation
                    visible={showAI}
                    conflict={activeConflict}
                    onDismiss={() => setShowAI(false)}
                    onAccept={handleAccept}
                    onOverride={handleOverride}
                  />
                </div>
              </div>
            )}

            {/* Train details card */}
            {hoveredTrain && (
              <div className="panel" style={{ padding: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <div>
                  <div className="panel-header" style={{ marginBottom: '4px' }}>Train ID</div>
                  <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '16px', color: PRIORITY_COLORS[hoveredTrain.priority], fontWeight: 700 }}>{hoveredTrain.id}</div>
                </div>
                <div>
                  <div className="panel-header" style={{ marginBottom: '4px' }}>Name</div>
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{hoveredTrain.name}</div>
                </div>
                <div>
                  <div className="panel-header" style={{ marginBottom: '4px' }}>Route</div>
                  <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '14px', color: 'var(--text-secondary)' }}>{hoveredTrain.origin} → {hoveredTrain.destination}</div>
                </div>
                <div>
                  <div className="panel-header" style={{ marginBottom: '4px' }}>Speed</div>
                  <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '14px', color: 'var(--accent-primary)' }}>{hoveredTrain.speed} km/h</div>
                </div>
                <div>
                  <div className="panel-header" style={{ marginBottom: '4px' }}>ETA</div>
                  <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '14px', color: 'var(--text-primary)' }}>
                    {liveTrainData[hoveredTrain.id]?.isLive && liveTrainData[hoveredTrain.id]?.expectedArrivalNdls ? liveTrainData[hoveredTrain.id].expectedArrivalNdls : hoveredTrain.eta}
                  </div>
                </div>
                {(hoveredTrain.delay > 0 || liveTrainData[hoveredTrain.id]?.isLive) && (
                  <div>
                    <div className="panel-header" style={{ marginBottom: '4px' }}>Delay</div>
                    {liveTrainData[hoveredTrain.id]?.isLive ? (
                      <div style={{ 
                        fontFamily: 'var(--font-jetbrains)', fontSize: '14px', 
                        color: liveTrainData[hoveredTrain.id].delay === 0 ? 'var(--accent-safe)' : liveTrainData[hoveredTrain.id].delay <= 30 ? 'var(--accent-warn)' : 'var(--accent-danger)' 
                      }}>
                        {liveTrainData[hoveredTrain.id].delay === 0 ? 'On Time' : `+${liveTrainData[hoveredTrain.id].delay} min`}
                      </div>
                    ) : (
                      <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '14px', color: 'var(--accent-warn)' }}>
                        +{hoveredTrain.delay} min
                      </div>
                    )}
                  </div>
                )}
                {liveTrainData[hoveredTrain.id]?.isLive && (
                  <>
                    <div>
                      <div className="panel-header" style={{ marginBottom: '4px' }}>Current Station</div>
                      <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '14px', color: 'var(--accent-primary)' }}>
                        {liveTrainData[hoveredTrain.id].currentStationName} ({liveTrainData[hoveredTrain.id].currentStation})
                      </div>
                    </div>
                    <div>
                      <div className="panel-header" style={{ marginBottom: '4px' }}>Next Station</div>
                      <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '14px', color: 'var(--text-secondary)' }}>
                        {liveTrainData[hoveredTrain.id].nextStation}
                      </div>
                    </div>
                    <div>
                      <div className="panel-header" style={{ marginBottom: '4px' }}>Last Updated</div>
                      <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '12px', color: 'var(--text-muted)' }}>
                        {liveTrainData[hoveredTrain.id].lastUpdated}
                      </div>
                    </div>
                  </>
                )}
                {hoveredTrain.platform && (
                  <div>
                    <div className="panel-header" style={{ marginBottom: '4px' }}>Platform</div>
                    <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '14px', color: 'var(--text-secondary)' }}>{hoveredTrain.platform}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* ── RIGHT COLUMN (320px) ── */}
        <aside style={{ width: '320px', flexShrink: 0, background: 'var(--bg-surface)', borderLeft: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Active Conflicts */}
          <div style={{ borderBottom: '1px solid var(--bg-border)' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="panel-header">Active Conflicts</span>
              <span className={conflicts.length > 0 ? 'badge-conflict' : 'badge-safe'} style={{ fontSize: '10px', marginLeft: 'auto' }}>
                {conflicts.length}
              </span>
            </div>
            {conflicts.map(c => (
              <div key={c.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--bg-border)', cursor: 'pointer' }}
                onClick={() => { setActiveConflict(c); setShowAI(true); }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '12px', color: 'var(--accent-danger)', fontWeight: 700 }}>
                    {c.trainA} ↔ {c.trainB}
                  </span>
                  <span className={`badge-${c.severity === 'HIGH' ? 'conflict' : 'warn'}`} style={{ fontSize: '9px' }}>{c.severity}</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.location}</div>
                <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', color: 'var(--accent-warn)', marginTop: '2px' }}>
                  T-{Math.floor(c.timeToConflict / 60)}:{String(c.timeToConflict % 60).padStart(2, '0')}
                </div>
              </div>
            ))}
            {conflicts.length === 0 && (
              <div style={{ padding: '16px', fontSize: '12px', color: 'var(--accent-safe)', textAlign: 'center', fontFamily: 'var(--font-space-mono)' }}>
                ✓ NO ACTIVE CONFLICTS
              </div>
            )}
          </div>

          {/* Disruptions */}
          <div style={{ borderBottom: '1px solid var(--bg-border)' }}>
            <div style={{ padding: '12px 16px' }}>
              <span className="panel-header">Incoming Disruptions</span>
            </div>
            {[
              { icon: '🌧️', text: 'Heavy rain alert — Agra–Gwalior segment', time: '15:30', severity: 'warn' },
              { icon: '🔧', text: 'Track maintenance window — Signal S-07', time: '18:00', severity: 'rail' },
            ].map((d, i) => (
              <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--bg-border)', display: 'flex', gap: '10px' }}>
                <span style={{ fontSize: '16px' }}>{d.icon}</span>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{d.text}</div>
                  <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{d.time}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Recent Decisions */}
          <div style={{ borderBottom: '1px solid var(--bg-border)', flex: '0 0 auto' }}>
            <div style={{ padding: '12px 16px' }}>
              <span className="panel-header">Recent Decisions</span>
            </div>
            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
              {decisions.slice(0, 5).map(d => (
                <div key={d.id} style={{ padding: '8px 16px', borderBottom: '1px solid var(--bg-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '10px', color: 'var(--text-muted)' }}>{d.timestamp}</span>
                    <span className={d.source === 'AI' ? 'badge-safe' : 'badge-rail'} style={{ fontSize: '9px' }}>{d.source}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{d.action}</div>
                </div>
              ))}
            </div>
          </div>

          {/* NLP Chat */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bg-border)' }}>
              <span className="panel-header">Ask AI Assistant</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {chatHistory.map((msg, i) => (
                <div key={i} style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  lineHeight: 1.5,
                  background: msg.role === 'ai' ? 'rgba(0,212,255,0.06)' : 'var(--bg-elevated)',
                  border: `1px solid ${msg.role === 'ai' ? 'rgba(0,212,255,0.15)' : 'var(--bg-border)'}`,
                  color: msg.role === 'ai' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontFamily: msg.role === 'ai' ? 'var(--font-jetbrains)' : 'inherit',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '90%',
                }}>
                  {msg.role === 'ai' && (
                    <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '9px', color: 'var(--accent-primary)', display: 'block', marginBottom: '4px' }}>AI ▸</span>
                  )}
                  {msg.text}
                </div>
              ))}
            </div>
            <form onSubmit={handleChat} style={{ padding: '12px', borderTop: '1px solid var(--bg-border)', display: 'flex', gap: '8px' }}>
              <input
                className="input"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask about section NR-42..."
                style={{ fontSize: '12px', padding: '8px 12px' }}
              />
              <button type="submit" className="btn-primary" style={{ padding: '8px 12px', fontSize: '12px', flexShrink: 0 }}>→</button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
