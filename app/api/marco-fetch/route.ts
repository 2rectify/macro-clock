import { NextResponse } from 'next/server'
import { runMonthlyFetch, getTargetMonth } from '@/lib/data-fetcher'

// POST /api/trigger
// Body: { month?: "2026-02-01" } — optional, defaults to previous month
// Use this to manually trigger a fetch for any month (for backfilling or testing)

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))

  let targetMonth: Date | undefined
  if (body.month) {
    targetMonth = new Date(body.month + 'T00:00:00Z')
    if (isNaN(targetMonth.getTime())) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM-DD' }, { status: 400 })
    }
  }

  const result = await runMonthlyFetch(targetMonth)
  return NextResponse.json(result, { status: result.success ? 200 : 500 })
}

// GET /api/trigger — returns available months and their status
export async function GET() {
  const { supabaseAdmin } = await import('@/lib/supabase')
  const { data } = await supabaseAdmin
    .from('macro_months')
    .select('*')
    .order('month', { ascending: false })
    .limit(24)

  return NextResponse.json({ months: data ?? [] })
}
