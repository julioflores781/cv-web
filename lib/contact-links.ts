import type { Contact } from '@/lib/api/types';
import { safeHttpUrl } from '@/lib/url';

/** Networks the site is allowed to publish (privacy: email, LinkedIn and GitHub only). */
const PUBLIC_NETWORKS = new Set(['linkedin', 'github']);

export interface PublicProfile {
  network: string;
  href: string;
}

/** LinkedIn/GitHub profiles with a safe http(s) URL, in the API order. Shared by the web contact and the PDF. */
export function publicProfiles(contact: Contact): PublicProfile[] {
  return contact.profiles.flatMap((profile) => {
    if (!PUBLIC_NETWORKS.has(profile.network.trim().toLowerCase())) return [];
    const href = safeHttpUrl(profile.url);
    return href ? [{ network: profile.network, href }] : [];
  });
}
