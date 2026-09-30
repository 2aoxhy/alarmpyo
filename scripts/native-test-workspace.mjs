// Native verification needs source, not previous release bundles or personal attachments.
const excludedRoots = new Set([
  '.artifacts', '.codex-remote-attachments', '.expo', '.git', '.release',
  'android', 'ios', 'node_modules', 'dist',
]);

export function includeNativeTestSource(relativePath) {
  if (!relativePath) return true;
  const parts = relativePath.split(/[\\/]/u);
  if (parts.includes('..') || excludedRoots.has(parts[0])) return false;
  if (parts[0] === 'public' && parts[1] === 'downloads') return false;
  if (parts[0] === 'modules' && parts.some((part) => part === 'build' || part === '.gradle')) return false;
  return !/\.(?:apk|aab)$/iu.test(relativePath);
}
