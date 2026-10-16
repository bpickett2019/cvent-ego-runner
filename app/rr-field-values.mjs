// Read-only interpretation of explicitly supplied workbook facts. No Cvent IDs,
// workbook discovery, filesystem writes, network, defaults or completion claims.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const MAX_TEXT = 32767, MAX_ROWS = 2000, MAX_CHOICES = 500;
const kinds = new Set(['registrationType', 'admissionItem']);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const literal = v => typeof v === 'string' && v.length <= MAX_TEXT && v.trim().length > 0;
const envelope = {scope: 'WORKBOOK_INTERPRETATION_ONLY', requirementsSatisfied: null};
const needs = (reason, nextAction, source) => ({...envelope, status: 'NEEDS_ATTENTION', reason, nextAction, ...(validSource(source) ? {source: {...source}} : {})});
const allowed = (v, fields) => object(v) && Object.keys(v).every(k => fields.includes(k));
function coordinate(value) {
  if (typeof value !== 'string') return null;
  const m = /^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})$/.exec(value);
  if (!m) return null;
  const column = [...m[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0), row = Number(m[2]);
  return column <= 16384 && row <= 1048576 ? {column, row} : null;
}
function validSource(v) {
  if (!allowed(v, ['sheet', 'cell']) || !literal(v.sheet) || v.sheet.length > 31 || /[\[\]:*?/\\\x00-\x1f]/.test(v.sheet) || typeof v.cell !== 'string') return false;
  const parts = v.cell.split(':');
  if (parts.length > 2) return false;
  const first = coordinate(parts[0]), last = coordinate(parts.at(-1));
  return !!first && !!last && first.column <= last.column && first.row <= last.row;
}

export function resolveReference(input) {
  const source = input?.source;
  if (!allowed(input, ['kind','value','source','rows']) || !kinds.has(input.kind) || !validSource(source) || !literal(input.value))
    return needs('The reference needs a literal name or code, its field type and an exact worksheet/cell.', 'Read the complete source reference before resolving it.', source);
  if (!Array.isArray(input.rows) || input.rows.length > MAX_ROWS || input.rows.some(row =>
    !allowed(row, ['kind','name','code','source']) || !kinds.has(row.kind) || !validSource(row.source) ||
    typeof row.name !== 'string' || typeof row.code !== 'string' || row.name.length > MAX_TEXT || row.code.length > MAX_TEXT ||
    (!literal(row.name) && !literal(row.code))))
    return needs('The name/code glossary is missing, malformed or exceeds the supported size.', 'Supply complete source-addressed name/code rows for this workbook.', source);
  const matches = input.rows.filter(row => row.kind === input.kind && (input.value === row.name || input.value === row.code));
  if (matches.length !== 1) return {...needs(matches.length ? 'This reference matches more than one workbook row.' : 'This name or code has no exact match in the supplied workbook glossary.',
    matches.length ? 'Confirm the intended row using the listed sources.' : 'Check the name/code and the complete mapping table; do not invent an alias.', source),
    candidates: matches.map(row => ({name: row.name, code: row.code, source: {...row.source}}))};
  const row = matches[0];
  return {...envelope, status: 'RESOLVED', source: {...source}, value: input.value, kind: input.kind,
    match: {name: row.name, code: row.code, source: {...row.source}},
    nextAction: 'Independently match this row to the selected event resource before authoring.'};
}

function parseList(value, delimiter, trimPadding) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('missing-text');
  if (value.length > MAX_TEXT) throw new Error('long-list');
  if (![';', '|'].includes(delimiter) || typeof trimPadding !== 'boolean') throw new Error('invalid-list');
  if (value.includes('\\' + delimiter)) throw new Error('unsupported-escape');
  const fields = [];
  let i = 0;
  while (true) {
    let start = i, field = '';
    if (trimPadding) while (i < value.length && /\s/.test(value[i])) i++;
    if (value[i] === '"') {
      i++;
      let closed = false;
      while (i < value.length) {
        if (value[i] !== '"') { field += value[i++]; continue; }
        if (value[i + 1] === '"') { field += '"'; i += 2; continue; }
        i++; closed = true; break;
      }
      if (!closed) throw new Error('unclosed-quote');
      while (i < value.length && /\s/.test(value[i])) i++;
      if (i < value.length && value[i] !== delimiter) throw new Error('quoted-suffix');
    } else {
      while (i < value.length && value[i] !== delimiter) i++;
      field = value.slice(start, i);
      if (field.includes('"')) throw new Error('unquoted-quote');
      if (trimPadding) field = field.trim();
    }
    if (!literal(field)) throw new Error('empty-choice');
    fields.push(field);
    if (fields.length > MAX_CHOICES) throw new Error('too-many-choices');
    if (i === value.length) break;
    i++; // Delimiter consumed; a trailing delimiter yields a rejected empty choice.
  }
  if (new Set(fields).size !== fields.length) throw new Error('duplicate-choice');
  return fields;
}

function listFailure(error, source, label) {
  const reasons = {
    'missing-text': 'the list is blank or is not literal text.',
    'long-list': 'the list exceeds 32,767 characters.',
    'invalid-list': 'the delimiter or padding option is invalid.',
    'unsupported-escape': 'backslash escaping of a delimiter is not supported.',
    'unclosed-quote': 'a quoted entry has no closing quote.',
    'quoted-suffix': 'a quoted entry has extra text after its closing quote.',
    'unquoted-quote': 'quotes must wrap a whole entry; literal quotes inside it must be doubled.',
    'empty-choice': 'the list contains an empty entry.',
    'too-many-choices': 'the list exceeds 500 entries.',
    'duplicate-choice': 'the list contains duplicate entries.',
  };
  return needs(`${label}: ${reasons[error.message] || 'the list could not be interpreted.'}`,
    'Correct this cell or use one choice per row; quote entries containing the selected delimiter.', source);
}

export function compactChoices(input) {
  const source = input?.source;
  if (!allowed(input, ['value','delimiter','source','questionSource','codes','trimPadding']) || !validSource(source) || !validSource(input.questionSource) ||
      ![';', '|'].includes(input.delimiter) || (input.trimPadding !== undefined && typeof input.trimPadding !== 'boolean'))
    return needs('A compact answer list needs its question/list sources and an explicit semicolon or pipe delimiter.', 'Confirm the column format and exact question/list cells; do not split on slashes.', source);
  if (input.codes !== undefined && (!allowed(input.codes, ['value','delimiter','source']) || !validSource(input.codes.source) || ![';', '|'].includes(input.codes.delimiter)))
    return needs('The parallel answer-code list has no valid source or declared delimiter.', 'Confirm the answer-code column and its delimiter.', source);
  let values, codes;
  try {
    values = parseList(input.value, input.delimiter, input.trimPadding ?? false);
  } catch (error) {
    return listFailure(error, source, 'Answer choices');
  }
  if (input.codes !== undefined) {
    try { codes = parseList(input.codes.value, input.codes.delimiter, input.trimPadding ?? false); }
    catch (error) { return listFailure(error, input.codes.source, 'Answer codes'); }
  }
  if (codes && codes.length !== values.length)
    return {...needs('Answer text and answer-code lists contain different numbers of entries.', 'Provide one corresponding code for each answer, in the same order.', input.codes.source), answerTextSource: {...source}};
  return {...envelope, status: 'RESOLVED', questionSource: {...input.questionSource}, delimiter: input.delimiter,
    choices: values.map((text, index) => ({index: index + 1, text, code: codes ? codes[index] : null,
      source: {...source}, ...(codes ? {codeSource: {...input.codes.source}} : {})})),
    nextAction: 'Verify these choices and their relationships against the bound workbook before configuring the question.'};
}

export function interpretField(request) {
  if (!object(request)) return needs('A JSON object is required.', 'Supply an explicit supported interpretation operation.');
  const {operation, ...input} = request;
  if (operation === 'resolveReference') return resolveReference(input);
  if (operation === 'compactChoices') return compactChoices(input);
  return needs('The requested interpretation operation is unsupported.', 'Use resolveReference or compactChoices only.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let size = 0;
  try {
    const chunks = [];
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 1_048_576) throw new Error('bounded-input');
      chunks.push(chunk);
    }
    process.stdout.write(JSON.stringify(interpretField(JSON.parse(Buffer.concat(chunks).toString('utf8')))) + '\n');
  } catch {
    process.stderr.write(JSON.stringify({...envelope, status: 'NEEDS_ATTENTION', reason: 'Input must be valid JSON no larger than 1 MiB; no interpretation was completed.'}) + '\n');
    process.exitCode = 1;
  }
}
