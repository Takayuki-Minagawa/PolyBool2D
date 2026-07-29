import { create } from 'zustand';
import type { Point } from '../geometry/types';

type ViewportStatusState = {
  cursor: Point | null;
  setCursor: (cursor: Point | null) => void;
};

export const useViewportStatusStore = create<ViewportStatusState>()((set) => ({
  cursor: null,
  setCursor: (cursor) => set({ cursor }),
}));

export function setViewportCursor(cursor: Point | null): void {
  useViewportStatusStore.getState().setCursor(cursor);
}
