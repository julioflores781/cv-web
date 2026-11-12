import type { Service } from '@/lib/api/types';
import type { Lang } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { EngagementAside } from './engagement-aside';
import { ServiceCards } from './service-cards';
import { EmptyState } from './ui/empty-state';
import { SectionHead } from './ui/section-head';
import { SectionShell } from './ui/section-shell';
import styles from './services-section.module.css';

interface ServicesSectionProps {
  services: readonly Service[];
  lang: Lang;
  dict: Dictionary;
  index: number;
}

/**
 * «01 / servicios»: selectable blocks plus the «Tu encargo» aside (these need the `EngagementProvider` above them).
 * Without services only the head and the empty state render, so no provider is needed.
 */
export function ServicesSection({ services, lang, dict, index }: ServicesSectionProps) {
  const { label, title, intro } = dict.sections.services;
  return (
    <SectionShell id="services" labelledBy="services-title" stack={40}>
      <SectionHead row index={index} label={label} title={title} titleId="services-title" text={intro} />
      {services.length > 0 ? (
        <div className={styles.layout}>
          <ServiceCards services={services} lang={lang} labels={{ ...dict.services, from: dict.services.priceFrom }} />
          <EngagementAside labels={dict.engagement} />
        </div>
      ) : (
        <EmptyState>{dict.empty.services}</EmptyState>
      )}
    </SectionShell>
  );
}
