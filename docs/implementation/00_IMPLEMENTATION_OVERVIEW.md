# 00 — IMPLEMENTATION OVERVIEW (Wave 0B)

> Ngày lập: 06/08/2026 · Wave 0B — audit repo + lập bản đồ Figma + kế hoạch migration.
> **Không sửa một dòng code ứng dụng nào trong wave này.** Mọi tài liệu ở đây là mô tả hiện trạng + kế hoạch, chưa phải uỷ quyền triển khai.

> ⚠️ **Ảnh chụp Wave 0B (06/08/2026), không được cập nhật theo mã.** Các wave sau đã thi công
> xong phần lớn kế hoạch ở đây. Đường dẫn file là tên TẠI THỜI ĐIỂM viết — bảng tra tên cũ →
> chỗ hiện tại ở [`../CODEMAP.md`](../CODEMAP.md). Hai file còn được mã nguồn dẫn chiếu trực tiếp
> và vẫn là nguồn sống: [`02_DESIGN_TOKEN_MAP.md`](02_DESIGN_TOKEN_MAP.md) (`styles/theme.ts`) và
> [`04_COMPONENT_DUPLICATES.md`](04_COMPONENT_DUPLICATES.md) (`hooks/use-url-filters.ts`).

## 0. Bộ tài liệu Wave 0B

| File | Trả lời câu hỏi |
| --- | --- |
| **00_IMPLEMENTATION_OVERVIEW.md** (file này) | Kiến trúc FE hiện tại là gì, nguồn sự thật nào thắng nguồn nào |
| [01_FIGMA_ROUTE_NODE_MAP.md](01_FIGMA_ROUTE_NODE_MAP.md) | Mỗi route ứng với node Figma nào, độ tin cậy bao nhiêu |
| [02_DESIGN_TOKEN_MAP.md](02_DESIGN_TOKEN_MAP.md) | Token Figma ↔ token code, lệch ở đâu, sửa thế nào |
| [03_COMPONENT_REGISTRY.md](03_COMPONENT_REGISTRY.md) | Component nào tái dùng / mở rộng / tạo mới / khai tử |
| [04_COMPONENT_DUPLICATES.md](04_COMPONENT_DUPLICATES.md) | Chỗ nào đang copy-paste, gom về đâu |
| [05_FEATURE_CLASSIFICATION.md](05_FEATURE_CLASSIFICATION.md) | Cái gì đã có backend, cái gì chỉ là concept |
| [06_MIGRATION_ORDER.md](06_MIGRATION_ORDER.md) | Làm theo thứ tự nào, rollback ra sao |
| [07_VISUAL_QA_MATRIX.md](07_VISUAL_QA_MATRIX.md) | Kiểm tra gì ở mỗi breakpoint × mỗi state |
| [08_DECISION_BACKLOG.md](08_DECISION_BACKLOG.md) | Câu hỏi phải có người trả lời trước khi code |
| [09_LIST_PAGE_INVENTORY.md](09_LIST_PAGE_INVENTORY.md) | *(thêm ở Wave 1C-A)* Hồ sơ 14 bảng cấp trang: filter, sắp xếp, hành động, trạng thái, rủi ro, đợt rollout |

Đầu vào Wave 0A: [FIGMA_SECTION_INDEX.md](FIGMA_SECTION_INDEX.md) · [FIGMA_NODE_CATALOG.md](FIGMA_NODE_CATALOG.md) (1057 node) · [FIGMA_AMBIGUITIES.md](FIGMA_AMBIGUITIES.md) (A1–A12).

---

## 1. Kiến trúc frontend hiện tại

### 1.1 Khung ứng dụng

`apps/web` — Next.js 16.2 App Router, React 19.2, TypeScript strict. Ba route group:

| Group | Thư mục | Layout | Vai trò |
| --- | --- | --- | --- |
| `(public)` | [apps/web/src/app/(public)/](<../../apps/web/src/app/(public)/>) | [layout.tsx](<../../apps/web/src/app/(public)/layout.tsx>) | Marketplace + khu khách đã đăng nhập (`/`, `/listings/[id]`, `/shops/[slug]`, `/account`, `/trips`, `/chat`) |
| `(auth)` | [apps/web/src/app/(auth)/](<../../apps/web/src/app/(auth)/>) | [layout.tsx](<../../apps/web/src/app/(auth)/layout.tsx>) | Chỉ `/forgot-password`, `/reset-password` — đăng nhập/đăng ký chạy bằng modal, không có route riêng |
| `(manage)` | [apps/web/src/app/(manage)/](<../../apps/web/src/app/(manage)/>) | [layout.tsx](<../../apps/web/src/app/(manage)/layout.tsx>) → `AppShell` | Cổng quản lý dùng chung cho gian hàng và nền tảng |

**37 file `page.tsx`** — khớp con số brief 11 §3.1. Danh sách đầy đủ ở [01_FIGMA_ROUTE_NODE_MAP.md](01_FIGMA_ROUTE_NODE_MAP.md).

Route chuyển hướng: `/login` và `/register` KHÔNG có `page.tsx` — [proxy.ts](../../apps/web/src/proxy.ts#L46) (middleware) redirect chúng về flow modal, matcher `['/manage/:path*', '/login', '/register']`.

### 1.2 Vỏ cổng quản lý

[AppShell.tsx](../../apps/web/src/components/layout/AppShell.tsx) là nơi tập trung mọi quyết định vỏ:

- `PUBLIC_PORTAL_PATHS` / `BARE_PORTAL_PATHS` ([AppShell.tsx:28-29](../../apps/web/src/components/layout/AppShell.tsx#L28-L29)) — khai báo route nằm trong `/manage` nhưng không dùng shell (Next không cho route con thoát layout cha).
- Dọn cookie phiên hỏng → `DELETE /auth/session` → `portalLoginWithNext(pathname)` ([AppShell.tsx:51-67](../../apps/web/src/components/layout/AppShell.tsx#L51-L67)).
- `hasNoTenant && !platformRole` → `NoTenantState`, KHÔNG tự bật form tạo gian hàng.
- Banner `isPendingApproval`.
- Compose: `Sidebar` + `Topbar` + `main` + `MobileNav`.

Ba trải nghiệm khác nhau cùng nằm sau `/manage`: shop dashboard · platform dashboard · NoTenantState (brief 11 §3.1 gọi đây là "three-way overload", cố ý).

### 1.3 Điều hướng

[constants/nav.ts](../../apps/web/src/constants/nav.ts) là nguồn duy nhất của cây menu:

- `SHOP_NAV` (3 nhóm: Tổng quan · Quản lý · Cài đặt) và `PLATFORM_NAV`, chọn bằng `navForScope(isPlatform)`.
- Mỗi `NavLeaf` mang `permission` (chỉ ẩn/hiện) và cờ `comingSoon` cho trang placeholder.
- `mobileTabsForScope()` — 4 tab bottom nav, tab "Thêm" do `MobileNav` tự thêm.
- `matchSelectedKey()` / `groupKeyOf()` — khớp menu theo pathname, tiền tố dài nhất thắng.

[constants/routes.ts](../../apps/web/src/constants/routes.ts) — `ROUTES` + helper `vehiclePath` / `contractPath` / `listingPath` / `shopPath`. Không có route `/search` (xem [FIGMA_AMBIGUITIES.md](FIGMA_AMBIGUITIES.md) A6).

---

## 2. Kiến trúc style

**ADR 0003 — CSS Modules + AntD token. Không styled-components, không Tailwind, không inline style.**

Ba tầng, theo thứ tự ưu tiên khi viết style:

| Tầng | File | Dùng khi |
| --- | --- | --- |
| 1. Token | [styles/tokens.css](../../apps/web/src/styles/tokens.css) + [styles/theme.ts](../../apps/web/src/styles/theme.ts) | Mọi giá trị màu/khoảng cách/bo góc |
| 2. Reset + global | [styles/globals.css](../../apps/web/src/styles/globals.css) | Reset, scrollbar, `:focus-visible`, `prefers-reduced-motion`, `@media print` |
| 3. CSS Module | `*.module.css` cạnh component | Bố cục riêng của component |

### 2.1 Cơ chế parity token

`XP_TOKENS` trong `theme.ts` phải khớp **1-1 cả tên lẫn giá trị** với `--xp-*` trong `tokens.css`. [theme.test.ts](../../apps/web/src/styles/theme.test.ts) so hai file — lệch một token là test đỏ. Đây là bất biến quan trọng nhất của Wave 1A: **mọi thay đổi token phải sửa cả hai file trong cùng một commit.**

`cssVar(name)` để dựng `var(--xp-…)` từ TS; `XP_METRICS` chuyển token lịch sang number cho virtualizer.

### 2.2 Ngoại lệ inline style

Chỉ một: CSS custom property cho giá trị chỉ biết lúc runtime (vị trí event bar trên lịch). Mọi chỗ khác dùng CSS Module.

---

## 3. Tích hợp Ant Design

**AntD v6.5**, wire ở [app/providers.tsx](../../apps/web/src/app/providers.tsx):

```
AntdRegistry → ConfigProvider(theme=antdTheme, locale=viVN) → ReduxProvider → QueryClientProvider → AntdApp → ChatRealtimeProvider
```

Điểm cần biết:

- `AntdRegistry` (`@ant-design/nextjs-registry`) phải nằm ngoài cùng — thu CSS-in-JS lúc SSR. Vì ADR 0003 bỏ styled-components nên chỉ còn **đúng một** cơ chế thu style SSR.
- `antdTheme` **chỉ set seed token**, không ghi đè token component ([theme.ts:112-130](../../apps/web/src/styles/theme.ts#L112-L130)) — cố ý, để không bám tên token nội bộ của AntD qua mỗi lần nâng cấp. Hệ quả cho migration: muốn đổi hình dáng một component AntD thì đổi seed token hoặc bọc CSS Module, **không** thêm `components: {...}` bừa vào theme.
- `AntdApp` cung cấp `App.useApp()` → `message` / `modal` / `notification` có context. Mọi toast trong code đi qua đây.
- Không import `antd/dist/reset.css`; phần normalize nằm trong `globals.css`.
- Locale `viVN` + `dayjs` locale `vi` + plugin `utc`/`timezone`.
- Icon: **chỉ** `@ant-design/icons` (CLAUDE.md §4).

---

## 4. Vị trí component dùng chung

### 4.1 `packages/ui` — CỐ Ý ĐỂ TRỐNG

[packages/ui/src/index.ts](../../packages/ui/src/index.ts) chỉ có `export {}` kèm lý do: đẩy component vào package dùng chung khi mới có một nơi dùng là nợ kỹ thuật.

**Kết luận Wave 0B: giữ nguyên quyết định đó.** Chỉ có `apps/web` tiêu thụ UI; không có app thứ hai. Chuyển component sang `packages/ui` **không** nằm trong bất kỳ wave nào của [06_MIGRATION_ORDER.md](06_MIGRATION_ORDER.md).

### 4.2 `apps/web/src/components/` — component dùng chung thật sự

| Thư mục | Thành viên |
| --- | --- |
| `brand/` | `Logo` |
| `common/` | `PlaceholderPage` |
| `data-display/` | `StatusTag`, `MaskedContact`, `Stars` |
| `form/` | `TextField`, `TextAreaField`, `NumberField`, `SelectField`, `AutoCompleteField`, `DateTimeField`, `SwitchField`, `ImageUploadField`, `ImageGalleryField` |
| `layout/` | `AppShell`, `Sidebar`, `Topbar`, `MobileNav`, `ManageMenu`, `ManageUserCard`, `ManagePageHeader`, `use-manage-nav` |

**Tổng: 20 component dùng chung.** Đây là toàn bộ "design system" hiện có — không có Button/Modal/Drawer/Card/Table/EmptyState/ErrorState/LoadingState riêng; các màn dùng thẳng AntD. Xem [03_COMPONENT_REGISTRY.md](03_COMPONENT_REGISTRY.md).

### 4.3 `apps/web/src/lib/` và `hooks/`

`lib/`: `cx` · `datetime` · `money` (`formatMoneyVnd`) · `vehicle-labels`.
`hooks/`: `use-current-user` · `use-permissions` · `use-tenant-scope` · `use-url-filters` · `use-media-query` · `use-debounced-value`.

---

## 5. Pattern feature component

28 thư mục dưới [apps/web/src/features/](../../apps/web/src/features/). Hình dạng chuẩn:

```
features/<domain>/
  api.ts                  # gọi HTTP qua services/api-client, export DEFAULT_LIMIT
  types.ts                # type của feature (shape endpoint lấy từ @xeprime/types api.generated)
  constants.ts            # option select, label, meta status của riêng feature
  schema.ts               # yup schema (nếu có form)
  hooks/
    use-<domain>.ts             # useQuery
    use-<domain>-filters.ts     # đọc/ghi URL searchParams
    use-<domain>-mutations.ts   # useMutation + invalidate
  components/
    <X>Table.tsx / <X>FormDrawer.tsx / <X>DetailDrawer.tsx  (+ .module.css)
```

Quy tắc quan sát được:

- **Page = orchestration, feature component = presentation.** `page.tsx` gọi hook, xử lý quyền, dựng state loading/empty/error, rồi truyền props thuần xuống component. Ví dụ chuẩn: [manage/vehicles/page.tsx](<../../apps/web/src/app/(manage)/manage/vehicles/page.tsx>) → [VehicleTable.tsx](../../apps/web/src/features/vehicles/components/VehicleTable.tsx).
- **Trang đọc `useSearchParams` phải bọc `<Suspense>`** — bắt buộc với route tĩnh của Next ([vehicles/page.tsx:22-27](<../../apps/web/src/app/(manage)/manage/vehicles/page.tsx#L22-L27>)).
- Bảng nào cũng `scroll={{ x: 'max-content' }}` + `pagination` server-side từ `meta`.
- Chat có ngoại lệ: [ChatRealtimeContext](../../apps/web/src/features/chat/context/ChatRealtimeContext.tsx) là React Context toàn cục (ADR 0009 — projection Firestore).

**Hệ quả cho migration:** ranh giới file rất sạch, nên thay UI của một module không lan sang module khác. Nhưng chính vì mỗi `page.tsx` tự dựng scaffold trạng thái nên **cùng một sửa đổi phải lặp ở 14 chỗ** — xem [04_COMPONENT_DUPLICATES.md](04_COMPONENT_DUPLICATES.md) D1.

---

## 6. Pattern query / state

**ADR 0004 — ba kho, ranh giới rõ:**

| Kho | Dùng cho | Nơi khai báo |
| --- | --- | --- |
| **URL searchParams** | filter, sort, paging của mọi danh sách | `use-*-filters.ts` |
| **TanStack Query** | mọi dữ liệu server | `hooks/use-*.ts` + [services/query-keys.ts](../../apps/web/src/services/query-keys.ts) |
| **Redux Toolkit** | UI/client state thuần | [store/slices/](../../apps/web/src/store/slices/) — chỉ 3 slice: `app` (mobile nav open), `calendar-ui`, `scope` |

Cấu hình QueryClient ([providers.tsx:36-51](../../apps/web/src/app/providers.tsx#L36-L51)): `staleTime` 30s · `refetchOnWindowFocus: false` · **không retry 401/403**. QueryClient và store tạo trong `useState` chứ không module scope — module scope là singleton dùng chung giữa request trên server, tức rò dữ liệu giữa người dùng.

[use-url-filters.ts](../../apps/web/src/hooks/use-url-filters.ts) là bản dùng chung: giá trị rỗng/`'all'`/`false` → xoá param; đổi filter → về trang 1; `router.replace` + `scroll: false`. **Mới 3/13 feature dùng nó**, 10 feature còn giữ bản copy — D2 trong [04_COMPONENT_DUPLICATES.md](04_COMPONENT_DUPLICATES.md).

---

## 7. Pattern phân quyền

**CLAUDE.md §3 + §6: guard backend là nguồn bảo vệ chính. Frontend chỉ ẩn/hiện.**

- [use-permissions.ts](../../apps/web/src/hooks/use-permissions.ts) — `has(permission)` / `hasAny(...)`, đọc từ `useCurrentUser().data.permissions`. Docstring nói thẳng: ẩn nút không bảo vệ gì, endpoint tương ứng PHẢI có `@RequirePermissions(...)`.
- [use-tenant-scope.ts](../../apps/web/src/hooks/use-tenant-scope.ts) — `hasNoTenant` / `isPendingApproval` / `tenant`.
- Permission key: [packages/types/src/rbac.ts](../../packages/types/src/rbac.ts) — 26 key tenant + 11 key platform, 4 role tenant + 5 role platform.
- Không nhét role/permission/tenant_id vào session JWT (ADR 0002) — quyền đọc từ DB mỗi request.

Ba anomaly đã ghi nhận trong brief 11 §3.4, **không được "sửa" trong migration UI**: `vehicles.block_schedule` không guard gì · `bookings.cancel` không guard gì · chat không có permission key nào.

**Hệ quả cho migration:** Figma có ~40 frame `*-permission-denied`. Chúng là **biến thể hiển thị**, không phải cơ chế bảo vệ. Khi code, chúng trở thành nhánh render dựa `usePermissions()`; backend vẫn phải trả 403 độc lập.

---

## 8. Kiến trúc test

| | Runner | Số file | Ở đâu |
| --- | --- | --- | --- |
| `apps/web` | **Vitest** | 11 | cạnh file được test |
| `apps/api` | **Jest** | 25 `.spec.ts` | trong `modules/` |

11 test frontend:

| File | Bảo vệ điều gì |
| --- | --- |
| [styles/theme.test.ts](../../apps/web/src/styles/theme.test.ts) | **Parity `tokens.css` ↔ `theme.ts`** — cổng gác Wave 1A |
| [proxy.test.ts](../../apps/web/src/proxy.test.ts) | Redirect middleware |
| [auth/safe-next.test.ts](../../apps/web/src/features/auth/safe-next.test.ts) · [post-auth-destination.test.ts](../../apps/web/src/features/auth/post-auth-destination.test.ts) | Chống open-redirect, điều hướng sau đăng nhập |
| [calendar/utils/calendar-date.test.ts](../../apps/web/src/features/calendar/utils/calendar-date.test.ts) · [calendar-position.test.ts](../../apps/web/src/features/calendar/utils/calendar-position.test.ts) | Toán lịch |
| [marketplace/filter-params.test.ts](../../apps/web/src/features/marketplace/filter-params.test.ts) | Parse/serialize filter URL |
| [layout/AppShell.test.tsx](../../apps/web/src/components/layout/AppShell.test.tsx) | Phân nhánh vỏ portal |
| [auth/components/AuthModal.test.tsx](../../apps/web/src/features/auth/components/AuthModal.test.tsx) · [form/ImageUploadField.test.tsx](../../apps/web/src/components/form/ImageUploadField.test.tsx) · [marketplace/components/FilterPanel.test.tsx](../../apps/web/src/features/marketplace/components/FilterPanel.test.tsx) | 3 component tương tác |

**Khoảng trống:** không có visual regression, không có test a11y, không có test responsive, **không có test nào cho 14 trang danh sách**. [07_VISUAL_QA_MATRIX.md](07_VISUAL_QA_MATRIX.md) là quy trình thủ công lấp chỗ này; [06_MIGRATION_ORDER.md](06_MIGRATION_ORDER.md) ghi test bắt buộc thêm cho từng wave.

Chạy test: theo skill `verify-changes` — **chỉ verify phần vừa sửa**, không quét cả workspace.

---

## 9. Thứ tự ưu tiên nguồn (Figma-to-code source priority)

Khi hai nguồn nói khác nhau, áp dụng bảng này. **Không tự hoà giải mâu thuẫn nghiệp vụ bằng suy đoán** — ghi vào [08_DECISION_BACKLOG.md](08_DECISION_BACKLOG.md).

| Hạng | Nguồn | Có thẩm quyền về |
| --- | --- | --- |
| **1** | **ADR** `docs/decisions/0001–0010` | Kiến trúc, bảo mật, ranh giới ghi dữ liệu. Thắng tất cả. |
| **2** | **Source code + Prisma schema** | Hành vi runtime, shape API, chuyển trạng thái, quyền thực tế |
| **3** | **Design briefs 00–11** | Luật sản phẩm, phân loại current/partial/missing/future, quyền theo role |
| **4** | **Figma — section 01 Foundations** | Giá trị token thật (màu, thang chữ, spacing, radius, breakpoint) |
| **5** | **Figma — frame production của section nghiệp vụ** | Bố cục, biến thể, ý đồ responsive, độ phủ trạng thái |
| **6** | **Figma — component definition `XePrime/*`, `Fleet/*`** | Hợp đồng biến thể của component |
| **7** | **Figma — frame audit/handoff section 12** | Chỉ dùng làm **gợi ý**, KHÔNG làm nguồn sự thật (xem §9.1) |
| — | `docs/design/*` bản nhúng trong Figma (section Docs `8:2`) | Không dùng — repo là bản gốc (A11) |

### 9.1 ⚠️ Frame audit section 12 KHÔNG đáng tin về giá trị

Đã kiểm chứng trực tiếp trong wave này. Frame `122:2305` ("12.15 — Token Consistency Audit") công bố "GIÁ TRỊ CHUẨN" **mâu thuẫn với chính section 01 Foundations của cùng file Figma**:

| Token | 12.15 nói | Foundations (`14:*`) thực tế | Code |
| --- | --- | --- | --- |
| `color-primary` | `#D4AF37` | **`#d6a02c`** (`14:9`) | `#d6a02c` ✅ |
| `color-success` | `#28A745` | **`#16a34a`** (`14:59`) | `#16a34a` ✅ |
| `color-error` | `#DC3545` | **`#dc2626`** (`14:75`) | `#dc2626` ✅ |
| `color-bg` | `#FAF8F5` | **`#faf9f7`** (`14:26`) | `#f6f5f1` ❌ |
| `color-text` | `#1A1612` | **`#1a1a1a`** (`14:46`) | `#2a2318` ❌ |
| radius mặc định | `8px` | **`10px`** (`14:164`) | `10px` ✅ |
| H1 | `28px Bold` | **`32/40 Bold`** (`14:116`) | — |

5/7 giá trị màu trong 12.15 sai so với Foundations. **Quy tắc chốt: Foundations (`14:*`) thắng; 12.15 chỉ đọc để lấy *danh sách* token, không lấy *giá trị*.**

Tương tự, frame `122:1837` ("12.13 — Duplicate Component Report") tự khai "0 duplicate, 15/15 Done, 74 instances" trong khi `122:1567` ("12.11 — Global Component Map") ghi "module 03, 06–11: 0 component — vẽ tay từng màn" và A3 đo được frame `18:4` chỉ có **1** instance. Hai frame audit mâu thuẫn nhau → coi cả hai là **kế hoạch mong muốn**, không phải trạng thái đã đạt.

### 9.2 ⚠️ Catalog Wave 0A phân loại nhầm một route

[FIGMA_NODE_CATALOG.md](FIGMA_NODE_CATALOG.md) phân loại theo **tên node** (heuristic, tự khai báo trong header). Hệ quả: toàn bộ 18 frame `audit-log-*` / `audit-detail-*` / `mobile-audit-*` của section 10 (`109:1260` … `110:3217`) bị gán `AUDIT` → eligibility `NO`, trong khi chúng là **màn production của route `/manage/admin/audit`** (nhật ký hệ thống). Từ nay coi chúng là `PRODUCTION_*`. Đã sửa trong [01_FIGMA_ROUTE_NODE_MAP.md](01_FIGMA_ROUTE_NODE_MAP.md) hàng R35.

---

## 10. Nguyên tắc migration

Mười nguyên tắc ràng buộc mọi wave trong [06_MIGRATION_ORDER.md](06_MIGRATION_ORDER.md).

1. **Token trước, component sau, màn cuối cùng.** Không sửa một màn nào trước khi token đã đúng — nếu không sẽ phải sửa lại toàn bộ.
2. **Figma không phải bằng chứng backend có thật.** Một frame đẹp không có nghĩa endpoint tồn tại. Mọi màn phải qua [05_FEATURE_CLASSIFICATION.md](05_FEATURE_CLASSIFICATION.md) trước khi code; loại E (Future) và F (Unknown) **không được triển khai**.
3. **Hành vi runtime không đổi trong wave giao diện.** Migration UI được đổi bố cục/màu/khoảng cách/biến thể; **không** đổi chuyển trạng thái, shape API, hay quy tắc quyền. Đổi hành vi là một PR riêng, có brief riêng.
4. **Không hard-code lại.** Giá trị mới lấy từ Figma phải vào `tokens.css` + `theme.ts`, không rải trong `.module.css`. Status/role/permission/text nghiệp vụ vẫn từ `@xeprime/types` + `constants/` (CLAUDE.md §5).
5. **Parity token là bất biến.** `theme.test.ts` phải xanh sau mỗi commit chạm token.
6. **Tái dùng trước khi mở rộng, mở rộng trước khi tạo mới.** Trước khi tạo component phải kiểm [03_COMPONENT_REGISTRY.md](03_COMPONENT_REGISTRY.md); component mới phải có ≥2 nơi tiêu thụ thật, nếu không thì để trong feature.
7. **Gom trùng lặp NGAY TRƯỚC wave động vào nó, không phải sau.** Sửa 14 bản sao rồi mới gom là làm việc hai lần.
8. **Năm trạng thái mỗi bề mặt.** Default · Loading · Empty/No-results · Error (có retry) · Permission-denied. Figma đã vẽ đủ; thiếu trạng thái nào là defect, không phải "để sau".
9. **Mọi wave phải rollback được bằng một lần revert.** Một wave = một PR = một phạm vi file khai báo trước. Không trộn wave.
10. **Mâu thuẫn thì ghi, không đoán.** Figma ≠ code ≠ brief → dòng mới trong [08_DECISION_BACKLOG.md](08_DECISION_BACKLOG.md), tiếp tục phần không bị chặn.

---

## 11. Ba phát hiện định hình toàn bộ kế hoạch

**F1 — Sidebar sáng trong code, tối trong Figma.** [Sidebar.module.css](../../apps/web/src/components/layout/Sidebar.module.css#L9) dùng `--xp-color-bg-container` (#ffffff). Figma Foundations định nghĩa `--xp-shell-sidebar-bg` **#1e1b16**, `--xp-shell-sidebar-text` #e8e4dd, `--xp-shell-sidebar-active` #d6a02c (`14:92`/`14:96`/`14:100`), và section 01 có 3 frame `portal-shell-*`. Đây là thay đổi thị giác lớn nhất của cả đợt, chạm mọi trang `/manage`. → Quyết định P1 trong [08_DECISION_BACKLOG.md](08_DECISION_BACKLOG.md).

**F2 — 21 giá trị breakpoint rời rạc trong CSS, Figma chỉ có 4.** Code hard-code `max-width: 560px / 1120px / 760px / 640px / 480px / 992px / 768px / 420px / …` rải khắp `.module.css`; không có token breakpoint nào. Figma Foundations: Mobile ≤640 · Tablet 641–1024 · Desktop 1025–1440 · Wide >1440. `useIsMobile()` dùng 640px (khớp), nhưng `Sidebar` ẩn ở 992px (không khớp). → Wave 1A.

**F3 — Không có tầng component nguyên thuỷ.** Figma quy chuẩn 18 shared component (`122:1685`) với ~150 biến thể (`122:2052`); code có 20 component dùng chung nhưng **không cái nào** là Button/Modal/Card/EmptyState/DataTable — các màn dùng thẳng AntD với props lặp lại. Đây là nguồn gốc của mọi duplicate ở [04_COMPONENT_DUPLICATES.md](04_COMPONENT_DUPLICATES.md).
