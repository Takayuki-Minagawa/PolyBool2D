import { PdfImportDialog } from './PdfImportDialog';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import { makeId } from '../../app/idUtils';
import { projectDecodeFeedback } from '../../app/projectDecodeFeedback';
import type { Project } from '../../app/projectTypes';
import {
  exportProjectFile,
  importProjectFileSourceResult,
} from '../../persistence/projectFileIo';
import { ExportDialog } from './ExportDialog';
import { LineCleanupDialog } from './LineCleanupDialog';
import { TaskDialog, useText } from '../common/TaskDialog';
import { exportAreaCsvFile, exportVertexCsvFile } from '../../persistence/csvExport';
import { exportPngFile } from '../../persistence/pngExport';
import { exportDxfFile } from '../../persistence/dxfExport';
import { importDxfFile } from '../../persistence/dxfImport';
import { importSvgFile } from '../../persistence/svgImport';
import {
  exportGeoJsonFile,
  importGeoJsonFile,
} from '../../persistence/geoJson';
import {
  buildProjectSectionReportHtml,
} from '../../persistence/sectionReport';
import {
  createUnderlayImage,
  deleteUnderlayImageDurably,
  notifyUnderlaysChanged,
  saveUnderlayImage,
} from '../../persistence/underlayStore';
import { buildShareUrl } from '../../persistence/shareUrl';
import {
  deleteProjectRecoverySnapshot,
  preserveProjectRecoverySource,
  saveProjectToLocal,
} from '../../persistence/durableProjectStore';
import { ProjectManagerModal } from './ProjectManagerModal';

const DXF_WARNING_CODES = new Set([
  'invalid-dxf',
  'file-read-error',
  'input-size-limit-exceeded',
  'group-pair-limit-exceeded',
  'truncated-group-pair',
  'invalid-group-code',
  'invalid-coordinate',
  'vertex-limit-exceeded',
  'repaired-closed-polyline',
  'invalid-closed-polyline',
  'invalid-open-polyline',
  'invalid-line',
  'invalid-circle',
  'invalid-arc',
  'unsupported-unit',
  'invalid-block',
  'duplicate-block',
  'entity-limit-exceeded',
  'unsupported-entity',
  'invalid-insert',
  'undefined-block',
  'cyclic-block',
  'missing-eof',
  'warning-limit-exceeded',
]);

export function Header() {
  const { t } = useTranslation();
  const text = useText();
  const [exportFormat, setExportFormat] = useState<'json' | 'svg' | 'pdf' | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [rescue, setRescue] = useState<{ project: Project; resolve: (ok: boolean) => void } | null>(null);
  const [rescueDownloaded, setRescueDownloaded] = useState(false);
  const [pendingUnsavedProject, setPendingUnsavedProject] = useState<Project | null>(null);
  const [preflight, setPreflight] = useState<{ name: string; count: number; size: number; available?: number; resolve: (ok: boolean) => void } | null>(null);
  const project = useAppStore((s) => s.project);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const canUndo = useAppStore((s) => s.history.past.length > 0);
  const canRedo = useAppStore((s) => s.history.future.length > 0);
  const reset = useAppStore((s) => s.resetProject);
  const loadProject = useAppStore((s) => s.loadProject);
  const importPolygonGeometries = useAppStore((s) => s.importPolygonGeometries);
  const importDrawingGeometries = useAppStore((s) => s.importDrawingGeometries);
  const setErrorMessage = useAppStore((s) => s.setErrorMessage);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const theme = useAppStore((s) => s.ui.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const language = useAppStore((s) => s.ui.language);
  const setLanguage = useAppStore((s) => s.setLanguage);
  const setManualOpen = useAppStore((s) => s.setManualOpen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const jsonFileInput = useRef<HTMLInputElement>(null);
  const svgFileInput = useRef<HTMLInputElement>(null);
  const dxfFileInput = useRef<HTMLInputElement>(null);
  const geoJsonFileInput = useRef<HTMLInputElement>(null);
  const underlayFileInput = useRef<HTMLInputElement>(null);
  const importGenerationRef = useRef(0);
  const projectManagerOpen = useAppStore((s) => s.ui.projectManagerOpen);
  const setProjectManagerOpen = useAppStore((s) => s.setProjectManagerOpen);
  const [busyAction, setBusyAction] = useState<'png' | 'share' | null>(null);

  function onChangeLang(l: 'ja' | 'en') {
    setLanguage(l);
  }

  function reportError(key: string) {
    setStatusMessage(null);
    setErrorMessage(key);
  }

  function reportSuccess(message: string) {
    setErrorMessage(null);
    window.dispatchEvent(new Event('polybool-fit-content'));
    setStatusMessage(message);
  }

  function beginImport(): number {
    importGenerationRef.current += 1;
    return importGenerationRef.current;
  }

  function importTargetStillCurrent(
    targetProject: Project,
    generation: number,
  ): boolean {
    // A newer import owns the UI and its result, even when both source files
    // carry the same project ID.
    if (generation !== importGenerationRef.current) return false;
    if (useAppStore.getState().project === targetProject) return true;
    reportError('errors.projectChangedDuringImport');
    return false;
  }

  async function saveCurrentProject(): Promise<boolean> {
    const current = useAppStore.getState().project;
    const saved = await saveProjectToLocal(current);
    if (useAppStore.getState().project !== current) {
      reportError('errors.projectChangedDuringImport');
      return false;
    }
    if (saved) return true;
    reportError('errors.saveFailed');
    return new Promise<boolean>((resolve) => {
      setRescueDownloaded(false);
      setRescue({ project: useAppStore.getState().project, resolve });
    });
  }

  async function onNewProject() {
    if (!await saveCurrentProject()) return;
    reset();
  }

  async function openProjectManager() {
    if (!await saveCurrentProject()) return;
    setProjectManagerOpen(true);
  }

  async function onJsonImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const targetProject = project;
    const generation = beginImport();
    const source = await importProjectFileSourceResult(file);
    if (!importTargetStillCurrent(targetProject, generation)) return;
    const result = source.decodeResult;
    const feedback = projectDecodeFeedback(result, t);
    if (!result.ok) {
      reportError(feedback ?? 'errors.importInvalid');
      return;
    }
    if (result.project.entities.length > 1000) {
      const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
      const accepted = await new Promise<boolean>((resolve) => setPreflight({ name: result.project.name, count: result.project.entities.length, size: file.size, available: estimate?.quota === undefined ? undefined : estimate.quota - (estimate.usage ?? 0), resolve }));
      if (!accepted || !importTargetStillCurrent(targetProject, generation)) return;
    }
    if (!await saveCurrentProject()) return;
    if (!importTargetStillCurrent(targetProject, generation)) return;
    const now = new Date().toISOString();
    const independentProject = {
      ...result.project,
      id: makeId('project'),
      createdAt: now,
      updatedAt: now,
    };
    const stagedRecovery = result.sourceWasNormalized;
    if (
      stagedRecovery &&
      !await preserveProjectRecoverySource(
        independentProject.id,
        source.sourceJson,
        result.project.id,
      )
    ) {
      reportError('errors.saveFailed');
      return;
    }
    const importedSaved = await saveProjectToLocal(independentProject);
    if (!importTargetStillCurrent(targetProject, generation)) return;
    if (!importedSaved) {
      if (stagedRecovery) {
        await deleteProjectRecoverySnapshot(independentProject.id);
      }
      reportError('errors.saveFailed');
      // Offer an explicit in-memory opening: the source file and the previous
      // project's durable or downloaded copy are both still available.
      setPendingUnsavedProject(independentProject);
      return;
    }
    loadProject(independentProject);
    window.dispatchEvent(new Event('polybool-fit-content'));
    if (feedback) reportError(feedback);
    else {
      reportSuccess(t('status.jsonImported', { name: independentProject.name }));
    }
  }

  async function onSvgImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const targetProject = project;
    const generation = beginImport();
    const result = await importSvgFile(file, {
      circleSegments: targetProject.settings.circleSegments,
    });
    if (!importTargetStillCurrent(targetProject, generation)) return;
    setErrorMessage(null);
    const imported = importPolygonGeometries(result.polygons).length;
    const importError = useAppStore.getState().ui.errorMessage;
    if (imported === 0) {
      reportError(importError ?? 'errors.svgImportInvalid');
      return;
    }
    window.dispatchEvent(new Event('polybool-fit-content'));
    setStatusMessage(t('status.svgImported', {
      count: imported,
      warnings: result.warnings.length,
    }));
    if (!importError) setErrorMessage(null);
  }

  async function onDxfImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const targetProject = project;
    const generation = beginImport();
    const result = await importDxfFile(file, {
      curveSegments: targetProject.settings.circleSegments,
      targetUnit: targetProject.unit,
    });
    if (!importTargetStillCurrent(targetProject, generation)) return;
    setErrorMessage(null);
    const imported = importDrawingGeometries(
      result.polygons,
      result.polylines,
    ).length;
    const importError = useAppStore.getState().ui.errorMessage;
    if (imported === 0) {
      reportError(importError ?? 'errors.dxfImportInvalid');
      return;
    }
    const warningTypes = result.warnings.slice(0, 5).map((warning) => {
      const [code, ...detailParts] = warning.split(':');
      const translationCode = DXF_WARNING_CODES.has(code) ? code : 'other';
      return t(`dxfWarnings.${translationCode}`, {
        detail: detailParts.join(':'),
      });
    }).join(', ');
    const message = t('status.dxfImported', {
      count: imported,
      warnings: result.warnings.length,
      warningTypes: warningTypes
        ? `: ${warningTypes}${result.warnings.length > 5 ? ', …' : ''}`
        : '',
    });
    window.dispatchEvent(new Event('polybool-fit-content'));
    setStatusMessage(message);
    if (!importError) setErrorMessage(null);
  }

  async function onGeoJsonImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const targetProject = project;
    const generation = beginImport();
    const result = await importGeoJsonFile(file);
    if (!importTargetStillCurrent(targetProject, generation)) return;
    setErrorMessage(null);
    const count = importPolygonGeometries(result.polygons).length;
    const importError = useAppStore.getState().ui.errorMessage;
    if (count === 0) {
      reportError(importError ?? 'errors.geoJsonImportInvalid');
      return;
    }
    window.dispatchEvent(new Event('polybool-fit-content'));
    setStatusMessage(t('status.geoJsonImported', {
      count,
      warnings: result.warnings.length,
    }));
    if (!importError) setErrorMessage(null);
  }

  async function onUnderlayImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const targetProject = project;
    const generation = beginImport();
    const image = await createUnderlayImage(targetProject.id, file, file.name);
    if (!importTargetStillCurrent(targetProject, generation)) return;
    if (!image) {
      reportError('errors.underlayImportInvalid');
      return;
    }
    try {
      await saveUnderlayImage(image);
      if (!importTargetStillCurrent(targetProject, generation)) {
        const removed = await deleteUnderlayImageDurably(image.id);
        if (!removed && generation === importGenerationRef.current) {
          reportError('errors.underlayRollbackFailed');
        }
        return;
      }
      notifyUnderlaysChanged(targetProject.id);
      reportSuccess(t('status.underlayImported', { name: image.name }));
    } catch {
      if (importTargetStillCurrent(targetProject, generation)) {
        reportError('errors.underlayImportInvalid');
      }
    }
  }

  async function onPngExport() {
    setBusyAction('png');
    try {
      const exported = await exportPngFile(project);
      if (!exported) {
        reportError('errors.pngExportFailed');
        return;
      }
      reportSuccess(t('status.pngExported'));
    } catch {
      reportError('errors.pngExportFailed');
    } finally {
      setBusyAction(null);
    }
  }

  function onDxfExport() {
    try {
      exportDxfFile(project);
      reportSuccess(t('status.dxfExported'));
    } catch {
      reportError('errors.dxfExportFailed');
    }
  }

  function onSectionReport() {
    const html = buildProjectSectionReportHtml(project);
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
      reportError('errors.reportOpenFailed');
      return;
    }
    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
    reportWindow.addEventListener('load', () => {
      reportWindow.focus();
      reportWindow.print();
    }, { once: true });
    reportSuccess(t('status.reportOpened'));
  }

  async function onShare() {
    setBusyAction('share');
    try {
      const url = await buildShareUrl(project);
      if (!url) {
        reportError('errors.shareTooLarge');
        return;
      }
      if (!navigator.clipboard?.writeText) {
        reportError('errors.shareClipboardFailed');
        return;
      }
      await navigator.clipboard.writeText(url);
      reportSuccess(t('status.shareCopied'));
    } catch {
      reportError('errors.shareClipboardFailed');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <header className="header">
      <h1>{t('app.title')}</h1>
      <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>
        {t('app.subtitle')}
      </span>
      <div className="spacer" />

      <div className="group">
        <button onClick={onNewProject}>{t('header.newProject')}</button>
        <button onClick={openProjectManager}>
          {t('header.projects')}
        </button>
        <button onClick={() => jsonFileInput.current?.click()}>
          {t('header.importJson')}
        </button>
        <input
          ref={jsonFileInput}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={onJsonImport}
        />
        <button onClick={() => svgFileInput.current?.click()}>
          {t('header.importSvg')}
        </button>
        <input
          ref={svgFileInput}
          type="file"
          accept="image/svg+xml,.svg"
          style={{ display: 'none' }}
          onChange={onSvgImport}
        />
        <button onClick={() => dxfFileInput.current?.click()}>
          {t('header.importDxf')}
        </button>
        <input
          ref={dxfFileInput}
          type="file"
          accept="application/dxf,text/plain,.dxf"
          style={{ display: 'none' }}
          onChange={(event) => void onDxfImport(event)}
        />
        <button onClick={() => geoJsonFileInput.current?.click()}>
          {t('header.importGeoJson')}
        </button>
        <input
          ref={geoJsonFileInput}
          type="file"
          accept="application/geo+json,application/json,.geojson,.json"
          style={{ display: 'none' }}
          onChange={(event) => void onGeoJsonImport(event)}
        />
        <button onClick={() => underlayFileInput.current?.click()}>
          {t('header.importUnderlay')}
        </button>
        <input
          ref={underlayFileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          style={{ display: 'none' }}
          onChange={(event) => void onUnderlayImport(event)}
        />
      </div>

      <div className="group">
        <button onClick={() => pdfInput.current?.click()}>{text('PDF読込', 'Import PDF')}</button>
        <input ref={pdfInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const file=e.target.files?.[0];e.target.value='';if(file)setPdfFile(file); }} />
        <button onClick={() => setExportFormat('json')} title="JSON">
          {t('header.exportJson')}
        </button>
        <button onClick={() => setExportFormat('svg')} title="SVG">
          {t('header.exportSvg')}
        </button>
        <button
          onClick={() => void onPngExport()}
          disabled={busyAction === 'png'}
          title="PNG"
        >
          {t('header.exportPng')}
        </button>
        <button onClick={onDxfExport} title="DXF">
          {t('header.exportDxf')}
        </button>
        <button onClick={() => exportGeoJsonFile(project)} title="GeoJSON">
          {t('header.exportGeoJson')}
        </button>
        <button onClick={() => exportAreaCsvFile(project)} title="CSV">
          {t('header.exportCsvArea')}
        </button>
        <button onClick={() => exportVertexCsvFile(project)} title="CSV">
          {t('header.exportCsvVertices')}
        </button>
        <button
          onClick={() => void onShare()}
          disabled={busyAction === 'share'}
        >
          {t('header.share')}
        </button>
        <button onClick={onSectionReport}>
          {t('header.sectionReport')}
        </button>
      </div>

      <div className="group">
        <button onClick={() => setExportFormat('pdf')}>{text('印刷 / PDF', 'Print / PDF')}</button>
        <button onClick={() => setCleanupOpen(true)}>{text('線整理', 'Clean lines')}</button>
        <button onClick={() => undo()} disabled={!canUndo} title="Ctrl/⌘+Z">
          {t('header.undo')}
        </button>
        <button onClick={() => redo()} disabled={!canRedo} title="Ctrl/⌘+Shift+Z / Ctrl/⌘+Y">
          {t('header.redo')}
        </button>
      </div>

      <div className="group lang-toggle">
        <button
          className={language === 'ja' ? 'active' : ''}
          aria-pressed={language === 'ja'}
          onClick={() => onChangeLang('ja')}
          title={t('header.language.ja')}
        >
          JA
        </button>
        <button
          className={language === 'en' ? 'active' : ''}
          aria-pressed={language === 'en'}
          onClick={() => onChangeLang('en')}
          title={t('header.language.en')}
        >
          EN
        </button>
      </div>

      <div className="group">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? t('header.theme.light') : t('header.theme.dark')}
        >
          {theme === 'dark' ? '☀ ' + t('header.theme.light') : '☾ ' + t('header.theme.dark')}
        </button>
      </div>

      <div className="group">
        <button onClick={() => setShortcutsOpen(true)} title="?">
          ? {t('header.shortcuts')}
        </button>
        <button onClick={() => setManualOpen(true)}>
          {t('header.manual')}
        </button>
      </div>
      </header>
      {pdfFile && <PdfImportDialog file={pdfFile} onClose={() => setPdfFile(null)} beforeImport={saveCurrentProject} onImported={(p) => { loadProject(p); window.dispatchEvent(new Event('polybool-fit-content')); }} />}
      {exportFormat && <ExportDialog initialFormat={exportFormat} onClose={() => setExportFormat(null)} />}
      {cleanupOpen && <LineCleanupDialog onClose={() => setCleanupOpen(false)} />}
      {pendingUnsavedProject && <TaskDialog title={text('読込先の図面を保存できません', 'The imported drawing could not be saved')} onClose={() => setPendingUnsavedProject(null)}>
        <p>{text('現在の図面は保存またはJSONへ退避済みです。読み込む元のJSONファイルを保持したまま、未保存の図面として開けます。', 'The current drawing has been saved or rescued to JSON. Keep the source JSON file; you can open this drawing without browser storage.')}</p>
        <button onClick={() => { loadProject(pendingUnsavedProject); setPendingUnsavedProject(null); window.dispatchEvent(new Event('polybool-fit-content')); }}>{text('未保存のまま開く', 'Open without saving')}</button>
      </TaskDialog>}
      {preflight && <TaskDialog title={text('図面の読込確認', 'Drawing import summary')} onClose={() => { preflight.resolve(false); setPreflight(null); }}>
        <p>{preflight.name}</p><p>{preflight.count.toLocaleString()} {text('要素', 'entities')} · {(preflight.size / 1024 / 1024).toFixed(2)} MB</p>
        <p>{text('ブラウザー保存領域の空き容量（概算）: ', 'Estimated browser storage available: ')}{preflight.available === undefined ? text('取得できません', 'Unavailable') : `${(preflight.available / 1024 / 1024).toFixed(1)} MB`}</p>
        <p>{text('現在の図面を保存してから、新しい図面として読み込みます。保存できない場合はJSON退避を選べます。', 'Save the current drawing, then import as a new project. If saving fails, a JSON rescue is available.')}</p>
        <button onClick={() => { preflight.resolve(true); setPreflight(null); }}>{text('読み込む', 'Import')}</button>
      </TaskDialog>}
      {rescue && <TaskDialog title={text('切り替え前に図面を退避', 'Rescue drawing before switching')} onClose={() => { rescue.resolve(false); setRescue(null); }}>
        <p>{text('ブラウザー保存に失敗しました。JSONファイルの保存を確認すれば切り替えを続けられます。', 'Browser storage failed. Save a JSON file and confirm its download to continue switching.')}</p>
        <button onClick={() => { exportProjectFile(rescue.project); setRescueDownloaded(true); }}>{text('現在の図面をJSONに退避', 'Download current drawing as JSON')}</button>
        <button onClick={async () => { if (await saveProjectToLocal(rescue.project)) { rescue.resolve(true); setRescue(null); } }}>{text('保存を再試行', 'Retry save')}</button>
        <button disabled={!rescueDownloaded || project !== rescue.project} onClick={() => { rescue.resolve(true); setRescue(null); }}>{text('ファイルの保存を確認して切り替え', 'I verified the saved file; continue')}</button>
      </TaskDialog>}
      <ProjectManagerModal
        open={projectManagerOpen}
        onClose={() => setProjectManagerOpen(false)}
        onLoadProject={async (nextProject, options = {}) => {
          if (options.saveCurrent !== false && !await saveCurrentProject()) return false;
          loadProject(nextProject);
          reportSuccess(t('status.projectLoaded', { name: nextProject.name }));
          return true;
        }}
        onPersistenceError={() => reportError('errors.saveFailed')}
      />
    </>
  );
}
