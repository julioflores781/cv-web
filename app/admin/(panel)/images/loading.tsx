import { EditorSkeleton } from '@/components/admin/editor-skeleton';
import { UI } from '@/lib/admin/messages';

/** Skeleton of the gallery while the listing is read. */
export default function ImagesLoading() {
  return <EditorSkeleton title={UI.images.title} />;
}
