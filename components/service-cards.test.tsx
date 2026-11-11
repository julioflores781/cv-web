import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { servicesEs } from '@/tests/fixtures/content';
import { EngagementProvider } from './engagement-provider';
import { EngagementAside } from './engagement-aside';
import { SelectionLine } from './selection-line';
import { ServiceCards } from './service-cards';

const dict = getDictionary('es');
const labels = { ...dict.services, from: dict.services.priceFrom };

function setup(services = servicesEs.slice(0, 2)) {
  return render(
    <EngagementProvider titles={services.map((service) => service.title)}>
      <ServiceCards services={services} lang="es" labels={labels} />
      <EngagementAside labels={dict.engagement} />
      <SelectionLine label="selección →" none="sin bloques marcados" />
    </EngagementProvider>,
  );
}
const aside = () => screen.getByRole('complementary');
const cards = () => screen.getAllByRole('button');

describe('ServiceCards', () => {
  it('CO-T13: 2 services are 2 button aria-pressed with title (a span: a heading is not valid inside a button), summary, price and S-01 / S-02; the first is «incluido», the second «+ añadir»', () => {
    setup();
    expect(cards()).toHaveLength(2);
    const [first, second] = cards() as [HTMLElement, HTMLElement];
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(second).toHaveAttribute('aria-pressed', 'false');
    expect(first.querySelector('[data-probe="service-card-title"]')?.tagName).toBe('SPAN');
    expect(first).toHaveTextContent('Web de ejemplo');
    expect(first).toHaveTextContent('S-01');
    expect(first).toHaveTextContent('incluido');
    expect(first).toHaveTextContent('Una web ficticia de principio a fin.');
    expect(first.textContent).toMatch(/desde 1500\s€ \+ impuestos/);
    expect(second).toHaveTextContent('S-02');
    expect(second).toHaveTextContent('+ añadir');
    expect(second).toHaveTextContent('a consultar');
  });

  it('CO-T83 (review r1, req. 2): one live region announces the selection change — the aside; the selection line carries none', () => {
    const { container } = setup();
    const live = container.querySelectorAll('[aria-live]');
    expect(live).toHaveLength(1);
    expect(aside().contains(live[0] as Element)).toBe(true);
    expect(container.querySelector('[data-probe="selection-line"]')).not.toBeNull();
  });

  it('CO-T16: pressing a marked service unmarks it and removes it from the aside; pressing it again brings it back', () => {
    setup();
    const [first] = cards() as [HTMLElement];
    expect(within(aside()).getByText('Web de ejemplo')).toBeInTheDocument();
    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'false');
    expect(within(aside()).queryByText('Web de ejemplo')).toBeNull();
    fireEvent.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(within(aside()).getByText('Web de ejemplo')).toBeInTheDocument();
    fireEvent.click(cards()[1] as HTMLElement);
    expect(within(aside()).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Web de ejemplo', 'API de ejemplo']);
  });

  it('CO-T17: with nothing marked the aside shows the «aún no has marcado» text and no empty list', () => {
    setup();
    fireEvent.click(cards()[0] as HTMLElement);
    expect(within(aside()).queryByRole('list')).toBeNull();
    expect(aside()).toHaveTextContent(/Aún no has marcado/);
    expect(within(aside()).getByRole('link', { name: 'Pedir presupuesto' })).toHaveAttribute('href', '#contact');
  });
});
