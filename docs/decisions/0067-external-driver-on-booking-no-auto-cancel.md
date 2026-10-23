# ADR 0067 — Tài xế ngoài hệ thống ghi trên đơn; chuyến thiếu tài xế sát giờ KHÔNG tự huỷ

Ngày: 22/10/2026 · Trạng thái: **Accepted** · Ghi đè một phần: [0063](0063-linked-driver-accounts.md) (điều 2 câu "Bỏ hồ sơ không tài khoản" trong phạm vi MỘT ĐƠN; điều 13 mở rộng sang hai cột mới), [0066](0066-hold-15-percent-dynamic-sla-and-handover-safeguards.md) (điều 4, gạch "tự huỷ đơn khi sát giờ … chưa làm") · Giữ nguyên: 0045 (trách nhiệm huỷ), 0056 (liên hệ khách phía chủ xe), 0064 điều 13 (chi trả tài xế hoãn)

## Bối cảnh

ADR 0063 chỉ cho gán tài xế là một TÀI KHOẢN KHÁCH đã liên kết, và ADR 0066 thêm hạn trả lời cho lượt
gán. Đặc tả BA (02 §2.4) đề xuất tự huỷ đơn khi còn dưới 2 giờ mà chưa có tài xế. Thực tế vận hành:

1. Gian hàng và chủ xe thường dùng tài xế thuê ngoài theo chuyến — người đó không có, và không cần,
   tài khoản XePrime. Bắt họ cài app, xác minh SĐT, nhận lời mời rồi nhận cuốc chỉ để chạy một chuyến là
   chặn đúng chỗ cần nhanh nhất.
2. Hai bên vẫn giao xe được dù hệ thống không biết tài xế là ai. Tự huỷ một chuyến mà chủ xe sắp chạy
   bằng tài xế thuê ngoài là phá một giao dịch đang diễn ra, rồi đẩy trách nhiệm và hoàn tiền cho một
   lỗi mà không ai mắc.

Chủ sản phẩm chốt ngày 22/10/2026: không tự huỷ; cho nhập tài xế ngoài hệ thống trên đơn.

## Quyết định

### 1. Hai cách phủ một chuyến có tài xế

| | Tài xế liên kết (ADR 0063) | Tài xế ngoài hệ thống (mới) |
| --- | --- | --- |
| Là gì | Tài khoản khách đã liên kết với bên thuê | **Tên + SĐT** bên thuê nhập trên ĐÚNG đơn đó |
| Lượt gán | `pending` → tài xế tự nhận; hạn trả lời ADR 0066 điều 4 | Không có lượt chờ — coi là **đã nhận** ngay khi lưu |
| Chống trùng lịch | EXCLUDE theo người (`bookings_driver_user_schedule_excl`) | Không — hệ thống không biết người đó; bên thuê tự chịu |
| Tài xế thấy chuyến trong app | Có (`/driver/*`) | Không |
| Khách thấy | Tên + SĐT tài xế | Tên + SĐT tài xế — cùng một chỗ, cùng một hình |

- Tài xế ngoài hệ thống là **ghi chú có cấu trúc trên đơn** (`bookings.external_driver_name`,
  `bookings.external_driver_phone`), không phải hồ sơ dùng lại: không bảng, không danh bạ, không
  CCCD/GPLX. Đó là thứ ADR 0063 điều 2 đã gỡ và vẫn gỡ.
- Hai cách **loại trừ nhau** trên một đơn (CHECK ở DB). Lưu tài xế ngoài thì lượt gán tài xế liên kết
  đang có (chờ hay đã nhận) bị đóng như "bỏ gán" và người đó được báo; gán tài xế liên kết thì hai cột
  ngoài hệ thống về NULL.
- Chỉ đơn `with_driver` (CHECK như `bookings_driver_service_check`), chỉ khi đơn chưa kết thúc. Tên
  bắt buộc (2–120 ký tự); **SĐT bắt buộc** và phải là số di động Việt Nam hợp lệ — khách cần gọi được
  người sẽ đến đón.
- `DriversService` vẫn là writer duy nhất của mọi cột tài xế trên `bookings`. Mỗi lần đặt/xoá ghi audit
  (`booking.driver_external_set` / `booking.driver_external_cleared`) với tên và SĐT đã che.
- Quyền: như gán tài xế liên kết (`PATCH /bookings/:id/driver`, cùng permission), cả hai tuyến.
- Dữ liệu này là PII của bên thứ ba: chỉ bên thuê và khách của chính đơn đó thấy; không vào báo giá,
  tìm kiếm, hay bất kỳ DTO công khai nào.
- **Khách thấy tài xế khi tài xế đã CHỐT**: tài xế liên kết đã nhận cuốc, hoặc tài xế ngoài hệ thống. Lượt
  gán liên kết còn chờ ⇒ khách thấy "Đang sắp xếp tài xế" (không lộ người có thể còn từ chối, không lộ hạn
  trả lời nội bộ). SĐT lưu chuẩn hoá `84xxxxxxxxx` như `drivers.phone`; `driver_assigned_at` dùng chung
  làm mốc ghi tài xế ngoài (CHECK nhất quán viết lại: có mốc ⇔ có tài xế liên kết HOẶC tài xế ngoài).

### 2. Thiếu tài xế sát giờ: nhắc khẩn, KHÔNG tự huỷ

- Khi còn `DRIVER_MISSING_ALERT_LEAD_MINUTES` (120′) tới giờ nhận mà đơn `with_driver` đang `reserved`
  KHÔNG có ai — không lượt gán tài xế liên kết nào (kể cả đang chờ) và không tài xế ngoài hệ thống —
  worker báo KHẨN cho bên thuê **một lần** (cột claim `bookings.driver_missing_alerted_at`): "Chuyến
  {mã} còn dưới 2 giờ chưa có tài xế — gán tài xế liên kết hoặc nhập tài xế ngoài hệ thống". Đơn tạo
  khi đã ở trong 2 giờ mà chưa có ai thì được báo ở lượt quét kế tiếp.
- Lượt gán đang chờ thì KHÔNG báo trùng: nếu nó quá hạn, thông báo hết hạn của ADR 0066 điều 4 đã đòi
  gán người khác. Lượt gán hết hạn hoặc bị từ chối khi đã ở trong 2 giờ cuối cũng đánh dấu cột claim (thông
  báo đó đã đòi gán lại); từ chối sớm hơn 2 giờ thì mốc 2 giờ vẫn báo như thường.
- **Không đơn nào bị huỷ, không đồng tiền nào đổi chiều** vì thiếu tài xế. Khách thấy "Đang sắp xếp tài
  xế" ở trang chuyến; không có thông báo đẩy cho khách ở mốc này.
- Sau giờ nhận, lưới của ADR 0066 điều 5 áp như mọi đơn: không ai bàn giao ⇒ hồ sơ
  `handover_unconfirmed` sau 120′; khách không được đón ⇒ "Chưa nhận được xe". Bên thuê biết mình không
  phục vụ được ⇒ huỷ chuyến (hoàn 100%, ghi trách nhiệm phía chủ xe — ADR 0045). Không thêm quy tắc
  tiền nào.

## Quan hệ với ADR cũ

| ADR | Phần bị ghi đè | Phần giữ nguyên |
| --- | --- | --- |
| 0063 | Điều 2: câu "Bỏ hồ sơ không tài khoản" — trong phạm vi MỘT ĐƠN được ghi tên + SĐT tài xế ngoài; điều 13: writer duy nhất nay ghi thêm hai cột ngoài hệ thống | Tài xế liên kết là tài khoản khách; không có hồ sơ tài xế dùng lại; chống trùng theo người; tài xế không bàn giao/huỷ; mọi điều còn lại |
| 0066 | Điều 4, gạch "Tự huỷ đơn khi sát giờ (< 2h) … chưa làm" — thay bằng nhắc khẩn, không huỷ | Hạn trả lời tài xế liên kết, nhả lượt quá hạn, báo khẩn gán lại trong 30′ |

## Hệ quả

- Migration: `bookings.external_driver_name`, `external_driver_phone`, `driver_missing_alerted_at` +
  CHECK loại trừ / chỉ `with_driver` / tên-SĐT đi cùng nhau.
- Contract: `PATCH /bookings/:id/driver` nhận thêm dạng tài xế ngoài; `BookingDriverSummaryDto` có
  `source` (`linked` | `external`) và `id` nullable — sửa CẢ HAI bản gọi API (web + mobile, ADR 0031);
  phần mobile do đội mobile làm. App cũ đọc `id` không null cần được kiểm.
- Thống kê "chuyến tôi lái", chống trùng lịch và thù lao tài xế (ADR 0064 điều 13, hoãn) chỉ biết tài
  xế liên kết.

## Cần xem lại khi nào

- Một bên thuê nhập cùng một tài xế ngoài cho nhiều chuyến mỗi tuần — dấu hiệu nên mời người đó liên
  kết, hoặc cần gợi ý từ các đơn trước (vẫn không thành hồ sơ).
- Tranh chấp "tài xế ngoài không đến" đáng kể — cân nhắc bắt buộc tài xế liên kết cho một nhóm chuyến.
