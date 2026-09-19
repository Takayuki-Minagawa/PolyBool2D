import { useAppStore } from '../../app/appStore';
import {
  saveProjectToLocal,
  useSaveState,
} from '../../persistence/durableProjectStore';
import { exportProjectFile } from '../../persistence/projectFileIo';
import { useText } from '../common/TaskDialog';

export function SaveIndicator() {
  const project = useAppStore((s) => s.project);
  const saved = useSaveState();
  const text = useText();
  const state =
    saved.state === 'saved' && saved.project !== project
      ? 'unsaved'
      : saved.state;
  const label = {
    saved: text('保存済み', 'Saved'),
    unsaved: text('未保存', 'Unsaved'),
    saving: text('保存中…', 'Saving…'),
    failed: text('保存失敗', 'Save failed'),
  }[state];
  return (
    <span
      className={`save-indicator ${state}`}
      role="status"
      title={saved.error ?? undefined}
    >
      <strong>{label}</strong> · IndexedDB ·{' '}
      {saved.savedAt ? new Date(saved.savedAt).toLocaleTimeString() : '—'}
      {state === 'failed' && (
        <>
          <span>{saved.error}</span>
          <button onClick={() => void saveProjectToLocal(project)}>
            {text('保存を再試行', 'Retry save')}
          </button>
          <button onClick={() => exportProjectFile(project)}>
            {text('JSONを保存', 'Download JSON')}
          </button>
        </>
      )}
    </span>
  );
}
