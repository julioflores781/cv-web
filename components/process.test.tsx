import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { dictionaries, getDictionary } from '@/lib/i18n/dictionaries';
import { Process } from './process';

describe('Process', () => {
  it('CO-T19: the dictionary with 4 steps is an ol of 4 li numbered 01–04 with title and text', () => {
    const process = getDictionary('es').process;
    expect(process).toBeDefined();
    const { container } = render(<Process process={process as NonNullable<typeof process>} index={2} />);
    const items = container.querySelectorAll('ol > li');
    expect(items).toHaveLength(4);
    items.forEach((item, i) => {
      expect(item.textContent).toContain(`0${i + 1}`);
      expect(item.querySelector('h3')?.textContent).toBe(process?.steps[i]?.title);
      expect(item.querySelector('p')?.textContent).toBe(process?.steps[i]?.text);
    });
    expect(screen.getByText('02 / proceso')).toBeInTheDocument();
  });

  it('CO-T20: ES and EN both have a process of 4 steps without empty strings (or none at all)', () => {
    const processes = Object.values(dictionaries).map((dict) => dict.process);
    expect(processes.every((process) => process === undefined) || processes.every((process) => process !== undefined)).toBe(true);
    for (const process of processes) {
      expect(process?.steps).toHaveLength(4);
      for (const step of process?.steps ?? []) {
        expect(step.title.trim()).not.toBe('');
        expect(step.text.trim()).not.toBe('');
      }
    }
  });
});
