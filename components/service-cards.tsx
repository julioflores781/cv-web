'use client';

import type { Service } from '@/lib/api/types';
import type { Lang } from '@/lib/i18n/config';
import { formatPrice, type PriceLabels } from '@/lib/i18n/price';
import { useRequiredEngagement } from './engagement-provider';
import styles from './service-cards.module.css';

export interface ServiceLabels extends PriceLabels {
  included: string;
  add: string;
}

interface ServiceCardsProps {
  services: readonly Service[];
  lang: Lang;
  labels: ServiceLabels;
}

/** Selectable service blocks. State = the marked mark + border + shadow + text: the accent alone never carries it. */
export function ServiceCards({ services, lang, labels }: ServiceCardsProps) {
  const { picked, toggle } = useRequiredEngagement();
  return (
    <div className={styles.grid}>
      {services.map((service, i) => {
        const on = picked[i] === true;
        return (
          <button
            key={service.id}
            type="button"
            aria-pressed={on}
            className={`${styles.card} ${on ? styles.on : styles.off}`}
            onClick={() => toggle(i)}
            data-probe="service-card"
          >
            <span className={`${styles.top} mono`}>
              <span>{`S-${String(i + 1).padStart(2, '0')}`}</span>
              <span className={on ? styles.tagOn : styles.tagOff}>{on ? labels.included : labels.add}</span>
            </span>
            <span className={`${styles.title} display`} data-probe="service-card-title">
              {service.title}
            </span>
            <span className={styles.summary}>{service.summary}</span>
            <span className={`${styles.price} mono`} data-probe="service-card-price">
              {formatPrice(service.price, lang, labels)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
