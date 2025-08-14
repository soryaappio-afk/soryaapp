#!/usr/bin/env node
/**
 * Conditional prebuild:
 * - If both DATABASE_URL and NEXTAUTH_URL exist, run prisma migrate deploy.
 * - Else, skip with notice so build doesn't fail on missing DB/auth during early deploys.
 */
const { execSync } = require('child_process');

const hasDb = !!process.env.DATABASE_URL;
const hasAuth = !!process.env.NEXTAUTH_URL;

if (hasDb && hasAuth) {
  console.log('[prebuild] Full environment detected (DB + Auth). Running prisma migrate deploy...');
  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('[prebuild] Prisma migrate deploy completed.');
  } catch (e) {
    console.error('[prebuild] Prisma migrate deploy failed:', e.message);
    process.exit(1);
  }
} else {
  console.log('[prebuild] Skipping prisma migrate deploy (hasDb=' + hasDb + ' hasAuth=' + hasAuth + ').');
}
