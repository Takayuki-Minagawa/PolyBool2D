import { test, expect, type Page } from '@playwright/test';
import type { Entity } from '../src/app/projectTypes';

type Point = { x: number; y: number };

// Exercise the real viewport with small, deterministic scenes. No external
// drawing files or persisted browser state are required.
async function loadFixture(page: Page, variant: 'basic' | 'protected' | 'group' = 'basic') {
  await page.goto('/');
  await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
  await page.evaluate(async (fixture) => {
    const storePath = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => /\/src\/app\/appStore\.ts(?:\?|$)/.test(url))!;
    const factoryPath = '/src/app/projectFactory.ts';
    const { useAppStore } = await import(storePath);
    const { createEmptyProject, createPolygonEntity, createLinearEntity } = await import(factoryPath);
    const state = useAppStore.getState();
    const project = createEmptyProject();
    // Keep the current document ID so auto-fit does not replace our fixed view.
    project.id = state.project.id;
    const rectangle = (id: string, x: number, y: number) => ({
      ...createPolygonEntity({
        outer: [{ x, y }, { x: x + 60, y }, { x: x + 60, y: y + 50 }, { x, y: y + 50 }],
        holes: [],
      }, { name: id }),
      id,
    });
    project.entities = [rectangle('left', 100, 100), rectangle('right', 250, 100)];
    if (fixture === 'group') {
      project.groups = [{ id: 'pair', name: 'Pair', entityIds: ['left', 'right'], visible: true, locked: false }];
    } else {
      project.entities.push({
        ...createLinearEntity([{ x: 50, y: 120 }, { x: 330, y: 120 }], 'polyline'),
        id: 'spanning-line',
      });
    }
    if (fixture === 'protected') {
      project.layers.push(
        { id: 'locked-layer', name: 'Locked', visible: true, locked: true, color: '#888888' },
        { id: 'hidden-layer', name: 'Hidden', visible: false, locked: false, color: '#888888' },
      );
      project.entities.push(
        { ...rectangle('locked-entity', 100, 220), locked: true },
        { ...rectangle('hidden-entity', 180, 220), visible: false },
        { ...rectangle('on-locked-layer', 260, 220), layerId: 'locked-layer' },
        { ...rectangle('on-hidden-layer', 340, 220), layerId: 'hidden-layer' },
        rectangle('kept', 500, 100),
      );
    }
    state.loadProject(project);
    useAppStore.setState({
      activeTool: 'select',
      view: { scale: 1, offsetX: 0, offsetY: 450 },
      ui: { ...useAppStore.getState().ui, snapEnabled: false, showGrid: false },
    });
  }, variant);
  await expect(page.locator('.canvas-wrap > svg')).toBeVisible();
}

async function screenPoint(page: Page, point: Point): Promise<Point> {
  return page.evaluate(async (world) => {
    const storePath = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => /\/src\/app\/appStore\.ts(?:\?|$)/.test(url))!;
    const { view } = (await import(storePath)).useAppStore.getState();
    const bounds = document.querySelector('.canvas-wrap > svg')!.getBoundingClientRect();
    return { x: bounds.left + world.x * view.scale + view.offsetX, y: bounds.top - world.y * view.scale + view.offsetY };
  }, point);
}

async function selection(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const storePath = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => /\/src\/app\/appStore\.ts(?:\?|$)/.test(url))!;
    return [...(await import(storePath)).useAppStore.getState().selectedEntityIds].sort();
  });
}

async function drag(page: Page, from: Point, to: Point, release = true) {
  const start = await screenPoint(page, from);
  const end = await screenPoint(page, to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  if (release) await page.mouse.up();
}

test('left-to-right window selects only completely enclosed entities', async ({ page }) => {
  await loadFixture(page);
  await drag(page, { x: 70, y: 170 }, { x: 280, y: 80 }, false);
  const rectangle = page.locator('[data-selection-mode="window"]');
  await expect(rectangle).toBeVisible();
  await expect(rectangle).toHaveAttribute('stroke', '#2563eb');
  await expect(rectangle).not.toHaveAttribute('stroke-dasharray');
  await expect.poll(() => selection(page)).toEqual([]);
  await page.mouse.up();
  await expect(rectangle).toHaveCount(0);
  await expect.poll(() => selection(page)).toEqual(['left']);
});

test('right-to-left crossing includes partial shapes and lines whose endpoints lie outside', async ({ page }, info) => {
  await loadFixture(page);
  await drag(page, { x: 280, y: 170 }, { x: 70, y: 80 }, false);
  const rectangle = page.locator('[data-selection-mode="crossing"]');
  await expect(rectangle).toBeVisible();
  await expect(rectangle).toHaveAttribute('stroke', '#16a34a');
  await expect(rectangle).toHaveAttribute('stroke-dasharray', '6 4');
  await expect.poll(() => selection(page)).toEqual([]);
  await page.screenshot({ path: info.outputPath('crossing-selection.png') });
  await page.mouse.up();
  await expect(rectangle).toHaveCount(0);
  await expect.poll(() => selection(page)).toEqual(['left', 'right', 'spanning-line']);
});

test('Shift adds a window selection while locked and hidden entities and layers stay excluded', async ({ page }) => {
  await loadFixture(page, 'protected');
  const kept = await screenPoint(page, { x: 530, y: 125 });
  await page.mouse.click(kept.x, kept.y);
  await expect.poll(() => selection(page)).toEqual(['kept']);
  await page.keyboard.down('Shift');
  await drag(page, { x: 70, y: 300 }, { x: 440, y: 80 });
  await page.keyboard.up('Shift');
  await expect.poll(() => selection(page)).toEqual(['kept', 'left', 'right']);
});

test('Escape discards an in-progress selection rectangle and preserves the current selection', async ({ page }) => {
  await loadFixture(page);
  const left = await screenPoint(page, { x: 130, y: 140 });
  await page.mouse.click(left.x, left.y);
  await expect.poll(() => selection(page)).toEqual(['left']);
  await drag(page, { x: 280, y: 170 }, { x: 70, y: 80 }, false);
  await expect(page.locator('[data-selection-mode]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-selection-mode]')).toHaveCount(0);
  await page.mouse.up();
  await expect.poll(() => selection(page)).toEqual(['left']);
  // A later gesture must start normally after cancellation.
  await drag(page, { x: 280, y: 170 }, { x: 70, y: 80 });
  await expect.poll(() => selection(page)).toEqual(['left', 'right', 'spanning-line']);
});

test('pointer cancellation discards the rectangle without applying its selection', async ({ page }) => {
  await loadFixture(page);
  const left = await screenPoint(page, { x: 130, y: 140 });
  await page.mouse.click(left.x, left.y);
  await expect.poll(() => selection(page)).toEqual(['left']);
  await drag(page, { x: 280, y: 170 }, { x: 70, y: 80 }, false);
  await expect(page.locator('[data-selection-mode]')).toBeVisible();
  // Browsers emit pointercancel when a native gesture interrupts capture.
  await page.locator('.canvas-wrap > svg').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
  await expect(page.locator('[data-selection-mode]')).toHaveCount(0);
  await page.mouse.up();
  await expect.poll(() => selection(page)).toEqual(['left']);
  await drag(page, { x: 280, y: 170 }, { x: 70, y: 80 });
  await expect.poll(() => selection(page)).toEqual(['left', 'right', 'spanning-line']);
});

test('a blank click clears selection and a Shift blank click preserves it', async ({ page }) => {
  await loadFixture(page);
  const left = await screenPoint(page, { x: 130, y: 140 });
  const blank = await screenPoint(page, { x: 400, y: 200 });
  await page.mouse.click(left.x, left.y);
  await expect.poll(() => selection(page)).toEqual(['left']);
  await page.keyboard.down('Shift');
  await page.mouse.click(blank.x, blank.y);
  await page.keyboard.up('Shift');
  await expect.poll(() => selection(page)).toEqual(['left']);
  await page.mouse.click(blank.x, blank.y);
  await expect.poll(() => selection(page)).toEqual([]);
});

test('the first drag of an unselected group moves all its members in one undo transaction', async ({ page }) => {
  await loadFixture(page, 'group');
  const geometry = () => page.evaluate(async () => {
    const storePath = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => /\/src\/app\/appStore\.ts(?:\?|$)/.test(url))!;
    const state = (await import(storePath)).useAppStore.getState();
    return {
      origins: state.project.entities.map((entity: Entity) => entity.type === 'polygon' ? entity.geometry.outer[0] : entity.points[0]),
      undoCount: state.history.past.length,
    };
  });
  await expect.poll(() => selection(page)).toEqual([]);
  await drag(page, { x: 130, y: 125 }, { x: 170, y: 155 });
  await expect.poll(() => selection(page)).toEqual(['left', 'right']);
  await expect.poll(geometry).toEqual({ origins: [{ x: 140, y: 130 }, { x: 290, y: 130 }], undoCount: 1 });
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(geometry).toEqual({ origins: [{ x: 100, y: 100 }, { x: 250, y: 100 }], undoCount: 0 });
});

test.describe('native touch selection', () => {
  test.use({ hasTouch: true });

  test('a secondary touch cannot move geometry or cancel the primary selection rectangle', async ({ page, context }) => {
    await loadFixture(page);
    const geometry = () => page.evaluate(async () => {
      const storePath = performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => /\/src\/app\/appStore\.ts(?:\?|$)/.test(url))!;
      const state = (await import(storePath)).useAppStore.getState();
      return {
        entities: state.project.entities,
        undoCount: state.history.past.length,
      };
    });
    const original = await geometry();
    const client = await context.newCDPSession(page);
    const start = await screenPoint(page, { x: 280, y: 170 });
    const end = await screenPoint(page, { x: 70, y: 80 });
    const secondary = await screenPoint(page, { x: 130, y: 140 });
    const secondaryMoved = await screenPoint(page, { x: 140, y: 135 });
    const primaryMoved = await screenPoint(page, { x: 60, y: 70 });
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 1 }] });
    await expect(page.locator('[data-selection-mode="crossing"]')).toBeVisible();
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ ...end, id: 1 }, { ...secondary, id: 2 }],
    });
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ ...end, id: 1 }, { ...secondaryMoved, id: 2 }],
    });
    await expect.poll(() => selection(page)).toEqual([]);
    await expect.poll(geometry).toEqual(original);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ ...primaryMoved, id: 1 }, { ...secondaryMoved, id: 2 }],
    });
    await expect.poll(geometry).toEqual(original);
    // Removing one active contact releases that finger and its implicit capture.
    // CDP touchEnd ends the entire gesture, so keep the primary in a touchMove.
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...primaryMoved, id: 1 }] });
    await expect(page.locator('[data-selection-mode="crossing"]')).toBeVisible();
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('[data-selection-mode]')).toHaveCount(0);
    await expect.poll(() => selection(page)).toEqual(['left', 'right', 'spanning-line']);
    await expect.poll(geometry).toEqual(original);
    await client.detach();
  });
});
