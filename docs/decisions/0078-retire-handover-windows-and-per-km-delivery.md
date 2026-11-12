# ADR 0078 — Gỡ khung giờ giao/nhận xe và phí giao xe theo km

Ngày: 03/11/2026 · Trạng thái: **Accepted** (03/11/2026 — người dùng chốt khi làm lại màn sửa xe) ·
Liên quan: [0064](0064-financial-flow-v2.md) điều 9 (phí giao xe `G`, dạng bậc theo km — phần đó bị
ghi đè ở đây), [0069](0069-money-rounding-exact-vnd.md) (số cấu hình là bội 1.000đ),
[0075](0075-driver-wage-record.md) (cùng khuôn "gỡ nhưng giữ hình dạng API cho app cũ"),
[0006](0006-booking-concurrency.md) (thời gian chuẩn bị xe vẫn ở lại)

## Bối cảnh

Khi làm lại màn sửa xe theo design (sổ cái `docs/design/09_PARTNER_REDESIGN.md` §3.6), người dùng yêu
cầu bỏ hai tính năng:

1. **Khung giờ giao/nhận xe** (08/09/2026): chủ xe khai tối đa 4 khung giao + 4 khung nhận mỗi ngày
   (`vehicle_handover_windows`, EXCLUDE chống chồng lấn). Server từ chối yêu cầu đặt ngoài khung
   (`HANDOVER_WINDOW_VIOLATION`), tự nhận chuyến bỏ qua (`outside_handover_window`), chợ công bố khung.
2. **Phí giao xe theo km** (ADR 0064, 21/10/2026): mỗi bậc khoảng cách chọn trọn gói `{toKm, fee}`
   hoặc đơn giá `{toKm, perKm}` × khoảng cách thật.

Chỉ gỡ ở giao diện web là không đủ. Xe đã khai khung giờ sẽ bị server chặn mãi mà không còn chỗ nào
sửa, và chính sách đã có bậc theo km vẫn thu theo km.

## Quyết định

### 1. Khung giờ giao/nhận: gỡ khỏi hệ thống

- Xe nhận và trả **mọi giờ**. Server không còn kiểm khung lúc khách gửi yêu cầu hay lúc gian hàng
  chốt giờ nhận dài hạn. Tự nhận chuyến không còn mã chặn `outside_handover_window`.
- Migration `20261103180000_retire_handover_windows_per_km_delivery` **xoá bảng**
  `vehicle_handover_windows`.
- API giữ **hình dạng cũ** cho app phát hành trước đó (cùng khuôn ADR 0075):
  - `GET /vehicles/:id/operation-settings` và `handover` trên chi tiết chợ trả `pickupWindows` /
    `returnWindows` luôn rỗng (đánh dấu `deprecated`);
  - `PUT /vehicles/:id/operation-settings` nhận hai trường đó (tuỳ chọn) rồi bỏ qua.
- Snapshot điều kiện thuê **mới** mang hai mảng rỗng. Snapshot đã đóng băng trên yêu cầu/đơn cũ giữ
  nguyên khung của nó (lịch sử).
- `API_ERROR_CODE.HANDOVER_WINDOW_VIOLATION`, `AUTO_ACCEPT_BLOCKER.OUTSIDE_HANDOVER_WINDOW`,
  `HANDOVER_WINDOW_MAX_PER_KIND`, `handoverTimeToMinute`, `minuteToHandoverTime` ở `@xeprime/types` ở
  lại, đánh dấu `@deprecated`, vì app Partner mobile còn import. Không màn hình mới nào được dùng.
- **Thời gian chuẩn bị xe giữa hai chuyến** (`vehicle_operation_settings.turnaround_buffer_minutes`,
  ADR 0006) **ở lại**: đó là ràng buộc lịch thật, không phải một khung giờ.

### 2. Phí giao xe: mỗi bậc MỘT phí trọn gói

- Ghi đè đoạn "Bảng bậc phí giao xe có thêm dạng theo km" của ADR 0064 điều 9.
- Migration cùng tên đổi mọi bậc `{toKm, perKm}` trên chính sách **đang dùng** (`rental_policies`, cả
  gian hàng lẫn riêng xe) thành `{toKm, fee}` với `fee = perKm × toKm`, làm tròn tới 1.000đ
  (ADR 0069). Đó là mức phí cao nhất bậc đó từng thu, nên không bậc nào bị hạ giá ngầm. Người dùng
  chọn quy đổi tự động thay vì bắt chủ xe nhập lại.
- `PricingService.validatePolicy` **từ chối** bậc mang `perKm` (400, câu nói rõ phí theo km đã ngừng),
  và từ chối bậc thiếu `fee`. Trường `perKm` còn trong DTO, đánh dấu `deprecated`, chỉ để app cũ nhận
  được câu lỗi đó thay vì một lỗi "trường lạ".
- Bên ĐỌC vẫn hiểu dạng theo km (`deliveryTierFee`, `isPerKmDeliveryTier`, review snapshot), vì phiếu
  duyệt xe và báo giá đã đóng băng có thể mang nó. `DELIVERY_TIER_FEE_MODE` ở lại, `@deprecated`, cho
  app mobile.

## Hệ quả

- Web: mục "Chính sách thuê" của màn sửa xe chỉ còn thời gian chuẩn bị xe (không có khung giờ). Bảng phí
  giao xe (màn sửa xe và trang chính sách gian hàng) chỉ còn ô phí trọn gói. Trang xe phía khách không
  còn khối "Khung giờ giao nhận".
- **App mobile** (do dev khác làm, chưa đổi trong đợt này):
  - màn `VehicleHandoverTimeScreen` vẫn lưu được nhưng khung giờ bị bỏ qua;
  - form chính sách còn lựa chọn "Theo km": chọn nó thì server trả 400;
  - trang xe phía khách tự ẩn khối khung giờ khi mảng rỗng.
  Cần gỡ hai màn đó ở bản app kế tiếp.
- Khoá chữ của khung giờ và phí theo km ở `packages/domain/messages` **giữ lại** vì app mobile dùng
  chung.

## Cần xem lại khi

- App mobile đã phát hành bản không còn gửi khung giờ / `perKm`: gỡ các trường `deprecated` khỏi DTO, các
  hằng `@deprecated` khỏi `@xeprime/types`, và khoá chữ không còn ai đọc.
