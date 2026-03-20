import path from 'node:path';

export function argValue(argv: readonly string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx < 0) return null;
  return argv[idx + 1] || null;
}

export function setNestedValue(root: any, keys: string[], value: unknown): void {
  let cur = root;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (!cur[key] || typeof cur[key] !== 'object' || Array.isArray(cur[key])) {
      cur[key] = {};
    }
    cur = cur[key];
  }
  cur[keys[keys.length - 1]] = value;
}

export function classifyAssetExt(extValue: string): string {
  const ext = normalizeExt(extValue);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return 'audio';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext)) return 'video';
  if (['otf', 'ttf', 'woff', 'woff2'].includes(ext)) return 'fonts';
  if (['mmd', 'obj', 'fbx', 'glb', 'gltf'].includes(ext)) return 'model';
  if (['js', 'ts', 'lua', 'json', 'py'].includes(ext)) return 'code';
  if (['safetensors', 'ckpt', 'onnx'].includes(ext)) return 'ai';
  return 'other';
}

export function normalizeExt(extValue: string): string {
  return String(extValue || 'bin').toLowerCase().replace(/^\./, '') || 'bin';
}

export function fromPosix(value: string): string {
  return value.split('/').join(path.sep);
}
