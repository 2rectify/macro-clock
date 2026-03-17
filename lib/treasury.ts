// Free data from US Treasury and CFTC — no API key needed

// Treasury General Account (TGA) balance from Daily Treasury Statement
export async function fetchTGA(): Promise<number | null> {
  try {
    const url = 'https://api.fiscaldata.treasury.gov/services/api/v1/accounting/dts/dts_table_1/' +
      '?fields=record_date,open_today_bal&filter=account_type:eq:Federal%20Reserve%20Account' +
      '&sort=-record_date&limit=1'
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const val = data?.data?.[0]?.open_today_bal
    return val ? parseFloat(val) / 1000 : null // Convert $M to $B
  } catch {
    return null
  }
}

// US Fiscal Deficit from Monthly Treasury Statement
export async function fetchFiscalDeficit(): Promise<number | null> {
  try {
    const url = 'https://api.fiscaldata.treasury.gov/services/api/v1/accounting/mts/mts_table_4/' +
      '?fields=record_date,current_month_deficit_surplus&sort=-record_date&limit=12'
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.data?.length) return null
    // Annualise last 12 months
    const total = data.data.reduce((sum: number, row: { current_month_deficit_surplus: string }) => {
      return sum + parseFloat(row.current_month_deficit_surplus || '0')
    }, 0)
    return Math.abs(total) / 1_000_000 // Convert $M to $T
  } catch {
    return null
  }
}

// Foreign Holdings of US Treasuries (TIC data) — 6-week lag
export async function fetchTICHoldings(): Promise<number | null> {
  try {
    // Total foreign holdings from TIC monthly data
    const url = 'https://ticdata.treasury.gov/resource-center/data-chart-center/tic/Documents/mfh.txt'
    const res = await fetch(url)
    if (!res.ok) return null
    const text = await res.text()
    // Parse the fixed-width text file — total is on the "Grand Total" line
    const lines = text.split('\n')
    const totalLine = lines.find(l => l.includes('Grand Total') || l.includes('GRAND TOTAL'))
    if (!totalLine) return null
    const nums = totalLine.match(/[\d,]+/g)
    if (!nums) return null
    // Last number is usually the most recent month total (in $B)
    const val = parseFloat(nums[nums.length - 1].replace(/,/g, ''))
    return val / 1000 // Convert $B to $T
  } catch {
    return null
  }
}

// CFTC Commitments of Traders — USD net speculative positioning
// Published every Friday, reflects Tuesday close data
export async function fetchCOTUSD(): Promise<{ net_position: number | null; signal: string }> {
  try {
    // CFTC provides free CSV downloads
    // We use the legacy futures-only report for financial instruments
    const url = 'https://www.cftc.gov/files/dea/history/fut_fin_xls_2026.zip'
    // Note: In production, you'd download and parse this ZIP
    // For now return null and let AI synthesis handle it
    // The ZIP contains a CSV with "U.S. DOLLAR INDEX" rows
    return { net_position: null, signal: 'Fetch CFTC CSV — see cftc.gov/MarketReports/CommitmentsofTraders' }
  } catch {
    return { net_position: null, signal: 'Error fetching CFTC data' }
  }
}
