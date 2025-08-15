import { describe, it, expect } from 'vitest';
import { computeSnapshotDiff } from '../src/lib/diff';

describe('computeSnapshotDiff', () => {
    it('treats all as created when no previous', () => {
        const diff = computeSnapshotDiff(null, [
            { path: 'a.ts', content: '1' },
            { path: 'b.ts', content: '2' }
        ]);
        expect(diff.created.sort()).toEqual(['a.ts', 'b.ts']);
        expect(diff.updated).toHaveLength(0);
        expect(diff.deleted).toHaveLength(0);
    });
    it('detects created, updated, deleted', () => {
        const prev = [
            { path: 'keep.ts', content: 'same' },
            { path: 'old.ts', content: 'old' },
            { path: 'remove.ts', content: 'x' }
        ];
        const target = [
            { path: 'keep.ts', content: 'same' },
            { path: 'old.ts', content: 'new content' },
            { path: 'new.ts', content: 'fresh' }
        ];
        const diff = computeSnapshotDiff(prev, target);
        expect(diff.created).toEqual(['new.ts']);
        expect(diff.updated.map(u => u.path)).toEqual(['old.ts']);
        expect(diff.deleted).toEqual(['remove.ts']);
    });
});
