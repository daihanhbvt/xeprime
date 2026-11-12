# ADR 0081 — Nhắc chuyến theo đồng hồ và lời của khách ở mốc giao/trả xe

Ngày: 05/11/2026 · Trạng thái: **Accepted** (05/11/2026 — người dùng chốt sau lượt rà luồng đặt xe:
"chuyến kẹt mãi ở Cần xử lý / Chờ giao xe / Đang thuê") · Liên quan:
[0066](0066-hold-15-percent-dynamic-sla-and-handover-safeguards.md) điều 5 (mốc nhận xe, ba lớp chống
treo đơn), [0044](0044-approve-before-hold.md) điều 7 (tin mốc thời gian, không tin cột `status`),
[0047](0047-booking-status-simplification.md) (năm trạng thái đơn), [0006](0006-booking-concurrency.md)
(lịch bận), [0063](0063-linked-driver-accounts.md) (chuyến có tài xế)

## Bối cảnh

Rà luồng đặt xe → duyệt → thanh toán → giao xe → hoàn thành ngày 05/11/2026 thấy bốn chỗ chuyến có thể
kẹt vô hạn trên màn "Đơn thuê xe":

1. **Yêu cầu / giữ chỗ đã chết theo đồng hồ vẫn hiện.** Worker là writer duy nhất của `expired` /
   `hold_expired` và quét mỗi phút; giữa hạn và nhịp quét (hoặc suốt lúc worker dừng) danh sách đọc cột
   `status` nên thẻ không bấm được gì vẫn đứng TRÊN CÙNG cột "Cần xử lý" (sort theo hạn), và huy hiệu
   menu đếm cả nó.
2. **"Chờ giao xe" không có lối ra ngay trên thẻ.** "Khách không đến" chỉ ở trang chi tiết; đơn quá cả
   giờ TRẢ mà chưa xác nhận giao vẫn nói "Quá giờ giao xe".
3. **"Đang thuê" quá giờ trả không ai được báo**, và lịch bận chỉ chặn tới giờ trả gốc: xe chưa về vẫn
   được duyệt — kể cả tự duyệt "Đặt ngay" — cho khách kế tiếp.
4. **Chỉ chủ xe khép được mốc giao/trả.** Chủ xe quên bấm "Nhận xe" thì chủ xe không nhận tiền (quyết
   toán chỉ chạy khi đơn hoàn thành) và khách bị ghi TRẢ TRỄ trong sổ khách dù đã trả đúng giờ.

ADR 0066 điều 5 đã chọn: chủ xe xác nhận giao xe ⇒ `active`, không worker nào tự lật trạng thái; cả
hai bên im lặng ⇒ case `handover_unconfirmed` cho CSKH. Điều đó vẫn đúng cho mọi lượt TỰ ĐỘNG THEO ĐỒNG
HỒ — ADR này thêm lời của KHÁCH như một nguồn bằng chứng thứ hai.

## Quyết định

1. **Lọc theo mốc lúc đọc.** Danh sách yêu cầu, số đếm từng nhóm và huy hiệu menu bỏ yêu cầu chờ duyệt có
   `respond_by <= now` và yêu cầu chờ tiền có `booking_holds.expires_at <= now` (`liveRequestWhere`).
   Worker vẫn là writer duy nhất của trạng thái.
2. **Nhắc chuyến theo đồng hồ** (worker `booking-trip-reminders`, nhịp phút): trước giờ nhận 60′ (gian
   hàng + khách), trước giờ trả 60′ (gian hàng + khách), quá giờ trả 30′ (gian hàng + khách — khách chỉ
   khi tự lái/dài hạn). Mỗi mốc MỘT lần nhờ cột claim (`pickup_reminded_at`, `return_reminded_at`,
   `return_overdue_notified_at`); đơn tạo sát giờ bỏ mốc đã lỡ; quá giờ trả chỉ nhìn lại 24 giờ. Loại
   thông báo là `booking_status_changed` — thêm loại mới làm vỡ bảng loại thông báo của app mobile.
3. **Xe chưa về.** Xe có chuyến `active` đã quá giờ trả ⇒ "Đặt ngay" KHÔNG tự nhận yêu cầu mới của xe
   đó (`AUTO_ACCEPT_BLOCKER.VEHICLE_STILL_OUT`, yêu cầu về "Cần xử lý"), và hộp duyệt hiện cảnh báo kèm
   chuyến đang trễ (`vehicleStillOut`). Duyệt tay KHÔNG bị chặn — chủ xe có thể biết xe sẽ về kịp. Lịch
   bận KHÔNG tự kéo dài (đổi luật chống trùng lịch là việc của một ADR riêng).
4. **Thẻ "Chờ giao xe"** có "Khách không đến" khi đã qua ân hạn và chưa giao (cùng ba điều kiện server
   kiểm); quá cả giờ trả mà chưa xác nhận giao thì nói đúng câu đó.
5. **"Đã nhận xe" của khách** (trang chuyến, web; chỉ tự lái + dài hạn): từ `pickupAt − 60′`, đơn
   `reserved`, chưa có biên bản giao xe ⇒ lập biên bản giao xe nguồn `customer` và đơn sang `active`
   NGAY, qua đúng chuỗi hệ quả của quầy gian hàng (`HandoversService.confirmOnCustomerWordWithinTx`:
   thuế, bảo hiểm, kết luận case `handover_unconfirmed`). Khách không có lý do khai sai — khai sai chỉ
   làm chuyến của chính họ bắt đầu sớm. Không KM / hiện trạng nào từ lời khách; gian hàng bổ sung KM sau.
6. **"Đã trả xe" của khách**: đơn `active`, chưa có biên bản trả xe ⇒ ghi `customer_returned_at` + hạn
   `return_auto_complete_at = +24h` (server tính MỘT lần, lưu), KHÔNG đổi trạng thái. Gian hàng:
   - xác nhận biên bản nhận xe như thường (kèm phát sinh, KM) — lời báo hết vai trò;
   - hoặc "Khách chưa trả xe" ⇒ xoá lời báo + mở MỘT tranh chấp khẩn cho CSKH (giữ quyết toán);
   - im lặng quá hạn ⇒ API (`CustomerReturnSweeper`) tự lập biên bản trả xe nguồn `auto`, mốc trả
     thực tế = lúc khách báo, đơn `completed`, quyết toán như mọi lượt hoàn thành. Có hồ sơ giữ quyết
     toán đang mở thì KHÔNG tự hoàn thành.
7. **Biên bản ghi rõ ai xác nhận** — `vehicle_handovers.confirm_source` (`host` · `customer` · `auto`).
   CHECK `vh_confirmed_has_actor` giữ nguyên: `confirmed_by` là tài khoản KHÁCH ở hai nguồn sau (người
   duy nhất đã lên tiếng); audit của lượt `auto` mang `actorScope = system`, không gán cho ai.
8. **Chỉ web.** App mobile không đổi ở đợt này: API là cổng, app khách cập nhật sau trên cùng endpoint.

## Hệ quả

- Ghi đè ADR 0066 điều 5 trong ĐÚNG phạm vi: "chủ xe xác nhận giao xe ⇒ `active`" thành "chủ xe HOẶC
  khách xác nhận"; "không có worker tự lật trạng thái" giữ nguyên cho mọi lượt theo đồng hồ — lượt tự
  hoàn thành chỉ chạy SAU lời của khách và 24 giờ gian hàng im lặng.
- Bộ quét tự hoàn thành sống ở API (cùng lý do `PaymentGatewaySweeper`): hoàn thành đơn là quyết toán
  tiền, chuỗi đó chỉ có ở `HandoversService` / `BookingsService` / `HoldSettlementService`. Nhiều tiến
  trình API cùng chạy an toàn nhờ khoá dòng đơn + claim biên bản.
- `BookingsService.transitionWithinTx` nhận `userId: null` cho lượt của hệ thống.
- Chuyến có tài xế không có hai nút này — người giao/nhận xe là tài xế và gian hàng.

## Cần xem lại khi

- Lời báo sai thành chuyện thường (nhiều tranh chấp `return_disputed`) ⇒ cân nhắc bắt ảnh/vị trí kèm.
- Có app mobile phiên bản mới ⇒ thêm hai nút trên app khách, cùng endpoint.
