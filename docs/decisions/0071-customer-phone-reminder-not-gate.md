# ADR 0071 — Site khách: xác minh SĐT là lời NHẮC đóng được, hỏi lại đúng lúc gửi yêu cầu thuê

Ngày: 26/10/2026 · Trạng thái: **Accepted** · Ghi đè: [0060](0060-phone-login-and-account-required-booking.md) điều 5 trong phạm vi realm `customer` · Giữ nguyên: 0060 điều 5 cho realm `partner` (hộp bắt buộc, lối ra là Đăng xuất), 0060 điều 6 và 8 (chốt chặn ở server), 0060 điều 7 (bản nháp đặt xe không tự gửi) · Liên quan: 0019, 0053

## Bối cảnh

ADR 0060 điều 5 chặn MỌI tài khoản `customer`/`partner` chưa có SĐT đã xác minh bằng một hộp không
đóng được: xác minh số, hoặc đăng xuất. Ở site khách, người vào bằng Google/Facebook gặp hộp đó ngay
sau khi đăng nhập, trước khi kịp xem một chiếc xe nào. Đó là rào cản ở đúng chỗ không cần: tìm xe,
xem xe, lưu xe yêu thích không dùng tới SĐT.

Chính điều 5 đã ghi: "Cổng là UX. Chốt chặn thật nằm ở endpoint" — gửi yêu cầu thuê trả
`PHONE_NOT_VERIFIED` (điều 6), nhận lời mời tài xế/thành viên đòi SĐT đã xác minh trùng số được mời
(điều 8). Nới hộp ở giao diện khách vì vậy không mở thêm đường nào ở server.

Chủ sản phẩm chốt (26/10/2026): ở site khách chỉ nhắc, có nút đóng; khách vẫn tìm và xem xe; tới lúc
đặt xe mới bắt buộc xác minh.

## Quyết định

### 1. Site khách: hộp NHẮC, đóng được

- `AccountPhoneReminderProvider` (vỏ `app/(public)/layout.tsx`) thay `AccountPhoneGate` ở site khách.
  Tài khoản `customer` có `phoneVerified = false` thấy hộp xác minh SĐT (cùng `ContactVerifyModal`,
  purpose `profile`) với nút phụ **"Để sau"** thay cho "Đăng xuất"; đóng bằng X / Esc cũng được.
- Đóng ⇒ không nhắc lại trong phiên tab đó, ghi theo ID tài khoản ở `sessionStorage`
  (`xp.phoneReminderDismissedFor`). Tab mới / lần ghé sau ⇒ nhắc lại. Tài khoản khác đăng nhập cùng
  tab ⇒ vẫn được nhắc. `sessionStorage` lỗi ⇒ lượt đóng vẫn giữ trong bộ nhớ của trang.
- Câu mở nói rõ khách vẫn tìm và xem xe được khi chưa thêm số.

### 2. Hỏi lại đúng lúc cần: luồng đặt xe

- `useAccountPhonePrompt()` mở lại hộp, kể cả khi khách đã "Để sau", với câu mở của việc đặt xe.
- `RequestBookingFlow`: khách đã đăng nhập mà chưa có SĐT đã xác minh bấm **"Tiếp tục"** ở bước
  Chuyến đi ⇒ mở hộp và ĐỢI ở bước đó (không soát bằng lái, không tới Xác nhận). Xác minh xong ⇒ luồng
  tự đi tiếp (kiểm lại khung giờ → bằng lái → Xác nhận). "Để sau" ⇒ ở lại bước Chuyến đi; bấm
  "Tiếp tục" lần nữa thì hộp lại mở.
- Vừa đăng nhập bằng Google/Facebook từ hộp đặt xe (bản nháp ADR 0060 điều 7) mà chưa có số ⇒ cùng
  đường trên: mở hộp, đợi, xác minh xong tự đi tiếp. Không tự gửi gì.
- Server vẫn trả `PHONE_NOT_VERIFIED` ở nút gửi (cache `/auth/me` cũ) ⇒ làm mới `/auth/me`, mở hộp, giữ
  câu lỗi theo mã; xác minh xong lỗi tự gỡ, khách tự bấm gửi lại.

### 3. Site partner giữ nguyên ADR 0060 điều 5

Đối tác không có SĐT thì không chọn được tuyến cho thuê, không nhận được lời mời thành viên và khách
không có số nào để liên lạc. `AccountPhoneGate` (bắt buộc, lối ra là Đăng xuất) vẫn ở
`app/(manage)/layout.tsx`.

### 4. Không đổi ở server

Không endpoint nào đổi. Chốt chặn vẫn là `PHONE_NOT_VERIFIED` khi gửi yêu cầu thuê, phép so SĐT đã
xác minh khi nhận lời mời, và chặn tự đặt xe theo SĐT đã xác minh (ADR 0053 điều 7).

## Hệ quả

- Khách vào bằng Google/Facebook xem xe ngay; ma sát dời về đúng bước cần số.
- Tài khoản khách có thể tồn tại lâu không có SĐT. Chúng không đặt được xe, không được mời làm tài xế
  (lời mời tìm theo SĐT đã xác minh), và không đăng nhập được bằng SĐT + mật khẩu — chỉ bằng
  Google/Facebook đã nối.
- App native (`apps/mobile/customer`) theo cùng quyết định khi dev mobile cập nhật màn tương ứng; hai
  bản không tự đồng bộ (ADR 0031).

## Cần xem lại khi nào

- Có thêm việc của khách cần SĐT (vd chat với chủ xe trước khi đặt) ⇒ việc đó gọi
  `useAccountPhonePrompt()` ở đúng nút của nó và server tự chặn — không dựng lại hộp bắt buộc toàn site.
