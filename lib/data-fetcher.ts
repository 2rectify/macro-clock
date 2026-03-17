// Orchestrates the full monthly data pipeline:
// 1. Fetch all 34 indicators from their respective APIs
// 2. Store raw readings in macro_readings table
// 3. Call Gemini to generate signals + analysis
// 4. Store analysis in macro_analysis table
// 5. Mark month as complete in macro_months table

import { supabaseAdmin } from './supabase'
import * as FRED from './fred'
import * as Market from './market-data'
import * as Treasury from './treasury'
import { fetchCOTUSD } from './cftc'
import { generateMacroAnalysis, generateAISynthesisSignal } from './gemini'
import type { MacroIndicator, Signal } from '@/types'

// Returns the target month as a Date (first day of previous month)
export function getTargetMonth(date = new Date()): Date {
  const d = new Date(date)
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  d.setHours(0, 0, 0, 0)
  return d
}

export function formatMonth(date: Date): string {
  return date.toISOString().split('T')[0] // YYYY-MM-DD
}

export function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

interface ReadingInput {
  indicator_id: string
  month: string
  value_numeric?: number | null
  value_text?: string | null
  signal: Signal
  signal_label: string
  raw_response?: Record<string, unknown>
}

// ── MAIN PIPELINE ──────────────────────────────────────────────────────────

export async function runMonthlyFetch(targetMonth?: Date): Promise<{ success: boolean; message: string }> {
  const month = targetMonth ?? getTargetMonth()
  const monthStr = formatMonth(month)
  const monthLabel = formatMonthLabel(monthStr)

  console.log(`[MacroFetch] Starting pipeline for ${monthLabel} (${monthStr})`)

  // Check if already done
  const { data: existing } = await supabaseAdmin
    .from('macro_months')
    .select('status')
    .eq('month', monthStr)
    .single()

  if (existing?.status === 'complete') {
    return { success: true, message: `${monthLabel} already processed` }
  }

  // Upsert month record as fetching
  await supabaseAdmin.from('macro_months').upsert({
    month: monthStr,
    status: 'fetching',
    readings_at: null,
    analysis_at: null,
    error_msg: null
  })

  try {
    // ── STEP 1: FETCH ALL RAW DATA ──────────────────────────────────────
    const readings: ReadingInput[] = []

    // --- GROUP 1: LIQUIDITY ---
    const m2 = await FRED.fetchM2YoY()
    readings.push({
      indicator_id: 'm2_yoy', month: monthStr,
      value_numeric: m2,
      signal: m2 === null ? 'NEUTRAL' : m2 > 5 ? 'BULLISH' : m2 > 2 ? 'CAUTION' : 'BEARISH',
      signal_label: m2 === null ? 'No data' : `${m2.toFixed(1)}% YoY`,
    })

    const fedBS = await FRED.fetchFedBalanceSheet()
    readings.push({
      indicator_id: 'fed_bs', month: monthStr,
      value_numeric: fedBS,
      signal: 'NEUTRAL', // AI will refine
      signal_label: fedBS ? `$${fedBS.toFixed(2)}T` : 'No data',
    })

    const rrp = await FRED.fetchRRP()
    readings.push({
      indicator_id: 'rrp', month: monthStr,
      value_numeric: rrp,
      signal: rrp === null ? 'NEUTRAL' : rrp < 50 ? 'BEARISH' : rrp < 300 ? 'CAUTION' : 'BULLISH',
      signal_label: rrp ? `$${rrp.toFixed(1)}B` : 'No data',
    })

    const tga = await Treasury.fetchTGA()
    readings.push({
      indicator_id: 'tga', month: monthStr,
      value_numeric: tga,
      signal: 'NEUTRAL',
      signal_label: tga ? `$${tga.toFixed(0)}B` : 'Monitor',
    })

    // ECB+BOJ: AI synthesis
    const ecbBoj = await generateAISynthesisSignal(
      'ecb_boj', 'ECB + BOJ Balance Sheets',
      'ECB has been reducing its balance sheet through PEPP/PSPP wind-down. BOJ has been signalling rate hikes and YCC policy changes. Net global central bank liquidity is mixed.',
      monthLabel
    )
    readings.push({ indicator_id: 'ecb_boj', month: monthStr, ...ecbBoj })

    // --- GROUP 2: CREDIT ---
    const hy = await FRED.fetchHYSpread()
    readings.push({
      indicator_id: 'hy_spread', month: monthStr,
      value_numeric: hy,
      signal: hy === null ? 'NEUTRAL' : hy < 300 ? 'BULLISH' : hy < 450 ? 'CAUTION' : 'BEARISH',
      signal_label: hy ? `${hy.toFixed(0)}bps` : 'No data',
    })

    const ig = await FRED.fetchIGSpread()
    readings.push({
      indicator_id: 'ig_spread', month: monthStr,
      value_numeric: ig,
      signal: ig === null ? 'NEUTRAL' : ig < 100 ? 'BULLISH' : ig < 150 ? 'CAUTION' : 'BEARISH',
      signal_label: ig ? `${ig.toFixed(0)}bps` : 'No data',
    })

    const yc = await FRED.fetchYieldCurve2s10s()
    readings.push({
      indicator_id: 'yield_curve', month: monthStr,
      value_numeric: yc,
      signal: yc === null ? 'NEUTRAL' : yc > 50 ? 'CAUTION' : yc > 0 ? 'BULLISH' : 'BEARISH',
      signal_label: yc ? `${yc > 0 ? '+' : ''}${yc.toFixed(0)}bps` : 'No data',
    })

    const sloos = await FRED.fetchSLOOS()
    readings.push({
      indicator_id: 'sloos', month: monthStr,
      value_numeric: sloos,
      signal: sloos === null ? 'NEUTRAL' : sloos > 20 ? 'BEARISH' : sloos > 5 ? 'CAUTION' : 'BULLISH',
      signal_label: sloos !== null ? `${sloos.toFixed(1)}% net tight` : 'Quarterly',
    })

    const cds = await generateAISynthesisSignal('cds_signal', 'Single-Name CDS Signal',
      'Monitor major financial CDS signals. No acute stress visible in GE, JPM, BAC credit default swaps.',
      monthLabel)
    readings.push({ indicator_id: 'cds_signal', month: monthStr, ...cds })

    const levLoan = await generateAISynthesisSignal('lev_loan', 'Leveraged Loan Signal',
      'COVID-era cheap leveraged debt maturing 2026-28 at elevated rates. Monitor refinancing walls and covenant quality.',
      monthLabel)
    readings.push({ indicator_id: 'lev_loan', month: monthStr, ...levLoan })

    // --- GROUP 3: MARKET INTERNALS ---
    const cassSignal = await generateAISynthesisSignal('cass_freight', 'Cass Freight Index',
      'Cass freight shipment volumes remain weak, consistent with soft real economy and industrial slowdown. No improvement visible.',
      monthLabel)
    readings.push({ indicator_id: 'cass_freight', month: monthStr, ...cassSignal })

    const xrtSpy = await Market.fetchXRTSPY()
    readings.push({
      indicator_id: 'xrt_spy', month: monthStr,
      value_numeric: xrtSpy,
      signal: 'NEUTRAL', // AI will assess trend direction
      signal_label: xrtSpy ? xrtSpy.toFixed(3) : 'No data',
    })

    const iwmSpy = await Market.fetchIWMSPY()
    readings.push({
      indicator_id: 'iwm_spy', month: monthStr,
      value_numeric: iwmSpy,
      signal: 'NEUTRAL',
      signal_label: iwmSpy ? iwmSpy.toFixed(3) : 'No data',
    })

    const kbeSpy = await Market.fetchKBESPY()
    readings.push({
      indicator_id: 'kbe_spy', month: monthStr,
      value_numeric: kbeSpy,
      signal: 'NEUTRAL',
      signal_label: kbeSpy ? kbeSpy.toFixed(3) : 'No data',
    })

    const xlyXlp = await Market.fetchXLYXLP()
    readings.push({
      indicator_id: 'xly_xlp', month: monthStr,
      value_numeric: xlyXlp,
      signal: 'NEUTRAL',
      signal_label: xlyXlp ? xlyXlp.toFixed(3) : 'No data',
    })

    const { value: nyad } = await Market.fetchNYAD()
    const nyadSignal = await generateAISynthesisSignal('nyad', 'NYSE A/D Line Trend',
      `NYSE Advance/Decline line current value: ${nyad?.toFixed(0) ?? 'unavailable'}. Monitor for divergence from S&P 500 index level.`,
      monthLabel)
    readings.push({ indicator_id: 'nyad', month: monthStr, value_numeric: nyad, ...nyadSignal })

    // --- GROUP 4: REAL ECONOMY ---
    const ismMfg = await FRED.fetchISMMfg()
    readings.push({
      indicator_id: 'ism_mfg', month: monthStr,
      value_numeric: ismMfg,
      signal: ismMfg === null ? 'NEUTRAL' : ismMfg > 52 ? 'BULLISH' : ismMfg > 50 ? 'CAUTION' : 'BEARISH',
      signal_label: ismMfg ? ismMfg.toFixed(1) : 'No data',
    })

    const ismSvc = await FRED.fetchISMSvc()
    readings.push({
      indicator_id: 'ism_svc', month: monthStr,
      value_numeric: ismSvc,
      signal: ismSvc === null ? 'NEUTRAL' : ismSvc > 52 ? 'BULLISH' : ismSvc > 50 ? 'CAUTION' : 'BEARISH',
      signal_label: ismSvc ? ismSvc.toFixed(1) : 'No data',
    })

    const nfib = await FRED.fetchNFIB()
    readings.push({
      indicator_id: 'nfib', month: monthStr,
      value_numeric: nfib,
      signal: nfib === null ? 'NEUTRAL' : nfib > 100 ? 'BULLISH' : nfib > 95 ? 'CAUTION' : 'BEARISH',
      signal_label: nfib ? nfib.toFixed(1) : 'No data',
    })

    const retail = await FRED.fetchRealRetailYoY()
    readings.push({
      indicator_id: 'real_retail', month: monthStr,
      value_numeric: retail,
      signal: retail === null ? 'NEUTRAL' : retail > 2 ? 'BULLISH' : retail > 0 ? 'CAUTION' : 'BEARISH',
      signal_label: retail !== null ? `${retail.toFixed(1)}% YoY` : 'No data',
    })

    const capex = await generateAISynthesisSignal('capex_tone', 'Capex Guidance Tone',
      'AI/hyperscaler capex elevated (MSFT/AMZN/GOOGL/META). Ex-AI industrials and consumer companies cautious language. Tariff uncertainty cited on recent earnings calls.',
      monthLabel)
    readings.push({ indicator_id: 'capex_tone', month: monthStr, ...capex })

    const deficit = await Treasury.fetchFiscalDeficit()
    readings.push({
      indicator_id: 'fiscal_deficit', month: monthStr,
      value_numeric: deficit,
      signal: 'BEARISH', // Structurally always bearish per Druckenmiller thesis
      signal_label: deficit ? `$${deficit.toFixed(1)}T annualised` : 'No data',
    })

    // --- GROUP 5: CURRENCY ---
    const dxy = await FRED.fetchDXY()
    readings.push({
      indicator_id: 'dxy', month: monthStr,
      value_numeric: dxy,
      signal: dxy === null ? 'NEUTRAL' : dxy < 95 ? 'BEARISH' : dxy < 100 ? 'CAUTION' : 'BULLISH',
      signal_label: dxy ? dxy.toFixed(1) : 'No data',
    })

    const usdjpy = await Market.fetchUSDJPY()
    readings.push({
      indicator_id: 'usdjpy', month: monthStr,
      value_numeric: usdjpy,
      signal: 'NEUTRAL',
      signal_label: usdjpy ? usdjpy.toFixed(1) : 'No data',
    })

    const emFx = await Market.fetchEMFXSymbols()
    const emSignal = await generateAISynthesisSignal('em_fx', 'EM Currency Basket',
      `Current EM FX levels: BRL ${emFx['USDBRL=X']?.toFixed(2)}, TRY ${emFx['USDTRY=X']?.toFixed(2)}, ZAR ${emFx['USDZAR=X']?.toFixed(2)}, MXN ${emFx['USDMXN=X']?.toFixed(2)}. DXY at ${dxy?.toFixed(1)}.`,
      monthLabel)
    readings.push({ indicator_id: 'em_fx', month: monthStr, raw_response: emFx as Record<string, unknown>, ...emSignal })

    const cot = await fetchCOTUSD()
    readings.push({
      indicator_id: 'cot_usd',
      month: monthStr,
      value_numeric: cot.net_position,
      value_text: cot.net_position === null ? 'CFTC data unavailable' : undefined,
      signal: cot.signal,
      signal_label: cot.signal_label,
      raw_response: { long: cot.long_contracts, short: cot.short_contracts, date: cot.report_date } as Record<string, unknown>,
    })

    const rateDiff = await FRED.fetchRateDifferential()
    readings.push({
      indicator_id: 'rate_diff', month: monthStr,
      value_numeric: rateDiff,
      signal: rateDiff === null ? 'NEUTRAL' : rateDiff > 200 ? 'BULLISH' : rateDiff > 100 ? 'CAUTION' : 'BEARISH',
      signal_label: rateDiff ? `US-DE +${rateDiff.toFixed(0)}bps` : 'No data',
    })

    const tic = await Treasury.fetchTICHoldings()
    readings.push({
      indicator_id: 'tic', month: monthStr,
      value_numeric: tic,
      signal: 'BEARISH', // Structural outflows thesis
      signal_label: tic ? `$${tic.toFixed(1)}T total` : 'Check treasury.gov',
    })

    // --- GROUP 6: COMMODITIES ---
    const copper = await Market.fetchCopper()
    readings.push({
      indicator_id: 'copper', month: monthStr,
      value_numeric: copper,
      signal: copper === null ? 'NEUTRAL' : copper > 4.5 ? 'BULLISH' : copper > 3.5 ? 'CAUTION' : 'BEARISH',
      signal_label: copper ? `$${copper.toFixed(2)}/lb` : 'No data',
    })

    const gold = await Market.fetchGold()
    readings.push({
      indicator_id: 'gold', month: monthStr,
      value_numeric: gold,
      signal: gold === null ? 'NEUTRAL' : gold > 2500 ? 'BULLISH' : gold > 2000 ? 'CAUTION' : 'NEUTRAL',
      signal_label: gold ? `$${gold.toFixed(0)}/oz` : 'No data',
    })

    const wti = await FRED.fetchWTI()
    readings.push({
      indicator_id: 'wti', month: monthStr,
      value_numeric: wti,
      signal: wti === null ? 'NEUTRAL' : wti > 85 ? 'CAUTION' : wti > 60 ? 'NEUTRAL' : 'BEARISH',
      signal_label: wti ? `$${wti.toFixed(1)}/bbl` : 'No data',
    })

    const tips = await FRED.fetchTIPSBreakeven()
    readings.push({
      indicator_id: 'tips_bei', month: monthStr,
      value_numeric: tips,
      signal: tips === null ? 'NEUTRAL' : tips > 2.5 ? 'BEARISH' : tips > 2 ? 'CAUTION' : 'BULLISH',
      signal_label: tips ? `${tips.toFixed(2)}%` : 'No data',
    })

    const metals = await Market.fetchIndustrialMetals()
    const metalsSignal = await generateAISynthesisSignal('indust_metals', 'Industrial Metals Complex',
      `Aluminium: $${metals.aluminium?.toFixed(0)}/t, Nickel: $${metals.nickel?.toFixed(0)}/t. Copper at $${copper?.toFixed(2)}/lb. Assess whether complex is moving in coordinated direction.`,
      monthLabel)
    readings.push({ indicator_id: 'indust_metals', month: monthStr, raw_response: metals as Record<string, unknown>, ...metalsSignal })

    // ── STEP 2: STORE READINGS ───────────────────────────────────────────
    const { error: readingsError } = await supabaseAdmin
      .from('macro_readings')
      .upsert(readings, { onConflict: 'indicator_id,month' })

    if (readingsError) throw new Error(`Failed to store readings: ${readingsError.message}`)

    await supabaseAdmin.from('macro_months').upsert({
      month: monthStr, status: 'analysing', readings_at: new Date().toISOString()
    })

    // ── STEP 3: GENERATE AI ANALYSIS ────────────────────────────────────
    // Fetch stored readings with indicator metadata for Gemini prompt
    const { data: storedReadings } = await supabaseAdmin
      .from('macro_readings')
      .select('*, indicator:macro_indicators(*)')
      .eq('month', monthStr)

    if (!storedReadings?.length) throw new Error('No readings found after storage')

    const analysis = await generateMacroAnalysis(storedReadings as Parameters<typeof generateMacroAnalysis>[0], monthLabel)

    // Update individual indicator signals from AI assessment
    for (const [indId, sig] of Object.entries(analysis.indicator_signals)) {
      await supabaseAdmin
        .from('macro_readings')
        .update({ signal: sig.signal, signal_label: sig.label })
        .eq('indicator_id', indId)
        .eq('month', monthStr)
    }

    // ── STEP 4: STORE ANALYSIS ──────────────────────────────────────────
    const analysisRows = [
      // Overall
      { month: monthStr, group_num: null, group_name: 'Overall', ...analysis.overall },
      // 6 groups
      ...Object.entries(analysis.group_signals).map(([num, data]) => ({
        month: monthStr,
        group_num: parseInt(num),
        group_name: ['Liquidity Engine','Credit & Debt Oxygen','Market Internals','Real Economy Pulse','Currency & Global Stress','Commodities & Real Assets'][parseInt(num) - 1],
        ...data
      }))
    ]

    const { error: analysisError } = await supabaseAdmin
      .from('macro_analysis')
      .upsert(analysisRows, { onConflict: 'month,group_num' })

    if (analysisError) throw new Error(`Failed to store analysis: ${analysisError.message}`)

    // ── STEP 5: MARK COMPLETE ────────────────────────────────────────────
    await supabaseAdmin.from('macro_months').upsert({
      month: monthStr, status: 'complete', analysis_at: new Date().toISOString()
    })

    console.log(`[MacroFetch] ✓ Pipeline complete for ${monthLabel}`)
    return { success: true, message: `${monthLabel} processed successfully` }

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[MacroFetch] Pipeline failed:`, msg)
    await supabaseAdmin.from('macro_months').upsert({
      month: monthStr, status: 'error', error_msg: msg
    })
    return { success: false, message: msg }
  }
}

// Compute 6-month and 12-month rolling averages for numeric indicators
export async function computeRollingAverages(months = 6) {
  const { data } = await supabaseAdmin.rpc('compute_rolling_averages', { p_months: months })
  return data
}
