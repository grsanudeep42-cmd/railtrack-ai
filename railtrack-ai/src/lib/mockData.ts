// ─────────────────────────────────────────────
//  RailTrack AI — Comprehensive Mock Data
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

// ── Trains ────────────────────────────────────
export const MOCK_TRAINS: Train[] = [
  { id: 'TN-2034', name: 'Rajdhani Express', priority: 'EXPRESS', origin: 'NDLS', destination: 'MAS', eta: '14:35', status: 'ON_TIME', delay: 0, speed: 118, platform: 2, section: 'NR-42' },
  { id: 'TN-4417', name: 'Shatabdi Express', priority: 'EXPRESS', origin: 'BPL', destination: 'NDLS', eta: '15:10', status: 'DELAYED', delay: 12, speed: 94, platform: 1, section: 'NR-42' },
  { id: 'TN-7823', name: 'Goods Train', priority: 'FREIGHT', origin: 'VSKP', destination: 'KGP', eta: '15:45', status: 'ON_TIME', delay: 0, speed: 62, section: 'NR-42' },
  { id: 'TN-1199', name: 'Duronto Express', priority: 'EXPRESS', origin: 'BCT', destination: 'HWH', eta: '16:20', status: 'CONFLICT', delay: 8, speed: 87, platform: 3, section: 'NR-42' },
  { id: 'TN-5502', name: 'Jan Shatabdi', priority: 'LOCAL', origin: 'AGC', destination: 'BPL', eta: '16:55', status: 'ON_TIME', delay: 0, speed: 72, platform: 4, section: 'NR-42' },
  { id: 'TN-3345', name: 'Cement Freight', priority: 'FREIGHT', origin: 'JPR', destination: 'RTM', eta: '17:15', status: 'DELAYED', delay: 22, speed: 48, section: 'NR-42' },
  { id: 'TN-8821', name: 'Track Inspection', priority: 'MAINTENANCE', origin: 'GWL', destination: 'AGC', eta: '17:40', status: 'SCHEDULED', delay: 0, speed: 40, section: 'NR-42' },
  { id: 'TN-6610', name: 'Intercity Express', priority: 'LOCAL', origin: 'NDLS', destination: 'JHS', eta: '18:00', status: 'ON_TIME', delay: 0, speed: 78, platform: 2, section: 'NR-42' },
  { id: 'TN-9002', name: 'Steel Freight', priority: 'FREIGHT', origin: 'BSP', destination: 'RJPB', eta: '18:30', status: 'SCHEDULED', delay: 0, speed: 55, section: 'NR-42' },
  { id: 'TN-4400', name: 'Superfast Express', priority: 'EXPRESS', origin: 'MAS', destination: 'NDLS', eta: '19:05', status: 'ON_TIME', delay: 0, speed: 112, platform: 1, section: 'NR-42' },
];

// ── Conflicts ─────────────────────────────────
export const MOCK_CONFLICTS: Conflict[] = [
  {
    id: 'CF-001',
    trainA: 'TN-1199',
    trainB: 'TN-7823',
    location: 'Junction J-2 (Gwalior North)',
    severity: 'HIGH',
    type: 'CROSSING',
    timeToConflict: 184,
    recommendation: 'Hold TN-7823 at Signal S-14 for 4 minutes. Allow TN-1199 (Duronto) to clear junction first. Estimated time saving: 18 minutes total delay.',
    confidence: 94,
    timeSaving: 18,
  },
  {
    id: 'CF-002',
    trainA: 'TN-4417',
    trainB: 'TN-5502',
    location: 'Platform 1, Agra Cantt',
    severity: 'MEDIUM',
    type: 'PLATFORM',
    timeToConflict: 420,
    recommendation: 'Reroute TN-5502 to Platform 3. Platform 1 occupied by delayed TN-4417 until 15:18.',
    confidence: 88,
    timeSaving: 9,
  },
];

// ── Decisions ─────────────────────────────────
export const MOCK_DECISIONS: Decision[] = [
  { id: 'D-001', timestamp: '14:22:11', action: 'Held TN-3345 at Signal S-08 — CF-003 cleared', operator: 'R. Sharma', source: 'AI', trains: ['TN-3345'] },
  { id: 'D-002', timestamp: '14:18:44', action: 'Override: TN-4417 platform re-assigned to Platform 2', operator: 'R. Sharma', source: 'MANUAL', trains: ['TN-4417'] },
  { id: 'D-003', timestamp: '14:05:33', action: 'AI recommendation accepted — TN-2034 priority clearing', operator: 'R. Sharma', source: 'AI', trains: ['TN-2034', 'TN-6610'] },
  { id: 'D-004', timestamp: '13:57:02', action: 'Emergency signal override — Track fault ST-7', operator: 'R. Sharma', source: 'MANUAL', trains: [] },
  { id: 'D-005', timestamp: '13:44:19', action: 'Scheduled maintenance window confirmed for TN-8821', operator: 'Sys', source: 'AI', trains: ['TN-8821'] },
];

// ── KPI ───────────────────────────────────────
export const MOCK_KPI: KPIData = {
  avgDelay: 7.4,
  punctuality: 84.2,
  throughput: 127,
  conflictRate: 3.1,
  overrideRate: 18.7,
  aiAcceptance: 81.3,
  deltas: {
    avgDelay: -1.2,
    punctuality: 2.8,
    throughput: 11,
    conflictRate: -0.7,
    overrideRate: -3.2,
    aiAcceptance: 4.6,
  },
};

// ── Sparkline series ──────────────────────────
export const SPARKLINE_DELAY = [8.1, 9.2, 7.8, 8.5, 7.2, 6.9, 7.4];
export const SPARKLINE_PUNCTUALITY = [79.1, 80.3, 82.1, 81.7, 83.4, 83.9, 84.2];
export const SPARKLINE_THROUGHPUT = [112, 118, 121, 119, 124, 126, 127];
export const SPARKLINE_CONFLICTS = [4.2, 3.9, 3.7, 3.5, 3.3, 3.2, 3.1];
export const SPARKLINE_OVERRIDE = [22.1, 21.4, 20.8, 20.1, 19.4, 19.0, 18.7];
export const SPARKLINE_AI = [74.1, 75.8, 77.2, 78.5, 79.3, 80.1, 81.3];

// ── Delay chart (7 days) ──────────────────────
export const DELAY_CHART = [
  { time: 'Mon', express: 5.2, freight: 9.8, local: 7.1 },
  { time: 'Tue', express: 6.4, freight: 11.2, local: 8.3 },
  { time: 'Wed', express: 4.8, freight: 8.7, local: 6.9 },
  { time: 'Thu', express: 7.1, freight: 10.4, local: 9.2 },
  { time: 'Fri', express: 5.9, freight: 9.1, local: 7.8 },
  { time: 'Sat', express: 5.1, freight: 7.8, local: 6.4 },
  { time: 'Sun', express: 4.3, freight: 8.2, local: 5.9 },
];

// ── Throughput stacked bar ────────────────────
export const THROUGHPUT_CHART = [
  { time: 'Mon', express: 38, freight: 42, local: 31 },
  { time: 'Tue', express: 41, freight: 39, local: 33 },
  { time: 'Wed', express: 45, freight: 44, local: 35 },
  { time: 'Thu', express: 39, freight: 41, local: 32 },
  { time: 'Fri', express: 47, freight: 46, local: 38 },
  { time: 'Sat', express: 42, freight: 40, local: 30 },
  { time: 'Sun', express: 36, freight: 38, local: 28 },
];

// ── Heatmap (hour × day) ──────────────────────
export const CONFLICT_HEATMAP: { day: string; hour: number; value: number }[] = [];
const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
for (const day of days) {
  for (let hour = 0; hour < 24; hour++) {
    const peak = (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 20);
    const base = peak ? Math.random() * 6 + 2 : Math.random() * 2;
    CONFLICT_HEATMAP.push({ day, hour, value: parseFloat(base.toFixed(1)) });
  }
}

// ── AI acceptance rate over time ──────────────
export const AI_ACCEPTANCE_CHART = [
  { date: '01 Mar', acceptance: 72.4 },
  { date: '02 Mar', acceptance: 74.8 },
  { date: '03 Mar', acceptance: 73.1 },
  { date: '04 Mar', acceptance: 76.2 },
  { date: '05 Mar', acceptance: 77.9 },
  { date: '06 Mar', acceptance: 78.5 },
  { date: '07 Mar', acceptance: 79.3 },
  { date: '08 Mar', acceptance: 80.1 },
  { date: '09 Mar', acceptance: 79.8 },
  { date: '10 Mar', acceptance: 80.9 },
  { date: '11 Mar', acceptance: 81.3 },
  { date: '12 Mar', acceptance: 81.7 },
  { date: '13 Mar', acceptance: 80.8 },
  { date: '14 Mar', acceptance: 81.3 },
];

// ── Incidents table ───────────────────────────
export const MOCK_INCIDENTS = [
  { id: 'INC-0044', timestamp: '14 Mar 13:57', type: 'SIGNAL FAULT', trains: ['TN-2034'], location: 'Signal S-07, Dhaulpur', severity: 'HIGH', resolvedIn: '8 min' },
  { id: 'INC-0043', timestamp: '14 Mar 09:12', type: 'CROSSING CONFLICT', trains: ['TN-4417', 'TN-5502'], location: 'Junction J-1, Agra Cantt', severity: 'MEDIUM', resolvedIn: '14 min' },
  { id: 'INC-0042', timestamp: '13 Mar 21:44', type: 'PLATFORM CLASH', trains: ['TN-9002', 'TN-8821'], location: 'Platform 3, Gwalior', severity: 'LOW', resolvedIn: '5 min' },
  { id: 'INC-0041', timestamp: '13 Mar 17:30', type: 'SPEED VIOLATION', trains: ['TN-7823'], location: 'Track Section NR-42-B', severity: 'MEDIUM', resolvedIn: '2 min' },
  { id: 'INC-0040', timestamp: '13 Mar 11:20', type: 'BREAKDOWN', trains: ['TN-6610'], location: 'Morena Station', severity: 'HIGH', resolvedIn: '42 min' },
];

// ── Admin Users ───────────────────────────────
export const MOCK_USERS = [
  { id: 'U-001', name: 'Rajesh Sharma', email: 'r.sharma@railways.gov.in', role: 'CONTROLLER', status: 'ONLINE', lastLogin: '14 Mar 13:45', section: 'NR-42' },
  { id: 'U-002', name: 'Priya Mehta', email: 'p.mehta@railways.gov.in', role: 'SUPERVISOR', status: 'ONLINE', lastLogin: '14 Mar 12:10', section: 'All Zones' },
  { id: 'U-003', name: 'Arun Kumar', email: 'a.kumar@railways.gov.in', role: 'LOGISTICS', status: 'OFFLINE', lastLogin: '13 Mar 22:30', section: 'WR-15' },
  { id: 'U-004', name: 'Sunita Rao', email: 's.rao@railways.gov.in', role: 'CONTROLLER', status: 'ONLINE', lastLogin: '14 Mar 14:02', section: 'SR-07' },
  { id: 'U-005', name: 'Vikram Singh', email: 'v.singh@railways.gov.in', role: 'ADMIN', status: 'ONLINE', lastLogin: '14 Mar 08:00', section: 'HQ' },
];

// ── System Health ─────────────────────────────
export const SYSTEM_HEALTH = [
  { name: 'FastAPI Server', status: 'UP', latency: 12, uptime: 99.97 },
  { name: 'PostgreSQL DB', status: 'UP', latency: 4, uptime: 99.99 },
  { name: 'TimescaleDB', status: 'UP', latency: 6, uptime: 99.98 },
  { name: 'Redis Cache', status: 'UP', latency: 1, uptime: 100.0 },
  { name: 'Kafka Broker', status: 'UP', latency: 28, uptime: 99.91 },
  { name: 'ML Inference', status: 'UP', latency: 145, uptime: 99.82 },
  { name: 'WebSocket Hub', status: 'UP', latency: 8, uptime: 99.94 },
  { name: 'MinIO Storage', status: 'DEGRADED', latency: 340, uptime: 98.12 },
];

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

// Demo train positions (x offset along track in the SVG)
export const DEMO_TRAIN_PATHS = [
  { trainId: 'TN-2034', segFrom: 'ST-1', segTo: 'ST-2', progress: 0.65, priority: 'EXPRESS' as TrainPriority },
  { trainId: 'TN-4417', segFrom: 'ST-2', segTo: 'ST-3', progress: 0.40, priority: 'EXPRESS' as TrainPriority },
  { trainId: 'TN-7823', segFrom: 'ST-3', segTo: 'ST-4', progress: 0.15, priority: 'FREIGHT' as TrainPriority },
  { trainId: 'TN-1199', segFrom: 'ST-4', segTo: 'ST-5', progress: 0.80, priority: 'EXPRESS' as TrainPriority },
  { trainId: 'TN-5502', segFrom: 'ST-5', segTo: 'ST-6', progress: 0.30, priority: 'LOCAL' as TrainPriority },
];
