import type { Project, ProjectImage } from '@/lib/api/types';
import { safeHttpUrl } from '@/lib/url';

/** Only the owner's own, publicly named projects may show a screenshot (an employer's or an anonymous one never does). */
export function canShowImage(project: Pick<Project, 'relation' | 'disclosure'>): boolean {
  return project.relation === 'own' && project.disclosure === 'public';
}

/**
 * The cover of a project: its first image, with the public URL the API composed from the media bucket. Undefined when the project may not show
 * images (privacy, checked again even though the parser already enforces it) or when that first URL is not an absolute https URL without
 * credentials (no http:, javascript:, data:, relative nor protocol-relative sources). There is no fallback to the next image.
 */
export function coverOf(project: Pick<Project, 'relation' | 'disclosure' | 'images'>): ProjectImage | undefined {
  const [first] = project.images;
  if (first === undefined || !canShowImage(project)) return undefined;
  const url = safeHttpUrl(first.url);
  if (url === null) return undefined;
  // https only (decided by Julio): the site is served over https, so a plain http image would be mixed content.
  const { protocol, username, password } = new URL(url);
  return protocol === 'https:' && username === '' && password === '' ? { ...first, url } : undefined;
}
