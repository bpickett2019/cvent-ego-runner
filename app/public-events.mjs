export function activitySummary(event) {
  if (event.type === 'tool_execution_start') return `${event.tool} started`;
  if (event.type === 'tool_execution_end') return `${event.tool} ${event.outcome}; not saved-result verification`;
  if (event.type === 'rr_question') return event.kind === 'setup' ? 'Waiting for human setup / verification' : 'Waiting for clarification';
  if (event.type === 'rr_stopped') return event.cleanupFailed ? 'Stopped; cleanup requires reconciliation' : 'Execution ended';
  if (event.type === 'rr_result') return 'Execution results available';
  return null;
}

// Native events remain private evidence on disk. Public activity is an explicit
// projection, never raw text with best-effort credential/chain-of-thought regexes.
const tools = new Set(['read', 'bash', 'edit', 'write']);
const lifecycle = new Set(['agent_start', 'agent_end', 'agent_settled', 'turn_start', 'turn_end']);
export function publicEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if (lifecycle.has(event.type)) return { type: event.type };
  if (['tool_execution_start', 'tool_execution_end'].includes(event.type)) {
    return { type: event.type, tool: tools.has(event.toolName) ? event.toolName : 'tool',
      ...(event.type === 'tool_execution_end' ? { outcome: event.isError === true ? 'error' : 'finished' } : {}) };
  }
  if (event.type === 'rr_stopped') return { type: event.type, cleanupFailed: Array.isArray(event.failures) && event.failures.length > 0 };
  if (event.type === 'rr_result') return { type: event.type, status: ['DONE', 'INCOMPLETE', 'STOPPED'].includes(event.status) ? event.status : 'INCOMPLETE' };
  if (event.type === 'rr_question') return { type: event.type, kind: event.kind === 'setup' ? 'setup' : 'clarification' };
  // Includes response payloads, tool arguments/results/updates, assistant text,
  // reasoning deltas, extension dialogs and unknown future native event types.
  return null;
}
