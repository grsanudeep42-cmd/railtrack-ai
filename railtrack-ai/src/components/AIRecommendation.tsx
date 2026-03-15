'use client';
import { Conflict } from '@/lib/mockData';
import { useState, useEffect } from 'react';

interface Props {
  onAccept?: (conflict: Conflict) => void;
  onOverride?: (conflict: Conflict) => void;
  visible: boolean;
  conflict: Conflict | null;
  onDismiss: () => void;
}

export default function AIRecommendation({ visible, conflict, onDismiss, onAccept, onOverride }: Props) {
  if (!visible || !conflict) return null;

  return (
    <div className="animate-slide-in" style={{
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: '320px',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--bg-border)',
      borderLeft: '3px solid var(--accent-primary)',
      borderRadius: '8px 0 0 8px',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 10,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--bg-border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'inline-block' }} className="animate-pulse-live" />
        <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '11px', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.1em' }}>
          AI RECOMMENDATION
        </span>
        <button onClick={onDismiss} className="btn-icon" style={{ marginLeft: 'auto', width: '24px', height: '24px', fontSize: '12px', border: 'none' }}>
          ✕
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
        {/* Conflict info */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>
            CONFLICT DETECTED
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '13px', color: 'var(--accent-primary)', fontWeight: 700 }}>{conflict.trainA}</span>
            <span style={{ color: 'var(--text-muted)' }}>↔</span>
            <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '13px', color: 'var(--accent-primary)', fontWeight: 700 }}>{conflict.trainB}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>📍 {conflict.location}</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span className={`badge-${conflict.severity === 'HIGH' ? 'conflict' : conflict.severity === 'MEDIUM' ? 'warn' : 'rail'}`}>
              {conflict.severity}
            </span>
            <span className="badge-warn" style={{ fontFamily: 'var(--font-jetbrains)' }}>
              T-{Math.floor(conflict.timeToConflict / 60)}:{String(conflict.timeToConflict % 60).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: 'var(--bg-border)', margin: '16px 0' }} />

        {/* Recommendation text */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>
            RECOMMENDED ACTION
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
            {conflict.recommendation}
          </p>
        </div>

        {/* Confidence bar */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>CONFIDENCE</span>
            <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '13px', color: 'var(--accent-primary)', fontWeight: 700 }}>{conflict.confidence}%</span>
          </div>
          <div style={{ height: '6px', background: 'var(--bg-border)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${conflict.confidence}%`, background: 'linear-gradient(90deg, var(--accent-primary), #00a8cc)', borderRadius: '3px', transition: 'width 0.5s ease' }} />
          </div>
        </div>

        {/* Time saving */}
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--font-space-mono)', fontSize: '10px', color: 'var(--accent-safe)', letterSpacing: '0.1em', marginBottom: '4px' }}>EST. TIME SAVING</div>
          <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '24px', fontWeight: 700, color: 'var(--accent-safe)' }}>
            +{conflict.timeSaving} min
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ padding: '16px', borderTop: '1px solid var(--bg-border)', display: 'flex', gap: '8px' }}>
        <button className="btn-primary" style={{ flex: 1, justifyContent: 'center', fontSize: '13px', padding: '10px' }} onClick={() => onAccept?.(conflict)}>
          ✓ Accept
        </button>
        <button className="btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: '13px', padding: '10px' }} onClick={() => onOverride?.(conflict)}>
          Override
        </button>
      </div>
    </div>
  );
}
