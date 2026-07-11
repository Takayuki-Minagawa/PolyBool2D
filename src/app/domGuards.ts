export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return (
    element?.tagName === 'INPUT' ||
    element?.tagName === 'TEXTAREA' ||
    element?.tagName === 'SELECT'
  );
}

/** True while keyboard input belongs to a modal dialog or context menu. */
export function hasBlockingOverlay(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.querySelector('[aria-modal="true"], [role="menu"]') !== null
  );
}
