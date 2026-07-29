import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import i18n from '../i18n';
import { useAppStore } from '../app/appStore';
import { createPolygonEntity } from '../app/projectFactory';
import { PropertyPanel } from '../components/layout/PropertyPanel';
import { rectangleToRing } from '../geometry/circle';
import { normalizePolygon } from '../geometry/normalize';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    'value',
  )!.set!;
  setter.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function namedButton(label: string): HTMLButtonElement {
  const button = host!.querySelector(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`Button not found: ${label}`);
  return button as HTMLButtonElement;
}

function textButton(label: string): HTMLButtonElement {
  const button = [...host!.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button as HTMLButtonElement;
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useAppStore.getState().resetProject();
  await i18n.changeLanguage('ja');
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

function renderPanel() {
  act(() => {
    root = createRoot(host!);
    root.render(<PropertyPanel />);
  });
}

describe('PropertyPanel layer manager', () => {
  it('shows workspace extras and underlays for every selection state', () => {
    renderPanel();
    expect(host!.textContent).toContain('グループ・部品・拘束');
    expect(host!.textContent).toContain('下絵画像');

    act(() => {
      useAppStore
        .getState()
        .addRectangle({ x: 0, y: 0 }, { x: 4, y: 2 });
    });

    expect(host!.textContent).toContain('グループ・部品・拘束');
    expect(host!.textContent).toContain('下絵画像');
  });

  it('is visible without a selection and manages layer properties and assignment', () => {
    renderPanel();
    expect(host!.textContent).toContain('レイヤー');
    expect(host!.textContent).toContain('エンティティ');

    act(() => namedButton('レイヤーを追加').click());
    const stateAfterAdd = useAppStore.getState();
    expect(stateAfterAdd.project.layers).toHaveLength(2);
    const added = stateAfterAdd.project.layers[1];
    expect(stateAfterAdd.ui.activeLayerId).toBe(added.id);

    const nameInput = host!.querySelector(
      `input[aria-label="レイヤー名: ${added.name}"]`,
    ) as HTMLInputElement;
    act(() => {
      nameInput.focus();
      setInputValue(nameInput, '構造');
      nameInput.blur();
    });
    expect(useAppStore.getState().project.layers[1].name).toBe('構造');

    act(() => {
      useAppStore.getState().addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 });
    });
    const entityId = useAppStore.getState().selectedEntityIds[0];
    const defaultLayerId = useAppStore.getState().project.layers[0].id;
    const assignment = host!.querySelector(
      'select[aria-label="割当先レイヤー"]',
    ) as HTMLSelectElement;
    act(() => setSelectValue(assignment, defaultLayerId));
    act(() => textButton('選択を割当').click());
    expect(
      useAppStore.getState().project.entities.find((entity) => entity.id === entityId)?.layerId,
    ).toBe(defaultLayerId);

    act(() => namedButton('「Layer 1」を非表示').click());
    expect(useAppStore.getState().project.layers[0].visible).toBe(false);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    act(() => namedButton('「構造」を削除').click());
    expect(useAppStore.getState().project.layers).toHaveLength(1);
  });
});

describe('PropertyPanel section properties', () => {
  it('shows second moments, section moduli, and radii for one polygon', () => {
    act(() => {
      useAppStore
        .getState()
        .addRectangle({ x: 0, y: 0 }, { x: 4, y: 2 });
    });
    renderPanel();

    expect(host!.textContent).toContain('断面性能');
    expect(host!.textContent).toContain('断面二次モーメント Ix2.667 mm⁴');
    expect(host!.textContent).toContain('断面二次モーメント Iy10.667 mm⁴');
    expect(host!.textContent).toContain('断面係数 Zx2.667 mm³');
    expect(host!.textContent).toContain('断面係数 Zy5.333 mm³');
    expect(host!.textContent).toContain('回転半径 rx0.577 mm');
    expect(host!.textContent).toContain('回転半径 ry1.155 mm');
  });
});

describe('PropertyPanel entity outliner', () => {
  it('selects and edits entity name, visibility, lock, and layer', () => {
    act(() => {
      useAppStore.getState().addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 });
      useAppStore.getState().addLayer();
    });
    const state = useAppStore.getState();
    const entity = state.project.entities[0];
    const secondLayer = state.project.layers[1];
    useAppStore.getState().clearSelection();
    renderPanel();

    const nameInput = host!.querySelector(
      `input[aria-label="エンティティ名: ${entity.name}"]`,
    ) as HTMLInputElement;
    act(() => {
      nameInput.focus();
      setInputValue(nameInput, '外壁');
      nameInput.blur();
    });
    expect(useAppStore.getState().project.entities[0].name).toBe('外壁');

    const layerSelect = host!.querySelector(
      'select[aria-label="「外壁」のレイヤー"]',
    ) as HTMLSelectElement;
    act(() => setSelectValue(layerSelect, secondLayer.id));
    expect(useAppStore.getState().project.entities[0].layerId).toBe(secondLayer.id);

    const row = host!.querySelector(`[data-entity-id="${entity.id}"]`) as HTMLDivElement;
    act(() => row.click());
    expect(useAppStore.getState().selectedEntityIds).toEqual([entity.id]);

    act(() => namedButton('「外壁」を非表示').click());
    expect(useAppStore.getState().project.entities[0].visible).toBe(false);
    expect(useAppStore.getState().selectedEntityIds).toEqual([]);

    act(() => namedButton('「外壁」を表示').click());
    act(() => row.click());
    act(() => namedButton('「外壁」をロック').click());
    expect(useAppStore.getState().project.entities[0].locked).toBe(true);
    expect(useAppStore.getState().selectedEntityIds).toEqual([]);
  });

  it.each([
    ['非表示', { visible: false }],
    ['ロック', { locked: true }],
  ] as const)('%sレイヤーへ移動したエンティティの選択を解除する', (_label, layerState) => {
    let entityId = '';
    let targetLayerId = '';
    act(() => {
      entityId = useAppStore.getState().addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 })!.id;
      targetLayerId = useAppStore.getState().addLayer().id;
      useAppStore.getState().updateLayer(targetLayerId, layerState);
    });
    expect(useAppStore.getState().selectedEntityIds).toEqual([entityId]);
    renderPanel();

    const layerSelect = host!.querySelector(
      `[data-entity-id="${entityId}"] select`,
    ) as HTMLSelectElement;
    act(() => setSelectValue(layerSelect, targetLayerId));

    expect(
      useAppStore.getState().project.entities.find((entity) => entity.id === entityId)?.layerId,
    ).toBe(targetLayerId);
    expect(useAppStore.getState().selectedEntityIds).toEqual([]);
    expect(host!.querySelector(`[data-entity-id="${entityId}"]`)?.className).toContain(
      'visible' in layerState && layerState.visible === false ? 'is-hidden' : 'is-locked',
    );
  });
});

describe('PropertyPanel hole vertex editor', () => {
  it('edits, inserts, deletes hole vertices, and removes a whole hole', () => {
    const geometry = normalizePolygon({
      outer: rectangleToRing({ x: 0, y: 0 }, { x: 20, y: 20 }),
      holes: [rectangleToRing({ x: 2, y: 2 }, { x: 8, y: 8 })],
    })!;
    const entity = createPolygonEntity(geometry);
    useAppStore.setState((state) => ({
      project: { ...state.project, entities: [entity] },
      selectedEntityIds: [entity.id],
    }));
    renderPanel();

    expect(host!.textContent).toContain('外周');
    expect(host!.textContent).toContain('穴 1');
    const xInput = host!.querySelector(
      'input[aria-label="穴 1 頂点1 X座標"]',
    ) as HTMLInputElement;
    act(() => {
      xInput.focus();
      setInputValue(xInput, '3');
      xInput.blur();
    });
    const afterCoordinateEdit = useAppStore.getState().project.entities[0];
    expect(afterCoordinateEdit.type).toBe('polygon');
    if (afterCoordinateEdit.type !== 'polygon') throw new Error('Expected polygon');
    expect(afterCoordinateEdit.geometry.holes[0][0].x).toBe(3);

    act(() => namedButton('穴 1 頂点1の後に挿入').click());
    const afterInsert = useAppStore.getState().project.entities[0];
    expect(afterInsert.type === 'polygon' && afterInsert.geometry.holes[0]).toHaveLength(5);

    act(() => namedButton('穴 1 頂点1を削除').click());
    const afterDelete = useAppStore.getState().project.entities[0];
    expect(afterDelete.type === 'polygon' && afterDelete.geometry.holes[0]).toHaveLength(4);

    act(() => textButton('穴を削除').click());
    const afterHoleDelete = useAppStore.getState().project.entities[0];
    expect(afterHoleDelete.type === 'polygon' && afterHoleDelete.geometry.holes).toHaveLength(0);
  });

  it('reformats vertex inputs when coordinate precision changes', () => {
    act(() => {
      useAppStore.getState().addRectangle({ x: 0, y: 0 }, { x: 10, y: 10 });
    });
    renderPanel();
    const xInput = host!.querySelector(
      'input[aria-label="外周 頂点1 X座標"]',
    ) as HTMLInputElement;
    expect(xInput.value).toBe('0.000');

    act(() => useAppStore.getState().updateSettings({ coordinatePrecision: 1 }));

    expect(xInput.value).toBe('0.0');
  });
});
