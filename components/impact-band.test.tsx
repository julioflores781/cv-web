import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resumeEs } from '@/tests/fixtures/resume';
import { ImpactBand } from './impact-band';

describe('ImpactBand', () => {
  it('BA-T33: 4 impact items make a strip of 4 cells (value, text); an empty list renders nothing', () => {
    const { container, unmount } = render(<ImpactBand items={resumeEs.impact} label="Impacto" />);
    expect(screen.getByRole('region', { name: 'Impacto' })).toBeInTheDocument();
    const cells = container.querySelectorAll('li');
    expect(cells).toHaveLength(4);
    resumeEs.impact.forEach((item, i) => {
      expect(cells[i]?.querySelector('strong')?.textContent).toBe(item.value);
      expect(cells[i]?.textContent).toContain(item.text);
    });
    unmount();
    expect(render(<ImpactBand items={[]} label="Impacto" />).container.innerHTML).toBe('');
  });
});
