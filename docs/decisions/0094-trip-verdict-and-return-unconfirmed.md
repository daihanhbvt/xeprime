# ADR 0094 — Kết luận chuyến của nền tảng khi bàn giao không được xác nhận, và lưới chống treo ở mốc trả xe

Ngày: 16/11/2026 · Trạng thái: **Accepted** (16/11/2026 — người dùng chốt: làm cả mốc giao lẫn mốc trả,
ân hạn trả xe 24 giờ) · Bổ sung: [0066](0066-hold-15-percent-dynamic-sla-and-handover-safeguards.md)
điều 5 (lớp 3), [0081](0081-trip-reminders-and-customer-handover-word.md), [0045](0045-host-cancellation-and-reputation.md)
điều 2 (ai chịu trách nhiệm) · Nguồn: rà soát hàng đợi "Giữ chỗ chờ chốt" của màn Tài chính 16/11/2026

## Bối cảnh

ADR 0066 lớp 3 mở case `handover_unconfirmed` khi quá giờ nhận 120′ mà cả hai bên im lặng, và giữ tiền
giữ chỗ cho tới khi case đóng. Nhưng sau khi gọi xác minh, nhân sự nền tảng **không có công cụ nào để
khép chuyến**:

- **Kết luận/đóng case trần**: case rời hàng đợi, đơn vẫn `reserved` mãi ⇒ lịch xe bị chiếm, và tiền giữ
  chỗ không bao giờ tự chốt vì đơn không bao giờ kết thúc.
- **Chốt tiền tay** ở màn Tài chính: tiền được chia, đơn vẫn `reserved` mãi; một kết cục tiền có thể trái
  ngược chuyện thật xảy ra sau đó.

Chỉ chủ xe đóng được đơn (Khách không đến / Huỷ). Chủ xe bỏ mặc ⇒ đơn treo vĩnh viễn.

Ở mốc trả xe còn tệ hơn: ADR 0081 nhắc một lần ở +30′, và chỉ có đường tự hoàn thành khi KHÁCH báo "Đã trả
xe". Cả hai im lặng ⇒ đơn kẹt ở `active` mãi, tiền giữ chỗ không quyết toán, không ai được báo. Chuyến có
tài xế còn không có nút "Đã trả xe" của khách.

Màn Tài chính còn gọi mọi case giữ tiền là "Đang tranh chấp", khiến người trực đọc một lượt chủ xe quên bấm
giao xe thành một vụ khiếu nại.

## Quyết định

1. **Kết luận CHUYẾN là cách DUY NHẤT để khép một case xác minh bàn giao còn treo.**
   `POST /platform/support/cases/:id/trip-verdict` (`platform.support.manage`), body `{ verdict, note }`
   (`note` ≥ 5 ký tự: đã xác minh thế nào). Bốn kết luận (`TRIP_VERDICT`):

   | Case | Kết luận | Hệ quả |
   | --- | --- | --- |
   | `handover_unconfirmed` | `handed_over` | Biên bản giao xe nguồn `platform`, đơn → `active` (thuế, bảo hiểm khởi động như thường) |
   | `handover_unconfirmed` | `customer_no_show` | Đơn → `no_show`; tiền chốt như huỷ muộn (ADR 0066 điều 2); không ghi lượt huỷ |
   | `handover_unconfirmed` | `host_not_delivered` | Đơn → `cancelled`, hoàn khách 100%; `booking_cancellations` ghi `responsible_party = host` do NỀN TẢNG xác minh (`verifiedParty`) |
   | `return_unconfirmed` | `returned` | Biên bản trả xe nguồn `platform`, đơn → `completed`, quyết toán như thường |

   Kết luận hợp lệ suy từ (loại case, trạng thái đơn LÚC NÀY) bằng MỘT hàm `tripVerdictsFor` dùng chung
   API ↔ web. Đơn đã đi tiếp (chủ xe vừa xác nhận / huỷ) ⇒ không còn kết luận nào, case đóng trần được như
   mọi case. Còn kết luận ⇒ `resolve` / `transition → resolved|closed` trả 409
   `SUPPORT_CASE_TRIP_VERDICT_REQUIRED`. Chi tiết case trả `tripVerdicts` (chỉ bề mặt nền tảng).

2. **Đi đúng đường của gian hàng/khách, không có đường tiền thứ hai.** Một transaction: khoá case → khoá
   đơn → kiểm lại kết luận → kết luận case (TRƯỚC khi chuyển đơn, để lượt chốt tiền tự động không bị chính
   case này hoãn) → biên bản bàn giao (`HandoversService`) hoặc `BookingsService.transitionWithinTx` →
   audit `support_case.trip_verdict`. Biên bản nguồn `platform` có `confirmed_by` = nhân sự (CHECK
   `vh_confirmed_has_actor`), mốc = giờ hẹn trên đơn (không bao giờ ở tương lai), không KM/hiện trạng.
   Tranh chấp `dispute` khác trên cùng đơn KHÔNG bị đụng: nó vẫn giữ tiền, chốt tay sau khi phân xử.

3. **Chốt tiền tay bị chặn khi đơn còn case `handover_unconfirmed` mở** (409
   `HOLD_SETTLE_NEEDS_TRIP_VERDICT`). Màn Tài chính bỏ nút "Chốt kết cục" ở các dòng đó, thay bằng lối
   "Kết luận ở hỗ trợ" (hàng đợi hỗ trợ lọc theo mã đơn — bộ lọc của màn này lên URL, ADR 0004).

4. **Lưới chống treo ở mốc TRẢ XE** — worker `return-overdue`, đối xứng lớp 3 của ADR 0066. Quá
   `returnAt + RETURN_CONFIRMATION_GRACE_MINUTES` (24h) mà đơn chợ vẫn `active`, chưa biên bản trả xe,
   khách chưa báo "Đã trả xe" (đã có đường tự hoàn thành riêng — ADR 0081) và không có tranh chấp mở ⇒
   mở MỘT case `return_unconfirmed` mức khẩn (hệ thống mở, `opened_by_user_id` NULL), báo gian hàng +
   khách. Idempotent bằng cột claim `bookings.return_unconfirmed_at`; nhìn lại 7 ngày. Mọi chuyến kể cả
   có tài xế.

   `return_unconfirmed` **không** giữ quyết toán (không vào `SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES`):
   đơn đang chạy chưa có gì để chốt, và lượt xác nhận trả xe muộn của bất kỳ ai phải quyết toán ngay.
   Biên bản trả xe được xác nhận (chủ xe, lời khách tự lập, nền tảng) tự kết luận case đó
   (`SUPPORT_CASE_AUTO_RESOLVE_REASON.RETURN_CONFIRMED`), như biên bản giao xe với `handover_unconfirmed`.

5. **Nhãn trên màn Tài chính theo lý do thật.** `HOLD_SETTLE_REASON` tách `handover_unconfirmed` khỏi
   `dispute_open` (tranh chấp thắng khi có cả hai); thẻ "Giữ chỗ chờ chốt" đếm riêng `disputeCount` (đỏ) và
   `handoverUnconfirmedCount` (cam).

## Không làm

- Kết luận "khách chưa trả xe" ở case `return_unconfirmed`: đó là tranh chấp / việc pháp lý, nhân sự giữ
  case mở hoặc mở `dispute`; không có trạng thái đơn nào mô tả nó (ADR 0066 điều 5).
- Nhập giờ/KM thực tế khi kết luận: nhân sự không có số đo; mốc là giờ hẹn trên đơn, chi tiết ghi ở `note`.
- Tự kết luận theo đồng hồ: chuyến chỉ khép khi có người xác minh.

## Hệ quả

- Migration `20261116200000_trip_verdict_return_unconfirmed`: cột claim + partial index, CHECK loại case
  thêm `return_unconfirmed`, CHECK `confirm_source` thêm `platform`.
- `HandoversService.confirmOnCustomerWordWithinTx` nhận nguồn `platform` (không `silent` — hai bên được báo);
  `BookingsService.transitionWithinTx` nhận `verifiedParty`; câu "Chủ xe nhắn" khi huỷ chỉ còn cho lượt huỷ
  của gian hàng.
- Module `TripVerdictModule` nối `SupportModule` và `BookingsModule` (không module nào trong hai cái phải
  import cái kia).

## Cần xem lại khi nào

- Khi có số liệu: tỉ lệ case `return_unconfirmed` mà xe thật sự đã về ⇒ cân nhắc rút ân hạn 24h.
- Khi có bằng chứng bàn giao điện tử (ảnh/GPS) đủ tin: cho kết luận dựa trên bằng chứng thay vì lời gọi.
