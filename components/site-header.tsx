import type { Dictionary } from '@/lib/i18n/dictionaries';
import { initials } from '@/lib/i18n/format';
import { routePath, type Route } from '@/lib/i18n/routes';
import { HeaderOffset } from './header-offset';
import { HexMark } from './ui/hex-mark';
import { LanguageSwitch } from './language-switch';
import { ModeToggle } from './mode-toggle';
import styles from './site-header.module.css';

export interface NavLink {
  href: string;
  label: string;
}

interface SiteHeaderProps {
  route: Route;
  name: string;
  /** Only anchors of sections that are rendered. */
  links: NavLink[];
  dict: Dictionary;
}

export function SiteHeader({ route, name, links, dict }: SiteHeaderProps) {
  const home = route.page === 'profile' ? '#inicio' : routePath({ lang: route.lang, page: 'profile' });
  return (
    <header id="site-header" className={styles.header} data-probe="header">
      <HeaderOffset targetId="site-header" />
      <nav className={styles.nav} aria-label={dict.header.navLabel} data-probe="header-nav">
        <a className={styles.logo} href={home} data-probe="logo">
          <HexMark probe="logo-mark">{initials(name)}</HexMark>
          <span className={`${styles.name} display`} data-probe="logo-name">
            {name}
          </span>
        </a>
        <div className={styles.right}>
          {links.map((link) => (
            <a key={link.href} className={`${styles.link} mono`} href={link.href} data-probe="navlinks">
              {link.label}
            </a>
          ))}
          <LanguageSwitch route={route} dict={dict} />
          <ModeToggle route={route} dict={dict} />
        </div>
      </nav>
    </header>
  );
}
