# ADR 0089 — Cà vẹt bắt buộc khi tạo ô tô trên web, đọc tự động bằng Tesseract, gắn vào xe trong cùng transaction

Ngày: 11/11/2026 · Trạng thái: **Accepted** (11/11/2026 — người dùng chốt: chỉ ô tô, xe cũ không chặn
chỉ nhắc, Tesseract tự chạy, cà vẹt ở bước Hình ảnh chỉ lưu giấy tờ) · Bổ sung: [0088](0088-mic-trip-insurance-integration.md)
điều 2 (điều kiện xe — cà vẹt có số khung + tên chủ) · Dùng lại: [0057](0057-customer-driver-licence-verification.md)
điều 2b (Tesseract trong tiến trình API) · **Điều 1 bị [0099](0099-vehicle-registration-for-all-vehicle-types.md)
ghi đè** trong phạm vi "chỉ ô tô" và "chỉ wizard nâng cao" (17/11/2026: mọi loại xe, cả luồng đăng nhanh)

## Bối cảnh

Bảo hiểm vật chất xe MIC (ADR 0088) chỉ bán cho ô tô có cà vẹt với **số khung + tên chủ đăng ký** — trường
bắt buộc của hợp đồng. Trước đây cà vẹt là giấy tờ TUỲ CHỌN ở tab Giấy tờ, nhập tay hoàn toàn (OCR giấy
tờ xe chưa có nhà cung cấp — `OcrNotConfiguredProvider`), nên gần như không xe nào đủ điều kiện. Ảnh/file
giấy tờ là file riêng tư gắn theo XE, mà ở wizard tạo xe thì xe chưa tồn tại.

## Quyết định

1. **Bắt buộc khi tạo ô tô trên web.** Bước "Hình ảnh" của wizard có ô "Cà vẹt xe" (bắt buộc, chỉ ô tô; xe
   máy chưa có bảo hiểm). Phiên hỗ trợ không có ô này và server chặn trường `registration` trong phiên hỗ
   trợ (default-deny của `supportVehicleCreateCapabilities`).
2. **Tải trước khi xe tồn tại** — bảng `vehicle_registration_uploads` (writer duy nhất
   `VehicleRegistrationUploadsService`): `POST /vehicle-registration-uploads/presign` (quyền
   `vehicles.create`, key `tenants/{tenant}/registration-uploads/{id}`) → PUT riêng tư →
   `POST /vehicle-registration-uploads/:id/read` kiểm ảnh (HEAD + chữ ký byte đầu) và ĐỌC ĐỒNG BỘ. Trần
   30 lượt/24 giờ/người.
3. **Đọc bằng Tesseract tại chỗ** (`TesseractVehicleRegistrationReader`, worker riêng, cùng bộ máy với bộ
   đọc bằng lái): tìm nhãn song ngữ bằng so khớp gần đúng, luật hình dạng từng trường, ba lượt xử lý ảnh
   BỎ PHIẾU — trường không chắc ⇒ `null`, không đoán. Máy đọc tắt/bận/lỗi ⇒ mọi trường trống, ảnh vẫn
   dùng được. Công tắc `VEHICLE_REGISTRATION_OCR=tesseract|off`.
4. **Đủ thì lưu luôn, thiếu thì nhập tay.** Đủ = tên chủ xe + số khung + số máy đọc được và biển số in trên
   cà vẹt khớp biển đã nhập (`assessRegistrationReading`) ⇒ chỉ hiện bản tóm tắt (vẫn bấm Sửa được).
   Thiếu/lệch ⇒ ô nhập bắt buộc, điền sẵn phần đã đọc. Server không tin "máy đã đọc": `registration` của
   `POST /vehicles` phải mang đủ trường bắt buộc.
5. **Gắn trong CÙNG transaction tạo xe**: khoá lượt tải (`FOR UPDATE`, phải của chính người tạo, cùng gian
   hàng, đã đọc, còn hạn 24 giờ) → `vehicle_private_files` mới trỏ CÙNG object → giấy tờ `registration` +
   phiên bản 1 → lượt tải `consumed`. Lỗi ở bất kỳ bước nào ⇒ không có xe.
6. **Dọn ảnh bỏ dở**: lượt tải chưa gắn quá 24 giờ bị `VehicleRegistrationUploadsSweeper` (API, 30 phút một
   vòng) xoá cả ảnh lẫn dòng — cà vẹt mang tên, địa chỉ chủ xe.
7. **Xe cũ, xe tạo từ app native: không chặn, chỉ nhắc.** Server CHƯA bắt buộc `registration` (app Partner
   chưa có bước này — ADR 0031). Tab Giấy tờ của ô tô hiện lời nhắc khi nền tảng đang bán bảo hiểm theo bậc
   mà xe thiếu cà vẹt (`GET /vehicles/:id/insurance-eligibility`). Không thêm loại cảnh báo xe mới: app
   native liệt kê đủ `VehicleAlertKind` trong một `Record`, thêm loại là vỡ typecheck của app đó.

## Hệ quả

- Ô tô mới tạo trên web có cà vẹt ngay ⇒ đủ điều kiện bảo hiểm khi có giá trị xe (ADR 0088).
- Tesseract đọc ảnh điện thoại không hoàn hảo: nhiều lượt sẽ rơi về nhập tay một phần — chấp nhận, vì ảnh
  vẫn là bằng chứng và chủ xe xác nhận số liệu.
- Lượt đọc chiếm vài giây CPU của API; trần lượt + hàng đợi có trần của bộ máy Tesseract giữ an toàn.

## Cần xem lại khi

App Partner có bước cà vẹt (bật bắt buộc ở server); tỷ lệ đọc đủ quá thấp (cân nhắc dịch vụ OCR cà vẹt trả
phí qua cùng cổng `VehicleRegistrationReader`); cần đọc cả cà vẹt cho xe đã có ở tab Giấy tờ (cắm bộ đọc này
vào `VEHICLE_DOCUMENT_OCR_PROVIDER`); mở bảo hiểm cho xe máy.
