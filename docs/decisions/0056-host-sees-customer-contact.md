# ADR 0056 — Chủ xe thấy liên hệ của khách khi nào: một luật, một cổng; nhãn "Quá hạn phản hồi" tách khỏi "Bị từ chối"

Ngày: 07/10/2026 · Trạng thái: Accepted · Làm rõ: ADR 0028 điều 9 (ngoại lệ của gian hàng tuyến gói
giữ nguyên) · Mở rộng: ADR 0027 điều 1 (sổ khách là năng lực của gói — nay chặn thật ở server)

## Bối cảnh

ADR 0028 điều 9 không mở liên hệ trực tiếp giữa khách và chủ xe tuyến hoa hồng trước khi có một chuyến
thật — một yêu cầu gửi rồi tự huỷ không được thành cách lấy số để chốt ngoài sàn. Trang chuyến (`/trips`)
làm đúng điều đó, nhưng **hai bề mặt khác của cùng chủ xe thì không**:

- Hộp thư yêu cầu (`GET /booking-requests`, `/:id`) trả SĐT + email khách ngay lúc khách vừa gửi.
- Sổ khách (`/customers`) tạo hồ sơ khách — kèm SĐT, email — ngay lúc khách gửi, và controller không
  chặn tuyến hoa hồng dù menu Owner Lite không bày nó ra.

Hai nơi còn suy "gian hàng trả phí" theo hai cách: trang chuyến hỏi "có dòng thuê bao đang chạy", guard
tuyến hỏi tuyến HIỆU LỰC (`resolveEffectiveBilling` — ân hạn vẫn là tuyến gói).

Cùng lúc, danh sách chuyến chiếu `expired` (không ai trả lời trong hạn) về chặng `rejected` — chủ xe thấy
"Bị từ chối" cho yêu cầu mình chưa từng mở.

## Quyết định

1. **Một luật** ở `@xeprime/types`: `hostSeesCustomerContact({ engaged, packageTrack })` với `engaged =
   isBookingRequestEngaged(status, hasBooking)` — tức đã có ĐƠN.
   - Gian hàng tuyến gói: luôn thấy (quyền liên hệ và chốt trực tiếp đã mua — ADR 0028 điều 1, 9).
   - Chủ xe tuyến hoa hồng: chỉ khi chuyến **đã có đơn**. Đã duyệt mà khách chưa trả tiền giữ chỗ
     (`awaiting_hold`) vẫn CHƯA — chủ sản phẩm chốt 07/10/2026.
   - `packageTrack` là tuyến HIỆU LỰC, cùng phép chấm với guard tuyến.
2. **Mọi bề mặt đi qua luật đó**: DTO yêu cầu (`customerPhone`, `customerEmail` → `null` khi chưa được
   thấy; cổng nằm trong service, tự đọc tuyến, nên không đường trả DTO nào đi vòng) và trang chuyến.
3. **Sổ khách** (`CustomersController`) mang `@SubscriptionTrackOnly()`. Giấy tờ khách dùng lúc bàn giao
   (`customers/:id/documents`) là controller riêng, không bị chặn.
4. Giao diện **ẩn hẳn** hàng SĐT / nút Gọi / Zalo / email khi không có — không câu giải thích luật.
5. Chặng chuyến `expired` ("Quá hạn phản hồi") tách khỏi `rejected` ("Bị từ chối"), ở cả hai site.

## Hệ quả

- App native đọc `customerPhone` có thể `null` và một chặng chuyến mới — đội mobile cần đồng bộ.
- Thành viên của gian hàng tuyến hoa hồng không còn lối vào hồ sơ khách từ hộp thư (server trả 403).
