import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Project } from '@/lib/api/types';

/** Only the owner's own, publicly named projects may show a screenshot (an employer's or an anonymous one never does). */
export function canShowImage(project: Pick<Project, 'relation' | 'disclosure'>): boolean {
  return project.relation === 'own' && project.disclosure === 'public';
}

/** Ids come from the API: only plain slugs are allowed in a file name. */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Convention: `public/projects/<id>.webp`. Returns `project id -> public URL` for the eligible projects whose file exists.
 * Build time only (reads the file system).
 */
export function resolveProjectImages(projects: readonly Project[], publicDir: string = path.join(process.cwd(), 'public')): Record<string, string> {
  const images: Record<string, string> = {};
  for (const project of projects) {
    if (!canShowImage(project) || !SAFE_ID.test(project.id)) continue;
    if (existsSync(path.join(publicDir, 'projects', `${project.id}.webp`))) images[project.id] = `/projects/${project.id}.webp`;
  }
  return images;
}
