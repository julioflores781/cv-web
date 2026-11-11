import type { Project } from '@/lib/api/types';
import type { Lang } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { formatPeriod } from '@/lib/i18n/format';
import { clientName, safeLinks } from '@/lib/projects/display';
import { canShowImage } from '@/lib/projects/images';
import { Cta } from './ui/cta';
import styles from './project-featured.module.css';

interface ProjectFeaturedProps {
  project: Project;
  /** Public URL of the screenshot, when the file exists. */
  image: string | undefined;
  lang: Lang;
  dict: Dictionary;
}

/** The featured case (the first project): facts and buttons on the left, stack and optional screenshot on the right. */
export function ProjectFeatured({ project, image, lang, dict }: ProjectFeaturedProps) {
  const badge = project.period ? (project.period.current ? dict.projects.inProduction : formatPeriod(project.period, lang)) : '';
  const role = project.role?.trim();
  const client = clientName(project);
  const links = safeLinks(project.links);
  const screenshot = canShowImage(project) ? image : undefined;
  const hasSide = project.stack.length > 0 || screenshot !== undefined;
  return (
    <article className={styles.featured} data-probe="featured">
      <div className={styles.left} data-probe="featured-left">
        {badge || role ? (
          <div className={`${styles.meta} mono`}>
            {badge ? <span className={styles.badge}>{badge}</span> : null}
            {role ? <span className={styles.role}>{role}</span> : null}
          </div>
        ) : null}
        <h3 className={`${styles.title} display`} data-probe="featured-title">
          {project.title}
        </h3>
        <p className={styles.summary}>{project.summary}</p>
        {client ? <p className={`${styles.client} mono`}>{`${dict.projects.client} · ${client}`}</p> : null}
        {project.highlights.length > 0 ? (
          <ul className={styles.facts} data-probe="featured-facts">
            {project.highlights.map((fact, i) => (
              <li key={`${i}|${fact}`} className={styles.fact}>
                <p className={`${styles.factKey} mono`}>{`h-${String(i + 1).padStart(2, '0')}`}</p>
                <p className={styles.factText}>{fact}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {links.length > 0 ? (
          <div className={styles.actions}>
            {links.map((link, i) => (
              <Cta key={`${i}|${link.href}`} href={link.href} variant={i === 0 ? 'primary' : 'outline'} compact external>
                {link.label}
              </Cta>
            ))}
          </div>
        ) : null}
      </div>
      {hasSide ? (
        <div className={`${styles.side} gridbg`} data-probe="featured-side">
          {project.stack.length > 0 ? (
            <ul className={styles.stack}>
              {project.stack.map((item, i) => (
                <li key={`${i}|${item}`} className={styles.box}>
                  <p className={`${styles.boxKey} mono`}>{dict.projects.stack}</p>
                  <p className={styles.boxName}>{item}</p>
                </li>
              ))}
            </ul>
          ) : null}
          {screenshot ? (
            // eslint-disable-next-line @next/next/no-img-element -- static export with unoptimized images; the file is checked at build time
            <img className={styles.shot} src={screenshot} alt={project.title} width={360} height={640} loading="lazy" />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
