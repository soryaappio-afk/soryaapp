// ensureCoreFiles extracted for testability
export function ensureCoreFiles(files: { path: string; content: string }[], projectName: string, prompt: string) {
    const required: { path: string; build: () => string }[] = [
        {
            path: 'app/page.tsx',
            build: () => `export default function GeneratedPage(){return (<main style={{fontFamily:'system-ui',padding:'2.25rem 2rem',lineHeight:1.55}}><h1 style={{margin:0,fontSize:'2.2rem',background:'linear-gradient(90deg,#6366f1,#8b5cf6)',WebkitBackgroundClip:'text',color:'transparent'}}>${projectName}</h1><p style={{margin:'0.75rem 0 1.5rem',maxWidth:780,color:'#475569'}}>Initial scaffold generated from prompt: ${prompt.replace(/`/g, '\`').slice(0, 140)}</p><section style={{background:'#111827',padding:'1.25rem 1.4rem',border:'1px solid #1e293b',borderRadius:14}}><h2 style={{fontSize:'1.05rem',margin:'0 0 .6rem'}}>Next Steps</h2><ul style={{margin:0,paddingLeft:'1.1rem'}}><li>Refine requirements in chat</li><li>Generate components</li><li>Add styling/theme</li><li>Deploy & iterate</li></ul></section></main>);}`
        },
        {
            path: 'preview.html',
            build: () => `<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'/><title>${projectName} Preview</title><meta name='viewport' content='width=device-width,initial-scale=1'/><style>body{margin:0;font-family:system-ui;background:#0f1115;color:#e2e8f0;line-height:1.55}main{max-width:900px;margin:0 auto;padding:42px 36px}h1{font-size:2.3rem;margin:0 0 1rem;background:linear-gradient(90deg,#6366f1,#8b5cf6);-webkit-background-clip:text;color:transparent}section{background:#111827;padding:22px 26px;border:1px solid #1e293b;border-radius:18px;margin:0 0 26px}</style></head><body><main><h1>${projectName}</h1><p>Auto-generated static preview placeholder created because model omitted preview.html. Continue chatting to enrich.</p><section><h2>Prompt Excerpt</h2><p>${prompt.replace(/</g, '&lt;').slice(0, 180)}</p></section><section><h2>Next Steps</h2><ul><li>Add components & routing</li><li>Implement styles/theme</li><li>Persist data layer</li><li>Redeploy after changes</li></ul></section></main></body></html>`
        }
    ];
    const added: string[] = [];
    for (const r of required) {
        if (!files.some(f => f.path === r.path)) {
            files.push({ path: r.path, content: r.build() });
            added.push(r.path);
        }
    }
    return added;
}
