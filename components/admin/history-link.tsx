import Link from 'next/link';
import type { ContentKind } from '@/lib/api/admin';
import { KIND_ROUTES } from '@/lib/admin/content/kinds';
import { UI } from '@/lib/admin/messages';

/** The way from an editor to the history of its kind (versions, snapshots and rollback). */
export function HistoryLink({ kind }: { kind: ContentKind }) {
  return (
    <p>
      <Link href={KIND_ROUTES[kind].history}>{UI.history.fromEditor(UI.dashboard.kinds[kind])}</Link>
    </p>
  );
}
