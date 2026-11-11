import type { Profile } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import styles from './site-footer.module.css';

interface SiteFooterProps {
  profile: Profile;
  dict: Dictionary;
}

export function SiteFooter({ profile, dict }: SiteFooterProps) {
  const city = profile.city?.trim();
  return (
    <footer className={styles.footer} data-probe="footer">
      <div className={`${styles.inner} mono`} data-probe="footer-inner">
        <span>{city ? `${profile.name} · ${city}` : profile.name}</span>
        <span>{dict.footer.built}</span>
      </div>
    </footer>
  );
}
