import Link from 'next/link';
import { UI } from '@/lib/admin/messages';
import { StatusBanner } from './status-banner';
import form from './form.module.css';
import notice from './notice.module.css';

/** A screen whose data could not be read: a Spanish message, the request id as reference and a retry link. No trace, no URL of the API. */
export function LoadFailure({ text, reference, retryHref }: { text: string; reference: string; retryHref: string }) {
  return (
    <>
      <StatusBanner tone="error" role="alert" reference={reference}>
        {text}
      </StatusBanner>
      <div>
        <Link className={`${form.button} ${notice.action}`} href={retryHref}>
          {UI.unavailable.retry}
        </Link>
      </div>
    </>
  );
}
