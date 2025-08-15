import { describe, it, expect } from 'vitest';
import { applyEnrichmentCreateLimit } from '../src/lib/enrich';

describe('applyEnrichmentCreateLimit', () => {
    it('limits non-preview CREATE entries beyond limit', () => {
        const plan = [
            { action: 'CREATE', path: 'preview.html' },
            { action: 'CREATE', path: 'a.tsx' },
            { action: 'CREATE', path: 'b.tsx' },
            { action: 'CREATE', path: 'c.tsx' },
            { action: 'CREATE', path: 'd.tsx' },
            { action: 'CREATE', path: 'e.tsx' },
            { action: 'UPDATE', path: 'app/page.tsx' }
        ];
        const { plan: limited, removedCreates } = applyEnrichmentCreateLimit(plan as any[], 3);
        expect(limited.map(p => p.path)).toEqual(['preview.html', 'a.tsx', 'b.tsx', 'c.tsx', 'app/page.tsx']);
        expect(removedCreates.sort()).toEqual(['d.tsx', 'e.tsx']);
    });
});
