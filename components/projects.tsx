import type { Project } from '@/lib/api/types';
import type { Lang } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { ProjectCard } from './project-card';
import { ProjectFeatured } from './project-featured';
import { EmptyState } from './ui/empty-state';
import { SectionHead } from './ui/section-head';
import { SectionShell } from './ui/section-shell';
import styles from './projects.module.css';

interface ProjectsProps {
  projects: readonly Project[];
  /** Project id -> public URL of its screenshot (only files that exist). */
  images: Readonly<Record<string, string>>;
  lang: Lang;
  dict: Dictionary;
  index: number;
}

/** «NN / proyectos»: the first project is the featured case, the rest are cards. Without projects the section stays, with its empty state. */
export function Projects({ projects, images, lang, dict, index }: ProjectsProps) {
  const [featured, ...others] = projects;
  const { label, title, intro } = dict.sections.projects;
  return (
    <SectionShell id="projects" labelledBy="projects-title" stack={40}>
      <SectionHead row index={index} label={label} title={title} titleId="projects-title" text={intro} />
      {featured ? (
        <>
          <ProjectFeatured project={featured} image={images[featured.id]} lang={lang} dict={dict} />
          {others.length > 0 ? (
            <div className={styles.grid}>
              {others.map((project) => (
                <ProjectCard key={project.id} project={project} image={images[project.id]} dict={dict} />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState>{dict.empty.projects}</EmptyState>
      )}
    </SectionShell>
  );
}
