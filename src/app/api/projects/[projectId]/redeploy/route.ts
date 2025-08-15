// Simple redeploy endpoint re-exporting the main deployment POST handler.
// Keeps UI semantic /redeploy path while sharing logic.
export { POST } from '../deploy/route';
