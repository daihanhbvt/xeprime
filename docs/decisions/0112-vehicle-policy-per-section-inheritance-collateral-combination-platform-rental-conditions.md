# ADR 0112 - Chính sách xe: kế thừa gian hàng theo TỪNG MỤC, cọc kết hợp tiền + tài sản, điều kiện thuê là luật chuẩn nền tảng

Ngày: 27/11/2026 · Trạng thái: **Proposed** (chờ chủ sản phẩm duyệt kế hoạch - feedback "Chỉnh sửa xe ›
Chính sách thuê" kèm Figma `Partner-XePrime` section `24231:108043` (app) và frame web `24705:27729` ·
`24705:27808` · `24705:27510` · `24705:27867` · `24705:27966`) · Ghi đè:
[0109](0109-negotiated-price-and-booking-collateral.md) phần "Giữ nguyên: ba chế độ bảo đảm loại trừ
(gap C-04)"; quy ước "đặt lại theo gian hàng = XOÁ row override" ở `rental_policies` · Bổ sung:
[0091](0091-insurance-owner-mode-service-fee-booking-limits.md) điều 1 (chế độ bảo hiểm theo xe kế thừa theo mục),
[0011](0011-long-term-fixed-packages.md) (mốc ưu đãi dài hạn kế thừa theo mục) · Giữ nguyên: ADR 0044
điều 9 (tiền giữ chỗ KHÔNG phải cọc), 0064 · 0066 (tiền giữ chỗ), quyết định 19/11/2026 "có tài xế luôn chờ
chủ xe duyệt"

## Bối cảnh

Màn sửa xe (web + app Partner) được thiết kế lại thành 7 mục: Thông tin chung · Hình ảnh · Giấy tờ xe ·
Dịch vụ xe · **Bảo hiểm & Giao nhận xe** (thay "Chính sách thuê") · Bảo dưỡng & số KM · Nguồn gốc & tài
chính xe. Ba điều thiết kế đòi mà dữ liệu hôm nay không có:

1. **Một công tắc "Áp dụng chính sách của gian hàng" cho TỪNG thẻ** (Bảo hiểm vật chất · Hình thức cọc ·
   Giao nhận · Giới hạn quãng đường & phụ phí quá giờ · Ưu đãi thuê dài hạn). Hôm nay xe chỉ có hai
   trạng thái: dùng TRỌN bản của gian hàng (không có dòng `rental_policies` theo xe), hoặc giữ TRỌN một bản
   riêng (có dòng). Chủ xe muốn riêng mức cọc thì phải tách luôn cả giao nhận, quá giờ, bảo hiểm khỏi gian
   hàng - và sau đó gian hàng sửa giao nhận cũng không tới xe đó.
2. **Cọc kết hợp**: "Có yêu cầu thế chấp" bật cọc tiền, cọc tài sản hoặc cả hai, kèm "Khách chọn 1 trong 2"
   hay "Bắt buộc cả 2". Hôm nay `collateral_mode` là một trong `cash | asset | none`, giữ bằng CHECK
   `rental_policies_collateral_scope_check`.
3. **Điều kiện thuê không còn sửa trên xe**: giấy tờ bắt buộc, cách đối chiếu danh tính, xác nhận điều
   khoản, nội dung điều khoản đang nằm theo (xe × dịch vụ) ở `vehicle_service_settings`. Chủ sản phẩm muốn
   siết lại: một luật chung, và bỏ hẳn điều khoản thuê tự soạn.

## Quyết định

### 1. Kế thừa gian hàng theo TỪNG MỤC

- Năm mục chính sách: `insurance` (chế độ bảo hiểm vật chất) · `collateral` (hình thức cọc + số tiền + loại
  tài sản) · `delivery` (giao nhận) · `usage_limits` (hạn mức quãng đường + phụ phí quá giờ) ·
  `long_term_discount` (mốc ưu đãi cam kết thời hạn). Chủ sản phẩm chốt 27/11/2026: cả năm mục đều chọn
  được "theo gian hàng / riêng cho xe"; mọi cấu hình khác của xe luôn lấy từ gian hàng. Thời gian chuẩn bị
  giữa hai chuyến hiện trong thẻ Giao nhận nhưng giữ cơ chế mặc định riêng đã có
  (`tenant_operation_defaults` + "dùng mặc định gian hàng" của `vehicle_operation_settings`).
- Dòng ghi đè theo xe (`rental_policies.vehicle_id` NOT NULL) thêm cột `inherited_sections varchar[]`
  (CHECK tập con của năm mã trên). Mục nằm trong mảng ⇒ đọc từ mặc định gian hàng (theo loại xe, rồi legacy);
  mục không nằm trong mảng ⇒ đọc cột của chính dòng xe. Giá trị các cột của mục đang kế thừa vẫn giữ
  nguyên để chủ xe tắt kế thừa là thấy lại cấu hình cũ.
- Gộp theo mục chỉ ở MỘT chỗ: `PricingService` (nguồn tính giá duy nhất) và `InsuranceModeService` (đọc
  `insurance` qua cùng hàm gộp). Không màn nào tự gộp.
- Migration: xe không có dòng ⇒ giữ nguyên (kế thừa cả năm mục, như hôm nay). Xe có dòng ⇒
  `inherited_sections = {}` (giữ nguyên hành vi "riêng toàn bộ"). Không ai bị đổi giá.
- Bật kế thừa lại một mục khi mục đó đang riêng ⇒ hỏi xác nhận (mất tuỳ chỉnh của mục đó trên giao diện);
  dòng theo xe chỉ bị xoá khi CẢ năm mục đều kế thừa.
- Gian hàng sửa mặc định ⇒ chỉ các xe đang kế thừa MỤC đó đổi theo.

### 2. Cọc kết hợp tiền + tài sản

- `collateral_mode` đổi nghĩa: `required` | `none`. Thêm `collateral_cash_enabled bool`,
  `collateral_asset_enabled bool`, `collateral_combination` (`any_one` | `all`).
- CHECK mới thay `rental_policies_collateral_scope_check`: `none` ⇒ hai cờ tắt, `deposit_amount = 0`, mảng
  tài sản rỗng; `required` ⇒ ít nhất một cờ bật; cờ tiền ⇔ `deposit_amount > 0`; cờ tài sản ⇔ mảng tài sản
  không rỗng; `all` chỉ có nghĩa khi cả hai cờ bật.
- Migration chuyển thẳng: `cash` ⇒ `required` + tiền; `asset` ⇒ `required` + tài sản; `none` ⇒ `none`.
  `combination = any_one`.
- Nhãn "Miễn thế chấp" trên sàn vẫn suy từ `collateral_mode = none` (ListingsService - ADR 0008).
- Trang xe và chi tiết yêu cầu/đơn hiện đủ: "Cọc tiền X hoặc Cọc tài sản (…)" / "Cọc tiền X và Cọc tài sản
  (…)". Snapshot lên yêu cầu lúc gửi như hôm nay. Cọc theo đơn của đơn tự lập (ADR 0109) không đổi.
- Không có ô "chỉ áp dụng Miễn thế chấp với khách đã eKYC / chưa vi phạm" và không có chỉ số "+40% lượt
  đặt": hệ thống chưa có eKYC, chưa có sổ vi phạm, và chưa đo con số đó (chủ sản phẩm chốt 27/11/2026).

### 3. Điều kiện thuê: giấy tờ là luật nền tảng, điều khoản là của GIAN HÀNG (không sửa trên xe)

Chủ sản phẩm chốt 27/11/2026 (sửa bản nháp trước - "bỏ hẳn điều khoản" - sau khi đọc frame Chính sách thuê
`23874:75957`):

- Giấy tờ bắt buộc: **CMND/CCCD còn hạn** (chụp lưu đối chiếu) **hoặc Hộ chiếu còn hạn** (đối chiếu trực
  tiếp). Cách đối chiếu danh tính: **qua VNeID** hoặc **bản gốc trực tiếp**. MỘT hằng
  (`PLATFORM_RENTAL_CONDITIONS`) cho mọi gian hàng, mọi xe, mọi dịch vụ; chỉ hiển thị, không ai sửa.
- Điều khoản thuê + công tắc "khách xác nhận điều khoản trước khi gửi yêu cầu" do GIAN HÀNG đặt ở trang
  Chính sách thuê, theo hai nhóm: **Tự lái & Dài hạn** (`self_drive`) và **Có tài xế** (`with_driver`).
  Bảng mới `tenant_rental_terms` (tenant × nhóm, unique), writer duy nhất một service. Áp cho mọi xe của
  gian hàng; màn sửa xe không có điều khoản.
- `vehicle_service_settings.{required_documents, identity_verify_method, terms_text,
  require_terms_acceptance}` thôi được đọc/ghi (cột giữ lại). Migration chép sang gian hàng: với mỗi
  (tenant, nhóm), lấy điều khoản không rỗng của dòng xe cập nhật gần nhất; `require_terms_acceptance` bật
  nếu dòng đó bật. Yêu cầu/đơn cũ đã snapshot điều khoản vẫn hiện bản đã chụp; yêu cầu mới snapshot điều
  khoản của gian hàng.
- Loại tài sản cọc giữ mã cũ; nhãn: "Cà vẹt xe (có giá trị trên 10 triệu đồng)", "Xe máy chính chủ",
  "Hộ chiếu còn hiệu lực" (không nhận giữ CCCD).
- Bằng lái của khách (ADR 0057) không đổi.

### 4. Không đổi

- Có tài xế luôn chờ chủ xe duyệt - không có công tắc tự nhận chuyến (lệch Figma có chủ đích).
- Tab Dịch vụ xe giữ logic giá hiện tại; chỉ đón thêm thẻ "Giới hạn quãng đường & phụ phí quá giờ" và
  "Ưu đãi thuê dài hạn" chuyển từ tab Chính sách (cùng một lệnh lưu giá-và-chính-sách như hôm nay).

## Để đợt sau (chủ sản phẩm chốt 27/11/2026 - đợt này chỉ hiện phần dữ liệu đang có)

1. **Khuyến mãi trực tiếp cho Có tài xế và Thuê dài hạn**: Figma vẽ thẻ "Khuyến mãi" ở cả ba dịch vụ.
   Dữ liệu chỉ có MỘT `vehicles.discount_percent` cho tự lái, và ADR 0011 cấm hiện % tự lái ở dài hạn.
2. **Mốc ưu đãi dài hạn theo số tiền** (`1.000.000 đ/tháng`): mốc hôm nay chỉ có `%`.
3. **Khuyến mãi "Giảm giá theo" % hoặc số tiền** ở tự lái: hôm nay chỉ có `%`.

## Hệ quả

- Một migration (cột mới + CHECK mới + chuyển dữ liệu), `PricingService` / `InsuranceModeService` gộp theo
  mục, DTO + OpenAPI, web (edit vehicle + trang Chính sách gian hàng + trang xe khách + chi tiết yêu cầu/đơn),
  app Partner và app khách (hai bản API - ADR 0031).
- Rủi ro: mọi nơi đọc `collateralMode` (≈ 50 file) phải đổi sang ba trường mới; viết helper
  `describeCollateral` ở `@xeprime/domain` để mọi bề mặt dùng chung.
