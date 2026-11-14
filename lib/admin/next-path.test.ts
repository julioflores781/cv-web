import { describe, expect, it } from 'vitest';
import { panelPath, safeNext } from './next-path';

describe('safeNext', () => {
  it('T248: keeps a panel path and rejects everything else', () => {
    expect(safeNext('/admin/x/?a=1')).toBe('/admin/x/?a=1');
    expect(safeNext('/admin/')).toBe('/admin/');
    expect(safeNext('/admin')).toBe('/admin');
    const bad = ['//evil.com', '/\\evil', 'https://x', 'javascript:alert(1)', '/admin/../x', '%2F%2Fx', '/%2F%2Fx', '/admin/%2F%2Fx', '/administrator', '/', '', '/admin/\\x', `/admin/${'a'.repeat(520)}`];
    for (const value of bad) expect(safeNext(value), value).toBe('/admin/');
    expect(safeNext(null)).toBe('/admin/');
    expect(safeNext(undefined)).toBe('/admin/');
    expect(safeNext(['/admin/x/'])).toBe('/admin/');
  });

  it('regresion extra: panelPath keeps path and query and drops only the _rsc parameter of client navigations', () => {
    expect(panelPath(new URL('http://x/admin/messages/?before=2&_rsc=1a'))).toBe('/admin/messages/?before=2');
    expect(panelPath(new URL('http://x/admin/?_rsc=1a'))).toBe('/admin/');
    expect(panelPath(new URL('http://x/admin/history/services/?lang=en&v=1'))).toBe('/admin/history/services/?lang=en&v=1');
  });
});
