import type { ViewTransform } from '../../app/projectTypes';

type Props = {
  width: number;
  height: number;
  view: ViewTransform;
  gridSize: number;
};

export function Grid({ width, height, view, gridSize }: Props) {
  if (gridSize <= 0) return null;
  const stepWorld = gridSize;
  let stepScreen = stepWorld * view.scale;
  let scale = 1;
  while (stepScreen < 8) {
    stepScreen *= 5;
    scale *= 5;
  }
  while (stepScreen > 80) {
    stepScreen /= 5;
    scale /= 5;
  }
  const effectiveStep = stepWorld * scale;

  const startX =
    Math.floor(-view.offsetX / view.scale / effectiveStep) * effectiveStep;
  const endX =
    Math.ceil((width - view.offsetX) / view.scale / effectiveStep) *
    effectiveStep;
  const startY =
    Math.floor(-(height - view.offsetY) / view.scale / effectiveStep) *
    effectiveStep;
  const endY =
    Math.ceil(view.offsetY / view.scale / effectiveStep) * effectiveStep;

  const minorLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const majorLines: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (let x = startX; x <= endX; x += effectiveStep) {
    const sx = x * view.scale + view.offsetX;
    const isMajor = Math.round(x / effectiveStep) % 5 === 0;
    const target = isMajor ? majorLines : minorLines;
    target.push({ x1: sx, y1: 0, x2: sx, y2: height });
  }
  for (let y = startY; y <= endY; y += effectiveStep) {
    const sy = -y * view.scale + view.offsetY;
    const isMajor = Math.round(y / effectiveStep) % 5 === 0;
    const target = isMajor ? majorLines : minorLines;
    target.push({ x1: 0, y1: sy, x2: width, y2: sy });
  }

  const axisX = view.offsetY;
  const axisY = view.offsetX;

  return (
    <g pointerEvents="none">
      <g stroke="var(--cad-grid-color)" strokeWidth={0.5}>
        {minorLines.map((l, i) => (
          <line key={`mi-${i}`} {...l} />
        ))}
      </g>
      <g stroke="var(--cad-grid-major)" strokeWidth={0.7}>
        {majorLines.map((l, i) => (
          <line key={`ma-${i}`} {...l} />
        ))}
      </g>
      <g stroke="var(--cad-axis-color)" strokeWidth={1}>
        <line x1={0} x2={width} y1={axisX} y2={axisX} />
        <line x1={axisY} x2={axisY} y1={0} y2={height} />
      </g>
    </g>
  );
}
