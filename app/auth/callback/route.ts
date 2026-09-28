import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

// Google redirects back here with a ?code=... after sign-in.
// We exchange it for a session (stored in cookies) and continue to the app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const errorDescription = searchParams.get('error_description')

  if (errorDescription) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDescription)}`
    )
  }

  if (code) {
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(error.message)}`
      )
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
