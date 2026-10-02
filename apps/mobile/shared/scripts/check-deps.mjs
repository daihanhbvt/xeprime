/**
 * Canh ba `package.json` của vùng mobile không được lệch nhau — `customer`, `manage`, `shared`.
 *
 * VÌ SAO CẦN: `shared/src` là code dùng chung được BUNDLE THẲNG vào cả hai app (Metro đọc nó qua
 * `watchFolders` + alias `@/`), chứ không phải một thư viện đã build. Nên một thư viện mà
 * `shared/src` import phải có mặt ở CẢ BA chỗ:
 *
 *   • ở `shared`      — để `shared/node_modules` tồn tại cho Jest (155 test nằm trong `shared/src`,
 *                        và Jest chỉ biết leo cây thư mục, không đọc `nodeModulesPaths` của Metro);
 *   • ở từng app      — để Metro bundle được và để autolinking nhúng đúng native module vào
 *                        `vn.xeprime.mobile` / `vn.xeprime.partner` (mỗi app một file cài riêng).
 *
 * Quên một chỗ thì `typecheck` vẫn XANH mà bundle ĐỎ lúc chạy — triệu chứng là
 * `Cannot find module` ném ra từ trong lòng một file chẳng liên quan gì tới thứ vừa sửa.
 *
 * Chạy: `pnpm mobile:deps:check` (ở gốc repo).
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = resolve(HERE, '../..');

/** Hai app là SONG SINH: chúng phải khai cùng một bộ thư viện, chỉ khác tên/cổng/icon. */
const APPS = ['customer', 'manage'];
const SHARED = 'shared';

/**
 * Version chỉ được ghi bằng `catalog:` (thư viện ngoài) hoặc `workspace:*` (package trong repo).
 *
 * Đây là điều KIỆN sống của cả layout: số thật nằm ở MỘT chỗ (`pnpm-workspace.yaml`), nên ba
 * file này không thể lệch version. Một con số gõ thẳng vào đây là mở lại đúng cánh cửa đó —
 * hai app lệch bản React Native là hai binary native khác nhau cùng đọc một `shared/src`.
 */
const ALLOWED_SPECS = [/^catalog:/, /^workspace:/];

const errors = [];
const warnings = [];

/** Đọc một package.json của vùng mobile. */
function readPkg(name) {
  const path = join(MOBILE_ROOT, name, 'package.json');
  return { name, path, json: JSON.parse(readFileSync(path, 'utf8')) };
}

/** Tên các dependency của một khối (`dependencies` hoặc `devDependencies`). */
function depNames(pkg, block) {
  return Object.keys(pkg.json[block] ?? {});
}

const pkgs = Object.fromEntries([...APPS, SHARED].map((n) => [n, readPkg(n)]));

/* ---------------------------------------------------------------------------------------------
 * KIỂM 1 — mọi version phải đi qua catalog/workspace.
 * ------------------------------------------------------------------------------------------- */
for (const pkg of Object.values(pkgs)) {
  for (const block of ['dependencies', 'devDependencies']) {
    for (const [dep, spec] of Object.entries(pkg.json[block] ?? {})) {
      if (!ALLOWED_SPECS.some((re) => re.test(spec))) {
        errors.push(
          `${pkg.name}/package.json → "${dep}": "${spec}" — phải là "catalog:" (khai số thật ở ` +
            `pnpm-workspace.yaml) hoặc "workspace:*".`,
        );
      }
    }
  }
}

/* ---------------------------------------------------------------------------------------------
 * KIỂM 2 — dep của `shared` phải có đủ ở CẢ HAI app.
 *
 * Đây là phép kiểm quan trọng nhất: thiếu ở app nào thì bundle của app đó vỡ, dù test vẫn xanh
 * (test chạy được nhờ `shared/node_modules`, còn app thì không đọc thư mục đó).
 * ------------------------------------------------------------------------------------------- */
for (const block of ['dependencies', 'devDependencies']) {
  const shared = depNames(pkgs[SHARED], block);
  for (const app of APPS) {
    const owned = new Set(depNames(pkgs[app], block));
    const missing = shared.filter((dep) => !owned.has(dep));
    for (const dep of missing) {
      errors.push(
        `${app}/package.json thiếu "${dep}" (${block}) — ${SHARED} có khai. ` +
          `shared/src được bundle vào app này, nên app phải khai cùng thư viện.`,
      );
    }
  }
}

/* ---------------------------------------------------------------------------------------------
 * KIỂM 3 — hai app lệch nhau.
 *
 * CẢNH BÁO chứ không chặn: một app hoàn toàn có thể cần một thư viện mà app kia không cần
 * (ví dụ màn chỉ có ở Partner). Nhưng lệch KHÔNG CHỦ Ý là nguồn của loại lỗi "chạy ở customer,
 * chết ở manage" trên đúng một dòng code trong `shared/src`, nên nó phải hiện ra để người sửa
 * xác nhận là cố ý.
 * ------------------------------------------------------------------------------------------- */
for (const block of ['dependencies', 'devDependencies']) {
  const [a, b] = APPS;
  const inA = new Set(depNames(pkgs[a], block));
  const inB = new Set(depNames(pkgs[b], block));
  for (const dep of inA) {
    if (!inB.has(dep)) warnings.push(`"${dep}" (${block}) chỉ có ở ${a}, không có ở ${b}.`);
  }
  for (const dep of inB) {
    if (!inA.has(dep)) warnings.push(`"${dep}" (${block}) chỉ có ở ${b}, không có ở ${a}.`);
  }
}

/* -------------------------------------------------------------------------------------------- */

const LABEL = 'mobile:deps:check';

for (const line of warnings) console.warn(`⚠️  [${LABEL}] ${line}`);

if (errors.length > 0) {
  for (const line of errors) console.error(`❌ [${LABEL}] ${line}`);
  console.error(
    `\n[${LABEL}] ${errors.length} lỗi. Xem chú thích đầu apps/mobile/shared/scripts/check-deps.mjs ` +
      `để biết vì sao ba file phải khớp nhau.`,
  );
  process.exit(1);
}

console.log(
  `✅ [${LABEL}] ba package.json khớp nhau` +
    (warnings.length > 0 ? ` (${warnings.length} cảnh báo ở trên)` : ''),
);
