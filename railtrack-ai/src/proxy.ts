/**
 * src/middleware.ts â€” Next.js Edge middleware for RailTrack AI.
 * Protects authenticated routes by checking for the railtrack_token cookie.
 * Redirects unauthenticated users to /login.
 */

import { NextRequest, NextResponse } from 'next/server';

// Routes that require a valid JWT cookie
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/simulate',
  '/analytics',
  '/admin',
];

// Routes that are always public
const PUBLIC_PATHS = ['/login', '/api/auth'];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths through
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow Next.js internals and static files
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  // Check if the route needs protection
  const needsAuth = PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix));
  if (!needsAuth) {
    return NextResponse.next();
  }

  // Read JWT cookie
  const token = req.cookies.get('railtrack_token')?.value;

  if (!token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Decode JWT payload (Edge runtime â€” no crypto needed for just reading claims)
  try {
    const payloadBase64 = token.split('.')[1];
    if (!payloadBase64) throw new Error('Bad token');
    const payload = JSON.parse(
      Buffer.from(payloadBase64, 'base64').toString('utf-8')
    );

    // Check expiry
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = '/login';
      const res = NextResponse.redirect(loginUrl);
      res.cookies.delete('railtrack_token');
      res.cookies.delete('rt_role');
      return res;
    }

    // Propagate role as a separate readable cookie (non-httpOnly so client JS can read)
    const res = NextResponse.next();
    if (payload.role) {
      res.cookies.set('rt_role', payload.role, { path: '/', sameSite: 'lax', maxAge: 86400 });
    }
    return res;

  } catch {
    // Invalid token â€” redirect to login
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete('railtrack_token');
    return res;
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

