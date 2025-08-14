import { NextRequest, NextResponse } from 'next/server';
import { prisma, prismaAvailable } from '@/src/lib/db';
import { buildPreviewHtml, buildSiteMockHtml, parsePlanSections } from '@/src/lib/previewBuilder';
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
async function generateAssistantReply(prompt: string, opts: { diffSummary?: any; projectId: string; model?: string; planOnly?: boolean }) {
    const { diffSummary, projectId, model, planOnly } = opts;
    const chosenModel = model || OPENAI_MODEL;
    const forceGpt5 = true; // always try gpt-5 first per requirement
    const primaryModel = forceGpt5 ? 'gpt-5-2025-08-07' : chosenModel;
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
    let extraContext = '';
    let recentMessages: any[] = [];
    let openTodos = '';
    if (prismaAvailable && prisma) {
        try {
            const project = await prisma.project.findUnique({ where: { id: projectId }, select: { lastSnapshotId: true, name: true } });
            if (project?.lastSnapshotId) {
                try {
                    const snap = await prisma.projectSnapshot.findUnique({ where: { id: project.lastSnapshotId } });
                    if (snap) {
                        const files: any[] = snap.files as any[];
                        const list = files.map(f => f.path).slice(0, 15).join(', ');
                        snapshotSummary = `Project: ${project.name}. Files: ${files.length}. Sample: ${list}${files.length > 15 ? ' ...' : ''}`;
                    }
                } catch { }
            }
            const ctx = await buildContext(projectId, snapshotSummary, diffSummary).catch(() => ({ extraContext: '', recentMessages: [] } as any));
            extraContext = ctx.extraContext || '';
            recentMessages = ctx.recentMessages || [];
            openTodos = await fetchProjectTodos(projectId);
        } catch { /* ignore DB issues */ }
    }
    const systemCore = [
        'You are Sorya, a highly diligent senior full-stack engineer AI that incrementally designs, refactors and extends the project.',
        'Style: decisive, no laziness, give concrete implementation guidance, list next actionable steps.',
        'Always output a leading "File Plan:" section BEFORE numbered sections. Each File Plan line: CREATE|UPDATE|DELETE <path> – short purpose. Only include real actions needed now. Use paths within app/, components/, lib/, prisma/, src/, public/, or root files. ALWAYS include: (a) CREATE preview.html on first generation, (b) thereafter UPDATE preview.html EVERY response to reflect the new state (a static compiled representation with inline CSS, no external calls). Provide at least: app/page.tsx + preview.html on first generation. Never produce placeholder text indicating failure.',
        'After the numbered sections, output concrete file contents for every CREATE or UPDATE using EXACT XML-ish blocks so the backend can parse them. Use this format strictly: <file path="app/page.tsx">\n<full file content here>\n</file> . One block per file. Skip unchanged files. Do NOT wrap inside markdown fences. No extra commentary inside the block.',
        `Structure every answer EXACTLY as:\nFile Plan:\n<lines>\n\n1) Summary of intent\n2) Proposed changes / code notes\n3) Potential pitfalls\n4) Next TODO bullets (<=6)\n\n<file path="...">\n...\n</file> (zero or more blocks)\nReturn plain text only. Keep total under 420 tokens unless user asks for more. Return all sections even if brief. Avoid adding extra sections beyond the file blocks.`
    ];
    if (planOnly) {
        systemCore.push('OVERRIDE CURRENT INSTRUCTIONS: This is a PLAN-ONLY phase. Return ONLY the File Plan lines and the numbered sections 1-4. DO NOT include any <file path="..."> code blocks or other code. Keep under 300 tokens, concise and actionable.');
    }
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
        console.log('[api/chat] attemptResponses:start');
        const basePayload: any = {
            model: primaryModel,
            input: linearInput + '\n\nPlease respond now.',
            max_output_tokens: planOnly ? 320 : 420,
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
                const timeoutMs = 25000;
                const resp = await Promise.race([
                    doReq(),
                    new Promise<any>(res => setTimeout(() => res({ __timeout: true }), timeoutMs))
                ]);
                if (resp?.__timeout) {
                    console.warn('[AI] responses timeout', tag, timeoutMs);
                    return { text: null, resp: null };
                }
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
        console.log('[api/chat] attemptResponses:firstComplete', { hasText: !!first.text });
        if (first.text && !reasoningOnly(first.resp)) return first.text;
        const needRetry = (!first.text || reasoningOnly(first.resp));
        if (!needRetry) return first.text;
        console.log('[AI] retrying due to reasoning-only / empty output');
        const retryPayload = { ...basePayload, input: basePayload.input + '\n\nFINAL ANSWER REQUIRED NOW: Output File Plan and all numbered sections strictly as instructed. Do NOT include reasoning tokens.' + (planOnly ? ' NO CODE BLOCKS.' : ''), max_output_tokens: planOnly ? 360 : 700 };
        const second = await execOnce(retryPayload, 'retry');
        console.log('[api/chat] attemptResponses:retryComplete', { hasText: !!second.text });
        if (second.text && !reasoningOnly(second.resp)) return second.text;
        // Fallback stub if still no usable text
        if (!second.text || reasoningOnly(second.resp)) {
            console.warn('[api/chat] attemptResponses:fallbackStub');
            return [
                'File Plan:',
                'CREATE app/page.tsx – Initial application shell',
                'CREATE preview.html – Rendered static preview for iframe',
                '',
                '1) Summary of intent',
                'Provide a minimal yet production-style starter implementing the user prompt.',
                '2) Proposed changes / code notes',
                '- app/page.tsx React entry with semantic sections.',
                '- preview.html static version for fast iframe preview (no build step).',
                '3) Potential pitfalls',
                '- Missing build pipeline for advanced assets.',
                '4) Next TODO bullets',
                '- Enrich UI components', '- Add styling file', '- Implement interactions', '- Add routing', '- Add persistent data', '- Add auth',
                '',
                '<file path="app/page.tsx">',
                `export default function GeneratedPage(){return (<main style={{fontFamily:'system-ui',padding:'2.5rem 2rem',lineHeight:1.5}}><header style={{marginBottom:'2rem'}}><h1 style={{margin:0,fontSize:'2.1rem'}}>\n${prompt.replace(/`/g, '\\`').slice(0, 120)}\n</h1><p style={{margin:'0.6rem 0 0',maxWidth:680,color:'#555'}}>Initial scaffold (fallback) – extend with components, state management and persistence.</p></header><section><h2 style={{fontSize:'1.15rem',margin:'0 0 .6rem'}}>Getting Started</h2><ul style={{margin:'0 0 1.2rem',paddingLeft:'1.2rem'}}><li>Refine requirements in the chat.</li><li>Generate additional components.</li><li>Iterate and redeploy.</li></ul></section></main>);}`,
                '</file>',
                '<file path="preview.html">',
                `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><title>Preview</title><meta name="viewport" content="width=device-width,initial-scale=1"/><style>body{margin:0;font-family:system-ui;background:#0f1115;color:#f1f5f9;}main{max-width:860px;margin:0 auto;padding:40px 32px;}h1{background:linear-gradient(90deg,#6366f1,#8b5cf6);-webkit-background-clip:text;color:transparent;}header p{color:#94a3b8;}section{background:#111827;padding:24px 28px;border:1px solid #1e293b;border-radius:18px;}ul{line-height:1.55}code{background:#1e293b;padding:2px 5px;border-radius:4px;font-size:13px}</style></head><body><main><header><h1>${prompt.replace(/</g, '&lt;').slice(0, 120)}</h1><p>Scaffold generated while full model output was unavailable. Continue chatting to refine.</p></header><section><h2>Next Steps</h2><ul><li>Add components & routes</li><li>Design system/theme</li><li>Auth + data layer</li><li>Deployment integration</li></ul></section></main></body></html>`,
                '</file>'
            ].join('\n');
        }
        return second.text; // may be reasoning summary or null
    };

    if (useResponsesApi) {
        const out = await attemptResponses();
        console.log('[api/chat] attemptResponses:done', { hasOut: !!out, length: out?.length });
        return out || 'File Plan:\nCREATE app/page.tsx – Empty fallback\n\n1) Summary\nNo content.\n2) Proposed changes\nAdd placeholder.\n3) Potential pitfalls\nModel empty.\n4) Next TODO bullets\n- Retry\n\n<file path="app/page.tsx">export default function Empty(){return <div style={{padding:\'2rem\'}}><h1>Empty</h1><p>No content.</p></div>}</file>';
    }
    // If somehow not using responses API (should not happen with forced gpt-5)
    return 'Model path unavailable.';
}

// Second phase: given a set of planned file paths, ask model to return ONLY <file> blocks with full implementations.
async function generateFileBodiesForPlan(projectId: string, userPrompt: string, planFiles: { action: string; path: string; note?: string }[]): Promise<string> {
    if (!process.env.OPENAI_API_KEY) {
        return planFiles.map(f => `<file path="${f.path}">// Placeholder for ${f.path} (no API key)</file>`).join('\n');
    }
    const openaiLocal: any = openai as any;
    const model = 'gpt-5-2025-08-07';
    const instructions = [
        'You are Sorya second-phase code generator. The file plan is approved. Output ONLY file blocks with complete contents (no commentary).',
        'Each file MUST be in format: <file path="path">\n...code...\n</file>',
        'Do NOT include a File Plan again. Do NOT include numbered sections. No markdown fences. Just the file blocks in any order.',
        'Implement production-quality minimal code reflecting the user prompt and notes.'
    ].join('\n');
    const fileListDesc = planFiles.map(f => `${f.action} ${f.path} - ${f.note || ''}`.trim()).join('\n');
    const input = `${instructions}\n\nUser prompt:\n${userPrompt}\n\nPlanned files:\n${fileListDesc}\n\nReturn the file blocks now:`;
    const payload: any = { model, input, max_output_tokens: 1400, text: { format: { type: 'text' } } };
    try {
        const hasResponses = !!openaiLocal.responses?.create;
        const resp = hasResponses ? await openaiLocal.responses.create(payload) : await (await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json();
        const collect = (r: any): string => {
            if (r.output_text) return r.output_text;
            const out: string[] = [];
            if (Array.isArray(r.output)) for (const o of r.output) {
                if (o.type === 'output_text' && o.text) out.push(typeof o.text === 'string' ? o.text : o.text.value || '');
                if (o.type === 'message' && Array.isArray(o.content)) for (const c of o.content) if (c.type === 'text' && c.text) out.push(typeof c.text === 'string' ? c.text : c.text.value || '');
            }
            return out.join('\n');
        };
        const text = collect(resp).trim();
        if (!text.includes('<file')) {
            return planFiles.map(f => `<file path="${f.path}">/* Second-phase fallback for ${f.path} */</file>`).join('\n');
        }
        return text;
    } catch (e: any) {
        console.warn('[api/chat] second-phase generation failed', e?.message);
        return planFiles.map(f => `<file path="${f.path}">/* Second-phase error: ${e?.message} */</file>`).join('\n');
    }
}

// Generate an end-result style single-page HTML (inline CSS/JS) for immediate visual preview.
async function generateVisualSiteDraft(userPrompt: string, planLines: string[], projectName: string): Promise<string | null> {
    if (!process.env.OPENAI_API_KEY) return null;
    try {
        const openaiLocal: any = openai as any;
        const model = 'gpt-5-2025-08-07';
        const instructions = [
            'You are Sorya visual draft generator.',
            'Output ONLY a single complete self-contained HTML5 document with <html> root. NO markdown fences. NO explanations.',
            'Inline all CSS (in <style>) and JS (in <script>) if needed. Keep total under 22 KB.',
            'Design goals: modern, accessible, responsive, good vertical rhythm, gradient hero, clear typography.',
            'Use semantic sections (header, main, section, footer). Provide a hero, feature/cards, and optional call-to-action.',
            'Do NOT include external network calls, analytics, fonts CDN, or images that require fetch (inline SVG / placeholders ok).',
            'If user intent implies interactivity (game, form, simple app) include minimal JS implementing core behavior (keep it small).',
            'Prefer system-ui / sans-serif fonts. Dark theme base. Provide light subtle animations (CSS only) when reasonable.'
        ].join('\n');
        const planHint = planLines.slice(0, 12).join('\n');
        const input = `${instructions}\n\nProject: ${projectName}\nUser Prompt:\n${userPrompt}\n\nPlanned Files (hints):\n${planHint}\n\nReturn ONLY the HTML document now:`;
        const payload: any = { model, input, max_output_tokens: 900, text: { format: { type: 'text' } } };
        const hasResponses = !!openaiLocal.responses?.create;
        const resp = hasResponses ? await openaiLocal.responses.create(payload) : await (await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })).json();
        const extract = (r: any): string => {
            if (!r) return '';
            if (r.output_text) return r.output_text;
            const out: string[] = [];
            if (Array.isArray(r.output)) for (const o of r.output) {
                if (o.type === 'output_text' && o.text) out.push(typeof o.text === 'string' ? o.text : o.text.value || '');
                if (o.type === 'message' && Array.isArray(o.content)) for (const c of o.content) if (c.type === 'text' && c.text) out.push(typeof c.text === 'string' ? c.text : c.text.value || '');
            }
            return out.join('\n');
        };
        let html = extract(resp).trim();
        // Strip accidental fences
        html = html.replace(/^```html\s*|```$/gim, '').trim();
        if (!/^<!DOCTYPE/i.test(html)) {
            // Attempt to salvage HTML fragment
            if (/<html[\s>]/i.test(html)) {
                html = '<!DOCTYPE html>' + html;
            } else if (/<body[\s>]/i.test(html)) {
                html = '<!DOCTYPE html><html lang="en">' + html + '</html>';
            } else if (/<div|<header|<main|<section/i.test(html)) {
                html = `<!DOCTYPE html><html lang="en"><head><meta charset='utf-8'/><title>${projectName} Draft</title><meta name='viewport' content='width=device-width,initial-scale=1'><style>body{font-family:system-ui;margin:0;background:#0f1115;color:#e2e8f0;line-height:1.55;padding:40px 34px}h1{font-size:2.4rem;margin:0 0 1rem;background:linear-gradient(90deg,#6366f1,#8b5cf6);-webkit-background-clip:text;color:transparent}</style></head><body>${html}</body></html>`;
            } else if (html.split(/\s+/).length < 8) {
                return null; // too minimal
            } else {
                html = `<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'/><title>${projectName} Draft</title><meta name='viewport' content='width=device-width,initial-scale=1'></head><body>${html}</body></html>`;
            }
        }
        // Size guard
        if (html.length > 24000) html = html.slice(0, 23900) + '\n<!-- truncated -->';
        if (!/\b<section\b|<main|<header/i.test(html)) return html; // already fine
        return html;
    } catch (e: any) {
        console.warn('[api/chat] visual site draft generation failed', e?.message);
        return null;
    }
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
    model: z.string().optional(),
    phase: z.enum(['plan', 'code']).optional() // two-phase generation control
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
    console.log('[api/chat] entry');
    if ((authOptions as any).adapter === undefined) {
        // Return minimal placeholder so UI can still function in bypass mode
        console.log('[api/chat] auth adapter bypass');
        return NextResponse.json({ bypassed: true, message: 'Auth bypass active' }, { status: 200 });
    }
    if (!prismaAvailable || !prisma) {
        console.warn('[api/chat] prisma unavailable');
        return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) {
        console.warn('[api/chat] unauthorized');
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
        console.warn('[api/chat] invalid body');
        return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }
    const { prompt, projectId, model, phase } = parse.data;
    console.log('[api/chat] body parsed', { promptPreview: prompt.slice(0, 120), len: prompt.length, projectId, model, phase });

    // Fetch user credits (derived)
    await ensureInitialGrant(userId);
    const currentBalance = await getCreditBalance(userId);
    if (currentBalance < GENERATION_CREDIT_COST) {
        console.warn('[api/chat] insufficient credits', { balance: currentBalance });
        return NextResponse.json({ error: 'Insufficient credits' }, { status: 402 });
    }

    let project = projectId
        ? await prisma.project.findFirst({ where: { id: projectId, userId } })
        : null;
    const isNew = !project;
    let previousSnapshot: any = null;
    if (!project) {
        console.log('[api/chat] creating new project');
        const { type, confidence } = await classifyPrompt(prompt);
        const appName = deriveAppName(prompt);
        project = await prisma.project.create({ data: { userId, name: appName, type, typeConfidence: confidence } });
        console.log('[api/chat] new project created', { projectId: project.id });
    } else if (project.lastSnapshotId) {
        console.log('[api/chat] loading previous snapshot', { snapshotId: project.lastSnapshotId });
        previousSnapshot = await prisma.projectSnapshot.findUnique({ where: { id: project.lastSnapshotId } });
    }
    // Create routine row
    const routine = await prisma.routine.create({ data: { userId, projectId: project.id, kind: 'GENERATION', status: 'RUNNING', steps: [] } });
    console.log('[api/chat] routine created', { routineId: routine.id });

    // Debit credits via ledger
    await addCreditEntry(userId, -GENERATION_CREDIT_COST, 'generation');
    const newBalance = await getCreditBalance(userId);

    const steps: any[] = [];
    steps.push({ type: 'code_gen_start', ts: Date.now(), prompt, phase: phase || 'code_default' });

    // DIFF CONTEXT (improved code generation placeholder)
    if (previousSnapshot) {
        const prevFiles = previousSnapshot.files as any[];
        steps.push({ type: 'diff_context_prepare', ts: Date.now(), previousSnapshotId: previousSnapshot.id, prevFileCount: prevFiles.length });
    }

    const userMessage = await prisma.chatMessage.create({ data: { userId, projectId: project.id, role: 'user', content: prompt } });

    // ---------------- PLAN PHASE (fast) ----------------
    if ((phase || 'plan') === 'plan') {
        steps.push({ type: 'plan_phase_start', ts: Date.now() });
        // Build diff summary context only (do not mutate code yet)
        let diffSummary: any = null;
        if (previousSnapshot) {
            const prevFiles = previousSnapshot.files as any[];
            diffSummary = { added: [], modified: [], removed: [], unchangedCount: prevFiles.length };
        }
        // Generate plan-only assistant reply
        let planText = await generateAssistantReply(prompt, { diffSummary, projectId: project.id, model, planOnly: true });
        if (!/File Plan:/i.test(planText)) {
            planText = 'File Plan:\nCREATE preview.html – synthetic project preview\nCREATE app/page.tsx – base page shell\n\n1) Summary of intent\nInitial scaffold for: ' + prompt.slice(0, 140) + '\n2) Proposed changes / code notes\n- Add core page and preview\n3) Potential pitfalls\n- Missing real code until background phase\n4) Next TODO bullets\n- Generate code phase\n- Add components\n- Refine UI\n- Persist data\n';
        }
        const parsed = parsePlanSections(planText);
        const planLines = parsed.planLines.filter(l => /^(CREATE|UPDATE|DELETE)\b/i.test(l));
        // base files come from previous snapshot, else minimal shell
        let files: { path: string; content: string }[] = [];
        if (previousSnapshot) {
            files = (previousSnapshot.files as any[]).map((f: any) => ({ path: f.path, content: f.content }));
        } else {
            files = generateFiles(project.name, prompt);
        }
        // build synthetic preview.html
        // Try real visual site draft via model first; fallback to synthetic site mock.
        let previewHtml = await generateVisualSiteDraft(prompt, planLines, project.name);
        // Track which strategy produced the preview so we can analyze quality later.
        let previewStrategyValue: string = 'visual_model';
        if (!previewHtml) {
            previewHtml = buildSiteMockHtml({
                projectName: project.name,
                prompt,
                planLines,
                summary: parsed.summary,
                proposed: parsed.proposed,
                pitfalls: parsed.pitfalls,
                todos: parsed.todos,
                phase: 'plan'
            });
            previewStrategyValue = 'visual_mock';
            steps.push({ type: 'preview_visual_fallback', ts: Date.now() });
        } else {
            steps.push({ type: 'preview_visual_generated', ts: Date.now(), bytes: previewHtml.length });
        }
        const previewIdx = files.findIndex(f => f.path === 'preview.html');
        if (previewIdx >= 0) files[previewIdx] = { path: 'preview.html', content: previewHtml }; else files.push({ path: 'preview.html', content: previewHtml });
        steps.push({ type: 'plan_preview_built', ts: Date.now(), planLineCount: planLines.length });
        const assistantMessage = await prisma.chatMessage.create({ data: { userId, projectId: project.id, role: 'assistant', content: planText } });
        // Cast data to any to avoid transient type mismatch if Prisma types are stale in the TS language server.
        const snapshot = await prisma.projectSnapshot.create({ data: { projectId: project.id, files, previewStrategy: previewStrategyValue } as any });
        await prisma.project.update({ where: { id: project.id }, data: { lastSnapshotId: snapshot.id, status: 'LIVE' } });
        steps.push({ type: 'snapshot_complete', ts: Date.now(), snapshotId: snapshot.id, phase: 'plan' });
        // Realtime notify
        try {
            if (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY) {
                await pusher.trigger(`project-${project.id}`, 'files.updated', { projectId: project.id, snapshotId: snapshot.id });
                steps.push({ type: 'realtime_emit', ts: Date.now(), channel: `project-${project.id}`, phase: 'plan' });
            }
        } catch (e: any) { steps.push({ type: 'realtime_error', ts: Date.now(), error: e?.message, phase: 'plan' }); }

        // Mark routine success (plan phase done)
        await prisma.routine.update({ where: { id: routine.id }, data: { steps, status: 'SUCCESS', finishedAt: new Date() } });

        // Kick off background code phase (non-blocking)
        setTimeout(() => {
            runBackgroundCodePhase({ projectId: project.id, userId, prompt, model, planLines }).catch(err => console.warn('[api/chat] background code phase error', err?.message));
        }, 80);

        // displayAssistant is just planText (already plan-only) + diff summary placeholder
        let displayAssistant = planText.trim();
        if (displayAssistant.length > 1600) displayAssistant = displayAssistant.slice(0, 1600) + '\n…';
        return NextResponse.json({ projectId: project.id, projectName: project.name, projectType: project.type, typeConfidence: project.typeConfidence, deploymentUrl: null, messages: [userMessage, assistantMessage], displayAssistant, snapshotId: snapshot.id, creditsDeducted: GENERATION_CREDIT_COST, balance: newBalance, routineId: routine.id, steps, model: model || OPENAI_MODEL, fullGenerationPending: true, phase: 'plan' });
    }
    // ---------------- END PLAN PHASE ----------------

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
    let assistantContent = await generateAssistantReply(prompt, { diffSummary, projectId: project.id, model });
    console.log('[api/chat] assistant reply length', assistantContent.length);
    const usedFallbackScaffold = /Scaffold generated while full model output was unavailable/i.test(assistantContent);
    if (usedFallbackScaffold) steps.push({ type: 'fallback_scaffold_used', ts: Date.now() });

    // Two-phase enhancement: if this is initial generation (no previous snapshot) and assistant produced no real file blocks, request a second-phase with actual file bodies.
    if (!previousSnapshot) {
        const planMatchEarly = assistantContent.match(/File Plan:\n([\s\S]*?)(?:\n\n[0-9]+\)|\n1\)|\n1\)|$)/i);
        let planLinesEarly: string[] = [];
        if (planMatchEarly) planLinesEarly = planMatchEarly[1].split('\n').map(l => l.trim()).filter(l => /^(CREATE|UPDATE|DELETE)\b/i.test(l));
        const parsedEarly = planLinesEarly.map(l => {
            const m = l.match(/^(CREATE|UPDATE|DELETE)\s+([^\s]+)\s*[–-]?\s*(.*)$/i); return m ? { action: m[1].toUpperCase(), path: m[2], note: m[3] } : null;
        }).filter(Boolean) as any[];
        const blockRegexEarly = /<file path=\"([^\"]+)\">[\r\n]*([\s\S]*?)[\r\n]*<\/file>/g;
        const earlyBlocks: { path: string; content: string }[] = [];
        let mb: RegExpExecArray | null;
        while ((mb = blockRegexEarly.exec(assistantContent)) !== null) earlyBlocks.push({ path: mb[1], content: mb[2] });
        const onlyPlaceholders = earlyBlocks.length > 0 && earlyBlocks.every(b => /placeholder|Initial placeholder/i.test(b.content));
        const needSecondPhase = parsedEarly.length > 0 && (earlyBlocks.length === 0 || onlyPlaceholders);
        if (needSecondPhase) {
            console.log('[api/chat] triggering second-phase file body generation', { planCount: parsedEarly.length, earlyBlockCount: earlyBlocks.length });
            const createFiles = parsedEarly.filter(f => f.action === 'CREATE');
            const secondPhase = await generateFileBodiesForPlan(project.id, prompt, createFiles);
            // Append second-phase file blocks to assistant content so downstream parser sees them.
            assistantContent += '\n' + secondPhase;
            steps.push({ type: 'second_phase_generated', ts: Date.now(), files: createFiles.map(f => f.path) });
        }
    }
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
        const hasPreviewPlan = planLines.some(l => /preview\.html/i.test(l));
        if (!hasPreviewPlan) {
            planLines.push('UPDATE preview.html – refresh static preview');
            assistantContent = assistantContent.replace(/(File Plan:\n[\s\S]*?)(\n\n1\)|\n1\)|$)/i, (m, a, b) => {
                return a.trimEnd() + '\nUPDATE preview.html – refresh static preview' + (b.startsWith('\n') ? b : '\n\n1)');
            });
        }
        if (planLines.length) {
            const parsed = planLines.map(l => {
                const m = l.match(/^(CREATE|UPDATE|DELETE)\s+([^\s]+)\s*[–-]?\s*(.*)$/i);
                return m ? { action: m[1].toUpperCase(), path: m[2], note: m[3] || '' } : { raw: l };
            });
            steps.push({ type: 'file_plan', ts: Date.now(), plan: parsed });

            // Ensure preview.html block exists if plan includes create/update for it
            const wantsPreview = parsed.some(p => (p as any).path === 'preview.html');
            const hasPreviewBlock = /<file path="preview\.html">[\s\S]*?<\/file>/i.test(assistantContent);
            if (wantsPreview && !hasPreviewBlock) {
                const pageFile = files.find(f => f.path === 'app/page.tsx');
                const simplePreview = `<!DOCTYPE html><html><head><meta charset='utf-8'><title>Preview</title><meta name='viewport' content='width=device-width,initial-scale=1'><style>body{font-family:system-ui;margin:0;background:#0f1115;color:#f8fafc}main{max-width:900px;margin:0 auto;padding:40px 34px;line-height:1.55}h1{font-size:2.2rem;margin:0 0 1rem;background:linear-gradient(90deg,#6366f1,#8b5cf6);-webkit-background-clip:text;color:transparent}</style></head><body><main><h1>${project.name}</h1><p>Auto-generated preview (missing model file block). Continue refining.</p><section><h2>Recent Prompt</h2><p>${prompt.replace(/</g, '&lt;').slice(0, 180)}</p></section><section><h2>Page Extract</h2><pre style='white-space:pre-wrap;font-size:12px;background:#111827;padding:12px 14px;border:1px solid #1e293b;border-radius:10px;max-height:320px;overflow:auto;'>${(pageFile?.content || '').slice(0, 1600).replace(/</g, '&lt;')}</pre></section></main></body></html>`;
                assistantContent += `\n<file path="preview.html">\n${simplePreview}\n</file>`;
                steps.push({ type: 'preview_auto_injected', ts: Date.now() });
            }

            // Extract explicit file blocks from assistant output
            const blockRegex = /<file path=\"([^\"]+)\">[\r\n]*([\s\S]*?)[\r\n]*<\/file>/g;
            const blocks: { path: string; content: string }[] = [];
            let m: RegExpExecArray | null;
            while ((m = blockRegex.exec(assistantContent)) !== null) {
                blocks.push({ path: m[1].trim(), content: m[2] });
            }
            // Deduplicate multiple blocks per path choosing best candidate
            if (blocks.length) {
                const byPath = new Map<string, { path: string; content: string }[]>();
                for (const b of blocks) {
                    if (!byPath.has(b.path)) byPath.set(b.path, []);
                    byPath.get(b.path)!.push(b);
                }
                const scored: { path: string; content: string }[] = [];
                for (const [p, arr] of byPath.entries()) {
                    if (arr.length === 1) { scored.push(arr[0]); continue; }
                    let best = arr[0];
                    const score = (c: string) => {
                        const len = c.length;
                        const hasCode = /(export |import |function |const |class )/.test(c) ? 400 : 0;
                        const placeholderPenalty = /(Second-phase fallback|Placeholder created|Initial placeholder)/i.test(c) ? -300 : 0;
                        return len + hasCode + placeholderPenalty;
                    };
                    for (const candidate of arr) {
                        if (score(candidate.content) > score(best.content)) best = candidate;
                    }
                    if (arr.length > 1) {
                        steps.push({ type: 'file_block_dedup', ts: Date.now(), path: p, variants: arr.length, chosenLength: best.content.length });
                    }
                    scored.push(best);
                }
                blocks.length = 0; blocks.push(...scored);
            }
            if (blocks.length) steps.push({ type: 'file_blocks_parsed', ts: Date.now(), count: blocks.length });
            const blockMap = new Map(blocks.map(b => [b.path, b.content]));

            try {
                const created: string[] = [];
                const updated: string[] = [];
                const deleted: string[] = [];
                const ensureCreate = (path: string, content: string) => {
                    const idx = files.findIndex(f => f.path === path);
                    if (idx === -1) { files.push({ path, content }); created.push(path); } else { files[idx] = { path, content }; updated.push(path); }
                };
                const ensureUpdate = (path: string, content: string) => {
                    const idx = files.findIndex(f => f.path === path);
                    if (idx !== -1) { files[idx] = { path, content }; updated.push(path); }
                };
                for (const p of parsed) {
                    if (!('action' in p)) continue;
                    const { action, path, note } = p as any;
                    if (action === 'CREATE') {
                        if (blockMap.has(path)) {
                            ensureCreate(path, blockMap.get(path)!);
                        } else {
                            // fallback placeholder if model omitted block
                            ensureCreate(path, `// Placeholder created (no block provided) for ${path} - ${note}`);
                        }
                    } else if (action === 'UPDATE') {
                        if (blockMap.has(path)) {
                            ensureUpdate(path, blockMap.get(path)!);
                        } else {
                            const idx = files.findIndex(f => f.path === path);
                            if (idx !== -1) files[idx] = { path, content: files[idx].content + `\n\n// AI update (${new Date().toISOString()}) - ${note}` };
                            updated.push(path);
                        }
                    } else if (action === 'DELETE') {
                        const idx = files.findIndex(f => f.path === path);
                        if (idx !== -1) { files.splice(idx, 1); deleted.push(path); }
                    }
                }
                if (created.length || updated.length || deleted.length) {
                    steps.push({ type: 'file_plan_applied', ts: Date.now(), created, updated, deleted });
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
    console.log('[api/chat] snapshot created', { snapshotId: snapshot.id, fileCount: files.length });
    try { console.log('[api/chat] snapshot file list', files.map(f => ({ path: f.path, len: (f.content || '').length })).slice(0, 40)); } catch { }
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

    // Deployment disabled (preview-only mode)
    const deploymentUrl = null;
    await prisma.project.update({ where: { id: project.id }, data: { lastSnapshotId: snapshot.id, status: 'LIVE' } });
    steps.push({ type: 'deploy_skipped', ts: Date.now(), reason: 'preview_only_mode' });
    // Immediate verification read-back (debugging missing lastSnapshotId issue)
    try {
        const verify = await prisma.project.findUnique({ where: { id: project.id }, select: { lastSnapshotId: true, status: true } });
        console.log('[api/chat] verify after update', { projectId: project.id, lastSnapshotId: verify?.lastSnapshotId, status: verify?.status });
        steps.push({ type: 'post_update_verify', ts: Date.now(), lastSnapshotId: verify?.lastSnapshotId });
    } catch (e: any) {
        console.warn('[api/chat] verify query failed', e?.message);
    }

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
    console.log('[api/chat] routine completed', { routineId: routine.id });
    maybeSummarize(project.id).catch(() => { });

    // Build a display-only assistant summary for UI (strip file blocks & trim) and append diff summary
    let displayAssistant = assistantContent;
    try {
        displayAssistant = displayAssistant.replace(/<file path="[^"]+">[\s\S]*?<\/file>/g, '').trim();
        const parts = displayAssistant.split(/\n{2,}/);
        if (parts.length > 0) {
            displayAssistant = parts.filter(p => p.length < 1500).join('\n\n');
        }
        // Derive file change summary from steps or initial snapshot
        let created: string[] = []; let updated: string[] = []; let deleted: string[] = [];
        const planApplied = [...steps].reverse().find(s => s.type === 'file_plan_applied');
        if (planApplied) {
            created = planApplied.created || [];
            updated = planApplied.updated || [];
            deleted = planApplied.deleted || [];
        } else if (!previousSnapshot) {
            created = files.map(f => f.path);
        }
        if (created.length || updated.length || deleted.length) {
            const lineCount = (p: string) => { try { const f = files.find(f => f.path === p); return f ? (f.content.split(/\n/).length) : 0; } catch { return 0; } };
            const fmtList = (arr: string[], prefix: string) => arr.slice(0, 10).map(p => `${prefix}${p}${lineCount(p) ? ' (' + lineCount(p) + 'l)' : ''}`).join(', ') + (arr.length > 10 ? `, +${arr.length - 10} more` : '');
            const diffLines: string[] = [];
            diffLines.push('---');
            diffLines.push('Diff Summary:');
            if (created.length) diffLines.push('Created: ' + fmtList(created, '+'));
            if (updated.length) diffLines.push('Updated: ' + fmtList(updated, '∆'));
            if (deleted.length) diffLines.push('Deleted: ' + fmtList(deleted, '−'));
            const diffBlock = diffLines.join('\n');
            displayAssistant = displayAssistant + '\n\n' + diffBlock;
        }
        if (displayAssistant.length > 1600) displayAssistant = displayAssistant.slice(0, 1600) + '\n…';
    } catch { }
    return NextResponse.json({ projectId: project.id, projectName: project.name, projectType: project.type, typeConfidence: project.typeConfidence, deploymentUrl, messages: [userMessage, assistantMessage], displayAssistant, snapshotId: snapshot.id, creditsDeducted: GENERATION_CREDIT_COST, balance: newBalance, routineId: routine.id, steps, model: model || OPENAI_MODEL });
}

// Background code phase executor (invoked after plan snapshot)
async function runBackgroundCodePhase(args: { projectId: string; userId: string; prompt: string; model?: string; planLines?: string[] }) {
    const { projectId, userId, prompt, model } = args;
    if (!prismaAvailable || !prisma) return;
    try {
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project) return;
        const previousSnapshot = project.lastSnapshotId ? await prisma.projectSnapshot.findUnique({ where: { id: project.lastSnapshotId } }) : null;
        const routine = await prisma.routine.create({ data: { userId, projectId, kind: 'BACKGROUND_CODE', status: 'RUNNING', steps: [] } });
        const steps: any[] = [{ type: 'background_code_start', ts: Date.now() }];
        let diffSummary: any = null;
        if (previousSnapshot) {
            const prevFiles = previousSnapshot.files as any[];
            steps.push({ type: 'diff_context_prepare', ts: Date.now(), previousSnapshotId: previousSnapshot.id, prevFileCount: prevFiles.length });
        }
        // For background phase treat previous snapshot as base
        let files: { path: string; content: string }[] = [];
        if (previousSnapshot) files = (previousSnapshot.files as any[]).map((f: any) => ({ path: f.path, content: f.content }));
        else files = generateFiles(project.name, prompt);
        let assistantContent = await generateAssistantReply(prompt, { diffSummary, projectId, model, planOnly: false });
        // Reuse existing parsing logic by lightly duplicating critical parts (reduced for brevity)
        try {
            const planSectionMatch = assistantContent.match(/File Plan:\n([\s\S]*?)(?:\n\n[0-9]+\)|\n1\)|\n1\)|$)/i);
            let planRaw = planSectionMatch ? planSectionMatch[1].trim() : '';
            const planLines = planRaw.split('\n').map(l => l.trim()).filter(l => /^(CREATE|UPDATE|DELETE)\b/i.test(l));
            const parsed = planLines.map(l => { const m = l.match(/^(CREATE|UPDATE|DELETE)\s+([^\s]+)\s*[–-]?\s*(.*)$/i); return m ? { action: m[1].toUpperCase(), path: m[2], note: m[3] || '' } : null; }).filter(Boolean) as any[];
            const blockRegex = /<file path=\"([^\"]+)\">[\r\n]*([\s\S]*?)[\r\n]*<\/file>/g;
            const blocks: { path: string; content: string }[] = []; let m: RegExpExecArray | null;
            while ((m = blockRegex.exec(assistantContent)) !== null) blocks.push({ path: m[1], content: m[2] });
            const blockMap = new Map(blocks.map(b => [b.path, b.content]));
            const created: string[] = []; const updated: string[] = [];
            const ensureCreate = (path: string, content: string) => { const idx = files.findIndex(f => f.path === path); if (idx === -1) { files.push({ path, content }); created.push(path); } else { files[idx] = { path, content }; updated.push(path); } };
            const ensureUpdate = (path: string, content: string) => { const idx = files.findIndex(f => f.path === path); if (idx !== -1) { files[idx] = { path, content }; updated.push(path); } };
            for (const p of parsed) {
                const { action, path, note } = p as any;
                if (action === 'CREATE') ensureCreate(path, blockMap.get(path) || `// Placeholder (missing block) for ${path} - ${note}`);
                else if (action === 'UPDATE') ensureUpdate(path, blockMap.get(path) || (files.find(f => f.path === path)?.content + `\n// AI update (${new Date().toISOString()}) - ${note}` || `// Update placeholder for ${path}`));
            }
            // Always update preview.html synthetic to code phase
            const parsedSections = parsePlanSections(assistantContent);
            const previewHtml = buildPreviewHtml({ projectName: project.name, prompt, planLines: parsedSections.planLines, summary: parsedSections.summary, proposed: parsedSections.proposed, pitfalls: parsedSections.pitfalls, todos: parsedSections.todos, phase: 'code' });
            const previewIdx = files.findIndex(f => f.path === 'preview.html');
            if (previewIdx >= 0) files[previewIdx] = { path: 'preview.html', content: previewHtml }; else files.push({ path: 'preview.html', content: previewHtml });
            steps.push({ type: 'background_files_applied', ts: Date.now(), created, updated });
        } catch (e: any) {
            steps.push({ type: 'background_parse_error', ts: Date.now(), error: e?.message });
        }
        const assistantMessage = await prisma.chatMessage.create({ data: { userId, projectId, role: 'assistant', content: assistantContent } });
        const snapshot = await prisma.projectSnapshot.create({ data: { projectId, files } });
        await prisma.project.update({ where: { id: projectId }, data: { lastSnapshotId: snapshot.id, status: 'LIVE' } });
        try { if (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY) await pusher.trigger(`project-${projectId}`, 'files.updated', { projectId, snapshotId: snapshot.id }); } catch { }
        steps.push({ type: 'background_snapshot_complete', ts: Date.now(), snapshotId: snapshot.id });
        await prisma.routine.update({ where: { id: routine.id }, data: { steps, status: 'SUCCESS', finishedAt: new Date() } });
        maybeSummarize(projectId).catch(() => { });
    } catch (e: any) {
        try { await prisma.routine.create({ data: { userId, projectId, kind: 'BACKGROUND_CODE_ERROR', status: 'ERROR', steps: [{ type: 'background_error', error: e?.message, ts: Date.now() }] } }); } catch { }
    }
}

// Conversation memory helpers (moved above generateAssistantReply)
function estimateTokens(text: string) { return Math.ceil(text.length / 4); }
async function getConversationState(projectId: string) {
    if (!prismaAvailable || !prisma) return { projectId, summary: '', lastSummarizedMessageId: null } as any;
    let state = await (prisma as any).projectConversationState.findUnique({ where: { projectId } });
    if (!state) state = await (prisma as any).projectConversationState.create({ data: { projectId } });
    return state;
}
async function updateConversationState(projectId: string, patch: any) {
    if (!prismaAvailable || !prisma) return null;
    return (prisma as any).projectConversationState.update({ where: { projectId }, data: patch });
}
async function buildContext(projectId: string, snapshotSummary: string, diffSummary: any) {
    if (!prismaAvailable || !prisma) return { state: null, recentMessages: [], extraContext: snapshotSummary || '' };
    const state = await getConversationState(projectId);
    const afterId = (state as any).lastSummarizedMessageId;
    const where: any = { projectId };
    if (afterId) {
        const pivot = await prisma.chatMessage.findUnique({ where: { id: afterId } });
        if (pivot) where.createdAt = { gt: pivot.createdAt };
    }
    const recentAll = await prisma.chatMessage.findMany({ where, orderBy: { createdAt: 'asc' } });
    const MAX_RECENT_TOKENS = 1600;
    const trimmed: any[] = [];
    let acc = 0;
    for (let i = recentAll.length - 1; i >= 0; i--) {
        const m = recentAll[i];
        const slice = m.content.slice(0, 4000);
        const t = estimateTokens(slice);
        if (acc + t > MAX_RECENT_TOKENS) break;
        trimmed.push({ role: m.role, content: slice });
        acc += t;
    }
    trimmed.reverse();
    const summaryBlock = (state as any).summary ? `Conversation summary (compressed):\n${(state as any).summary}` : '';
    let diffBlock = '';
    if (diffSummary) {
        const { added = [], modified = [], removed = [], unchangedCount } = diffSummary;
        diffBlock = `Last diff: Added(${added.length}) Modified(${modified.length}) Removed(${removed.length}) Unchanged(${unchangedCount}).`;
    }
    const contextParts: string[] = [];
    if (snapshotSummary) contextParts.push(snapshotSummary);
    if (diffBlock) contextParts.push(diffBlock);
    if (summaryBlock) contextParts.push(summaryBlock);
    return { state, recentMessages: trimmed, extraContext: contextParts.join('\n') };
}
async function maybeSummarize(projectId: string) {
    if (!prismaAvailable || !prisma) return;
    const state = await getConversationState(projectId);
    const total = await prisma.chatMessage.count({ where: { projectId } });
    if (total < 12) return;
    let pivotDate: Date | null = null;
    if ((state as any).lastSummarizedMessageId) {
        const pivot = await prisma.chatMessage.findUnique({ where: { id: (state as any).lastSummarizedMessageId } });
        pivotDate = pivot?.createdAt || null;
    }
    const toCompress = await prisma.chatMessage.findMany({ where: { projectId, ...(pivotDate ? { createdAt: { gt: pivotDate } } : {}) }, orderBy: { createdAt: 'asc' } });
    if (toCompress.length < 14) return;
    const keepRecent = 10;
    const head = toCompress.slice(0, Math.max(0, toCompress.length - keepRecent));
    if (!head.length) return;
    const lastHead = head[head.length - 1];
    const summarizerModel = process.env.SUMMARIZER_MODEL || 'gpt-4o-mini';
    const summaryInput: any = [{ role: 'system', content: 'Summarize the project conversation so far into: Goals; Architecture decisions; Implemented features; Pending TODOs; Rejected/Deferred ideas. <=350 tokens.' }, { role: 'user', content: head.map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 1500)}`).join('\n---\n') }];
    try {
        const summaryResp = await openai.chat.completions.create({ model: summarizerModel, messages: summaryInput as any, temperature: 0.2, max_tokens: 380 });
        const summaryText = (summaryResp as any).choices[0]?.message?.content?.trim();
        if (summaryText) {
            const merged = (state as any).summary ? `${(state as any).summary}\n\n[Update]\n${summaryText}` : summaryText;
            await updateConversationState(projectId, { summary: merged.slice(0, 12000), summaryTokens: estimateTokens(merged), lastSummarizedMessageId: lastHead.id, totalMessages: total });
        }
    } catch (e: any) { console.warn('[AI] summarization failed', e?.message); }
}
// New helper to fetch open project TODOs for prompt context
async function fetchProjectTodos(projectId: string) {
    if (!prismaAvailable || !prisma) return '';
    try {
        const todos = await (prisma as any).projectTodo.findMany({ where: { projectId, status: 'OPEN' }, orderBy: { createdAt: 'asc' }, take: 12 });
        if (!todos.length) return '';
        return 'Open TODOs (keep in mind):\n' + todos.map((t: any, i: number) => `${i + 1}. ${t.text}`).join('\n');
    } catch (e: any) {
        console.warn('[AI] fetchProjectTodos failed', e?.message);
        return '';
    }
}
