# ADR 0073 — Nhắn tin với chủ xe cá nhân chỉ mở khi đã có ĐƠN

Ngày: 27/10/2026 · Trạng thái: **Accepted** · Ghi đè: luật "tuyến hoa hồng mở kênh chat sau khi khách
GỬI yêu cầu" (`ChatService.canCustomerOpenChat`, nhắc ở [0054](0054-personal-storefront-uses-account-identity.md)
điều 4) · Cùng tinh thần: [0028](0028-marketplace-subscription-fees-and-custodied-funds.md) điều 9,
[0056](0056-host-sees-customer-contact.md)

## Bối cảnh

Với chủ xe cá nhân (tuyến hoa hồng), nền tảng sống bằng phí sàn + hoa hồng trên từng đơn. SĐT hai bên đã
được giấu tới khi có đơn (ADR 0056, `hostSeesCustomerContact`), nhưng kênh chat trong sàn thì mở ngay khi
khách GỬI yêu cầu — và từ đó mở mãi cho cặp (khách, chủ xe) đó. Một yêu cầu gửi rồi tự huỷ là đủ để hai bên
nhắn cho nhau, trao số điện thoại và chốt ngoài sàn ("đi đêm"). Hộp thư yêu cầu của chủ xe cũng có nút
"Nhắn tin" mở hội thoại với khách trước khi khách trả đồng nào.

Chủ sản phẩm chốt (27/10/2026): với chủ xe cá nhân, chỉ và chỉ khi tiền giữ chỗ (cọc) thanh toán thành
công mới có nhắn tin; gian hàng tuyến gói nhắn tự do. Chặn cả giao diện lẫn server.

## Quyết định

1. **Một luật** ở `@xeprime/types`: `chatOpenBetween({ kind, engaged })` =
   `storefrontAllowsPublicChat(kind) || engaged`.
   - Gian hàng tuyến gói: luôn mở.
   - Chủ xe cá nhân, kể cả tenant chưa xác định tuyến (nhánh chặt — ADR 0038 điều 1): chỉ khi cặp (khách,
     chủ xe) đã có ĐƠN — một yêu cầu `converted_to_booking` hoặc có `booking_id` (cùng nghĩa với
     `isBookingRequestEngaged`; đơn chỉ ra đời ở lượt đối soát đủ tiền, ADR 0044). Gửi yêu cầu, hay được
     duyệt mà chưa trả (`awaiting_hold`), đều CHƯA.
   - Đơn đã từng có (kể cả đã huỷ, đã xong) giữ kênh mở: hai bên còn chuyện hoàn tiền, đồ để quên.
2. **Cổng ở server, mọi đường ghi** — cùng mã `CHAT_REQUIRES_BOOKING` (403):
   - `POST /conversations` (khách mở hội thoại) và `GET /conversations/eligibility` (cho nút) — đọc theo cặp.
   - `POST /conversations/:id/messages` — CẢ HAI phía. Hội thoại đã mở theo luật cũ, hay mở lúc tenant còn
     tuyến gói rồi hết gói, không còn gửi được; lịch sử vẫn đọc được.
   - `POST /booking-requests/:id/conversation` (chủ xe nhắn khách từ hộp thư yêu cầu) — chấm theo CHÍNH yêu
     cầu đó, cùng phép với SĐT khách (`hostSeesCustomerContact`).
3. **Cờ cho giao diện**, server chấm:
   - `ConversationSummaryDto.canSend` — danh sách tính cả trang bằng một truy vấn (không N+1).
   - `BookingRequestDto.chatOpen` — nút "Nhắn tin" trên thẻ yêu cầu.
4. **Giao diện ẩn hẳn** lối nhắn khi chưa mở (không câu giải thích luật): nút "Nhắn shop" ở trang chi tiết
   xe và trang chủ xe (`ShopChatButton` hỏi eligibility), nút "Nhắn tin cho chủ xe" ở hộp "Đã gửi yêu cầu",
   nút trên thẻ yêu cầu của chủ xe, ô soạn tin trong khung chat. Màn "Chuyến của tôi" đã theo đúng luật này
   từ trước (`canShowHostChatOnTrip`).

## Hệ quả

- Khách muốn hỏi chủ xe cá nhân trước khi đặt phải hỏi qua chính yêu cầu thuê (ghi chú, phản hồi duyệt).
  Đó là giá của việc không để kênh chat thành đường chốt ngoài sàn.
- Hội thoại cũ của tuyến hoa hồng chưa có đơn bị "đóng băng" (đọc được, không gửi được) — không xoá.
- App di động không bị vỡ: nó đã hỏi `eligibility` để ẩn nút, server chặn đường ghi. App chưa đọc `canSend`
  thì vẫn hiện ô soạn tin, gửi sẽ nhận `CHAT_REQUIRES_BOOKING` (câu báo trong `errors.json` đã viết lại).
  Đội mobile nên ẩn ô soạn tin theo `canSend` và nút trên thẻ yêu cầu theo `chatOpen`.

## Cần xem lại khi

- Tỉ lệ khách bỏ ngang ở chủ xe cá nhân tăng vì không hỏi được trước — cân nhắc một kênh hỏi đáp có kiểm
  duyệt (lọc SĐT/liên kết) thay vì mở chat tự do.
