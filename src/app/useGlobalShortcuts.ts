import { useGlobalShortcutHandler } from './globalShortcuts';
import { useAppStore } from './appStore';
import {
  hasBlockingMenu,
  hasBlockingModal,
  isEditableTarget,
} from './domGuards';
import { toolForShortcut } from './toolRegistry';

export function useGlobalShortcuts(): void {
  useGlobalShortcutHandler({
    onKeyDown: (event) => {
      if (isEditableTarget(event.target)) return false;
      const state = useAppStore.getState();
      const command = event.metaKey || event.ctrlKey;

      if (state.ui.shortcutsOpen && !command && !event.altKey && event.key === '?') {
        event.preventDefault();
        state.setShortcutsOpen(false);
        return true;
      }
      if (hasBlockingModal(state.ui) || hasBlockingMenu()) return true;
      if (!command && !event.altKey && event.key === '?') {
        event.preventDefault();
        state.setShortcutsOpen(true);
        return true;
      }
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return true;
      }
      if (command && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        state.redo();
        return true;
      }
      if (command && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        state.selectAll();
        return true;
      }
      if (command && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        state.duplicateSelected();
        return true;
      }
      if (command && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        state.copySelected();
        return true;
      }
      if (command && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        state.cutSelected();
        return true;
      }
      if (command && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        state.pasteClipboard();
        return true;
      }
      if (!command && !event.altKey && event.key.startsWith('Arrow')) {
        if (state.selectedEntityIds.length === 0) return false;
        event.preventDefault();
        const step = event.shiftKey
          ? state.project.settings.gridSize / 10
          : state.project.settings.gridSize;
        state.translateEntities(
          state.selectedEntityIds,
          event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0,
          event.key === 'ArrowDown' ? -step : event.key === 'ArrowUp' ? step : 0,
        );
        return true;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.preview.type !== 'none' || state.selectedEntityIds.length === 0) {
          return false;
        }
        event.preventDefault();
        state.removeEntities(state.selectedEntityIds);
        return true;
      }
      if (command) return false;
      const tool = toolForShortcut(event.key);
      if (tool) {
        state.setActiveTool(tool);
        return true;
      }
      if (event.key.toLowerCase() === 'g') {
        state.toggleGrid();
        return true;
      }
      if (event.key.toLowerCase() === 's') {
        state.toggleSnap();
        return true;
      }
      return false;
    },
  });
}
