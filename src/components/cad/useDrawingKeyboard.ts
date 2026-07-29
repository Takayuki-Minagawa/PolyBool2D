import { useState, type MutableRefObject } from 'react';
import { useAppStore } from '../../app/appStore';
import {
  hasBlockingMenu,
  hasBlockingModal,
  isEditableTarget,
} from '../../app/domGuards';
import { useGlobalShortcutHandler } from '../../app/globalShortcuts';
import {
  parseDrawingDistance,
  pointAtDistance,
} from '../../geometry/drawingInput';

type UseDrawingKeyboardOptions = {
  fitViewToContent: () => void;
  cancelDrawing: () => void;
  clearTransientToolState: () => void;
  shiftKeyRef: MutableRefObject<boolean>;
  spaceKeyRef: MutableRefObject<boolean>;
};

export function useDrawingKeyboard({
  fitViewToContent,
  cancelDrawing,
  clearTransientToolState,
  shiftKeyRef,
  spaceKeyRef,
}: UseDrawingKeyboardOptions) {
  const [numericInput, setNumericInput] = useState('');

  function finishPointSequence(): void {
    const state = useAppStore.getState();
    const preview = state.preview;
    if (preview.type === 'polygon' && preview.points.length >= 3) {
      const created = state.addPolygonFromOuter(preview.points, {
        sourceShape: 'polygon',
        createdByOperation: 'draw',
      });
      state.setPreview({ type: 'none' });
      if (created) state.setActiveTool('select');
    } else if (preview.type === 'hole' && preview.points.length >= 3) {
      const created = state.addHole(preview.entityId, preview.points);
      state.setPreview({ type: 'none' });
      if (created) state.setActiveTool('select');
    } else if (preview.type === 'polyline' && preview.points.length >= 2) {
      const created = state.addLinearEntity(preview.points, 'polyline');
      state.setPreview({ type: 'none' });
      if (created) state.setActiveTool('select');
    } else if (preview.type === 'measure') {
      state.setPreview({ type: 'none' });
    } else if (
      (preview.type === 'linear-dimension' ||
        preview.type === 'angular-dimension') &&
      preview.points.length >= 3
    ) {
      const created = state.addLinearEntity(preview.points, preview.type, {
        precision: preview.type === 'linear-dimension' ? 2 : 1,
        textHeight: 2.5,
      });
      state.setPreview({ type: 'none' });
      if (created) state.setActiveTool('select');
    }
  }

  function commitNumericDistance(distanceValue: number): boolean {
    const state = useAppStore.getState();
    const preview = state.preview;
    if (
      (preview.type === 'polygon' ||
        preview.type === 'hole' ||
        preview.type === 'polyline' ||
        preview.type === 'measure' ||
        preview.type === 'linear-dimension' ||
        preview.type === 'angular-dimension') &&
      preview.cursor
    ) {
      const anchor = preview.points.at(-1);
      const point = anchor
        ? pointAtDistance(anchor, preview.cursor, distanceValue)
        : null;
      if (!point) return false;
      state.setPreview({
        ...preview,
        points: [...preview.points, point],
        cursor: null,
      });
      return true;
    }
    if (preview.type === 'circle') {
      const created = state.addCircle(preview.center, distanceValue);
      state.setPreview({ type: 'none' });
      clearTransientToolState();
      if (created) state.setActiveTool('select');
      return created !== null;
    }
    if (preview.type === 'guide-line') {
      const end = pointAtDistance(
        preview.start,
        preview.cursor,
        distanceValue,
      );
      if (!end) return false;
      const created = state.addLinearEntity([preview.start, end], 'guide');
      state.setPreview({ type: 'none' });
      clearTransientToolState();
      if (created) state.setActiveTool('select');
      return created !== null;
    }
    if (preview.type === 'knife') {
      const end = pointAtDistance(
        preview.start,
        preview.cursor,
        distanceValue,
      );
      const target = state.selectedEntityIds[0];
      if (!end || !target) return false;
      const ok = state.knifeSelected(target, preview.start, end);
      state.setPreview({ type: 'none' });
      clearTransientToolState();
      if (ok) state.setActiveTool('select');
      return ok;
    }
    return false;
  }

  useGlobalShortcutHandler(
    {
      onKeyDown: (event) => {
        if (
          isEditableTarget(event.target) ||
          hasBlockingModal(useAppStore.getState().ui) ||
          hasBlockingMenu()
        ) {
          return false;
        }
        if (event.key === 'Shift') shiftKeyRef.current = true;
        if (event.key === ' ') spaceKeyRef.current = true;
        const drawing = useAppStore.getState().preview.type !== 'none';
        if (
          drawing &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          (/^[0-9]$/.test(event.key) ||
            event.key === '.' ||
            event.key === ',')
        ) {
          event.preventDefault();
          setNumericInput((current) => {
            const key = event.key === ',' ? '.' : event.key;
            if (key === '.' && current.includes('.')) return current;
            return `${current}${key}`;
          });
          return true;
        }
        if (drawing && event.key === 'Backspace') {
          event.preventDefault();
          if (numericInput) {
            setNumericInput((current) => current.slice(0, -1));
          } else {
            const state = useAppStore.getState();
            const current = state.preview;
            if (
              current.type === 'polygon' ||
              current.type === 'hole' ||
              current.type === 'polyline' ||
              current.type === 'measure' ||
              current.type === 'linear-dimension' ||
              current.type === 'angular-dimension'
            ) {
              if (current.points.length <= 1) {
                state.setPreview({ type: 'none' });
              } else {
                state.setPreview({
                  ...current,
                  points: current.points.slice(0, -1),
                  cursor: null,
                });
              }
            }
          }
          return true;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === 'f'
        ) {
          event.preventDefault();
          fitViewToContent();
          return true;
        }
        if (event.key === 'Escape') {
          setNumericInput('');
          cancelDrawing();
          return true;
        }
        if (event.key === 'Enter') {
          if (numericInput) {
            const distanceValue = parseDrawingDistance(numericInput);
            if (distanceValue && commitNumericDistance(distanceValue)) {
              event.preventDefault();
              setNumericInput('');
              return true;
            }
          }
          if (drawing) {
            finishPointSequence();
            return true;
          }
        }
        return false;
      },
      onKeyUp: (event) => {
        if (event.key === 'Shift') shiftKeyRef.current = false;
        if (event.key === ' ') spaceKeyRef.current = false;
        return false;
      },
    },
    20,
  );

  return {
    numericInput,
    resetNumericInput: () => setNumericInput(''),
    shiftKeyRef,
    spaceKeyRef,
  };
}
