import { describe, it, expect } from 'vitest';
import { deriveEnrichmentTargets } from '../src/lib/enrichmentHeuristics';

describe('deriveEnrichmentTargets', () => {
    it('suggests hero component when page large', () => {
        const bigPage = 'x\n'.repeat(130);
        const files = [{ path: 'app/page.tsx', content: bigPage }];
        const out = deriveEnrichmentTargets(files);
        expect(out.some(o => o.path === 'components/Hero.tsx')).toBe(true);
    });
    it('caps suggestions', () => {
        const bigContent = 'line\n'.repeat(300);
        const files = [{ path: 'app/page.tsx', content: bigContent }];
        const out = deriveEnrichmentTargets(files);
        expect(out.length).toBeLessThanOrEqual(4);
    });
    it('suggests contact page when landing copy mentions contact', () => {
        const content = 'Welcome\nContact us via email us at example@example.com for support';
        const files = [{ path: 'app/page.tsx', content }];
        const out = deriveEnrichmentTargets(files);
        expect(out.some(o => o.path === 'app/contact/page.tsx')).toBe(true);
    });
    it('suggests pricing page when pricing keywords present', () => {
        const content = 'Our pricing plans start low. Choose a subscription.';
        const files = [{ path: 'app/page.tsx', content }];
        const out = deriveEnrichmentTargets(files);
        expect(out.some(o => o.path === 'app/pricing/page.tsx')).toBe(true);
    });
    it('suggests about page when mission keywords present', () => {
        const content = 'Our mission is bold. About us: We build things.';
        const files = [{ path: 'app/page.tsx', content }];
        const out = deriveEnrichmentTargets(files);
        expect(out.some(o => o.path === 'app/about/page.tsx')).toBe(true);
    });
});
