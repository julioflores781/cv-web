import { EditorSkeleton } from '@/components/admin/editor-skeleton';
import { UI } from '@/lib/admin/messages';

/** Skeleton of the projects editor while its content is read. */
export default function ProjectsLoading() {
  return <EditorSkeleton title={UI.projects.title} />;
}
