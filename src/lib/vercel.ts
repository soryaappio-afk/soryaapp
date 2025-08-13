// Vercel service utility (stubbed)
// This centralizes future real Vercel API calls so route handlers only depend on this module.
// Replace mock implementations with real HTTP calls (using fetch) and handle errors / retries.

interface EnsureProjectResult {
    projectId: string; // internal reference (stub uses existing app project id)
    vercelProjectSlug: string;
    created: boolean;
}

export interface VercelDeploymentResult {
    deploymentId: string;
    url: string;
    state: 'BUILDING' | 'READY' | 'ERROR';
}

// In a real implementation we would:
// 1. Check if we have stored a vercelProjectId on our Project record.
// 2. If missing, POST to https://api.vercel.com/v10/projects with name + framework.
// 3. Store returned id/slug on Project.
export async function ensureVercelProject(appProjectId: string, name: string): Promise<EnsureProjectResult> {
    // Mock: just echo back
    return { projectId: appProjectId, vercelProjectSlug: `proj-${appProjectId.slice(0, 8)}`, created: false };
}

// Real deployment would use the /v13/deployments endpoint with files prepared as multipart or JSON.
// Here we just fabricate a URL.
export async function createDeployment(appProjectId: string, files: { path: string; content: string }[]): Promise<VercelDeploymentResult> {
    // Use a timestamp to look pseudo unique.
    const ts = Date.now().toString(36);
    const url = `https://preview.sorya.dev/p/${appProjectId}?d=${ts}`;
    return { deploymentId: `dep_${appProjectId.slice(0, 6)}_${ts}`, url, state: 'READY' };
}
