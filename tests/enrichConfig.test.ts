import { describe, it, expect } from 'vitest';
import { resolveEnrichmentPassConfig } from '../src/lib/enrichConfig';

describe('resolveEnrichmentPassConfig', () => {
    it('light mode always 1 pass', () => {
        const cfg = resolveEnrichmentPassConfig({ existingFileCount: 0, requestedMode: 'light' });
        expect(cfg.maxPasses).toBe(1);
    });
    it('aggressive mode small project high passes', () => {
        const cfg = resolveEnrichmentPassConfig({ existingFileCount: 3, requestedMode: 'aggressive' });
        expect(cfg.maxPasses).toBeGreaterThanOrEqual(3);
    });
    it('balanced scales down on larger project', () => {
        const cfg = resolveEnrichmentPassConfig({ existingFileCount: 12, requestedMode: 'balanced' });
        expect(cfg.maxPasses).toBe(1);
    });
    it('env override respected but capped', () => {
        const cfg = resolveEnrichmentPassConfig({ existingFileCount: 2, envMaxPasses: 10, requestedMode: 'balanced' });
        expect(cfg.maxPasses).toBeLessThanOrEqual(4);
    });
});
