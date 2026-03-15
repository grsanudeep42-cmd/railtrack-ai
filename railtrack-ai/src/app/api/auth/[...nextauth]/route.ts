/**
 * src/app/api/auth/[...nextauth]/route.ts
 * NextAuth.js v4 route handler for RailTrack AI.
 * Configures GoogleProvider + custom JWT-bridge to FastAPI backend.
 */

import NextAuth, { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { cookies } from 'next/headers';

const FASTAPI_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID     ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],

  callbacks: {
    /**
     * signIn callback: after Google authenticates, forward the Google id_token
     * to FastAPI /api/auth/google-verify which validates it and returns a JWT.
     * We store the FastAPI JWT in the NextAuth token so it is available app-wide.
     */
    async jwt({ token, account }) {
      if (account?.provider === 'google' && account.id_token) {
        try {
          const res = await fetch(`${FASTAPI_URL}/api/auth/google-verify`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ token: account.id_token }),
          });
          if (res.ok) {
            const data = await res.json();
            token.accessToken = data.access_token;
            token.role        = data.user?.role  ?? 'CONTROLLER';
            token.section     = data.user?.section ?? 'NR-42';
            token.railtrackId = data.user?.id;
            
            // Explicitly sync the FastAPI token into the custom cookies 
            // so our middleware & client-side fetches can use it immediately.
            try {
              const cookieStore = await cookies();
              cookieStore.set('railtrack_token', data.access_token, { path: '/', maxAge: 86400, sameSite: 'lax' });
              cookieStore.set('rt_role', data.user?.role ?? 'CONTROLLER', { path: '/', maxAge: 86400, sameSite: 'lax', httpOnly: false });
            } catch (err) {
              console.error('[NextAuth] Could not set cookies automatically:', err);
            }
          }
        } catch (err) {
          console.error('[NextAuth] google-verify failed:', err);
        }
      }
      return token;
    },

    async session({ session, token }) {
      // Expose FastAPI JWT to the client session
      session.accessToken = token.accessToken as string | undefined;
      if (session.user) {
        (session.user as typeof session.user & { role?: string; section?: string; railtrackId?: string }).role = token.role as string;
        (session.user as typeof session.user & { section?: string }).section = token.section as string;
        (session.user as typeof session.user & { railtrackId?: string }).railtrackId = token.railtrackId as string;
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',   // Redirect to our custom login page
    error:  '/login',
  },

  session: {
    strategy: 'jwt',
    maxAge:   86400,    // 24 hours
  },

  secret: process.env.NEXTAUTH_SECRET ?? 'railtrack-nextauth-secret-change-in-prod',
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
