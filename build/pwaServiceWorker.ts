import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

const BUILD_ID_TOKEN = '__POLYBOOL_BUILD_ID__';
const PRECACHE_PATHS_TOKEN = '__POLYBOOL_PRECACHE_PATHS__';
const SERVICE_WORKER_TEMPLATE = 'src/pwa/serviceWorker.js';

export interface PwaBuildAsset {
  path: string;
  source: string | Uint8Array;
}

function normalizeOutputPath(path: string): string {
  return path
    .split(sep)
    .join('/')
    .replace(/^\.?\//, '');
}

function listPublicAssets(publicDir: string): PwaBuildAsset[] {
  const assets: PwaBuildAsset[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        assets.push({
          path: normalizeOutputPath(relative(publicDir, absolutePath)),
          source: readFileSync(absolutePath),
        });
      }
    }
  };
  visit(publicDir);
  return assets;
}

export function createPwaGeneration(
  template: string,
  assets: Iterable<PwaBuildAsset>,
): string {
  const hash = createHash('sha256');
  hash.update('service-worker-template\0');
  hash.update(template);
  for (const asset of [...assets].sort((a, b) =>
    normalizeOutputPath(a.path).localeCompare(normalizeOutputPath(b.path))
  )) {
    const path = normalizeOutputPath(asset.path);
    hash.update(`\0asset:${path.length}:${path}\0`);
    hash.update(asset.source);
  }
  return hash.digest('hex').slice(0, 24);
}

export function collectPrecachePaths(
  bundlePaths: Iterable<string>,
  publicPaths: Iterable<string>,
): string[] {
  const paths = new Set<string>(['index.html']);
  for (const path of [...bundlePaths, ...publicPaths]) {
    const normalizedPath = normalizeOutputPath(path);
    if (
      normalizedPath &&
      normalizedPath !== 'sw.js' &&
      !normalizedPath.endsWith('.map')
    ) {
      paths.add(normalizedPath);
    }
  }
  return [...paths].sort();
}

export function renderServiceWorker(
  template: string,
  buildId: string,
  precachePaths: readonly string[],
): string {
  if (
    !template.includes(BUILD_ID_TOKEN) ||
    !template.includes(PRECACHE_PATHS_TOKEN)
  ) {
    throw new Error('Service worker template tokens are missing.');
  }
  return template
    .replace(BUILD_ID_TOKEN, JSON.stringify(buildId))
    .replace(PRECACHE_PATHS_TOKEN, JSON.stringify(precachePaths));
}

export function pwaServiceWorkerPlugin(): Plugin {
  let resolvedConfig: ResolvedConfig | undefined;
  return {
    name: 'polybool2d-pwa-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      resolvedConfig = config;
    },
    generateBundle(_options, bundle) {
      if (!resolvedConfig) {
        throw new Error('Vite config was not resolved before PWA generation.');
      }
      const template = readFileSync(
        resolve(resolvedConfig.root, SERVICE_WORKER_TEMPLATE),
        'utf8',
      );
      const bundleAssets = Object.values(bundle)
        .filter(
          (output) =>
            output.fileName !== 'sw.js' &&
            !output.fileName.endsWith('.map'),
        )
        .map((output) => ({
          path: output.fileName,
          source: output.type === 'chunk' ? output.code : output.source,
        }));
      const publicAssets = listPublicAssets(resolvedConfig.publicDir);
      const precachePaths = collectPrecachePaths(
        bundleAssets.map(({ path }) => path),
        publicAssets.map(({ path }) => path),
      );
      const generation = createPwaGeneration(
        template,
        [...bundleAssets, ...publicAssets],
      );
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: renderServiceWorker(template, generation, precachePaths),
      });
    },
  };
}
