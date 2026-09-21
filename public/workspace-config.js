// Local development navigation only; never an authentication/tenant boundary.
export function localWorkspaceConfig(value, currentOrigin, pathname = '/') {
  const staging = value?.mode === 'staging';
  if (value?.version !== 1 || ![1, 2, 3].includes(value.current) || !Array.isArray(value.workspaces) || value.workspaces.length !== 3) throw new Error('Invalid local workspace configuration');
  const workspaces = value.workspaces.map((item, index) => {
    if (item.id !== index + 1 || typeof item.url !== 'string') throw new Error('Expected users 1, 2 and 3');
    const url = new URL(item.url);
    if (url.username || url.password || url.search || url.hash) throw new Error('Unexpected workspace URL components');
    if (staging) {
      if (url.origin !== currentOrigin || url.protocol !== 'https:' || url.pathname !== `/workspaces/${item.id}/`) throw new Error('Staging workspace must stay on its authenticated origin');
    } else if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/') throw new Error('Workspace links must be loopback app origins');
    return { id: item.id, label: `USER ${item.id}`, url: staging ? url.href : url.origin };
  });
  const expected = staging ? currentOrigin + `/workspaces/${value.current}/` : currentOrigin;
  if (new Set(workspaces.map(w => w.url)).size !== 3 || workspaces[value.current - 1].url !== expected || (staging && !pathname.startsWith(`/workspaces/${value.current}/`))) throw new Error('Workspace origin/identity mismatch');
  return { current: value.current, label: `USER ${value.current}`, workspaces, staging };
}
