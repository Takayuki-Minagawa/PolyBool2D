import { useMemo, useState } from 'react';
import { useAppStore } from '../../app/appStore';
import { cleanDrawingLines } from '../../geometry/lineCleanup';
import { touchProject } from '../../app/store/helpers';
import { TaskDialog, useText } from '../common/TaskDialog';

export function LineCleanupDialog({ onClose }: { onClose: () => void }) {
  const project = useAppStore((s) => s.project);
  const text = useText();
  const [join, setJoin] = useState(false);
  const result = useMemo(
    () => cleanDrawingLines(project, join),
    [project, join],
  );
  const changedIds = useMemo(() => new Set(result.changedIds), [result]);
  return (
    <TaskDialog
      title={text('重複線・連続線の整理', 'Clean up drawing lines')}
      onClose={onClose}
    >
      <p>
        {text(
          '同一レイヤー・表示属性・グループの完全重複ポリラインを削除します。ロック中・拘束付きの線は保持します。',
          'Remove exactly duplicate polylines with matching layer, style and group. Locked and constrained lines are retained.',
        )}
      </p>
      <label>
        <input
          type="checkbox"
          checked={join}
          onChange={(e) => setJoin(e.target.checked)}
        />
        {text(
          '分岐のない連続線も連結（実線のみ）',
          'Also join unbranched connected solid lines',
        )}
      </label>
      <p>
        {project.entities.length.toLocaleString()} →{' '}
        {result.entities.length.toLocaleString()} {text('要素', 'entities')}
      </p>
      <p>
        {text(
          `重複 ${result.removed} / 連結 ${result.joined}`,
          `Duplicates ${result.removed} / joins ${result.joined}`,
        )}
      </p>
      <div className="dialog-actions">
        <button
          disabled={!result.changedIds.length}
          onClick={() => {
            useAppStore.getState().selectMany(result.changedIds);
            onClose();
          }}
        >
          {text('変更対象を選択して確認', 'Select affected lines')}
        </button>
        <button
          disabled={!result.changedIds.length}
          onClick={() => {
            const state = useAppStore.getState();
            if (state.project !== project) return;
            state.pushHistory();
            useAppStore.setState({
              project: touchProject(project, result.entities),
              selectedEntityIds: result.entities
                .filter((e) => changedIds.has(e.id))
                .map((e) => e.id),
            });
            state.setStatusMessage(
              text(
                `線整理: ${project.entities.length} → ${result.entities.length} 要素。元に戻すで復元できます。`,
                `Line cleanup: ${project.entities.length} → ${result.entities.length}. Undo restores the original.`,
              ),
            );
            onClose();
          }}
        >
          {text('適用（元に戻す対応）', 'Apply (undoable)')}
        </button>
      </div>
    </TaskDialog>
  );
}
