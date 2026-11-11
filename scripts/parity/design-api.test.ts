// @vitest-environment node
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseResume } from '@/lib/api/validate';
import { createDesignApi } from './design-api.mjs';

// "mobile"/"móvil" only count as keys: they are legitimate words in prose ("app móvil").
const SENSITIVE_WORD = /phone|tel[eé]fono|\bdni\b|\bnif\b|passport|birth|nacimiento/i;
const SENSITIVE_KEY = new RegExp(`${SENSITIVE_WORD.source}|mobile|m[oó]vil`, 'i');
// 9+ digits allowing single separators (spaces, dots, dashes, parentheses), with an optional leading +.
const PHONE_LIKE = /\+?\d(?:[\s().-]?\d){8,}/;
// ISO dates with a day (YYYY-MM-DD) or numeric dd/mm/yyyy style; periods in the API are YYYY-MM only.
const FULL_DATE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/;

/** Every object key and every string value found in a JSON value. */
function collect(value: unknown, keys: string[] = [], strings: string[] = []): { keys: string[]; strings: string[] } {
  if (typeof value === 'string') strings.push(value);
  else if (Array.isArray(value)) for (const item of value) collect(item, keys, strings);
  else if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      keys.push(key);
      collect(item, keys, strings);
    }
  }
  return { keys, strings };
}

describe('design-api', () => {
  const server = createDesignApi();
  let base = '';

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const get = async (resource: string, lang = 'es') => (await fetch(`${base}/${resource}?lang=${lang}`)).json();

  // RF-T6 (RF-A4)
  it('RF-T6: 6 single-adapter ports, 4 services (4th without price), projects with links and highlights', async () => {
    const architecture = await get('architecture');
    expect(architecture.ports).toHaveLength(6);
    for (const port of architecture.ports) expect(port.adapters).toHaveLength(1);

    const services = await get('services');
    expect(services).toHaveLength(4);
    expect(services[3].price).toBeNull();

    const projects = await get('projects');
    expect(projects.length).toBeGreaterThanOrEqual(1);
    expect(projects[0].links.length).toBeGreaterThan(0);
    expect(projects[0].highlights.length).toBeGreaterThan(0);

    const en = await get('architecture', 'en');
    expect(en.core.name).not.toBe(architecture.core.name);
  });

  // RF-T7 (RF-A4)
  it('RF-T7: no phone, document or birth date in any body, and /resume passes parseResume', async () => {
    for (const lang of ['es', 'en']) {
      for (const resource of ['resume', 'architecture', 'services', 'projects']) {
        const { keys, strings } = collect(await get(resource, lang));
        for (const key of keys) expect(key, `${lang}/${resource} key`).not.toMatch(SENSITIVE_KEY);
        for (const text of strings) {
          expect(text, `${lang}/${resource} value`).not.toMatch(PHONE_LIKE);
          expect(text, `${lang}/${resource} value`).not.toMatch(FULL_DATE);
          expect(text, `${lang}/${resource} value`).not.toMatch(SENSITIVE_WORD);
        }
      }
      const resume = await get('resume', lang);
      expect(Object.keys(resume.contact).sort()).toEqual(['email', 'profiles']);
      expect(parseResume(resume)).not.toBeNull();
    }
  });
});
