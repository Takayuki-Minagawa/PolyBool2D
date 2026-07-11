import type { Project } from '../app/projectTypes';
import { deserializeProject, serializeProject } from './projectCodec';

export const SHARE_HASH_PREFIX = '#pb2d=';
export const MAX_SHARE_HASH_LENGTH = 8_000;
export const MAX_SHARED_PROJECT_BYTES = 5_000_000;

const GZIP_PREFIX = 'gz.';
const RAW_PREFIX = 'raw.';

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

async function gunzip(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
    const output = new Uint8Array(await new Response(stream).arrayBuffer());
    return output.length <= MAX_SHARED_PROJECT_BYTES ? output : null;
  } catch {
    return null;
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

export async function decodeSharedProject(payload: string): Promise<Project | null> {
  let encoded: string;
  let compressed: boolean;
  if (payload.startsWith(GZIP_PREFIX)) {
    encoded = payload.slice(GZIP_PREFIX.length);
    compressed = true;
  } else if (payload.startsWith(RAW_PREFIX)) {
    encoded = payload.slice(RAW_PREFIX.length);
    compressed = false;
  } else {
    return null;
  }
  const bytes = base64UrlToBytes(encoded);
  if (!bytes) return null;
  const decoded = compressed ? await gunzip(bytes) : bytes;
  if (!decoded || decoded.length > MAX_SHARED_PROJECT_BYTES) return null;
  try {
    return deserializeProject(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
  } catch {
    return null;
  }
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

export async function decodeProjectFromShareHash(hash: string): Promise<Project | null> {
  if (hash.length > MAX_SHARE_HASH_LENGTH || !hash.startsWith(SHARE_HASH_PREFIX)) return null;
  return decodeSharedProject(hash.slice(SHARE_HASH_PREFIX.length));
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
