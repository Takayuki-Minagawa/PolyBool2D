import type { Project } from '../app/projectTypes';
import {
  decodeProject,
  serializeProject,
  type ProjectDecodeResult,
} from './projectCodec';

export const SHARE_HASH_PREFIX = '#pb2d=';
export const MAX_SHARE_HASH_LENGTH = 8_000;
export const MAX_SHARED_PROJECT_BYTES = 5_000_000;

const GZIP_PREFIX = 'gz.';
const RAW_PREFIX = 'raw.';

export type SharedProjectSourceDecodeResult = {
  decodeResult: ProjectDecodeResult;
  sourceJson: string;
};

export type SharedProjectSourceDecodeFailureReason =
  | 'malformed-payload'
  | 'payload-too-large'
  | 'decompression-unavailable'
  | 'decompression-failed';

export type SharedProjectSourceDecodeOutcome =
  | {
      ok: true;
      value: SharedProjectSourceDecodeResult;
    }
  | {
      ok: false;
      reason: SharedProjectSourceDecodeFailureReason;
      retryable: boolean;
    };

type SharedProjectSourceDecodeFailure = Extract<
  SharedProjectSourceDecodeOutcome,
  { ok: false }
>;

type SharedProjectBytesDecodeOutcome =
  | {
      ok: true;
      value: Uint8Array;
    }
  | SharedProjectSourceDecodeFailure;

function decodeFailure(
  reason: SharedProjectSourceDecodeFailureReason,
  retryable = false,
): SharedProjectSourceDecodeFailure {
  return { ok: false, reason, retryable };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const stream = new Blob([buffer]).stream().pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

function hasGzipHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 18 &&
    bytes[0] === 0x1f &&
    bytes[1] === 0x8b &&
    bytes[2] === 8 &&
    (bytes[3] & 0xe0) === 0
  );
}

async function gunzip(
  bytes: Uint8Array,
): Promise<SharedProjectBytesDecodeOutcome> {
  if (!hasGzipHeader(bytes)) {
    return decodeFailure('malformed-payload');
  }
  if (typeof DecompressionStream === 'undefined') {
    return decodeFailure('decompression-unavailable', true);
  }
  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        totalLength += value.byteLength;
        if (totalLength > MAX_SHARED_PROJECT_BYTES) {
          try {
            await reader.cancel();
          } catch {
            // The terminal size failure is already known.
          }
          return decodeFailure('payload-too-large');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const output = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: output };
  } catch {
    // The platform API does not expose a portable distinction between a
    // transient stream failure and corrupt DEFLATE data. Preserve the URL so
    // another browser/session can retry instead of destroying its only copy.
    return decodeFailure('decompression-failed', true);
  }
}

/** Encode a validated project payload, preferring native gzip when available. */
export async function encodeProjectForShare(project: Project): Promise<string> {
  const source = new TextEncoder().encode(serializeProject(project));
  if (source.length > MAX_SHARED_PROJECT_BYTES) {
    throw new RangeError('Project is too large to share');
  }
  const compressed = await gzip(source);
  return compressed
    ? `${GZIP_PREFIX}${bytesToBase64Url(compressed)}`
    : `${RAW_PREFIX}${bytesToBase64Url(source)}`;
}

export async function decodeSharedProjectSourceOutcome(
  payload: string,
): Promise<SharedProjectSourceDecodeOutcome> {
  let encoded: string;
  let compressed: boolean;
  if (payload.startsWith(GZIP_PREFIX)) {
    encoded = payload.slice(GZIP_PREFIX.length);
    compressed = true;
  } else if (payload.startsWith(RAW_PREFIX)) {
    encoded = payload.slice(RAW_PREFIX.length);
    compressed = false;
  } else {
    return decodeFailure('malformed-payload');
  }
  if (encoded.length === 0) return decodeFailure('malformed-payload');
  const bytes = base64UrlToBytes(encoded);
  if (!bytes) return decodeFailure('malformed-payload');
  if (!compressed && bytes.length > MAX_SHARED_PROJECT_BYTES) {
    return decodeFailure('payload-too-large');
  }
  const decoded = compressed
    ? await gunzip(bytes)
    : { ok: true as const, value: bytes };
  if (!decoded.ok) return decoded;
  try {
    const sourceJson = new TextDecoder('utf-8', { fatal: true }).decode(
      decoded.value,
    );
    return {
      ok: true,
      value: { decodeResult: decodeProject(sourceJson), sourceJson },
    };
  } catch {
    return decodeFailure('malformed-payload');
  }
}

export async function decodeSharedProjectSourceResult(
  payload: string,
): Promise<SharedProjectSourceDecodeResult | null> {
  const outcome = await decodeSharedProjectSourceOutcome(payload);
  return outcome.ok ? outcome.value : null;
}

export async function decodeSharedProjectResult(
  payload: string,
): Promise<ProjectDecodeResult | null> {
  return (await decodeSharedProjectSourceResult(payload))?.decodeResult ?? null;
}

/** Backwards-compatible nullable decoder. */
export async function decodeSharedProject(payload: string): Promise<Project | null> {
  const result = await decodeSharedProjectResult(payload);
  return result?.ok ? result.project : null;
}

export async function encodeProjectToShareHash(
  project: Project,
  maxHashLength = MAX_SHARE_HASH_LENGTH,
): Promise<string | null> {
  try {
    const hash = `${SHARE_HASH_PREFIX}${await encodeProjectForShare(project)}`;
    return hash.length <= maxHashLength ? hash : null;
  } catch {
    return null;
  }
}

export async function decodeProjectFromShareHashResult(
  hash: string,
): Promise<ProjectDecodeResult | null> {
  if (hash.length > MAX_SHARE_HASH_LENGTH || !hash.startsWith(SHARE_HASH_PREFIX)) return null;
  return decodeSharedProjectResult(hash.slice(SHARE_HASH_PREFIX.length));
}

export async function decodeProjectFromShareHashSourceResult(
  hash: string,
): Promise<SharedProjectSourceDecodeResult | null> {
  const outcome = await decodeProjectFromShareHashSourceOutcome(hash);
  return outcome.ok ? outcome.value : null;
}

export async function decodeProjectFromShareHashSourceOutcome(
  hash: string,
): Promise<SharedProjectSourceDecodeOutcome> {
  if (!hash.startsWith(SHARE_HASH_PREFIX)) {
    return decodeFailure('malformed-payload');
  }
  if (hash.length > MAX_SHARE_HASH_LENGTH) {
    return decodeFailure('payload-too-large');
  }
  return decodeSharedProjectSourceOutcome(
    hash.slice(SHARE_HASH_PREFIX.length),
  );
}

export async function decodeProjectFromShareHash(hash: string): Promise<Project | null> {
  const result = await decodeProjectFromShareHashResult(hash);
  return result?.ok ? result.project : null;
}

export async function buildShareUrl(
  project: Project,
  baseUrl = typeof window !== 'undefined' ? window.location.href : '',
  maxHashLength = MAX_SHARE_HASH_LENGTH,
): Promise<string | null> {
  const hash = await encodeProjectToShareHash(project, maxHashLength);
  if (!hash) return null;
  const withoutHash = baseUrl.split('#', 1)[0];
  return `${withoutHash}${hash}`;
}
