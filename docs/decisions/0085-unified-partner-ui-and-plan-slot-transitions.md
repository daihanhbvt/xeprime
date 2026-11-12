# ADR 0085 — Hai tuyến dùng chung giao diện site partner; suất gói là xe đang hiện trên chợ, đổi tuyến/đổi gói thì ẩn xe vượt suất và người bán tự chọn xe hiện lại

Ngày: 09/11/2026 · Trạng thái: **Accepted** (09/11/2026 — người dùng chốt qua ba vòng hỏi đáp về chủ xe
cá nhân dùng giao diện cũ và logic nâng/hạ gói) · Liên quan: [0024](0024-billing-mode-from-plan-frozen-on-booking.md)
điều 6, [0027](0027-feature-tiers-basic-owner-vs-shop.md), [0038](0038-owner-track-split-and-unified-wallet.md)
điều 1, 5, 12, [0041](0041-plan-tiers-by-vehicle-count.md) điều 4, [0048](0048-owner-marketplace-visibility.md)
điều 3, 5, [0051](0051-product-surfaces-web-zones-and-mobile-variants.md) điều 3,
[0054](0054-personal-storefront-uses-account-identity.md), [0065](0065-per-vehicle-type-shop-plans.md) điều 4–5,
[0084](0084-self-serve-plan-purchase-timing.md)

## Bối cảnh

Site partner của gian hàng tuyến gói đã chuẩn hoá theo design mới (`docs/design/09_PARTNER_REDESIGN.md`).
Chủ xe cá nhân tuyến hoa hồng vẫn còn những mảnh riêng:

- Một cây menu thứ hai viết tay (`OWNER_LITE_NAV`), một Tổng quan riêng (`OwnerLiteHome`), và một trang
  "Hồ sơ chủ xe" kiểu cũ (mục lục trái, tám section) thay cho trang Thông tin cửa hàng dạng thẻ.
- Màn sửa xe ẩn khối **phí quá giờ** với chủ xe cá nhân, nhưng quyết toán vẫn đọc chính sách hiệu lực
  của xe (`SettlementService.overtimeSuggestion`). Xe từng của một gian hàng hạ cấp (hay tenant có sẵn
  số mặc định) ⇒ hộp trả xe gợi ý một khoản phí chủ xe không thấy, không sửa được.

Logic chuyển tuyến có ba lỗ:

1. **Lên gói thiếu loại xe.** Chủ xe có ô tô + xe máy mua gói ô tô ⇒ cả gian hàng sang tuyến gói (0065
   điều 5), xe máy ở nguyên trên chợ và hưởng 0% hoa hồng dù không ai trả tiền cho suất xe máy.
2. **Hết gói giữ nguyên đội xe.** Hết ân hạn về tuyến hoa hồng mà giữ mọi xe trên chợ (0024 điều 6, 0038
   điều 12) ⇒ trần 3 xe của Owner Lite là luật trên giấy: mua gói một tháng, đăng 10 xe, để hết hạn, giữ
   10 xe ở tuyến hoa hồng mãi mãi.
3. **Nhân viên còn quyền sau hạ cấp.** Membership giữ nguyên quyền xem đơn/lịch (dữ liệu khách), nhưng
   `MembersController` là `@SubscriptionTrackOnly()` + cờ `members` ⇒ chủ xe không gỡ được họ.

Đầu bài của người dùng cho phần chuyển tuyến: **hệ thống không tự chốt gì** — không tự chọn xe giữ lại,
không tự hiện lại xe.

## Quyết định

### 1. Một bộ giao diện cho hai tuyến, cắt bằng ẩn — không có design riêng cho chủ xe cá nhân

Chủ xe cá nhân dùng CHÍNH các màn của gian hàng; mục menu, khối và thẻ không áp dụng thì **vắng hẳn**.
Menu là MỘT cây (`SHOP_NAV`), lọc theo quyền + cờ gói như nay, cộng một trục "chỉ tuyến gói" cho mục mà
server chặn bằng `@SubscriptionTrackOnly()` nhưng không có cờ. `OWNER_LITE_NAV` / `OWNER_LITE_MOBILE_TABS`
bị gỡ.

| Khối | Mục | Gian hàng | Chủ xe cá nhân |
| --- | --- | --- | --- |
| Tổng quan | Tổng quan | ✓ | ✓ cùng màn (`DashboardView`), vắng khối của gói |
| Vận hành | Đơn thuê xe · Lịch thuê xe | ✓ | ✓ |
| | Khách hàng | ✓ | — (sổ khách là năng lực gói, ADR 0027 · 0056) |
| Xe & Tài xế | Danh sách xe · Quản lý tài xế | ✓ | ✓ |
| | Bảo dưỡng | ✓ | — (cờ `maintenance`) |
| Doanh thu | Tổng quan doanh thu · Lịch sử giao dịch | ✓ | — (cờ `finance`) |
| | Quản lý ví | ✓ (chủ) | ✓ (chủ) |
| Cấu hình | Thông tin cửa hàng | ✓ | ✓ cùng trang `/shop`, nhãn "Hồ sơ chủ xe", vắng thẻ của gói |
| | Chính sách thuê | ✓ | — (điều 3) |
| | Nhân viên & phân quyền | ✓ | — (cờ `members`) |
| Trợ giúp | một danh sách chung | ✓ | ✓ |

Màn chủ xe đang ĐĂNG KÝ (hồ sơ / xe đầu tiên chưa qua duyệt) giữ nguyên — đó là luồng onboarding, không
phải một Tổng quan thứ hai. Ẩn ở giao diện không phải kiểm soát quyền: ranh giới vẫn chặn ở server
(ADR 0038 điều 4, 0051 điều 3).

### 2. `/shop` là trang Thông tin của cả hai tuyến; `/account` chỉ còn "Tài khoản & bảo mật"

Cùng khuôn thẻ của Thông tin cửa hàng. Mặt tiền cá nhân (`STOREFRONT_KIND.PERSONAL`, ADR 0054) đổi nội dung
thẻ, không đổi chỗ:

| Thẻ | Gian hàng | Chủ xe cá nhân |
| --- | --- | --- |
| Thông tin hiển thị | logo · ảnh bìa · tên · SĐT · email · giới thiệu (`tenants`) | ảnh đại diện · họ tên · giới thiệu (danh tính TÀI KHOẢN) |
| Chủ gian hàng | ✓ | — (chính là họ) |
| Địa chỉ & pháp lý | ✓ | ✓, không ô giấy phép kinh doanh |
| Khai thuế | ✓ | ✓ |
| Chi nhánh | ✓ (cờ `branches`) | — |
| Hoá đơn VAT | ở Chính sách thuê | thẻ riêng trên trang này (không có Chính sách thuê) |
| Gói & hạn mức | gói hiện hành | gói đang dùng + lối nâng cấp gian hàng |

Đăng nhập · mật khẩu · xoá tài khoản rời trang hồ sơ của chủ xe cá nhân, về "Tài khoản & bảo mật"
(`/account`) như mọi tài khoản partner. Link cũ `/account?section=profile|address|vat-invoice|tax|plan` của
chủ xe cá nhân chuyển tới section tương ứng của `/shop`.

### 3. Chủ xe cá nhân không có trang chính sách chung — cấu hình trên từng xe

Giữ nguyên hiện trạng: không có "Chính sách thuê", màn sửa xe sửa thẳng (không có công tắc "Áp dụng chính
sách của gian hàng", không có "theo mặc định" ở thời gian chuẩn bị xe). Thay đổi duy nhất: **khối phí quá giờ
hiện cho chủ xe cá nhân** (giá/giờ · số phút miễn · bước làm tròn; trống = không gợi ý thu). Server đọc gì
thì màn hình phải cho thấy và sửa được cái đó.

### 4. Suất gói là xe đang chiếm chỗ trên chợ — gác ở ba điểm, mọi nguồn trần

Xe **chiếm suất** = `public_status ∈ {pending_public_review, approved_public}` VÀ `marketplace_enabled =
true` (`MARKETPLACE_SLOT_WHERE`). Tắt công tắc ⇒ nhả suất — kể cả xe đang chờ duyệt, vì duyệt xong nó vẫn
nằm ngoài chợ tới khi chủ xe bật, và lượt bật đó đi qua cổng suất. Mọi lượt đưa xe ra chợ đếm sau khoá
suất của gian hàng (`pg_advisory_xact_lock`), vì trần là một phép đếm không biểu diễn được bằng constraint.

| Điểm thi hành | Đếm | Nguồn trần áp |
| --- | --- | --- |
| Tạo xe | mọi xe chưa xoá (như cũ) | mọi nguồn |
| Gửi duyệt lên chợ | xe chiếm suất, trừ chính chiếc đang gửi | **mọi nguồn** (mới: cả Owner Lite và `unconfigured`) |
| **Bật hiển thị** (`PATCH /vehicles/:id/marketplace-visibility`) | xe chiếm suất | **mọi nguồn** (mới) |

Owner Lite vẫn đếm TỔNG hai loại (3); bậc theo loại đếm trong phạm vi của gói (0065 điều 3). Loại chưa có
gói ở tuyến gói là trần 0 (`PLAN_SCOPE_REQUIRED`).

### 5. Đổi tuyến / đổi gói không bao giờ để xe vượt suất — và hệ thống không chọn thay người bán

**Ẩn** ở đây là tắt công tắc hiển thị của ADR 0048 kèm lý do `plan_limit` (cột mới, tách với "chủ tự ẩn").
Ẩn **không** khoá, **không** huỷ, **không** đòi duyệt lại:

- đơn đã có (`reserved` · `confirmed` · `active`) chạy tới hết;
- yêu cầu đang chờ vẫn do người bán duyệt/từ chối — hệ thống không tự đóng;
- xe vẫn sửa được, lịch vẫn chặn được; hiện lại là bật công tắc, qua cổng suất của điều 4;
- dữ liệu, ảnh, đánh giá giữ nguyên.

| Tình huống | Xử lý |
| --- | --- |
| **Mua gói áp ngay** (`new` / `upgrade`, gồm chủ xe cá nhân lên gói lần đầu) mà xe chiếm suất của một loại vượt trần sau kích hoạt — kể cả loại KHÔNG có gói (trần 0) | Xem trước (`POST /subscription/purchase/preview`) trả danh sách xe vượt theo loại. Người mua chọn: mua thêm gói / chọn bậc lớn hơn, **hoặc** tự chọn đủ xe giữ lại (≤ trần mỗi loại) và xác nhận ẩn phần còn lại. Thiếu lựa chọn ⇒ không phát hành hoá đơn (`PLAN_VEHICLE_SELECTION_REQUIRED`). Lựa chọn chụp lên hoá đơn |
| Lúc **tiền về** (transaction kích hoạt của webhook) | Xe chiếm suất của loại vượt trần mà không thuộc danh sách giữ ⇒ ẩn. Xe đã chọn mà nay không hợp lệ (đã xoá, bị nền tảng ẩn) ⇒ suất để trống, **không lấy xe khác thay**. Chưa trả tiền thì không ẩn gì |
| **Hạ bậc** (`change_next`, nối sau kỳ cuối — 0084) | Chọn xe giữ lại ở bước xác nhận, bắt buộc khi xe chiếm suất vượt trần của kỳ mới. Áp lúc kỳ mới BẮT ĐẦU (job vòng đời), cùng luật dòng trên |
| **Một phạm vi hết ân hạn**, phạm vi khác còn | Ẩn mọi xe chiếm suất của loại hết gói (trần 0) |
| **Mọi phạm vi hết ân hạn** ⇒ về tuyến hoa hồng | Ẩn **toàn bộ** xe chiếm suất. Người bán tự bật lại tối đa 3 (điều 4) |
| Có thêm suất (nâng bậc, mua thêm loại, gia hạn sau khi hết) | **Không tự hiện xe nào.** Báo số suất trống; người bán tự bật |

Một gian hàng đang vượt suất lúc triển khai **không bị ẩn hồi tố** — cổng của điều 4 chặn bật/gửi thêm;
lần đổi tuyến/đổi gói kế tiếp mới áp luật trên.

### 6. Nhân viên tạm khoá khi về tuyến hoa hồng, mở lại khi gói kích hoạt lại

Lúc mọi phạm vi hết ân hạn: membership `active` của người không phải chủ ⇒ `locked`, lý do `plan_lapsed`
(cột mới, tách với khoá tay của chủ). Gói kích hoạt lại ⇒ đúng các membership mang lý do đó trở về `active`;
khoá tay của chủ giữ nguyên. Không xoá membership nào.

### 7. Báo trước, báo đủ

| Mốc | Tin |
| --- | --- |
| Trước hết hạn 7 ngày | nhắc gia hạn (đã có) + nói rõ hậu quả: đơn mới tính hoa hồng, toàn bộ xe tạm ẩn |
| Ngày hết hạn | vào ân hạn (đã có) |
| **1 ngày trước khi hết ân hạn** | nhắc lần cuối (mới) |
| Lúc áp (kích hoạt có ẩn xe · đầu kỳ hạ bậc · hết ân hạn) | một tin tóm tắt: số xe đã tạm ẩn, số suất đang có, lối bật lại |

### 8. Tiền, idempotency, audit

- Không dòng tiền nào đổi. Hoa hồng vẫn theo tuyến tại lúc TẠO ĐƠN (0024 điều 5–7); ẩn xe không chạm tiền.
- Ẩn lúc kích hoạt nằm trong CÙNG transaction bật gói (một lần tiền về = một lần áp; webhook nhận lại là
  no-op theo idempotency sẵn có của SePay). Ẩn ở job vòng đời claim bằng cột mốc `UPDATE … WHERE … IS NULL`.
- Ghi `public_listings` qua `ListingsService` (ADR 0008) ở mọi đường của api. **Ngoại lệ hẹp duy nhất:**
  job vòng đời (worker) không gọi được `ListingsService`, mà tìm kiếm chợ đọc `public_listings.status` —
  nên khi tắt công tắc của đúng các xe nó tạm ẩn, nó hạ ĐÚNG cột `status` về `hidden` (chính giá trị
  `syncFromVehicle` suy ra khi `marketplace_enabled = false`), không chạm cột nào khác
  (`apps/worker/src/lib/plan-slots.ts`). Audit một dòng mỗi lượt áp (`vehicle.marketplace_paused_by_plan`),
  actor hệ thống, kèm danh sách xe đã ẩn và nguồn (`subscription_activation` · `plan_term_start` ·
  `scope_lapsed` · `track_lapsed`).
- Lựa chọn xe giữ lại chụp trên hoá đơn (`lines_json.vehicleSlots`); kỳ hạ bậc áp nó khi bắt đầu, claim
  bằng `tenant_subscriptions.slots_applied_at` (kỳ bắt đầu ngay ghi cột này trong lượt kích hoạt). Nhắc
  cuối ân hạn claim bằng `grace_final_reminded_at`.
- Luồng nâng cấp của chủ xe cá nhân chọn HAI gói ⇒ MỘT phiếu gộp (ADR 0083), không hai hoá đơn rời: suất
  tính cho cả hai gói cùng lúc và cả hai bật trong cùng một lần tiền về. Hai hoá đơn rời để lượt trả đầu
  tiên tính suất thiếu loại xe kia.
- Lõi chia nhóm suất (`planSlotGroups`, `planSlotQuotaFor`, `checkSlotSelection`) ở `@xeprime/types`
  (`plan-slots.ts`) — api và worker cùng một luật. App Partner chưa có màn mua gói (chỉ đọc
  `GET /subscription` và mở hộp tư vấn), nên không có lượt mua nào bỏ qua bước chọn xe; khi app có màn
  mua, nó phải đọc bản xem trước và gửi `keepVehicleIds` như web, nếu không sẽ nhận
  `PLAN_VEHICLE_SELECTION_REQUIRED`. Nhãn "tạm ẩn - hết suất gói" đến app qua
  `MARKETPLACE_VISIBILITY_REASON_META` dùng chung.

## Quan hệ với ADR cũ

| ADR | Phần bị ghi đè | Nay |
| --- | --- | --- |
| 0024 điều 6 | "Xe không bị gỡ khỏi chợ" + "hạn mức số chỗ không rơi theo" khi hết gói | Hết ân hạn ẩn toàn bộ xe chiếm suất; người bán bật lại trong trần Owner Lite (điều 5) |
| 0038 điều 12 | "Trần TỔNG chỉ gác điểm TẠO" + "Chuyển tuyến không gỡ hàng" | Trần Owner Lite gác cả gửi duyệt và bật hiển thị; đổi tuyến ẩn xe vượt suất (điều 4–5) |
| 0041 điều 4 | Cột "Gác gửi lên chợ ❌" của Owner Lite/`unconfigured`; "chặn thêm mới, không gỡ thứ đang có" | Mọi nguồn trần gác cả ba điểm; đổi gói ẩn xe vượt suất do người bán chọn |
| 0048 điều 3 | "Trần số xe của gói" trong mục "Hai cổng cố ý KHÔNG chạy ở đây" | Bật hiển thị chạy cổng suất (chính điều kiện xem lại của 0048 đã nêu) |
| 0048 điều 5 | Bộ lý do `marketplaceVisibilityReason` | Thêm `plan_paused` |
| 0065 điều 4 | Gạch "Không gỡ thứ đang có" | Phạm vi hết ân hạn ⇒ ẩn xe loại đó |
| 0065 điều 5 | "kể cả xe của loại vừa hết gói còn trên chợ" | Loại không có gói không còn xe nào trên chợ |
| 0084 Hệ quả | "số xe vượt trần mới chỉ bị chặn thêm mới" | Hạ bậc bắt chọn xe giữ lại, áp lúc kỳ mới bắt đầu |
| 0053 bảng (dòng 0038 điều 9) | Menu Owner Lite riêng của site partner | Một cây menu, cắt theo tuyến (điều 1) |

Không đổi: bốn pha của `resolveEffectiveBilling` và ân hạn đủ quyền (0038 điều 1); hết ân hạn không có
Manage chỉ-xem (0038 điều 5); `onboarding_state` không lùi (0040 điều 4); một gói hiện hành bất kỳ ⇒ cả
gian hàng tuyến gói (0065 điều 5, trừ đoạn đã ghi ở trên).

## Hệ quả

- `vehicles` có cột lý do tạm ẩn của hệ thống; `tenant_memberships` có cột lý do khoá của hệ thống.
- Xem trước + phát hành hoá đơn gói nhận lựa chọn xe giữ lại; hoá đơn/phiếu gộp chụp lựa chọn đó.
- Job vòng đời gói thêm: áp đầu kỳ hạ bậc, ẩn xe khi phạm vi hết ân hạn, khoá/mở nhân viên, nhắc 1 ngày
  trước khi hết ân hạn, tin tóm tắt.
- Thẻ xe hiện nhãn "Tạm ẩn - hết suất gói" khác nhãn "Bạn đã tạm ẩn".
- App mobile chưa theo: menu/hồ sơ native giữ nguyên tới đợt làm lại app (người dùng làm web); cổng suất
  ở server áp cho cả app.

## Cần xem lại khi

- Người bán phàn nàn mất nguồn cung vì quên bật lại xe sau khi gia hạn — cân nhắc nút "bật lại các xe vừa
  bị ẩn" một chạm (vẫn do người bán bấm).
- Gian hàng xoay vòng xe trong số suất ít hơn số xe (bật/tắt theo lịch trống) thành hiện tượng — cần xét
  lại định nghĩa suất.
