// Pure diff helpers extracted from snapshot diff API for testability
export type FileRecord = { path: string; content: string };
export interface SnapshotDiff {
    created: string[];
    updated: { path: string; beforeExcerpt: string; afterExcerpt: string }[];
    deleted: string[];
}

export function computeSnapshotDiff(prevFiles: FileRecord[] | null, targetFiles: FileRecord[]): SnapshotDiff {
    if (!prevFiles || !prevFiles.length) {
        return {
            created: targetFiles.map(f => f.path),
            updated: [],
            deleted: []
        };
    }
    const prevMap: Record<string, string> = {};
    prevFiles.forEach(f => { prevMap[f.path] = f.content; });
    const targMap: Record<string, string> = {};
    targetFiles.forEach(f => { targMap[f.path] = f.content; });
    const created: string[] = [];
    const updated: { path: string; beforeExcerpt: string; afterExcerpt: string }[] = [];
    const deleted: string[] = [];
    for (const p in targMap) {
        if (!(p in prevMap)) created.push(p); else if (prevMap[p] !== targMap[p]) {
            updated.push({ path: p, beforeExcerpt: prevMap[p].slice(0, 240), afterExcerpt: targMap[p].slice(0, 240) });
        }
    }
    for (const p in prevMap) if (!(p in targMap)) deleted.push(p);
    return { created, updated, deleted };
}
