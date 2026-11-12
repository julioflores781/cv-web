import type { Architecture, Project, Resume, Service } from '@/lib/api/types';
import { getDictionary } from '@/lib/i18n/dictionaries';
import type { Route } from '@/lib/i18n/routes';
import { buildPersonJsonLd } from '@/lib/seo/json-ld';
import { ArchitectureLayers } from './architecture-layers';
import { Cajetin } from './cajetin';
import { ContactSection } from './contact-section';
import { EngagementProvider } from './engagement-provider';
import { Hero } from './hero';
import { buildHexPlane } from './hex-plane-section';
import { ImpactBand } from './impact-band';
import { JsonLd } from './json-ld';
import { Process } from './process';
import { Projects } from './projects';
import { ServicesSection } from './services-section';
import { SiteFooter } from './site-footer';
import { SiteHeader, type NavLink } from './site-header';
import { StackList } from './stack-list';
import { Trajectory } from './trajectory';
import { Cta } from './ui/cta';
import { SectionBody, SectionShell } from './ui/section-shell';
import { SectionHead } from './ui/section-head';

interface HomeViewProps {
  resume: Resume;
  /** The hexagon diagram; without it (or without ports) the hero plane shows its empty state. */
  architecture?: Architecture | null;
  /** Services of the services page; without any the section shows its empty state (no aside, no selection). */
  services?: readonly Service[];
  /** Projects; the first one is the featured case. */
  projects?: readonly Project[];
  /** Project id -> public URL of its screenshot (only files that exist). */
  projectImages?: Readonly<Record<string, string>>;
  /** Public path of the CV PDF; without it (render failed) the download button is omitted. Profile only. */
  pdfHref?: string | null;
  route: Route;
  siteUrl: string;
}

/** One whole page (profile or services, in one language). Pure: all data arrives through props. */
export function HomeView({ resume, architecture = null, services = [], projects = [], projectImages = {}, pdfHref = null, route, siteUrl }: HomeViewProps) {
  const { lang, page } = route;
  const dict = getDictionary(lang);
  const isProfile = page === 'profile';
  const { profile, experience, education } = resume;
  const hasTrajectory =
    isProfile && experience.length + education.education.length + education.certificates.length + education.courses.length > 0;

  // Section numbers follow the sections actually rendered, so they never skip.
  const hasServices = !isProfile && services.length > 0;
  const hasProcess = !isProfile && dict.process !== undefined;
  const numbered = [
    hasTrajectory ? 'trajectory' : null,
    isProfile ? 'architecture' : null,
    isProfile ? null : 'services',
    hasProcess ? 'process' : null,
    'projects',
    'contact',
  ].filter(Boolean);
  const indexOf = (id: string) => numbered.indexOf(id) + 1;

  // Projects and contact always render (projects with an empty state), so both links always resolve.
  const links: NavLink[] = [
    { href: '#projects', label: dict.nav.projects },
    { href: '#contact', label: dict.nav.contact },
  ];
  const body = (
    <>
      <Hero
        profile={profile}
        route={route}
        dict={dict}
        hasExperience={isProfile && experience.length > 0}
        plane={buildHexPlane(architecture, dict)}
      >
        <Cajetin profile={profile} experience={experience} route={route} dict={dict} />
      </Hero>
      {isProfile ? (
        <>
          <ImpactBand items={resume.impact} label={dict.sections.impact} />
          <Trajectory experience={experience} education={education} lang={lang} dict={dict} index={indexOf('trajectory')} />
          <SectionShell id="architecture" labelledBy="architecture-title" alt>
            <SectionHead
              index={indexOf('architecture')}
              label={dict.sections.architecture.label}
              title={dict.sections.architecture.title}
              titleId="architecture-title"
              text={dict.sections.architecture.intro}
            >
              {pdfHref ? (
                <Cta href={pdfHref} variant="outline" compact download size="sm" probe="download-cv">
                  {dict.pdf.button}
                </Cta>
              ) : null}
            </SectionHead>
            <SectionBody frame="boxed">
              <ArchitectureLayers dict={dict} />
              <StackList groups={resume.skills} label={dict.stack.label} />
            </SectionBody>
          </SectionShell>
        </>
      ) : null}
      {!isProfile ? <ServicesSection services={services} lang={lang} dict={dict} index={indexOf('services')} /> : null}
      {hasProcess && dict.process ? <Process process={dict.process} index={indexOf('process')} /> : null}
      <Projects projects={projects} images={projectImages} lang={lang} dict={dict} index={indexOf('projects')} />
      <ContactSection contact={resume.contact} route={route} dict={dict} index={indexOf('contact')} />
    </>
  );

  return (
    <>
      <JsonLd data={buildPersonJsonLd(resume, lang, siteUrl)} />
      <a className="skip-link" href="#main">
        {dict.skip}
      </a>
      <SiteHeader route={route} name={profile.name} links={links} dict={dict} />
      <main id="main">
        {hasServices ? <EngagementProvider titles={services.map((service) => service.title)}>{body}</EngagementProvider> : body}
      </main>
      <SiteFooter profile={profile} dict={dict} />
    </>
  );
}
