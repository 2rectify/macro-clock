// Fetches ETF prices and FX rates via Yahoo Finance (free, no API key needed)

const YF_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'

async function fetchYahooPrice(symbol: string): Promise<number | null> {
  try {
    const url = `${YF_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=5d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    if (!res.ok) return null
    const data = await res.json()
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close
    if (!closes?.length) return null
    // Get most recent non-null close
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] !== null) return closes[i]
    }
    return null
  } catch {
    return null
  }
}

// Calculate ratio of two ETF prices
async function fetchRatio(symbolA: string, symbolB: string): Promise<number | null> {
  const [a, b] = await Promise.all([fetchYahooPrice(symbolA), fetchYahooPrice(symbolB)])
  if (a === null || b === null || b === 0) return null
  return a / b
}

export async function fetchXRTSPY(): Promise<number | null> {
  return fetchRatio('XRT', 'SPY')
}

export async function fetchIWMSPY(): Promise<number | null> {
  return fetchRatio('IWM', 'SPY')
}

export async function fetchKBESPY(): Promise<number | null> {
  return fetchRatio('KBE', 'SPY')
}

export async function fetchXLYXLP(): Promise<number | null> {
  return fetchRatio('XLY', 'XLP')
}

export async function fetchNYAD(): Promise<{ value: number | null; trend: string }> {
  // ^NYAD is the A/D line cumulative value
  const val = await fetchYahooPrice('^NYAD')
  // Also fetch SPY to check divergence — if NYAD making new highs with SPY = confirming, else diverging
  // We store the raw value; the AI generates the qualitative trend signal
  return { value: val, trend: 'Monitor' }
}

export async function fetchUSDJPY(): Promise<number | null> {
  return fetchYahooPrice('USDJPY=X')
}

export async function fetchEMFXSymbols(): Promise<Record<string, number | null>> {
  const symbols = ['USDBRL=X', 'USDTRY=X', 'USDZAR=X', 'USDMXN=X']
  const results = await Promise.all(symbols.map(s => fetchYahooPrice(s)))
  return Object.fromEntries(symbols.map((s, i) => [s, results[i]]))
}

export async function fetchCopper(): Promise<number | null> {
  // HG=F is COMEX copper in $/lb
  return fetchYahooPrice('HG=F')
}

export async function fetchGold(): Promise<number | null> {
  return fetchYahooPrice('GC=F')
}

export async function fetchIndustrialMetals(): Promise<Record<string, number | null>> {
  const symbols = ['ALI=F', 'NI=F']
  const results = await Promise.all(symbols.map(s => fetchYahooPrice(s)))
  return { aluminium: results[0], nickel: results[1] }
}
