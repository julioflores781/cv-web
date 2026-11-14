import { getConfig } from '@/lib/api/config';

const hostOf = (value: string): string | null => {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
};

/**
 * Whether a mutating request comes from this site. `Sec-Fetch-Site` of `cross-site` or `same-site` is refused outright (a compromised sibling
 * subdomain is same-site). Then the `Origin` must be one of the hosts this server answers for: `SITE_URL`, `Host` or `X-Forwarded-Host`.
 * Without `Origin` only `Sec-Fetch-Site: same-origin` is accepted; `Origin: null` never is.
 */
export function isSameOrigin(headers: Headers, siteUrl: string = getConfig().siteUrl): boolean {
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') return false;
  const origin = headers.get('origin');
  if (origin === null) return fetchSite === 'same-origin';
  const originHost = hostOf(origin);
  if (originHost === null) return false;
  const allowed = [hostOf(siteUrl), headers.get('host'), headers.get('x-forwarded-host')?.split(',')[0]?.trim()];
  return allowed.some((host) => host !== null && host !== undefined && host !== '' && host.toLowerCase() === originHost.toLowerCase());
}

const mediaType = (headers: Headers): string => (headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

/** A JSON body: the one type a plain HTML form cannot send cross-site. */
export const hasJsonBody = (headers: Headers): boolean => mediaType(headers) === 'application/json';

export const hasMultipartBody = (headers: Headers): boolean => mediaType(headers) === 'multipart/form-data';
