Sorya Next (Monolith)
Full‑stack Next.js (App Router) platform:

AI Chat (OpenAI “gpt-5” placeholder model) with per-user history + credit metering
Project artifacts (generated code snapshots) with publish & GitHub repo create/push
Stripe subscriptions (plans) + credit ledger (consumed per AI token & generation)
GitHub OAuth (auth + repo access) & OpenAI API integration
MySQL via Prisma (no Docker). Deployable to Vercel + external MySQL (PlanetScale / RDS)
Scales via stateless routes, connection pooling, background job hooks (optional)
1. Tech Stack
Next.js 14+ (App Router, Route Handlers)
React 18
Prisma ORM + MySQL
NextAuth (GitHub provider) (or replace with your auth)
Stripe (billing + webhooks)
OpenAI Node SDK
Zod (validation)
jose (JWT signing where needed)
nodemailer (optional for future email)
Encryption: AES-256-GCM (crypto) for external tokens
Rate limiting (optional: Upstash Redis or Vercel KV)
2. High-Level Architecture
Single Next.js app with these domains:

/api/auth/* (NextAuth)
/api/chat (AI chat + credit debit)
/api/projects (CRUD + preview + publish)
/api/github/* (repo init, push)
/api/billing/* (Stripe portal) + /api/webhooks/stripe
/dashboard/* (user UI)
/projects/[id] (history, preview) Use server actions or route handlers for mutations (stick to route handlers for clarity). Background tasks (e.g., long generation) can be deferred to a queue provider later; initially synchronous.
3. Folder Structure
/ prisma/ schema.prisma src/ app/ layout.tsx page.tsx api/ route.ts route.ts route.ts (POST create, GET list) route.ts route.ts route.ts route.ts route.ts route.ts route.ts route.ts dashboard/ page.tsx chat/ page.tsx page.tsx lib/ db.ts auth.ts openai.ts credits.ts billing.ts github.ts encrypt.ts rateLimit.ts (optional) components/ ChatUI.tsx ProjectPreview.tsx styles/ .env.local

4. Data Model (Prisma Sketch)
User (id, name, email, image, createdAt) Account (NextAuth OAuth) Session (NextAuth) Project (id, userId, name, status, repoFullName?, lastSnapshotId?, createdAt, updatedAt) ProjectSnapshot (id, projectId, summary, aiTokensIn, aiTokensOut, cost, storedAt, files(json)) ChatMessage (id, userId, projectId?, role, content, tokensIn, tokensOut, cost, createdAt) CreditLedger (id, userId, delta, reason, meta json, createdAt) StripeCustomer (id, userId, stripeCustomerId, currentPlan, renewsAt, createdAt, updatedAt) ApiToken (optional) EncryptedSecret (id, userId, provider, label, ciphertext, createdAt) (Adjust naming as needed.)

5. Environment Variables (.env.local)
DATABASE_URL=mysql://user:pass@localhost:3306/sorya NEXTAUTH_SECRET= (openssl rand -base64 32) NEXTAUTH_URL=http://localhost:3000 GITHUB_CLIENT_ID= GITHUB_CLIENT_SECRET= OPENAI_API_KEY= OPENAI_MODEL=gpt-5 (or actual model id) STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET= STRIPE_PRICE_BASIC=price_xxx STRIPE_PRICE_PRO=price_yyy ENCRYPTION_KEY=base64-32-bytes (e.g. openssl rand -base64 32)

Optional
RATE_LIMIT_REDIS_URL=

If using NEXT_PUBLIC_ values (minimize secrets):
NEXT_PUBLIC_APP_NAME=Sorya

6. Local Setup (Mac)
brew install mysql brew services start mysql mysql -u root -p CREATE DATABASE sorya; CREATE USER 'sorya'@'%' IDENTIFIED BY 'soryapass'; GRANT ALL ON sorya.* TO 'sorya'@'%'; Update DATABASE_URL accordingly.

pnpm create next-app sorya-next --typescript --app --eslint cd sorya-next pnpm add @prisma/client prisma next-auth @next-auth/prisma-adapter zod openai stripe jose pnpm add -D typescript @types/node @types/react @types/bcrypt pnpm add bcrypt (if using password auth) (optional) pnpm add @octokit/rest pnpm add date-fns pnpm add react-query (if you want client caching) npx prisma init --datasource-provider mysql

Replace schema.prisma with your final model; then: npx prisma migrate dev --name init npx prisma generate

7. Auth (NextAuth + GitHub)
Configure /app/api/auth/[...nextauth]/route.ts:

GitHubProvider with clientId & clientSecret
PrismaAdapter
session: { strategy: 'jwt' }
In callbacks.jwt store user id & maybe plan This GitHub OAuth also provides access token (in Account) but you still must request repo scopes. Ensure scope=repo in provider config.
8. OpenAI Integration
lib/openai.ts: create client with apiKey. chat route:

Validate body (messages array)
Compute approximate tokens (optional) or rely on model response usage
Call openai.chat.completions.create
Record ChatMessage rows + ledger debit
Cost logic (credits): Define cost per 1K tokens; when a chat completes: delta = -ceil((tokensIn + tokensOut)/1000 * unitCost) Insert CreditLedger row.

9. Credit System
On user signup give initial credits (e.g. 5,000). For Stripe subscription upgrade:

Add monthly credit grant on successful invoice.payment_succeeded (Stripe webhook) -> Insert CreditLedger with positive delta.
Function getUserCredits: SUM(ledger.delta).

Prevent request if credits below needed threshold.

10. Stripe Setup
Create products/prices in dashboard.
Store price IDs in env.
/api/billing/subscribe: create Checkout Session (mode=subscription, success_url, cancel_url).
Webhook handler /api/webhooks/stripe verifies signature, handles: customer.subscription.created / updated invoice.payment_succeeded -> grant credits (plan tier mapping) Store stripeCustomerId (attach to user if absent).
11. GitHub Repo Creation & Push
Use @octokit/rest with user’s OAuth access token (scoped). Routes: POST /api/github/repo/[projectId]/init

Ensure project belongs to user.
Create repo (octokit.repos.createForAuthenticatedUser).
Update Project.repoFullName. POST /api/github/repo/[projectId]/push
Accept snapshotId or build a new snapshot from ProjectSnapshot.files.
For each file: PUT /repos/{owner}/{repo}/contents/{path} (base64 content; include sha if updating). Snapshot capturing:
When user clicks “Generate” store files(json: [{path, contentHash, size, snippetOrFull}]). Security: never store user GitHub tokens unencrypted (Encrypt Account.access_token before persisting or store plaintext only if DB encrypted volume—better encrypt). Optional: GitHub App for better permissions, but OAuth is simpler start.
12. Project Preview
Store minimal file metadata in ProjectSnapshot. /api/projects/[id]/preview returns sanitized snippet list (no secrets) for UI.

13. Chat History
Chat messages table keyed by userId + optional projectId. /api/chat:

POST: { projectId?, messages } (append new user message, call model, save assistant reply).
GET /api/chat/history?projectId=... returns recent messages (limit 100).
14. Rate Limiting (Optional)
If you expect heavy traffic:

Add a middleware using a Redis counter (RATE_LIMIT_REDIS_URL) track IP/user per minute.
Abort with 429 if exceeded.
15. Performance & Scaling
Use Edge runtime only for non-DB static endpoints; DB needs Node runtime.
PlanetScale or Neon (if switching to Postgres) for horizontal scaling & connection pooling.
Add caching (KV) for project previews snapshots (key: snapshotId).
Use incremental static generation only for marketing pages.
Offload heavy generation to a queue (Upstash QStash / AWS SQS) later.
16. Security Considerations
Encrypt external tokens (GitHub) using ENCRYPTION_KEY (32-byte base64). AES-256-GCM.
Never expose Stripe secret or OpenAI key to client—proxy.
Validate all inputs with Zod.
Enforce authorization on every project / snapshot route.
17. Scripts
"dev": next dev "build": next build "start": next start "prisma:migrate": prisma migrate dev "prisma:generate": prisma generate

18. Minimal Implementation Order
Auth + User model + Prisma + migrations
Credits + ledger + OpenAI chat basic
Project CRUD + snapshot store (mock generated files)
Preview route
Stripe subscription & webhook -> credit grants
GitHub repo init + push (after snapshots)
UI pages (chat, dashboard, projects, integrate)
Hardening (encryption, rate limit)
19. Testing
Unit: business logic (credits.ts, github.ts)
Integration: route handlers with next test environment (vitest / jest)
E2E: Playwright (login, create project, preview, chat, subscribe).
20. Deployment
Deploy to Vercel.
Use managed MySQL (PlanetScale).
Set all env vars in Vercel dashboard.
Stripe Webhook: create endpoint (live & test) pointing to /api/webhooks/stripe.
21. Future Enhancements
Background async generation pipeline
GitHub App migration
Usage analytics & per-plan limits
Multi-team support
Fine-grained token usage dashboards
