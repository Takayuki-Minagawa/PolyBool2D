import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Project } from '../../app/projectTypes';
import type { Point } from '../../geometry/types';
import { TaskDialog, useText } from '../common/TaskDialog';
import {
  openPdf,
  importPdfPage,
  type PdfImportOptions,
} from '../../persistence/pdfImport';
import { saveProjectToLocal } from '../../persistence/durableProjectStore';

export function PdfImportDialog({
  file,
  onClose,
  beforeImport,
  onImported,
}: {
  file: File;
  onClose: () => void;
  beforeImport: () => Promise<boolean>;
  onImported: (project: Project) => void;
}) {
  const text = useText();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState('1');
  const [options, setOptions] = useState<PdfImportOptions>({
    rotation: 0,
    unitsPerPoint: (50 * 25.4) / 72,
    crop: null,
    lines: true,
    fills: true,
    text: true,
  });
  const [mode, setMode] = useState<'crop' | 'calibrate'>('crop');
  const [points, setPoints] = useState<Point[]>([]);
  const [distance, setDistance] = useState(6000);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<AbortController | null>(null);
  const warnings: Record<string, string> = {
    'pdf-clipping-path': text(
      'PDF固有のクリップ形状は未適用です。範囲指定と原図で確認してください。',
      'PDF clipping paths are not applied. Verify the crop against the original.',
    ),
    'images-not-vector': text(
      '画像を検出しました。画像はベクターに変換されません。下絵機能をご利用ください。',
      'Images were detected and were not converted to vectors. Use the underlay feature for images.',
    ),
    'patterns-not-supported': text(
      '網掛け・パターンは未対応です。',
      'Shadings and patterns are unsupported.',
    ),
    'text-fonts-approximated': text(
      '文字は編集可能な注記に変換しました。字体・色・位置は近似です。',
      'Text was converted to editable annotations; fonts, colors and positions are approximate.',
    ),
    'cropped-fills-omitted': text(
      '切り出し境界をまたぐ塗りを除外しました。',
      'Filled shapes crossing the crop boundary were omitted.',
    ),
  };
  useEffect(() => {
    let cancelled = false;
    let document: PDFDocumentProxy | undefined;
    void openPdf(file)
      .then((value) => {
        document = value;
        if (cancelled) {
          void value.destroy();
          return;
        }
        setPdf(value);
      })
      .catch((error) => {
        if (!cancelled) setMessage(String(error));
      });
    return () => {
      cancelled = true;
      controller.current?.abort();
      void document?.destroy();
    };
  }, [file]);
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let render: { cancel: () => void } | undefined;
    void pdf
      .getPage(page)
      .then(async (source) => {
        if (cancelled || !canvas.current) return;
        const viewport = source.getViewport({
          scale: 1,
          rotation: (source.rotate + options.rotation) % 360,
        });
        setSize({ width: viewport.width, height: viewport.height });
        const c = canvas.current;
        c.width = Math.ceil(viewport.width);
        c.height = Math.ceil(viewport.height);
        const task = source.render({
          canvasContext: c.getContext('2d')!,
          viewport,
        });
        render = task;
        await task.promise;
      })
      .catch((error) => {
        if (!cancelled) setMessage(String(error));
      });
    return () => {
      cancelled = true;
      render?.cancel();
    };
  }, [pdf, page, options.rotation]);
  function pick(event: React.MouseEvent<SVGSVGElement>) {
    if (busy) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const p = {
      x: ((event.clientX - rect.left) * size.width) / rect.width,
      y: ((event.clientY - rect.top) * size.height) / rect.height,
    };
    const next = points.length === 1 ? [points[0], p] : [p];
    setPoints(next);
    if (next.length === 2 && mode === 'crop') {
      const [a, b] = next;
      setOptions((old) => ({
        ...old,
        crop: {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(a.x - b.x),
          height: Math.abs(a.y - b.y),
        },
      }));
    }
  }
  async function importPages() {
    if (!pdf) return;
    const chosen = [...new Set(pages.split(',').map((p) => Number(p.trim())))];
    if (
      !chosen.length ||
      chosen.some((n) => !Number.isInteger(n) || n < 1 || n > pdf.numPages)
    ) {
      setMessage(
        text(
          'ページ番号をカンマ区切りで指定してください。',
          'Enter valid page numbers separated by commas.',
        ),
      );
      return;
    }
    setBusy(true);
    const cancellation = new AbortController();
    controller.current = cancellation;
    const messages: string[] = [];
    let first: Project | null = null;
    try {
      if (!(await beforeImport())) return;
      for (const number of chosen) {
        cancellation.signal.throwIfAborted();
        const result = await importPdfPage(
          await pdf.getPage(number),
          `${file.name.replace(/\.pdf$/i, '')} — ${number}`,
          options,
          cancellation.signal,
          (fraction) =>
            setMessage(
              `${number} / ${pdf.numPages} · ${Math.round(fraction * 100)}%`,
            ),
        );
        if (!(await saveProjectToLocal(result.project)))
          throw new Error(
            text(
              '図面の保存に失敗しました。完了済みページはプロジェクト一覧に残っています。',
              'Could not save the drawing. Completed pages remain in the project list.',
            ),
          );
        first ??= result.project;
        messages.push(
          `${number}: ${result.project.entities.length.toLocaleString()} ${text('要素', 'entities')} (${text('重複除去', 'duplicates removed')}: ${result.duplicates})`,
        );
        messages.push(
          ...result.warnings.map((warning) => warnings[warning] ?? warning),
        );
      }
      if (first) onImported(first);
      setMessage([...new Set(messages)].join('\n'));
    } catch (error) {
      setMessage(
        error instanceof Error && error.name === 'AbortError'
          ? text(
              'キャンセルしました。完了済みページはプロジェクト一覧から開けます。',
              'Cancelled. Completed pages are available in Projects.',
            )
          : String(error),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <TaskDialog
      wide
      title={text('PDFベクター読込', 'Import PDF vectors')}
      onClose={() => {
        controller.current?.abort();
        onClose();
      }}
    >
      <div className="export-layout">
        <fieldset className="export-settings" disabled={busy || !pdf}>
          <label>
            {text('表示ページ', 'Preview page')}
            <input
              type="number"
              min="1"
              max={pdf?.numPages ?? 1}
              value={page}
              onChange={(e) => {
                const n = e.target.valueAsNumber;
                if (
                  Number.isInteger(n) &&
                  n >= 1 &&
                  n <= (pdf?.numPages ?? 1)
                ) {
                  setPage(n);
                  setPoints([]);
                }
              }}
            />
          </label>
          <label>
            {text(
              '読込ページ（カンマ区切り）',
              'Import pages (comma separated)',
            )}
            <input value={pages} onChange={(e) => setPages(e.target.value)} />
          </label>
          <button
            onClick={() =>
              setPages(
                Array.from(
                  { length: pdf?.numPages ?? 1 },
                  (_, i) => i + 1,
                ).join(','),
              )
            }
          >
            {text('全ページ', 'All pages')}
          </button>
          <label>
            {text('回転', 'Rotation')}
            <select
              value={options.rotation}
              onChange={(e) => {
                setOptions({
                  ...options,
                  rotation: Number(e.target.value),
                  crop: null,
                });
                setPoints([]);
              }}
            >
              {[0, 90, 180, 270].map((n) => (
                <option key={n} value={n}>
                  {n}°
                </option>
              ))}
            </select>
          </label>
          <label>
            {text('クリック操作', 'Click action')}
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as typeof mode);
                setPoints([]);
              }}
            >
              <option value="crop">
                {text('2点で切り出し範囲', 'Crop with two corners')}
              </option>
              <option value="calibrate">
                {text('既知寸法の2点で校正', 'Calibrate two known points')}
              </option>
            </select>
          </label>
          <button
            onClick={() => {
              setOptions({ ...options, crop: null });
              setPoints([]);
            }}
          >
            {text('切り出し解除', 'Clear crop')}
          </button>
          <label>
            {text('2点間の実寸 mm', 'Known distance mm')}
            <input
              type="number"
              min="0.01"
              value={distance}
              onChange={(e) => setDistance(e.target.valueAsNumber)}
            />
          </label>
          <button
            disabled={
              mode !== 'calibrate' || points.length !== 2 || !(distance > 0)
            }
            onClick={() => {
              const length = Math.hypot(
                points[1].x - points[0].x,
                points[1].y - points[0].y,
              );
              if (length > 0)
                setOptions({ ...options, unitsPerPoint: distance / length });
            }}
          >
            {text('実寸を校正', 'Apply calibration')}
          </button>
          <label>
            {text('図面の縮尺 1 /', 'Source scale 1 /')}
            <input
              type="number"
              min="0.01"
              value={Number(((options.unitsPerPoint * 72) / 25.4).toFixed(4))}
              onChange={(e) => {
                if (e.target.valueAsNumber > 0)
                  setOptions({
                    ...options,
                    unitsPerPoint: (e.target.valueAsNumber * 25.4) / 72,
                  });
              }}
            />
          </label>
          {(['lines', 'fills', 'text'] as const).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={options[key]}
                onChange={(e) =>
                  setOptions({ ...options, [key]: e.target.checked })
                }
              />
              {key === 'lines'
                ? text(
                    '線・曲線（破線保持）',
                    'Lines and curves (preserve dashes)',
                  )
                : key === 'fills'
                  ? text('塗り（ポリゴン）', 'Fills (polygons)')
                  : text(
                      '文字（編集可能な注記）',
                      'Text (editable annotations)',
                    )}
            </label>
          ))}
          <p>
            {text(
              '同じ範囲・校正を全指定ページへ適用し、ページごとに図面を作成します。画像、任意のクリップ形状、文字輪郭の完全再現は対象外です。',
              'The same crop and calibration apply to all selected pages. Each page becomes a project. Images, arbitrary clipping and exact glyph outlines are not reproduced.',
            )}
          </p>
        </fieldset>
        <div
          className="pdf-source-preview"
          style={{ aspectRatio: `${size.width}/${size.height}` }}
        >
          <canvas ref={canvas} />
          <svg viewBox={`0 0 ${size.width} ${size.height}`} onClick={pick}>
            {options.crop && (
              <rect
                {...options.crop}
                fill="#0088ff22"
                stroke="#0088ff"
                strokeWidth="2"
              />
            )}
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r="4" fill="#e33" />
            ))}
            {mode === 'calibrate' && points.length === 2 && (
              <line
                x1={points[0].x}
                y1={points[0].y}
                x2={points[1].x}
                y2={points[1].y}
                stroke="#e33"
              />
            )}
          </svg>
        </div>
      </div>
      <p role="status" style={{ whiteSpace: 'pre-wrap' }}>
        {message}
      </p>
      <div className="dialog-actions">
        <button disabled={!pdf || busy} onClick={() => void importPages()}>
          {text('指定ページを読み込む', 'Import selected pages')}
        </button>
        {busy && (
          <button onClick={() => controller.current?.abort()}>
            {text('キャンセル', 'Cancel')}
          </button>
        )}
      </div>
    </TaskDialog>
  );
}
