import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HomeView } from '@/components/home-view';
import { getArchitecture, getConfig, getProjects, getResume, getServices } from '@/lib/api';
import { cvPdfHref } from '@/lib/pdf/files';
import { getCvPdf } from '@/lib/pdf/build-cv-pdf';
import { allRoutes, resolveRoute, routeSlug, type Route } from '@/lib/i18n/routes';
import { resolveProjectImages } from '@/lib/projects/images';
import { buildMetadata } from '@/lib/seo/metadata';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

// Only the 4 routes of `allRoutes()` exist; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams(): Array<{ slug: string[] }> {
  return allRoutes().map((route) => ({ slug: routeSlug(route) }));
}

async function resolve(params: PageProps['params']): Promise<Route> {
  const { slug } = await params;
  return resolveRoute(slug) ?? notFound();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const route = await resolve(params);
  const { resume } = await getResume(route.lang);
  return buildMetadata(resume, route, getConfig().siteUrl);
}

export default async function Page({ params }: PageProps) {
  const route = await resolve(params);
  const [{ resume }, { architecture }, { services }, { projects }] = await Promise.all([
    getResume(route.lang),
    getArchitecture(route.lang),
    getServices(route.lang),
    getProjects(route.lang),
  ]);
  const { siteUrl, apiUrl } = getConfig();
  // The CV PDF is linked from the profile only, and only if it rendered.
  const pdfHref = route.page === 'profile' && (await getCvPdf(route.lang)) ? cvPdfHref(route.lang) : null;
  return (
    <HomeView
      resume={resume}
      architecture={architecture}
      services={services}
      projects={projects}
      projectImages={resolveProjectImages(projects)}
      pdfHref={pdfHref}
      route={route}
      siteUrl={siteUrl}
      apiUrl={apiUrl}
    />
  );
}
