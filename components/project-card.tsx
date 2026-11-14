import type { Project } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { clientName, safeLinks } from '@/lib/projects/display';
import { coverOf } from '@/lib/projects/images';
import styles from './project-card.module.css';

interface ProjectCardProps {
  project: Project;
  dict: Dictionary;
}

/** A secondary project: 16:9 block (its cover, or mesh with the client / relation), then title, summary, stack and links. */
export function ProjectCard({ project, dict }: ProjectCardProps) {
  const cover = coverOf(project);
  const label = clientName(project) ?? dict.projects.relation[project.relation];
  const links = safeLinks(project.links);
  return (
    <article className={styles.card} data-probe="card">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element -- images are unoptimized: the cover is served as is from the media bucket
        <img
          className={styles.shot}
          src={cover.url}
          alt={cover.alt.trim() || project.title}
          width={cover.width}
          height={cover.height}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className={`${styles.block} mono gridbg`}>{label}</div>
      )}
      <div className={styles.body} data-probe="card-body">
        <h3 className={`${styles.title} display`} data-probe="card-title">
          {project.title}
        </h3>
        <p className={styles.summary}>{project.summary}</p>
        {project.stack.length > 0 ? <p className={`${styles.stack} mono`}>{project.stack.join(' · ')}</p> : null}
        {links.length > 0 ? (
          <p className={`${styles.links} mono`}>
            {links.map((link, i) => (
              <a key={`${i}|${link.href}`} className={styles.link} href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            ))}
          </p>
        ) : null}
      </div>
    </article>
  );
}
