import type { ToolName } from './projectTypes';

export type ToolDefinition = {
  name: ToolName;
  key: string;
  labelKey: string;
  guideKey: string;
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  { name: 'select', key: 'V', labelKey: 'toolbar.select', guideKey: 'status.guideSelect' },
  { name: 'pan', key: 'H', labelKey: 'toolbar.pan', guideKey: 'status.guidePan' },
  { name: 'polygon', key: 'P', labelKey: 'toolbar.polygon', guideKey: 'status.guidePolygon' },
  { name: 'rectangle', key: 'R', labelKey: 'toolbar.rectangle', guideKey: 'status.guideRectangle' },
  { name: 'circle', key: 'C', labelKey: 'toolbar.circle', guideKey: 'status.guideCircle' },
  {
    name: 'vertex-edit',
    key: 'E',
    labelKey: 'toolbar.vertexEdit',
    guideKey: 'status.guideVertex-edit',
  },
  { name: 'knife', key: 'K', labelKey: 'toolbar.knife', guideKey: 'status.guideKnife' },
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
