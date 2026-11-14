import type { ContentKind } from '@/lib/api/admin';

/** The editable documents, in the order the panel shows them (a copy of the API's list, so browser code needs no runtime import of `lib/api`). */
export const KINDS: readonly ContentKind[] = ['services', 'projects', 'architecture'];

/** Pages of each kind: its editor and its history (the Spanish one; the screen switches language with `?lang=`). */
export const KIND_ROUTES: Readonly<Record<ContentKind, { editor: string; history: string }>> = {
  services: { editor: '/admin/services/', history: '/admin/history/services/' },
  projects: { editor: '/admin/projects/', history: '/admin/history/projects/' },
  architecture: { editor: '/admin/architecture/', history: '/admin/history/architecture/' },
};
