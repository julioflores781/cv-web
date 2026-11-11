import type { Lang } from '@/lib/i18n/config';
import { getContent, type ContentOptions } from './content';
import type { Resource } from './request';
import type { ContentSource, Project } from './types';
import { parseProjects } from './validate-content';

export const PROJECTS: Resource<Project[]> = {
  name: 'Projects',
  file: 'projects',
  path: '/api/v1/projects',
  parse: parseProjects,
  isEmpty: (projects) => projects.length === 0,
};

export interface ProjectsResult {
  projects: Project[];
  source: ContentSource;
}

/** The projects: API first, saved copy second, otherwise the build fails. Empty is valid. The first one is the featured case. */
export async function getProjects(lang: Lang, options: ContentOptions = {}): Promise<ProjectsResult> {
  const { data, source } = await getContent(PROJECTS, lang, options);
  return { projects: data, source };
}
