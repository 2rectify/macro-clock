export type Signal = 'BULLISH' | 'CAUTION' | 'BEARISH' | 'NEUTRAL'

export interface MacroIndicator {
  id: string
  name: string
  group_num: number
  group_name: string
  unit: string | null
  fetch_method: 'fred' | 'yahoo' | 'treasury' | 'cftc' | 'ai' | 'pdf'
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly'
  fred_series: string | null
  yahoo_symbol: string | null
  treasury_endpoint: string | null
  description: string | null
  what_to_watch: string | null
  druck_use: string | null
  display_order: number
}

export interface MacroReading {
  id: string
  indicator_id: string
  month: string
  value_numeric: number | null
  value_text: string | null
  signal: Signal
  signal_label: string | null
  fetched_at: string
  // joined
  indicator?: MacroIndicator
}

export interface MacroAnalysis {
  id: string
  month: string
  group_num: number | null
  group_name: string | null
  signal: Signal
  analysis: string
  created_at: string
}

export interface MacroMonth {
  month: string
  status: 'pending' | 'fetching' | 'analysing' | 'complete' | 'error'
  readings_at: string | null
  analysis_at: string | null
  error_msg: string | null
}

export interface GroupSummary {
  group_num: number
  group_name: string
  signal: Signal
  analysis: string
  indicators: MacroReading[]
}

export interface MonthDashboard {
  month: string
  overall_signal: Signal
  overall_analysis: string
  groups: GroupSummary[]
}

export interface RollingAverage {
  indicator_id: string
  indicator_name: string
  group_num: number
  avg_numeric: number | null
  latest_numeric: number | null
  trend: 'improving' | 'deteriorating' | 'stable'
  months_counted: number
}
