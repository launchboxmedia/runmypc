import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'

// Server-side auth callback. Exchanges an auth code (PKCE: OAuth / magic link)
// or an email OTP token_hash (magic link / signup / recovery / invite) for a
// session and writes the HTTP-only session cookie — no tokens touch the client.
//
// The Supabase client's setAll is bound to the OUTGOING redirect response's
// cookies so the Set-Cookie header rides the 3xx (binding to next/headers'
// cookie store would not attach to a manually-built NextResponse). On success,
// redirects to `next` (must be a local path) or '/'. On failure, back to /login
// with an error.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null

  // Only allow local redirect targets — prevents open-redirect abuse.
  const nextParam = url.searchParams.get('next')
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/'

  const loginRedirect = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, url.origin))

  if (!code && !(tokenHash && type)) {
    return loginRedirect('missing_auth_code')
  }

  // Success response is created up front so the session cookies are written onto it.
  const response = NextResponse.redirect(new URL(next, url.origin))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.headers
            .get('cookie')
            ?.split(';')
            .map(c => c.trim())
            .filter(Boolean)
            .map(c => {
              const eq = c.indexOf('=')
              return { name: c.slice(0, eq), value: c.slice(eq + 1) }
            }) ?? []
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash as string })

  if (error) {
    return loginRedirect(error.message)
  }

  return response
}
