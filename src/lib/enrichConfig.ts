// Enrichment mode configuration scaffold
// Provides mapping from a high-level mode label to pass limits and dynamic adjustments.
// Modes: light (minimal, fast), balanced (default adaptive), aggressive (maximum scaffold for small projects)

export type EnrichmentMode = 'light' | 'balanced' | 'aggressive';

export interface EnrichPassConfig {
    mode: EnrichmentMode;
    maxPasses: number; // hard cap for this run
    rationale: string;
}

interface ResolveArgs {
    existingFileCount: number;
    requestedMode?: string | null;
    envMaxPasses?: number; // direct override (ENRICH_MAX_PASSES)
}

const HARD_CEILING = 4;

export function resolveEnrichmentPassConfig(args: ResolveArgs): EnrichPassConfig {
    const { existingFileCount, requestedMode, envMaxPasses } = args;
    const mode = (requestedMode || 'balanced').toLowerCase() as EnrichmentMode;

    // If explicit env override present, honor (still apply ceiling & basic safety scaling)
    if (envMaxPasses && envMaxPasses > 0) {
        let max = Math.min(envMaxPasses, HARD_CEILING);
        if (existingFileCount >= 10) max = Math.min(max, 1);
        const rationale = `env override ENRICH_MAX_PASSES=${envMaxPasses} -> ${max} (fileCount=${existingFileCount})`;
        return { mode, maxPasses: max, rationale };
    }

    if (mode === 'light') {
        // Always 1 pass unless project extremely tiny & has 0 files (still 1)
        return { mode: 'light', maxPasses: 1, rationale: 'light mode: minimal background cost' };
    }
    if (mode === 'aggressive') {
        // Start high for very small; taper as project grows
        let max = existingFileCount <= 4 ? 4 : existingFileCount <= 7 ? 3 : existingFileCount <= 10 ? 2 : 1;
        if (max > HARD_CEILING) max = HARD_CEILING;
        return { mode: 'aggressive', maxPasses: max, rationale: `aggressive mode adaptive (files=${existingFileCount}) => ${max}` };
    }
    // balanced default
    let max = existingFileCount <= 5 ? 3 : existingFileCount >= 10 ? 1 : 2;
    if (max > HARD_CEILING) max = HARD_CEILING;
    return { mode: 'balanced', maxPasses: max, rationale: `balanced mode adaptive (files=${existingFileCount}) => ${max}` };
}

// Helper to derive a human summary (could be surfaced in routine steps)
export function summarizeConfig(cfg: EnrichPassConfig) {
    return `${cfg.mode} mode: maxPasses=${cfg.maxPasses} (${cfg.rationale})`;
}
