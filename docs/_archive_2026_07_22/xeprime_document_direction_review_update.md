# Review hướng tài liệu XePrime và cập nhật cần chỉnh

Ngày review: 2026-07-22

## 1. Kết luận

Các tài liệu đã làm **đi đúng hướng tổng thể**:

- Xác định đúng 3 nhóm chính: khách thuê xe, gian hàng/chủ xe, admin nền tảng.
- Đề xuất đúng việc gộp Host/Admin vào một Management Portal dùng chung code/layout nhưng phân quyền theo scope.
- Đề xuất đúng việc không tách “chủ xe” và “chủ gian hàng” thành 2 role ở MVP. Nên dùng `shop_owner`.
- Đề xuất đúng việc giữ Firebase cho Auth, Chat realtime, FCM, Storage trong giai đoạn đầu.
- Đề xuất đúng việc chuyển nghiệp vụ chính sang Node.js/NestJS + MySQL.

Tuy nhiên cần cập nhật 2 điểm quan trọng:

1. **Đăng nhập**: không nên chỉ dùng OTP. Nên thêm Google/Facebook login. Chỉ xác thực số điện thoại khi có giao dịch quan trọng.
2. **Chat**: không nên chỉ phụ thuộc Firestore vô hạn. Nên dùng mô hình hybrid Firebase + MySQL để tối ưu chi phí, báo cáo, backup và hỗ trợ admin.

## 2. Hướng đúng cần giữ

| Hạng mục | Kết luận |
|---|---|
| Trang chủ thuê xe | Giữ riêng cho khách thuê xe |
| Trang gian hàng public | Nên có `/shops/[slug]` |
| Host/Admin | Nên dùng chung Management Portal, phân quyền theo scope |
| Chủ xe/chủ gian hàng | Nên là một role `shop_owner` ở MVP |
| Admin nền tảng | Tách rõ thành `platform_admin`, không nhầm với quản lý gian hàng |
| Duyệt gian hàng | Cần bổ sung |
| Duyệt xe public | Cần bổ sung |
| Firebase | Giữ cho Auth provider, Chat realtime, FCM, Storage |
| MySQL | Là nguồn chính cho tenant, xe, booking, tài chính, audit |

## 3. Cập nhật về đăng nhập

### Đề xuất mới

Người dùng nên có thể đăng nhập bằng:

- Google
- Facebook
- Có thể thêm email/password hoặc OTP sau nếu cần

Số điện thoại không nên là điều kiện để xem marketplace hoặc tạo tài khoản ban đầu.

### Khi nào bắt xác thực số điện thoại?

| Người dùng | Khi nào cần xác thực số điện thoại? | Lý do |
|---|---|---|
| Khách thuê xe | Khi gửi yêu cầu đặt xe lần đầu | Cần liên hệ thật, tránh booking ảo |
| Chủ xe/chủ gian hàng | Khi gửi hồ sơ mở gian hàng | Cần xác thực người vận hành thật |
| Chủ gian hàng | Khi gửi xe duyệt public nếu chưa xác thực | Đảm bảo trách nhiệm nguồn cung |
| Nhân viên gian hàng | Có thể không bắt ngay, tùy chủ gian hàng mời | Giảm ma sát nội bộ |

### Flow khách thuê mới

1. Khách vào marketplace không cần đăng nhập.
2. Khách xem xe, lọc xe, xem chi tiết.
3. Khi muốn đặt xe, hệ thống yêu cầu đăng nhập Google/Facebook.
4. Nếu chưa xác thực số điện thoại, yêu cầu OTP.
5. Xác thực xong mới được gửi booking request.

### Flow chủ xe/chủ gian hàng mới

1. Chủ xe đăng nhập bằng Google/Facebook.
2. Tạo hồ sơ gian hàng.
3. Khi gửi hồ sơ mở gian hàng, hệ thống yêu cầu xác thực số điện thoại.
4. Hồ sơ chuyển `pending_review`.
5. Admin nền tảng duyệt hoặc từ chối.

## 4. Cập nhật về chat và tối ưu Firebase

### Kết luận chat

Nên dùng **hybrid Firebase + MySQL**, không nên chọn chỉ một bên:

```text
Firestore: realtime message gần nhất, unread badge, listener
MySQL: conversation metadata, audit, archive, support/admin query
Storage: ảnh/file đính kèm
FCM: push notification
```

### Vì sao không chỉ dùng MySQL?

- MySQL không có realtime client-native như Firestore.
- Làm websocket riêng sẽ tốn công hơn ở giai đoạn đầu.
- Source hiện tại đã có chat Firestore, có thể tận dụng.

### Vì sao không chỉ dùng Firestore?

- Query báo cáo/admin/support không thuận tiện bằng MySQL.
- Lưu lịch sử chat vô hạn trong Firestore có thể tăng chi phí read/storage nếu không kiểm soát.
- Cần audit, backup, liên kết booking/tenant/customer rõ ràng.

### Mô hình lưu dữ liệu chat

| Dữ liệu | Lưu ở đâu | Ghi chú |
|---|---|---|
| Conversation chính | MySQL | tenantId, customerId, bookingId, listingId, status |
| Conversation realtime shadow | Firestore | lastMessage, lastAt, unread counters |
| Message mới/gần nhất | Firestore | 30-100 tin gần nhất để realtime |
| Message archive | MySQL hoặc object storage | Chuyển sau 30-90 ngày nếu cần |
| File/ảnh chat | Firebase Storage hoặc object storage | Firestore chỉ lưu URL |
| Notification | FCM qua Node.js job | Không gửi trực tiếp lung tung từ client |

## 5. Ước tính chi phí chat cho 1.000 chủ xe và 10.000 khách thuê

Giả định ban đầu:

- 10.000 khách thuê.
- Mỗi khách trung bình 10 tin nhắn/tháng.
- Tổng khoảng 100.000 message/tháng.
- Mỗi message ghi 1 message document và update 1 conversation document.

Ước tính Firestore:

| Chỉ số | Ước tính |
|---|---:|
| Message/tháng | 100.000 |
| Writes/tháng | khoảng 200.000 |
| Reads/tháng | khoảng 300.000-500.000 |
| Storage text | thường dưới 1GB giai đoạn đầu |

Firestore free quota hiện có:

- 50.000 reads/ngày.
- 20.000 writes/ngày.
- 20.000 deletes/ngày.
- 1GiB storage.
- 10GiB outbound/tháng.

Với mức chat đơn giản, nếu phân bổ đều thì chi phí Firestore thường rất thấp, thậm chí có thể gần 0 trong giai đoạn đầu. Chi phí có thể tăng nếu:

- Mỗi màn chat load toàn bộ lịch sử.
- Mỗi user listen quá nhiều conversation cùng lúc.
- Không tắt listener khi đóng chat.
- Lưu ảnh/file trực tiếp vào Firestore.
- Query không filter theo tenant/customer.

Nguồn tham khảo:

- Firestore pricing: https://cloud.google.com/firestore/pricing
- Firebase pricing: https://firebase.google.com/pricing
- Firebase pricing plans: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans

## 6. Checklist tối ưu chat Firebase

1. Chỉ listen conversation của user hiện tại:
   - Khách: `where customerUid == currentUser.uid`
   - Host: `where tenantId == currentTenantId`
2. Chỉ listen 30-50 tin mới nhất khi mở thread.
3. Load tin cũ bằng cursor, không dùng offset.
4. Tắt listener khi rời màn chat.
5. Không lưu base64/file trong Firestore.
6. Dùng unread counter trong conversation, không tính unread bằng cách đọc toàn bộ message.
7. Rate limit gửi tin nhắn qua Node.js nếu cần.
8. Archive message cũ sau 30-90 ngày.
9. Đặt budget alert trong Firebase/GCP.
10. Theo dõi Firestore reads/writes hằng tuần trong giai đoạn beta.

## 7. Cần cập nhật lại tài liệu nào?

| Tài liệu | Trạng thái |
|---|---|
| `xeprime_overall_user_flow_next_node.md` | Đã cập nhật login Google/Facebook + phone verification + chat hybrid |
| `xeprime_3_pages_role_restructure.md` | Hướng đúng, có thể giữ |
| `xeprime_3_pages_owner_explainer.html` | Hướng đúng, có thể bổ sung login mới nếu cần trình bày lại cho chủ |
| `xeprime_roles_pages_summary.html` | Hướng đúng |
| `xeprime_pages_roles_flow_analysis.html` | Hướng đúng nhưng dài, dùng làm tài liệu phân tích chi tiết |

## 8. Kết luận cuối

Hướng dự án đúng nên là:

```text
Next.js
  - Marketplace
  - Shop public
  - Management Portal

Node.js/NestJS
  - RBAC
  - Tenant/shop
  - Vehicle
  - Booking
  - Review
  - Admin approval
  - Finance
  - Chat metadata/archive

Firebase
  - Auth provider Google/Facebook
  - Phone verification khi cần
  - Firestore realtime chat gần nhất
  - FCM notification
  - Storage ảnh/file
```

Điểm cần nhớ:

- Không bắt OTP ngay từ đầu.
- Chỉ bắt số điện thoại khi đặt xe hoặc mở gian hàng.
- Chat dùng Firebase để realtime, MySQL để quản lý nghiệp vụ và archive.
- Với 1.000 chủ xe và 10.000 khách thuê, nếu chat chỉ vài tin đơn giản và tối ưu listener đúng cách thì chi phí Firebase không phải vấn đề lớn ở giai đoạn đầu.
