// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resumeEn, resumeEs } from '@/tests/fixtures/resume';
import { cacheKey, contentHash } from './cache-key';

function reversed(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversed);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reversed(item)]));
  }
  return value;
}

const keyOf = (lang: 'es' | 'en', resume: unknown) => cacheKey(lang, contentHash(resume));

describe('cacheKey', () => {
  it('T60: the same resume gives the same key whatever the key order, any changed field gives another, and the language is part of it', () => {
    expect(keyOf('es', reversed(resumeEs))).toBe(keyOf('es', resumeEs));
    expect(contentHash(reversed(resumeEs))).toBe(contentHash(resumeEs));

    const changed = { ...resumeEs, profile: { ...resumeEs.profile, summary: `${resumeEs.profile.summary} (editado)` } };
    expect(keyOf('es', changed)).not.toBe(keyOf('es', resumeEs));
    const nested = { ...resumeEs, experience: resumeEs.experience.map((job, index) => (index === 0 ? { ...job, highlights: ['otro'] } : job)) };
    expect(keyOf('es', nested)).not.toBe(keyOf('es', resumeEs));

    expect(keyOf('en', resumeEs)).not.toBe(keyOf('es', resumeEs));
    expect(keyOf('es', resumeEn)).not.toBe(keyOf('es', resumeEs));
  });
});
