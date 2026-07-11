import type { ToolName } from './projectTypes';

export type ToolDefinition = {
  name: ToolName;
  key: string;
  labelKey: string;
  guideKey: string;
};

export type CommandShortcutDefinition = {
  key: string;
  labelKey: string;
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  { name: 'select', key: 'V', labelKey: 'toolbar.select', guideKey: 'status.guideSelect' },
  { name: 'pan', key: 'H', labelKey: 'toolbar.pan', guideKey: 'status.guidePan' },
  { name: 'polygon', key: 'P', labelKey: 'toolbar.polygon', guideKey: 'status.guidePolygon' },
  { name: 'rectangle', key: 'R', labelKey: 'toolbar.rectangle', guideKey: 'status.guideRectangle' },
  { name: 'circle', key: 'C', labelKey: 'toolbar.circle', guideKey: 'status.guideCircle' },
  { name: 'ellipse', key: 'O', labelKey: 'toolbar.ellipse', guideKey: 'status.guideEllipse' },
  { name: 'arc', key: 'A', labelKey: 'toolbar.arc', guideKey: 'status.guideArc' },
  { name: 'polyline', key: 'L', labelKey: 'toolbar.polyline', guideKey: 'status.guidePolyline' },
  { name: 'hole', key: 'U', labelKey: 'toolbar.hole', guideKey: 'status.guideHole' },
  {
    name: 'guide-line',
    key: 'D',
    labelKey: 'toolbar.guideLine',
    guideKey: 'status.guideGuideLine',
  },
  { name: 'measure', key: 'M', labelKey: 'toolbar.measure', guideKey: 'status.guideMeasure' },
  {
    name: 'vertex-edit',
    key: 'E',
    labelKey: 'toolbar.vertexEdit',
    guideKey: 'status.guideVertex-edit',
  },
  { name: 'knife', key: 'K', labelKey: 'toolbar.knife', guideKey: 'status.guideKnife' },
];

/** Non-tool shortcuts shown alongside TOOL_DEFINITIONS in the shortcut modal. */
export const COMMAND_SHORTCUTS: CommandShortcutDefinition[] = [
  { key: 'Enter', labelKey: 'shortcuts.commands.confirmDrawing' },
  { key: 'Esc', labelKey: 'shortcuts.commands.cancelDrawing' },
  { key: 'Delete / Backspace', labelKey: 'shortcuts.commands.deleteSelection' },
  { key: 'Ctrl/⌘ + A', labelKey: 'shortcuts.commands.selectAll' },
  { key: 'Ctrl/⌘ + D', labelKey: 'shortcuts.commands.duplicate' },
  { key: 'Ctrl/⌘ + C', labelKey: 'shortcuts.commands.copy' },
  { key: 'Ctrl/⌘ + X', labelKey: 'shortcuts.commands.cut' },
  { key: 'Ctrl/⌘ + V', labelKey: 'shortcuts.commands.paste' },
  { key: 'Ctrl/⌘ + Z', labelKey: 'shortcuts.commands.undo' },
  { key: 'Ctrl/⌘ + Shift + Z / Ctrl/⌘ + Y', labelKey: 'shortcuts.commands.redo' },
  { key: 'Arrow keys', labelKey: 'shortcuts.commands.nudge' },
  { key: 'Shift + Arrow keys', labelKey: 'shortcuts.commands.fineNudge' },
  { key: 'F', labelKey: 'shortcuts.commands.fit' },
  { key: 'G', labelKey: 'shortcuts.commands.toggleGrid' },
  { key: 'S', labelKey: 'shortcuts.commands.toggleSnap' },
  { key: 'Space + drag', labelKey: 'shortcuts.commands.pan' },
  { key: 'Shift while drawing', labelKey: 'shortcuts.commands.ortho' },
  { key: '0–9, . then Enter', labelKey: 'shortcuts.commands.numericLength' },
  { key: '?', labelKey: 'shortcuts.commands.showShortcuts' },
];

const TOOL_BY_NAME = new Map(TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));
const TOOL_BY_KEY = new Map(TOOL_DEFINITIONS.map((tool) => [tool.key.toLowerCase(), tool]));

export function toolDefinition(tool: ToolName): ToolDefinition {
  const definition = TOOL_BY_NAME.get(tool);
  if (!definition) {
    throw new Error(`Unknown tool: ${tool}`);
  }
  return definition;
}

export function toolForShortcut(key: string): ToolName | null {
  return TOOL_BY_KEY.get(key.toLowerCase())?.name ?? null;
}
