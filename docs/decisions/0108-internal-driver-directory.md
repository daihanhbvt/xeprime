# ADR 0108 — Danh bạ tài xế nội bộ: gán người không có tài khoản vào đơn có tài xế, chặn trùng lịch ở DB

Ngày: 25/11/2026 · Trạng thái: **Accepted** (25/11/2026 — chủ sản phẩm chốt sau buổi họp demo 19/11,
mục #16: làm danh bạ, chặn trùng lịch, không gửi SMS) · Ghi đè: [0074](0074-driver-drop-accepted-trip.md)
điều 4 (bỏ ghi mới tài xế ngoài hệ thống) trong phạm vi tài xế CHỌN TỪ DANH BẠ; [0067](0067-external-driver-on-booking-no-auto-cancel.md)
dòng "không bảng, không danh bạ"; [0063](0063-linked-driver-accounts.md) điều 2 ("bỏ hồ sơ không tài khoản")
· Giữ nguyên: 0063 (tài xế liên kết), 0066 điều 4 (hạn trả lời của tài xế liên kết), 0067 điều 2 (thiếu tài
xế sát giờ không tự huỷ), 0074 điều 1–3 (rút chuyến), 0075 (tiền công của lượt gán liên kết)

## Bối cảnh

Buổi họp demo 19/11/2026 (mục #16): nhiều xe đã có tài xế cố định. Người đó không có tài khoản XePrime
hoặc không dùng mạng xã hội. Bắt họ cài app, xác minh SĐT, nhận lời mời rồi nhận cuốc là chặn đúng chỗ
cần nhanh nhất. ADR 0067 từng cho ghi tên + SĐT trên từng đơn, nhưng không chống trùng lịch và phải gõ
lại mỗi chuyến; ADR 0074 điều 4 gỡ hẳn đường đó.

Chủ sản phẩm chốt ngày 25/11/2026: chủ xe lưu một danh bạ tài xế nội bộ (họ tên, SĐT), gán từ danh bạ vào
booking; một tài xế không bị gán hai chuyến trùng giờ; hệ thống không gửi SMS cho tài xế.

## Quyết định

### 1. Danh bạ `tenant_internal_drivers`

- Một dòng = một tài xế của bên thuê: `name` (2–120 ký tự, cắt khoảng trắng), `phone` (di động VN, lưu dạng
  `0xxxxxxxxx` như mọi cột SĐT — ADR 0082), `note` tuỳ chọn, `archived_at`.
- Một SĐT một dòng ĐANG DÙNG trong một bên thuê (partial unique `(tenant_id, phone) WHERE archived_at IS
  NULL`) ⇒ 409 `INTERNAL_DRIVER_PHONE_TAKEN`.
- Không xoá cứng: dòng đã gán vào đơn bị FK `NO ACTION` giữ lại. "Xoá" trên giao diện là **lưu trữ** —
  không còn hiện ở bộ chọn, không gán mới được (409 `INTERNAL_DRIVER_ARCHIVED`), đơn cũ giữ nguyên. Khôi
  phục được nếu SĐT chưa bị dòng khác dùng.
- Không CCCD, không bằng lái, không ảnh: chủ xe tự chịu trách nhiệm người mình giao xe. Đây là thứ ADR
  0063 điều 2 lo ngại; khác biệt là danh bạ chỉ sống trong một bên thuê, không chia sẻ, không công khai.
- Quyền: xem `drivers.view`, thêm/sửa/lưu trữ `drivers.manage`. Mở cho cả hai tuyến như module tài xế.
- Writer duy nhất của bảng: `InternalDriversService`.

### 2. Gán vào đơn

- `PATCH /bookings/:id/driver` nhận thêm khoá `internalDriverId` — gửi đúng MỘT trong `driverId` /
  `internalDriverId` / `externalDriver` (khoá cuối vẫn 422 `EXTERNAL_DRIVER_NOT_SUPPORTED`).
- Cột mới `bookings.internal_driver_id` (FK tổ hợp `(internal_driver_id, tenant_id)` → danh bạ: DB chặn gán
  tài xế của bên thuê khác). Lúc gán, tên + SĐT được **chụp** lên hai cột `external_driver_name` /
  `external_driver_phone` có sẵn — CHECK `bookings_internal_driver_snapshot_check` bắt có `internal_driver_id`
  thì phải có ảnh chụp. Nhờ vậy mọi chỗ đang đọc tài xế ngoài hệ thống (trang chuyến của khách, nhắc thiếu
  tài xế, quyết toán) thấy người này mà không cần sửa. Sửa tên/SĐT trong danh bạ về sau KHÔNG viết lại đơn
  đã gán.
- Coi là **đã nhận ngay** như ADR 0067: không lượt chờ, không hạn trả lời, không dòng
  `booking_driver_assignments`, không tiền công (ADR 0075 chỉ áp lượt gán liên kết).
- Loại trừ với tài xế liên kết (CHECK sẵn có `driver_id` ⊥ tên ngoài hệ thống). Gán tài xế nội bộ thì lượt
  liên kết đang mở bị khép `unassigned` và người đó được báo; gán tài xế liên kết hoặc bỏ gán thì cả ba cột
  về NULL. Chỉ đơn `with_driver`, chỉ khi còn đổi được tài xế (`DRIVER_REASSIGNABLE_BOOKING_STATUSES`).
- Audit `booking.driver_internal_set` (tên, SĐT che) — gỡ dùng lại `booking.driver_external_cleared`.
- Người gán phải có `bookings.update`; bộ chọn đọc danh bạ bằng `drivers.view`.

### 3. Chặn trùng lịch ở DB

- `EXCLUDE USING gist (internal_driver_id WITH =, tstzrange(pickup_at, return_at) WITH &&) WHERE
  (internal_driver_id IS NOT NULL AND status IN ('reserved','active') AND deleted_at IS NULL)` —
  `bookings_internal_driver_schedule_excl`. Cùng khuôn với `bookings_driver_user_schedule_excl` (ADR 0063).
- Service kiểm trước để báo tên người bận (409 `DRIVER_BUSY`); hai request đua thì constraint từ chối kẻ
  đến sau (23P01 → `DRIVER_BUSY`). Bộ chọn hiện người bận nhưng không chọn được, không nói bận ở đơn nào.
- Phạm vi trùng là MỘT bên thuê (danh bạ không chia sẻ). Một người vừa là tài xế liên kết vừa nằm trong
  danh bạ là hai danh tính khác nhau với hệ thống; bên thuê tự tránh.

### 4. Không gửi tin cho tài xế nội bộ

- Không SMS, không push: tài xế không có tài khoản để nhận. Chủ xe tự báo. Khách thấy tên + SĐT tài xế trên
  trang chuyến như với tài xế liên kết đã nhận.
- `BookingDriverSummary.source` thêm giá trị `internal` cho phía bên thuê (có `id` = id trong danh bạ để bộ
  chọn đánh dấu). Phía khách vẫn đọc `external` — với khách chỉ có "người sẽ đến đón".

## Hệ quả

- App Partner phải hiểu `source = internal` (hiện như tài xế đã nhận, có nhãn "Tài xế nội bộ"); bản app cũ
  rơi vào nhánh tài xế liên kết, vẫn hiện đúng tên + SĐT.
- Tài xế nội bộ không có lịch sử tiền công, không bảng kê. Cần thì làm sau, không đổi ADR 0075.

## Quan hệ với ADR cũ

| ADR | Phần bị ghi đè | Phần giữ nguyên |
| --- | --- | --- |
| 0074 | Điều 4 trong phạm vi tài xế CHỌN TỪ DANH BẠ | Ghi tên + SĐT gõ tay trên đơn vẫn 422; điều 1–3 |
| 0067 | "không bảng, không danh bạ"; "không chống trùng lịch" (với tài xế nội bộ) | Điều 2 (không tự huỷ) |
| 0063 | Điều 2 "bỏ hồ sơ không tài khoản" — trong phạm vi danh bạ của một bên thuê | Tài xế liên kết, EXCLUDE theo người |
