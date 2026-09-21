// Path and browser-storage isolation for the authenticated staging gateway.
export function workspaceBase(pathname) {
  return /^\/workspaces\/[123]\//.exec(pathname)?.[0].slice(0, -1) || '';
}
export function workspacePath(base, path) {
  if (!['', '/workspaces/1', '/workspaces/2', '/workspaces/3'].includes(base) || !path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid workspace path');
  return base + path;
}
export function scopedStorage(storage, base) {
  const key = name => base ? `${base}:${name}` : name;
  return { getItem: name => storage.getItem(key(name)), setItem: (name, value) => storage.setItem(key(name), value), removeItem: name => storage.removeItem(key(name)) };
}
