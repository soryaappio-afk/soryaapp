import { PrismaAdapter } from '@next-auth/prisma-adapter';
import CredentialsProvider from 'next-auth/providers/credentials';
import GitHubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import type { NextAuthOptions } from 'next-auth';
import { prisma, prismaAvailable } from '@/src/lib/db';
// NEXTAUTH_URL fallback (if unset and running on Vercel) so devs don't have to define it until custom domain ready.
if (process.env.VERCEL_URL && !process.env.NEXTAUTH_URL) {
    process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`;
}

// Allow bypass via env for early deployments without DB / auth configured.
const bypassReasons: string[] = [];
if (process.env.AUTH_BYPASS === '1') bypassReasons.push('AUTH_BYPASS=1');
if (!process.env.NEXTAUTH_URL) bypassReasons.push('NEXTAUTH_URL missing');
if (!process.env.DATABASE_URL) bypassReasons.push('DATABASE_URL missing');
const AUTH_BYPASS = bypassReasons.length > 0;
// Log once (build/runtime) when bypass active
if (AUTH_BYPASS && !(global as any).__AUTH_BYPASS_LOGGED) {
    console.warn('[auth] Bypassing NextAuth adapter:', bypassReasons.join(', '));
    (global as any).__AUTH_BYPASS_LOGGED = true;
}
import bcrypt from 'bcryptjs';

// Build adapter only when not bypassing AND prisma client is available (DATABASE_URL present)
const adapter = (!AUTH_BYPASS && prismaAvailable && prisma) ? PrismaAdapter(prisma) : undefined;

export const authOptions: NextAuthOptions = {
    // Adapter only if auth not bypassed & DB available
    ...(adapter ? { adapter: adapter as any } : {}),
    session: { strategy: 'jwt' },
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' }
            },
            async authorize(credentials) {
                if (!prismaAvailable || !prisma) return null; // DB not available in bypass/early deploy
                if (!credentials?.email || !credentials.password) return null;
                const user = await prisma.user.findUnique({ where: { email: credentials.email } });
                if (!user) return null;
                const valid = await bcrypt.compare(credentials.password, user.passwordHash);
                if (!valid) return null;
                return { id: user.id, email: user.email, name: user.name } as any;
            }
        }),
        GitHubProvider({
            clientId: process.env.GITHUB_CLIENT_ID || '',
            clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
        }),
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
        })
    ],
    pages: {
        signIn: '/login'
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) token.uid = (user as any).id;
            return token;
        },
        async session({ session, token }) {
            if (token?.uid && session.user) (session.user as any).id = token.uid;
            return session;
        }
    }
};
