import type {
  BankRow,
  GatewayRow,
  LedgerRow,
  SyntheticBatch,
} from './reconciliation.ts';
import { sha256HexSync } from './sha256.ts';

export type ImportSource = 'ledger' | 'gateway' | 'bank';
export type ImportedRow = LedgerRow | GatewayRow | BankRow;

export interface ImportIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  row?: number;
  field?: string;
}

export interface SourceImportResult {
  source: ImportSource;
  fileName: string;
  format: 'csv' | 'json';
  rows: ImportedRow[];
  rawRowCount: number;
  mapping: Record<string, string>;
  issues: ImportIssue[];
  controlTotalPaise: number;
  sha256: string;
}

export interface ImportBundle {
  ledger: SourceImportResult | null;
  gateway: SourceImportResult | null;
  bank: SourceImportResult | null;
}

export interface ImportManifest {
  schemaVersion: '1.0';
  mode: 'browser-local-import';
  createdAt: string;
  inputSha256: string;
  cutoffDate: string;
  openingCashPaise: number;
  currency: 'INR';
  sourceRows: number;
  acceptedRows: number;
  rejectedRows: number;
  errors: number;
  warnings: number;
  sources: Array<{
    source: ImportSource;
    fileName: string;
    sha256: string;
    rawRows: number;
    acceptedRows: number;
    controlTotalPaise: number;
    mapping: Record<string, string>;
  }>;
}

interface RawRecord {
  row: number;
  values: Record<string, unknown>;
}

interface FieldSpec {
  canonical: string;
  aliases: string[];
  required?: boolean;
}

const MAX_ROWS = 10_000;

const schemas: Record<ImportSource, FieldSpec[]> = {
  ledger: [
    { canonical: 'id', aliases: ['id', 'rowid', 'ledgerid', 'entryid'] },
    {
      canonical: 'orderId',
      aliases: ['orderid', 'merchantorderid', 'invoiceid', 'paymentreference'],
      required: true,
    },
    { canonical: 'receipt', aliases: ['receipt', 'receiptid', 'receiptnumber'] },
    {
      canonical: 'bookedAt',
      aliases: ['bookedat', 'bookeddate', 'transactiondate', 'postingdate', 'date'],
      required: true,
    },
    { canonical: 'customer', aliases: ['customer', 'customername', 'party', 'accountname'] },
    {
      canonical: 'amountPaise',
      aliases: ['amountpaise', 'amountinr', 'amount', 'grossamount', 'invoiceamount'],
      required: true,
    },
    {
      canonical: 'settlementId',
      aliases: ['settlementid', 'expectedsettlementid', 'payoutid', 'batchid'],
    },
    { canonical: 'currency', aliases: ['currency', 'currencycode'], required: true },
  ],
  gateway: [
    { canonical: 'id', aliases: ['id', 'rowid', 'transactionid', 'paymentid', 'eventid'] },
    { canonical: 'type', aliases: ['type', 'transactiontype', 'eventtype'], required: true },
    { canonical: 'orderId', aliases: ['orderid', 'merchantorderid', 'invoiceid'] },
    { canonical: 'description', aliases: ['description', 'narration', 'notes', 'remarks'] },
    {
      canonical: 'createdAt',
      aliases: ['createdat', 'capturedat', 'transactiondate', 'date'],
      required: true,
    },
    {
      canonical: 'settlementId',
      aliases: ['settlementid', 'payoutid', 'batchid'],
      required: true,
    },
    {
      canonical: 'settlementUtr',
      aliases: ['settlementutr', 'utr', 'bankreference', 'settlementreference'],
    },
    {
      canonical: 'creditPaise',
      aliases: ['creditpaise', 'creditinr', 'credit', 'grosscredit', 'amountinr', 'amount'],
      required: true,
    },
    {
      canonical: 'debitPaise',
      aliases: ['debitpaise', 'debitinr', 'debit', 'deductioninr', 'deduction'],
      required: true,
    },
    { canonical: 'feePaise', aliases: ['feepaise', 'feeinr', 'fee', 'gatewayfee'] },
    { canonical: 'taxPaise', aliases: ['taxpaise', 'taxinr', 'tax', 'gst'] },
    { canonical: 'currency', aliases: ['currency', 'currencycode'], required: true },
  ],
  bank: [
    { canonical: 'id', aliases: ['id', 'rowid', 'transactionid', 'banktransactionid'] },
    {
      canonical: 'postedAt',
      aliases: ['postedat', 'postingdate', 'valuedate', 'transactiondate', 'date'],
      required: true,
    },
    { canonical: 'direction', aliases: ['direction', 'drcr', 'creditdebit'], required: true },
    {
      canonical: 'amountPaise',
      aliases: ['amountpaise', 'amountinr', 'amount', 'transactionamount'],
      required: true,
    },
    { canonical: 'utr', aliases: ['utr', 'bankreference', 'reference', 'rrn'] },
    { canonical: 'narration', aliases: ['narration', 'description', 'remarks', 'details'] },
    { canonical: 'kind', aliases: ['kind', 'category', 'transactionkind'] },
    { canonical: 'currency', aliases: ['currency', 'currencycode'], required: true },
  ],
};

function normalizedHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dangerousSpreadsheetValue(value: string) {
  return /^[=+@]/.test(value) || /^-(?!\d(?:\.\d+)?$)/.test(value);
}

function parseCsv(text: string) {
  const input = text.replace(/^\uFEFF/, '');
  const rows: Array<{ line: number; cells: string[] }> = [];
  const issues: ImportIssue[] = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;

  const pushRow = () => {
    cells.push(field);
    if (cells.some((cell) => cell.trim() !== '')) {
      rows.push({ line: rowLine, cells });
    }
    cells = [];
    field = '';
    rowLine = line;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (inQuotes) {
      if (char === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
        if (char === '\n') line += 1;
      }
      continue;
    }
    if (char === '"' && field.length === 0) {
      inQuotes = true;
    } else if (char === ',') {
      cells.push(field);
      field = '';
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      pushRow();
      line += 1;
      rowLine = line;
    } else {
      field += char;
    }
  }
  if (inQuotes) {
    issues.push({
      severity: 'error',
      code: 'UNCLOSED_QUOTE',
      message: 'The CSV ends inside a quoted field.',
      row: rowLine,
    });
  }
  if (field.length > 0 || cells.length > 0) pushRow();
  return { rows, issues };
}

function csvRecords(text: string) {
  const parsed = parseCsv(text);
  if (parsed.rows.length === 0) {
    return {
      records: [] as RawRecord[],
      headers: [] as string[],
      issues: [
        ...parsed.issues,
        { severity: 'error' as const, code: 'EMPTY_FILE', message: 'No header row was found.' },
      ],
    };
  }
  const headers = parsed.rows[0].cells.map((value) => value.trim());
  const issues = [...parsed.issues];
  const normalized = headers.map(normalizedHeader);
  const duplicateHeaders = normalized.filter(
    (value, index) => value && normalized.indexOf(value) !== index,
  );
  if (duplicateHeaders.length) {
    issues.push({
      severity: 'error',
      code: 'DUPLICATE_HEADER',
      message: `Duplicate headers: ${[...new Set(duplicateHeaders)].join(', ')}.`,
      row: parsed.rows[0].line,
    });
  }
  const records: RawRecord[] = [];
  parsed.rows.slice(1).forEach(({ cells, line }) => {
    if (cells.length !== headers.length) {
      issues.push({
        severity: 'error',
        code: 'RAGGED_ROW',
        message: `Expected ${headers.length} cells but found ${cells.length}.`,
        row: line,
      });
      return;
    }
    records.push({
      row: line,
      values: Object.fromEntries(headers.map((header, index) => [header, cells[index]])),
    });
  });
  return { records, headers, issues };
}

function jsonRecords(source: ImportSource, text: string) {
  const issues: ImportIssue[] = [];
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    return {
      records: [] as RawRecord[],
      headers: [] as string[],
      issues: [
        { severity: 'error' as const, code: 'INVALID_JSON', message: 'The JSON file could not be parsed.' },
      ],
    };
  }
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? (value as Record<string, unknown>)[source]
      : null;
  if (!Array.isArray(rows)) {
    return {
      records: [] as RawRecord[],
      headers: [] as string[],
      issues: [
        { severity: 'error' as const, code: 'MISSING_JSON_ARRAY', message: `Expected a JSON array or a “${source}” array.` },
      ],
    };
  }
  const records = rows.flatMap((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      issues.push({
        severity: 'error',
        code: 'INVALID_JSON_ROW',
        message: 'Each JSON row must be an object.',
        row: index + 2,
      });
      return [];
    }
    return [{ row: index + 2, values: row as Record<string, unknown> }];
  });
  const headers = [...new Set(records.flatMap((row) => Object.keys(row.values)))];
  return { records, headers, issues };
}

function detectMapping(source: ImportSource, headers: string[]) {
  const issues: ImportIssue[] = [];
  const mapping: Record<string, string> = {};
  const normalized = headers.map((header) => ({ header, normalized: normalizedHeader(header) }));
  schemas[source].forEach((field) => {
    const aliases = new Set(field.aliases.map(normalizedHeader));
    const candidates = normalized.filter((item) => aliases.has(item.normalized));
    if (candidates.length === 1) {
      mapping[field.canonical] = candidates[0].header;
    } else if (candidates.length > 1) {
      issues.push({
        severity: 'error',
        code: 'AMBIGUOUS_MAPPING',
        field: field.canonical,
        message: `${field.canonical} matches multiple columns: ${candidates.map((item) => item.header).join(', ')}.`,
      });
    } else if (field.required) {
      issues.push({
        severity: 'error',
        code: 'MISSING_COLUMN',
        field: field.canonical,
        message: `Required field “${field.canonical}” was not detected.`,
      });
    }
  });
  return { mapping, issues };
}

function cell(record: RawRecord, mapping: Record<string, string>, field: string) {
  const key = mapping[field];
  const value = key ? record.values[key] : '';
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return JSON.stringify(value).trim();
}

function textValue(
  raw: string,
  source: ImportSource,
  record: RawRecord,
  field: string,
  issues: ImportIssue[],
  required = false,
) {
  if (required && !raw) {
    issues.push({
      severity: 'error',
      code: 'MISSING_VALUE',
      message: `${field} is required.`,
      row: record.row,
      field,
    });
  }
  if (raw && dangerousSpreadsheetValue(raw)) {
    issues.push({
      severity: 'error',
      code: 'FORMULA_LIKE_VALUE',
      message: `${field} starts like a spreadsheet formula and was blocked.`,
      row: record.row,
      field,
    });
  }
  if (raw.length > 500) {
    issues.push({
      severity: 'error',
      code: 'VALUE_TOO_LONG',
      message: `${field} exceeds the 500-character limit.`,
      row: record.row,
      field,
    });
  }
  return raw.replaceAll('\0', '');
}

export function parseInrToPaise(rawValue: string, isPaise = false) {
  const raw = rawValue
    .trim()
    .replace(/^(?:INR|Rs\.?|₹)\s*/i, '')
    .replaceAll(',', '');
  if (isPaise) {
    if (!/^\d+$/.test(raw)) return null;
    const paise = Number(raw);
    return Number.isSafeInteger(paise) ? paise : null;
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(paise) ? paise : null;
}

function moneyValue(
  record: RawRecord,
  mapping: Record<string, string>,
  field: string,
  issues: ImportIssue[],
  options: { required?: boolean; positive?: boolean } = {},
) {
  const raw = cell(record, mapping, field);
  if (!raw && !options.required) return 0;
  const mappedHeader = mapping[field] ?? '';
  const paise = parseInrToPaise(raw, normalizedHeader(mappedHeader).includes('paise'));
  if (paise === null || (options.positive ? paise <= 0 : paise < 0)) {
    issues.push({
      severity: 'error',
      code: 'INVALID_AMOUNT',
      message: `${field} must be ${options.positive ? 'positive ' : ''}INR with at most two decimal places.`,
      row: record.row,
      field,
    });
    return 0;
  }
  return paise;
}

export function normalizeImportDate(raw: string) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(raw);
  const dayFirst = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const parts = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : dayFirst
      ? [Number(dayFirst[3]), Number(dayFirst[2]), Number(dayFirst[1])]
      : null;
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dateValue(
  record: RawRecord,
  mapping: Record<string, string>,
  field: string,
  issues: ImportIssue[],
) {
  const raw = cell(record, mapping, field);
  const date = normalizeImportDate(raw);
  if (!date) {
    issues.push({
      severity: 'error',
      code: 'INVALID_DATE',
      message: `${field} must be YYYY-MM-DD or unambiguous DD/MM/YYYY.`,
      row: record.row,
      field,
    });
  }
  return date ?? '1970-01-01';
}

function validateCurrency(
  record: RawRecord,
  mapping: Record<string, string>,
  issues: ImportIssue[],
) {
  const currency = cell(record, mapping, 'currency');
  if (!currency) {
    issues.push({
      severity: 'error',
      code: 'MISSING_CURRENCY',
      message: 'Currency must be supplied explicitly on every row; implicit INR is not accepted.',
      row: record.row,
      field: 'currency',
    });
  } else if (currency.toUpperCase() !== 'INR') {
    issues.push({
      severity: 'error',
      code: 'UNSUPPORTED_CURRENCY',
      message: `Currency “${currency}” is unsupported; split the batch and import INR only.`,
      row: record.row,
      field: 'currency',
    });
  }
}

function normalizeRows(
  source: ImportSource,
  records: RawRecord[],
  mapping: Record<string, string>,
) {
  const issues: ImportIssue[] = [];
  const rows: ImportedRow[] = [];
  const ids = new Set<string>();
  records.slice(0, MAX_ROWS).forEach((record) => {
    const before = issues.length;
    validateCurrency(record, mapping, issues);
    const idRaw = cell(record, mapping, 'id');
    const id = textValue(
      idRaw || `${source}_${sha256HexSync(JSON.stringify(record.values)).slice(0, 16)}`,
      source,
      record,
      'id',
      issues,
      true,
    );
    if (ids.has(id)) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_ID',
        message: `Duplicate source ID “${id}”.`,
        row: record.row,
        field: 'id',
      });
    }

    let normalizedRow: ImportedRow;
    if (source === 'ledger') {
      normalizedRow = {
        id,
        orderId: textValue(cell(record, mapping, 'orderId'), source, record, 'orderId', issues, true),
        receipt: textValue(cell(record, mapping, 'receipt'), source, record, 'receipt', issues),
        bookedAt: dateValue(record, mapping, 'bookedAt', issues),
        customer: textValue(cell(record, mapping, 'customer'), source, record, 'customer', issues) || 'Unspecified',
        amountPaise: moneyValue(record, mapping, 'amountPaise', issues, { required: true, positive: true }),
        settlementId: textValue(cell(record, mapping, 'settlementId'), source, record, 'settlementId', issues),
        currency: 'INR',
      } satisfies LedgerRow;
    } else if (source === 'gateway') {
      const type = cell(record, mapping, 'type').toLowerCase();
      if (!['payment', 'refund', 'adjustment'].includes(type)) {
        issues.push({ severity: 'error', code: 'INVALID_TYPE', message: 'type must be payment, refund, or adjustment.', row: record.row, field: 'type' });
      }
      const orderId = textValue(cell(record, mapping, 'orderId'), source, record, 'orderId', issues);
      const description = textValue(cell(record, mapping, 'description'), source, record, 'description', issues);
      if (!orderId && !description) {
        issues.push({ severity: 'error', code: 'MISSING_REFERENCE', message: 'Gateway rows need orderId or description.', row: record.row });
      }
      const creditPaise = moneyValue(record, mapping, 'creditPaise', issues, { required: true });
      const debitPaise = moneyValue(record, mapping, 'debitPaise', issues, { required: true });
      const feePaise = moneyValue(record, mapping, 'feePaise', issues);
      const taxPaise = moneyValue(record, mapping, 'taxPaise', issues);
      if (creditPaise === 0 && debitPaise === 0) {
        issues.push({ severity: 'error', code: 'ZERO_GATEWAY_ROW', message: 'Gateway credit and debit cannot both be zero.', row: record.row });
      }
      if (
        !Number.isSafeInteger(feePaise + taxPaise) ||
        feePaise + taxPaise > debitPaise
      ) {
        issues.push({ severity: 'error', code: 'INVALID_DEDUCTION_BREAKDOWN', message: 'fee + tax cannot exceed the signed gateway debit.', row: record.row });
      }
      normalizedRow = {
        id,
        type: type as GatewayRow['type'],
        orderId: orderId || null,
        description,
        createdAt: dateValue(record, mapping, 'createdAt', issues),
        settlementId: textValue(cell(record, mapping, 'settlementId'), source, record, 'settlementId', issues, true),
        settlementUtr: textValue(cell(record, mapping, 'settlementUtr'), source, record, 'settlementUtr', issues),
        creditPaise,
        debitPaise,
        feePaise,
        taxPaise,
        currency: 'INR',
      } satisfies GatewayRow;
    } else {
      const direction = cell(record, mapping, 'direction').toLowerCase();
      if (!['credit', 'debit'].includes(direction)) {
        issues.push({ severity: 'error', code: 'INVALID_DIRECTION', message: 'direction must be credit or debit.', row: record.row, field: 'direction' });
      }
      const utr = textValue(cell(record, mapping, 'utr'), source, record, 'utr', issues);
      const explicitKind = cell(record, mapping, 'kind').toLowerCase();
      if (explicitKind && !['settlement', 'operating'].includes(explicitKind)) {
        issues.push({ severity: 'error', code: 'INVALID_KIND', message: 'kind must be settlement or operating.', row: record.row, field: 'kind' });
      }
      const kind = explicitKind || (direction === 'credit' && utr ? 'settlement' : 'operating');
      normalizedRow = {
        id,
        postedAt: dateValue(record, mapping, 'postedAt', issues),
        direction: direction as BankRow['direction'],
        amountPaise: moneyValue(record, mapping, 'amountPaise', issues, { required: true, positive: true }),
        utr: utr || null,
        narration: textValue(cell(record, mapping, 'narration'), source, record, 'narration', issues),
        kind: kind as BankRow['kind'],
        currency: 'INR',
      } satisfies BankRow;
    }
    if (issues.length === before) {
      ids.add(id);
      rows.push(normalizedRow);
    }
  });
  if (records.length > MAX_ROWS) {
    issues.push({ severity: 'error', code: 'ROW_LIMIT', message: `Files are limited to ${MAX_ROWS.toLocaleString()} rows per source.` });
  }
  return { rows, issues };
}

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function parseSourceText(
  source: ImportSource,
  fileName: string,
  text: string,
): Promise<SourceImportResult> {
  const trimmed = text.replace(/^\uFEFF/, '').trimStart();
  const format = fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{')
    ? 'json'
    : 'csv';
  const parsed = format === 'json' ? jsonRecords(source, text) : csvRecords(text);
  const detected = detectMapping(source, parsed.headers);
  const normalized = normalizeRows(source, parsed.records, detected.mapping);
  const issues = [...parsed.issues, ...detected.issues, ...normalized.issues];
  if (parsed.records.length === 0 && !issues.some((issue) => issue.code === 'EMPTY_FILE')) {
    issues.push({ severity: 'error', code: 'NO_ROWS', message: 'No data rows were found.' });
  }
  const checkedTotal = (values: number[], label: string) => {
    let total = 0;
    for (const value of values) {
      total += value;
      if (!Number.isSafeInteger(total)) {
        issues.push({
          severity: 'error',
          code: 'CONTROL_TOTAL_OVERFLOW',
          message: `${label} exceeds the safe integer-paise range. Split the file before closing.`,
        });
        return null;
      }
    }
    return total;
  };
  let controlTotalPaise = 0;
  if (source === 'ledger') {
    controlTotalPaise =
      checkedTotal(
        (normalized.rows as LedgerRow[]).map((row) => row.amountPaise),
        'ERP control total',
      ) ?? 0;
  } else if (source === 'gateway') {
    const gatewayRows = normalized.rows as GatewayRow[];
    const credits = checkedTotal(
      gatewayRows.map((row) => row.creditPaise),
      'Gateway credit total',
    );
    const debits = checkedTotal(
      gatewayRows.map((row) => row.debitPaise),
      'Gateway debit total',
    );
    checkedTotal(gatewayRows.map((row) => row.feePaise), 'Gateway fee total');
    checkedTotal(gatewayRows.map((row) => row.taxPaise), 'Gateway tax total');
    controlTotalPaise = credits === null || debits === null ? 0 : credits - debits;
  } else {
    const bankRows = normalized.rows as BankRow[];
    const total = checkedTotal(
      bankRows.map((row) => row.amountPaise),
      'Bank absolute total',
    );
    controlTotalPaise =
      total === null
        ? 0
        : bankRows.reduce(
            (sum, row) =>
              sum +
              (row.direction === 'credit' ? row.amountPaise : -row.amountPaise),
            0,
          );
  }
  return {
    source,
    fileName,
    format,
    rows: normalized.rows,
    rawRowCount: parsed.records.length,
    mapping: detected.mapping,
    issues,
    controlTotalPaise,
    sha256: await sha256Hex(text),
  };
}

export async function parseBatchPack(fileName: string, text: string): Promise<ImportBundle> {
  return {
    ledger: await parseSourceText('ledger', fileName, text),
    gateway: await parseSourceText('gateway', fileName, text),
    bank: await parseSourceText('bank', fileName, text),
  };
}

function csvCell(value: unknown) {
  const raw = value === null || value === undefined
    ? ''
    : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : JSON.stringify(value);
  const safe = /^[=+@]/.test(raw) || /^-(?!\d)/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function csvTable(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function demoBatchCsvs(batch: SyntheticBatch) {
  return {
    ledger: csvTable(
      ['order_id', 'receipt', 'booked_at', 'customer', 'amount_inr', 'currency'],
      batch.ledger.map((row) => [row.orderId, row.receipt, row.bookedAt, row.customer, (row.amountPaise / 100).toFixed(2), row.currency]),
    ),
    gateway: csvTable(
      ['transaction_id', 'type', 'order_id', 'description', 'created_at', 'settlement_id', 'settlement_utr', 'credit_inr', 'debit_inr', 'fee_inr', 'tax_inr', 'currency'],
      batch.gateway.map((row) => [row.id, row.type, row.orderId ?? '', row.description, row.createdAt, row.settlementId, row.settlementUtr, (row.creditPaise / 100).toFixed(2), (row.debitPaise / 100).toFixed(2), (row.feePaise / 100).toFixed(2), (row.taxPaise / 100).toFixed(2), row.currency]),
    ),
    bank: csvTable(
      ['transaction_id', 'posted_at', 'direction', 'amount_inr', 'utr', 'narration', 'currency'],
      batch.bank.map((row) => [row.id, row.postedAt, row.direction, (row.amountPaise / 100).toFixed(2), row.utr ?? '', row.narration, row.currency]),
    ),
  };
}

export function importInput(bundle: ImportBundle) {
  if (!bundle.ledger || !bundle.gateway || !bundle.bank) return null;
  if ([bundle.ledger, bundle.gateway, bundle.bank].some((source) => source.issues.some((issue) => issue.severity === 'error'))) return null;
  return {
    ledger: bundle.ledger.rows as LedgerRow[],
    gateway: bundle.gateway.rows as GatewayRow[],
    bank: bundle.bank.rows as BankRow[],
  };
}

export function suggestedCutoff(bundle: ImportBundle) {
  const input = importInput(bundle);
  if (!input) return '';
  return [...input.ledger.map((row) => row.bookedAt), ...input.gateway.map((row) => row.createdAt), ...input.bank.map((row) => row.postedAt)].sort().at(-1) ?? '';
}

export async function buildImportManifest(
  bundle: ImportBundle,
  cutoffDate: string,
  openingCashPaise: number,
): Promise<ImportManifest> {
  const sources = [bundle.ledger, bundle.gateway, bundle.bank].filter(
    (source): source is SourceImportResult => Boolean(source),
  );
  const issues = sources.flatMap((source) => source.issues);
  const acceptedRows = sources.reduce((sum, source) => sum + source.rows.length, 0);
  const sourceRows = sources.reduce((sum, source) => sum + source.rawRowCount, 0);
  const canonical = importInput(bundle);
  return {
    schemaVersion: '1.0',
    mode: 'browser-local-import',
    createdAt: new Date().toISOString(),
    inputSha256: await sha256Hex(JSON.stringify(canonical)),
    cutoffDate,
    openingCashPaise,
    currency: 'INR',
    sourceRows,
    acceptedRows,
    rejectedRows: sourceRows - acceptedRows,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
    sources: sources.map((source) => ({
      source: source.source,
      fileName: source.fileName,
      sha256: source.sha256,
      rawRows: source.rawRowCount,
      acceptedRows: source.rows.length,
      controlTotalPaise: source.controlTotalPaise,
      mapping: source.mapping,
    })),
  };
}

export function templatePackJson() {
  return JSON.stringify(
    {
      ledger: [{ order_id: 'ORDER-1001', booked_at: '2026-08-31', amount_inr: '1250.00', currency: 'INR', receipt: 'RCP-1001', customer: 'Example customer' }],
      gateway: [{ transaction_id: 'PAY-1001', type: 'payment', order_id: 'ORDER-1001', description: 'Captured payment', created_at: '2026-08-31', settlement_id: 'SETL-1001', settlement_utr: 'UTR-1001', credit_inr: '1250.00', debit_inr: '0.00', fee_inr: '0.00', tax_inr: '0.00', currency: 'INR' }],
      bank: [{ transaction_id: 'BANK-1001', posted_at: '2026-08-31', direction: 'credit', amount_inr: '1250.00', utr: 'UTR-1001', narration: 'Gateway settlement', currency: 'INR' }],
    },
    null,
    2,
  );
}
