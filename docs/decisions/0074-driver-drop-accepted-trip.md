# ADR 0074 — Tài xế rút khỏi chuyến đã nhận: vùng thời gian, cooldown, SLA điều phối và bảo vệ khách; bỏ tài xế ngoài hệ thống

Ngày: 28/10/2026 · Trạng thái: **Accepted** · Nguồn: đặc tả BA `SPEC-BUS-06` v1.1.0 (26/10/2026,
"Driver Drop Accepted Trip — Strictly Linked Drivers Only") · Ghi đè một phần:
[0067](0067-external-driver-on-booking-no-auto-cancel.md) điều 1 (không còn GHI MỚI tài xế ngoài hệ
thống), [0063](0063-linked-driver-accounts.md) điều 6 (tài xế đã nhận nay rút được cả SAU cửa sổ trả
lại) · Giữ nguyên: 0045 (trách nhiệm huỷ suy ở server), 0066 (tiền giữ chỗ, huỷ muộn), 0067 điều 2
(thiếu tài xế sát giờ KHÔNG tự huỷ đơn), 0072 (huỷ miễn phí tính từ lúc trả đủ)

## Bối cảnh

ADR 0063 (sửa 26/10) cho tài xế TRẢ LẠI chuyến đã nhận trong một cửa sổ ngắn sau khi nhận
(`driverReleaseUntil`). Quá cửa sổ, tài xế không có lối thoát nào trên app: gặp sự cố thật (ốm, tai
nạn, việc gia đình, đường tắc) thì họ bỏ cuốc trong im lặng, bên thuê không được báo, khách đứng chờ.

Đặc tả BA 06 chốt ba việc: (1) cho tài xế rút có cấu trúc — kèm lý do, phạt theo độ sát giờ; (2) bên
thuê nhận báo động + SLA điều phối lại; (3) khách không bị "bẫy phạt huỷ muộn" khi lỗi thuộc phía cho
thuê. Đặc tả cũng chốt **bỏ tài xế ngoài hệ thống** (quyết định 26/10/2026 của chủ sản phẩm).

## Quyết định

### 1. Rút khỏi chuyến (`POST /driver/trips/:id/drop`)

- Chỉ CHÍNH tài xế đang mang lượt `accepted`, đơn `with_driver` còn `reserved`/`confirmed` (chưa bàn
  giao). Đơn KHÔNG bị huỷ, không đồng tiền nào đổi chiều ở lượt này.
- Nhóm lý do bắt buộc (`DRIVER_DROP_REASON`: `health_issue` · `vehicle_accident` · `family_emergency`
  · `route_blocked` · `other`); ghi chú tối đa 500 ký tự, **bắt buộc 10–500 ký tự khi chọn `other`**.
- MỘT transaction, khoá dòng đơn: bốn cột tài xế về NULL (EXCLUDE `bookings_driver_user_schedule_excl`
  nhả người đó ngay), lượt trong sổ khép bằng kết cục MỚI `dropped` kèm lý do + vùng, ghi mốc sự cố
  trên đơn (điều 3), áp cooldown (điều 2), audit `booking.driver_dropped`, báo KHẨN bên thuê.
- `POST /driver/trips/:id/release` (trả lại trong cửa sổ, không lý do) GIỮ cho app cũ, hành vi cũ —
  cộng thêm việc ghi mốc sự cố ở điều 3. Web gọi `drop` cho mọi lượt rút; trong cửa sổ trả lại lượt
  `drop` mang vùng `grace` — không phạt.

### 2. Vùng thời gian — `ΔT = pickupAt − droppedAt`

| Vùng | Điều kiện | SLA bên thuê điều phối lại | Chế tài tài xế |
| --- | --- | --- | --- |
| `grace` | Còn trong cửa sổ trả lại (`driverReleaseUntil`) | theo ΔT như các dòng dưới | Không |
| `far` | ΔT ≥ 12h | 120′ | Vi phạm nhẹ (đếm vào lịch sử), không cooldown |
| `same_day` | 2h ≤ ΔT < 12h | 45′ | Cooldown 24h |
| `critical` | ΔT < 2h | 15′ | Cooldown 48h + cờ vi phạm nghiêm trọng |

- Hạn điều phối `driver_reassign_by = min(droppedAt + SLA, pickupAt)`, server tính MỘT lần, lưu trên
  đơn. Một hàm dùng chung: `driverDropPolicy` (`@xeprime/types`).
- **Cooldown** = `drivers.auto_assign_cooldown_until` trên LIÊN KẾT của bên thuê đó: liên kết đang
  cooldown bị loại khỏi tự gán của "Đặt ngay" (`pickForAutoAssign`). Bên thuê vẫn gán tay được. Đình chỉ
  (`suspended`) là quyết định của bên thuê, không tự động: danh sách tài xế hiện số lần rút 90 ngày và
  số lần rút sát giờ để họ quyết.

### 3. Mốc sự cố trên đơn và bảo vệ khách

- `bookings.driver_dropped_at` + `driver_reassign_by` ghi khi một tài xế ĐÃ NHẬN rút (drop hoặc trả
  lại), xoá khi một tài xế liên kết NHẬN chuyến (khách được báo "đã có tài xế mới"). CHECK: hai cột đi
  cùng nhau.
- Khách chỉ thấy trạng thái, không thấy ai đã rút: "Đang sắp xếp tài xế" / "Đang điều phối lại tài xế"
  / cảnh báo "Chuyến đang gặp sự cố điều phối" khi còn dưới 2 giờ.
- **Huỷ do sự cố tài xế**: sự cố đang mở VÀ (`now ≥ driver_reassign_by` HOẶC còn dưới 2 giờ tới giờ
  nhận) ⇒ khách huỷ được hoàn **100%** tiền giữ chỗ dù đã qua mốc huỷ miễn phí: kết cục `refunded`, lý
  do hoàn MỚI `driver_incident`, `booking_cancellations` ghi `responsible_party = host` (suy ở server,
  client không khai), nhóm lý do MỚI `driver_unavailable`. Màn xem trước huỷ đọc CÙNG phép kiểm.
- Bên thuê huỷ "do thiếu tài xế" đi đường huỷ sẵn có (ADR 0045) với nhóm `driver_unavailable` — hoàn
  100%, tính vào uy tín gian hàng.

### 4. Bỏ tài xế ngoài hệ thống

- `PATCH /bookings/:id/driver` có `externalDriverName`/`externalDriverPhone` ⇒ **422
  `EXTERNAL_DRIVER_NOT_SUPPORTED`**. Giao diện bỏ nút nhập.
- Cột `external_driver_*` GIỮ cho đơn cũ: vẫn hiển thị, vẫn gỡ/thay bằng tài xế liên kết được. Không
  migrate xoá dữ liệu.
- Tin nhắc thiếu tài xế (0067 điều 2) bỏ vế "nhập tài xế ngoài hệ thống".

### 5. Không làm ở ADR này (đặc tả có, cần quyết định riêng)

- **Voucher xin lỗi 100.000đ tự phát**: xung đột ADR 0046 (mã do admin phát hành, nền tảng tài trợ,
  không có "ví voucher" cá nhân). Cần chốt ai tài trợ và cơ chế phát trước khi làm.
- **Miễn phí rút + duyệt rút tự động 15′ cho tiền hoàn `REFUND_DRIVER_INCIDENT`**: ví điểm không thu phí
  rút; rút là admin chuyển tay (ADR 0033) — tự động chi cần release gate thanh toán.

## Hệ quả

- Migration `20261028100000_driver_drop_accepted_trip`: cột mới trên `bookings`, `drivers`,
  `booking_driver_assignments`; nới CHECK `outcome`, `hold_refunds.reason`,
  `booking_cancellations.reason_category`.
- Contract: endpoint mới, DTO mới trên chuyến tài xế (`canDrop`), danh sách tài xế (`dropCount`,
  `criticalDropCount`, `autoAssignCooldownUntil`), chi tiết đơn phía
  bên thuê (`driverIncident`), chuyến của khách (`driverIncident`), xem trước huỷ (`driverIncident`).
  App native (do đội mobile làm, ADR 0031): thêm nút rút chuyến, đọc `driverIncident` ở trang chuyến,
  bỏ form tài xế ngoài (API đã trả 422).
- Cần xem lại khi: tỉ lệ rút sát giờ của một bên thuê cao — cân nhắc trừ uy tín chính bên thuê sớm hơn;
  hoặc khi có chợ tài xế dùng chung (cooldown theo NGƯỜI thay vì theo liên kết).
