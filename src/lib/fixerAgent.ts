import OpenAI from 'openai';

// Minimal fixer agent: given build error + limited recent files, returns patch hints.
export interface FixSuggestion {
    note: string;
    addedFiles: { path: string; content: string }[];
    mutations: { path: string; append: string }[];
}

// Lazy client (avoid throwing during test environments without key)
let openaiClient: OpenAI | null = null;
function getClient(): OpenAI | null {
    if (!process.env.OPENAI_API_KEY) return null;
    if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return openaiClient;
}

export async function suggestFixFromError(projectName: string, errorLine: string | null, files: { path: string; content: string }[]): Promise<FixSuggestion> {
    // Fallback heuristic if no key
    const client = getClient();
    if (!client) {
        return heuristicSuggestion(projectName, errorLine, files);
    }
    try {
        const limited = files.filter(f => /app\/page\.tsx|next\.config|package\.json/i.test(f.path)).slice(0, 6);
        const prompt = [
            'You are a senior build fixer. Given a Next.js project failing to build, propose a minimal safe patch.',
            'Return JSON ONLY with shape {note:string, addedFiles:[{path,content}], mutations:[{path,append}]}.',
            'Constraints: keep changes small, do not delete existing code, prefer appending comments or adding missing config files.',
            `Project: ${projectName}`,
            `Error: ${errorLine || 'unknown'}`,
            'Existing critical files (truncated):',
            ...limited.map(f => `--- ${f.path} ---\n${f.content.slice(0, 600)}`)
        ].join('\n\n');
        const resp: any = await (client as any).chat.completions.create({
            model: process.env.FIXER_MODEL || 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_tokens: 480
        });
        const text = resp.choices?.[0]?.message?.content?.trim();
        if (text && /^\{/.test(text)) {
            try {
                const parsed = JSON.parse(text);
                if (parsed && parsed.note) {
                    return {
                        note: parsed.note.slice(0, 400),
                        addedFiles: Array.isArray(parsed.addedFiles) ? parsed.addedFiles.filter((v: any) => v?.path && v?.content).slice(0, 4) : [],
                        mutations: Array.isArray(parsed.mutations) ? parsed.mutations.filter((v: any) => v?.path && v?.append).slice(0, 6) : []
                    };
                }
            } catch { /* fallthrough */ }
        }
    } catch { /* ignore model issues */ }
    return heuristicSuggestion(projectName, errorLine, files);
}

function heuristicSuggestion(projectName: string, errorLine: string | null, files: { path: string; content: string }[]): FixSuggestion {
    const noteParts: string[] = [];
    const addedFiles: { path: string; content: string }[] = [];
    const mutations: { path: string; append: string }[] = [];
    if (errorLine && /next\/config|next\.config/i.test(errorLine) && !files.some(f => f.path === 'next.config.js')) {
        addedFiles.push({ path: 'next.config.js', content: `// Auto-added by fixer heuristic for ${projectName}\nmodule.exports = { reactStrictMode: true };\n` });
        noteParts.push('Added next.config.js');
    }
    if (errorLine && /module not found/i.test(errorLine)) {
        const page = files.find(f => f.path === 'app/page.tsx');
        if (page) mutations.push({ path: 'app/page.tsx', append: `\n// Fixer note: ensure missing module polyfill (attempt) for ${errorLine.slice(0, 80)}` });
        noteParts.push('Annotated app/page.tsx with missing module hint');
    }
    if (!noteParts.length) noteParts.push('General diagnostic annotation appended.');
    if (!mutations.length) {
        const page = files.find(f => f.path === 'app/page.tsx');
        if (page) mutations.push({ path: 'app/page.tsx', append: `\n// Fixer diagnostic: build failed (${errorLine || 'unknown error'})` });
    }
    return { note: noteParts.join('; '), addedFiles, mutations };
}
