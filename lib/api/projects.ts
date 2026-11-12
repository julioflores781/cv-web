import type { Lang } from '@/lib/i18n/config';
import { getContent } from './content';
import type { RequestOptions, Resource } from './request';
import type { Project } from './types';
import { parseProjects } from './validate-content';

export const PROJECTS: Resource<Project[]> = {
  name: 'Projects',
  path: '/api/v1/projects',
  parse: parseProjects,
};

/** Read from the API on every render; the first project is the featured case. A valid empty answer is returned as is; anything else unusable throws. */
export async function getProjects(lang: Lang, options?: RequestOptions): Promise<{ projects: Project[] }> {
  return { projects: await getContent(PROJECTS, lang, options) };
}
