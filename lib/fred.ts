// Fetches data from FRED (Federal Reserve Economic Data) — free API
// Get your free key at: https://fred.stlouisfed.org/docs/api/api_key.html

const FRED_KEY = process.env.FRED_API_KEY!
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'

interface FredObservation {
  date: string
  value: string
}

interface FredResponse {
  observations: FredObservation[]
}

// Fetch the most recent observation for a FRED series
export async function fetchFredLatest(series: string): Promise<number | null> {
  const url = new URL(FRED_BASE)
  url.searchParams.set('series_id', series)
  url.searchParams.set('api_key', FRED_KEY)
  url.searchParams.set('file_type', 'json')
  url.searchParams.set('sort_order', 'desc')
  url.searchParams.set('limit', '1')

  const res = await fetch(url.toString())
  if (!res.ok) {
    console.error(`FRED fetch failed for ${series}: ${res.status}`)
    return null
  }

  const data: FredResponse = await res.json()
  const val = data.observations?.[0]?.value
  if (!val || val === '.') return null
  return parseFloat(val)
}

// Fetch last N observations for rolling calculations
export async function fetchFredSeries(series: string, limit = 13): Promise<{ date: string; value: number }[]> {
  const url = new URL(FRED_BASE)
  url.searchParams.set('series_id', series)
  url.searchParams.set('api_key', FRED_KEY)
  url.searchParams.set('file_type', 'json')
  url.searchParams.set('sort_order', 'desc')
  url.searchParams.set('limit', String(limit))

  const res = await fetch(url.toString())
  if (!res.ok) return []

  const data: FredResponse = await res.json()
  return data.observations
    .filter(o => o.value !== '.')
    .map(o => ({ date: o.date, value: parseFloat(o.value) }))
}

// Calculate YoY % change from a FRED level series (e.g. M2SL)
export async function fetchFredYoY(series: string): Promise<number | null> {
  const obs = await fetchFredSeries(series, 14)
  if (obs.length < 13) return null
  const latest = obs[0].value
  const yearAgo = obs[12].value
  if (!yearAgo) return null
  return ((latest - yearAgo) / yearAgo) * 100
}

// Specific fetchers for each FRED-sourced indicator
export async function fetchM2YoY(): Promise<number | null> {
  // FRED provides percent change series directly
  return fetchFredLatest('M2SL_PCH') 
    .then(v => v ?? fetchFredYoY('M2SL'))
}

export async function fetchFedBalanceSheet(): Promise<number | null> {
  const val = await fetchFredLatest('WALCL')
  return val ? val / 1_000_000_000_000 : null // Convert to $T
}

export async function fetchRRP(): Promise<number | null> {
  const val = await fetchFredLatest('RRPONTSYD')
  return val ? val / 1_000 : null // Convert to $B (series is in $M)
}

export async function fetchHYSpread(): Promise<number | null> {
  return fetchFredLatest('BAMLH0A0HYM2')
}

export async function fetchIGSpread(): Promise<number | null> {
  return fetchFredLatest('BAMLC0A0CM')
}

export async function fetchYieldCurve2s10s(): Promise<number | null> {
  const val = await fetchFredLatest('T10Y2Y')
  return val ? val * 100 : null // Convert % to bps
}

export async function fetchSLOOS(): Promise<number | null> {
  // FRED series for net % tightening C&I loans (quarterly)
  return fetchFredLatest('DRTSCIS')
}

export async function fetchISMMfg(): Promise<number | null> {
  return fetchFredLatest('NAPM')
}

export async function fetchISMSvc(): Promise<number | null> {
  return fetchFredLatest('NMFCI')
}

export async function fetchNFIB(): Promise<number | null> {
  return fetchFredLatest('NFIB')
}

export async function fetchRealRetailYoY(): Promise<number | null> {
  return fetchFredYoY('RRSFS')
}

export async function fetchDXY(): Promise<number | null> {
  return fetchFredLatest('DTWEXBGS')
}

export async function fetchWTI(): Promise<number | null> {
  return fetchFredLatest('DCOILWTICO')
}

export async function fetchTIPSBreakeven(): Promise<number | null> {
  return fetchFredLatest('T5YIE')
}

export async function fetchRateDifferential(): Promise<number | null> {
  const us2y = await fetchFredLatest('DGS2')
  const de2y = await fetchFredLatest('IRLTLT01DEM156N')
  if (us2y === null || de2y === null) return null
  return (us2y - de2y) * 100 // bps
}
