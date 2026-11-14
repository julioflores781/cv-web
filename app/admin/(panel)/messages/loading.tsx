import { EditorSkeleton } from '@/components/admin/editor-skeleton';
import { UI } from '@/lib/admin/messages';

/** Skeleton of the messages while the page is read. */
export default function MessagesLoading() {
  return <EditorSkeleton title={UI.messages.title} />;
}
