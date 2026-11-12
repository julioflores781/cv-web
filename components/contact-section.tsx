import type { Contact as ContactData } from '@/lib/api/types';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import type { Route } from '@/lib/i18n/routes';
import { Contact } from './contact';
import { ContactForm } from './contact-form';
import { SelectionLine } from './selection-line';

interface ContactSectionProps {
  contact: ContactData;
  route: Route;
  dict: Dictionary;
  index: number;
}

/** The contact section with its form; on the services page the picked blocks show above the links and prefix the message. */
export function ContactSection({ contact, route, dict, index }: ContactSectionProps) {
  const { page, lang } = route;
  const { form } = dict;
  return (
    <Contact
      contact={contact}
      page={page}
      dict={dict}
      index={index}
      selection={page === 'services' ? <SelectionLine label={form.selection} none={form.noSelection} /> : null}
      form={<ContactForm lang={lang} email={contact.email} labels={{ ...form, message: form.message[page] }} />}
    />
  );
}
