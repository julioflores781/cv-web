import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { resumeEs } from '@/tests/fixtures/resume';
import { Contact } from './contact';

const dict = getDictionary('es');

describe('Contact', () => {
  it('BA-T39: email as mailto and 2 external networks with rel="noopener noreferrer"; a Twitter network or a javascript: URL gets no link', () => {
    const contact = {
      email: resumeEs.contact.email,
      profiles: [
        ...resumeEs.contact.profiles,
        { network: 'Twitter', url: 'https://twitter.example.test/ada' },
        { network: 'GitHub', url: 'javascript:alert(1)' },
      ],
    };
    const { container } = render(<Contact contact={contact} page="profile" dict={dict} index={3} />);
    expect(screen.getByRole('link', { name: 'ada@example.test' })).toHaveAttribute('href', 'mailto:ada@example.test');
    const external = Array.from(container.querySelectorAll('a[href^="http"]'));
    expect(external.map((a) => a.getAttribute('href'))).toEqual([
      'https://www.linkedin.com/in/ada-ejemplo',
      'https://github.com/ada-ejemplo',
    ]);
    for (const a of external) {
      expect(a).toHaveAttribute('rel', 'noopener noreferrer');
      expect(a).toHaveAttribute('target', '_blank');
    }
    expect(container.innerHTML).not.toMatch(/twitter|javascript:/i);
  });

  it('extra: the section is #contact, shows its number and the page-specific title', () => {
    const { container, unmount } = render(<Contact contact={resumeEs.contact} page="profile" dict={dict} index={3} />);
    expect(container.querySelector('section')).toHaveAttribute('id', 'contact');
    expect(screen.getByText('03 / contacto')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(dict.contact.profile.title);
    unmount();
    render(<Contact contact={{ email: 'ada@example.test', profiles: [] }} page="services" dict={dict} index={1} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(dict.contact.services.title);
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});
