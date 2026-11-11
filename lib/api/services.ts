import type { Lang } from '@/lib/i18n/config';
import { getContent, type ContentOptions } from './content';
import type { Resource } from './request';
import type { ContentSource, Service } from './types';
import { parseServices } from './validate-content';

export const SERVICES: Resource<Service[]> = {
  name: 'Services',
  file: 'services',
  path: '/api/v1/services',
  parse: parseServices,
  isEmpty: (services) => services.length === 0,
};

export interface ServicesResult {
  services: Service[];
  source: ContentSource;
}

/** The services offered: API first, saved copy second, otherwise the build fails. Empty is valid. */
export async function getServices(lang: Lang, options: ContentOptions = {}): Promise<ServicesResult> {
  const { data, source } = await getContent(SERVICES, lang, options);
  return { services: data, source };
}
