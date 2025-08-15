// Heuristic functions for enrichment planning (pure & testable)
// Produces suggested plan entries (action/path/note) based on current file set.
export interface EnrichmentPlanEntry { action: 'CREATE' | 'UPDATE'; path: string; note: string }

export function deriveEnrichmentTargets(files: { path: string; content: string }[]): EnrichmentPlanEntry[] {
    const out: EnrichmentPlanEntry[] = [];
    const paths = new Set(files.map(f => f.path));
    const get = (p: string) => files.find(f => f.path === p);
    const page = get('app/page.tsx');
    if (page) {
        const lineCount = page.content.split(/\n/).length;
        // Suggest extracting components if page is large
        if (lineCount > 120 && !paths.has('components/Hero.tsx')) {
            out.push({ action: 'CREATE', path: 'components/Hero.tsx', note: 'Extract hero section from large page for modularity' });
        }
        if (lineCount > 160 && !paths.has('components/FeatureGrid.tsx')) {
            out.push({ action: 'CREATE', path: 'components/FeatureGrid.tsx', note: 'Grid of feature cards separated for reuse' });
        }
        // ROUTING HEURISTICS (light marketing style pages)
        const lower = page.content.toLowerCase();
        // Contact page if keywords present
        if ((/contact us|support|email us|reach out/.test(lower)) && !paths.has('app/contact/page.tsx')) {
            out.push({ action: 'CREATE', path: 'app/contact/page.tsx', note: 'Contact page derived from landing copy keywords' });
        }
        // Pricing page if monetization hints
        if ((/pricing|price plan|pricing plan|plans? starts|subscription/.test(lower)) && !paths.has('app/pricing/page.tsx')) {
            out.push({ action: 'CREATE', path: 'app/pricing/page.tsx', note: 'Pricing page suggested by monetization language' });
        }
        // About page if mission / team oriented language
        if ((/about us|our mission|our team|who we are/.test(lower)) && !paths.has('app/about/page.tsx')) {
            out.push({ action: 'CREATE', path: 'app/about/page.tsx', note: 'About page suggested by company/mission language' });
        }
    }
    // Suggest a layout if multiple components exist but no layout
    const componentCount = files.filter(f => f.path.startsWith('components/') && f.path.endsWith('.tsx')).length;
    if (componentCount >= 2 && !paths.has('components/Layout.tsx')) {
        out.push({ action: 'CREATE', path: 'components/Layout.tsx', note: 'Shared layout (header/footer) wrapper' });
    }
    // Styling: add a global CSS if absent
    if (!paths.has('app/globals.css')) {
        out.push({ action: 'CREATE', path: 'app/globals.css', note: 'Global stylesheet for base variables and resets' });
    }
    // Basic state management example: if no simple store and components > 3
    if (componentCount >= 3 && !paths.has('lib/store.ts')) {
        out.push({ action: 'CREATE', path: 'lib/store.ts', note: 'Lightweight reactive store (prototype)' });
    }
    // Cap to 4 suggestions to avoid runaway growth
    return out.slice(0, 4);
}
