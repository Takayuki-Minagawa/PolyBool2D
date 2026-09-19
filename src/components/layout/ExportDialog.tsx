import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../app/appStore';
import { TaskDialog, useText } from '../common/TaskDialog';
import {
  DEFAULT_PRINT_LAYOUT,
  clippedEntityCount,
  paperSize,
  type PrintLayout,
} from '../../persistence/printLayout';
import { buildSvg } from '../../persistence/svgExport';
import { serializeProject } from '../../persistence/projectCodec';
import {
  chooseFile,
  projectFilename,
  saveBlob,
} from '../../persistence/saveFile';
import {
  listLocalProjects,
  loadProjectById,
} from '../../persistence/durableProjectStore';

export function ExportDialog({
  initialFormat,
  onClose,
}: {
  initialFormat: 'json' | 'svg' | 'pdf';
  onClose: () => void;
}) {
  const project = useAppStore((s) => s.project);
  const text = useText();
  const [format, setFormat] = useState(initialFormat);
  const [name, setName] = useState(project.name);
  const [layout, setLayout] = useState<PrintLayout>(
    project.printLayout ?? DEFAULT_PRINT_LAYOUT,
  );
  const [usePaper, setUsePaper] = useState(
    initialFormat === 'pdf' || Boolean(project.printLayout),
  );
  const [others, setOthers] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState(project.id);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const cancellation = useRef<AbortController | null>(null);
  const savedProjects = useMemo(
    () => listLocalProjects().filter((p) => p.id !== project.id),
    [project.id],
  );
  const previewProject = useMemo(
    () =>
      format === 'pdf' && others.includes(previewId)
        ? (loadProjectById(previewId) ?? project)
        : project,
    [project, format, others, previewId],
  );
  const svg = useMemo(
    () =>
      format === 'json'
        ? ''
        : buildSvg(
            previewProject,
            usePaper || format === 'pdf' ? layout : undefined,
          ),
    [previewProject, format, usePaper, layout],
  );
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!svg) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [svg]);
  useEffect(() => () => cancellation.current?.abort(), []);
  const clipped = useMemo(
    () => clippedEntityCount(previewProject, layout),
    [previewProject, layout],
  );
  function update(part: Partial<PrintLayout>) {
    setLayout((old) => ({ ...old, ...part }));
  }
  function applySettings() {
    const state = useAppStore.getState();
    state.pushHistory();
    useAppStore.setState({
      project: {
        ...state.project,
        printLayout: layout,
        updatedAt: new Date().toISOString(),
      },
    });
    setMessage(
      text(
        '用紙設定を図面に保存しました。',
        'Page settings applied to the drawing.',
      ),
    );
  }
  async function exportFile() {
    const controller = new AbortController();
    cancellation.current = controller;
    const filename = projectFilename(
      name,
      format === 'json' ? 'polybool2d.json' : format,
    );
    setBusy(true);
    setMessage(text('書出準備中…', 'Preparing export…'));
    try {
      const handle = await chooseFile(filename);
      controller.signal.throwIfAborted();
      await new Promise((resolve) => setTimeout(resolve, 0));
      let blob: Blob;
      if (format === 'pdf') {
        const { buildPdf } = await import('../../persistence/pdfExport');
        const pages = [project];
        for (const id of others) {
          const page = loadProjectById(id);
          if (!page)
            throw new Error(
              text(
                '選択した図面を読み込めません。',
                'A selected project could not be loaded.',
              ),
            );
          pages.push(page);
        }
        blob = await buildPdf(pages, layout, controller.signal, (page) =>
          setMessage(`PDF ${page} / ${pages.length}`),
        );
      } else
        blob = new Blob(
          [
            format === 'json'
              ? serializeProject({ ...project, printLayout: layout })
              : svg,
          ],
          { type: format === 'json' ? 'application/json' : 'image/svg+xml' },
        );
      controller.signal.throwIfAborted();
      const outcome = await saveBlob(blob, filename, handle);
      setMessage(
        outcome === 'saved'
          ? text(`${filename} を保存しました。`, `Saved ${filename}.`)
          : text(
              `${filename} のダウンロードを開始しました。ブラウザーのダウンロード一覧で保存先と完了を確認してください。`,
              `Download started: ${filename}. Check your browser downloads for location and completion.`,
            ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error && error.name === 'AbortError'
          ? text('キャンセルしました。', 'Cancelled.')
          : text(
              '書出失敗。再試行できます: ',
              'Export failed. You can retry: ',
            ) + String(error),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <TaskDialog
      wide
      title={text('書出・用紙設定', 'Export and page setup')}
      onClose={() => {
        cancellation.current?.abort();
        onClose();
      }}
    >
      <div className="export-layout">
        <fieldset disabled={busy} className="export-settings">
          <label>
            {text('ファイル名', 'File name')}
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            {text('形式', 'Format')}
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as typeof format)}
            >
              <option value="json">JSON</option>
              <option value="svg">SVG</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={usePaper || format === 'pdf'}
              disabled={format === 'pdf'}
              onChange={(e) => setUsePaper(e.target.checked)}
            />
            {text('用紙サイズで出力', 'Use paper dimensions')}
          </label>
          <label>
            {text('用紙', 'Paper')}
            <select
              value={layout.paper}
              onChange={(e) => update({ paper: e.target.value as 'A3' | 'A4' })}
            >
              <option>A3</option>
              <option>A4</option>
            </select>
          </label>
          <label>
            {text('向き', 'Orientation')}
            <select
              value={layout.orientation}
              onChange={(e) =>
                update({
                  orientation: e.target.value as PrintLayout['orientation'],
                })
              }
            >
              <option value="landscape">{text('横', 'Landscape')}</option>
              <option value="portrait">{text('縦', 'Portrait')}</option>
            </select>
          </label>
          <label>
            {text('縮尺 1 /', 'Scale 1 /')}
            <input
              type="number"
              min="0.01"
              max="1000000"
              value={layout.scale}
              onChange={(e) => {
                if (e.target.valueAsNumber > 0)
                  update({ scale: e.target.valueAsNumber });
              }}
            />
          </label>
          <label>
            {text('余白 mm', 'Margin mm')}
            <input
              type="number"
              min="0"
              max="100"
              value={layout.margin}
              onChange={(e) => {
                if (Number.isFinite(e.target.valueAsNumber))
                  update({
                    margin: Math.max(0, Math.min(100, e.target.valueAsNumber)),
                  });
              }}
            />
          </label>
          <label>
            {text('印刷範囲の原点', 'Print range origin')}
            <select
              value={layout.origin}
              onChange={(e) =>
                update({ origin: e.target.value as PrintLayout['origin'] })
              }
            >
              <option value="custom">
                {text('座標指定（左下）', 'Coordinates (lower left)')}
              </option>
              <option value="drawing">
                {text('図形の左下に合わせる', 'Align drawing lower left')}
              </option>
            </select>
          </label>
          {layout.origin === 'custom' &&
            (['originX', 'originY'] as const).map((key) => (
              <label key={key}>
                {key === 'originX' ? 'X' : 'Y'} ({project.unit})
                <input
                  type="number"
                  value={layout[key]}
                  onChange={(e) => {
                    if (Number.isFinite(e.target.valueAsNumber))
                      update({ [key]: e.target.valueAsNumber });
                  }}
                />
              </label>
            ))}
          <label>
            <input
              type="checkbox"
              checked={layout.frame}
              onChange={(e) => update({ frame: e.target.checked })}
            />
            {text('図枠を付ける', 'Include frame')}
          </label>
          <button onClick={applySettings}>
            {text('用紙設定を図面に適用', 'Apply page settings')}
          </button>
          {format === 'pdf' && (
            <div>
              <strong>
                {text(
                  '追加ページ（保存済み図面）',
                  'Additional pages (saved projects)',
                )}
              </strong>
              {savedProjects.map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={others.includes(p.id)}
                    onChange={(e) =>
                      setOthers((ids) =>
                        e.target.checked
                          ? [...ids, p.id]
                          : ids.filter((id) => id !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <div className="print-preview">
          {format === 'pdf' && (
            <label>
              {text('プレビューページ', 'Preview page')}
              <select
                value={previewProject.id}
                onChange={(e) => setPreviewId(e.target.value)}
              >
                <option value={project.id}>1. {project.name}</option>
                {others.map((id, index) => (
                  <option key={id} value={id}>
                    {index + 2}. {savedProjects.find((p) => p.id === id)?.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {preview && (
            <img alt={text('印刷プレビュー', 'Print preview')} src={preview} />
          )}
          <p>
            {paperSize(layout).join(' × ')} mm · 1/{layout.scale} ·{' '}
            {text(`余白 ${layout.margin} mm`, `Margin ${layout.margin} mm`)}
          </p>
          {(usePaper || format === 'pdf') && (
            <p className={clipped ? 'status-error' : ''}>
              {text(
                `印刷範囲を超える可能性がある要素: ${clipped}（注記は概算）。`,
                `Potentially clipped entities: ${clipped} (text bounds are estimated).`,
              )}
            </p>
          )}
          <p>
            {text(
              'PDFの各ページには同じ用紙・縮尺・原点を使います。',
              'All PDF pages use the same paper, scale and origin.',
            )}
          </p>
        </div>
      </div>
      <p role="status">{message}</p>
      <div className="dialog-actions">
        <button disabled={busy} onClick={() => void exportFile()}>
          {text('保存先を選んで書出', 'Choose destination and export')}
        </button>
        {busy && (
          <button onClick={() => cancellation.current?.abort()}>
            {text('キャンセル', 'Cancel')}
          </button>
        )}
      </div>
    </TaskDialog>
  );
}
