// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseAdminContent, parseRetryAfter, parseVersionList, parseVersionSnapshot } from './parse';

const lang = (extra: Record<string, unknown> = {}) => ({ version: 1, publishedAt: '2026-11-10T18:02:11Z', source: 'admin', comment: null, content: { services: [] }, ...extra });
const valid = () => ({ kind: 'services', languages: { es: lang(), en: lang() }, parity: { ok: true, differences: [] } });

describe('admin parsers', () => {
  it('T216: content answers without languages, with a negative or non-integer version, a non-object content or no parity are invalid', () => {
    expect(parseAdminContent(valid())).not.toBeNull();
    const broken: unknown[] = [
      { ...valid(), languages: undefined },
      { ...valid(), languages: { es: lang() } },
      { ...valid(), languages: { es: lang({ version: -1 }), en: lang() } },
      { ...valid(), languages: { es: lang({ version: 1.5 }), en: lang() } },
      { ...valid(), languages: { es: lang({ content: [] }), en: lang() } },
      { ...valid(), languages: { es: lang({ content: 'x' }), en: lang() } },
      { ...valid(), languages: { es: lang({ version: 0 }), en: lang() } }, // version 0 must come with a null content
      { ...valid(), languages: { es: lang({ publishedAt: 'yesterday' }), en: lang() } },
      { ...valid(), parity: undefined },
      { ...valid(), parity: { ok: 'yes', differences: [] } },
      { ...valid(), kind: 'resume' },
      null,
      [],
    ];
    for (const raw of broken) expect(parseAdminContent(raw)).toBeNull();
  });

  it('T216: parity differences keep only {path, code}; versions lists and snapshots reject bad shapes', () => {
    const parsed = parseAdminContent({ ...valid(), parity: { ok: false, differences: [{ path: 'a', code: 'PARITY_MISMATCH', extra: 1 }, { path: 3 }] } });
    expect(parsed?.parity).toEqual({ ok: false, differences: [{ path: 'a', code: 'PARITY_MISMATCH' }] });
    expect(parseVersionList({ kind: 'services', lang: 'es', versions: [{ version: 0, active: true, publishedAt: '2026-11-10T18:02:11Z', source: 'admin' }] })).toBeNull();
    expect(parseVersionList({ kind: 'services', lang: 'fr', versions: [] })).toBeNull();
    expect(parseVersionSnapshot({ kind: 'services', lang: 'es', version: 2, active: false, content: null })).toBeNull();
  });

  it('extra (web-admin-history): a snapshot keeps publishedAt, source and comment (null when absent) and rejects them when malformed', () => {
    const base = { kind: 'services', lang: 'es', version: 2, active: false, content: { services: [] } };
    expect(parseVersionSnapshot(base)).toEqual({ ...base, publishedAt: null, source: null, comment: null });
    expect(parseVersionSnapshot({ ...base, publishedAt: '2026-11-10T18:02:11Z', source: 'admin', comment: 'Cambio' })).toMatchObject({ publishedAt: '2026-11-10T18:02:11Z', source: 'admin', comment: 'Cambio' });
    for (const bad of [{ publishedAt: 'ayer' }, { source: 3 }, { comment: {} }]) expect(parseVersionSnapshot({ ...base, ...bad })).toBeNull();
  });

  it('parseRetryAfter keeps whole seconds only', () => {
    expect(parseRetryAfter('900')).toBe(900);
    expect(parseRetryAfter(' 5 ')).toBe(5);
    for (const bad of [undefined, '', '-1', '1.5', 'Wed, 21 Oct 2026 07:28:00 GMT', '99999999999']) expect(parseRetryAfter(bad)).toBeUndefined();
  });
});
