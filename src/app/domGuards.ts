export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.isContentEditable ||
      element?.closest?.('input, textarea, select, [contenteditable="true"]'),
  );
}

export type ModalUiState = {
  manualOpen: boolean;
  shortcutsOpen: boolean;
  projectManagerOpen: boolean;
};

export function hasBlockingModal(ui: ModalUiState): boolean {
  return ui.manualOpen || ui.shortcutsOpen || ui.projectManagerOpen;
}

/** Context menus remain DOM-local and are the only queried blocking overlay. */
export function hasBlockingMenu(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.querySelector('[role="menu"]') !== null
  );
}
