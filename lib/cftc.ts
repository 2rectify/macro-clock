// CFTC Commitments of Traders — USD net speculative positioning
// Published every Friday, reflects Tuesday close data
// Free download from: https://www.cftc.gov/MarketReports/CommitmentsofTraders

import { Signal } from '@/types'

interface COTResult {
  net_position: number | null
  long_contracts: number | null
  short_contracts: number | null
  signal: Signal
  signal_label: string
  report_date: string | null
}

// CFTC publishes annual ZIP files containing a CSV
// We fetch the current year's futures-only financial report
export async function fetchCOTUSD(): Promise<COTResult> {
  try {
    const year = new Date().getFullYear()

    // Try current year first, fall back to prior year if not yet published
    for (const y of [year, year - 1]) {
      const result = await fetchCOTForYear(y)
      if (result) return result
    }

    return fallbackCOT()
  } catch (err) {
    console.error('[COT] Fetch error:', err)
    return fallbackCOT()
  }
}

async function fetchCOTForYear(year: number): Promise<COTResult | null> {
  try {
    // CFTC futures-only financial report CSV (unzipped version available directly)
    const url = `https://www.cftc.gov/files/dea/history/fut_fin_txt_${year}.zip`

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null

    // The response is a ZIP — we need to parse it
    // In Next.js edge/node environment we can use the DecompressionStream API
    const buffer = await res.arrayBuffer()
    const csvText = await unzipFirstFile(buffer)
    if (!csvText) return null

    return parseCOTCSV(csvText)
  } catch {
    return null
  }
}

async function unzipFirstFile(buffer: ArrayBuffer): Promise<string | null> {
  try {
    // Use the Compression Streams API (available in Node 18+ and modern browsers)
    // ZIP format: find the local file header (PK\x03\x04)
    const bytes = new Uint8Array(buffer)

    // Find the start of compressed data
    // ZIP local file header: signature (4) + version (2) + flags (2) + compression (2)
    //   + mod time (2) + mod date (2) + crc (4) + comp size (4) + uncomp size (4)
    //   + filename len (2) + extra len (2) = 30 bytes header
    let offset = 0
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null // Not a ZIP

    // Read local file header
    const filenameLen = bytes[26] | (bytes[27] << 8)
    const extraLen = bytes[28] | (bytes[29] << 8)
    const dataOffset = 30 + filenameLen + extraLen
    const compressedSize = bytes[18] | (bytes[19] << 8) | (bytes[20] << 16) | (bytes[21] << 24)
    const compressionMethod = bytes[6] | (bytes[7] << 8)

    // Extract compressed data
    const compressedData = bytes.slice(dataOffset, dataOffset + compressedSize)

    let text: string
    if (compressionMethod === 0) {
      // Stored (no compression)
      text = new TextDecoder().decode(compressedData)
    } else if (compressionMethod === 8) {
      // DEFLATE compression
      const ds = new DecompressionStream('deflate-raw')
      const writer = ds.writable.getWriter()
      const reader = ds.readable.getReader()
      writer.write(compressedData)
      writer.close()

      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) chunks.push(value)
      }

      const totalLen = chunks.reduce((sum, c) => sum + c.length, 0)
      const merged = new Uint8Array(totalLen)
      let pos = 0
      for (const chunk of chunks) {
        merged.set(chunk, pos)
        pos += chunk.length
      }
      text = new TextDecoder('windows-1252').decode(merged)
    } else {
      return null
    }

    return text
  } catch (err) {
    console.error('[COT] Unzip error:', err)
    return null
  }
}

function parseCOTCSV(csvText: string): COTResult | null {
  try {
    const lines = csvText.split('\n')
    if (lines.length < 2) return null

    // Find header line
    const headerLine = lines[0]
    const headers = parseCSVLine(headerLine)

    // Column indices we need
    const colMarket = headers.findIndex(h => h.includes('Market and Exchange Names'))
    const colDate   = headers.findIndex(h => h.includes('As of Date in Form YYYY-MM-DD'))
    const colLong   = headers.findIndex(h => h.includes('Noncommercial Positions-Long (All)'))
    const colShort  = headers.findIndex(h => h.includes('Noncommercial Positions-Short (All)'))

    if (colMarket < 0 || colLong < 0 || colShort < 0) {
      console.error('[COT] Could not find required columns in CSV')
      return null
    }

    // Find the USD INDEX row (most recent)
    // CFTC reports USD Index as "U.S. DOLLAR INDEX - ICE FUTURES U.S."
    let usdRow: string[] | null = null
    let latestDate = ''

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      const cols = parseCSVLine(line)
      const market = cols[colMarket] ?? ''
      if (market.toUpperCase().includes('U.S. DOLLAR INDEX')) {
        const rowDate = cols[colDate] ?? ''
        if (!usdRow || rowDate > latestDate) {
          usdRow = cols
          latestDate = rowDate
        }
      }
    }

    if (!usdRow) return null

    const longContracts  = parseInt(usdRow[colLong]?.replace(/,/g, '') ?? '0')
    const shortContracts = parseInt(usdRow[colShort]?.replace(/,/g, '') ?? '0')
    const netPosition    = longContracts - shortContracts

    // Signal logic: extreme short = crowded, contrarian watch
    // Extreme long = USD crowded long
    const signal: Signal = netPosition < -30000
      ? 'CAUTION'   // Crowded short — contrarian bounce risk
      : netPosition < 0
        ? 'BEARISH'  // Net short = bearish USD
        : 'BULLISH'  // Net long = bullish USD

    const signalLabel = netPosition < 0
      ? `Net short ${Math.abs(netPosition).toLocaleString()} contracts`
      : `Net long ${netPosition.toLocaleString()} contracts`

    return {
      net_position: netPosition,
      long_contracts: longContracts,
      short_contracts: shortContracts,
      signal,
      signal_label: signalLabel,
      report_date: latestDate || null,
    }
  } catch (err) {
    console.error('[COT] CSV parse error:', err)
    return null
  }
}

// Simple CSV line parser that handles quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function fallbackCOT(): COTResult {
  return {
    net_position: null,
    long_contracts: null,
    short_contracts: null,
    signal: 'NEUTRAL',
    signal_label: 'CFTC data unavailable — check cftc.gov',
    report_date: null,
  }
}
