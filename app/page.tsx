'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import type { MonthDashboard, MacroMonth, Signal } from '@/types'
import { formatMonthLabel } from '@/lib/data-fetcher'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── SIGNAL HELPERS ──────────────────────────────────────────────────────────

function signalClass(signal: Signal): string {
  switch (signal) {
    case 'BULLISH':  return 'sig-bullish'
    case 'CAUTION':  return 'sig-caution'
    case 'BEARISH':  return 'sig-bearish'
    default:         return 'sig-neutral'
  }
}

function signalDot(signal: Signal): string {
  switch (signal) {
    case 'BULLISH':  return '#4caf7d'
    case 'CAUTION':  return '#e09e3a'
    case 'BEARISH':  return '#d45f5f'
    default:         return '#666660'
  }
}

const GROUP_ICONS: Record<number, string> = {
  1: '◈', 2: '⬡', 3: '◎', 4: '◷', 5: '⊕', 6: '◆',
}

// ── COMPONENTS ──────────────────────────────────────────────────────────────

function SignalBadge({ signal, large }: { signal: Signal; large?: boolean }) {
  return (
    <span className={`signal-badge${large ? ' signal-badge-lg' : ''} ${signalClass(signal)}`}>
      {signal}
    </span>
  )
}

function Skeleton({ w, h }: { w?: string; h?: string }) {
  return (
    <div
      className="skeleton"
      style={{ width: w ?? '100%', height: h ?? '1rem', borderRadius: 4 }}
    />
  )
}

function OverallHero({ dashboard }: { dashboard: MonthDashboard }) {
  return (
    <div
      className="card fade-in"
      style={{
        padding: '2rem',
        marginBottom: '1.5rem',
        borderColor: signalDot(dashboard.overall_signal),
        borderWidth: '1px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <p className="text-muted" style={{ fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Macro Regime · {formatMonthLabel(dashboard.month)}
          </p>
          <SignalBadge signal={dashboard.overall_signal} large />
        </div>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${signalDot(dashboard.overall_signal)}33, transparent 70%)`,
            border: `1px solid ${signalDot(dashboard.overall_signal)}44`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            color: signalDot(dashboard.overall_signal),
            flexShrink: 0,
          }}
        >
          ◉
        </div>
      </div>
      <p
        style={{
          marginTop: '1.25rem',
          fontSize: '0.75rem',
          lineHeight: 1.7,
          color: 'var(--muted2)',
          maxWidth: 680,
        }}
      >
        {dashboard.overall_analysis}
      </p>
    </div>
  )
}

function GroupCard({ group, index }: { group: MonthDashboard['groups'][0]; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const icon = GROUP_ICONS[group.group_num] ?? '◇'

  return (
    <div
      className={`card fade-in delay-${Math.min(index + 1, 4)}`}
      style={{ overflow: 'hidden' }}
    >
      {/* Group header */}
      <div
        style={{
          padding: '1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          cursor: 'pointer',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
        }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ color: signalDot(group.signal), fontSize: '1rem', opacity: 0.8 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <p className="font-sans" style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text)' }}>
            {group.group_name}
          </p>
          <p style={{ fontSize: '0.58rem', color: 'var(--muted)', letterSpacing: '0.08em', marginTop: 2 }}>
            {group.indicators.length} indicators
          </p>
        </div>
        <SignalBadge signal={group.signal} />
        <span style={{ color: 'var(--muted)', fontSize: '0.65rem', marginLeft: 4 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Analysis text */}
      {expanded && (
        <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
          <p style={{ fontSize: '0.7rem', lineHeight: 1.75, color: 'var(--muted2)' }}>
            {group.analysis}
          </p>
        </div>
      )}

      {/* Indicator rows */}
      {expanded && (
        <div>
          {group.indicators.map((reading, i) => (
            <div
              key={reading.indicator_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.6rem 1.25rem',
                borderBottom: i < group.indicators.length - 1 ? '1px solid var(--border)' : 'none',
                gap: '0.75rem',
              }}
            >
              <span
                className="status-dot"
                style={{ background: signalDot(reading.signal), flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.65rem', color: 'var(--text)', truncate: true }}>
                  {reading.indicator?.name ?? reading.indicator_id}
                </p>
                {reading.indicator?.description && (
                  <p style={{ fontSize: '0.55rem', color: 'var(--muted)', marginTop: 1 }}>
                    {reading.indicator.description}
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: '0.65rem', color: 'var(--muted2)', fontFamily: 'var(--mono)' }}>
                  {reading.signal_label ?? '—'}
                </p>
                <SignalBadge signal={reading.signal} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBar({ months, selected, onSelect }: {
  months: MacroMonth[]
  selected: string
  onSelect: (m: string) => void
}) {
  return (
    <div className="nav">
      <a href="/" className="nav-logo">
        MACRO<span>CLOCK</span>
      </a>
      <select
        className="month-select"
        value={selected}
        onChange={e => onSelect(e.target.value)}
      >
        {months.map(m => (
          <option key={m.month} value={m.month}>
            {formatMonthLabel(m.month)}
            {m.status !== 'complete' ? ` (${m.status})` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

function GroupGrid({ dashboard }: { dashboard: MonthDashboard }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.875rem' }}>
      {dashboard.groups.map((group, i) => (
        <GroupCard key={group.group_num} group={group} index={i} />
      ))}
    </div>
  )
}

function SignalSummaryRow({ dashboard }: { dashboard: MonthDashboard }) {
  return (
    <div
      className="card fade-in"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        marginBottom: '1.5rem',
        overflow: 'hidden',
      }}
    >
      {dashboard.groups.map((group, i) => (
        <div
          key={group.group_num}
          style={{
            padding: '0.875rem 0.75rem',
            borderRight: i < 5 ? '1px solid var(--border)' : 'none',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '1.1rem', color: signalDot(group.signal), marginBottom: 4 }}>
            {GROUP_ICONS[group.group_num]}
          </div>
          <p style={{ fontSize: '0.5rem', color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            {group.group_name.split(' ')[0]}
          </p>
          <SignalBadge signal={group.signal} />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ month }: { month: MacroMonth }) {
  const isProcessing = month.status === 'fetching' || month.status === 'analysing'
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
      {isProcessing ? (
        <>
          <div className="status-dot status-fetching" style={{ width: 12, height: 12, margin: '0 auto 1rem' }} />
          <p className="font-sans" style={{ fontSize: '0.9rem', color: 'var(--gold)', marginBottom: '0.5rem' }}>
            {month.status === 'fetching' ? 'Fetching indicators…' : 'Generating analysis…'}
          </p>
          <p style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>
            This usually takes 2–3 minutes. Refresh to check progress.
          </p>
        </>
      ) : month.status === 'error' ? (
        <>
          <div className="status-dot status-error" style={{ width: 12, height: 12, margin: '0 auto 1rem' }} />
          <p className="font-sans" style={{ fontSize: '0.9rem', color: 'var(--red)', marginBottom: '0.5rem' }}>Pipeline Error</p>
          <p style={{ fontSize: '0.65rem', color: 'var(--muted)', maxWidth: 400, margin: '0 auto' }}>
            {month.error_msg ?? 'Unknown error. Check server logs.'}
          </p>
        </>
      ) : (
        <>
          <p className="font-sans" style={{ fontSize: '0.9rem', color: 'var(--muted2)', marginBottom: '0.5rem' }}>
            No data yet for {formatMonthLabel(month.month)}
          </p>
          <p style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>
            Data runs on the 25th of each month via cron job.
          </p>
        </>
      )}
    </div>
  )
}

// ── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [months, setMonths] = useState<MacroMonth[]>([])
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [dashboard, setDashboard] = useState<MonthDashboard | null>(null)
  const [loading, setLoading] = useState(true)

  // Load available months on mount
  useEffect(() => {
    async function loadMonths() {
      const { data } = await supabase
        .from('macro_months')
        .select('*')
        .order('month', { ascending: false })
        .limit(24)

      if (data?.length) {
        setMonths(data)
        setSelectedMonth(data[0].month)
      }
      setLoading(false)
    }
    loadMonths()
  }, [])

  // Load dashboard data when selected month changes
  const loadDashboard = useCallback(async (month: string) => {
    setDashboard(null)
    setLoading(true)

    // Fetch overall + group analysis
    const { data: analysisRows } = await supabase
      .from('macro_analysis')
      .select('*')
      .eq('month', month)

    // Fetch readings with indicator metadata
    const { data: readings } = await supabase
      .from('macro_readings')
      .select('*, indicator:macro_indicators(*)')
      .eq('month', month)
      .order('indicator(display_order)', { ascending: true })

    if (!analysisRows?.length || !readings?.length) {
      setLoading(false)
      return
    }

    const overall = analysisRows.find(r => r.group_num === null)
    const groupAnalysis = analysisRows.filter(r => r.group_num !== null)

    const groups = groupAnalysis
      .sort((a, b) => a.group_num - b.group_num)
      .map(ga => ({
        group_num: ga.group_num,
        group_name: ga.group_name,
        signal: ga.signal,
        analysis: ga.analysis,
        indicators: readings.filter(r => r.indicator?.group_num === ga.group_num),
      }))

    setDashboard({
      month,
      overall_signal: overall?.signal ?? 'NEUTRAL',
      overall_analysis: overall?.analysis ?? '',
      groups,
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    if (selectedMonth) loadDashboard(selectedMonth)
  }, [selectedMonth, loadDashboard])

  const selectedMonthObj = months.find(m => m.month === selectedMonth)

  return (
    <>
      <StatusBar months={months} selected={selectedMonth} onSelect={setSelectedMonth} />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1rem 4rem' }}>

        {/* Loading skeletons */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Skeleton h="140px" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '1px' }}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} h="80px" />)}
            </div>
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} h="60px" />)}
          </div>
        )}

        {/* Empty / error state */}
        {!loading && selectedMonthObj && !dashboard && (
          <EmptyState month={selectedMonthObj} />
        )}

        {/* Dashboard */}
        {!loading && dashboard && (
          <>
            <OverallHero dashboard={dashboard} />
            <SignalSummaryRow dashboard={dashboard} />
            <GroupGrid dashboard={dashboard} />

            {/* Footer */}
            <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p style={{ fontSize: '0.55rem', color: 'var(--muted)', letterSpacing: '0.08em' }}>
                MACRO CLOCK · DRUCKENMILLER FRAMEWORK · 34 INDICATORS · 6 GROUPS
              </p>
              <p style={{ fontSize: '0.55rem', color: 'var(--muted)', letterSpacing: '0.06em' }}>
                DATA SOURCES: FRED · YAHOO FINANCE · US TREASURY · CFTC · GEMINI AI
              </p>
            </div>
          </>
        )}

        {/* No months at all */}
        {!loading && months.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
            <p className="font-sans" style={{ fontSize: '0.9rem', color: 'var(--muted2)', marginBottom: '0.5rem' }}>
              No data available yet
            </p>
            <p style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>
              Trigger the first fetch via <code style={{ color: 'var(--gold)', fontSize: '0.6rem' }}>POST /api/trigger</code>
            </p>
          </div>
        )}
      </main>
    </>
  )
}
