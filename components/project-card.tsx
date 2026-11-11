import type { Project } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { clientName, safeLinks } from '@/lib/projects/display';
import { canShowImage } from '@/lib/projects/images';
import styles from './project-card.module.css';

interface ProjectCardProps {
  project: Project;
  /** Public URL of the screenshot, when the file exists. */
  image: string | undefined;
  dict: Dictionary;
}

/** A secondary project: 16:9 block (screenshot, or mesh with the client / relation), then title, summary, stack and links. */
export function ProjectCard({ project, image, dict }: ProjectCardProps) {
  const screenshot = canShowImage(project) ? image : undefined;
  const label = clientName(project) ?? dict.projects.relation[project.relation];
  const links = safeLinks(project.links);
  return (
    <article className={styles.card} data-probe="card">
      {screenshot ? (
        // eslint-disable-next-line @next/next/no-img-element -- static export with unoptimized images; the file is checked at build time
        <img className={styles.shot} src={screenshot} alt={project.title} width={640} height={360} loading="lazy" />
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
