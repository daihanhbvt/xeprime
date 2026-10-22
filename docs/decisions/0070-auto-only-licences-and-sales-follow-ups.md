# ADR 0070 — Bằng lái khách chỉ còn TỰ QUYẾT (gỡ hàng đợi duyệt tay); chăm sóc khách mất đơn ở Đơn thuê toàn hệ thống

Ngày: 22/10/2026 · Trạng thái: **Accepted** · Ghi đè: [0057](0057-customer-driver-licence-verification.md) phần "chờ người duyệt" (điều 2–3 và mọi nhánh `pending_review`, kể cả "khách nhờ xem lại") · Giữ nguyên: 0057 các điều về nộp ảnh, bộ đọc tại chỗ, cổng hạng + hạn khi gửi yêu cầu, writer duy nhất `DriverLicencesService` · Liên quan: 0044, 0045, 0053, 0060

## Bối cảnh

ADR 0057 cho máy tự xác thực / tự từ chối phần lớn lượt nộp, phần còn lại (độ tin cậy thấp, hạn hoặc
ngày sinh đọc ra vô lý, bộ đọc lỗi, khách nhờ xem lại) vào một hàng đợi để nhân sự nền tảng duyệt
tay ở menu "Bằng lái khách". Chủ sản phẩm chốt (22/10/2026): không duy trì hàng đợi đó — hệ thống
tự quyết mọi lượt như trước khi có hàng đợi; bằng lái xem trong hồ sơ khách thuê.

Cùng lúc, đội sale cần một danh sách khách đã gửi yêu cầu nhưng chuyến không thành để gọi lại.

## Quyết định

### 1. Mọi lượt nộp có kết quả tự động: `verified` hoặc `rejected`

| Ca (trước là chờ duyệt) | Nay |
| --- | --- |
| Độ tin cậy thấp nhưng đủ trường, còn hạn, đúng hạng | **Tự xác thực** — chủ xe đối chiếu bằng gốc khi giao xe |
| Hạn không thể có với hạng / ngày sinh dưới 18 tuổi | **Tự từ chối** `unreadable` — gần như luôn là ảnh đọc lệch, khách chụp lại |
| Bộ đọc lỗi / tắt / quá tải / mất ảnh / lượt đọc kẹt quá 5 phút | **Từ chối** `reader_unavailable` — khách thấy lời mời chụp lại ảnh rõ hơn và gửi lại (không bảo "thử lại sau": khách luôn có việc để làm ngay). Mã riêng chỉ để nền tảng phân biệt với ảnh mờ thật. **Không bao giờ tự xác thực khi chưa đọc được** |
| Khách nhờ xem lại một lần bị từ chối | **Gỡ** — endpoint `POST /account/driver-licence/:id/request-review` không còn |

- Trạng thái `pending_review` bị DB từ chối (CHECK); migration `20261022100000_driver_licence_auto_only`
  đóng các lượt còn chờ thành `rejected` + `reader_unavailable`. Hằng số còn trong `@xeprime/types`
  chỉ để `apps/mobile` biên dịch.
- Endpoint duyệt/từ chối/đếm hàng đợi của nền tảng bị gỡ. `GET /platform/driver-licences` chỉ còn
  trả lịch sử nộp của MỘT khách (`userId` bắt buộc) — CHỈ ĐỌC; xem ảnh vẫn ghi audit mỗi lần mở.
  Quyền `platform.driver_licences.review` giữ khoá cũ, nghĩa nay là "xem bằng lái khách".
- Admin: bỏ menu "Bằng lái khách" (URL cũ chuyển về Khách thuê). Danh sách khách thuê có cột + bộ
  lọc tình trạng bằng lái (`CUSTOMER_LICENCE_STATE`: `none` · `processing` · `verified` ·
  `rejected`); hồ sơ khách có mục bằng lái (ảnh, thông tin trên bằng, lịch sử nộp).

### 2. Tab "Cần chăm sóc" ở Đơn thuê toàn hệ thống

- Một mục = một yêu cầu thuê từ chợ đã kết thúc mà không thành chuyến: `cancelled_by_customer`,
  `hold_expired`, `rejected_by_host`, `cancelled_by_host`, `expired`, `slot_taken`, hoặc đã thành đơn
  rồi đơn bị huỷ. Lý do (`FOLLOW_UP_LOST_REASON`) do SERVER suy từ trạng thái + `booking_cancellations`.
- Kết quả chăm sóc ở bảng `sales_follow_ups` (một dòng / yêu cầu; chưa có dòng = `new`): trạng thái
  `new` · `contacted` · `rebooked` · `not_interested`, ghi chú, người phụ trách (nhân sự nền tảng
  đang hoạt động), lần liên hệ cuối. Writer duy nhất `PlatformFollowUpsService`, mỗi lần ghi một dòng
  `audit_logs` trong cùng transaction. Không chạm trạng thái yêu cầu/đơn (ADR 0006).
- Xem cần `platform.bookings.view`; ghi cần quyền mới `platform.sales_followups.manage` (cấp cho
  `platform_admin`, `support`). SĐT luôn che; bản đầy đủ qua `POST /platform/follow-ups/:id/contact`
  (quyền `view_pii` + audit).

## Hệ quả

- Không còn việc tay nào chặn khách đặt xe vì bằng lái; đổi lại một số ca đọc lệch sẽ bị từ chối và
  khách phải chụp lại, còn ca độ tin cậy thấp dựa vào đối chiếu của chủ xe lúc giao xe.
- Tổng quan nền tảng thay ô "Bằng lái chờ duyệt" bằng ô "Khách cần chăm sóc" (số mục `new`).

## Cần xem lại khi

- Tỉ lệ `reader_unavailable` hoặc khiếu nại "bằng đúng mà bị từ chối" tăng rõ — khi đó cân nhắc tự
  đọc lại ở nền thay vì bắt khách nộp lại, KHÔNG mở lại hàng đợi tay mặc định.
