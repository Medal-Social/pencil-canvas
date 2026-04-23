import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PenViewer } from './PenViewer';

describe('PenViewer', () => {
  it('renders an SVG element', () => {
    const data = [{ id: 'f1', type: 'frame', width: 200, height: 100, fill: '#000', children: [] }];
    const { container } = render(<PenViewer data={data} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders text content', () => {
    const data = [
      {
        id: 'f1',
        type: 'frame',
        width: 200,
        height: 100,
        children: [{ id: 't1', type: 'text', content: 'Hello Pencil', fontSize: 16, fill: '#fff' }],
      },
    ];
    render(<PenViewer data={data} />);
    expect(screen.getByText('Hello Pencil')).toBeInTheDocument();
  });
});
