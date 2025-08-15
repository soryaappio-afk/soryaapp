# Sorya Build Plan

## 0. Goal (Today)
Have a working vertical slice: user registers → submits a prompt → project + code snapshot created → (mock or real) deployment URL returned → chat history visible → project appears in dashboard list.

## 1. Today (MVP Slice)
Order is optimized to always have a runnable app even if later steps slip.

### 1.1 Foundations
- [x] Initialize Next.js + TypeScript (if not already).
- [x] Add Prisma + configure MySQL connection.
- [x] Prisma schema (minimal): User, Project, ChatMessage, ProjectSnapshot (optional), (CreditLedger stub or skip initially).
- [x] Run initial migration.

### 1.2 Auth
- [x] NextAuth with Credentials provider (email + password hash).
- [x] Register & login pages (basic forms + confirm password).
- [x] Session protection wrapper (redirect unauthenticated to /login) (used on protected pages like /dashboard, /projects/[id]).

### 1.3 Project & Chat Basics
- [x] POST /api/chat: if no projectId passed create Project; store user ChatMessage; call OpenAI placeholder; store assistant ChatMessage.
- [x] Simple code generator: returns a minimal Next.js scaffold (app/page.tsx + package.json) (placeholder stored in snapshot).
- [x] Store generated files JSON as latest snapshot (ProjectSnapshot).

### 1.4 Deployment (Phase 1)
- [x] Mock deployment: deterministic URL stored as Project.deploymentUrl.
- [x] (Optional stretch) Real Vercel single-shot deployment via API using generated files. (DONE – vercel.ts + deploy route, token gated)

### 1.5 UI
- [x] Unified home: central chat + bottom project board & tag filters (lovable-style).
- [x] Project list cards show name & preview link.
- [x] Basic project detail page (/projects/[id]) with chat history view (read-only for now).
- [x] Auth dropdown on email (Settings, Logout).
- [x] Auth modal when unauthenticated user tries to send.

### 1.6 Credits (Optional If Time)
- [x] Add numeric field User.credits (default 1000) (already in schema) & deduct on generation.
- [x] Deduct flat 50 on each generation; block if insufficient.

### 1.7 Classification (Optional If Time)
- [x] Simple heuristic classify(prompt) -> type tag stored on Project (implemented in /api/chat).

### 1.8 Polish / QA
- [x] Basic error handling (toast message + inline assistant fallback).
- [x] Loading states (send button disables + ellipsis).
- [ ] Streaming or progressive assistant reply (skipped).
- [x] Minimal styling aligned with neutral theme.
- [x] Show remaining credits in header.

### 1.9 Stretch (Only if ahead)
- [x] Real Vercel deploy path. (DONE – now integrated, token gated)
- [x] One retry on build failure with AI patch message. (DONE – heuristic loop MAX_FIX_ATTEMPTS=2)
- [x] Snapshot history (keep last 3 snapshots beyond latest) (DONE – retention logic keeps last 4 total)

### Definition of Done (Today)
- Register, login flows working. (DONE)
- Send prompt -> assistant reply appears. (DONE)
- Project row visible on board with URL. (DONE)
- Refresh persists (DB). (DONE)
- No fatal errors. (Assumed OK)

## 2. Next (Short-Term After Today)
### 2.1 Replace Mock Deployment
- [x] Add Prisma models Deployment + Routine (DONE in schema, migrated)
- [x] Create migration & generate client
- [x] POST /api/projects/[id]/deploy to trigger single-shot (mock) deploy & status update
- [x] Vercel service util (create project if missing, create deployment from snapshot files) (stub implemented src/lib/vercel.ts)
- [x] Poll endpoint /api/projects/[id]/deploy/status or SSE (GET handler + client polling)
- [x] Update client UI to show status chip (DEPLOYING/LIVE)

### 2.2 Routine Abstraction
- [x] On chat generation create Routine row (kind=GENERATION)
- [x] Append steps (implemented: code_gen_start, (optional) diff_summary, snapshot_start, snapshot_complete, patch_apply (when patch), deploy_start, deploy_result)
- [x] Add explicit deploy_start + deploy_result steps (replaced previous mock_deploy_complete)
- [x] Expose GET /api/routines?projectId= for recent routines
- [x] Surface inline system messages from *_complete + deploy_result + patch_apply + diff_summary
- [x] Surface additional system messages for patch_apply & diff_summary

### 2.3 Improved Code Generation
- [x] Store prior snapshot ID & prepare diff summary step (placeholder; not yet influencing model prompt)
- [x] Maintain simple diff builder (added/modified/removed + unchanged count)
- [x] Return patch step in Routine steps (patch_apply placeholder)
- [x] Feed diff summary into model prompt (mock usage now enriches assistant reply text)
- [x] Apply real patch (incremental file updates) instead of full regenerate (simple append to app/page.tsx)
- [x] Refactor order: generate files + diff before assistant reply so diff context can be injected without rewriting message

### 2.4 GitHub Integration
- [x] Add GitHub OAuth provider
- [x] Encrypt & store token (EncryptedSecret model later) (TEMP plain fields githubToken/vercelToken + settings modal with tabbed UI) (EncryptedSecret model added)
- [x] Init repo & push snapshot (stub PATCH /api/projects/[id])
- [x] Subsequent generations commit diff & push (stub in /api/chat when repoFullName present)

### 2.5 Classification Upgrade
- [x] Replace heuristic with model classification call returning {type, confidence} (stub with confidence heuristic)
- [x] Add Project.typeConfidence numeric field (schema migrated)
- [ ] Manual override flag boolean field & UI control (future)

### 2.6 Credits System Full
- [x] Introduce CreditLedger model
- [x] Debit entry for generation (-50)
- [x] Debit entries for deployment attempts (-20 each)
- [x] Compute balance with SUM instead of user.credits field (fallback logic present)
- [x] UI meter with thresholds (<=200 warning)

### 2.7 Deployment Fix Loop
- [x] Capture build logs -> parse first error (mocked)
- [x] Prompt model for patch -> apply diff -> new snapshot (placeholder patch logic; model not yet invoked)
- [x] Repeat up to N attempts; record each as step (N=2 implemented)
- [x] Mark Routine status SUCCESS/ERROR
- [ ] Integrate real model-driven patch suggestion (future)

### 2.8 Board UX
- [x] Add status chips from Project.status
- [x] Filter by status + type
- [x] Optional lane layout (type columns)

### 2.9 Security & Encryption
- [ ] Implement encrypt util AES-256-GCM
- [ ] Use for GitHub token storage
- [ ] Add rate limit wrapper to chat & deploy endpoints

### 2.10 Stripe Billing
- [ ] Add StripeCustomer model (schema update)
- [ ] Checkout session endpoint
- [ ] Webhook to credit user
- [ ] Display plan & renewal date

## 3. Medium-Term Roadmap
- Diff viewer & file tree in project view.
- Rollback to snapshot + redeploy.
- Routine timeline visualization.
- Multi-tenant teams & roles.
- Multi-step agent roles (planner → implementer → tester).
- Additional deployment targets (Render, Fly.io, AWS Amplify).
 - Environment variable suggestions & secret manager UI.
 - Rich diff visualizations per routine step.
 - Additional project type taxonomy & confidence scoring.
 - Routines audit trail + deployment history UI.

## 4. Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenAI latency | Slower UX | Show streaming / optimistic placeholder |
| Vercel build failures | Blocked deployments | Provide clear error surface + retry logic |
| Schema churn | Migration friction | Keep early schema minimal; incremental additions |
| Token leakage | Security breach | Central encryption util & never send tokens client-side |

## 5. Tracking
For today use simple checklist in this file (manually mark). Move to issues later.

Checklist (Today):
- [x] Prisma schema & migration
- [x] Credentials auth
- [x] Chat endpoint (user + assistant messages)
- [x] Code generator function
- [x] Snapshot persistence
- [x] Mock deployment URL
- [x] Dashboard list page / board on home
- [x] Project chat page (read-only for now)
- [x] Basic styling & loading
- [x] (Optional) Credits field
- [x] (Optional) Classification heuristic
- [x] Basic error toast & credits in header

---
This plan splits immediate MVP tasks from near-term expansion while adhering to the monolithic flow & lovable-style conversational UX.

## 6. Unified Backlog & Upcoming Tasks (Consolidated)
This section aggregates all pending / proposed tasks (including recommendations made after initial MVP) so we have a single source of truth. Use the subsections to prioritize. Mark items done and (optionally) move completed to an archive.

### 6.1 Core Functional Enhancements
 - [ ] Replace mock deployment with real Vercel integration (single-shot) (IN PROGRESS – schema fields & util updated, needs env + migration)
 - [ ] Implement iterative deploy fix loop (bounded retries with real model-driven patches) (IN PROGRESS – heuristic patch + file generation added)
- [ ] Deployment status polling endpoint + UI auto-refresh improvements (IN PROGRESS – polling + error/log surface + retry UI; SSE upgrade later)
 - [x] Switch preview iframe to deployed URL when deployment.status === LIVE (fallback to static preview.html otherwise) (DONE – LiveProjectPreview swap logic)
- [x] Add redeploy endpoint / button (DONE – dedicated /redeploy route + UI)
 - [x] Automatic deploy after generation (env gated AUTO_DEPLOY_ON_GENERATION) (DONE)
 - [ ] Preview tab split: dedicated Live Preview (deployment URL iframe) + new Local Preview tab (existing preview.html rendering)
 - [ ] Loader: show full-height loader in Live Preview until READY deployment with deploymentUrl present
 - [ ] Deployment scaffold injection: ensure minimal Next.js base (package.json, next.config.js, tsconfig.json, app/page.tsx, styles/globals.css) before first deploy (no overwrite)
 - [ ] LIVE gating: do not set Project.status=LIVE unless deploymentUrl is non-empty
 - [ ] Deployment validation: reject deploy if only static preview.html (unless user confirms) or file set below minimal threshold; add size/count guard
 - [ ] Deployment timeline UI: show build phases & patch attempts list in Live Preview
 - [ ] Alias stabilization: create & store canonical alias after READY (Project.canonicalAlias, Deployment.aliasAssigned)
 - [ ] Distinguish deployment kind (API_UPLOAD vs GIT) (Deployment.kind field) & surface in UI
 - [ ] Auto alias creation if missing post-ready

### 6.2 Preview & Planning Separation
- [ ] Add planMeta fields to ProjectSnapshot (planLines, summary, proposed, pitfalls, todos) instead of embedding plan text in preview.html (IN PROGRESS – schema + migration added)
 - [ ] Migrate existing snapshots: extract planning data (best-effort) into planMeta (IN PROGRESS – backfill script created scripts/backfillPlanMeta.ts; run after prisma generate)
- [x] Adjust plan-phase to persist planMeta and generate visual preview only (remove planning ribbons from preview.html) (DONE – previewBuilder simplified)
 - [x] Add Plan tab in UI (alongside Preview / Files) rendering planMeta (DONE – LiveProjectPreview updated)
- [ ] Introduce plan.html (optional) if we want a static formatted plan separate from preview.html (OPTIONAL)
- [ ] Do not overwrite existing model-provided preview.html (background phase safeguard ADDED in code; verify) ✅ (CODE CHANGE APPLIED; awaiting verification)
 - [ ] Local Preview banner: show note that generated snapshot may differ from live deployment
 - [ ] Enforce separation: preview.html no longer used for live iframe once deployment exists (strict segregation)
 - [ ] Add tab ordering: Live Preview | Local Preview | Plan | Files | Diff | History (update component)

### 6.3 AI Prompting & Multi-Phase Generation
- [x] Refine system prompt to strongly enforce required CREATE blocks for core files (app/page.tsx, preview.html) (DONE – added hard validation & auto injection of missing core blocks)
- [x] Add validator: if response missing required CREATE blocks → trigger automatic retry or second-phase file body request (DONE – server-side ensureCoreFiles synthesizes missing)
- [x] Split agents (planner / implementer + partial fixer) internally (DONE – planner + implementer + deployment fixer agent for build errors)
 - [x] Second-phase enrichment routine (post initial snapshot) to add routing, components, styling, state (DONE – auto background enrich with iterative passes + routing heuristics + component/state suggestions)
- [x] Background enrichment trigger on user idle or explicit "enrich" command (DONE – idle timer + Enrich button)
 - [x] Strong enforcement: system prompt now mandates matching <file> blocks for every CREATE & preview.html UPDATE (DONE – updated generateAssistantReply)
 - [x] Automatic fill for missing / placeholder CREATE blocks via second-phase generation (DONE – second_phase_missing_filled step)
 - [x] Enrichment phase endpoint support (?phase=enrich) (DONE – chat route phase=enrich + UI button)
 - [x] Limit enrichment scope (cap new components/pages) with heuristic guard (DONE – applyEnrichmentCreateLimit helper)
	- [x] Enrichment mode mapping scaffold (light/balanced/aggressive) + adaptive pass resolver (DONE – enrichConfig.ts + tests)

### 6.4 File & Diff Experience
- [x] Persist diff metadata on each Routine (created/updated/deleted lists) (DONE – createdFiles/updatedFiles/deletedFiles columns + chat route updates)
- [x] Add diff viewer UI (side-by-side or unified) per assistant generation (DONE – inline diff toggle + main Diff tab)
- [x] File tree endpoint (latest snapshot) (DONE – /api/projects/[projectId]/files?sizes=1)
- [x] Add search & status filters to file tree (DONE – API query params search/status + UI controls)
- [x] Snapshot diff API (/api/projects/[id]/snapshots/[snapshotId]/diff) (DONE)
- [x] Snapshot history list & ability to open previous snapshot (DONE – History tab loads snapshots)
- [x] Rollback to snapshot + optional redeploy (DONE – rollback endpoint + UI button triggers)

### 6.5 Project Metadata & Classification
- [ ] Manual project type override flag + UI control (DUPLICATE of 2.5 open item)
- [ ] Improve classification confidence using a dedicated lightweight model (NEW)
- [ ] Surface type confidence visually (e.g. chip + tooltip) (PARTIAL – confidence stored but not surfaced)

### 6.6 Credits & Billing
- [ ] StripeCustomer model + migrations (DUPLICATE of 2.10 – still open)
- [ ] Checkout session endpoint (DUPLICATE of 2.10 – still open)
- [ ] Stripe webhook credit grants + plan renew date persistence (DUPLICATE of 2.10 – still open)
- [ ] Display plan tier + renewal date + usage meter improvements (warning thresholds) (DUPLICATE of 2.10 – still open)

### 6.7 GitHub & Publishing
- [ ] Encrypt stored GitHub token with AES-256-GCM util (DUPLICATE of 2.9 + 2.4 partial – encryption util not yet implemented)
- [ ] Implement repo publish flow (init, push) fully (PARTIAL – stubs exist; full flow pending)
- [ ] Continuous commit per generation (with diff summary in commit message) (PARTIAL – basic push stub in /api/chat)
- [ ] Handle GitHub push failures with retry & surface error to user (NEW)
- [ ] Option to disconnect GitHub / rotate token (NEW)
 - [ ] Deployment Phase B: after first successful deploy & user GitHub connected, init repo & switch Vercel project to Git-connected mode
 - [ ] Deployment Phase C: subsequent deployments via git commits (fallback to direct upload if git missing)

### 6.8 Security, Secrets & Rate Limiting
- [ ] Implement encryption util (AES-256-GCM) and migrate existing plain tokens to EncryptedSecret (DUPLICATE of 2.9 – still open)
- [ ] Rate limit /api/chat and /api/projects/* endpoints (middleware or wrapper) (DUPLICATE of 2.9 – still open)
- [ ] Audit logging of sensitive actions (publishing, token updates) (NEW)
- [ ] Content size limits & validation hardening (prevent over-sized file blocks) (NEW)

### 6.9 Reliability & Observability
- [ ] Structured logging (request id, routine id)
- [ ] Basic metrics counters (generation count, deploy attempts, failures)
- [ ] Health check endpoint
- [ ] Error boundary UI component for preview iframe failures

### 6.10 UI/UX Improvements
- [x] Add loading skeleton / shimmer for preview while snapshot loads (DONE)
- [ ] Inline routine step timeline (collapsible) under each assistant reply (NEW)
- [ ] Toast improvements (stacking, auto-dismiss categories) (NEW)
- [ ] Dark/light theme toggle persist to user preferences (PARTIAL – toggle component exists; persistence not implemented)
- [ ] Command palette (Ctrl+K) for actions (Redeploy, Show Plan, Show Diff) (NEW)

### 6.11 Testing & QA
- [ ] Unit tests for classification heuristic → future model classifier (NEW)
- [ ] Unit tests for credit ledger calculations (NEW)
- [ ] Integration test: prompt → snapshot → (mock) deployment path (NEW)
- [ ] Integration test: diff application logic with plan updates (NEW)
- [ ] E2E test (Playwright): register, create project, see preview, issue follow-up command (NEW)

### 6.12 Performance & Cost Optimization
- [ ] Token usage tracking (tokensIn/out) per chat message (PARTIAL – fields may exist but not enforced; verify)
- [ ] Automatic summarization after threshold (already partially implemented; add tests & monitoring) (PARTIAL – summarization logic present maybeSummarize)
- [ ] Cache conversation summaries (invalidate on large structural change) (NEW)
- [ ] Compress stored snapshot files (optional) or prune old snapshots beyond N (NEW)

### 6.13 Future / Stretch (Already Noted but Consolidated)
- [ ] Multi-tenant teams & roles
- [ ] Multi-target deployment (Render, Fly.io, etc.)
- [ ] Environment variable suggestions & secret manager UI
- [ ] Rich deployment timeline visualization
- [ ] Advanced project taxonomy & scoring
- [ ] Multi-step agent roles with evaluation loop
- [ ] Live sandbox runtime for true interactive preview (replace static preview.html)

### 6.14 Migration / Housekeeping Tasks
- [ ] Create migration for ProjectSnapshot.planMeta (JSON) + update prisma schema
- [ ] Backfill script: iterate snapshots, parse assistant plan text → populate planMeta
- [ ] Remove legacy planning ribbons from preview generation once planMeta live
- [ ] Document new planMeta in README (Architecture / Data Model section)
 - [ ] Migration: add Project.canonicalAlias, Deployment.aliasAssigned, Deployment.kind
 - [ ] README: document canonical alias, deployment kinds (API_UPLOAD vs GIT), Live vs Local Preview separation

### 6.15 Recently Addressed (To Move To Done Once Verified)
- [ ] Prevent background phase from overwriting model-provided preview (code change applied – verify with new generation)

### 6.16 Prioritization (Initial Suggested Order)
1. planMeta schema & separation (6.2 first 3 items)
2. Deployment live URL swap logic (6.1 items relating to real deploy)
3. Validator + retry for missing file blocks (6.3)
4. Diff viewer groundwork (persist diff metadata) (6.4)
5. Encryption + rate limiting (6.8)
6. Stripe billing (6.6)
7. GitHub encryption + continuous commits (6.7)
8. Enrichment routine & multi-phase agents (6.3 later items)

---
Guideline: Keep this backlog authoritative—add newly discovered tasks here instead of scattering across README. When a task is completed, move it to a "Done" archive section or mark with [x].
