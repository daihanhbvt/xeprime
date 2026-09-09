# ADR 0030 — Khoá căn cước xe thay cho "sửa là duyệt lại"

Ngày: 09/09/2026 · Trạng thái: Accepted · Ghi đè: ADR 0008 điều 2 (dòng "trường nhạy cảm")

## Bối cảnh

ADR 0008 đặt luật: xe đã duyệt mà sửa một trường "nhạy cảm" (giá, biển số, loại xe, ảnh đại diện,
dịch vụ…) thì listing bị ẩn, xe hạ về `pending_public_review` và một `approval_task` mới ra đời.

Chạy thật thì luật đó trả giá ở đúng chỗ nó định bảo vệ:

- **Giá ngoài chợ luôn cũ.** Chủ xe đổi giá theo mùa, theo cuối tuần, theo đối thủ — mỗi lần đổi
  là xe biến mất khỏi chợ tới khi có người duyệt. Kết quả là chủ xe không đổi giá nữa, và con số
  khách thấy không phải con số chủ xe muốn bán.
- **Hàng chờ duyệt đầy việc không có gì để duyệt.** Reviewer mở phiếu ra thấy "giá 600k → 650k"
  rồi bấm duyệt. Không có phán đoán nào ở đó.
- **Việc thật thì lại lọt.** Đổi biển số của một chiếc xe đang cho thuê là đổi *chiếc xe* — khách
  đặt xe biển này có thể nhận xe biển khác. Luật cũ xử nó y hệt một lần đổi giá: ẩn đi, chờ duyệt,
  rồi ai đó bấm duyệt trong cùng một nhịp bấm hàng loạt.

## Quyết định

### 1. Năm trường bị KHOÁ khi xe đang `approved_public`

`plate_number` · `vehicle_type` · `transmission` · `fuel_type` · `manufacture_year`
(`VEHICLE_LOCKED_AFTER_APPROVAL_FIELDS` ở `@xeprime/types`).

Đây là **căn cước** của chiếc xe: đổi chúng nghĩa là listing đã kiểm duyệt giờ mô tả một chiếc xe
khác. Server từ chối bằng `VEHICLE_FIELD_LOCKED` (409) kèm `details.fields`, kể cả khi lệnh ghi đến
từ một luồng tự động (OCR giấy tờ áp biển số). Muốn đổi thì gỡ xe khỏi chợ trước.

### 2. Mọi trường còn lại sửa tự do, hiệu lực NGAY

Giá, ảnh, mô tả, tiện ích, màu, chỗ ngồi, dịch vụ đăng bán, chính sách — sửa xong là chợ thấy ngay
trong cùng transaction (`ListingsService.syncFromVehicle` vẫn là đường ghi duy nhất). Không hạ
trạng thái, không sinh `approval_task`, không ẩn listing.

### 3. Mô tả xe thôi bắt buộc để lên chợ

Ảnh, thông số và giá đã đủ để khách quyết định. Một ô mô tả bắt buộc chỉ đẻ ra "xe đẹp, máy êm"
viết cho có — `missingPublicFields` (BE) và `PUBLISH_REQUIREMENTS` (FE) bỏ nó khỏi danh sách.

## Hệ quả

- Kiểm duyệt tập trung vào lần **lên chợ đầu tiên** và các báo cáo vi phạm, thay vì mọi lần sửa.
- Rủi ro còn lại: chủ xe hạ giá xuống mức phi lý hoặc viết mô tả sai sự thật sau khi được duyệt.
  Đây là rủi ro **hậu kiểm** — xử bằng báo cáo/gỡ xe, không phải bằng cách chặn mọi lần sửa. Khi
  có bằng chứng lạm dụng, thêm cảnh báo theo ngưỡng thay vì quay lại luật cũ.
- `VEHICLE_PUBLIC_SENSITIVE_FIELDS` giữ lại tạm thời và đánh dấu `@deprecated` vì `apps/mobile`
  còn dùng cho hộp xác nhận của màn sửa xe; app native cần bỏ hộp đó rồi mới xoá hằng.
