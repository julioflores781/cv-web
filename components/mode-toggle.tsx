import type { Dictionary } from '@/lib/i18n/dictionaries';
import { PAGES, routePath, type PageId, type Route } from '@/lib/i18n/routes';
import styles from './mode-toggle.module.css';

interface ModeToggleProps {
  route: Route;
  dict: Dictionary;
}

/** Profile / Services switch: links between the two pages, styled as the design's segmented control. */
export function ModeToggle({ route, dict }: ModeToggleProps) {
  return (
    <div className={styles.group} role="group" aria-label={dict.header.modeLabel} data-probe="toggle">
      {PAGES.map((page: PageId) => (
        <a
          key={page}
          className={`${styles.segment} mono`}
          href={routePath({ lang: route.lang, page })}
          aria-current={page === route.page ? 'page' : undefined}
          data-probe="toggle-button"
        >
          {dict.mode[page]}
        </a>
      ))}
    </div>
  );
}
