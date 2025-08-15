import { describe, it, expect } from 'vitest';
import { suggestFixFromError } from '../src/lib/fixerAgent';

describe('fixerAgent heuristic fallback', () => {
    it('returns heuristic suggestion when no API key', async () => {
        const res = await suggestFixFromError('Proj', 'Module not found: Cannot resolve "next/config"', [
            { path: 'app/page.tsx', content: 'export default function Page(){return <div/>}' }
        ]);
        expect(res.note.length).toBeGreaterThan(0);
        expect(Array.isArray(res.addedFiles)).toBe(true);
    });
});
