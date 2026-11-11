import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { resumeEs } from '@/tests/fixtures/resume';
import { StackList } from './stack-list';

describe('StackList', () => {
  it('BA-T34: lists only the groups that have keywords; with none the block is not rendered', () => {
    const groups = [...resumeEs.skills, { key: 'empty', name: 'Grupo vacío', keywords: [] }];
    const { container, unmount } = render(<StackList groups={groups} label="stack" />);
    expect(container.querySelectorAll('h3')).toHaveLength(resumeEs.skills.length);
    expect(screen.queryByText('Grupo vacío')).toBeNull();
    for (const group of resumeEs.skills) {
      expect(screen.getByRole('heading', { level: 3, name: group.name })).toBeInTheDocument();
      for (const keyword of group.keywords) expect(screen.getByText(keyword)).toBeInTheDocument();
    }
    unmount();
    expect(render(<StackList groups={[{ key: 'e', name: 'E', keywords: [] }]} label="stack" />).container.innerHTML).toBe('');
    expect(render(<StackList groups={[]} label="stack" />).container.innerHTML).toBe('');
  });
});
