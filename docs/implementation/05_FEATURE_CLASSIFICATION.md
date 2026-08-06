# 05 — FEATURE CLASSIFICATION

> Ngày lập: 06/08/2026 · Wave 0B.
> **Tài liệu này KHÔNG uỷ quyền triển khai bất cứ thứ gì.** Nó chỉ phân loại. Chỉ loại **A** và **C** đủ điều kiện vào wave migration giao diện; **B** và **D** cần wave riêng có brief; **E**, **F**, **G** không được code như tính năng.

## Bảng phân loại

| Loại | Nghĩa | Được migrate ở wave giao diện? |
| --- | --- | --- |
| **A — CURRENT** | Có backend, có UI, chạy được. Figma vẽ lại đẹp hơn | ✅ **Có** |
| **B — UI MISSING** | Backend/API **đã có**, UI chưa có hoặc chưa lộ ra | ⚠️ Wave riêng — rẻ, nhưng là tính năng mới |
| **C — UI-ONLY IMPROVEMENT** | Chạy được, Figma đề xuất trình bày tốt hơn, **không** đụng backend | ✅ **Có** |
| **D — FULL-STACK MISSING** | Cần cả backend lẫn UI | ❌ Không |
| **E — FUTURE CONCEPT** | Figma/brief đánh dấu rõ là tương lai | ❌ **Không bao giờ trong đợt này** |
| **F — UNKNOWN** | Không đủ dữ kiện để kết luận | ❌ Không — phải inspect/hỏi trước |
| **G — PLACEHOLDER** | Bề mặt "chưa có tính năng" cố ý | ✅ Migrate **màn thông báo**, không phải tính năng |

**Nguồn**: source code · design-briefs 00–11 (đặc biệt bảng tổng hợp brief 11 §3.7) · Figma node (`FIGMA_NODE_CATALOG`).

---

## A — CURRENT (migrate được)

| # | Chức năng | Source | Brief | Figma |
| --- | --- | --- | --- | --- |
| A1 | Marketplace home + filter/facet/sort/paging | [features/marketplace/](../../apps/web/src/features/marketplace/) · `use-public-listings`, `use-listing-facets` | 01 ✅ | `18:4`, `18:1047` |
| A2 | Chi tiết xe công khai + gallery + review hiển thị | `ListingDetailView`, `ListingReviews` | 01 ✅ | `21:4`, `21:676`, `21:776` |
| A3 | Trang gian hàng công khai | `ShopHeader`, `ShopVehicleGrid` | 01 ✅ | `21:303`, `21:705` |
| A4 | Auth: login/register/OTP/reset · session cookie · post-auth routing · safe-next | `features/auth/`, `features/phone-verification/`, [proxy.ts](../../apps/web/src/proxy.ts) | 00 ✅ | `23:3395`–`23:4381` |
| A5 | Hồ sơ tài khoản khách | `AccountView` · `accountProfileSchema` | 02 ✅ | `23:4522`, `23:4595` |
| A6 | Danh sách chuyến (list-only) | `MyTripsView` | 02 🟡 | `26:630`–`26:1216` |
| A7 | Gửi đánh giá + hiệu ứng | `ReviewModal`, `use-create-review` | 02 ✅ | `26:119`–`26:421`, `23:6369` |
| A8 | Chat 2 chiều + realtime projection | `features/chat/` · ADR 0009 | 02/07 ✅ | `32:7`–`32:694`, `90:1203`–`90:2085` |
| A9 | Thông báo trong app + chuông + đánh dấu đã đọc | `features/notifications/` | 02/07 ✅/🟡 | `32:762`–`32:945`, `91:1203`–`91:1607` |
| A10 | Onboarding gian hàng: intent → đăng ký → hồ sơ → nộp duyệt · NoTenantState | `features/shop/` | 03 ✅ | `41:11`–`41:427`, `44:394`–`44:978` |
| A11 | Hồ sơ gian hàng + upload logo/cover | `ShopProfileForm` · `shopProfileSchema` | 03 ✅ | `42:6`–`44:265` |
| A12 | Fleet CRUD + tìm/lọc/sắp/phân trang | `features/vehicles/` | 04 ✅ | `58:5`–`58:2061` |
| A13 | Hai trục trạng thái xe (vận hành + public) | `VEHICLE_*_STATUS_META` · `StatusTag` | 04 ✅ | `58:2828`, `58:2841`, `65:3681` |
| A14 | Đăng public + knock-back khi sửa trường nhạy cảm | `VehicleDetailView`, `VehicleForm` | 04 ✅ | `65:240`–`65:1978`, `62:265`, `62:628` |
| A15 | Xoá mềm xe + chặn khi còn lịch | `use-vehicle-mutations` | 04 ✅ | `65:2168`, `65:2275` |
| A16 | Hạn ngạch xe theo gói | `assertVehicleQuota` (BE) | 10→04 ✅ | `60:1354`, `115:4274` |
| A17 | Đơn đặt xe: gửi (khách) + inbox duyệt (shop) | `features/booking-requests/` | 05 ✅ | `66:11`–`66:1192`, `68:200`–`68:2063` |
| A18 | Đơn thuê: tạo/sửa/chuyển trạng thái | `features/bookings/` | 05 ✅ | `72:205`–`72:4834` |
| A19 | Chống trùng lịch bằng `EXCLUDE USING gist` + preview `check-conflict` | ADR 0006 · `use-calendar-data` | 05 ✅ | `72:1739` (preview) + `72:2060` (server) |
| A20 | Lịch resource-timeline (chỉ đọc) | `CalendarScheduler` · `@tanstack/react-virtual` + `@dnd-kit` | 05 ✅ | `72:5809`–`72:7084` |
| A21 | Hợp đồng: xem + in | `ContractDocument` + `@media print` | 05 ✅ | `74:1219`, `74:1354` |
| A22 | Dashboard tài chính + chọn kỳ | `features/finance/` | 06 ✅/🟡 | `77:1205`, `77:1392` |
| A23 | Sổ thu chi + duyệt/huỷ + quản lý danh mục | `ReceiptTable`, `ReceiptFormDrawer`, `CategoryManagerModal` | 06 ✅ | `79:1360`–`79:5833` |
| A24 | Ghi nhận thu tiền + lịch sử + huỷ (void) | `features/payments/` | 06 ✅ | `77:4980`–`78:1902` |
| A25 | Công nợ | `DebtTable`, `use-debts` | 06 ✅ | `77:3255`–`77:4823` |
| A26 | Vòng đời thành viên gian hàng + phân giải RBAC | `features/members/` · `rbac.ts` | 07 ✅ | `87:1204`–`88:2750` |
| A27 | Dashboard nền tảng + KPI | `features/platform-dashboard/` | 08 ✅ | `92:1268`–`92:2574` |
| A28 | Hàng đợi duyệt + 3 quyết định (duyệt / yêu cầu sửa / từ chối) | `features/approvals/` | 08 ✅ | `97:1212`–`97:3778` |
| A29 | Khoá/mở gian hàng | `admin-tenants` | 08 ✅ | `97:6185`–`97:6791` |
| A30 | Ẩn/hiện xe (moderation) — qua `ListingsService`, ADR 0008 | `admin-vehicles` | 08 ✅ | `99:2506`–`99:2997` |
| A31 | Giám sát đơn thuê xuyên tenant + masking | `admin-bookings` · `MaskedContact` | 09 ✅ | `106:1213`–`106:2591` |
| A32 | Giám sát khách thuê + **PII reveal có ghi audit** | `admin-customers` | 09 ✅ | `107:1212`–`107:3151` |
| A33 | Đọc nhật ký hệ thống + lọc + chi tiết before/after | `admin-audit` | 09 ✅ | `109:1260`–`110:2101` ⚠️ |
| A34 | Nhân sự nền tảng + bảo vệ admin cuối cùng | `admin-staff` | 10 ✅ | `113:3033`–`114:3283` ⚠️ A2 |
| A35 | Gói dịch vụ: tạo/sửa/ngừng bán | `admin-plans` | 10 ✅ | `114:3917`–`114:6606` |
| A36 | Thuê bao tenant: gán/gia hạn/huỷ/snapshot/hạn suy diễn | `TenantPlanSection` | 10 ✅ | `115:2330`–`115:4212` |
| A37 | Vỏ portal: sidebar/topbar/mobile nav/scope switch | `components/layout/` | 00 ✅ | `14:1423`–`14:1619`, `47:5`, `47:77` |
| A38 | Dashboard gian hàng | `features/dashboard/` | 11 §6 "thin" | ❌ **không có Figma** |

**Tổng A: 38.**

⚠️ A33: catalog Wave 0A gán nhóm này `AUDIT`/`NO` do heuristic tên — **sai**, đây là màn production. Xem [01_FIGMA_ROUTE_NODE_MAP.md](01_FIGMA_ROUTE_NODE_MAP.md) R37.
⚠️ A34: dính A2 (hai bộ nhãn Batch 1) — **chốt bản canonical trước khi migrate**.
⚠️ A38: không có frame Figma → chỉ áp token, **không redesign**.

---

## B — UI MISSING (backend đã có, UI chưa lộ)

Đây là nhóm **rẻ nhất** để thêm giá trị — nhưng vẫn là **tính năng mới**, không phải migration giao diện.

| # | Chức năng | Bằng chứng backend đã có | Brief | Figma |
| --- | --- | --- | --- | --- |
| B1 | **Ô tìm kiếm theo từ khoá ở marketplace** | Brief 01: *"built end-to-end minus the input"* — API + index đã có | 01 Q1 🔗 | `23:1053` mobile-search-expanded |
| B2 | Sidebar thu gọn (collapsed) | Token `--xp-shell-sidebar-collapsed-width` 64px **đã có, không nơi nào dùng** | — | `47:77`, `14:1531` |
| B3 | Lọc `BOOKING_DATE_FIELD` (cơ sở ngày) ở danh sách shop | Brief 09 §6 xác nhận platform monitor **đang** dùng; shop list thì không | 05/09 | `106:1887` platform-bookings-date-basis |
| B4 | Sửa vai trò thành viên bằng modal xác nhận (thay vì inline) | Endpoint `PATCH` đã có; brief ghi "inverted confirmation severity" | 07/10 🟡 | `88:2228`, `114:2205` |
| B5 | Lọc bản ghi PII-reveal trong nhật ký | Endpoint audit đã nhận filter `action` | 09 ✅ | `109:1642` audit-log-reveal-filter |
| B6 | Thu gọn bảng sang thẻ ở mobile | Không cần backend — dữ liệu đã có | 11 §7 deviation | `127:2257` + ~12 frame `mobile-*-card` |

**Tổng B: 6.**

> B6 nằm ranh giới B/C: không cần backend, nhưng là **hành vi mới trên mobile**, không phải "vẽ lại cái đang có". Xử lý như B — nhưng vì nó là hạ tầng của `DataTable` nên đưa vào **Wave 1C** với ghi chú rõ trong PR.

---

## C — UI-ONLY IMPROVEMENT (migrate được, không đụng backend)

| # | Cải thiện | Vấn đề hiện tại | Brief | Figma |
| --- | --- | --- | --- | --- |
| C1 | Bottom sheet ở mobile cho ≥13 modal | 10 modal vẫn là modal desktop trên mobile | 00/11 §7 | ≥15 frame `mobile-*-sheet` |
| C2 | Phân biệt Empty vs No-results vs Unavailable | Vài trang gộp làm một | 11 §7 | `134:2093` |
| C3 | Lỗi kèm nút thử lại ở mọi bề mặt | Bề mặt chat báo lỗi bằng text trần, không có retry | 11 §7 | `134:2194` |
| C4 | Sticky action column chuẩn hoá | `fixed:'right'` không nhất quán; `width` mỗi bảng một kiểu | — | `127:2060` |
| C5 | Hành vi tràn ngang chuẩn hoá ở 1280/1024 | Mọi bảng `scroll x` không quy tắc | — | `127:2097`, `87:1525`, `97:1728` |
| C6 | Sidebar tối + 11 biến thể active | Sidebar sáng | — | `14:92`–`14:100`, `59:871` ⚠️ **P1** |
| C7 | Thang chữ (Display/H1–H4/Body/Label) | Chỉ có 2 cỡ chữ | — | `14:113`–`14:140` |
| C8 | Focus ring 2px viền + 3px ring 25% | `outline` 2px + offset | — | `14:196`, `134:2865` |
| C9 | Nhất quán token màu (border, text, bg) | 9 token lệch | — | Foundations `14:*` |
| C10 | Đúng cấp tiêu đề trang (H1 thay vì `Title level={3}`) | Sai ngữ nghĩa heading | — | `14:116` ⚠️ **P6** |
| C11 | Nút icon trong bảng có `aria-label` | `Tooltip` không thay được accessible name | — | `130:1658` |
| C12 | Trạng thái disabled chuẩn (60% + muted + no pointer) | Dựa hoàn toàn AntD | — | `14:198` |
| C13 | Trình bày lý do từ chối đơn đặt xe | `68:1615` "current" thô hơn | 05 | `68:1836` **design-target** |
| C14 | Yêu cầu lý do khi huỷ phiếu thu | `79:4808` "current" không bắt lý do | 06 | `79:5039` **target-reason** |
| C15 | Chi tiết nhật ký dạng diff | Hiện là JSON thô | 09 | `110:2986` **diff-target** |

**Tổng C: 15.**

⚠️ **C13, C14, C15 là ranh giới C/D.** Figma gọi chúng là "design-target", nghĩa là **chưa có**. Phải kiểm từng cái ở wave module tương ứng:
- C13 — nếu chỉ là bố cục lại form từ chối (lý do đã lưu ở BE) → **C**. Nếu bắt buộc lý do là quy tắc mới → **D**.
- C14 — brief 06 ghi huỷ phiếu thu **không** yêu cầu lý do hôm nay. Bắt buộc lý do = **thay đổi quy tắc nghiệp vụ → D** + cần chốt sản phẩm.
- C15 — dữ liệu before/after **đã có** trong `audit_logs`; render dạng diff là thuần UI → **C**.

**Kết luận thận trọng: C13 → chờ xác minh · C14 → chuyển sang D · C15 → giữ C.**

---

## D — FULL-STACK MISSING (không migrate)

| # | Chức năng | Trạng thái | Brief |
| --- | --- | --- | --- |
| D1 | Chi tiết chuyến + khách tự huỷ chuyến | ❌ missing | 02 Q4, 05 Q2/Q5 |
| D2 | Khách tự huỷ yêu cầu thuê · `cancelled_by_customer` · `expired` | 🔗 vocabulary có, không writer | 05 |
| D3 | Kênh thông báo (email/SMS/push) · thông báo cho khách vãng lai | 🔗/❌ | 02 Q1 |
| D4 | Lưu xe yêu thích (saved vehicles) | ⬜ nút chết | 01 |
| D5 | Khoảng chặn lịch (`blocked_range`) + bảo dưỡng thành workflow | 🔗 enum có, không writer | 04 Q1–Q2 |
| D6 | Quản lý custom role | 🔗 máy móc ngủ đông | 07 Q4, 00 Q6 |
| D7 | Ký hợp đồng | 🔗 | 05 |
| D8 | Báo cáo / biểu đồ / xuất file tài chính | ❌ | 06 |
| D9 | Vòng đời tiền cọc | ❌ | 06 |
| D10 | Cổng thanh toán | ❌ | 06 |
| D11 | Hoá đơn / e-invoice cho thuê bao | ❌ | 10 Q9 |
| D12 | Hệ quả khi gói hết hạn | 🔗 ADR 0010 hoãn | 10 Q2 |
| D13 | Bề mặt gói dịch vụ cho gian hàng | ❌ | 10 |
| D14 | Duyệt tài liệu (`TenantDocument`) | 🔗 model không workflow | 03/08 |
| D15 | Kiểm duyệt đánh giá | ❌ | 09 |
| D16 | Ticket hỗ trợ | ❌ | 09 |
| D17 | Quyền của chủ thể dữ liệu / chính sách lưu trữ | `Unknown` | 09 Q1–Q2 |
| D18 | Phân tích hành vi reveal PII | ❌ | 09 |
| D19 | Lời mời thành viên (`TenantInvite`) | 🔗 model không code path | 03/07 |
| D20 | Giá theo mùa | 🔗 | 04 |
| D21 | CSRF · thu hồi phiên · gia hạn trượt | 🔗 **ADR 0002 yêu cầu, chưa làm** | 00 |
| D22 | Thông báo broadcast | 🔗 | 02 |
| D23 | Lịch sử duyệt xuyên task · duyệt hàng loạt · tiêu chí duyệt | 🔗/❌ | 08 |
| D24 | Khu vực nhận xe (pickup areas) | ⬜ | 03 |
| D25 | Tài xế | ⬜ | 04 |
| D26 | Thùng rác | ⬜ | 04 |
| D27 | Khách hàng của gian hàng | ⬜ | 07 |
| D28 | Tương tác trên lịch (kéo-thả đổi lịch) | ⬜ | 05 |
| D29 | Route `/search` riêng | chưa quyết định | 01 ⚠️ **P4** |
| C14→D30 | Bắt buộc lý do khi huỷ phiếu thu | quy tắc nghiệp vụ mới | 06 Q1 |

**Tổng D: 30.**

D24–D27 có màn placeholder (xem G) — **màn thông báo migrate được, tính năng thì không**.

---

## E — FUTURE CONCEPT (không bao giờ code trong đợt này)

Figma tự đánh dấu. Đây là điểm mạnh của file — nhưng cũng là bằng chứng nguyên tắc *"Figma ≠ backend có thật"*.

| # | Frame | Nội dung |
| --- | --- | --- |
| E1 | `90:2386` | shared-inbox-**future-concept** (chat gán/chia hội thoại) — brief 07 Q2/Q3 chưa chốt |
| E2 | `97:3807` | **future**-cross-task-history |
| E3 | `97:3958` | **future**-review-criteria |
| E4 | `99:3105` | **future**-governance-context |
| E5 | `110:3217` | audit-target-link-**future** |
| E6 | `115:4336` | **future**-shop-subscription |
| E7 | `91:2080` | notification-routing-**future** |
| E8 | `91:2571` | notification-channels-**future** |
| E9 | `44:2830` | suspended-**future-concept** |
| E10 | `74:1649` | calendar-event-detail-**concept** |
| E11 | `91:2271` | custom-roles-product-**boundary** |
| E12 | `91:2371` | member-invites-product-**boundary** |
| E13 | `91:2471` | platform-support-chat-**boundary** |
| E14 | `107:3952` | pii-reveal-**design-target** — brief 09 Q3/Q5 (governance reveal) chưa chốt |
| E15 | `77:2497` | finance-dashboard-drilldown-**target** — brief 06 xếp reports/charts ❌ |
| E16 | `77:5646` | record-payment-guard-**target** — brief 06 Q2 chưa chốt |
| E17 | `115:4400` | **missing**-invoice-payment |
| E18 | `97:6829` | suspension-notification-**gap** |
| E19 | `44:2791` | suspended-current-**gap** |

**Tổng E: 19.**

> E15/E16/E14 cũng xuất hiện ở nhóm D — Figma đánh "target", brief đánh "missing/unknown". **Hai nguồn đồng ý**: không code.

---

## F — UNKNOWN (phải giải trước khi kết luận)

| # | Đối tượng | Vì sao chưa kết luận được | Cách giải |
| --- | --- | --- | --- |
| F1 | 9 component cục bộ form fleet (`62:1532`–`62:1623`) | Chưa rõ cái nào cross-module | Inspect từng node + `122:1685` — [FIGMA_AMBIGUITIES.md](FIGMA_AMBIGUITIES.md) A4 |
| F2 | 11 component cục bộ vehicle-detail (`65:3566`–`65:3812`) | ↑ | ↑ |
| F3 | `55:76` ShopStatusCard · `55:100` ImageUploadField | Catalog gán UNKNOWN; code **đã có** cả hai | So sánh với `ShopStatusCard.tsx` / `ImageUploadField.tsx` |
| F4 | 6 frame spec "05.9x" (`65:4844`, `65:5252`, `65:5766`, `65:5940`, `65:6170`) | Naming không theo convention | Screenshot phân loại lại — A5 |
| F5 | `40:502` (03.6 Component Consolidation) · `40:565` (03.5 Prototype Flow Map) | ↑ | ↑ |
| F6 | `84:3383` (07.8c) · `92:1244` (08.8c) Prototype Flows & Visual QA | ↑ | ↑ |
| F7 | `58:2145` "sidebar" (64×1024) · `58:2167` "workspace" (704×1024) | Tên chung chung, kích thước như mảnh layout rời | Screenshot — A8 |
| F8 | `23:5192`/`23:5193`/`23:5194` (nhóm A/B/C section 03) | Chưa rõ là flow-summary hay bản khác của cùng màn | Metadata con — A1 |
| F9 | Hai bộ "Batch 1" section 11 | Có thể có 2 phiên bản màn staff | A2 → **cần người dùng chốt (P2)** |
| F10 | `79:3960` "approve-cancel-combined" 100×100 | Kích thước bất thường — có thể là node rác | Screenshot |
| F11 | `18:1402` "Marketplace Results — No Inventory" | Catalog gán AUDIT nhưng tên là màn state | Screenshot |
| F12 | `44:2612` "status-invalid-transition" | Chưa rõ là state hợp lệ hay minh hoạ lỗi | Inspect |
| F13 | Frame tablet: 768px hay 1024px là chuẩn? | Figma dùng cả hai | **P3** |
| F14 | Chuẩn tương phản màu sau khi đổi token | Chưa đo | Wave 1A — [02_DESIGN_TOKEN_MAP.md §12](02_DESIGN_TOKEN_MAP.md) |

**Tổng F: 14.** Phần lớn tự giải bằng inspect; **F9 và F13 cần người quyết định.**

---

## G — PLACEHOLDER (migrate màn thông báo, không phải tính năng)

| # | Route | Code | Figma | Nav |
| --- | --- | --- | --- | --- |
| G1 | `/manage/customers` | `PlaceholderPage` | `91:2186` · 📱 `91:2784` | `comingSoon: true` |
| G2 | `/manage/pickup-areas` | `PlaceholderPage` | `44:2722` · 📱 `44:2318` | `comingSoon: true` |
| G3 | `/manage/drivers` | `PlaceholderPage` | `65:2489` · 📱 `65:3511` | `comingSoon: true` |
| G4 | `/manage/trash` | `PlaceholderPage` | `65:2576` · ❌ không có mobile | `comingSoon: true` |
| G5 | Bảo dưỡng như workflow | — | `65:2663` maintenance-current-limitation | — |
| G6 | Tương tác trên lịch | `CalendarScheduler` chỉ đọc | `74:1414` readonly-hover | — |
| G7 | Nút đăng nhập Google/Facebook | nút có, bấm lỗi | trong `23:3395` | — |
| G8 | Lưu xe yêu thích | nút chết | trong `21:4` | — |
| G9 | Chọn chi nhánh (Topbar) | dropdown placeholder một mục ([Topbar.tsx:50-58](../../apps/web/src/components/layout/Topbar.tsx#L50-L58)) | — | — |

**Tổng G: 9.**

⚠️ **G7 và G8 nguy hiểm hơn placeholder thường**: chúng là **nút chết trông như nút thật**. Figma vẽ chúng trong màn bình thường, không đánh dấu unavailable. Khi migrate màn chứa chúng, phải **giữ nguyên trạng thái chết hoặc ẩn đi** — tuyệt đối không "làm cho nó trông hoạt động". → ghi vào backlog **P11**.

---

## Tổng kết

| Loại | Số lượng | Vào migration giao diện? |
| --- | --- | --- |
| **A — CURRENT** | **38** | ✅ Có |
| **B — UI MISSING** | **6** | ⚠️ Wave riêng (B6 ngoại lệ, vào 1C) |
| **C — UI-ONLY IMPROVEMENT** | **15** *(C14 chuyển sang D → còn 14)* | ✅ Có |
| **D — FULL-STACK MISSING** | **30** *(+C14 = 30)* | ❌ Không |
| **E — FUTURE CONCEPT** | **19** | ❌ Không |
| **F — UNKNOWN** | **14** | ❌ Chưa |
| **G — PLACEHOLDER** | **9** | ✅ Chỉ màn thông báo |
| **Tổng mục phân loại** | **131** | |

**Phạm vi được phép migrate ngay: A (38) + C (14) + G (9) = 61 mục.**
**Bị loại khỏi migration: D (30) + E (19) + F (14) = 63 mục** — hơn một nửa những gì Figma vẽ.

Con số này là lý do nguyên tắc §10.2 tồn tại: **file Figma phủ rộng hơn hệ thống thật rất nhiều.** Chọn màn để code theo section Figma sẽ dẫn tới xây tính năng không có backend.

### Đối chiếu chéo với brief 11 §3.7

| Brief 11 | Số | Ánh xạ ở đây |
| --- | --- | --- |
| Implemented | ~170 subject | A (38 nhóm chức năng, hạt thô hơn subject của brief) |
| Partially implemented | ~45 | rải giữa A (🟡) và C |
| Placeholder | 6 | G1–G6 |
| Referenced but not implemented | ~25 | D (phần 🔗) |
| Missing | ~10 | D (phần ❌) |

Không mâu thuẫn: brief đếm theo *subject* nghiệp vụ, tài liệu này đếm theo *đơn vị triển khai UI*. Cả hai đồng ý về **cái gì có và cái gì không**.
