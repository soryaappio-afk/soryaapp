export interface PreviewSections {
  projectName: string;
  prompt: string;
  planLines: string[];
  summary: string;
  proposed: string[];
  pitfalls: string[];
  todos: string[];
  phase?: 'plan' | 'code';
}

function esc(html: string) {
  return html.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
}

export function buildPreviewHtml(data: PreviewSections) {
  const { projectName, prompt, planLines, summary, proposed, pitfalls, todos, phase = 'plan' } = data;
  const badge = phase === 'plan' ? '<span class="badge badge-plan">PLAN DRAFT</span>' : '<span class="badge badge-code">IMPLEMENTED</span>';
  const fmtList = (items: string[], cls: string) => items.length ? `<ul class="list ${cls}">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '<p class="empty">None</p>';
  const planList = fmtList(planLines, 'plan-lines');
  const proposedList = fmtList(proposed, 'proposed');
  const pitfallsList = fmtList(pitfalls, 'pitfalls');
  const todosList = fmtList(todos, 'todos');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${esc(projectName)} Preview</title><meta name="viewport" content="width=device-width,initial-scale=1"/><style>
  :root{--bg:#0f1115;--panel:#111827;--border:#1e293b;--grad:linear-gradient(90deg,#6366f1,#8b5cf6);--text:#f1f5f9;--muted:#94a3b8;--warn:#fbbf24;font-family:system-ui,sans-serif}
  *{box-sizing:border-box}html,body{margin:0;padding:0;background:var(--bg);color:var(--text)}body{line-height:1.5;-webkit-font-smoothing:antialiased}
  main{max-width:1040px;margin:0 auto;padding:44px 40px 120px}
  h1{margin:0 0 1rem;font-size:2.4rem;background:var(--grad);-webkit-background-clip:text;color:transparent;letter-spacing:-1px}
  h2{margin:2.2rem 0 0.75rem;font-size:1.15rem;color:#e2e8f0;letter-spacing:.5px;text-transform:uppercase;font-weight:600}
  p{margin:.4rem 0 1rem;max-width:880px}
  section{background:var(--panel);border:1px solid var(--border);padding:22px 26px;border-radius:18px;position:relative}
  section + section{margin-top:22px}
  .grid{display:grid;gap:26px;margin-top:2.2rem}
  @media(min-width:900px){.grid{grid-template-columns:repeat(2,1fr)}}
  ul.list{list-style:disc;margin:0;padding-left:1.1rem;font-size:.85rem;line-height:1.45}
  ul.list li{margin:.3rem 0}
  .columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px;margin-top:24px}
  .badge{display:inline-block;font-size:.6rem;letter-spacing:.1em;padding:4px 8px;border-radius:40px;background:#1e293b;color:var(--muted);vertical-align:middle;margin-left:.75rem}
  .badge-plan{background:#1e293b;color:#38bdf8}
  .badge-code{background:#1e293b;color:#a3e635}
  header.desc{margin-bottom:1.2rem}
  .meta{font-size:.65rem;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;margin-top:2px}
  .pill{background:#1e293b;border:1px solid #243045;border-radius:999px;padding:4px 10px;font-size:.6rem;letter-spacing:.05em;margin:4px 4px 0 0;display:inline-block}
  code.inline{background:#1e293b;padding:2px 6px;border-radius:6px;font-size:.75rem}
  .empty{font-size:.75rem;color:var(--muted);font-style:italic}
  footer.note{margin-top:40px;font-size:.65rem;color:var(--muted);text-align:center;opacity:.7}
  .two-col{display:grid;gap:28px;margin-top:28px}@media(min-width:1100px){.two-col{grid-template-columns:1fr 1fr}}
  .plan-lines li{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .warning{background:#422006;color:#fcd34d;padding:8px 12px;border-radius:10px;font-size:.7rem;margin-top:10px;border:1px solid #713f12}
  .phase-ribbon{position:fixed;top:10px;right:10px;font-size:.6rem;padding:6px 10px;border-radius:12px;background:#1e293b;border:1px solid #334155;color:var(--muted);backdrop-filter:blur(6px)}
  </style></head><body><div class="phase-ribbon">${phase === 'plan' ? 'Plan Draft' : 'Implemented'}</div><main>
  <header class="desc"><h1>${esc(projectName)} ${badge}</h1><p>${esc(summary || 'No summary')}</p><div class="meta">Prompt seed: ${esc(prompt.slice(0, 160))}</div></header>
  <section><h2>File Plan</h2>${planList}</section>
  <div class="grid">
    <section><h2>Proposed Changes</h2>${proposedList}</section>
    <section><h2>Potential Pitfalls</h2>${pitfallsList}</section>
  </div>
  <section><h2>Next TODOs</h2>${todosList}</section>
  <footer class="note">Synthetic preview • Phase: ${phase}</footer>
  </main></body></html>`;
}

// Build an immediate "final result" style static site mock (hero + sections) so user sees an approximate end state.
export function buildSiteMockHtml(data: PreviewSections & { features?: string[] }) {
  const { projectName, prompt, planLines, summary, todos, features } = data;
  const feats = (features && features.length ? features : planLines.map(l => l.replace(/^(CREATE|UPDATE|DELETE)\s+/i, '').split(/\s/)[0])).slice(0, 6);
  const featItems = feats.map(f => `<div class="card"><h3>${esc(f.replace(/[`<>]/g, ''))}</h3><p>${esc('Implements ' + f.replace(/[._/]/g, ' ') + ' functionality.')}</p></div>`).join('\n');
  const todoList = todos && todos.length ? todos.slice(0, 4).map(t => `<li>${esc(t)}</li>`).join('') : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
  <title>${esc(projectName)} – Preview</title><meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
  :root { --bg:#0b0f17; --panel:#111b27; --border:#1e2b3a; --grad:linear-gradient(90deg,#6366f1,#8b5cf6); --rad:22px; --text:#e2e8f0; font-family:system-ui,sans-serif; }
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);line-height:1.55;-webkit-font-smoothing:antialiased}
  header.hero{padding:64px 28px 40px;max-width:1080px;margin:0 auto}
  h1{margin:0 0 18px;font-size:3rem;background:var(--grad);-webkit-background-clip:text;color:transparent;letter-spacing:-1px}
  p.lead{margin:0 0 30px;font-size:1.1rem;max-width:820px;color:#93adc6}
  .cards{display:grid;gap:22px;padding:0 28px 70px;max-width:1080px;margin:0 auto;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
  .card{background:var(--panel);border:1px solid var(--border);padding:18px 20px;border-radius:18px;position:relative;overflow:hidden}
  .card:before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 30% 20%,rgba(255,255,255,0.05),transparent 70%)}
  .card h3{margin:0 0 8px;font-size:1rem;letter-spacing:.5px}
  footer{padding:38px 28px;font-size:.7rem;text-align:center;opacity:.5}
  section.todos{max-width:1080px;margin:0 auto 70px;background:var(--panel);border:1px solid var(--border);padding:24px 26px;border-radius:var(--rad)}
  section.todos h2{margin:0 0 12px;font-size:1rem;letter-spacing:.05em;text-transform:uppercase}
  ul.todo{list-style:disc;padding-left:1.2rem;margin:0}
  </style></head><body>
  <header class="hero">
    <h1>${esc(projectName)}</h1>
    <p class="lead">${esc(summary || prompt.slice(0, 160))}</p>
  </header>
  <div class="cards">${featItems}</div>
  ${todoList ? `<section class="todos"><h2>Focus Areas</h2><ul class="todo">${todoList}</ul></section>` : ''}
  <footer>Static draft preview.</footer>
  </body></html>`;
}

export function parsePlanSections(text: string) {
  const planMatch = text.match(/File Plan:\n([\s\S]*?)(?:\n\n1\)|\n1\)|$)/i);
  const planLines = planMatch ? planMatch[1].split('\n').map(l => l.trim()).filter(Boolean) : [];
  const secMatch = text.match(/\n1\)\s*Summary[\s\S]*/i);
  let summary = ''; let proposedRaw = ''; let pitfallsRaw = ''; let todosRaw = '';
  if (secMatch) {
    const blocks = text.split(/\n(?=[1-4]\))/).slice(1);
    for (const b of blocks) {
      if (/^1\)/.test(b)) summary = b.replace(/^1\)\s*Summary of intent\s*/i, '').trim();
      else if (/^2\)/.test(b)) proposedRaw = b.replace(/^2\)\s*Proposed changes.*\n?/i, '').trim();
      else if (/^3\)/.test(b)) pitfallsRaw = b.replace(/^3\)\s*Potential pitfalls\s*/i, '').trim();
      else if (/^4\)/.test(b)) todosRaw = b.replace(/^4\)\s*Next TODO bullets\s*/i, '').trim();
    }
  }
  const bulletize = (raw: string) => raw.split(/\n|\r/).map(l => l.replace(/^[-*+]\s*/, '').trim()).filter(l => l.length > 0).slice(0, 40);
  return { planLines, summary, proposed: bulletize(proposedRaw), pitfalls: bulletize(pitfallsRaw), todos: bulletize(todosRaw) };
}
