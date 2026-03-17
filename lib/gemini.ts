// Generates signals and analysis using Gemini 1.5 Flash (free tier)
// Free API key: https://aistudio.google.com/app/apikey

import type { MacroReading, MacroIndicator, Signal } from '@/types'

const GEMINI_KEY = process.env.GEMINI_API_KEY!
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'

interface IndicatorWithReading extends MacroReading {
  indicator: MacroIndicator
}

interface GeminiAnalysisResult {
  indicator_signals: Record<string, { signal: Signal; label: string }>
  group_signals: Record<string, { signal: Signal; analysis: string }>
  overall: { signal: Signal; analysis: string }
}

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096,
      }
    })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

// Build the prompt with all 34 readings and ask for complete analysis
function buildAnalysisPrompt(readings: IndicatorWithReading[], month: string): string {
  const byGroup: Record<number, IndicatorWithReading[]> = {}
  for (const r of readings) {
    const g = r.indicator.group_num
    if (!byGroup[g]) byGroup[g] = []
    byGroup[g].push(r)
  }

  const groupNames: Record<number, string> = {
    1: 'Liquidity Engine',
    2: 'Credit & Debt Oxygen',
    3: 'Market Internals',
    4: 'Real Economy Pulse',
    5: 'Currency & Global Stress',
    6: 'Commodities & Real Assets',
  }

  let indicatorList = ''
  for (const [groupNum, items] of Object.entries(byGroup)) {
    indicatorList += `\n## Group ${groupNum}: ${groupNames[parseInt(groupNum)]}\n`
    for (const r of items) {
      const val = r.value_numeric !== null
        ? `${r.value_numeric.toFixed(2)} ${r.indicator.unit ?? ''}`
        : r.value_text ?? 'N/A'
      indicatorList += `- ${r.indicator.name}: ${val}\n`
      if (r.indicator.what_to_watch) {
        indicatorList += `  (Watch: ${r.indicator.what_to_watch})\n`
      }
    }
  }

  return `You are the DrillDown Macro Intelligence engine — an AI running the Druckenmiller top-down macro framework.

Today you are analysing ${month} macro data across 34 indicators in 6 groups.

Framework: Liquidity → Credit → Market Internals → Real Economy → Currency → Commodities.
Signal definitions: BULLISH = conditions supportive of risk assets | CAUTION = mixed or deteriorating conditions | BEARISH = conditions hostile to risk assets | NEUTRAL = insufficient data or no clear signal.

Here are all 34 indicator readings for ${month}:
${indicatorList}

Your task: Return ONLY valid JSON (no markdown, no preamble) in exactly this structure:
{
  "indicator_signals": {
    "<indicator_id>": {
      "signal": "BULLISH|CAUTION|BEARISH|NEUTRAL",
      "label": "Short descriptive label max 6 words"
    }
  },
  "group_signals": {
    "1": { "signal": "BULLISH|CAUTION|BEARISH", "analysis": "2-3 sentence paragraph for Liquidity Engine group" },
    "2": { "signal": "BULLISH|CAUTION|BEARISH", "analysis": "2-3 sentence paragraph for Credit group" },
    "3": { "signal": "BULLISH|CAUTION|BEARISH", "analysis": "2-3 sentence paragraph for Market Internals group" },
    "4": { "signal": "BULLISH|CAUTION|BEARISH", "analysis": "2-3 sentence paragraph for Real Economy group" },
    "5": { "signal": "BULLISH|CAUTION|BEARISH", "analysis": "2-3 sentence paragraph for Currency group" },
    "6": { "signal": "BULLISH|CAUTION|BEARISH", "analysis": "2-3 sentence paragraph for Commodities group" }
  },
  "overall": {
    "signal": "BULLISH|CAUTION|BEARISH",
    "analysis": "3-4 sentence overall macro regime summary synthesising all 6 groups"
  }
}

The indicator_signals keys must match these IDs exactly:
${readings.map(r => r.indicator_id).join(', ')}

Write analysis paragraphs in the voice of a seasoned macro analyst — specific, data-driven, no generic filler.`
}

export async function generateMacroAnalysis(
  readings: IndicatorWithReading[],
  month: string
): Promise<GeminiAnalysisResult> {
  const prompt = buildAnalysisPrompt(readings, month)
  const raw = await callGemini(prompt)

  // Strip any markdown code fences if present
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  try {
    return JSON.parse(clean)
  } catch (e) {
    console.error('Failed to parse Gemini response:', raw)
    throw new Error('Gemini returned invalid JSON')
  }
}

// For AI-synthesised indicators (ECB/BOJ, CDS, Lev Loan, EM FX, Capex Tone, Industrial Metals)
// These get their signal and value_text from a targeted Gemini call
export async function generateAISynthesisSignal(
  indicatorId: string,
  indicatorName: string,
  contextData: string,
  month: string
): Promise<{ value_text: string; signal: Signal; signal_label: string }> {

  const prompt = `You are a macro analyst running the Druckenmiller framework.

Indicator: ${indicatorName}
Month: ${month}
Available context: ${contextData}

Based on this context, provide a brief assessment. Return ONLY valid JSON:
{
  "value_text": "Short factual description of current state (max 10 words)",
  "signal": "BULLISH|CAUTION|BEARISH|NEUTRAL",
  "signal_label": "Concise label max 6 words"
}`

  const raw = await callGemini(prompt)
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(clean)
}
