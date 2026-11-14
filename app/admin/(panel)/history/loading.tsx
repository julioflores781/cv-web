import { EditorSkeleton } from '@/components/admin/editor-skeleton';
import { UI } from '@/lib/admin/messages';

/** Skeleton of the history while its versions are read. */
export default function HistoryLoading() {
  return <EditorSkeleton title={UI.history.title} />;
}
