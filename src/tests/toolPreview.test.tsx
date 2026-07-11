import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DrawingPreview } from '../app/appStore';
import type { ViewTransform } from '../app/projectTypes';
import { ToolPreview } from '../components/cad/ToolPreview';

const view: ViewTransform = { scale: 1, offsetX: 0, offsetY: 0 };

function render(preview: DrawingPreview, precision = 2): string {
  return renderToStaticMarkup(
    <svg>
      <ToolPreview
        preview={preview}
        view={view}
        circleSegments={8}
        unit="mm"
        coordinatePrecision={precision}
      />
    </svg>,
  );
}

describe('ToolPreview dimension HUD', () => {
  it('shows polygon edge length', () => {
    const html = render({
      type: 'polygon',
      points: [{ x: 0, y: 0 }],
      cursor: { x: 3, y: 4 },
    });
    expect(html).toContain('5.00 mm');
  });

  it('shows rectangle width and height', () => {
    const html = render({
      type: 'rectangle',
      start: { x: 0, y: 0 },
      cursor: { x: 30, y: 40 },
      constrainSquare: false,
    }, 1);
    expect(html).toContain('W 30.0 mm × H 40.0 mm');
  });

  it('shows circle radius and knife length', () => {
    expect(render({
      type: 'circle',
      center: { x: 0, y: 0 },
      cursor: { x: 0, y: 10 },
    })).toContain('R 10.00 mm');
    expect(render({
      type: 'knife',
      start: { x: 0, y: 0 },
      cursor: { x: 6, y: 8 },
    })).toContain('L 10.00 mm');
  });
});
