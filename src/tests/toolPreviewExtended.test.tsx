import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DrawingPreview } from '../app/appStore';
import type { ViewTransform } from '../app/projectTypes';
import { ToolPreview } from '../components/cad/ToolPreview';

const view: ViewTransform = { scale: 2, offsetX: 10, offsetY: 20 };

function render(preview: DrawingPreview): string {
  return renderToStaticMarkup(
    <svg>
      <ToolPreview
        preview={preview}
        view={view}
        circleSegments={16}
        unit="mm"
        coordinatePrecision={2}
      />
    </svg>,
  );
}

describe('ToolPreview extended drawing branches', () => {
  it('draws an ellipse with both radii', () => {
    const html = render({
      type: 'ellipse',
      center: { x: 0, y: 0 },
      cursor: { x: 3, y: 4 },
    });

    expect(html).toContain('<ellipse');
    expect(html).toContain('rx="6"');
    expect(html).toContain('ry="8"');
    expect(html).toContain('Rx 3.00 mm × Ry 4.00 mm');
  });

  it('draws a completed arc and shows its radius', () => {
    const html = render({
      type: 'arc',
      center: { x: 0, y: 0 },
      start: { x: 10, y: 0 },
      cursor: { x: 0, y: 10 },
    });

    expect(html).toContain('<path');
    expect(html).toContain('stroke-dasharray="4 3"');
    expect(html).toContain('R 10.00 mm');
  });

  it('draws measurement segments, individual lengths, total and angle', () => {
    const html = render({
      type: 'measure',
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ],
      cursor: { x: 3, y: 4 },
    });

    expect(html).toContain('<path');
    expect(html).toContain('3.00 mm');
    expect(html).toContain('4.00 mm');
    expect(html).toContain('Σ 7.00 mm · ∠ 90.0°');
  });

  it('draws a guide line and shows its length', () => {
    const html = render({
      type: 'guide-line',
      start: { x: 0, y: 0 },
      cursor: { x: 6, y: 8 },
    });

    expect(html).toContain('<line');
    expect(html).toContain('stroke-dasharray="8 5"');
    expect(html).toContain('L 10.00 mm');
  });

  it.each(['hole', 'polyline'] as const)(
    'draws the %s path and its segment dimensions',
    (type) => {
      const points = [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ];
      const cursor = { x: 9, y: 12 };
      const preview: DrawingPreview =
        type === 'hole'
          ? { type, entityId: 'polygon-1', points, cursor }
          : { type, points, cursor };
      const html = render(preview);

      expect(html).toContain('<path');
      expect(html).toContain('5.00 mm');
      expect(html).toContain('10.00 mm');
      expect((html.match(/dimension-hud-text/g) ?? []).length).toBe(2);
    },
  );
});
