// File picker and drop share the existing guarded newRR(file) operation.
// No browser provisioning, job reset, context changes or upload request lives here.
export const MAX_RR_BYTES = 30 * 1024 * 1024;
export function rrFileError(files) {
  if (files.length !== 1) return 'Choose one .xlsx workbook at a time.';
  const file = files[0];
  if (!/\.xlsx$/i.test(file?.name || '')) return 'Choose an .xlsx workbook. Other Excel formats are not supported.';
  if (!Number.isFinite(file.size) || file.size <= 0) return 'The workbook is empty or unavailable. Choose a nonempty .xlsx file.';
  if (file.size > MAX_RR_BYTES) return 'The workbook exceeds the 30 MB upload limit.';
  return '';
}
export function bindRrFileInput({ zone, input, document, isBusy, onFile, onError }) {
  let pending = false, depth = 0;
  const listeners = [];
  const on = (target, type, handler) => { target.addEventListener(type, handler); listeners.push(() => target.removeEventListener(type, handler)); };
  const fileDrag = event => Array.from(event.dataTransfer?.types || []).includes('Files') || !!event.dataTransfer?.files?.length;
  const resetHighlight = () => { depth = 0; zone.removeAttribute('data-drag-over'); };
  const blocked = () => pending || input.disabled || isBusy();
  async function accept(files) {
    // Never retain a stale raw input selection; newRR owns the saved workbook.
    input.value = '';
    if (blocked()) { onError('Wait for the current action to finish, then choose or drop the workbook again.'); return; }
    const error = rrFileError(files);
    if (error) { onError(error); return; }
    pending = true;
    try { await onFile(files[0]); }
    catch { onError('Workbook selection could not be completed. Check the upload status before trying again.'); }
    finally { pending = false; resetHighlight(); }
  }
  on(input, 'change', event => {
    const files = Array.from(event.target.files || []);
    if (files.length) void accept(files); // Cancelling the picker is a no-op.
  });
  on(zone, 'dragenter', event => {
    if (!fileDrag(event)) return;
    event.preventDefault(); event.stopPropagation(); depth++;
    if (!blocked()) zone.setAttribute('data-drag-over', 'true');
  });
  on(zone, 'dragover', event => {
    if (!fileDrag(event)) return;
    event.preventDefault(); event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = blocked() ? 'none' : 'copy';
  });
  on(zone, 'dragleave', event => {
    if (!depth) return;
    event.preventDefault(); event.stopPropagation();
    if (--depth <= 0) resetHighlight();
  });
  on(zone, 'drop', event => {
    if (!fileDrag(event)) return;
    event.preventDefault(); event.stopPropagation(); resetHighlight();
    // Capture files synchronously: browsers protect the drag data after dispatch.
    const files = Array.from(event.dataTransfer?.files || []);
    const items = Array.from(event.dataTransfer?.items || []);
    try {
      if (items.some(item => item.kind === 'file' && item.webkitGetAsEntry?.()?.isDirectory)) {
        onError('Drop one .xlsx file, not a folder.'); return;
      }
    } catch { onError('The dropped item could not be read. Use the file picker instead.'); return; }
    void accept(files);
  });
  // Prevent the browser navigating away/opening Excel when a file misses the zone.
  on(document, 'dragover', event => {
    if (!fileDrag(event)) return;
    event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
  });
  on(document, 'drop', event => {
    if (!fileDrag(event)) return;
    event.preventDefault(); resetHighlight();
    if (!zone.contains(event.target)) onError('Drop the .xlsx workbook inside the Upload RR area, or use its file picker.');
  });
  on(document, 'dragend', resetHighlight);
  return () => { for (const remove of listeners) remove(); resetHighlight(); };
}
