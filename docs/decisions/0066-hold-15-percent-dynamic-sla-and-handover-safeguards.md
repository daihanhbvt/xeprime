# ADR 0066 — Tiền giữ chỗ 15% tiền thuê, đền huỷ muộn trọn phần chủ xe, SLA động cho duyệt/thanh toán/huỷ/tài xế, và lưới chống treo đơn ở mốc nhận xe

Ngày: 22/10/2026 · Trạng thái: **Accepted** — gạch "tự huỷ đơn thiếu tài xế … chưa làm" ở điều 4 bị [0067](0067-external-driver-on-booking-no-auto-cancel.md) thay; `roundToThousand(15% × B)` ở điều 1 thành đúng tới đồng theo [0069](0069-money-rounding-exact-vnd.md) · Ghi đè một phần: [0064](0064-financial-flow-v2.md) (điều 5 công thức `grossOnline`; điều 7 độ dài hai cửa sổ; điều 8 phép chia 50/50), [0063](0063-linked-driver-accounts.md) (câu "Lượt chờ KHÔNG hết hạn"), [0044](0044-approve-before-hold.md) (hạn phản hồi 60′ cố định của yêu cầu) · Liên quan: 0024, 0033, 0045, 0046 · Đặc tả nguồn: `docs/specifications/01`–`04`

## Bối cảnh

Đặc tả BA v3 (22/10/2026, `docs/specifications/`) rà lại luồng tiền v2 và chỉ ra bốn chỗ ADR 0064 chưa
khép:

1. **Tiền giữ chỗ 30% của tổng khách trả** là một con số không ai giải thích được bằng nghĩa vụ: phần nào
   của 30% là của chủ xe, phần nào là của nền tảng, phụ thuộc vào bảo hiểm khách chọn. Khi khách huỷ
   muộn, phép chia 50/50 trên `D + S + H` lại đem một nửa phí sàn và hoa hồng — tiền KHÔNG phải của chủ
   xe — đi đền cho chủ xe, còn nửa kia của phần cam kết thì về nền tảng.
2. **Cửa sổ huỷ miễn phí 4h** dài hơn cửa sổ thanh toán 2h ở mọi chuyến xa, còn chuyến `ΔT < 2h` không có
   huỷ miễn phí nào — khách vừa quét QR đã mất tiền nếu đổi ý.
3. **Hạn phản hồi 60′ cố định** quá ngắn cho chuyến đặt trước nhiều ngày (chủ xe phải canh app cả ngày)
   và quá dài cho chuyến đặt gấp 30′ trước giờ nhận.
4. **Không có lưới nào ở mốc nhận xe**: khách không có cách báo "chưa nhận được xe", và một đơn mà cả
   hai bên quên bấm bàn giao nằm `reserved` vô thời hạn.

Chủ sản phẩm chốt các quyết định dưới đây ngày 22/10/2026.

## Quyết định

### 1. Tiền giữ chỗ = phần không-phải-của-chủ-xe + 15% tiền thuê

Ký hiệu như ADR 0064 điều 1 (`B` là tiền thuê sau khuyến mãi trực tiếp, **không gồm** phí giao xe `G`
— "R = B − G" của đặc tả chính là `B` này):

```text
  D_target     = max( roundToThousand(depositPercent% × B), depositMinAmount )   ← 15% × B ở v8, sàn 0
  grossOnline  = min( B + S + IV + IP,
                      max( S + H + IV + IP + D_target,
                           S + H + IV + IP + T,                ← D ≥ T: ví chủ xe không bao giờ âm
                           holdMinAmount ) )
  D            = grossOnline − S − H − IV − IP
  holdAmount   = grossOnline − P                                ← mã khuyến mãi vẫn trừ SAU (0064 điều 6)
```

- `depositPercent` đổi NGHĨA: từ "% của `B + S + IV + IP`" thành **"% của tiền thuê `B`"**. Đó là phần
  cam kết giữ xe thuộc về chủ xe. Cổng cấu hình `deposit_percent ≥ tax_percent` giữ nguyên — nó vẫn là
  điều bảo đảm `D ≥ T`.
- **Chính sách phí v8** (migration, sao từ bản đang hiệu lực, không `UPDATE` bản `active` — ADR 0024):
  `deposit_percent = 15`, `deposit_min_amount = 0` (đúng 15%, không sàn — chủ sản phẩm chốt), `free_cancel_hours = 2`
  (trần mới của cửa sổ huỷ miễn phí, điều 3). Mọi giá trị khác giữ nguyên v7.
- Tuyến gói tắt công tắc thu cọc (ADR 0033 điều 7): giữ nguyên `max(S + IV + IP + T, holdMinAmount)`.
- Hold/đơn đã tạo giữ snapshot cũ (ADR 0024); không tính lại.

### 2. Huỷ muộn / no-show: chủ xe nhận TRỌN `D`, XePrime giữ `S + H`, bảo hiểm hoàn 100%

| Sự kiện | Khách | XePrime | Ví chủ xe | Thuế `T` |
| --- | --- | --- | --- | --- |
| Khách huỷ trong `T_cancel` | hoàn đúng số đã chuyển | 0 | 0 | không |
| Khách huỷ sau `T_cancel` · no-show | `IV + IP` | `S + H − P` | **`D`** (≈ 15% × `B`) | không |
| Chủ xe / gian hàng huỷ | hoàn đúng số đã chuyển | 0 | 0 + ghi trách nhiệm (ADR 0045) | không |
| Chuyến hoàn thành | — | `S + H − P` | `D − T` | `T` |

- Thay phép chia 50/50 `D + S + H` của ADR 0064 điều 8. Giá trị lưu `split_late_cancel` giữ nguyên (dữ
  liệu đi trên dây), chỉ NHÃN đổi thành "Huỷ muộn — đền giữ chỗ".
- Nền tảng gánh `P` ở cả ba kết cục (ADR 0046 điều 4 giữ nguyên); hoàn chỉ hoàn số khách đã chuyển.
- Khoản đền ghi vào ví chủ xe với loại `HOLD_FORFEIT` như hiện nay; nó là bồi thường vi phạm, không
  phải doanh thu cho thuê, nên không sinh `T`.

### 3. SLA động — bốn đồng hồ, cùng một hình dạng `clamp(round(ΔT × tỉ lệ), sàn, trần)`

| Đồng hồ | `ΔT` | Công thức | Hết hạn thì |
| --- | --- | --- | --- |
| Chủ xe phản hồi yêu cầu | `pickupAt − createdAt` | 240′ nếu `ΔT ≥ 24h`; ngược lại `clamp(20% ΔT, 15′, 240′)`; dài hạn chưa có giờ nhận ⇒ 240′ | `expired` như hiện nay (tính vào tỉ lệ phản hồi — ADR 0045) |
| Khách trả tiền giữ chỗ `T_pay` | `pickupAt − acceptedAt` | `clamp(30% ΔT, 15′, holdPaymentWindowMinutes = 120′)` | `hold_expired`, nhả lịch |
| Huỷ miễn phí `T_cancel` | `pickupAt − acceptedAt` | `clamp(20% ΔT, 15′, freeCancelHours = 2h)` | qua mốc ⇒ điều 2 |
| Tài xế nhận/từ chối cuốc | `pickupAt − driverAssignedAt` | `clamp(10% ΔT, 15′, 60′)` | điều 4 |

- Hạn phản hồi lưu ở `booking_requests.respond_by` lúc gửi như cũ; worker nhắc theo phần CÒN LẠI (60′ và
  15′), bỏ qua mốc dài hơn chính cửa sổ của yêu cầu.
- Cả hai mốc của hold vẫn tính XUÔI từ `acceptedAt`, kẹp bởi `pickupAt`, không gia hạn, nhắc 60′/15′
  (ADR 0044 điều 3 · ADR 0064 điều 7 giữ nguyên mọi thứ trừ ĐỘ DÀI). Quy tắc "`ΔT < 2h` thì không có huỷ
  miễn phí" của ADR 0064 bị bỏ: luôn có tối thiểu 15′ (vẫn kẹp bởi `pickupAt`).
- Khi `ΔT < 10h`, `T_pay` (30%) dài hơn `T_cancel` (20%) — màn thanh toán phải hiện đồng hồ đếm ngược
  của mốc huỷ miễn phí TRƯỚC khi khách quét QR.

### 4. Tài xế không phản hồi: nhả lượt gán, báo khẩn gian hàng — không huỷ đơn của khách

- `bookings.driver_respond_by` đặt cùng lúc với `driver_assigned_at`. Tài xế nhận sau hạn bị từ chối.
- Worker quét lượt chờ quá hạn: xoá tài xế khỏi đơn đúng như đường "tài xế từ chối", đóng dòng lịch sử
  với kết cục mới `expired`, báo KHẨN cho gian hàng "gán tài xế khác trong 30 phút" và báo tài xế. Đơn của
  khách giữ nguyên.
- Từ chối cũng báo gian hàng gán lại trong 30 phút. Đơn thiếu tài xế sát giờ **không tự huỷ** (thay đặc
  tả 02 §2.4): bên thuê được nhắc khẩn ở mốc còn 2 giờ và có thể nhập tài xế ngoài hệ thống —
  [ADR 0067](0067-external-driver-on-booking-no-auto-cancel.md).

### 5. Mốc nhận xe: không thêm trạng thái đơn; tranh chấp và "chờ xác nhận" là HỒ SƠ HỖ TRỢ

`BOOKING_STATUS` giữ nguyên (ADR 0047). Các trạng thái `DISPUTED` / `IN_PROGRESS` /
`HANDOVER_PENDING_CONFIRMATION` của đặc tả ánh xạ như sau:

- **Chủ xe xác nhận giao xe ⇒ `active` ngay** (như hiện nay: thuế và bảo hiểm khởi động ở mốc này). Lớp 2
  "chủ xe đã giao, khách im lặng 120′ thì tự kích hoạt" vì thế đã thoả; không có worker tự lật trạng thái.
- **Lớp 1 — "Chưa nhận được xe":** trong `[pickupAt, pickupAt + 120′]`, khi đơn `reserved` hoặc `active`,
  khách mở được một hồ sơ hỗ trợ loại `dispute`, ưu tiên `urgent` (idempotent: đã có hồ sơ tranh chấp mở
  thì trả lại hồ sơ đó). Hồ sơ tranh chấp đang mở vốn đã HOÃN quyết toán hold (`hasOpenDispute`) — đó là
  "đóng băng giải ngân", không thêm cơ chế thứ hai.
- **Lớp 3 — cả hai im lặng:** quá `pickupAt + 120′` mà đơn vẫn `reserved`, chưa có biên bản nhận xe ⇒
  worker đánh dấu `bookings.handover_overdue_at` và mở hồ sơ hỗ trợ loại mới `handover_unconfirmed`
  (ưu tiên `urgent`, không có người mở — `support_cases.opened_by_user_id` thành nullable) cho CSKH gọi
  xác minh. Loại này cũng nằm trong tập loại hồ sơ HOÃN quyết toán: no-show được ghi sau đó không tự
  chuyển tiền cho ai cho tới khi CSKH đóng hồ sơ.
- Ảnh hiện trạng và số công tơ mét vẫn **tuỳ chọn** ở cả hai chiều bàn giao; form hiện lời khuyến nghị
  chụp để bảo vệ quyền bồi thường. Ảnh của biên bản đã xác nhận hiện ở trang chuyến đi của khách.

## Quan hệ với ADR cũ — chính xác phần bị ghi đè

| ADR | Phần bị ghi đè | Phần giữ nguyên |
| --- | --- | --- |
| 0064 | Điều 5: công thức `grossOnline` (30% × `B + S + IV + IP`) và nghĩa của `depositPercent`. Điều 7: hai công thức độ dài cửa sổ (40%/30%, 4h, "dưới 2h không huỷ miễn phí"). Điều 8: phép chia 50/50 `D + S + H` và câu "phần chủ xe làm tròn xuống" | Mọi điều khác: sáu dòng tiền, `S`, `H`, `T` và cơ sở thuế, sàn `S + H + IV + IP + T`, kẹp trần, tuyến gói tắt cọc, mã khuyến mãi trừ sau với trần `D + S + H`, hai mốc tính xuôi từ `acceptedAt`, không gia hạn, bảo hiểm luôn hoàn khi huỷ, phí giao xe ngoài tiền giữ chỗ |
| 0063 | "Lượt chờ KHÔNG hết hạn" | Tài xế là tài khoản khách được mời liên kết; chống trùng lịch theo người; `DriversService` là writer duy nhất |
| 0044 | Hạn phản hồi 60′ cố định của yêu cầu (hằng `BOOKING_REQUEST_RESPOND_WINDOW_MINUTES`) | Duyệt trước, thu sau; đơn ra đời khi đối soát đủ tiền; `slot_taken`; mọi điều còn lại |

## Hệ quả

- `packages/types`: `computeCustomerFees`, `resolveHoldAllocation`, `holdWindowsFor`,
  `bookingRequestRespondBy(createdAt, pickupAt)` và hàm cửa sổ tài xế là nguồn tính duy nhất cho api,
  worker, web, mobile.
- Hai migration chính sách/schema: chính sách v8; `bookings.driver_respond_by` + kết cục `expired`;
  `bookings.handover_overdue_at` + loại hồ sơ `handover_unconfirmed` + `opened_by_user_id` nullable.
- Contract mới: `POST /trips/:id/report-not-received` (realm khách), các trường `driverRespondBy` và cờ
  tranh chấp mở trong DTO chuyến — sửa CẢ HAI bản gọi API (web + `apps/mobile/shared/src/api`, ADR 0031);
  phần mobile do đội mobile làm.
- Văn bản pháp lý (điều khoản huỷ), mọi chuỗi "60 phút", "chia đôi", "30%" ở giao diện đổi theo.

## Cần xem lại khi nào

- Sau 100 chuyến huỷ muộn: chủ xe có thấy 15% đủ bù một khung giờ bị giữ không, nhất là chuyến 1 ngày.
- Khi tỉ lệ hết hạn phản hồi ở nhóm `ΔT ≥ 24h` tăng vì cửa sổ 4h — dấu hiệu chủ xe để yêu cầu chờ lâu.
- Khi số hồ sơ `handover_unconfirmed` lớn: phần lớn là chủ xe quên bấm (cần nhắc trước 120′) hay chuyến
  thật sự không diễn ra.
- Khi tranh chấp "tài xế không đến" đáng kể — xem ADR 0067 mục Cần xem lại.
