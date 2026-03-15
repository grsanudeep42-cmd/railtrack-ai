'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TRACK_STATIONS, TRACK_SEGMENTS, TRACK_SIGNALS, TrainPriority } from '@/lib/mockData';
import { API_BASE } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Helper to grab token on the client
function getClientToken() {
  const match = typeof document !== 'undefined' ? document.cookie.match(/(?:^|;\s*)railtrack_token=([^;]*)/) : null;
  return match ? decodeURIComponent(match[1]) : null;
}

const PRIORITY_COLORS: Record<TrainPriority, string> = {
  EXPRESS:     '#00D4FF',
  FREIGHT:     '#F59E0B',
  LOCAL:       '#6366F1',
  MAINTENANCE: '#94A3B8',
};

interface TrainPosition {
  trainId: string;
  priority: TrainPriority;
  progress: number; // 0-1 along track
  segFrom: string;
  segTo: string;
  speed: number;
}

const SVG_W = 920;
const SVG_H = 320;
const TRACK_Y = 180;
const BRANCH_Y = 90;

function getStationPos(id: string) {
  const s = TRACK_STATIONS.find(s => s.id === id);
  return s ? { x: (s.x / 960) * SVG_W, y: id === 'ST-8' ? BRANCH_Y : TRACK_Y } : { x: 0, y: TRACK_Y };
}

function interpolate(from: { x: number; y: number }, to: { x: number; y: number }, t: number) {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

interface Props {
  conflictSegment?: string | null;
  onTrainClick?: (id: string) => void;
  liveTrainData?: Record<string, {
    status: 'ok' | 'not_running' | 'loading';
    delay?: number;
    lastUpdated?: string;
    isLive: boolean;
    loading: boolean;
  }>;
}

export default function LiveTrackMap({ conflictSegment, onTrainClick, liveTrainData }: Props) {
  const { user } = useAuth();
  const [trains, setTrains] = useState<TrainPosition[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [conflictFlash, setConflictFlash] = useState(false);
  const animRef = useRef<number>(0);
  const lastTime = useRef<number>(0);

  // Fetch real trains
  const { data: apiTrains = [] } = useQuery({
    queryKey: ['live-map-trains'],
    queryFn: async () => {
      const token = getClientToken();
      if (!token) return [];
      const res = await fetch(`${API_BASE}/api/trains/?section=${user?.section || 'NR-42'}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 15000,
    staleTime: 30000,
    placeholderData: (prev) => prev,
  });

  // Sync API trains to internal animation state
  useEffect(() => {
    setTrains(prev => {
      return apiTrains.map((t: any, idx: number) => {
        const existing = prev.find(pt => pt.trainId === t.id);
        const segIdx = parseInt(t.id.replace(/\D/g, '') || idx.toString()) % TRACK_SEGMENTS.length;
        const seg = TRACK_SEGMENTS[segIdx];
        const liveData = liveTrainData?.[t.id];
        const speed = liveData?.isLive && t.speed
          ? t.speed * 0.0000005
          : (t.speed || 60) * 0.0000005;
        return {
          trainId: t.id,
          priority: t.priority as TrainPriority,
          progress: existing ? existing.progress : Math.random(),
          segFrom: seg.from,
          segTo: seg.to,
          speed,
        };
      });
    });
  }, [apiTrains, liveTrainData]);

  // Animate train positions
  useEffect(() => {
    const animate = (timestamp: number) => {
      if (!lastTime.current) lastTime.current = timestamp;
      const dt = timestamp - lastTime.current;
      lastTime.current = timestamp;

      setTrains(prev => prev.map(t => ({
        ...t,
        progress: (t.progress + (t.speed || 0.000025) * dt) % 1
      })));

      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  // Conflict flash
  useEffect(() => {
    if (!conflictSegment) return;
    const interval = setInterval(() => setConflictFlash(f => !f), 600);
    return () => clearInterval(interval);
  }, [conflictSegment]);

  // Station positions
  const stationMap = Object.fromEntries(TRACK_STATIONS.map(s => [s.id, getStationPos(s.id)]));

  // Build segment paths for coloring
  const segmentColors: Record<string, string> = {};
  for (const seg of TRACK_SEGMENTS) {
    if (seg.id === conflictSegment) {
      segmentColors[seg.id] = conflictFlash ? '#EF4444' : '#2A3344';
    } else {
      // Check if any train is on this segment
      const occupied = trains.some(t => t.segFrom === seg.from && t.segTo === seg.to);
      segmentColors[seg.id] = occupied ? '#00D4FF' : '#2A3344';
    }
  }

  return (
    <div className="track-map-canvas" style={{ borderRadius: '8px', border: '1px solid var(--bg-border)', overflow: 'hidden', position: 'relative' }}>
      {/* Grid overlay */}
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.3 }} preserveAspectRatio="none">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="var(--grid-line)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Main track SVG */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width="100%"
        height="280"
        style={{ display: 'block' }}
      >
        {/* Track segments */}
        {TRACK_SEGMENTS.map(seg => {
          const from = stationMap[seg.from];
          const to   = stationMap[seg.to];
          const color = segmentColors[seg.id];
          return (
            <g key={seg.id}>
              {/* Shadow/blur track line */}
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={color} strokeWidth={color === '#00D4FF' ? 8 : 1}
                strokeOpacity={color === '#00D4FF' ? 0.12 : 0}
              />
              {/* Main track line */}
              <line
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={color} strokeWidth={2}
                style={seg.track === 'BRANCH' ? { strokeDasharray: '6 4' } : {}}
              />
              {/* Animated flow for occupied segments */}
              {color === '#00D4FF' && (
                <line
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke="#00D4FF" strokeWidth="2" strokeDasharray="12 20"
                  style={{ animation: 'dash-flow 0.8s linear infinite' }}
                  strokeOpacity="0.6"
                />
              )}
            </g>
          );
        })}

        {/* Stations */}
        {TRACK_STATIONS.map(station => {
          const pos = stationMap[station.id];
          return (
            <g key={station.id}>
              {/* Station box */}
              <rect
                x={pos.x - 24} y={pos.y - 14}
                width={48} height={28}
                rx={4}
                fill="var(--bg-elevated)"
                stroke="var(--bg-border)"
                strokeWidth={1}
              />
              {/* Station code */}
              <text
                x={pos.x} y={pos.y + 4}
                textAnchor="middle"
                fill="var(--text-secondary)"
                fontSize="10"
                fontFamily="var(--font-space-mono)"
                fontWeight="700"
              >
                {station.name}
              </text>
              {/* Station label below */}
              <text
                x={pos.x} y={pos.y + 32}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize="9"
                fontFamily="var(--font-space-mono)"
              >
                {station.label}
              </text>
              {/* Junction diamond for junctions */}
              {['ST-3', 'ST-5', 'ST-6'].includes(station.id) && (
                <polygon
                  points={`${pos.x},${pos.y - 20} ${pos.x + 8},${pos.y - 14} ${pos.x},${pos.y - 8} ${pos.x - 8},${pos.y - 14}`}
                  fill="none"
                  stroke="var(--accent-primary)"
                  strokeWidth="1.5"
                  opacity="0.6"
                />
              )}
            </g>
          );
        })}

        {/* Signals */}
        {TRACK_SIGNALS.map(sig => {
          const signalColor = sig.state === 'GREEN' ? '#10B981' : sig.state === 'RED' ? '#EF4444' : '#F59E0B';
          return (
            <g key={sig.id}>
              {/* Glow ring */}
              <circle cx={sig.x} cy={sig.y} r={10} fill={signalColor} fillOpacity={0.15} />
              {/* Signal circle */}
              <circle cx={sig.x} cy={sig.y} r={5} fill={signalColor} />
              <text x={sig.x} y={sig.y - 14} textAnchor="middle" fill={signalColor} fontSize="8" fontFamily="var(--font-space-mono)">
                {sig.id.replace('SIG-0', 'S')}
              </text>
            </g>
          );
        })}

        {/* Train tokens */}
        {trains.map(train => {
          // Find segment positions
          const from = stationMap[train.segFrom];
          const to   = stationMap[train.segTo];
          if (!from || !to) return null;

          const pos = interpolate(from, to, train.progress);
          const color = PRIORITY_COLORS[train.priority];
          const isHovered = hovered === train.trainId;

          return (
            <g
              key={train.trainId}
              transform={`translate(${pos.x - 14}, ${pos.y - 7})`}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(train.trainId)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onTrainClick?.(train.trainId)}
            >
              {/* Glow for express trains */}
              {train.priority === 'EXPRESS' && (
                <rect x={-2} y={-2} width={32} height={18} rx={5}
                  fill={color} fillOpacity={isHovered ? 0.3 : 0.15}
                  style={{ animation: 'train-glow 2s ease-in-out infinite' }}
                />
              )}
              {/* Token body */}
              <rect width={28} height={14} rx={3} fill={color} />
              {/* Train ID */}
              <text x={14} y={9.5} textAnchor="middle" fill="#0A0C10"
                fontSize="7.5" fontFamily="var(--font-jetbrains)" fontWeight="700">
                {train.trainId.replace('TN-', '')}
              </text>
              {/* Tooltip */}
              {isHovered && (
                <g transform="translate(0, -44)">
                  <rect x={-20} y={0} width={80} height={28} rx={4}
                    fill="var(--bg-elevated)" stroke={color} strokeWidth="1" />
                  <text x={20} y={12} textAnchor="middle" fill={color} fontSize="9"
                    fontFamily="var(--font-space-mono)" fontWeight="700">
                    {train.trainId}
                  </text>
                  <text x={20} y={23} textAnchor="middle" fill="var(--text-muted)" fontSize="8"
                    fontFamily="var(--font-space-mono)">
                    {train.priority}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ padding: '8px 16px', borderTop: '1px solid var(--bg-border)', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {Object.entries(PRIORITY_COLORS).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '16px', height: '8px', borderRadius: '2px', background: v }} />
            <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>{k}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)' }} className="animate-pulse-live" />
          <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--accent-primary)' }}>LIVE</span>
        </div>
      </div>
    </div>
  );
}
