import type { Lang } from '@/lib/i18n/config';
import { getContent } from './content';
import type { RequestOptions, Resource } from './request';
import type { Service } from './types';
import { parseServices } from './validate-content';

export const SERVICES: Resource<Service[]> = {
  name: 'Services',
  path: '/api/v1/services',
  parse: parseServices,
};

/** Read from the API on every render. A valid empty answer is returned as is; anything else unusable throws. */
export async function getServices(lang: Lang, options?: RequestOptions): Promise<{ services: Service[] }> {
  return { services: await getContent(SERVICES, lang, options) };
}
