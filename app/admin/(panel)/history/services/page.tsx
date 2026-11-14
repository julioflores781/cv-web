import type { Metadata } from 'next';
import { UI } from '@/lib/admin/messages';
import { HistoryPage, type SearchParams } from '../history-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: `${UI.history.title} · ${UI.dashboard.kinds.services}` };

/** History of the services: versions, a snapshot with `?v=` and the rollback. */
export default function ServicesHistoryPage({ searchParams }: { searchParams: SearchParams }) {
  return HistoryPage({ kind: 'services', searchParams });
}
