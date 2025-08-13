import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/src/lib/auth';
import { prisma } from '@/src/lib/db';
import { z } from 'zod';

const BodySchema = z.object({ prompt: z.string().min(3) });

function deriveAppName(prompt: string) {
    const base = prompt.split(/[.!?\n]/)[0].slice(0, 40).trim();
    if (!base) return 'App';
    return base.split(/[^a-zA-Z0-9]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || 'App';
}

async function classifyPrompt(prompt: string) {
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
            const hits = m.keywords.filter(k => lower.includes(k)).length;
            const confidence = Math.min(0.5 + hits * 0.1, 0.95);
            return { type: m.tag, confidence };
        }
    }
    return { type: 'Prototype', confidence: 0.4 };
}

export async function POST(req: NextRequest) {
    const session: any = await getServerSession(authOptions as any);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;
    const json = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    const { prompt } = parsed.data;
    // Create project quickly (no credits deducted yet)
    const { type, confidence } = await classifyPrompt(prompt);
    const appName = deriveAppName(prompt);
    const project = await prisma.project.create({ data: { userId, name: appName, type, typeConfidence: confidence } });
    // Store initial user message so project page can kick off generation
    await prisma.chatMessage.create({ data: { userId, projectId: project.id, role: 'user', content: prompt } });
    return NextResponse.json({ projectId: project.id, projectName: project.name, projectType: project.type, typeConfidence: project.typeConfidence });
}
