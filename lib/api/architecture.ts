import type { Lang } from '@/lib/i18n/config';
import { getContent } from './content';
import type { RequestOptions, Resource } from './request';
import type { Architecture } from './types';
import { parseArchitecture } from './validate-content';

export const ARCHITECTURE: Resource<Architecture> = {
  name: 'Architecture',
  path: '/api/v1/architecture',
  parse: parseArchitecture,
};

/** Read from the API on every render. A valid empty answer is returned as is; anything else unusable throws. */
export async function getArchitecture(lang: Lang, options?: RequestOptions): Promise<{ architecture: Architecture }> {
  return { architecture: await getContent(ARCHITECTURE, lang, options) };
}
