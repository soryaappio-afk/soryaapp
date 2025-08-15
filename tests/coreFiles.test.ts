import { describe, it, expect } from 'vitest';
import { ensureCoreFiles } from '../src/lib/coreFiles';

describe('ensureCoreFiles', () => {
    it('adds missing core files', () => {
        const files: { path: string; content: string }[] = [];
        const added = ensureCoreFiles(files, 'Proj', 'Make something');
        expect(added.sort()).toEqual(['app/page.tsx', 'preview.html']);
        expect(files.find(f => f.path === 'app/page.tsx')!.content.length).toBeGreaterThan(50);
    });
    it('is idempotent when files exist', () => {
        const files: { path: string; content: string }[] = [];
        ensureCoreFiles(files, 'Proj', 'Prompt');
        const firstLen = files.length;
        const addedAgain = ensureCoreFiles(files, 'Proj', 'Prompt');
        expect(addedAgain).toHaveLength(0);
        expect(files.length).toBe(firstLen);
    });
});
