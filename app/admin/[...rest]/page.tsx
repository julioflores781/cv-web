import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Anything under /admin that has no page: the 404 of the panel (so it is rendered inside the panel layout, not the public one). */
export default function UnknownAdminRoute(): never {
  notFound();
}
