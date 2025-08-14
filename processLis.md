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
- [ ] (Optional stretch) Real Vercel single-shot deployment via API using generated files.

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
- [ ] Real Vercel deploy path.
- [ ] One retry on build failure with AI patch message.
- [ ] Snapshot history (keep last 3 snapshots beyond latest) (currently only latest implicitly used).

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
