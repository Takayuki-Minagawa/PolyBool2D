import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const samples = process.env.POLYBOOL_SAMPLE_DIR;

test('actual drawings survive import, edit, reload, switching, and a multipage PDF export', async ({
  page,
}, info) => {
  test.skip(
    !samples || !existsSync(samples),
    'Set POLYBOOL_SAMPLE_DIR to the supplied drawing folder.',
  );
  const files = readdirSync(samples!)
    .filter((name) => name.endsWith('.polybool2d.json'))
    .sort();
  expect(files).toHaveLength(3);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
  const imported: Array<{ id: string; count: number; name: string }> = [];
  for (const file of files) {
    const original = JSON.parse(readFileSync(resolve(samples!, file), 'utf8'));
    await page
      .locator('input[accept="application/json,.json"]')
      .setInputFiles(resolve(samples!, file));
    await page.getByRole('button', { name: '読み込む', exact: true }).click();
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const path = performance
              .getEntriesByType('resource')
              .map((entry) => entry.name)
              .find((url) => /\/src\/app\/appStore\.ts(?:\?|$)/.test(url))!;
            return (await import(path)).useAppStore.getState().project.entities
              .length;
          }),
        { timeout: 60_000 },
      )
      .toBe(original.entities.length);
    await expect(page.getByText('保存済み', { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    const snapshot = await page.evaluate(async () => {
      const path = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => /\/src\/app\/appStore\.ts(?:\?|$)/.test(url))!;
      const { useAppStore } = await import(path);
      const p = useAppStore.getState().project;
      return { id: p.id, count: p.entities.length, name: p.name };
    });
    expect(snapshot.count).toBe(original.entities.length);
    imported.push(snapshot);
    expect(
      await page.locator('.entity-outliner-row').count(),
    ).toBeLessThanOrEqual(8);
  }
  await page.getByLabel('実線幅', { exact: true }).check();
  const before = await page.evaluate(async () => {
    const path = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((url) => /\/src\/app\/appStore\.ts(?:\?|$)/.test(url))!;
    const { useAppStore } = await import(path);
    const state = useAppStore.getState(),
      entity = state.project.entities[0];
    state.updateEntityProperties(entity.id, {
      name: 'Edited large drawing line',
    });
    return entity.id;
  });
  await expect(page.getByText('保存済み', { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await page.reload();
  await expect(page.getByText('保存済み', { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  expect(
    await page.evaluate(async (id) => {
      const path = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => /\/src\/app\/appStore\.ts(?:\?|$)/.test(url))!;
      const { useAppStore } = await import(path);
      const p = useAppStore.getState().project;
      return {
        count: p.entities.length,
        name: p.entities.find((e: { id: string }) => e.id === id)?.name,
      };
    }, before),
  ).toEqual({ count: 32222, name: 'Edited large drawing line' });
  await page.screenshot({ path: info.outputPath('large-drawing.png') });
  await page.getByRole('button', { name: 'プロジェクト', exact: true }).click();
  await page
    .locator('.project-card')
    .filter({ hasText: imported[0].name })
    .getByRole('button', { name: '開く', exact: true })
    .click();
  await expect(page.getByText('保存済み', { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  expect(
    await page.evaluate(async () => {
      const path = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((url) => /\/src\/app\/appStore\.ts(?:\?|$)/.test(url))!;
      return (await import(path)).useAppStore.getState().project.entities
        .length;
    }),
  ).toBe(4786);
  await page.getByRole('button', { name: '印刷 / PDF', exact: true }).click();
  await page.getByLabel(imported[1].name, { exact: true }).check();
  await page.getByLabel(imported[2].name, { exact: true }).check();
  await page.screenshot({ path: info.outputPath('print-preview.png') });
  // Browser download fallback is tested explicitly; native OS pickers are outside headless Chrome.
  await page.evaluate(() => {
    Object.defineProperty(window, 'showSaveFilePicker', {
      value: undefined,
      configurable: true,
    });
  });
  const download = page.waitForEvent('download', { timeout: 120_000 });
  await page
    .getByRole('button', { name: '保存先を選んで書出', exact: true })
    .click();
  const file = await download;
  await file.saveAs(info.outputPath('three-drawings-A3.pdf'));
  await expect(
    page.getByRole('status').filter({ hasText: 'ダウンロードを開始' }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('PDF physically preserves the 6000 mm span as 120 mm on A3 and can be imported as vectors', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
  const result = await page.evaluate(async () => {
    const factoryPath = '/src/app/projectFactory.ts',
      exportPath = '/src/persistence/pdfExport.ts',
      importPath = '/src/persistence/pdfImport.ts',
      layoutPath = '/src/persistence/printLayout.ts';
    const { createEmptyProject, createLinearEntity } = await import(
      factoryPath
    );
    const project = createEmptyProject();
    project.name = '6000 mm span';
    project.layers[0].color = '#000000';
    project.entities = [
      createLinearEntity(
        [
          { x: 1000, y: 2000 },
          { x: 7000, y: 2000 },
        ],
        'polyline',
      ),
    ];
    const { DEFAULT_PRINT_LAYOUT } = await import(layoutPath);
    const blob = await (
      await import(exportPath)
    ).buildPdf([project, project], DEFAULT_PRINT_LAYOUT);
    const pdf = await (
      await import(importPath)
    ).openPdf(new File([blob], 'test.pdf', { type: 'application/pdf' }));
    const first = await pdf.getPage(1);
    const viewport = first.getViewport({ scale: 1 });
    const imported = await (
      await import(importPath)
    ).importPdfPage(first, 'test', {
      rotation: 0,
      unitsPerPoint: 25.4 / 72,
      crop: null,
      lines: true,
      fills: false,
      text: false,
    });
    const points = imported.project.entities.flatMap(
      (e: { points: unknown[] }) => e.points,
    );
    const xs = points.map((p: { x: number }) => p.x);
    return {
      pages: pdf.numPages,
      width: (viewport.width * 25.4) / 72,
      height: (viewport.height * 25.4) / 72,
      length: Math.max(...xs) - Math.min(...xs),
      bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
    };
  });
  expect(result.pages).toBe(2);
  expect(result.width).toBeCloseTo(420, 5);
  expect(result.height).toBeCloseTo(297, 5);
  expect(result.length).toBeCloseTo(120, 5);
  await info.attach('calibration.pdf', {
    body: Buffer.from(result.bytes),
    contentType: 'application/pdf',
  });
});

test('source PDF pages import with decodable vector entities and explicit fidelity warnings', async ({
  page,
}) => {
  test.skip(
    !samples || !existsSync(samples),
    'Set POLYBOOL_SAMPLE_DIR to the supplied drawing folder.',
  );
  const file = readdirSync(samples!).find(
    (name) => name.startsWith('260907') && name.endsWith('.pdf'),
  );
  test.skip(!file, 'Original PDF not found.');
  await page.goto('/');
  await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
  const source = readFileSync(resolve(samples!, file!)).toString('base64');
  const results = await page.evaluate(async (data) => {
    const path = '/src/persistence/pdfImport.ts',
      codecPath = '/src/persistence/projectCodec.ts';
    const { openPdf, importPdfPage } = await import(path),
      { decodeProject, serializeProject } = await import(codecPath);
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const pdf = await openPdf(
      new File([bytes], 'source.pdf', { type: 'application/pdf' }),
    );
    const results = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const imported = await importPdfPage(
        await pdf.getPage(number),
        `Page ${number}`,
        {
          rotation: 0,
          unitsPerPoint: (50 * 25.4) / 72,
          crop: null,
          lines: true,
          fills: true,
          text: true,
        },
      );
      const decoded = decodeProject(serializeProject(imported.project));
      results.push({
        page: number,
        entities: imported.project.entities.length,
        duplicates: imported.duplicates,
        warnings: imported.warnings,
        ok: decoded.ok,
        discarded: decoded.discardedItemCount,
      });
    }
    await pdf.destroy();
    return results;
  }, source);
  console.log('Source PDF:', JSON.stringify(results));
  expect(results).toHaveLength(3);
  for (const result of results) {
    expect(result.entities).toBeGreaterThan(100);
    expect(result.ok).toBe(true);
    expect(result.discarded).toBe(0);
  }
});
