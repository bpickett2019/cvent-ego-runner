// Local development navigation only; never an authentication/tenant boundary.
export function localWorkspaceConfig(value, currentOrigin) {
  if (value?.version !== 1 || ![1, 2, 3].includes(value.current) || !Array.isArray(value.workspaces) || value.workspaces.length !== 3) throw new Error('Invalid local workspace configuration');
  const workspaces = value.workspaces.map((item, index) => {
    if (item.id !== index + 1 || typeof item.url !== 'string') throw new Error('Expected users 1, 2 and 3');
    const url = new URL(item.url);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Workspace links must be loopback app origins');
    return { id: item.id, label: `USER ${item.id}`, url: url.origin };
  });
  if (new Set(workspaces.map(w => w.url)).size !== 3 || workspaces[value.current - 1].url !== currentOrigin) throw new Error('Workspace origin/identity mismatch');
  return { current: value.current, label: `USER ${value.current}`, workspaces };
}
