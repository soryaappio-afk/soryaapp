# Sorya Next (Monolith)

An AI workspace where users describe what they want to build in plain language and the platform generates, deploys, iterates, classifies, and (optionally) publishes their software projects.

## Product Positioning & UI Inspiration (New)
Sorya’s user experience is inspired by the streamlined flow of lovable.dev: a single conversational surface that continuously turns ideas into running apps. Difference:
- Lovable approach: multi-service backend; Sorya: **monolithic Next.js** app for faster iteration and simpler ops.
- Unified board + chat: You remain in one primary screen (project board + active chat panel) rather than navigating multiple detached views.
- Immediate feedback loop: Prompt → generation → (auto) deploy cycle happens inline with visible status chips and diff summaries.
- Visual Language: clean neutral theme, soft elevations, pill tags for project types, minimal chrome, focus on content.
- Interaction Pattern: left sidebar (project list / filters), central chat & system routine updates, right collapsible panels (Deployment, Snapshots, Settings) – all optional for MVP (start with chat + simple project list). No proprietary assets from lovable.dev are copied—only high‑level UX concepts.

Design Principles:
1. Conversational first: Everything originates from the chat (create, modify, redeploy, publish).
2. Transparency: Routine steps surface as inline status messages ("Deploying...", "Build failed, patching...").
3. Single Source of Truth: Monolithic architecture keeps latency low and state consistent.
4. Progressive Reveal: Advanced actions (publish to GitHub, classification override) appear contextually when relevant.
5. Fast Perception: Optimistic UI updates with eventual confirmation from routine events.

MVP Visual Scope (Today):
- Auth screens: minimal centered card.
- Dashboard/Board: simple vertical list (later upgrade to grid/kanban). Each project card: name, type tag (if present), last deployment status (chip), deployment URL button.
- Project / Chat: split layout (chat messages scroll column; input composer fixed at bottom; top bar with project name + quick actions Redeploy / Publish (disabled until implemented)).
- Status Messages: assistant system messages styled distinct from AI reply content.
- Dark mode toggle (optional nice-to-have) – can defer.

Later Enhancements:
- Side diff viewer (tab) per assistant code generation.
- Inline file tree preview with search.
- Drag‑filter board with project type lanes.
- Deployment timeline visualization.

## Core User Story (Updated)
1. Create an account with the built‑in user system (email/password or future magic link). GitHub is **optional** and only needed when you want to publish code to a GitHub repository.
2. Open the chat and ask for something (e.g. “Create me a web2 app for cropping images”).
3. The AI creates a new Project, generates the necessary application files, and stores a snapshot.
4. A background **Routine** runs: prepares a Vercel project (using your or the platform’s Vercel credentials), deploys it, observes build / runtime errors, fixes them through additional code edits, re‑deploys until healthy (bounded attempts), and records the deployment URL.
5. You preview the live app (Vercel deployment link) directly inside the dashboard.
6. If satisfied, you can connect GitHub (if not already) and publish: the platform creates a repo (or uses an existing one), pushes the generated code, and from then on each subsequent chat instruction that pertains to that project updates the repository (commit + push) and triggers a fresh Vercel deployment.
7. Every chat exchange is recorded; each assistant action (code gen, deploy, classify, publish) is a structured Routine step saved for traceability.
8. The AI auto‑classifies each project into one of the types: `Internal tools`, `Website`, `Personal`, `Consumer App`, `B2B App`, `Prototype` and stores that tag on the Project.
9. On the main chat / dashboard screen you have a board view with those tags as filters, showing previews (name, last deployment status, repo link if any, credit usage summary).
10. Credits meter usage (per AI token + generation/deployment cycles). Subscriptions add monthly credits.

## High-Level Feature List
- Natural language → runnable app generation.
- Automated iterative deployment pipeline to Vercel (create project, upload/build, error‑aware fix loop, redeploy).
- Optional GitHub publishing & continuous AI‑driven commits.
- Project snapshots and version history.
- Project type auto‑classification + filtering board.
- Per‑user chat history and routine audit trail.
- Credit ledger + subscription billing (Stripe).
- Secure storage of external tokens (GitHub, Vercel) with encryption.

## Routines Concept
A Routine = a structured sequence triggered by a user chat message. Example steps:
1. Interpret request
2. Generate / modify code
3. Classify project type (if new or changed significantly)
4. Persist snapshot
5. Deploy (create/update Vercel project)
6. Monitor build
7. Fix errors (loop with patch + redeploy)
8. Finalize (store deployment URL, status, token usage)
9. (Optional) Publish to GitHub / push updates

Each step is recorded so the system (and user) can inspect what happened and why credits were consumed.

## Tech Stack
- Next.js 14+ (App Router, Route Handlers)
- React 18
- Prisma ORM + MySQL
- NextAuth (core user auth using credentials; GitHub provider only for repo operations)
- Stripe (subscriptions, webhooks)
- OpenAI Node SDK (model placeholder `gpt-5` or actual)
- Zod (validation)
- jose (JWT signing where needed)
- nodemailer (optional future email flows)
- AES-256-GCM encryption for external tokens (GitHub, Vercel)
- Optional rate limiting (Upstash Redis / Vercel KV)

## Updated Architecture Domains
- `/api/auth/*` (NextAuth: credentials + optional GitHub provider connect flow)
- `/api/chat` (AI chat + credit debit + routine initiation)
- `/api/projects` (CRUD, preview, classification metadata)
- `/api/projects/[id]/deploy` (manual retrigger if needed)
- `/api/github/*` (init repo, push, connect)
- `/api/vercel/*` (project creation, deployment status polling)
- `/api/billing/*` + `/api/webhooks/stripe` (credit grants / plan changes)
- `/dashboard/*` (project board + filters)
- `/projects/[id]` (detail: chat thread, snapshots, deployments)

## Folder Structure (Planned)
```
/ prisma/
  schema.prisma
/src/
  app/
    layout.tsx
    page.tsx (board + tag filters)
    api/
      auth/[...nextauth]/route.ts
      chat/route.ts
      projects/route.ts (POST create, GET list with tag filters)
      projects/[id]/route.ts (GET, PATCH)
      projects/[id]/preview/route.ts
      projects/[id]/deploy/route.ts
      github/repo/[projectId]/init/route.ts
      github/repo/[projectId]/push/route.ts
      vercel/project/[projectId]/route.ts
      vercel/deploy/[projectId]/status/route.ts
      billing/subscribe/route.ts
      webhooks/stripe/route.ts
  lib/
    db.ts
    auth.ts
    openai.ts
    credits.ts
    billing.ts
    github.ts
    vercel.ts
    deployRoutine.ts
    classify.ts
    encrypt.ts
    rateLimit.ts (optional)
  components/
    ChatUI.tsx
    ProjectBoard.tsx
    ProjectCard.tsx
    ProjectPreview.tsx
    DeploymentStatus.tsx
  routines/
    index.ts (orchestration helpers)
  styles/
.env.local
```

## Data Model (Updated Sketch)
```
User (id, email, name?, image?, passwordHash, createdAt)
Account (NextAuth OAuth for GitHub: provider, providerAccountId, access_token (encrypted), userId, ...)
Session (NextAuth)
Project (
  id, userId, name, status, type (enum: INTERNAL_TOOLS | WEBSITE | PERSONAL | CONSUMER_APP | B2B_APP | PROTOTYPE),
  repoFullName?, vercelProjectId?, lastDeploymentId?, lastSnapshotId?, createdAt, updatedAt
)
ProjectSnapshot (
  id, projectId, summary, aiTokensIn, aiTokensOut, cost, storedAt, files(json)
)
Deployment (
  id, projectId, vercelDeploymentId, url, state, attempt, buildLogExcerpt?, createdAt, updatedAt
)
Routine (
  id, projectId?, userId, triggerMessageId?, kind, status, steps(json), startedAt, finishedAt
)
ChatMessage (
  id, userId, projectId?, role (user|assistant|system), content, tokensIn, tokensOut, cost, createdAt
)
CreditLedger (id, userId, delta, reason, meta json, createdAt)
StripeCustomer (id, userId, stripeCustomerId, currentPlan, renewsAt, createdAt, updatedAt)
EncryptedSecret (id, userId, provider (github|vercel|other), label, ciphertext, createdAt)
```

## Environment Variables (.env.local)
```
DATABASE_URL=mysql://user:pass@localhost:3306/sorya
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
# Core user auth (credentials) handled internally
# Optional GitHub (only if publishing)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
# Vercel integration
VERCEL_TOKEN= (personal/team token with project:create, deployment permissions)
VERCEL_TEAM_ID= (optional if team scope)
# AI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5
# Billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_BASIC=price_xxx
STRIPE_PRICE_PRO=price_yyy
# Encryption
ENCRYPTION_KEY=base64-32-bytes (openssl rand -base64 32)
# Optional Rate Limit
RATE_LIMIT_REDIS_URL=
NEXT_PUBLIC_APP_NAME=Sorya
```

## Chat to Deployment Flow
1. User sends request.
2. Validate + classify intent.
3. Generate / modify code (diff oriented after first snapshot using existing repo or local virtual FS).
4. Persist snapshot & ledger debit.
5. If deploy enabled: ensure Vercel project (create if missing) → upload / deploy.
6. Poll status; if error: extract structured errors, request AI patch; commit patch (local or GitHub if published); redeploy (bounded attempts, e.g. max 5).
7. Success: update Deployment & Project status.
8. Return deployment URL & routine summary to user.

## Publishing to GitHub (Optional Stage)
- User clicks “Connect GitHub” → OAuth → store encrypted token.
- Initialize repo (if none) and push full snapshot.
- Subsequent routines operate directly on repo (pull -> patch -> push) for transparency.

## Classification Logic
- Heuristic + model prompt based on description, dependencies, structure and generated files.
- Stored as Project.type; user can override manually (manual override flagged).

## Credits System
- Charge per combined token usage + per deploy attempt (configurable weight). E.g. base token unit cost + small cost per build iteration.
- Monthly grants via Stripe subscription webhooks.
- Display remaining credits prominently in ChatUI.

## Security Highlights
- Encrypt Vercel / GitHub tokens with AES-256-GCM using ENCRYPTION_KEY.
- Never send third‑party tokens to client; client only receives deployment URLs & statuses.
- Strict authorization checks (userId on every Project / Deployment / Routine access).
- Input validation everywhere with Zod.

## Minimal Implementation Order (Revised)
1. Core user auth (credentials) + User model + Prisma migrations
2. Credits + ledger baseline
3. Basic chat + snapshot + project creation
4. Classification (simple heuristic placeholder)
5. Vercel deploy integration (single pass)
6. Iterative deploy fix loop (bounded retries)
7. Project board with tag filters
8. GitHub connect + initial publish
9. Continuous repo update from chat
10. Stripe subscriptions & webhook credit grants
11. Routines audit trail + deployment history UI
12. Hardening (encryption, rate limiting, improved classifier)

## Testing Strategy
- Unit: classification, credit debit logic, deployment patch extraction.
- Integration: chat route triggers routine (mock OpenAI + Vercel APIs).
- E2E: create project from prompt → see live deployment → publish to GitHub → modify via chat.

## Deployment
- Host on Vercel (main app).
- Use managed MySQL (PlanetScale / RDS).
- Provide Vercel token (server-side only) for deployment orchestration if not using per-user tokens.
- Configure Stripe webhook → `/api/webhooks/stripe`.

## Future Enhancements
- Multi‑step planning agent (architect → implementer → fixer roles).
- On‑the‑fly environment variable suggestions & secret manager UI.
- Rollback to previous snapshot & automatic redeploy.
- Rich diff visualizations per routine step.
- Multi‑tenant teams & shared projects.
- Additional project type taxonomy & confidence scoring.
- Support for other deployment targets (Render, Fly.io, AWS Amplify).

---
This README reflects the updated requirements: generic user auth, routine-based chat automation, Vercel auto deployment, optional GitHub publishing, classification tags, a filterable project board, and a UI/UX direction inspired (conceptually) by lovable.dev while remaining an original monolithic implementation.
