import type { Lang } from '@/lib/i18n/config';
import { getContent, type ContentOptions } from './content';
import type { Resource } from './request';
import type { Architecture, ContentSource } from './types';
import { parseArchitecture } from './validate-content';

export const ARCHITECTURE: Resource<Architecture> = {
  name: 'Architecture',
  file: 'architecture',
  path: '/api/v1/architecture',
  parse: parseArchitecture,
  isEmpty: (architecture) => architecture.ports.length === 0,
};

export interface ArchitectureResult {
  architecture: Architecture;
  source: ContentSource;
}

/** The hexagon diagram: API first, saved copy second, otherwise the build fails. Empty is valid. */
export async function getArchitecture(lang: Lang, options: ContentOptions = {}): Promise<ArchitectureResult> {
  const { data, source } = await getContent(ARCHITECTURE, lang, options);
  return { architecture: data, source };
}
