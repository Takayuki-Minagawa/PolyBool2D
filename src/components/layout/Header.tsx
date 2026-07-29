import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../app/appStore';
import {
  exportProjectFile,
  importProjectFile,
} from '../../persistence/projectFileIo';
import { exportSvgFile } from '../../persistence/svgExport';
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
  notifyUnderlaysChanged,
  saveUnderlayImage,
} from '../../persistence/underlayStore';
import { buildShareUrl } from '../../persistence/shareUrl';
import { saveProjectToLocal } from '../../persistence/localProjectStore';
import { ProjectManagerModal } from './ProjectManagerModal';

export function Header() {
  const { t } = useTranslation();
  const project = useAppStore((s) => s.project);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const canUndo = useAppStore((s) => s.history.past.length > 0);
  const canRedo = useAppStore((s) => s.history.future.length > 0);
  const reset = useAppStore((s) => s.resetProject);
  const loadProject = useAppStore((s) => s.loadProject);
  const importPolygonGeometries = useAppStore((s) => s.importPolygonGeometries);
  const addLinearEntity = useAppStore((s) => s.addLinearEntity);
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
    setStatusMessage(message);
  }

  function saveCurrentProject(): boolean {
    const saved = saveProjectToLocal(useAppStore.getState().project);
    if (!saved) reportError('errors.saveFailed');
    return saved;
  }

  function onNewProject() {
    if (!saveCurrentProject()) return;
    reset();
  }

  function openProjectManager() {
    if (!saveCurrentProject()) return;
    setProjectManagerOpen(true);
  }

  async function onJsonImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const p = await importProjectFile(file);
    if (!p) {
      reportError('errors.importInvalid');
      return;
    }
    if (!saveCurrentProject()) return;
    loadProject(p);
    reportSuccess(t('status.jsonImported', { name: p.name }));
  }

  async function onSvgImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const result = await importSvgFile(file, {
      circleSegments: project.settings.circleSegments,
    });
    const imported = importPolygonGeometries(result.polygons).length;
    if (imported === 0) {
      reportError('errors.svgImportInvalid');
      return;
    }
    reportSuccess(t('status.svgImported', {
      count: imported,
      warnings: result.warnings.length,
    }));
  }

  async function onDxfImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const result = await importDxfFile(file, {
      curveSegments: project.settings.circleSegments,
    });
    const polygonCount = importPolygonGeometries(result.polygons).length;
    let linearCount = 0;
    for (const item of result.polylines) {
      if (addLinearEntity(item.points, item.kind)) linearCount += 1;
    }
    if (polygonCount + linearCount === 0) {
      reportError('errors.dxfImportInvalid');
      return;
    }
    reportSuccess(t('status.dxfImported', {
      count: polygonCount + linearCount,
      warnings: result.warnings.length,
    }));
  }

  async function onGeoJsonImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const result = await importGeoJsonFile(file);
    const count = importPolygonGeometries(result.polygons).length;
    if (count === 0) {
      reportError('errors.geoJsonImportInvalid');
      return;
    }
    reportSuccess(t('status.geoJsonImported', {
      count,
      warnings: result.warnings.length,
    }));
  }

  async function onUnderlayImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const image = await createUnderlayImage(project.id, file, file.name);
    if (!image) {
      reportError('errors.underlayImportInvalid');
      return;
    }
    try {
      await saveUnderlayImage(image);
      notifyUnderlaysChanged(project.id);
      reportSuccess(t('status.underlayImported', { name: image.name }));
    } catch {
      reportError('errors.underlayImportInvalid');
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
        <button onClick={() => exportProjectFile(project)} title="JSON">
          {t('header.exportJson')}
        </button>
        <button onClick={() => exportSvgFile(project)} title="SVG">
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
      <ProjectManagerModal
        open={projectManagerOpen}
        onClose={() => setProjectManagerOpen(false)}
        onLoadProject={(nextProject, options = {}) => {
          if (options.saveCurrent !== false && !saveCurrentProject()) return false;
          loadProject(nextProject);
          reportSuccess(t('status.projectLoaded', { name: nextProject.name }));
          return true;
        }}
        onPersistenceError={() => reportError('errors.saveFailed')}
      />
    </>
  );
}
