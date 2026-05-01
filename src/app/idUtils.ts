let counter = 0;

export function makeId(prefix: string): string {
  counter += 1;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${time}-${rand}-${counter}`;
}
