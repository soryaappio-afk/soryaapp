// GitHub integration utilities (stubs)
// Replace with real GitHub REST API calls using user token.

export interface RepoInitResult { repoFullName: string; created: boolean }
export interface CommitPushResult { commitSha: string; url: string }

export async function ensureRepo(token: string, desiredName: string): Promise<RepoInitResult> {
    // Real flow: GET /user, then POST /user/repos { name } if missing.
    return { repoFullName: `user/${desiredName.toLowerCase().replace(/[^a-z0-9-_]/g, '-')}`, created: true };
}

export async function pushSnapshot(token: string, repoFullName: string, files: { path: string; content: string }[], message: string): Promise<CommitPushResult> {
    // Real flow: create tree, commit, update ref.
    return { commitSha: 'mocksha123', url: `https://github.com/${repoFullName}` };
}
