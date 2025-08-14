import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { APP_BUNDLE_JSON_SCHEMA } from '@/src/types/appBundle';

export const dynamic = 'force-dynamic';

const MODEL = 'gpt-5-2025-08-07';

export async function POST(req: NextRequest) {
    try {
        const { brief, runtimeLock } = await req.json();
        if (!brief || typeof brief !== 'string') {
            return new Response(JSON.stringify({ error: 'Invalid brief' }), { status: 400 });
        }
        if (!process.env.OPENAI_API_KEY) {
            return new Response(JSON.stringify({ error: 'OPENAI_API_KEY missing' }), { status: 500 });
        }
        const system = runtimeLock === 'web-standalone' ? `You produce a minimal runnable static web bundle (runtime web-standalone) meeting the brief.` : `You produce a runnable web application bundle meeting the brief and may choose the runtime.`;
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const body: any = {
            model: MODEL,
            input: [
                { role: 'system', content: system },
                { role: 'user', content: `Brief: ${brief}\nReturn ONLY JSON matching the schema.` }
            ],
            response_format: { type: 'json_schema', json_schema: { name: 'AppBundle', schema: APP_BUNDLE_JSON_SCHEMA } },
            temperature: 0.25,
            stream: true,
            max_output_tokens: 1600
        };
        const upstream = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!upstream.ok || !upstream.body) {
            const text = await upstream.text();
            return new Response(JSON.stringify({ error: 'Upstream error', detail: text.slice(0, 400) }), { status: 500 });
        }
        return new Response(upstream.body, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
    } catch (e: any) {
        return new Response(JSON.stringify({ error: 'Server failure', message: e?.message }), { status: 500 });
    }
}
