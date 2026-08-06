# 06 — MIGRATION ORDER

> Ngày lập: 06/08/2026 · Wave 0B. **Đây là trình tự đề xuất, chưa phải uỷ quyền chạy.** Wave 1A chỉ được bắt đầu sau khi các quyết định gating ở [08_DECISION_BACKLOG.md](08_DECISION_BACKLOG.md) có câu trả lời (xem §0.3).

## 0. Luật chung cho mọi wave

### 0.1 Một wave = một PR = một phạm vi file khai báo trước
Không trộn wave. Không "tiện tay sửa". File nằm ngoài phạm vi khai báo mà bị đụng → tách PR khác.

### 0.2 Định nghĩa "xong" (áp dụng cho mọi wave)
1. Phạm vi file khai báo khớp file thực sự đổi (`git diff --name-only`)
2. `pnpm --filter @xeprime/web test` xanh (skill `verify-changes` — **chỉ scope module vừa sửa**)
3. `pnpm --filter @xeprime/web typecheck` + `lint` xanh
4. Checklist [07_VISUAL_QA_MATRIX.md](07_VISUAL_QA_MATRIX.md) của wave đó đã chạy, có ảnh trước/sau
5. **Không** thay đổi hành vi runtime ngoài phần đã ghi rõ trong mô tả PR
6. `docs/completion-roadmap.md` cập nhật

### 0.3 Cổng chặn (gating)

| Wave | Bị chặn bởi | Nếu chưa có câu trả lời |
| --- | --- | --- |
| **1A** | **P8** (cơ chế breakpoint) | Làm phần token màu/typo/radius/focus; **hoãn** phần breakpoint |
| **1D** | **P1** (sidebar sáng hay tối) | **Không chạy được.** 1D là wave sidebar |
| **Rollout R38** | **P2** (bản canonical staff, A2) | Bỏ R38 ra khỏi wave, làm sau |
| **Rollout R01/R02** | **P4** (`/search`) | Làm phần home, hoãn cụm results |
| Mọi wave tablet | **P3** (chuẩn tablet) | QA chỉ ở 3 breakpoint desktop + mobile |

### 0.4 Ba điều KHÔNG được làm ở bất kỳ wave nào
- Đổi shape API, chuyển trạng thái, hay quy tắc quyền (nguyên tắc §10.3)
- Code bất kỳ mục nào loại **D / E / F** ở [05_FEATURE_CLASSIFICATION.md](05_FEATURE_CLASSIFICATION.md)
- Làm cho nút chết (G7 Google/Facebook login, G8 lưu xe) trông như đang hoạt động

---

## WAVE 1A — Tokens

**Mục tiêu**: `tokens.css` + `theme.ts` khớp Figma Foundations. Không sửa component nào.

### Phụ thuộc
Không có. Đây là wave đầu tiên.

### Phạm vi file
```
apps/web/src/styles/tokens.css          (sửa)
apps/web/src/styles/theme.ts            (sửa — bắt buộc cùng commit)
apps/web/src/styles/theme.test.ts       (mở rộng)
apps/web/src/styles/globals.css         (focus ring)
apps/web/src/hooks/use-media-query.ts   (thêm useIsTablet/useIsDesktop)
apps/web/src/**/*.module.css            (chỉ thay số trần bằng var(); KHÔNG đổi bố cục)
```

### Việc
| Bước | Nội dung | Nguồn |
| --- | --- | --- |
| 1A.1 | Đọc nốt 9 giá trị `XÁC MINH`: 4 màu `*-bg` (`14:63/71/79/87`), 3 shadow (`14:173/176/179`), topbar-border (`14:108`), H4/BodyL/BodyS/Overline | Foundations |
| 1A.2 | **ĐỔI 9 token màu** (border, text ×3, bg, primary-light, secondary, tertiary) | [02 §2](02_DESIGN_TOKEN_MAP.md) |
| 1A.3 | **THÊM** thang chữ (~10 token) + `--xp-font-family-display` | [02 §5](02_DESIGN_TOKEN_MAP.md) |
| 1A.4 | **THÊM** radius-pill, border-strong, bg-muted, 4 `*-bg`, focus-ring ×2, disabled-opacity | ↑ |
| 1A.5 | **ĐỔI** focus ring theo `14:196` | `globals.css` |
| 1A.6 | **THÊM** 3 token breakpoint + gom 21 giá trị `@media` về 3 | ⚠️ chờ **P8** |
| 1A.7 | Thay số trần trong `.module.css` bằng `var(--xp-space-*)` | [02 §6](02_DESIGN_TOKEN_MAP.md) |
| 1A.8 | Đo tương phản 5 cặp bắt buộc | [02 §12](02_DESIGN_TOKEN_MAP.md) |

**KHÔNG làm ở 1A**: token sidebar tối (chờ P1) · token lịch (`--xp-calendar-*` — đổi làm lệch `XP_METRICS`, tách wave riêng) · `--xp-shell-sidebar-width` 232→240 (thuộc 1D).

### Rủi ro
| Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- |
| Đổi `--xp-color-border` chạm mọi đường kẻ | **CAO** | Commit riêng, ảnh trước/sau 6 màn đại diện |
| Đổi `line-height` Body M 1.5714→1.4286 làm lệch chiều cao mọi hàng bảng/form | **CAO** | Commit riêng, cuối wave. Nếu QA phát hiện lệch nhiều → **giữ 1.5714**, ghi vào backlog |
| Gom breakpoint đổi bố cục nhiều màn cùng lúc | **CAO** | Từng file một commit; ưu tiên file có test |
| Token mới trượt WCAG AA | TB | 1A.8 chạy trước khi merge |
| `theme.ts` và `tokens.css` lệch nhau | Thấp | `theme.test.ts` bắt ngay |

### Test
- **Bắt buộc**: [theme.test.ts](../../apps/web/src/styles/theme.test.ts) xanh
- **Mở rộng `theme.test.ts`**: khẳng định mọi token mới có mặt ở cả hai file; khẳng định thang breakpoint chỉ có 3 giá trị
- **Thêm mới**: test khẳng định **không** có `@media` nào trong `apps/web/src` dùng giá trị px ngoài 3 breakpoint đã chốt (grep-test)

### Checkpoint
`theme.test.ts` xanh · 5 cặp tương phản đạt AA · 6 màn đại diện (`/`, `/manage/vehicles`, `/manage/bookings`, `/manage/finance`, `/manage/admin`, `/trips`) có ảnh trước/sau ở 1440 + 390 · **không** file `.tsx` nào đổi.

### Rollback
Revert một commit → mọi thứ về cũ. Đây là wave dễ rollback nhất (chỉ CSS/TS hằng số). **Không có state ngoài** để dọn.

---

## WAVE 1B — Actions & Overlays

**Mục tiêu**: một cơ chế overlay duy nhất, responsive.

### Phụ thuộc
1A xong (dùng token mới cho shadow/radius/breakpoint).

### Phạm vi file
```
apps/web/src/components/overlay/ResponsiveDialog.tsx  (mới + .module.css + .test.tsx)
apps/web/src/components/overlay/DetailDrawer.tsx      (mới + .module.css + .test.tsx)
apps/web/src/features/**/components/*Modal.tsx        (13 file — chuyển sang wrapper)
apps/web/src/features/**/components/*DetailDrawer.tsx (7 file)
apps/web/src/features/**/components/*FormDrawer.tsx   (2 file)
apps/web/src/styles/theme.ts                          (CHỈ nếu cần components.Button — xem 1B.1)
```

### Việc
| Bước | Nội dung |
| --- | --- |
| 1B.0 | **Đọc Figma trước**: `122:3705` shared-overlay · `130:1563` overlay-responsive-mapping · `125:1611` Modal · `125:1632` Toast · `125:1571` Button |
| 1B.1 | Kiểm 4 variant Button (Primary/Secondary/Ghost/Danger) khớp `125:1571`. Nếu chữ trên nền gold sai màu → thêm `components.Button` vào `antdTheme` **kèm comment lý do** |
| 1B.2 | Kiểm 4 `Type` của toast khớp `125:1632`. Giữ `App.useApp().message`, **không bọc** |
| 1B.3 | Viết `ResponsiveDialog` (D5) |
| 1B.4 | Viết test cho `RequestBookingModal` **trước khi** đụng nó (hiện chưa có test) |
| 1B.5 | Chuyển 3 bản tự chế sang `ResponsiveDialog` — từng cái một commit |
| 1B.6 | Chuyển 10 modal chưa responsive — từng cái một commit |
| 1B.7 | Viết `DetailDrawer` (D6), chuyển 7 drawer |

### Rủi ro
| Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- |
| Gom `AuthModal` phá luồng đăng nhập | **CAO** | `AuthModal.test.tsx` đã có; chạy thủ công đủ 9 state auth của Figma trước khi merge |
| Gom `RequestBookingModal` phá luồng đặt xe (12 trạng thái) | **CAO** | 1B.4 viết test trước; QA thủ công đủ 12 frame `66:*` |
| Thêm bottom sheet cho 10 modal = hành vi mới trên mobile | TB | Mỗi modal một commit + QA riêng ở 390/360 |
| Modal lồng trong drawer vỡ z-index | TB | Làm 1B.7 **sau** 1B.6; kiểm chồng lớp ở mọi drawer có modal |
| Ghi rõ trong PR: đây **có** đổi hành vi (mobile) | — | Bắt buộc trong mô tả PR |

### Test
- Mới: `ResponsiveDialog.test.tsx` (render Modal ở desktop / Drawer bottom ở mobile, đóng bằng `Esc`, focus trap)
- Mới: `DetailDrawer.test.tsx` (loading / error+retry / content)
- Mới: `RequestBookingModal.test.tsx`
- Giữ xanh: `AuthModal.test.tsx`, `FilterPanel.test.tsx`

### Checkpoint
13/13 overlay dùng wrapper · mọi overlay thành bottom sheet ở ≤640px · `Esc` + click nền + focus trap hoạt động ở cả hai chế độ · không overlay nào tràn viewport ở 360px.

### Rollback
Mỗi modal là một commit độc lập → revert được từng cái. Wrapper mới không xoá gì cũ, nên revert toàn wave = xoá 2 file mới + revert 22 commit chuyển đổi.

---

## WAVE 1C — Forms, Feedback, Table

**Mục tiêu**: xoá scaffold trạng thái lặp; một `DataTable`; một `FilterBar`.

### Phụ thuộc
1A + 1B xong (DataTable mở `DetailDrawer`).

### Phạm vi file
```
apps/web/src/components/feedback/{EmptyState,LoadingState,PermissionState}.tsx   (mới)
apps/web/src/components/data-display/{DataTable,EntityIdentity,RowActions}.tsx   (mới)
apps/web/src/components/filter/FilterBar.tsx                                     (mới)
apps/web/src/components/form/StickyFormActions.tsx                               (mới)
apps/web/src/components/form/{NumberField,TextAreaField,DateTimeField}.tsx       (extend)
apps/web/src/app/(manage)/**/page.tsx                                            (17 file)
apps/web/src/features/**/components/*Table.tsx                                   (10 file)
apps/web/src/features/**/hooks/use-*-filters.ts                                  (9 file — trừ calendar)
```

### Việc
| Bước | Nội dung | Duplicate |
| --- | --- | --- |
| 1C.0 | **Đọc Figma trước**: `127:1564` · `127:1725` · `127:2060` · `127:2097` · `127:2257` · `127:2339` · `127:2463` · `130:1658` · `130:1752` · `134:2011` · `134:2093` · `134:2194` · `134:2482` |
| 1C.1 | Viết `EmptyState` (gộp empty / no-results / error / permission theo `Type`) + `LoadingState` + `PermissionState` | D1, D8 |
| 1C.2 | **Viết test cho 3 trang danh sách đại diện TRƯỚC khi gom** (vehicles, admin/tenants, receipts) — hiện 14 trang không có test nào | D1 |
| 1C.3 | Viết `DataTable<T>` gồm `renderCard` cho mobile | D1, B6 |
| 1C.4 | Viết `RowActions` + `actionColumn()`, sửa luôn `aria-label` | D3, C11 |
| 1C.5 | Viết `EntityIdentity` + `initialOf()` | D7 |
| 1C.6 | Chuyển 17 page + 10 bảng — **từng module một commit** | D1 |
| 1C.7 | Dọn `<Tag>` trần → `StatusTag` (chỉ nơi là status thật) | D4 |
| 1C.8 | Chuyển 9 hook filter sang `useUrlFilters` — **bắt đầu từ marketplace** (có test) | D2 |
| 1C.9 | Viết `FilterBar` + chuyển filter inline | — |
| 1C.10 | Viết `StickyFormActions`; extend `NumberField` (money/percent), `TextAreaField` (counter), `DateTimeField` (range) | — |

### Rủi ro
| Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- |
| Gom điều kiện lỗi làm **đổi hành vi** ở trang dùng `isError` trần (hết nháy lỗi khi refetch) | **CAO** | Ghi rõ trong PR là cải thiện có chủ đích; QA từng trang |
| Trang thiếu phân biệt empty/no-results **được thêm** → khác trước | **CAO** | ↑ |
| Chuyển bảng sang thẻ ở mobile = hành vi mới ở 14 route | **CAO** | 1C.3 sau khi 1C.2 có test; QA từng route ở 390/360 |
| 14 trang danh sách **không có test** | **CAO** | 1C.2 là bước chặn — không gom trước khi có test |
| Hook filter copy có thể **cố tình** khác (không reset page) | TB | Từng file một commit; đọc kỹ trước khi thay; **loại trừ `use-calendar-filters`** |
| `StatusTag` đổi màu so với `<Tag>` hard-code | TB | Ảnh trước/sau từng chỗ |

### Test
- Mới: `EmptyState.test.tsx`, `LoadingState.test.tsx`, `PermissionState.test.tsx`, `DataTable.test.tsx` (5 trạng thái + chuyển thẻ ở mobile), `RowActions.test.tsx` (có `aria-label`), `FilterBar.test.tsx` (debounce)
- Mới: 3 test trang danh sách (1C.2)
- Giữ xanh: `filter-params.test.ts`

### Checkpoint
17 page không còn `<Result status="error">` viết tay · 0 nơi lặp scaffold empty/no-results · mọi bảng có `renderCard` hoặc lý do ghi rõ tại sao không · 9/13 hook filter dùng `useUrlFilters` (calendar loại trừ có ghi lý do) · mọi nút icon trong bảng có `aria-label`.

### Rollback
Rủi ro cao nhất toàn đợt vì chạm 44 file. Giảm bằng: **một module một commit**, thứ tự từ ít rủi ro (`admin/plans`) → cao (`vehicles`, `bookings`). Revert từng module được. Component mới không xoá gì → revert wave = xoá 7 file mới + revert commit chuyển đổi.

---

## WAVE 1D — Layout & Navigation

**Mục tiêu**: vỏ portal khớp Figma.

### Phụ thuộc
1A + 1B + 1C xong. **⚠️ CHẶN bởi P1** (sidebar sáng hay tối).

### Phạm vi file
```
apps/web/src/styles/{tokens.css,theme.ts}                (token sidebar — nếu P1 = tối)
apps/web/src/components/layout/Sidebar.{tsx,module.css}
apps/web/src/components/layout/{Topbar,MobileNav,ManageMenu,ManageUserCard}.{tsx,module.css}
apps/web/src/components/layout/AppShell.{tsx,module.css}
apps/web/src/components/layout/ManagePageHeader.tsx      (P6 — cấp heading)
apps/web/src/store/slices/app.slice.ts                   (state collapsed)
```

### Việc
| Bước | Nội dung |
| --- | --- |
| 1D.0 | **Đọc Figma trước**: `14:1423` / `14:1531` / `14:1619` portal-shell · `47:5` / `47:77` sidebar · `59:871` Shell/Sidebar 11 biến thể · `134:3751` navigation-audit |
| 1D.1 | Áp kết quả **P1**: nếu tối → thêm 3 token sidebar + đổi `Sidebar.module.css` |
| 1D.2 | Xác minh `--xp-shell-sidebar-width` 232 vs `47:5` = 240 → đổi nếu đúng |
| 1D.3 | Đưa `Sidebar` ẩn/hiện từ `992px` về `--xp-bp-tablet` (1024px) |
| 1D.4 | **Thêm trạng thái collapsed** (B2) — token 64px đã có, chưa dùng. State ở `app.slice` |
| 1D.5 | Áp **P6**: `ManagePageHeader` dùng H1 (32/40) thay `Title level={3}` |
| 1D.6 | Kiểm `MobileNav` + `MobileTabBar` khớp `14:1619` |
| 1D.7 | Kiểm tương phản trên nền sidebar mới (logo, icon, badge chưa đọc) |

### Rủi ro
| Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- |
| Sidebar tối lật tông **25/39 route cùng lúc** | **RẤT CAO** | Chỉ chạy sau P1. Ảnh trước/sau **mọi** route manage ở 1440 + 390 |
| Logo/icon/badge không đọc được trên nền tối | **CAO** | 1D.7 trước merge; `Logo` đã có prop `tone` — dùng nó |
| Đổi ranh 992→1024 làm dải 993–1024px đổi bố cục | TB | QA riêng ở đúng 1024 và 1023 |
| `AppShell.test.tsx` phụ thuộc cấu trúc | TB | Chạy sớm, sửa test cùng commit |
| Collapsed là **tính năng mới**, không phải migration | TB | Commit riêng, ghi rõ trong PR |

### Test
- Giữ xanh: [AppShell.test.tsx](../../apps/web/src/components/layout/AppShell.test.tsx)
- Mới: test `Sidebar` collapsed toggle + `matchSelectedKey` vẫn đúng khi collapsed

### Checkpoint
Vỏ khớp `14:1423`/`14:1531`/`14:1619` · collapsed hoạt động và nhớ trạng thái · mọi tương phản đạt AA · 39 route có ảnh ở 1440 + 390.

### Rollback
Revert token sidebar + `Sidebar.module.css` là đủ để về sidebar sáng. Tách 1D.4 (collapsed) thành commit cuối để revert độc lập.

---

## WAVE 2 — PILOT: Fleet List (`/manage/vehicles`)

**Mục tiêu**: chứng minh nền tảng 1A–1D đủ dùng, trên **đúng một route**.

### Vì sao chọn route này
1. Figma phủ **10 trạng thái** — nhiều nhất toàn file (`58:5` … `58:2061`)
2. Có **cả 3 viewport** (desktop `58:5` · tablet `58:2144` · mobile `58:2405`)
3. Có **4 component định nghĩa sẵn** (`Fleet/OperationStatusTag`, `Fleet/PublicStatusTag`, `Fleet/ActionMenu`, `Fleet/StateDisplay`)
4. Code phía này là **bản chuẩn nhất** của pattern list (phân biệt empty/no-results đúng, có `VehicleTable` tách riêng, permission gate đủ)
5. **62% component Figma tập trung ở module 05 Fleet** (`122:1567`) — kiểm ở đây là kiểm nơi đặc tả dày nhất
6. Toàn bộ loại **A**, không dính D/E/F

### Phụ thuộc
**1A + 1B + 1C + 1D xong hết.** Không rút gọn.

### Phạm vi file (bounded — 6 file)
```
apps/web/src/app/(manage)/manage/vehicles/page.tsx
apps/web/src/app/(manage)/manage/vehicles/vehicles-page.module.css
apps/web/src/features/vehicles/components/VehicleTable.tsx
apps/web/src/features/vehicles/components/VehicleTable.module.css
apps/web/src/features/vehicles/components/VehicleFilters.tsx
apps/web/src/features/vehicles/components/VehicleFilters.module.css
```

**Ngoài phạm vi (dù cùng module)**: `/manage/vehicles/new`, `/[id]`, `/[id]/edit`, `VehicleForm`, `VehicleDetailView`. Đó là wave rollout, không phải pilot.

### Việc
1. Inspect chi tiết **10 frame** `58:5`–`58:2061` + `58:2144` + `58:2405`–`58:2767` + 4 component `Fleet/*`
2. Chuyển `page.tsx` sang `DataTable` + `EmptyState` + `PermissionState`
3. Chuyển `VehicleFiltersBar` sang `FilterBar`
4. Chuyển `use-vehicle-filters` sang `useUrlFilters`
5. Thêm `renderCard` cho mobile (`58:2405`)
6. Chuyển cột hành động sang `RowActions`; ô "Xe" sang `EntityIdentity`
7. Kiểm `Fleet/*StatusTag` khớp `StatusTag` + `VEHICLE_*_STATUS_META`

### Rủi ro
| Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- |
| Nền tảng 1A–1D thiếu thứ gì đó chỉ lộ ra khi dùng thật | TB | **Đó chính là mục đích pilot.** Thiếu gì → sửa ở component chung, không vá tại chỗ |
| `Fleet/*` Figma khác `StatusTag` code | TB | Nếu khác → **P5**, không tự đổi |
| Cám dỗ mở rộng phạm vi sang detail/form | TB | 6 file, cứng |

### Test
- Test trang từ 1C.2 (`/manage/vehicles`) phải giữ xanh và mở rộng: 10 trạng thái Figma → 10 case
- Mới: test `renderCard` mobile

### Checkpoint (điều kiện để mở rollout)
- 10/10 trạng thái khớp Figma ở 1440
- 6/6 breakpoint qua [07_VISUAL_QA_MATRIX.md](07_VISUAL_QA_MATRIX.md)
- **0 dòng CSS/logic riêng** phải thêm cho riêng route này — nếu phải thêm, nghĩa là component chung chưa đủ → quay lại 1B/1C
- `page.tsx` ngắn hơn bản cũ (dấu hiệu scaffold đã ra khỏi trang)

### Rollback
6 file, một commit. `git revert` là xong. Không có migration DB, không có thay đổi API.

**Nếu pilot thất bại**: dừng rollout, ghi cái thiếu, mở wave 1B/1C bổ sung. Không "cứ làm tiếp rồi sửa sau".

---

## WAVE 3+ — Rollout theo module

Chỉ chạy **sau khi pilot đạt checkpoint**. Thứ tự theo: rủi ro thấp trước · phụ thuộc lẫn nhau · độ phủ Figma.

| Wave | Module | Route | Vì sao thứ tự này | Rủi ro |
| --- | --- | --- | --- | --- |
| **3A** | Fleet còn lại | R15, R16, R17 | Cùng module pilot, đã hiểu; Figma phủ dày | TB |
| **3B** | Platform monitoring | R33, R34, R35, R36, R37 | Chỉ-đọc, ít mutation, Figma có frame ghi chú route (tin cậy cao nhất) | **Thấp** |
| **3C** | Governance | R32, R12 | Có mutation (duyệt/khoá) nhưng luồng rõ | TB |
| **3D** | Finance | R22, R23, R24 | Nhiều tiền → rủi ro cao; làm sau khi bảng đã ổn định | **CAO** |
| **3E** | Rental ops | R18, R19, R20, R21 | Phức tạp nhất (conflict, lịch, in) | **CAO** |
| **3F** | Shop org | R25, R26, R27 | | TB |
| **3G** | Billing | R38, R39 | ⚠️ R38 chặn bởi **P2** | TB |
| **3H** | Customer | R04, R05, R06 | Không có frame tablet | TB |
| **3I** | Marketplace | R01, R02, R03 | ⚠️ chặn bởi **P4**; CSS riêng nhiều nhất (`VehicleCard` 210+ dòng) | **CAO** |
| **3J** | Auth + onboarding | R09, R10, R13 | Đụng luồng đăng nhập → làm muộn, khi mọi thứ khác đã ổn | **CAO** |
| **3K** | Placeholder | R28, R29, R30, R31 | Rẻ nhất; **chỉ màn thông báo** | **Thấp** |
| **3L** | Chỉ áp token | R07, R08, R11 | Không có Figma → không redesign | **Thấp** |

Mỗi wave 3x tuân thủ: đọc frame của **đúng** wave đó (không inspect trước) · một module một PR · checklist QA đầy đủ · rollback bằng revert.

---

## WAVE 4 — Missing features (tuỳ chọn, cần brief riêng)

**Không** thuộc migration giao diện. Chỉ chạy khi sản phẩm quyết định làm.

| Wave | Mục | Loại | Chặn bởi |
| --- | --- | --- | --- |
| 4A | B1 ô tìm kiếm từ khoá marketplace | B | 01 Q1 |
| 4B | B3 lọc cơ sở ngày ở danh sách shop | B | — |
| 4C | B4 modal xác nhận đổi vai trò | B | — |
| 4D | B5 lọc PII-reveal trong nhật ký | B | — |
| 4E | C13 trình bày lý do từ chối (nếu xác minh là C) | C/D | xác minh |
| 4F | C15 chi tiết nhật ký dạng diff | C | — |

**Không có wave nào cho 30 mục D và 19 mục E.** Chúng cần brief sản phẩm, không phải kế hoạch migration.

---

## WAVE 5 — Final consistency audit

**Phụ thuộc**: mọi wave 3x xong.

### Việc
| Bước | Nội dung | Nguồn Figma |
| --- | --- | --- |
| 5.1 | Đối chiếu token: 0 hex trần, 0 breakpoint ngoài 3 giá trị, 0 spacing ngoài thang 5 bậc | `122:2305` (chỉ danh sách) |
| 5.2 | Đối chiếu component: mọi bảng dùng `DataTable`, mọi overlay dùng `ResponsiveDialog`, mọi trạng thái dùng `EmptyState`/`LoadingState`/`PermissionState` | `122:1567`, `122:1685` |
| 5.3 | Đối chiếu duplicate: chạy lại grep của [04](04_COMPONENT_DUPLICATES.md), khẳng định D1–D9 về 0 (trừ mục "KHÔNG gom") | `122:1837` |
| 5.4 | Ma trận QA đầy đủ 39 route × 6 breakpoint × 11 trạng thái | [07](07_VISUAL_QA_MATRIX.md) |
| 5.5 | Audit a11y: focus, bàn phím, accessible name | `134:2736`, `134:2865`, `130:1658` |
| 5.6 | Audit thuật ngữ tiếng Việt + từ vựng trạng thái | `134:3128`, `134:2967` |
| 5.7 | Audit riêng tư: masking đúng chỗ, reveal có audit | `134:3234`, `113:1814` |
| 5.8 | Đối chiếu backlog: mọi mục P đã đóng hoặc có chủ | [08](08_DECISION_BACKLOG.md) |
| 5.9 | Cập nhật `docs/completion-roadmap.md` + design-briefs theo standard §7 | brief 11 §13.5 |

### Checkpoint
Bảng đối chiếu 39 route × 11 trạng thái, không ô nào "chưa kiểm".

---

## Tóm tắt lộ trình

```
1A Tokens ──┬─► 1B Overlays ──► 1C Table/Forms/Feedback ──► 1D Layout* ──► 2 PILOT Fleet List
            │                                                   ▲
            └─ (P8 gating)                                  (P1 gating)
                                                                 │
   3A Fleet · 3B Monitoring · 3C Governance · 3D Finance · 3E Rental
   3F ShopOrg · 3G Billing** · 3H Customer · 3I Marketplace*** · 3J Auth · 3K Placeholder · 3L Token-only
                                     │
                                     ▼
                     4 Missing features (cần brief riêng)
                                     │
                                     ▼
                          5 Final consistency audit

*   1D chặn bởi P1     **  3G chặn bởi P2 (R38)     *** 3I chặn bởi P4
```

**Ước lượng phạm vi file**: 1A ~40 file (phần lớn CSS) · 1B ~24 · 1C ~44 · 1D ~12 · 2 = **6** · 3A–3L ~120 · 5 = 0 (chỉ kiểm).
