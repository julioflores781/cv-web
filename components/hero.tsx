import type { ReactNode } from 'react';
import type { Profile } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { formatCountry } from '@/lib/i18n/format';
import type { Route } from '@/lib/i18n/routes';
import { Cta } from './ui/cta';
import { Eyebrow } from './ui/eyebrow';
import styles from './hero.module.css';

interface HeroProps {
  profile: Profile;
  route: Route;
  dict: Dictionary;
  /** Profile page only: «Ver trayectoria» needs the experience section to exist. */
  hasExperience: boolean;
  /** Services page only: «Ver proyectos» needs the projects section to exist. */
  hasProjects?: boolean;
  /** The hexagonal plane (right column). Without it the hero has a single column (design deviation D4). */
  plane?: ReactNode;
  /** The cajetin, drawn as the bottom strip of the hero. */
  children?: ReactNode;
}

export function Hero({ profile, route, dict, hasExperience, hasProjects = false, plane = null, children }: HeroProps) {
  const isProfile = route.page === 'profile';
  const country = formatCountry(profile.countryCode, route.lang);
  const eyebrow = isProfile ? [profile.label, country].filter(Boolean).join(' · ') : dict.hero.services.eyebrow;
  const lead = isProfile ? profile.summary?.trim() || profile.tagline?.trim() : dict.hero.services.lead;
  return (
    <section id="inicio" className={`${styles.hero} gridbg`} data-probe="hero">
      <div className={styles.inner} data-probe="hero-inner" data-columns={plane ? 2 : 1}>
        <div className={styles.copy}>
          <Eyebrow probe="eyebrow">{eyebrow}</Eyebrow>
          <h1 className={`${styles.title} display`} data-probe="h1">
            {isProfile ? dict.hero.profile.h1 : dict.hero.services.h1}
          </h1>
          {lead ? (
            <p className={styles.lead} data-probe="lead">
              {lead}
            </p>
          ) : null}
          <div className={styles.actions}>
            <Cta href="#contact" probe="cta">
              {isProfile ? dict.hero.profile.cta : dict.hero.services.cta}
            </Cta>
            {isProfile && hasExperience ? (
              <Cta href="#experience" variant="outline" probe="cta-secondary">
                {dict.hero.profile.trajectoryCta}
              </Cta>
            ) : null}
            {!isProfile && hasProjects ? (
              <Cta href="#projects" variant="outline" probe="cta-secondary">
                {dict.hero.services.projectsCta}
              </Cta>
            ) : null}
          </div>
        </div>
        {plane}
      </div>
      {children}
    </section>
  );
}
