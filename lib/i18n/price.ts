import type { Service } from '@/lib/api/types';
import type { Lang } from './config';

export interface PriceLabels {
  /** Template with `{amount}`: «desde {amount} + impuestos». */
  from: string;
  onRequest: string;
}

/** «desde 1500 € + impuestos» / «from €1,500 + taxes»; `null` is «a consultar». `from: 0` is a price. Never throws. */
export function formatPrice(price: Service['price'], lang: Lang, labels: PriceLabels): string {
  if (price === null) return labels.onRequest;
  let amount: string;
  try {
    amount = new Intl.NumberFormat(lang, { style: 'currency', currency: price.currency, minimumFractionDigits: 0 }).format(price.from);
  } catch {
    amount = `${price.from} ${price.currency}`;
  }
  return labels.from.replace('{amount}', amount);
}
