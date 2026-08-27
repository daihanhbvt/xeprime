# Rà soát cấu trúc `packages/` — có đúng chuẩn monorepo không, có nặng không

## Context

Câu hỏi của anh gồm ba phần:

1. `packages/` đã đúng chuẩn monorepo chưa?
2. Mỗi package con lại có `package.json` + `node_modules` riêng — có làm dự án nặng không?
3. Có cần thiết không, hay chỉ cần `packages/<tên>/index.ts` cho gọn?

Dưới đây là kết luận có số liệu đo thật, cộng một sai lệch nhỏ có thật cần sửa.

---

## Phần 1 — Trả lời ba câu hỏi

### 1.1 Đã đúng chuẩn chưa? — Rồi

Đây đúng là layout chuẩn của pnpm workspace:

- `pnpm-workspace.yaml` khai `apps/*`, `packages/*`, `prisma`
- Mỗi package có `name` `@xeprime/*`, `private: true`, `exports`, `scripts` đồng nhất (`build`/`lint`/`typecheck`/`test`)
- App tham chiếu bằng `"@xeprime/domain": "workspace:*"` — không dùng path alias trong `tsconfig`, đúng cách
- `turbo.json` có `build.dependsOn: ["^build"]` nên thứ tự build suy ra từ đồ thị dependency, không phải khai tay

Sáu package đều có lý do tồn tại được ghi trong ADR/CODEMAP, không có package thừa:

| Package | Vai trò | Neo tài liệu |
| --- | --- | --- |
| `types` | status union, RBAC key, mã lỗi, `api.generated.ts` | ADR 0005 · 0007 |
| `validators` | Yup schema dùng chung FE/BE | CODEMAP:15 |
| `api-client` | 1 HTTP client + `AuthTransport` (web cookie ↔ native Bearer) | ADR 0007 · 0017 |
| `domain` | luật nghiệp vụ thuần + 21 namespace message vi/en | ADR 0006 · 0011 · 0012 |
| `ui` | design token `XP_TOKENS` + `tokens.css` | ADR 0003 |
| `config` | preset tsconfig + eslint | — |

### 1.2 `node_modules` mỗi package có làm nặng không? — Không. Đo thật:

```
api-client 0.03 MB    domain 0.03 MB    types 0.04 MB
ui         0.03 MB    validators 0.03 MB    config: không có
```

Tổng ~0.16 MB. Lý do: pnpm **không copy** thư viện — mọi entry trong `packages/*/node_modules`
là **junction** trỏ về store trung tâm `node_modules/.pnpm`:

```
antd        Junction -> D:\Softrent\Xeprime\node_modules\.pnpm\antd@6.5.1_...
typescript  Junction -> D:\Softrent\Xeprime\node_modules\.pnpm\typescript@5.9.3\...
```

Cài `typescript` ở 5 package = 5 con trỏ, **một** bản trên đĩa. Đây chính là điểm bán hàng của
pnpm so với npm/yarn. Không có gì để tối ưu ở đây.

Ngược lại, `node_modules` riêng từng package còn là **tính năng**: nó chặn phantom dependency —
`packages/domain` chỉ nhìn thấy `dayjs` vì nó tự khai, không "mượn" được `antd` của web.

### 1.3 Có thể rút gọn thành `packages/domain/index.ts` không? — Không

Bỏ `package.json` đi thì mất đúng những thứ kiến trúc này đang dựa vào:

| Mất gì | Hậu quả |
| --- | --- |
| Import `@xeprime/domain` | Phải quay về path alias `tsconfig` — mà alias là **thứ Metro (React Native) không đọc được**. `packages/api-client` + `packages/domain` tồn tại chính vì lý do này (CLAUDE.md mục 5) |
| Ranh giới dependency | `packages/domain` sẽ "với" được `antd`/`next` của web. Đây là bức tường lint-able duy nhất giữ code platform-free thật sự platform-free |
| Subpath export | `@xeprime/ui/styles.css` và `@xeprime/ui/react` (dự kiến) chỉ tồn tại được nhờ trường `exports` |
| Thứ tự build | turbo suy đồ thị từ dependency trong `package.json`; không có nó thì `api:openapi → types:gen → web:build` (ADR 0007) phải khai tay |
| Emit CJS cho `apps/api` | `apps/api` chạy `tsc` + Node trần, `require` được là nhờ `packages/config/tsconfig/lib.json` |

Ngắn gọn: `packages/` **không phải** để chia thư mục cho gọn. Nó là hợp đồng để app React Native
sắp tới (`docs/mobile-readiness-audit.md`) import đúng 6 package này và **không import gì từ
`apps/web`**. Rút gọn thành `index.ts` là phá bỏ mục tiêu đó.

---

## Phần 2 — Một sai lệch có thật: `packages/ui` lệch chuẩn khỏi 4 package anh em

`packages/ui/src/index.ts:8-15` tuyên bố: *"Export GỐC phải chạy được trên CẢ web lẫn React
Native: chỉ TypeScript thuần, không `antd`, không `react`, không DOM."*

Nhưng cấu hình đang **không thi hành** lời tuyên bố đó:

| Điểm | `types`/`validators`/`domain`/`api-client` | `ui` (hiện tại) |
| --- | --- | --- |
| `tsconfig.json` extends | `../config/tsconfig/lib.json` | `../config/tsconfig/nextjs.json` ⚠️ |
| `lib` khi typecheck | `["ES2023"]` | `["DOM", "DOM.Iterable", "ES2023"]` ⚠️ |
| `tsconfig.build.json` | có | **không có** |
| `build` script / `dist` | có | **không có** |
| `main`/`exports` | `./dist/index.js` (CJS) | `./src/index.ts` + `"type": "module"` |

Hệ quả cụ thể: viết `document.documentElement.style.setProperty(...)` vào
`packages/ui/src/tokens/index.ts` thì **`typecheck` vẫn xanh** — đúng thứ mà comment ở đầu file
nói là "vỡ bundle Metro". Bức tường đang có cửa mở.

Ngoài ra hai điểm nhỏ:

- `apps/web/next.config.ts:12` chú thích *"Package trong workspace export thẳng TS
  (`main: ./src/index.ts`)"* và liệt kê `@xeprime/types`, `@xeprime/validators` — nhưng hai
  package đó đã chuyển sang `./dist`. Chú thích lỗi thời; chỉ `@xeprime/ui` còn đúng mô tả.
- `packages/ui/node_modules` còn junction `antd` + `react` dù `package.json` không khai — rác
  còn lại từ khi package này chưa refactor. `pnpm install` sẽ dọn.
- `packages/config/tsconfig/react-native.json` chưa có (đã được ghi nhận là việc P2 ở
  `docs/mobile-readiness-audit.md:448`) — chưa cần cho tới khi repo mobile khởi động.
- `packages/config` không nằm trong `dependencies` của app nào; hai app `extends` nó bằng đường
  dẫn tương đối. Chạy đúng, nhưng turbo không thấy cạnh này trong đồ thị. Vô hại vì `config`
  không có bước `build` — ghi lại để biết, không đề xuất sửa.

**Đã nghi ngờ nhưng kiểm tra ra KHÔNG phải vấn đề:** `apps/api` có nhắc `@xeprime/api-client` và
`@xeprime/validators` mà không khai dependency — nhưng cả hai chỗ chỉ là **comment**, không phải
`import`. Không có phantom dependency.

---

## Phần 3 — Việc đề xuất (nhỏ, gọn trong 1 commit)

Mục tiêu: đưa `packages/ui` về đúng chuẩn 4 package anh em, để ranh giới platform-free được
compiler thi hành chứ không chỉ nằm ở comment.

### File sửa

1. **`packages/ui/tsconfig.json`** — đổi `extends` sang `../config/tsconfig/lib.json`.
   Đây là thay đổi cốt lõi: mất `lib: ["DOM"]` ⇒ mọi DOM API lọt vào sẽ fail typecheck.
   Giữ `"noEmit": true`, `include` chỉ `src/**/*.ts`.

2. **`packages/ui/tsconfig.build.json`** (tạo mới) — sao mẫu từ
   `packages/types/tsconfig.build.json`, đặt `rootDir: "src"` / `outDir: "dist"` **tại file này**
   (không ở file `extends` — bẫy đã ghi ở CLAUDE.md mục 8).

3. **`packages/ui/package.json`** —
   - bỏ `"type": "module"` (lib.json emit CommonJS)
   - `main`/`types` → `./dist/index.js` / `./dist/index.d.ts`
   - `exports`: `"."` → khối `{types, default}` trỏ `dist`; giữ nguyên
     `"./styles.css": "./src/styles/tokens.css"` (CSS không qua tsc)
   - thêm `"files": ["dist", "src/styles"]`
   - thêm `"build": "tsc -p tsconfig.build.json"`

4. **`apps/web/next.config.ts:11-12`** — cập nhật chú thích và rút `transpilePackages` xuống
   đúng những package thật sự còn export TS thô. Sau bước 3 thì cả 3 đều đã ra `dist` CJS ⇒ có
   thể bỏ hẳn `transpilePackages`. **Cần build lại + chạy web để xác nhận** trước khi bỏ.

### Không làm

- Không đổi tên `@xeprime/ui` → `@xeprime/web-ui`. Việc P3 ở
  `docs/mobile-readiness-audit.md:520` viết khi package còn rỗng; ngày 24/08/2026 đã chốt hướng
  khác (token ở gốc, component web sau này qua subpath `@xeprime/ui/react`). Cần sửa dòng P3 đó
  thành "đã giải quyết khác" thay vì thực thi nó.
- Không thêm `packages/config/tsconfig/react-native.json` trong đợt này.
- Không gộp/xoá package nào.

---

## Verification

```bash
# 1. build lại toàn đồ thị — ui giờ phải sinh ra dist/
pnpm --filter @xeprime/ui build
ls packages/ui/dist          # index.js + index.d.ts phải có

# 2. tường DOM phải dựng được: thử thêm tạm `document.title` vào src/tokens/index.ts
pnpm --filter @xeprime/ui typecheck      # PHẢI fail -> xoá dòng thử đi

# 3. hai bên tiêu thụ token không gãy
pnpm --filter @xeprime/web typecheck
pnpm --filter @xeprime/web test -- theme.test        # parity XP_TOKENS <-> antdTheme
pnpm --filter @xeprime/api typecheck

# 4. build web thật (bước duy nhất chứng minh việc bỏ transpilePackages an toàn)
pnpm --filter @xeprime/web build

# 5. dọn junction rác trong packages/ui/node_modules
pnpm install
```

Chạy web dev và mở một trang bất kỳ để xác nhận `@xeprime/ui/styles.css` vẫn nạp được
(kiểm tra một CSS custom property `--xp-*` trên `:root` trong DevTools).
