/**
 * Dò chuỗi giao diện CHƯA dịch — `pnpm --filter @xeprime/web i18n:audit`.
 *
 * Dùng AST của TypeScript, không phải regex trên văn bản thô. Lý do rất cụ thể: regex không
 * phân biệt được `<p>Đang tải…</p>` (chuỗi giao diện) với `// Đang tải…` (chú thích) hay
 * `queryKey: ['tải']` (khoá kỹ thuật). AST biết chính xác một chuỗi đang đứng ở VỊ TRÍ nào,
 * nên báo động của nó đáng để đi sửa thay vì đáng để thêm ignore.
 *
 * Hai lượt quét bổ sung cho nhau:
 *
 *   A. THEO VỊ TRÍ — text trong JSX; prop giao diện (`label`, `title`, `placeholder`,
 *      `aria-label`, `alt`, `message`, `description`, `okText`, `cancelText`…); thuộc tính
 *      cùng tên trong object literal (menu item, option, cột bảng, cấu hình toast/confirm);
 *      đối số chuỗi của `message.*` / `notification.*` / `Modal.confirm` và của validator Yup
 *      (`.required`, `.min`, `.matches`…). Bắt được cả chuỗi KHÔNG dấu ("Km", "Combo") mà
 *      cách dò theo dấu tiếng Việt bỏ sót.
 *
 *   B. THEO NGÔN NGỮ — mọi string/template literal có dấu tiếng Việt, ở bất kỳ đâu trong mã
 *      production. Đây là lưới bắt phần còn lại: mảnh chuỗi trong formatter (`${days} ngày`),
 *      bản đồ mã → nhãn, hằng số, message ném ra từ hook.
 *
 * Chuỗi đã đi qua `t(...)` biến mất khỏi cả hai lượt: nó không còn là JsxText, và giá trị
 * tiếng Việt nằm trong `messages/vi/*.json` chứ không trong mã nguồn.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import { AUDIT_ALLOWLIST } from './i18n-audit-allowlist.mjs';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_ROOT = path.join(WEB_ROOT, 'src');

/**
 * Thư mục/nhóm file KHÔNG phải giao diện production.
 * Cố ý hẹp: mọi thứ bị loại ở đây phải là "không bao giờ hiện ra cho người dùng", không phải
 * "chưa kịp dịch".
 */
const EXCLUDED_FILE = [
  /\.test\.[cm]?tsx?$/,
  /\.spec\.[cm]?tsx?$/,
  /[\\/]__tests__[\\/]/,
  /[\\/]test-utils?\.[cm]?tsx?$/,
  /[\\/]i18n[\\/]namespaces\.ts$/,
];

/** Prop mang chữ cho người đọc. Tên dùng chung cho cả JSX attribute lẫn key của object. */
const UI_TEXT_PROPS = new Set([
  'alt',
  'addonAfter',
  'addonBefore',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'ariaLabel',
  'cancelText',
  'caption',
  'checkedChildren',
  'confirmText',
  'description',
  'emptyText',
  'errorText',
  'footerText',
  'heading',
  'helpText',
  'hint',
  'label',
  'loadingText',
  'message',
  'notFoundContent',
  'okText',
  'placeholder',
  'shortLabel',
  'subLabel',
  'submitText',
  'subtitle',
  'suffixLabel',
  'title',
  'tooltip',
  'unCheckedChildren',
  'unit',
]);

/** Hàm nhận CHUỖI HIỂN THỊ làm đối số — toast, thông báo, hộp xác nhận, validator Yup. */
const UI_TEXT_CALLS = new Set([
  'success',
  'error',
  'warning',
  'info',
  'confirm',
  // Yup
  'required',
  'matches',
  'oneOf',
  'notOneOf',
  'typeError',
  'email',
  'url',
  'test',
  'min',
  'max',
  'length',
  'positive',
  'integer',
]);

/** Đối tượng chủ của các hàm ở trên — để `foo.min(3)` của lodash không lọt vào. */
const UI_TEXT_CALL_OWNERS = /^(message|notification|modal|Modal|notify|toast|yup)$/;

const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

/** Chuỗi KỸ THUẬT — không bao giờ là chữ cho người đọc. */
const TECHNICAL = [
  /^[^\p{L}]*$/u, // không có chữ cái nào: '—', '·', '/', '{0}', số
  /^(https?:|mailto:|tel:|data:|blob:|\/|\.\.?\/|#)/, // URL, đường dẫn, anchor
  /^[a-z][a-zA-Z0-9]*$/, // định danh camelCase: 'primary', 'selfDrive'
  /^[a-z0-9]+([_-][a-z0-9]+)*$/, // mã đi trên dây: 'self_drive', 'shop-owner'
  /^[A-Z0-9]+(_[A-Z0-9]+)*$/, // hằng: 'BOOKING_ACTIVE'
  /^[A-Za-z]+\/[A-Za-z_]+$/, // 'Asia/Ho_Chi_Minh', 'image/png'
  /^[DMYHhms][DMYHhms\s:/.·-]*$/, // định dạng ngày giờ: 'DD/MM/YYYY', 'HH:mm · DD/MM'
  /^\d+(px|rem|em|vh|vw|%|ms|s)$/, // giá trị CSS
  /^var\(--/, // custom property
  /^[\d.]+$/, // phiên bản, số
];

/** Ngoại lệ có LÝ DO — xem `scripts/i18n-audit-allowlist.mjs`. */
const allowlist = AUDIT_ALLOWLIST.map((entry) => ({
  ...entry,
  matches(relFile, text) {
    if (entry.file && !relFile.endsWith(entry.file)) return false;
    return entry.text === text;
  },
}));

const findings = [];
/** Khử trùng lặp giữa hai lượt quét — khoá là file:dòng:chuỗi. */
const seen = new Map();
const files = collect(SRC_ROOT);

for (const file of files) {
  const relFile = path.relative(WEB_ROOT, file).replace(/\\/g, '/');
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  visit(source, relFile, source);
}

report();

// ── Duyệt AST ─────────────────────────────────────────────────────────────────
function visit(node, relFile, source) {
  // A1 — chữ nằm thẳng trong JSX.
  if (ts.isJsxText(node)) {
    const text = node.text.replace(/\s+/g, ' ').trim();
    if (text) record('jsx-text', text, node, relFile, source);
  }

  // A2 — prop giao diện của một phần tử/component.
  if (ts.isJsxAttribute(node) && node.initializer) {
    const name = node.name.getText(source);
    if (UI_TEXT_PROPS.has(name)) {
      for (const text of literalTexts(node.initializer)) {
        record(`jsx-prop:${name}`, text, node, relFile, source);
      }
    }
  }

  // A3 — cùng những tên đó nhưng trong object literal: menu item, option, cột bảng,
  //      cấu hình `modal.confirm({ title, okText })`, `notification.error({ message })`.
  if (ts.isPropertyAssignment(node)) {
    const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : '';
    if (UI_TEXT_PROPS.has(name)) {
      for (const text of literalTexts(node.initializer)) {
        record(`prop:${name}`, text, node, relFile, source);
      }
    }
  }

  // A4 — đối số chuỗi của toast/confirm/validator.
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const method = node.expression.name.text;
    const owner = rootOwner(node.expression.expression, source);
    const isYupChain = /Schema$|^yup$/.test(owner) || /^(string|number|date|array|object|mixed)$/.test(owner);
    if (UI_TEXT_CALLS.has(method) && (UI_TEXT_CALL_OWNERS.test(owner) || isYupChain)) {
      for (const arg of node.arguments) {
        for (const text of literalTexts(arg)) {
          record(`call:${owner}.${method}`, text, node, relFile, source);
        }
      }
    }
  }

  /*
   * Hợp đồng dành cho LẬP TRÌNH VIÊN, không phải chữ cho người dùng: một hook bị gọi ngoài
   * provider của nó. Nó chỉ nổ lúc lắp sai component và không bao giờ đi tới người dùng —
   * React cũng để nguyên tiếng Anh cho những invariant tương tự.
   */
  if (isHookContractError(node)) return;
  // Log kỹ thuật cho lập trình viên — spec loại trừ tường minh.
  if (isConsoleArgument(node)) return;

  // B — bất kỳ chuỗi nào có dấu tiếng Việt, ở bất kỳ vị trí nào.
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    if (VIETNAMESE.test(node.text)) record('vi-literal', node.text, node, relFile, source);
  }
  if (ts.isTemplateExpression(node)) {
    const spans = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)];
    const joined = spans.join(' ').trim();
    if (VIETNAMESE.test(joined)) {
      record('vi-template', `\`${spans.join('${…}')}\``, node, relFile, source);
    }
  }

  ts.forEachChild(node, (child) => visit(child, relFile, source));
}

/** Đối số của `console.*` — log, không phải chữ cho người dùng. */
function isConsoleArgument(node) {
  const call = node.parent;
  if (!call || !ts.isCallExpression(call) || !call.arguments.includes(node)) return false;
  return (
    ts.isPropertyAccessExpression(call.expression) &&
    call.expression.expression.getText() === 'console'
  );
}

/** `throw new Error(...)` bên trong một custom hook — xem chỗ gọi để biết vì sao bỏ qua. */
function isHookContractError(node) {
  if (!ts.isNewExpression(node) || node.expression.getText() !== 'Error') return false;
  let cur = node.parent;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) && cur.name && /^use[A-Z]/.test(cur.name.text)) return true;
    cur = cur.parent;
  }
  return false;
}

/** Chuỗi hằng có thể lấy ra từ một node (string literal, template không biến, `{'...'}`). */
function literalTexts(node) {
  if (!node) return [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isJsxExpression(node) && node.expression) return literalTexts(node.expression);
  if (ts.isConditionalExpression(node)) {
    return [...literalTexts(node.whenTrue), ...literalTexts(node.whenFalse)];
  }
  // `a ?? 'Chưa có'` / `a || 'Chưa có'`
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
      return literalTexts(node.right);
    }
  }
  return [];
}

/** Tên gốc của một chuỗi truy cập thuộc tính: `yup.string().required` → `yup`. */
function rootOwner(node, source) {
  let current = node;
  while (current) {
    if (ts.isIdentifier(current)) return current.text;
    if (ts.isCallExpression(current)) current = current.expression;
    else if (ts.isPropertyAccessExpression(current)) current = current.expression;
    else return current.getText(source).slice(0, 40);
  }
  return '';
}

function record(kind, rawText, node, relFile, source) {
  const text = rawText.trim();
  if (!text) return;
  if (TECHNICAL.some((re) => re.test(text))) return;
  if (allowlist.some((entry) => entry.matches(relFile, text))) return;

  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  /*
   * Hai lượt quét CỐ Ý chồng lên nhau (một `title="Đóng"` khớp cả A2 lẫn B), nên gộp theo
   * đúng một chuỗi tại một vị trí — nếu không, con số báo cáo phồng gấp đôi và "còn bao
   * nhiêu việc" trở thành một câu trả lời sai.
   *
   * Giữ lượt THEO VỊ TRÍ khi cả hai cùng khớp: `jsx-prop:okText` nói rõ phải sửa ở đâu, còn
   * `vi-literal` chỉ nói rằng có chữ tiếng Việt.
   */
  const at = `${relFile}:${line + 1}:${text}`;
  const existing = seen.get(at);
  if (existing) {
    if (existing.kind.startsWith('vi-') && !kind.startsWith('vi-')) existing.kind = kind;
    return;
  }

  const finding = { file: relFile, line: line + 1, kind, text };
  seen.set(at, finding);
  findings.push(finding);
}

// ── Thu thập file ─────────────────────────────────────────────────────────────
function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(full, out);
    } else if (/\.[cm]?tsx?$/.test(entry.name) && !EXCLUDED_FILE.some((re) => re.test(full))) {
      out.push(full);
    }
  }
  return out;
}

// ── Báo cáo ───────────────────────────────────────────────────────────────────
function report() {
  if (findings.length === 0) {
    console.log(`i18n:audit OK — quét ${files.length} file, không còn chuỗi giao diện thô.`);
    return;
  }

  const groups = new Map();
  for (const f of findings) {
    const feature = featureOf(f.file);
    if (!groups.has(feature)) groups.set(feature, []);
    groups.get(feature).push(f);
  }

  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const verbose = process.argv.includes('--verbose');
  const limit = verbose ? Infinity : 6;

  console.log(`\ni18n:audit — ${findings.length} chuỗi nghi chưa dịch trong ${groups.size} khu vực`);
  console.log(`(quét ${files.length} file · thêm --verbose để xem tất cả)\n`);

  for (const [feature, items] of sorted) {
    console.log(`  ${feature} — ${items.length}`);
    for (const item of items.slice(0, limit)) {
      console.log(`    ${item.file}:${item.line}  [${item.kind}]  ${truncate(item.text)}`);
    }
    if (items.length > limit) console.log(`    … còn ${items.length - limit} chuỗi nữa`);
    console.log('');
  }

  process.exitCode = 1;
}

/** Gom theo khu vực SỞ HỮU để báo cáo đọc được theo tính năng, không phải theo file. */
function featureOf(relFile) {
  const m =
    /^src\/features\/([^/]+)\//.exec(relFile) ??
    /^src\/(components)\/([^/]+)\//.exec(relFile) ??
    /^src\/app\/(\([^)]+\))\//.exec(relFile);
  if (m) return m[2] ? `${m[1]}/${m[2]}` : m[1];
  const dir = path.dirname(relFile).replace(/^src\//, '');
  return dir === '.' ? 'src' : dir;
}

function truncate(text) {
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > 80 ? `${flat.slice(0, 77)}…` : flat;
}
