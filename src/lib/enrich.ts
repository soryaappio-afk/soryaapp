// Helper to enforce enrichment CREATE file limits (excluding preview.html)
export interface PlanEntry { action: string; path: string; note?: string }

export function applyEnrichmentCreateLimit(plan: PlanEntry[], limit = 3) {
    const createIndices: number[] = [];
    plan.forEach((p, idx) => { if (p.action === 'CREATE' && p.path !== 'preview.html') createIndices.push(idx); });
    if (createIndices.length <= limit) return { plan, removedCreates: [] as string[] };
    const toRemove = createIndices.slice(limit);
    const removedCreates: string[] = [];
    const next: PlanEntry[] = plan.filter((_, idx) => {
        if (toRemove.includes(idx)) {
            removedCreates.push(plan[idx].path);
            return false;
        }
        return true;
    });
    return { plan: next, removedCreates };
}
