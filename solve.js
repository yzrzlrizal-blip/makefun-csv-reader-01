// A fast CSV reader with exactly csv-reader 1.0.0's broken-row policy.
//
// run({text, header}) -> {columns, rows, errors}. Written from the policy
// (BOM dropped; LF/CRLF end records; a lone CR outside quotes is dropped with
// stray_cr; a field opening with a quote runs to the next undoubled quote,
// "" inside is one quote, CR/CRLF inside become LF, trailing junk is appended
// as-is with quote_junk; a quote that never closes is a literal and the rest
// is re-read unquoted with unterminated_quote; rows are padded/cut to the
// first record's width with short_row/long_row), not from the reference code.
//
// Speed comes from never walking character by character on the common path:
// a record whose line holds no quote and no CR (other than a CRLF ending) is
// taken whole with one slice + split(','), and every other field is cut out
// with indexOf jumps over the stretches between delimiters. Only quoted
// fields with escapes or embedded line breaks, stray CRs and quote junk take
// a slower segmented path.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break:
  // a CR not followed by LF is dropped (stray_cr). Returns the field and how
  // it ended; `added` counts the characters kept here (not the starting value).
  //
  // The field ends at the first comma or LF, or at the end of the text; a CR
  // in it is a stray one unless it sits right before that terminating LF
  // (CRLF). So the field is one slice, and only a CR inside it needs a
  // second look.
  function readUnquoted(value) {
    let added = 0;
    const p = pos;
    const c = text.indexOf(',', p);
    const n = text.indexOf('\n', p);
    let end;
    let ended;
    if (c !== -1 && (n === -1 || c < n)) {
      end = c;
      ended = COMMA;
    } else if (n !== -1) {
      end = n;
      ended = LINE_BREAK;
    } else {
      end = len;
      ended = END;
    }
    let field = text.slice(p, end);
    if (ended === LINE_BREAK && field.charCodeAt(field.length - 1) === 13) {
      field = field.slice(0, -1); // the CR of a CRLF
    }
    const ri = field.indexOf('\r');
    if (ri !== -1) {
      // Every CR left in the field is a lone one: drop it, one stray_cr each.
      let out = '';
      let s = 0;
      for (;;) {
        const r = field.indexOf('\r', s);
        if (r === -1) {
          out += field.slice(s);
          break;
        }
        out += field.slice(s, r);
        error('stray_cr');
        s = r + 1;
      }
      field = out;
    }
    if (field.length !== 0) {
      value += field;
      added += field.length;
    }
    if (ended === COMMA) {
      pos = end + 1;
      return { value, ended: COMMA, added };
    }
    if (ended === LINE_BREAK) {
      pos = end + 1;
      line += 1;
      return { value, ended: LINE_BREAK, added };
    }
    pos = len;
    return { value, ended: END, added };
  }

  // The content of a quoted field between `a` and `b` (exclusive), where every
  // quote is one of a "" pair: "" becomes one quote, each CRLF or lone CR
  // becomes LF, and every line break counted is one more line.
  function readQuotedContent(a, b) {
    let out = '';
    let p = a;
    while (p < b) {
      const seg = text.slice(p, b);
      const qi = seg.indexOf('"');
      const ri = seg.indexOf('\r');
      const ni = seg.indexOf('\n');
      let m = -1;
      let kind = -1; // 0: doubled quote, 1: CR, 2: LF
      if (qi !== -1) {
        m = qi;
        kind = 0;
      }
      if (ri !== -1 && (m === -1 || ri < m)) {
        m = ri;
        kind = 1;
      }
      if (ni !== -1 && (m === -1 || ni < m)) {
        m = ni;
        kind = 2;
      }
      if (m === -1) {
        out += seg;
        break;
      }
      if (m !== 0) out += seg.slice(0, m);
      if (kind === 0) {
        out += '"';
        p += m + 2;
      } else if (kind === 1) {
        out += '\n';
        line += 1;
        p += text[p + m + 1] === '\n' ? m + 2 : m + 1;
      } else {
        out += '\n';
        line += 1;
        p += m + 1;
      }
    }
    return out;
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let p = open + 1;
    let escaped = false;
    let q;
    for (;;) {
      q = text.indexOf('"', p);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        return readUnquoted('"');
      }
      if (text[q + 1] === '"') {
        escaped = true;
        p = q + 2;
        continue;
      }
      break;
    }
    let value;
    const content = text.slice(open + 1, q);
    if (!escaped && content.indexOf('\r') === -1 && content.indexOf('\n') === -1) {
      value = content;
    } else {
      value = readQuotedContent(open + 1, q);
    }
    pos = q + 1;
    if (pos >= len) return { value, ended: END };
    const c = text[pos];
    if (c === ',') {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === '\n') {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === '\r' && text[pos + 1] === '\n') {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  // Finishes a record that is not the "no characters" non-record: the header,
  // or a row padded/cut to the first record's width.
  function finishRecord(fields) {
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      if (text[pos] === '\n') {
        pos += 1;
        line += 1;
      } else if (text[pos] === '\r' && text[pos + 1] === '\n') {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the whole record is one plain line. The line holds no quote
    // and no CR other than a CRLF ending, so no field can be quoted, span a
    // line, or hide a stray CR: one slice and one split is the record.
    const lf = text.indexOf('\n', pos);
    const end = lf === -1 ? len : lf;
    const contentEnd = lf !== -1 && text[lf - 1] === '\r' ? lf - 1 : end;
    const lineText = text.slice(pos, contentEnd);
    if (lineText.indexOf('"') === -1 && lineText.indexOf('\r') === -1) {
      pos = lf === -1 ? len : lf + 1;
      line += 1;
      finishRecord(lineText.split(','));
      continue;
    }

    // Slow path: the record holds a quote or a CR; read it field by field.
    const fields = [];
    let field;
    let quoted;
    do {
      quoted = text[pos] === '"';
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    finishRecord(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
