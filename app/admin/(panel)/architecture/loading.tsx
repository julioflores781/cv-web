import { EditorSkeleton } from '@/components/admin/editor-skeleton';
import { UI } from '@/lib/admin/messages';

/** Skeleton of the architecture editor while its content is read. */
export default function ArchitectureLoading() {
  return <EditorSkeleton title={UI.architecture.title} />;
}
