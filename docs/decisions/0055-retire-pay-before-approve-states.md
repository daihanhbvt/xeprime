# ADR 0055 — Gỡ hẳn các trạng thái của luồng thu-trước-duyệt; tiền về không viết lại lượt nhận

Ngày: 07/10/2026 · Trạng thái: Accepted · Hoàn tất: ADR 0044 (gỡ phần "dữ liệu LEGACY ADR 0039" mà
0044 tạm giữ) · Mở rộng: ADR 0005 (CHECK cho `booking_requests.status`), ADR 0045 điều 3 (ba cột
quyết định không bị ghi đè) · Cùng khuôn: ADR 0047 (`confirmed` của `bookings`)

## Bối cảnh

ADR 0044 thay toàn bộ luồng "thu tiền trước, duyệt sau" của ADR 0039 nhưng **giữ lại** mọi nhánh xử lý
của nó "cho tới khi không còn yêu cầu nào của thời kỳ đó chờ quyết định". Hai tuần sau, các nhánh đó
vẫn nằm trong code và lộ ra ngoài:

- Bộ lọc chặng của "Chuyến của tôi" / "Chuyến cho thuê" vẫn liệt kê **"Đã thanh toán · chờ chủ xe
  xác nhận"** (`pending_approval_paid`) — một chặng không còn đường nào dẫn tới.
- Hộp thư gian hàng vẫn gộp `hold_paid` vào tab "Cần xử lý"; API vẫn có đường duyệt/từ chối/huỷ
  riêng cho nó; worker vẫn quét nó mỗi phút.
- `approved_by_host` chưa từng có writer (ADR 0047 điều 7 đã xác minh) nhưng vẫn là một giá trị hợp
  lệ mọi nơi.

Tệ hơn, luồng HIỆN HÀNH vẫn đi vòng qua `hold_paid`: tiền về ⇒ `awaiting_hold → hold_paid →
converted_to_booking` trong cùng transaction, và bước vòng đó dùng chung thân hàm với "hệ thống tự
nhận" của ADR 0039 — nên nó **ghi đè `decided_by = NULL`, `decided_at = lúc tiền về`,
`decision_source = system`** lên một chuyến chủ xe đã tự tay nhận. Tên người duyệt mất, thời gian
phản hồi đo tới lúc khách chuyển khoản, chuyến bị kể lại thành "Đặt ngay", và gian hàng nhận thông báo
"Đã tự động nhận chuyến" cho chuyến chính họ duyệt — đúng loại hỏng mà ADR 0045 điều 3 cấm.

Hệ thống chưa nhận tiền khách thật (roadmap R1), DB dev/test không còn hàng nào ở hai trạng thái đó.

## Quyết định

### 1. Hai trạng thái yêu cầu bị gỡ, DB từ chối chúng

`hold_paid` và `approved_by_host` không còn writer, không còn nhánh đọc nghiệp vụ ở API/worker, và DB
từ chối chúng bằng CHECK `booking_requests_status_valid` — ràng buộc đầu tiên trên cột này (trước đó
giá trị hợp lệ chỉ sống ở `@xeprime/types`). Chín giá trị còn lại là `BOOKING_REQUEST_STATUS_LIVE_VALUES`.

Chặng khách `pending_approval_paid` (phép chiếu của `hold_paid`) không bao giờ được trả ra nữa và nằm
ngoài `CUSTOMER_TRIP_STAGE_LIVE_VALUES` — nguồn của tab, ô lọc chặng và enum OpenAPI.

### 2. `awaiting_hold` luôn có lượt nhận — ở DB

CHECK `booking_requests_awaiting_hold_decided`: `status <> 'awaiting_hold' OR decided_at IS NOT NULL`.

Lượt nhận (`commitDecision`) ghi `status` và `decided_*` trong CÙNG một câu UPDATE, nên ràng buộc
không chặn đường thật nào. Nó là thứ làm việc gỡ nhánh legacy AN TOÀN: tiền về không thể mở đơn cho
một chuyến chưa ai đồng ý, vì chuyến như vậy không thể ở `awaiting_hold`.

### 3. Tiền về đi thẳng sang đơn, và không phải một quyết định

`awaiting_hold → converted_to_booking` trong transaction đối soát, không chặng giữa. Lượt đó **không
đụng `decided_*`** — ba cột mang lượt NHẬN; tiền về là việc của khách. Thông báo cho gian hàng chọn câu
theo `decision_source` THẬT của lượt nhận: chuyến "Đặt ngay" (hệ thống nhận lúc gửi, gian hàng chưa
từng được gọi) báo "Đã tự động nhận chuyến"; chuyến chủ xe tự nhận báo "Khách đã thanh toán giữ chỗ".
Audit của lượt này là `booking_hold.paid` (actor hệ thống) kèm mã đơn.

### 4. Hằng số còn trong `@xeprime/types` chỉ để mobile biên dịch

Như `BOOKING_STATUS.CONFIRMED` (ADR 0047): `BOOKING_REQUEST_STATUS.HOLD_PAID` / `APPROVED_BY_HOST` và
`CUSTOMER_TRIP_STAGE.PENDING_APPROVAL_PAID` còn trong enum, đánh dấu `@deprecated`, vì `apps/mobile`
(phụ thuộc workspace) còn tham chiếu. Code mới không dùng chúng; xoá hẳn là việc của đội mobile.

Bộ lọc trạng thái của hộp thư (`GET /booking-requests?status=`) vẫn NHẬN hai giá trị đã gỡ (khớp 0
dòng): bản app native đang chạy còn gửi `pending_host_approval,hold_paid` cho tab "Cần xử lý", và từ
chối cả câu lọc là làm vỡ đúng tab quan trọng nhất của họ. Swagger chỉ quảng bá danh sách còn sống.

### 5. Lịch sử giữ nguyên

`booking_cancellations.stage = 'hold_paid'` vẫn hợp lệ ở DB: bảng đó là sổ lịch sử trách nhiệm, lượt
huỷ đã xảy ra ở chặng ấy phải đọc được như nó đã xảy ra. Chỉ là không còn writer
(`CANCELLATION_STAGE.HOLD_PAID` @deprecated). Tương tự, `rejected_by_host` thiếu `decided_at` do worker
cũ ghi vẫn là dữ liệu hợp lệ, và `HostMetricsService` vẫn đọc `decided_at` chứ không đọc nhãn.

## Hệ quả

- Gỡ: `acceptPaidRequest` / `rejectPaidRequest` / nhánh `hold_paid` của `cancelByHost` (API);
  `tryAutoApproveWithinTx`, `releasePaidHoldWithinTx`, `cancelPaidHoldForCustomerWithinTx` (holds);
  nhánh `hold_paid` của khách tự huỷ; job worker `expirePaidAwaitingAccept` cùng chỉ số `expiredPaid`.
- Khách tự huỷ chiếm ĐÚNG trạng thái đã đọc (không còn "một trong ba"): gian hàng duyệt xen vào giữa
  thì lượt huỷ trả lỗi để khách tải lại, thay vì huỷ yêu cầu mà để hold và lịch giữ chỗ treo.
- Tab "Cần xử lý" chỉ còn `pending_host_approval`; khoá tab `needs_action` giữ nguyên trên URL.
- Ô lọc chặng của danh sách chuyến chỉ liệt kê chặng của TAB đang mở.
- Migration `20261007120000_retire_legacy_request_statuses` DỪNG (RAISE kèm id) nếu còn hàng ở hai
  trạng thái đã gỡ hoặc `awaiting_hold` thiếu `decided_at` — `hold_paid` là tiền thật, không có phép
  SQL nào chốt đúng nó.
- **Rollback qua mốc này cần một bước tay.** Image cũ ghi `hold_paid` như bước tạm mỗi lần tiền về
  đủ, nên CHECK `booking_requests_status_valid` làm lượt đối soát của nó hỏng (bị nuốt thành
  `match_failed`). Rollback chỉ đổi image, không lùi migration ⇒ gỡ ràng buộc đó trước khi rollback
  (`docs/deployment.md` §9.1). Khe giữa migrate và restart lúc deploy có cùng rủi ro — chấp nhận vì
  chưa nhận tiền khách thật (roadmap R1).
- Hai đường huỷ (khách tự huỷ, gian hàng rút lại chuyến) khoá hàng HOLD trước rồi mới chiếm yêu cầu
  — cùng thứ tự với lượt tiền về — nên huỷ đúng lúc tiền về kết thúc bằng một bên thắng, không
  deadlock. Khách thua cuộc đua nhận `CONFLICT` ("vừa thay đổi — tải lại"), không phải "không còn
  huỷ được".

## Cần xem lại khi

- Đội mobile hết tham chiếu ba hằng số @deprecated ⇒ xoá khỏi enum, gỡ nhánh vét cạn trong
  `customerTripStage`, và bỏ phần chấp nhận giá trị đã gỡ ở bộ lọc hộp thư.
