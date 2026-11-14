import type { Metadata } from 'next';
import { UI } from '@/lib/admin/messages';
import { HistoryPage, type SearchParams } from '../history-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: `${UI.history.title} · ${UI.dashboard.kinds.projects}` };

/** History of the projects: versions, a snapshot with `?v=` and the rollback. */
export default function ProjectsHistoryPage({ searchParams }: { searchParams: SearchParams }) {
  return HistoryPage({ kind: 'projects', searchParams });
}
