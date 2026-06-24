import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public pages
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Allow API routes — they handle their own auth
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Allow the auth callback — it performs the code/OTP exchange that ESTABLISHES
  // the session, so it must run before any session exists (else infinite bounce).
  if (pathname.startsWith('/auth/')) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: { headers: request.headers }
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        }
      }
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
}
