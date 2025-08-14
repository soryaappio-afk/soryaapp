import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/src/lib/db';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { ensureRepo, pushSnapshot } from '@/src/lib/github';
import { pusher } from '@/src/lib/realtime';
import { addCreditEntry, getCreditBalance, ensureInitialGrant } from '@/src/lib/credits';
import OpenAI from 'openai';


export const dynamic = 'force-dynamic';

// Initialize OpenAI client once
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Real OpenAI call (with fallback to placeholder if error or missing key)
async function generateAssistantReply(prompt: string, opts: { diffSummary?: any; projectId: string; model?: string }) {
    const { diffSummary, projectId, model } = opts;
    const chosenModel = model || OPENAI_MODEL;
    const forceGpt5 = true; // always try gpt-5 first per requirement
    const primaryModel = forceGpt5 ? 'gpt-5' : chosenModel;
    // Removed fallback model usage per requirement (only gpt-5)
    const useResponsesApi = /^gpt-5/i.test(primaryModel);
    if (!process.env.OPENAI_API_KEY) {
        if (diffSummary) {
            const { added = [], modified = [], removed = [], unchangedCount } = diffSummary;
            return `Updated (fallback – no API key) for: "${prompt}"\nDiff Added:${added.length} Modified:${modified.length} Removed:${removed.length} Unchanged:${unchangedCount}`;
        }
        return `Generated (fallback – no API key) for: ${prompt}`;
    }
    let snapshotSummary = '';
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { lastSnapshotId: true, name: true } });
    if (project?.lastSnapshotId) {
        const snap = await prisma.projectSnapshot.findUnique({ where: { id: project.lastSnapshotId } });
        if (snap) {
            const files: any[] = snap.files as any[];
            const list = files.map(f => f.path).slice(0, 15).join(', ');
            snapshotSummary = `Project: ${project.name}. Files: ${files.length}. Sample: ${list}${files.length > 15 ? ' ...' : ''}`;
        }
    }
    const { extraContext, recentMessages } = await buildContext(projectId, snapshotSummary, diffSummary);
    const openTodos = await fetchProjectTodos(projectId);
    const systemCore = [
        'You are Sorya, a highly diligent senior full-stack engineer AI that incrementally designs, refactors and extends the project.',
        'Style: decisive, no laziness, give concrete implementation guidance, list next actionable steps.',
        'Always output a leading "File Plan:" section BEFORE numbered sections. Each File Plan line: CREATE|UPDATE|DELETE <path> – short purpose. Only include real actions needed now. Use paths within app/, components/, lib/, prisma/, src/, or root files. If no changes, write CREATE app/placeholder.txt – explain (rare).',
        `Structure every answer EXACTLY as:\nFile Plan:\n<lines>\n\n1) Summary of intent\n2) Proposed changes / code notes\n3) Potential pitfalls\n4) Next TODO bullets (<=6)\nReturn plain text only. Keep total under 350 tokens unless user asks for more. Return all sections even if brief. Avoid adding extra sections.`
    ];
    if (extraContext) systemCore.push(extraContext);
    if (openTodos) systemCore.push(openTodos);
    if (diffSummary) {
        const { added = [], modified = [], removed = [], unchangedCount } = diffSummary;
        systemCore.push(`Diff Focus: Added(${added.length}) Modified(${modified.length}) Removed(${removed.length}) Unchanged(${unchangedCount}). Prioritize modified.`);
    }
    // Build compact linear transcript (exclude duplicate final user prompt if already last)
    const last = recentMessages[recentMessages.length - 1];
    const transcriptParts: string[] = [];
    for (const m of recentMessages) {
        transcriptParts.push(`${m.role.toUpperCase()}: ${m.content}`);
    }
    if (!last || last.content.trim() !== prompt.trim()) {
        transcriptParts.push(`USER: ${prompt}`);
    }
    const linearInput = systemCore.join('\n\n') + '\n\nConversation History:\n' + transcriptParts.join('\n');
    console.log('[AI] primaryModel:', primaryModel, 'useResponsesApi:', useResponsesApi, 'historyMsgs:', recentMessages.length);

    const attemptResponses = async (): Promise<string | null> => {
        const basePayload: any = {
            model: primaryModel,
            input: linearInput + '\n\nPlease respond now.',
            max_output_tokens: 420,
            text: { format: { type: 'text' } }
        };
        const reasoningOnly = (resp: any) => Array.isArray(resp?.output) && resp.output.length > 0 && resp.output.every((o: any) => o.type === 'reasoning');
        const execOnce = async (payload: any, tag: string) => {
            try {
                console.log('[AI] responses payload meta', { tag, model: payload.model, max_output_tokens: payload.max_output_tokens, inputChars: payload.input.length, inputPreview: payload.input.slice(0, 300) });
                const clientAny: any = openai as any;
                const hasResponses = !!clientAny.responses && typeof clientAny.responses.create === 'function';
                const doReq = async () => {
                    if (hasResponses) return await clientAny.responses.create(payload);
                    const r = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    if (!r.ok) { let errBody = ''; try { errBody = await r.text(); } catch { } console.warn('[AI] responses http error', tag, r.status, errBody.slice(0, 800)); return null; }
                    return await r.json();
                };
                const resp = await doReq();
                if (!resp) return { text: null, resp: null };
                try {
                    const outMeta = Array.isArray(resp.output) ? resp.output.map((o: any) => ({ type: o.type, hasContent: !!o.content, contentTypes: Array.isArray(o.content) ? o.content.map((c: any) => c.type) : undefined })) : undefined;
                    console.log('[AI] responses raw meta', { tag, keys: Object.keys(resp), outputLen: Array.isArray(resp.output) ? resp.output.length : null, outputMeta: outMeta });
                } catch { }
                const extract = (respObj: any): string | null => {
                    if (!respObj) return null;
                    if (respObj.output_text) return respObj.output_text.trim();
                    const collected: string[] = [];
                    if (Array.isArray(respObj.output)) {
                        for (const item of respObj.output) {
                            if (item.type === 'output_text' && item.text) collected.push(typeof item.text === 'string' ? item.text : item.text.value || '');
                            if (item.type === 'message' && Array.isArray(item.content)) {
                                for (const c of item.content) {
                                    if (c.type === 'output_text' && c.text) collected.push(typeof c.text === 'string' ? c.text : c.text.value || '');
                                    if (c.type === 'text' && c.text) collected.push(typeof c.text === 'string' ? c.text : c.text.value || '');
                                }
                            }
                        }
                    }
                    if (collected.length) return collected.join('\n').trim();
                    // reasoning summaries fallback
                    const rs: string[] = [];
                    if (Array.isArray(respObj.output)) for (const item of respObj.output) if (item.type === 'reasoning' && Array.isArray(item.summary) && item.summary.length) rs.push(item.summary.map((s: any) => typeof s === 'string' ? s : s?.text || '').join(' '));
                    if (respObj.reasoning?.summary && typeof respObj.reasoning.summary === 'string') rs.push(respObj.reasoning.summary);
                    const rText = rs.filter(Boolean).join('\n').trim();
                    return rText ? rText.slice(0, 1200) : null;
                };
                const text = extract(resp);
                if (!text) {
                    try { console.warn('[AI] responses empty extract', tag, JSON.stringify(resp.output)?.slice(0, 600)); } catch { }
                }
                console.log('[AI] responses extract len:', text?.length, 'tag:', tag);
                return { text: text || null, resp };
            } catch (e: any) {
                console.warn('[AI] responses exec failed', tag, e?.message);
                return { text: null, resp: null };
            }
        };
        // First attempt
        const first = await execOnce(basePayload, 'first');
        if (first.text && !reasoningOnly(first.resp)) return first.text;
        const needRetry = (!first.text || reasoningOnly(first.resp));
        if (!needRetry) return first.text;
        console.log('[AI] retrying due to reasoning-only / empty output');
        const retryPayload = { ...basePayload, input: basePayload.input + '\n\nFINAL ANSWER REQUIRED NOW: Output File Plan and all numbered sections strictly as instructed. Do NOT include reasoning tokens.', max_output_tokens: 700 };
        const second = await execOnce(retryPayload, 'retry');
        if (second.text && !reasoningOnly(second.resp)) return second.text;
        return second.text; // may be reasoning summary or null
    };

    if (useResponsesApi) {
        const out = await attemptResponses();
        return out || 'No content generated (reasoning-only). Please clarify your request.';
    }
    // If somehow not using responses API (should not happen with forced gpt-5)
    return 'Model path unavailable.';
}

// Simple AI name generator (placeholder) - ensures consistent slug
function deriveAppName(prompt: string) {
    const base = prompt.split(/[.!?\n]/)[0].slice(0, 40).trim();
    if (!base) return 'App';
    // Capitalize words, remove unsafe chars
    return base.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'App';
}

function toRepoSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'app';
}

// Code generator using derived name
function generateFiles(appName: string, prompt: string) {
    const page = `export default function GeneratedPage(){return <div style={{padding:'2rem'}}><h1>${appName}</h1><p>${prompt}</p></div>}`;
    return [
        { path: 'package.json', content: JSON.stringify({ name: toRepoSlug(appName), version: '0.0.1' }, null, 2) },
        { path: 'app/page.tsx', content: page }
    ];
}

const BodySchema = z.object({
    prompt: z.string().min(3),
    projectId: z.string().optional(),
    model: z.string().optional()
});

// Simple classification heuristic
type ClassificationResult = { type: string; confidence: number };

// Placeholder model classification call (stub). Replace with real LLM or classifier.
async function classifyPrompt(prompt: string): Promise<ClassificationResult> {
    // Reuse heuristic for now but assign pseudo confidence distribution
    const map: { tag: string; keywords: string[] }[] = [
        { tag: 'Internal tools', keywords: ['internal', 'dashboard', 'admin', 'ops', 'backoffice'] },
        { tag: 'Website', keywords: ['landing', 'marketing', 'website', 'portfolio'] },
        { tag: 'Personal', keywords: ['personal', 'journal', 'diary', 'habit'] },
        { tag: 'Consumer App', keywords: ['social', 'mobile', 'chat', 'consumer', 'feed'] },
        { tag: 'B2B App', keywords: ['saas', 'crm', 'b2b', 'enterprise', 'invoice', 'billing'] },
        { tag: 'Prototype', keywords: ['prototype', 'mvp', 'test', 'demo', 'experiment'] }
    ];
    const lower = prompt.toLowerCase();
    for (const m of map) {
        if (m.keywords.some(k => lower.includes(k))) {
            // Confidence heuristic: more keyword hits => higher
            const hits = m.keywords.filter(k => lower.includes(k)).length;
            const confidence = Math.min(0.5 + hits * 0.1, 0.95);
            return { type: m.tag, confidence };
        }
    }
    return { type: 'Prototype', confidence: 0.4 };
}

const GENERATION_CREDIT_COST = 50;

export async function POST(req: NextRequest) {
    if ((authOptions as any).adapter === undefined) {
        // Return minimal placeholder so UI can still function in bypass mode
        return NextResponse.json({ bypassed: true, message: 'Auth bypass active' }, { status: 200 });
    }
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // Ensure user exists (DB might have been reset)
    const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!userExists) {
        return NextResponse.json({ error: 'Session user no longer exists (reset?)' }, { status: 401 });
    }

    const json = await req.json();
    const parse = BodySchema.safeParse(json);
    if (!parse.success) {
        return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const { prompt, projectId, model } = parse.data;

    // Fetch user credits (derived)
    await ensureInitialGrant(userId);
    const currentBalance = await getCreditBalance(userId);
    if (currentBalance < GENERATION_CREDIT_COST) {
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    let project = projectId
        ? await prisma.project.findFirst({ where: { id: projectId, userId } })
        : null;
    const isNew = !project;
    let previousSnapshot: any = null;
    if (!project) {
        const { type, confidence } = await classifyPrompt(prompt);
        const appName = deriveAppName(prompt);
        project = await prisma.project.create({ data: { userId, name: appName, type, typeConfidence: confidence } });
    } else if (project.lastSnapshotId) {
        previousSnapshot = await prisma.projectSnapshot.findUnique({ where: { id: project.lastSnapshotId } });
    }
    // Create routine row
    const routine = await prisma.routine.create({ data: { userId, projectId: project.id, kind: 'GENERATION', status: 'RUNNING', steps: [] } });

    // Debit credits via ledger
    await addCreditEntry(userId, -GENERATION_CREDIT_COST, 'generation');
    const newBalance = await getCreditBalance(userId);

    const steps: any[] = [];
    steps.push({ type: 'code_gen_start', ts: Date.now(), prompt });

    // DIFF CONTEXT (improved code generation placeholder)
    if (previousSnapshot) {
        const prevFiles = previousSnapshot.files as any[];
        steps.push({ type: 'diff_context_prepare', ts: Date.now(), previousSnapshotId: previousSnapshot.id, prevFileCount: prevFiles.length });
    }

    const userMessage = await prisma.chatMessage.create({ data: { userId, projectId: project.id, role: 'user', content: prompt } });

    steps.push({ type: 'snapshot_start', ts: Date.now() });
    // Generate or patch files
    let files: { path: string; content: string }[] = [];
    let diffSummary: any = null;
    let patchApplied = false;
    if (previousSnapshot) {
        const prevFilesArray = (previousSnapshot.files as any[]).map(f => ({ path: f.path, content: f.content }));
        const pageIndex = prevFilesArray.findIndex(f => f.path === 'app/page.tsx');
        const timestamp = new Date().toISOString();
        const patchBanner = `\n\n// Patch applied at ${timestamp} for new instruction: ${prompt.replace(/\n/g, ' ')}\n`;
        if (pageIndex >= 0) {
            prevFilesArray[pageIndex] = { path: 'app/page.tsx', content: prevFilesArray[pageIndex].content + patchBanner + `// (Incremental) appended content placeholder.` };
        } else {
            prevFilesArray.push({ path: 'app/page.tsx', content: `export default function GeneratedPage(){return <div style={{padding:'2rem'}}><h1>${prompt}</h1><p>Generated by Sorya MVP.</p></div>}` });
        }
        // Compute diff vs original previous snapshot
        const prevMap: Record<string, string> = {};
        (previousSnapshot.files as any[]).forEach((f: any) => { prevMap[f.path] = f.content; });
        const added: string[] = [];
        const modified: string[] = [];
        const unchanged: string[] = [];
        for (const f of prevFilesArray) {
            if (!(f.path in prevMap)) added.push(f.path); else if (prevMap[f.path] !== f.content) modified.push(f.path); else unchanged.push(f.path);
        }
        const removed: string[] = []; // patch flow does not remove files yet
        diffSummary = { added, modified, removed, unchangedCount: unchanged.length };
        patchApplied = modified.length > 0 || added.length > 0;
        files = prevFilesArray;
        steps.push({ type: 'diff_summary', ts: Date.now(), diff: diffSummary });
    } else {
        const appName = project.name;
        files = generateFiles(appName, prompt);
    }

    // Assistant reply (diff-aware)
    const assistantContent = await generateAssistantReply(prompt, { diffSummary, projectId: project.id, model });
    steps.push({ type: 'code_gen_complete', ts: Date.now() });
    // Parse File Plan lines before storing
    try {
        const planSectionMatch = assistantContent.match(/File Plan:\n([\s\S]*?)(?:\n\n[0-9]+\)|\n1\)|\n1\)|$)/i); // capture until blank line before numbered sections
        let planRaw = '';
        if (planSectionMatch) {
            planRaw = planSectionMatch[1].trim();
        } else {
            // fallback: take initial lines starting with (CREATE|UPDATE|DELETE)
            const firstLines = assistantContent.split('\n').slice(0, 12).join('\n');
            planRaw = firstLines.split(/\n(?=[0-9]+\))/)[0];
        }
        const planLines = planRaw.split('\n').map(l => l.trim()).filter(l => /^(CREATE|UPDATE|DELETE)\b/i.test(l));
        if (planLines.length) {
            const parsed = planLines.map(l => {
                const m = l.match(/^(CREATE|UPDATE|DELETE)\s+([^\s]+)\s*[–-]?\s*(.*)$/i);
                return m ? { action: m[1].toUpperCase(), path: m[2], note: m[3] || '' } : { raw: l };
            });
            steps.push({ type: 'file_plan', ts: Date.now(), plan: parsed });
            // Apply plan to current in-memory files BEFORE snapshot creation so preview reflects it
            try {
                const beforePaths = new Set(files.map(f => f.path));
                const created: string[] = [];
                const updated: string[] = [];
                const deleted: string[] = [];
                const ensureExists = (path: string, content: string) => {
                    const idx = files.findIndex(f => f.path === path);
                    if (idx === -1) { files.push({ path, content }); created.push(path); }
                };
                const appendUpdate = (path: string, banner: string) => {
                    const idx = files.findIndex(f => f.path === path);
                    if (idx !== -1) { files[idx] = { path, content: files[idx].content + banner }; updated.push(path); }
                };
                const compStub = (name: string) => `import React from 'react';\nexport default function ${name}(){\n  return <div style={{padding:'1rem'}}>${name} component placeholder</div>;\n}`;
                const pageStub = (title: string) => `export default function Page(){return <main style={{padding:'2rem'}}><h1>${title}</h1><p>Scaffolded page placeholder.</p></main>}`;
                const layoutStub = `import './globals.css';\nimport React from 'react';\nexport const metadata = { title: 'Sorya App', description: 'Generated by AI' };\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (<html lang='en'><body style={{fontFamily:'system-ui,sans-serif',margin:0}}>{children}</body></html>);\n}`;
                const globalsCss = `:root { --bg:#0b0d10; --text:#f5f5f5; --accent:#6366f1; --border:#1f2937;}\nbody { background: var(--bg); color: var(--text); margin:0; }\nbutton { font-family: inherit; }`;
                const nowBanner = (note: string) => `\n\n// AI ${new Date().toISOString()} - ${note || 'update'}\n`;
                const toComponentName = (filePath: string) => {
                    const base = filePath.split('/').pop()!.replace(/\.tsx$/, '');
                    return base.replace(/[^A-Za-z0-9]+/g, ' ').split(' ').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('') || 'Component';
                };
                for (const p of parsed) {
                    if (!('action' in p)) continue;
                    const { action, path, note } = p as any;
                    if (action === 'CREATE') {
                        if (path.endsWith('.tsx')) {
                            if (path === 'app/layout.tsx') {
                                ensureExists(path, layoutStub);
                            } else if (path.startsWith('app/') && /page\.tsx$/.test(path)) {
                                ensureExists(path, pageStub(project.name));
                            } else if (path.startsWith('components/')) {
                                ensureExists(path, compStub(toComponentName(path)));
                            } else {
                                ensureExists(path, `// Placeholder file for ${path}\n`);
                            }
                        } else if (path === 'app/globals.css') {
                            ensureExists(path, globalsCss);
                        } else {
                            ensureExists(path, `// Placeholder for ${path}`);
                        }
                    } else if (action === 'UPDATE') {
                        appendUpdate(path, nowBanner(note));
                    } else if (action === 'DELETE') {
                        const idx = files.findIndex(f => f.path === path);
                        if (idx !== -1) { files.splice(idx, 1); deleted.push(path); }
                    }
                }
                // If we created layout without globals.css but plan implied design, ensure globals too
                if (files.some(f => f.path === 'app/layout.tsx') && !files.some(f => f.path === 'app/globals.css')) {
                    ensureExists('app/globals.css', globalsCss);
                }
                if (created.length || updated.length || deleted.length) {
                    steps.push({ type: 'file_plan_applied', ts: Date.now(), created, updated, deleted });
                }

                // Heuristic hydration: wire common components into layout/page for immediate preview
                try {
                    const getFile = (p: string) => files.find(f => f.path === p);
                    const ensureUpdate = (p: string, mutate: (c: string) => string) => {
                        const idx = files.findIndex(f => f.path === p);
                        if (idx !== -1) {
                            const before = files[idx].content;
                            const after = mutate(before);
                            if (after !== before) { files[idx] = { path: p, content: after }; updated.push(p); }
                        }
                    };
                    const createdSet = new Set(created);
                    const has = (p: string) => files.some(f => f.path === p);
                    // If layout + Header/Footer created, inject them
                    if (has('app/layout.tsx')) {
                        ensureUpdate('app/layout.tsx', c => {
                            let code = c;
                            if (createdSet.has('components/Header.tsx') && !/Header\b/.test(code)) {
                                code = `import Header from '../components/Header';\n` + code;
                                code = code.replace(/<body[^>]*>/, m => `${m}\n<Header />`);
                            }
                            if (createdSet.has('components/Footer.tsx') && !/Footer\b/.test(code)) {
                                code = `import Footer from '../components/Footer';\n` + code;
                                code = code.replace(/<\/body>/, `<Footer />\n</body>`);
                            }
                            return code;
                        });
                    }
                    // If page and Hero exists, place Hero at top
                    if (has('app/page.tsx') && createdSet.has('components/Hero.tsx')) {
                        ensureUpdate('app/page.tsx', c => {
                            if (!/Hero\b/.test(c)) {
                                return `import Hero from '../components/Hero';\n` + c.replace(/return\s*<([A-Za-z]+)/, match => `return <>\n  <Hero />\n  <${match.split('return ')[1]}`) // fallback naive
                                    .replace(/return\s*\(/, 'return (<>\n  <Hero />')
                                    .replace(/export default function Page\(.*?\){/, m => m + `\n// Injected Hero component`)
                                    .replace(/\n}\s*$/, '\n</>\n}');
                            }
                            return c;
                        });
                    }
                    // If ProjectCard exists, ensure a simple list on page
                    if (has('app/page.tsx') && createdSet.has('components/ProjectCard.tsx')) {
                        ensureUpdate('app/page.tsx', c => {
                            if (!/ProjectCard\b/.test(c)) {
                                const sampleBlock = `\n  <section style={{display:'grid',gap:'1rem',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',marginTop:'2rem'}}>{[1,2,3].map(i=> <ProjectCard key={i} />)}</section>`;
                                let code = `import ProjectCard from '../components/ProjectCard';\n` + c;
                                code = code.replace(/<Hero\s*\/>/, m => m + sampleBlock);
                                if (!/ProjectCard key/.test(code)) {
                                    code = code.replace(/return\s*<[^>]+>/, match => match + sampleBlock).replace(/return\s*\(\s*<[^>]+>/, match => match + sampleBlock);
                                }
                                return code;
                            }
                            return c;
                        });
                    }
                } catch (e: any) {
                    steps.push({ type: 'hydration_error', ts: Date.now(), error: e?.message });
                }
            } catch (e: any) {
                steps.push({ type: 'file_plan_apply_error', ts: Date.now(), error: e?.message });
            }
        }
    } catch (e: any) {
        steps.push({ type: 'file_plan_parse_error', ts: Date.now(), error: e?.message });
    }
    const assistantMessage = await prisma.chatMessage.create({ data: { userId, projectId: project.id, role: 'assistant', content: assistantContent } });

    const snapshot = await prisma.projectSnapshot.create({ data: { projectId: project.id, files } });
    steps.push({ type: 'snapshot_complete', ts: Date.now(), snapshotId: snapshot.id });

    // Realtime notify (best-effort)
    try {
        if (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY) {
            await pusher.trigger(`project-${project.id}`, 'files.updated', { projectId: project.id, snapshotId: snapshot.id });
            steps.push({ type: 'realtime_emit', ts: Date.now(), channel: `project-${project.id}` });
        } else {
            steps.push({ type: 'realtime_skip', ts: Date.now(), reason: 'missing_env' });
        }
    } catch (e: any) {
        steps.push({ type: 'realtime_error', ts: Date.now(), error: e?.message });
    }

    // Deployment routine steps (mock for now)
    steps.push({ type: 'deploy_start', ts: Date.now(), target: 'mock_vercel' });
    const deploymentUrl = `https://preview.sorya.dev/p/${project.id}`;
    await prisma.project.update({ where: { id: project.id }, data: { deploymentUrl, lastSnapshotId: snapshot.id, status: 'LIVE' } });
    steps.push({ type: 'deploy_result', ts: Date.now(), url: deploymentUrl, state: 'LIVE', mode: 'mock' });

    if (patchApplied && !isNew) {
        steps.push({ type: 'patch_apply', ts: Date.now(), changedFiles: diffSummary.modified, addedFiles: diffSummary.added });
        // If project published to GitHub, push incremental commit (stub)
        if (project.repoFullName) {
            const userForToken = await prisma.user.findUnique({ where: { id: userId }, select: { githubToken: true } });
            if (userForToken?.githubToken) {
                try {
                    const pushRes = await pushSnapshot(userForToken.githubToken, project.repoFullName, files, 'Incremental patch');
                    steps.push({ type: 'github_commit', ts: Date.now(), commit: pushRes.commitSha });
                } catch (e) {
                    steps.push({ type: 'github_commit_error', ts: Date.now(), error: (e as any)?.message || 'push_failed' });
                }
            }
        }
    }

    await prisma.routine.update({ where: { id: routine.id }, data: { steps, status: 'SUCCESS', finishedAt: new Date() } });
    maybeSummarize(project.id).catch(() => { });

    return NextResponse.json({ projectId: project.id, projectName: project.name, projectType: project.type, typeConfidence: project.typeConfidence, deploymentUrl, messages: [userMessage, assistantMessage], snapshotId: snapshot.id, creditsDeducted: GENERATION_CREDIT_COST, balance: newBalance, routineId: routine.id, steps, model: model || OPENAI_MODEL });
}

// Conversation memory helpers (moved above generateAssistantReply)
function estimateTokens(text: string) { return Math.ceil(text.length / 4); }
async function getConversationState(projectId: string) { let state = await (prisma as any).projectConversationState.findUnique({ where: { projectId } }); if (!state) state = await (prisma as any).projectConversationState.create({ data: { projectId } }); return state; }
async function updateConversationState(projectId: string, patch: any) { return (prisma as any).projectConversationState.update({ where: { projectId }, data: patch }); }
async function buildContext(projectId: string, snapshotSummary: string, diffSummary: any) { const state = await getConversationState(projectId); const afterId = state.lastSummarizedMessageId; const where: any = { projectId }; if (afterId) { const pivot = await prisma.chatMessage.findUnique({ where: { id: afterId } }); if (pivot) where.createdAt = { gt: pivot.createdAt }; } const recentAll = await prisma.chatMessage.findMany({ where, orderBy: { createdAt: 'asc' } }); const MAX_RECENT_TOKENS = 1600; const trimmed: any[] = []; let acc = 0; for (let i = recentAll.length - 1; i >= 0; i--) { const m = recentAll[i]; const slice = m.content.slice(0, 4000); const t = estimateTokens(slice); if (acc + t > MAX_RECENT_TOKENS) break; trimmed.push({ role: m.role, content: slice }); acc += t; } trimmed.reverse(); const summaryBlock = state.summary ? `Conversation summary (compressed):\n${state.summary}` : ''; let diffBlock = ''; if (diffSummary) { const { added = [], modified = [], removed = [], unchangedCount } = diffSummary; diffBlock = `Last diff: Added(${added.length}) Modified(${modified.length}) Removed(${removed.length}) Unchanged(${unchangedCount}).`; } const contextParts: string[] = []; if (snapshotSummary) contextParts.push(snapshotSummary); if (diffBlock) contextParts.push(diffBlock); if (summaryBlock) contextParts.push(summaryBlock); return { state, recentMessages: trimmed, extraContext: contextParts.join('\n') }; }
async function maybeSummarize(projectId: string) { const state = await getConversationState(projectId); const total = await prisma.chatMessage.count({ where: { projectId } }); if (total < 12) return; let pivotDate: Date | null = null; if (state.lastSummarizedMessageId) { const pivot = await prisma.chatMessage.findUnique({ where: { id: state.lastSummarizedMessageId } }); pivotDate = pivot?.createdAt || null; } const toCompress = await prisma.chatMessage.findMany({ where: { projectId, ...(pivotDate ? { createdAt: { gt: pivotDate } } : {}) }, orderBy: { createdAt: 'asc' } }); if (toCompress.length < 14) return; const keepRecent = 10; const head = toCompress.slice(0, Math.max(0, toCompress.length - keepRecent)); if (!head.length) return; const lastHead = head[head.length - 1]; const summarizerModel = process.env.SUMMARIZER_MODEL || 'gpt-4o-mini'; const summaryInput: any = [{ role: 'system', content: 'Summarize the project conversation so far into: Goals; Architecture decisions; Implemented features; Pending TODOs; Rejected/Deferred ideas. <=350 tokens.' }, { role: 'user', content: head.map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 1500)}`).join('\n---\n') }]; try { const summaryResp = await openai.chat.completions.create({ model: summarizerModel, messages: summaryInput as any, temperature: 0.2, max_tokens: 380 }); const summaryText = (summaryResp as any).choices[0]?.message?.content?.trim(); if (summaryText) { const merged = state.summary ? `${state.summary}\n\n[Update]\n${summaryText}` : summaryText; await updateConversationState(projectId, { summary: merged.slice(0, 12000), summaryTokens: estimateTokens(merged), lastSummarizedMessageId: lastHead.id, totalMessages: total }); } } catch (e: any) { console.warn('[AI] summarization failed', e?.message); } }
// New helper to fetch open project TODOs for prompt context
async function fetchProjectTodos(projectId: string) {
    try {
        const todos = await (prisma as any).projectTodo.findMany({ where: { projectId, status: 'OPEN' }, orderBy: { createdAt: 'asc' }, take: 12 });
        if (!todos.length) return '';
        return 'Open TODOs (keep in mind):\n' + todos.map((t: any, i: number) => `${i + 1}. ${t.text}`).join('\n');
    } catch (e: any) {
        console.warn('[AI] fetchProjectTodos failed', e?.message);
        return '';
    }
}
