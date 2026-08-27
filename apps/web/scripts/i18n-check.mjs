/**
 * Kiểm tra TOÀN VẸN của hai bó message — chạy bằng `pnpm --filter @xeprime/web i18n:check`.
 *
 * Đây là hàng rào thứ hai sau typecheck. Typecheck bắt được khoá KHÔNG TỒN TẠI trong tiếng
 * Việt (bó chuẩn); nó KHÔNG bắt được tiếng Anh thiếu khoá, thừa khoá, để chuỗi rỗng, hay viết
 * sai cú pháp ICU — những lỗi đó chỉ nổ lúc chạy, trước mặt người dùng.
 *
 * Việc script này làm:
 *   1. Mọi namespace khai báo ở `src/i18n/namespaces.ts` phải có file JSON ở CẢ HAI ngôn ngữ,
 *      đọc được và parse được.
 *   2. Hai file `messages/<locale>/index.ts` phải liệt kê đúng bộ namespace của WEB — không
 *      thừa, không thiếu (nếu lệch, một namespace có file nhưng không bao giờ được nạp).
 *      Namespace đánh `web: false` là của riêng app native, không vào bảng gom của web; bảng
 *      gom của app native (`apps/mobile/src/i18n/messages.ts`) chỉ cần là TẬP CON hợp lệ —
 *      nó i18n hoá theo tiến độ riêng, nhưng không được trỏ vào namespace không tồn tại.
 *   3. Parity HAI CHIỀU tuyệt đối giữa vi và en. Tiếng Việt là cấu trúc chuẩn.
 *   4. Không giá trị rỗng/chỉ khoảng trắng; không nhánh lá là mảng/số/null.
 *   5. Cú pháp ICU hợp lệ ở cả hai ngôn ngữ, và tập BIẾN của một khoá phải giống nhau ở hai
 *      ngôn ngữ — `{count}` ở vi mà `{total}` ở en thì bản dịch en in ra chữ `{total}`.
 *   6. `plural`/`select` phải có nhánh `other`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@formatjs/icu-messageformat-parser';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Thư mục của web — nay CHỈ chứa `index.ts` (bảng gom). JSON nào mọc lại ở đây là bản sao lạc. */
const MESSAGES_DIR = path.join(WEB_ROOT, 'messages');
/**
 * Gốc DUY NHẤT của mọi bó message: `@xeprime/domain` (quyết định 24/08/2026 — web và app native
 * dùng chung toàn bộ, một khoá một bản dịch). Script này là lưới parity vi↔en cho cả hai client.
 */
const SHARED_MESSAGES_DIR = path.resolve(WEB_ROOT, '../../packages/domain/messages');
const NAMESPACES_FILE = path.join(WEB_ROOT, 'src/i18n/namespaces.ts');
const CONFIG_FILE = path.join(WEB_ROOT, 'src/i18n/config.ts');
/**
 * Danh sách locale sống ở `@xeprime/types` từ ADR 0019 — `apps/api` cũng cần nó để chuyển tiếp
 * ngôn ngữ cho màn đồng ý của Google/Facebook. `src/i18n/config.ts` chỉ re-export, nên đọc bản
 * gốc ở đây; phần cookie (chuyện của trình duyệt) vẫn kiểm trên file web.
 */
const LOCALE_SOURCE_FILE = path.resolve(WEB_ROOT, '../../packages/types/src/locale.ts');
/** Bảng gom của app native — client thứ hai đọc cùng gốc message. */
const MOBILE_MESSAGES_FILE = path.resolve(WEB_ROOT, '../mobile/src/i18n/messages.ts');

/** Tiếng Việt là bó CHUẨN về cấu trúc; tiếng Anh phải khớp nó (và ngược lại). */
const CANONICAL_LOCALE = 'vi';

const problems = [];
const fail = (scope, message) => problems.push({ scope, message });

// ── 1. Cấu hình locale ────────────────────────────────────────────────────────
const configSource = read(CONFIG_FILE);
const localeSource = read(LOCALE_SOURCE_FILE);
const localeTuple = localeSource?.match(/SUPPORTED_LOCALES = \[([^\]]+)\]/)?.[1];
const locales = localeTuple ? [...localeTuple.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]) : [];

if (locales.length < 2) {
  fail('config', `Không đọc được SUPPORTED_LOCALES từ ${rel(LOCALE_SOURCE_FILE)}`);
}
if (!locales.includes(CANONICAL_LOCALE)) {
  fail('config', `SUPPORTED_LOCALES phải chứa '${CANONICAL_LOCALE}' (ngôn ngữ mặc định).`);
}
if (!/DEFAULT_LOCALE: AppLocale = 'vi'/.test(localeSource ?? '')) {
  fail('config', "DEFAULT_LOCALE phải là 'vi' — khách chưa có cookie luôn thấy tiếng Việt.");
}
/*
 * Web phải LẤY danh sách locale từ gốc, không tự khai lại. Hai danh sách rời nhau là cách web
 * và api âm thầm bất đồng về việc `en` có tồn tại hay không.
 */
if (!/SUPPORTED_LOCALES,[\s\S]*?\} from '@xeprime\/types'/.test(configSource ?? '')) {
  fail('config', `${rel(CONFIG_FILE)} phải re-export SUPPORTED_LOCALES từ '@xeprime/types'.`);
}
if (!/LOCALE_COOKIE_NAME = 'XP_LOCALE'/.test(configSource ?? '')) {
  fail('config', "LOCALE_COOKIE_NAME phải là 'XP_LOCALE'.");
}

// ── 2. Danh sách namespace ────────────────────────────────────────────────────
const namespacesSource = read(NAMESPACES_FILE) ?? '';
const declared = [
  ...namespacesSource.matchAll(/{ file: '([^']+)', namespace: '([^']+)'(?:, web: (false))? }/g),
].map((m) => ({ file: m[1], namespace: m[2], web: m[3] !== 'false' }));

const labelFor = (entry, locale) => `packages/domain/messages/${locale}/${entry.file}.json`;

if (declared.length === 0) {
  fail('namespaces', `Không đọc được namespace nào từ ${rel(NAMESPACES_FILE)}`);
}

for (const f of duplicates(declared.map((d) => d.file))) {
  fail('namespaces', `File '${f}' khai báo trùng.`);
}
for (const n of duplicates(declared.map((d) => d.namespace))) {
  fail('namespaces', `Namespace '${n}' khai báo trùng.`);
}

// ── 3. Nạp message + đối chiếu index.ts của từng ngôn ngữ ─────────────────────
const bundles = {};

for (const locale of locales) {
  const dir = path.join(MESSAGES_DIR, locale);
  if (!fs.existsSync(dir)) {
    fail(locale, `Thiếu thư mục messages/${locale}`);
    continue;
  }

  /*
   * File JSON có mặt nhưng KHÔNG khai báo ⇒ chuỗi chết, không ai nạp. Quét trên gốc package.
   */
  const sharedDir = path.join(SHARED_MESSAGES_DIR, locale);
  if (!fs.existsSync(sharedDir)) {
    fail(locale, `Thiếu thư mục packages/domain/messages/${locale}`);
    continue;
  }
  const onDisk = fs
    .readdirSync(sharedDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/.json$/, ''));
  for (const orphan of onDisk.filter((f) => !declared.some((d) => d.file === f))) {
    fail(
      locale,
      `packages/domain/messages/${locale}/${orphan}.json không có trong namespaces.ts (không bao giờ được nạp).`,
    );
  }

  /*
   * Gốc web cũ phải RỖNG JSON. Một `vehicles.json` mọc lại ở đây (merge cũ, sinh nhầm chỗ) sẽ
   * không được ai nạp nhưng trông y như bản thật — người sửa nó tưởng đã dịch xong mà màn hình
   * không đổi. Bắt ngay tại cổng thay vì để hai bản trôi khỏi nhau.
   */
  for (const stray of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    fail(
      locale,
      `messages/${locale}/${stray} đã chuyển sang packages/domain/messages — xoá bản sao này.`,
    );
  }

  const indexSource = read(path.join(dir, 'index.ts')) ?? '';
  const mapped = [...indexSource.matchAll(/^ {2}([A-Za-z]+): \w+,$/gm)].map((m) => m[1]);
  const declaredNs = declared.map((d) => d.namespace);
  const webNs = declared.filter((d) => d.web).map((d) => d.namespace);
  for (const missing of webNs.filter((n) => !mapped.includes(n))) {
    fail(locale, `messages/${locale}/index.ts thiếu namespace '${missing}'.`);
  }
  for (const extra of mapped.filter((n) => !declaredNs.includes(n))) {
    fail(locale, `messages/${locale}/index.ts khai báo namespace lạ '${extra}'.`);
  }
  for (const nativeOnly of mapped.filter((n) => declaredNs.includes(n) && !webNs.includes(n))) {
    fail(
      locale,
      `messages/${locale}/index.ts nạp '${nativeOnly}' — namespace này khai 'web: false' (chỉ app native).`,
    );
  }

  const bundle = {};
  for (const entry of declared) {
    const { file, namespace } = entry;
    const jsonPath = path.join(SHARED_MESSAGES_DIR, locale, `${file}.json`);
    const raw = read(jsonPath);
    if (raw === null) {
      fail(locale, `Thiếu file ${labelFor(entry, locale)}`);
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        fail(locale, `messages/${locale}/${file}.json phải là một object.`);
        continue;
      }
      if (Object.keys(parsed).length === 0) {
        fail(locale, `messages/${locale}/${file}.json rỗng — xoá namespace hoặc điền nội dung.`);
      }
      bundle[namespace] = parsed;
    } catch (error) {
      fail(locale, `messages/${locale}/${file}.json không parse được: ${error.message}`);
    }
  }
  bundles[locale] = bundle;
}

// ── 3b. Bảng gom của app native ───────────────────────────────────────────────
/*
 * Script này sống ở `apps/web` nhưng canh GỐC CHUNG, nên nó phải nhìn cả client thứ hai:
 * nếu không, `apps/mobile/src/i18n/messages.ts` trỏ vào một namespace bị đổi tên hay bị xoá
 * và lỗi chỉ nổ lúc bundle Metro chạy trên máy người khác.
 *
 * Mobile i18n hoá theo tiến độ riêng nên bảng gom của nó là TẬP CON — chỉ kiểm "không trỏ vào
 * namespace lạ" và "hai ngôn ngữ gom đúng cùng một bộ", không ép đủ.
 */
const mobileSource = read(MOBILE_MESSAGES_FILE);
if (mobileSource === null) {
  fail('mobile', `Không đọc được ${rel(MOBILE_MESSAGES_FILE)}`);
} else {
  const declaredNs = declared.map((d) => d.namespace);
  const perLocale = Object.fromEntries(
    locales.map((locale) => [
      locale,
      [...mobileSource.matchAll(new RegExp(`^  ${locale}: \\{([^}]*)\\}`, 'gm'))]
        .flatMap((m) => [...m[1].matchAll(/([A-Za-z]+):/g)])
        .map((m) => m[1]),
    ]),
  );

  for (const locale of locales) {
    for (const unknown of perLocale[locale].filter((n) => !declaredNs.includes(n))) {
      fail('mobile', `messages.ts gom namespace lạ '${unknown}' cho ${locale} — không có ở gốc.`);
    }
  }

  const [first, ...rest] = locales;
  for (const locale of rest) {
    const a = [...perLocale[first]].sort();
    const b = [...perLocale[locale]].sort();
    if (a.join() !== b.join()) {
      fail('mobile', `messages.ts gom khác nhau giữa ${first} (${a.join(', ')}) và ${locale} (${b.join(', ')}).`);
    }
  }

  if (perLocale[CANONICAL_LOCALE].length === 0) {
    fail('mobile', 'messages.ts không gom namespace nào — regex bảng gom đã lệch, sửa script.');
  }
}

// ── 4. Parity + giá trị + ICU ─────────────────────────────────────────────────
if (problems.length === 0) {
  const flat = Object.fromEntries(locales.map((l) => [l, flatten(bundles[l])]));
  const canonicalKeys = new Set(Object.keys(flat[CANONICAL_LOCALE]));

  for (const locale of locales) {
    const keys = new Set(Object.keys(flat[locale]));

    if (locale !== CANONICAL_LOCALE) {
      for (const key of canonicalKeys) {
        if (!keys.has(key)) fail(locale, `Thiếu khoá '${key}' (có ở ${CANONICAL_LOCALE}).`);
      }
      for (const key of keys) {
        if (!canonicalKeys.has(key)) {
          fail(locale, `Thừa khoá '${key}' (không có ở ${CANONICAL_LOCALE}).`);
        }
      }
    }

    for (const [key, value] of Object.entries(flat[locale])) {
      if (typeof value !== 'string') {
        const kind = Array.isArray(value) ? 'mảng' : typeof value;
        fail(locale, `Khoá '${key}' phải là chuỗi, đang là ${kind}.`);
        continue;
      }
      if (value.trim() === '') {
        fail(locale, `Khoá '${key}' để rỗng — bản dịch thiếu, không phải bản dịch trống.`);
        continue;
      }
      try {
        checkOtherClause(parse(value), locale, key);
      } catch (error) {
        fail(locale, `Khoá '${key}' sai cú pháp ICU: ${error.message}`);
      }
    }
  }

  // Biến của cùng một khoá phải khớp giữa hai ngôn ngữ.
  for (const locale of locales.filter((l) => l !== CANONICAL_LOCALE)) {
    for (const key of canonicalKeys) {
      const a = flat[CANONICAL_LOCALE][key];
      const b = flat[locale][key];
      if (typeof a !== 'string' || typeof b !== 'string') continue;
      const varsA = icuVariables(a);
      const varsB = icuVariables(b);
      const missing = [...varsA].filter((v) => !varsB.has(v));
      const extra = [...varsB].filter((v) => !varsA.has(v));
      if (missing.length) fail(locale, `Khoá '${key}' thiếu biến: ${missing.join(', ')}`);
      if (extra.length) fail(locale, `Khoá '${key}' có biến lạ: ${extra.join(', ')}`);
    }
  }
}

// ── Kết quả ───────────────────────────────────────────────────────────────────
if (problems.length > 0) {
  const byScope = new Map();
  for (const p of problems) {
    if (!byScope.has(p.scope)) byScope.set(p.scope, []);
    byScope.get(p.scope).push(p.message);
  }
  console.error(`\ni18n:check — ${problems.length} lỗi\n`);
  for (const [scope, messages] of byScope) {
    console.error(`  [${scope}]`);
    for (const m of messages) console.error(`    · ${m}`);
    console.error('');
  }
  process.exit(1);
}

const total = Object.keys(flatten(bundles[CANONICAL_LOCALE])).length;
console.log(
  `i18n:check OK — ${declared.length} namespace × ${locales.length} ngôn ngữ (${locales.join(', ')}), ${total} khoá, parity khớp.`,
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function read(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function rel(file) {
  return path.relative(WEB_ROOT, file).replace(/\\/g, '/');
}

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const v of values) (seen.has(v) ? dupes : seen).add(v);
  return [...dupes];
}

function flatten(node, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(node ?? {})) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, full, out);
    } else {
      out[full] = value;
    }
  }
  return out;
}

/** Tên biến xuất hiện trong một message ICU (kể cả trong nhánh plural/select). */
function icuVariables(message) {
  const names = new Set();
  try {
    walk(parse(message), (node) => {
      // type 0 = literal text; mọi node còn lại mang tên biến ở `value`.
      if (node.type !== 0 && typeof node.value === 'string') names.add(node.value);
    });
  } catch {
    /* Lỗi cú pháp đã được báo ở vòng trên. */
  }
  return names;
}

function walk(nodes, visit) {
  for (const node of nodes ?? []) {
    visit(node);
    if (node.options) for (const opt of Object.values(node.options)) walk(opt.value, visit);
    if (Array.isArray(node.children)) walk(node.children, visit);
  }
}

function checkOtherClause(ast, locale, key) {
  walk(ast, (node) => {
    // `tag` (rich text) cũng có children nhưng không có `options`; chỉ plural/select mới cần.
    if (node.options && !('other' in node.options)) {
      fail(locale, `Khoá '${key}': nhánh plural/select thiếu 'other'.`);
    }
  });
}
