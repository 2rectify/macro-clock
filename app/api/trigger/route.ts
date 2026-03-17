import { NextResponse } from 'next/server'
import { runMonthlyFetch } from '@/lib/data-fetcher'

// Vercel cron job: runs at 06:00 UTC on the 25th of every month
// By the 25th, all monthly indicators for the prior month have published:
//   ISM PMIs (~1st), NFIB (~10th), Retail Sales (~14th), Cass Freight (~18th)
//   SLOOS is quarterly (Jan/Apr/Jul/Oct) — prior quarter value used in off months
//   TIC foreign holdings has a 6-week lag — prior month value used until available
//   Daily/weekly indicators (FRED series, ETF ratios, FX) use latest available value
export const maxDuration = 300 // 5 minutes

export async function GET(request: Request) {
  // Verify this is a legitimate Vercel cron call
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await runMonthlyFetch()
  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}
