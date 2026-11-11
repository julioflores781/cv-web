import type { Project } from '@/lib/api/types';
import { safeHttpUrl } from '@/lib/url';

const clean = (value: string | null): string | null => value?.trim() || null;

/**
 * Who the project was for. A public project names its client (falling back to the description); an anonymous one only ever shows
 * `clientLabel`, even if a real name reaches the component by mistake.
 */
export function clientName(project: Pick<Project, 'disclosure' | 'client' | 'clientLabel'>): string | null {
  const label = clean(project.clientLabel);
  return project.disclosure === 'public' ? (clean(project.client) ?? label) : label;
}

export interface SafeLink {
  label: string;
  href: string;
}

/** The project links that are absolute http(s) URLs, in order; anything else (`javascript:` and co.) is dropped. */
export function safeLinks(links: Project['links']): SafeLink[] {
  return links.flatMap((link) => {
    const href = safeHttpUrl(link.url);
    return href ? [{ label: link.label, href }] : [];
  });
}
