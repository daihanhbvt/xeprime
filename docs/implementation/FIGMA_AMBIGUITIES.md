# FIGMA_AMBIGUITIES — Điểm mơ hồ phát hiện khi discovery (Wave 0A)

> Ngày lập: 06/08/2026. Nguồn: discovery con-trực-tiếp của 13 section (xem [FIGMA_SECTION_INDEX.md](FIGMA_SECTION_INDEX.md)) + inspect chi tiết duy nhất frame `18:4`.
> Mỗi mục ghi rõ: cần inspect gì ở wave sau, và có cần người dùng/product chốt hay không.
> Trong catalog, các node liên quan đang mang phân loại `AMBIGUOUS`/`UNKNOWN` — **không được code từ các node này trước khi mục tương ứng ở đây được giải quyết.**

## A1 — Section 03: các frame nhóm "A/B/C" chồng lấp với frame màn lẻ

- **Section**: 03 Customer Account & Engagement (`23:3386`)
- **Node**: `23:5192` "A — Desktop: Đăng nhập & OTP" · `23:5193` "B — Desktop: Đăng ký & Tài khoản" · `23:5194` "C — Mobile: Auth Drawer & Tài khoản"
- **Vì sao mơ hồ**: cùng section đã có các frame màn lẻ (`auth-modal-login-default` 23:3395, `mobile-login-drawer` 23:4783…). Chưa rõ A/B/C là bảng tổng hợp (flow summary) chứa BẢN SAO các màn đó, hay là phiên bản khác của cùng màn.
- **Cần inspect**: metadata con của 3 node này; nếu là bản sao → chọn bản canonical (frame lẻ) và đánh dấu A/B/C là FLOW_SUMMARY.
- **Cần người dùng chốt?**: Không, trừ khi nội dung 2 bản khác nhau → khi đó cần chốt bản nào đúng.

## A2 — Section 11: hai bộ nhãn "Batch 1 — Platform Staff Management"

- **Section**: 11 Platform Organization & Billing (`113:3016`)
- **Node**: bộ 1: `113:3017` (BATCH 1) + `113:3019` (DESKTOP —…) · bộ 2: `114:3904` (Batch 1) + `114:3905`–`114:3908` (các frame nhóm tiếng Việt "Danh sách nhân viên nền tảng"…)
- **Vì sao mơ hồ**: hai bộ nhãn batch trùng tên trong cùng section — dấu hiệu design được sinh 2 đợt; có thể tồn tại 2 phiên bản màn staff.
- **Cần inspect**: con của `114:3905`–`3908` so với các frame lẻ `113:3033`/`114:1210`…; xác định bộ nào là bản mới nhất.
- **Cần người dùng chốt?**: **Có** — nếu cả 2 bộ đều chứa màn hoàn chỉnh, người dùng chọn bản canonical.

## A3 — Màn không dùng instance của shared component (detached)

- **Section**: phát hiện ở 02 (`18:4`), nghi ngờ toàn file
- **Bằng chứng**: frame `18:4` (Marketplace Home) chỉ có đúng 1 instance (`pagination` `117:1250`); toàn bộ card/chip/badge/button là frame copy tay, dù cấp page có `XePrime/Button|Modal|Toast|SearchBar|Chip|Badge` và section 05 có `Fleet/*`.
- **Vì sao mơ hồ**: nếu các màn khác cũng detached, thì "variant thật" của mỗi component không nằm ở definition mà rải rác trong màn → nguồn sự thật cho COMPONENT_REGISTRY (wave sau) không tin được vào definition đơn lẻ.
- **Cần inspect**: đếm instance trên 1–2 màn mẫu của mỗi section; đọc frame `duplicate-report` (`122:1837`) và `global-component-map` (`122:1567`) trong section 12 — file tự audit việc này.
- **Cần người dùng chốt?**: Không — nhưng ảnh hưởng cách code: token/spacing lấy từ Foundations + component definitions, màn chỉ dùng làm bố cục.

## A4 — Component cục bộ nằm rải trong section nghiệp vụ

- **Section**: 04 (`55:76` ShopStatusCard, `55:100` ImageUploadField) · 05 (`62:1532`–`62:1623`: Field Marker, Sensitive Field Indicator, Money Input, Percentage Input, Policy Toggle, Feature Chip, Image Upload Slot, Character Counter, Sticky Form Actions · `65:3566`–`65:3812`: Vehicle Detail Header, Specification Group, Price Summary, Feature Tags, Image Gallery Strip, Two-Axis Status Summary, Public Review Panel, Requirements Checklist, Reviewer Reason Panel, Publication Status Alert, Sensitive Edit Result · `58:2828`–`58:2891`: Fleet/OperationStatusTag, Fleet/PublicStatusTag, Fleet/ActionMenu, Fleet/StateDisplay · `59:871` Shell/Sidebar)
- **Vì sao mơ hồ**: đây có vẻ là component definitions nhưng đặt trong section nghiệp vụ thay vì Foundations — chưa rõ cái nào là dùng-chung thật (Money Input, Sticky Form Actions chắc chắn cross-module) vs một-lần. Trùng vai trò với bộ `XePrime/*` cấp page.
- **Cần inspect**: từng node trên + frame `ownership-matrix` (`122:1685`) trong section 12.
- **Cần người dùng chốt?**: Không — registry wave sau quyết định reuse/extend/create.

## A5 — Frame spec/matrix đánh số kiểu "05.9x", "03.5/03.6", "07.8c", "08.8c"

- **Node**: 05: `65:4844` (05.9C-vehicle-field-matrix), `65:5252` (05.9D-lifecycle-matrix), `65:5766` (05.9G-product-boundaries), `65:5940` (05.9I-prototype-flow-spec), `65:6170` (05.9K-business-rule-verification) và các mã 05.9x khác · 03: `40:502` (03.6 — Component Consolidation), `40:565` (03.5 — Prototype Flow Map) · 07: `84:3383` (07.8c — Prototype Flows & Visual QA) · 08: `92:1244` (08.8c — Prototype Flows & Visual QA)
- **Vì sao mơ hồ**: naming không theo convention nào đã biết; nhiều khả năng là tài liệu spec/QA (→ HANDOFF/AUDIT) nhưng tên không đủ kết luận — hiện đánh UNKNOWN/AMBIGUOUS.
- **Cần inspect**: screenshot nhanh từng frame để reclassify.
- **Cần người dùng chốt?**: Không.

## A6 — Route của cụm "Marketplace Results": `/search` chưa tồn tại trong code

- **Section**: 02 (`18:567` "2. Marketplace Results - Desktop - Filtered" và các màn results 3–7)
- **Vì sao mơ hồ**: code hiện tại render kết quả ngay trên `/` (filter đẩy ra URL — ADR 0004); route `/search` là đề xuất 🆕 trong `docs/design/07_INFORMATION_ARCHITECTURE.md` và `09_PAGE_DESIGN_ORDER.md` (Wave 1.2), chưa có trong `apps/web/src/constants/routes.ts`. Không map được frame → route mà không có quyết định sản phẩm.
- **Cần inspect**: không cần thêm — đây là quyết định, không phải thiếu dữ liệu.
- **Cần người dùng chốt?**: **Có** — tạo route `/search` riêng hay giữ kết quả trên `/`.

## A7 — Luồng đặt xe xuất hiện ở 2 section

- **Node**: 02: `21:911` (vehicle-detail-booking-entry) · 06: `66:11`… (booking-request-dates → success, 12 trạng thái)
- **Vì sao mơ hồ**: cùng một user flow nằm ở 2 section — ranh giới ownership khi chia batch implementation chưa rõ.
- **Cần inspect**: `21:911` để xác định nó chỉ là điểm vào (CTA trên trang xe) hay lặp cả flow.
- **Cần người dùng chốt?**: Không — design-brief 05 (Rental Operations) sở hữu flow; brief 01 sở hữu điểm vào. Theo brief.

## A8 — Node tên chung chung không suy được vai trò

- **Node**: 05: `58:2145` "sidebar" (64×1024), `58:2167` "workspace" (704×1024)
- **Vì sao mơ hồ**: tên thường, kích thước giống mảnh layout tách rời; không rõ là component, guide, hay rác.
- **Cần inspect**: screenshot 2 node.
- **Cần người dùng chốt?**: Không.

## A9 — Naming kém ở tầng sâu (dưới mức catalog)

- **Bằng chứng**: trong `18:4`, các tab loại xe là frame tên "Frame" (`18:59`, `18:61`, `18:64`, `18:66`, `18:72`…).
- **Vì sao đáng ghi**: catalog này chỉ phủ độ sâu 1; tầng trong còn node vô danh — khi inspect chi tiết từng màn phải dựa cấu trúc + screenshot, không dựa tên.
- **Cần người dùng chốt?**: Không.

## A10 — Độ phủ tablet mỏng và chưa có chuẩn

- **Bằng chứng**: chỉ 10 node PRODUCTION_TABLET trên toàn file (02: 4, 07: ≥2, 09: ≥2…), trong khi brief 00 ghi nhận "no tablet rules" là Unknown requirement.
- **Vì sao mơ hồ**: chưa rõ các frame tablet là chuẩn bắt buộc hay minh hoạ tham khảo.
- **Cần người dùng chốt?**: **Có** (đã nằm trong 15 quyết định treo của design-briefs README §9 — mục tablet).

## A11 — Tài liệu nhúng trong Figma có thể lệch với repo

- **Node**: section Docs `8:2` (con `8:5`–`8:38`)
- **Vì sao đáng ghi**: là bản chụp của `docs/design/` tại thời điểm tạo file Figma; repo tiếp tục tiến hoá.
- **Quy ước**: **repo là bản gốc** — mọi mâu thuẫn giữa bản nhúng và `docs/design/` trong repo thì repo thắng. Không cần inspect.

## A12 — Các section bắt buộc inspect chi tiết ở wave sau

Tất cả 12 section đánh số đều mới ở mức discovery độ sâu 1. Ưu tiên inspect theo thứ tự phục vụ code:

1. **01 Foundations** (`14:2`) — lấy giá trị hex/px thật của token để lập `02_DESIGN_TOKEN_MAP` (file không dùng Figma variables — giá trị nằm trong fill/style của swatch).
2. **12 Audit** (`120:1563`) — đọc `global-component-map`/`ownership-matrix`/`duplicate-report`/`token-audit` trước khi tự kết luận (tránh làm lại việc file đã tự audit).
3. **6 component `XePrime/*` + component cục bộ ở A4** — cho `03_COMPONENT_REGISTRY`.
4. Các section nghiệp vụ 02→11 — theo thứ tự wave code đã chốt (docs/design/09), mỗi batch chỉ inspect frame của batch đó.

---

### Tóm tắt số liệu

| | Số lượng |
| --- | --- |
| Node `AMBIGUOUS` trong catalog | 24 |
| Node `UNKNOWN` trong catalog | 9 |
| Mục mơ hồ cần người dùng chốt | 3 (A2, A6, A10) |
| Mục tự giải bằng inspect ở wave sau | A1, A3, A4, A5, A7, A8 |
