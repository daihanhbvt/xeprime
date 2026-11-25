# ADR 0109 — Đơn gian hàng tự lập: giá thoả thuận có phụ phí theo dòng; cọc tiền và tài sản thế chấp ghi theo từng đơn

Ngày: 25/11/2026 · Trạng thái: **Accepted** (25/11/2026 — chủ sản phẩm chốt sau buổi họp demo 19/11, mục #17
và #18: đợt đầu làm giá thoả thuận cho MỌI loại đơn tự lập + cọc và thế chấp theo đơn, giao diện theo luồng
đặt xe mới) · Bổ sung: [0028](0028-marketplace-subscription-fees-and-custodied-funds.md) điều 9 (đơn gian hàng tự lập nằm ngoài
chợ), [0024](0024-billing-mode-from-plan-frozen-on-booking.md) (tiền đóng băng lúc tạo) · Giữ nguyên: chính sách bảo đảm
của xe (`rental_policies.collateral_mode`, ba chế độ loại trừ — gap C-04), tiền giữ chỗ và cọc của luồng chợ
(ADR 0044 · 0064 · 0066)

## Bối cảnh

Buổi họp demo 19/11/2026:

- **#18**: chủ xe phải sửa tay được giá thuê theo từng đơn, thay vì bị cố định theo giá hệ thống. Luồng
  "Đặt xe cho khách" (nút tạo đơn ở `/bookings`, nút Đặt xe ở `/calendar` — cùng một hộp thoại) lấy tiền
  theo báo giá hệ thống; chỉ nhập tay được khi xe chưa cấu hình giá; phí giao xe luôn 0đ lúc tạo.
- **#17**: doanh nghiệp vài chục tới vài trăm xe dùng app như phần mềm quản lý nội bộ. Khó nhất là kiểm soát
  tài sản thế chấp: tiền mặt 500k - 1 triệu, CCCD, bằng lái, hoặc xe máy khách gửi lại. Mức cọc thay đổi theo
  từng khách, không cố định theo xe.

API đã nhận số tiền gian hàng nhập cho đơn tự lập (`POST /bookings` — đơn ngoài chợ, không phí sàn, không giữ
chỗ, không thuế nền tảng). Phần thiếu: phụ phí theo dòng, và chỗ ghi tài sản đang giữ.

## Quyết định

### 1. Giá thoả thuận (đơn gian hàng tự lập, mọi loại dịch vụ)

- Màn Xem lại của luồng đặt hộ có công tắc **Giá thoả thuận**. Tắt: tiền lấy từ báo giá hệ thống như cũ. Bật:
  giá hệ thống chỉ còn là gợi ý điền sẵn; gian hàng sửa **tiền thuê, giảm giá, phí giao xe, phụ phí theo
  dòng, cọc**. Tổng tính lại ngay trên màn. Xe chưa cấu hình giá ⇒ công tắc bật sẵn, không tắt được.
- Áp cho tự lái, có tài xế và dài hạn. Lịch thuê, gói dài hạn và dịch vụ vẫn do bước Chuyến đi quyết (giá
  thoả thuận không đổi độ dài đơn — ADR 0011).
- `CreateBookingDto` thêm:
  - `extraCharges[]` — tối đa `BOOKING_EXTRA_CHARGE_MAX_LINES` (10) dòng `{ label 1-80 ký tự, amount > 0 }`
    (ví dụ "Ghế trẻ em").
  - `negotiatedPrice: boolean` — chỉ để ghi nhãn "Giá thoả thuận" lên snapshot; server không có cách kiểm
    con số nào là "giá hệ thống" ở đơn tự lập, và không cần: đơn ngoài chợ là thoả thuận hai bên.
- Cột phẳng mới `bookings.extra_charges_amount` (Σ phụ phí, CHECK ≥ 0) để tổng, hợp đồng và báo cáo không phải
  giải jsonb. Từng dòng nằm trong `price_snapshot_json.rows` với khoá `PRICE_ROW.EXTRAS`.
- **Tổng = tiền thuê − giảm giá + phí giao xe + Σ phụ phí.** Giảm giá không vượt tiền thuê (422
  `BOOKING_DISCOUNT_EXCEEDS_BASE`). Sửa phí giao xe sau khi tạo (`PATCH …/delivery-fee`) tính lại tổng
  bằng CÙNG công thức — phụ phí không rơi mất.
- Đơn từ luồng chợ (duyệt yêu cầu) không nhận hai trường này: tiền của nó do `PricingService` chốt.
- Phụ phí lúc tạo khác "Phát sinh" (`booking_surcharges`): phát sinh ghi sau chuyến (quá giờ, hư hại…), phụ
  phí lúc tạo là một phần của giá đã thoả thuận và đóng băng như tiền thuê (ADR 0024).

### 2. Cọc và tài sản thế chấp theo đơn

- **Cọc tiền** vẫn là `bookings.deposit_amount` (điền sẵn từ chính sách xe, sửa theo thoả thuận).
- **Tài sản thế chấp** ghi ở bảng mới `booking_collaterals`: mỗi dòng một món khách để lại — loại
  (`BOOKING_COLLATERAL_TYPE`: CCCD, bằng lái, hộ chiếu, xe máy, cà vẹt xe máy, khác) + mô tả (biển số xe máy,
  số giấy tờ… — bắt buộc với loại "khác") + `returned_at`/`returned_by`.
- Một đơn cọc **tiền, tài sản, cả hai, hoặc không** — chế độ suy từ dữ liệu (`deposit_amount > 0`, có dòng
  tài sản), không thêm cột chế độ nào để khỏi lệch nhau.
- Danh mục loại của đơn rộng hơn `COLLATERAL_ASSET_TYPE` của chính sách xe (thêm CCCD, bằng lái, "khác"):
  chính sách xe là lời công bố trên chợ, cần danh mục đóng để lọc/so sánh; dòng của đơn là sổ ghi nhận thực
  tế giữa hai bên. Chính sách xe KHÔNG đổi — ba chế độ vẫn loại trừ nhau.
- Ghi được lúc tạo đơn (`collaterals[]`, tối đa `BOOKING_COLLATERAL_MAX_ITEMS` = 10) và trên chi tiết mọi đơn
  (kể cả đơn từ chợ — khách đặt online vẫn có thể để lại giấy tờ lúc nhận xe):
  - Thêm / gỡ: đơn còn `reserved` / `confirmed` / `active`; món đã trả không gỡ được.
  - **Đánh dấu đã trả** / hoàn tác: mọi trạng thái trừ đơn đã xoá — trả tài sản có thể diễn ra lúc khép
    chuyến hoặc sau đó.
  - Quyền `bookings.update`. Mỗi thao tác một dòng audit (`booking.collateral_add` / `_remove` / `_return` /
    `_unreturn`). Writer duy nhất: `BookingCollateralsService`.
- Danh sách tài sản + cọc tiền hiện trên chi tiết đơn và được chụp vào **hợp đồng** lúc lập (snapshot hợp
  đồng thêm `pricing.extraCharges` và `collaterals`; hợp đồng cũ không có khoá này vẫn đọc được).
- Trang chuyến của khách chưa hiện danh sách tài sản (đợt sau).

### 3. Ngoài phạm vi đợt này

- "Khách đã trả trước" lúc lập đơn, "Sửa tiền thuê" trên đơn đã tạo (đề xuất #18 mục 3-4) — đợt sau.
- Cho chính sách thuê của xe chọn cả hai loại cọc cùng lúc — không làm: chế độ của chính sách vẫn loại trừ;
  thoả thuận "cả hai" ghi ở từng đơn.

## Quan hệ với ADR cũ

| ADR | Phần bổ sung | Phần giữ nguyên |
| --- | --- | --- |
| 0028 điều 9 | Đơn tự lập có phụ phí theo dòng + cờ giá thoả thuận | Ngoài chợ: không phí sàn, không giữ chỗ |
| 0024 | Phụ phí lúc tạo đóng băng cùng tiền thuê | Không tính lại giá đơn đã tạo |
| Gap C-04 (`rental_policies`) | — | Ba chế độ bảo đảm của chính sách xe loại trừ nhau |
