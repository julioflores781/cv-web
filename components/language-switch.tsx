import { LANGS, type Lang } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { routePath, type Route } from '@/lib/i18n/routes';
import styles from './language-switch.module.css';

interface LanguageSwitchProps {
  route: Route;
  dict: Dictionary;
}

/** ES / EN: the current language is marked, the other one links to the same page in that language. */
export function LanguageSwitch({ route, dict }: LanguageSwitchProps) {
  return (
    <div className={styles.group} role="group" aria-label={dict.header.langLabel}>
      {LANGS.map((code: Lang) =>
        code === route.lang ? (
          <span key={code} className={`${styles.item} ${styles.current} mono`} aria-current="true" lang={code}>
            {code.toUpperCase()}
          </span>
        ) : (
          <a key={code} className={`${styles.item} mono`} href={routePath({ lang: code, page: route.page })} hrefLang={code} lang={code}>
            {code.toUpperCase()}
          </a>
        ),
      )}
    </div>
  );
}
