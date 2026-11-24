// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PAGES, allRoutes, alternatesFor, resolveRoute, routePath, routeSlug } from './routes';

describe('routes', () => {
  it('HS-T1 (BA-T1): [], undefined, [perfil], [en] and [en, profile] resolve to the four pages, services at the language root', () => {
    expect(resolveRoute([])).toEqual({ lang: 'es', page: 'services' });
    expect(resolveRoute(undefined)).toEqual({ lang: 'es', page: 'services' });
    expect(resolveRoute(['perfil'])).toEqual({ lang: 'es', page: 'profile' });
    expect(resolveRoute(['en'])).toEqual({ lang: 'en', page: 'services' });
    expect(resolveRoute(['en', 'profile'])).toEqual({ lang: 'en', page: 'profile' });
  });

  it('HS-T2 (BA-T2): the old services slugs, the profile slug in the wrong language or case, unknown languages and extra segments do not exist (and never throw)', () => {
    const slugs = [['servicios'], ['en', 'services'], ['profile'], ['en', 'perfil'], ['Perfil'], ['fr'], ['es'], ['en', 'en'], ['perfil', 'x'], ['en', 'profile', 'x']];
    for (const slug of slugs) {
      expect(() => resolveRoute(slug), slug.join('/')).not.toThrow();
      expect(resolveRoute(slug), slug.join('/')).toBeNull();
    }
  });

  it('HS-T3 (BA-T3): every route has its path and alternates (es, en, x-default = the Spanish path of the same page)', () => {
    expect(routePath({ lang: 'es', page: 'services' })).toBe('/');
    expect(routePath({ lang: 'es', page: 'profile' })).toBe('/perfil/');
    expect(routePath({ lang: 'en', page: 'services' })).toBe('/en/');
    expect(routePath({ lang: 'en', page: 'profile' })).toBe('/en/profile/');
    expect(alternatesFor('services')).toEqual({ es: '/', en: '/en/', 'x-default': '/' });
    expect(alternatesFor('profile')).toEqual({ es: '/perfil/', en: '/en/profile/', 'x-default': '/perfil/' });
  });

  it('HS-T4 (extra of BA-T3): there are exactly 4 routes, routeSlug is the inverse of resolveRoute and PAGES puts services first', () => {
    const routes = allRoutes();
    expect(routes).toHaveLength(4);
    for (const route of routes) expect(resolveRoute(routeSlug(route))).toEqual(route);
    expect(PAGES).toEqual(['services', 'profile']);
  });
});
