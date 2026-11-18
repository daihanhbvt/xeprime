# ADR 0105 - Trả xe sớm: cảnh báo chủ xe, tiền thuê giữ nguyên, khách báo được "Tôi chưa trả xe"

Ngày: 18/11/2026 · Trạng thái: **Accepted** (18/11/2026 - người dùng chốt phương án A + B + C1) ·
Bổ sung: [0045](0045-host-cancellation-and-reputation.md) điều 1, [0081](0081-trip-reminders-and-customer-handover-word.md),
[0094](0094-trip-verdict-and-return-unconfirmed.md), [0104](0104-pickup-handover-window-and-platform-revert.md) ·
Chốt một phần mục "kết thúc sớm" còn mở ở [0032](0032-booking-deposit-insurance-and-owner-lite.md)

## Bối cảnh

Đơn `active` thì chủ xe xác nhận "Đã nhận lại xe" lúc nào cũng được, kể cả trước giờ trả nhiều ngày.
Lượt đó chuyển đơn sang `completed` trong một transaction: nhả lịch xe (những ngày còn lại hiện trống
trên chợ), quyết toán khoản giữ chỗ (`D` vào Ví điểm chủ xe), thuế giữ nguyên trên toàn bộ tiền thuê.
Có hai tình huống:

- **Khách trả sớm thật**: vận hành đúng, chỉ thiếu luật tiền cho các ngày không dùng (ADR 0032 để mở).
- **Chủ xe bấm nhầm hoặc cố ý khi khách còn giữ xe**: xe bị nhả lịch giữa chuyến, có thể bị đặt chồng,
  mà khách chỉ nhận một thông báo "Chuyến đã hoàn thành, mời đánh giá" và không có đường phản bác. Nút
  "Đã trả xe" và case `return_unconfirmed` (ADR 0081, 0094) chỉ lo chiều ngược lại.

## Quyết định

1. **Luật tiền khi trả sớm (C1): không tự hoàn.** Tiền thuê giữ nguyên theo đơn đã đặt; các ngày khách
   không dùng không được hoàn tự động; thuế, bảo hiểm, quyết toán giữ chỗ không đổi. Hai bên tự thoả
   thuận nếu muốn bớt. Luật này được NÓI RA ở cả hai phía (điều 2, 3) - không còn là hệ quả ngầm.
2. **"Trả sớm" = chủ xe xác nhận trước `returnAt` ít nhất `EARLY_RETURN_MIN_MINUTES` (60′)**, đo bằng giờ
   BẤM (server ghi `confirmedAt`), không bằng giờ trả thực tế chủ xe khai (chủ xe được lùi ô đó). Một
   hàm `isEarlyReturn` ở `@xeprime/types` cho cả hộp xác nhận, thông báo và cổng báo. Hộp "Xác nhận đã
   nhận lại xe" hiện viên "Sớm …" và cảnh báo: xe trống lịch ngay, tiền thuê giữ nguyên theo đơn, khách
   sẽ được báo và có thể báo "Tôi chưa trả xe". Cảnh báo, không chặn - khách trả sớm là chuyện thật.
3. **Khách được báo riêng.** Lượt hoàn thành do gian hàng xác nhận sớm thay câu "mời đánh giá" bằng câu
   nói giờ trả theo đơn, luật tiền và đường báo "Tôi chưa trả xe".
4. **"Tôi chưa trả xe"** (`POST /trips/:id/report-not-returned`, realm khách): mở được khi đơn `completed`
   bằng biên bản trả xe nguồn `host` xác nhận sớm (điều 2), tới `returnAt + HANDOVER_CONFIRMATION_GRACE_MINUTES`
   (`notReturnedReportUntil`, đối xứng cửa sổ "Chưa nhận được xe"). Lượt trả do khách tự báo, tự lập hay
   nền tảng kết luận không mở nút. Kiểm sau khi khoá dòng đơn; mở MỘT case `dispute` mức khẩn, dấu
   `reason = trip_not_returned` trên audit mở case (`findOpenTripNotReturnedReport`), báo gian hàng;
   idempotent. Ngoài cửa sổ / sai điều kiện ⇒ 409 `TRIP_NOT_RETURNED_NOT_ALLOWED`. DTO chuyến thêm
   `notReturnedReportUntil` (mốc đóng, chỉ có khi bấm được) và `notReturnedReportOpen`; trang chuyến đã
   khép hiện khối báo hoặc khối "đang xử lý".

## Không làm

- **Giữ lại tiền khi khách báo.** Quyết toán chạy ngay lúc đơn hoàn thành; lời báo đến SAU nên không có
  khoản nào còn treo để giữ. Hoãn quyết toán mọi lượt trả sớm sẽ đẩy mọi chuyến trả sớm hợp lệ vào hàng
  chốt tay của admin. CSKH xử lý bằng đường tiền hiện có (bút toán đảo / bồi hoàn), có audit.
- **Kết luận chuyến cho case này / lùi đơn `completed` về `active`.** Phải mở lại lịch (có thể đã có đơn
  khác chiếm), đảo quyết toán ví, mở lại bảo hiểm - nặng và hiếm. Người trực đóng case như tranh chấp
  thường sau khi thoả thuận với hai bên.
- **Hoàn theo ngày chưa dùng (C3)** và **khoản "giảm trừ trả sớm" do chủ xe ghi (C2)** - chưa làm; C2 xem
  lại khi chủ xe thường xuyên phải bớt tiền cho khách.
- **App mobile** chưa theo (Partner chưa cảnh báo trả sớm, app khách chưa có nút) - đợt mobile sau.

## Hệ quả

- `@xeprime/types`: `EARLY_RETURN_MIN_MINUTES`, `isEarlyReturn`, `notReturnedReportUntil`,
  `SUPPORT_CASE_OPEN_REASON.TRIP_NOT_RETURNED`, `SupportCaseOpenReason`, mã lỗi `TRIP_NOT_RETURNED_NOT_ALLOWED`.
- `@xeprime/prisma`: phép đọc lời báo theo dấu `reason` dùng chung cho hai nút (`openCustomerMarkedReports`).
- Không migration.

## Cần xem lại khi nào

- Số case `trip_not_returned` đáng kể ⇒ cân nhắc hoãn quyết toán riêng cho lượt trả sớm, hoặc kết luận chuyến.
- Chủ xe hay phải bớt tiền cho khách trả sớm ⇒ làm C2.
