import { EditorSkeleton } from '@/components/admin/editor-skeleton';
import { UI } from '@/lib/admin/messages';

/** Skeleton of the services editor while its content is read. */
export default function ServicesLoading() {
  return <EditorSkeleton title={UI.services.title} />;
}
