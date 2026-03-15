// ─────────────────────────────────────────────
//  RailTrack AI — Core Data Types & Topology
// ─────────────────────────────────────────────

export type TrainPriority = 'EXPRESS' | 'FREIGHT' | 'LOCAL' | 'MAINTENANCE';
export type TrainStatus   = 'ON_TIME' | 'DELAYED' | 'CONFLICT' | 'HALTED' | 'SCHEDULED';
export type SignalState   = 'RED' | 'YELLOW' | 'GREEN';

export interface Train {
  id: string;
  name: string;
  priority: TrainPriority;
  origin: string;
  destination: string;
  eta: string;
  status: TrainStatus;
  delay: number; // minutes
  speed: number; // km/h
  platform?: number;
  section: string;
}

export interface Conflict {
  id: string;
  trainA: string;
  trainB: string;
  location: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  type: 'CROSSING' | 'PRECEDENCE' | 'PLATFORM' | 'SIGNAL';
  timeToConflict: number; // seconds
  recommendation: string;
  confidence: number; // 0-100
  timeSaving: number; // minutes
}

export interface Decision {
  id: string;
  timestamp: string;
  action: string;
  operator: string;
  source: 'AI' | 'MANUAL';
  trains: string[];
}

export interface KPIData {
  avgDelay: number;
  punctuality: number;
  throughput: number;
  conflictRate: number;
  overrideRate: number;
  aiAcceptance: number;
  deltas: {
    avgDelay: number;
    punctuality: number;
    throughput: number;
    conflictRate: number;
    overrideRate: number;
    aiAcceptance: number;
  };
}

// ── Track Map Topology ────────────────────────
export const TRACK_STATIONS = [
  { id: 'ST-1', name: 'NDLS', label: 'New Delhi', x: 60,  y: 200, platforms: 4 },
  { id: 'ST-2', name: 'MTJ',  label: 'Mathura Jn', x: 200, y: 200, platforms: 3 },
  { id: 'ST-3', name: 'AGC',  label: 'Agra Cantt', x: 340, y: 200, platforms: 4 },
  { id: 'ST-4', name: 'DHO',  label: 'Dhaulpur',   x: 460, y: 200, platforms: 2 },
  { id: 'ST-5', name: 'GWL',  label: 'Gwalior',    x: 590, y: 200, platforms: 3 },
  { id: 'ST-6', name: 'JHS',  label: 'Jhansi',     x: 720, y: 200, platforms: 4 },
  { id: 'ST-7', name: 'BPL',  label: 'Bhopal',     x: 850, y: 200, platforms: 4 },
  { id: 'ST-8', name: 'ETW',  label: 'Etawah',     x: 340, y: 100, platforms: 2 },
];

export const TRACK_JUNCTIONS = [
  { id: 'J-1', x: 340, y: 200, label: 'Agra Jn' },
  { id: 'J-2', x: 590, y: 200, label: 'Gwalior Jn' },
  { id: 'J-3', x: 720, y: 200, label: 'Jhansi Jn' },
];

export const TRACK_SEGMENTS = [
  { id: 'SEG-01', from: 'ST-1', to: 'ST-2', track: 'UP' },
  { id: 'SEG-02', from: 'ST-2', to: 'ST-3', track: 'UP' },
  { id: 'SEG-03', from: 'ST-3', to: 'ST-4', track: 'UP' },
  { id: 'SEG-04', from: 'ST-4', to: 'ST-5', track: 'UP' },
  { id: 'SEG-05', from: 'ST-5', to: 'ST-6', track: 'UP' },
  { id: 'SEG-06', from: 'ST-6', to: 'ST-7', track: 'UP' },
  { id: 'SEG-07', from: 'ST-8', to: 'ST-3', track: 'BRANCH' },
];

export const TRACK_SIGNALS = [
  { id: 'SIG-01', x: 130,  y: 188, state: 'GREEN' as SignalState },
  { id: 'SIG-02', x: 270,  y: 188, state: 'GREEN' as SignalState },
  { id: 'SIG-03', x: 400,  y: 188, state: 'RED' as SignalState },
  { id: 'SIG-04', x: 525,  y: 188, state: 'YELLOW' as SignalState },
  { id: 'SIG-05', x: 655,  y: 188, state: 'GREEN' as SignalState },
  { id: 'SIG-06', x: 785,  y: 188, state: 'GREEN' as SignalState },
];
