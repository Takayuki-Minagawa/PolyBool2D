import { create } from 'zustand';
export const useDisplayPreferences = create<{
  printWidths: boolean;
  correctColors: boolean;
}>(() => ({ printWidths: false, correctColors: true }));

/** A display-only adjustment. Project colors and exports are never changed. */
export function displayColor(
  color: string,
  dark: boolean,
  correct: boolean,
): string {
  if (!dark || !correct) return color;
  const value = color.toLowerCase();
  if (value === 'black') return '#e4e8ee';
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value);
  if (!match) return color;
  const hex =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((x) => x + x)
          .join('')
      : match[1];
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 65
    ? '#e4e8ee'
    : color;
}

export function displayStrokeWidth(
  width: number,
  scale: number,
  print: boolean,
): number {
  return print ? width * scale : Math.max(1.25, width * scale);
}
