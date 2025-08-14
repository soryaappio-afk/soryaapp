// Keep dynamic to avoid static optimization.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import NextAuth from 'next-auth';
import { authOptions } from '@/src/lib/auth';

// Minimal, canonical App Router pattern per NextAuth docs.
// This lets the library adapt internally without us fabricating request contexts.
const handler = NextAuth(authOptions as any);
export { handler as GET, handler as POST };
