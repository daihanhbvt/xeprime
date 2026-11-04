# ADR 0077 — Chi nhánh bắt buộc phường/xã; bề mặt công khai chỉ hiện "Phường/Xã, Tỉnh/TP"

Ngày: 03/11/2026 · Trạng thái: **Accepted** · Nguồn: lỗi partner-stg `/shop/branches` (02/11/2026) ·
Ghi đè: [0042](0042-confirmed-place-address-for-renters.md) trong phạm vi "bỏ ô xã/phường ở ô địa chỉ
có ghim" — CHỈ cho địa chỉ trở thành chi nhánh · Mở rộng: [0056](0056-host-sees-customer-contact.md)
(thêm cổng chiều ngược lại), [0061](0061-vietmap-geo-provider.md) (ảnh bản đồ công khai)

## Bối cảnh

Sửa "Chi nhánh Quận 5": chọn TP Hồ Chí Minh, gõ "123 Nguyễn Văn Cừ". Trang xe công khai lại hiện
"68 Trần Thái Tông, Phường Cầu Giấy, Hà Nội, Hà Nội". Truy ra ba lỗi chồng nhau:

1. **Ô địa chỉ lưu cả dòng gợi ý** ("số nhà, đường, phường, tỉnh" của nhà cung cấp bản đồ) vào
   `address_line`, rồi server ghép thêm tên xã + tỉnh từ danh mục; trang xe còn nối `provinceName`
   lần nữa ⇒ tỉnh lặp, và phần hành chính đến từ BẢN ĐỒ chứ không từ lựa chọn của người dùng.
2. **Ô có ghim không hỏi xã** (ADR 0042), gợi ý chỉ được KÉO về tâm tỉnh chứ không bị ràng buộc ⇒
   một địa điểm ở tỉnh khác vẫn được chọn, chỉ kèm lời nhắc.
3. **Trang xe công khai lộ địa chỉ chính xác**: `pickupPoint.address` + toạ độ, ảnh
   `/public/listings/:id/pickup-map` ghim đúng cửa, `origin` của báo khoảng cách giao xe, và địa chỉ
   hồ sơ trên trang gian hàng. Với chủ xe cá nhân, đó thường là nhà riêng.

## Quyết định

1. **Chi nhánh bắt buộc phường/xã**, chọn từ danh mục, kể cả khi đã có ghim. Áp cho tạo/sửa chi
   nhánh và mọi luồng TẠO chi nhánh mặc định (đăng ký đối tác, đăng xe nhanh). Hồ sơ gian hàng / nâng
   gói hiện ô xã nhưng vẫn tuỳ chọn; sổ khách và địa chỉ giao xe/đón của KHÁCH giữ như ADR 0042 (khách
   không biết mình ở phường nào; giao xe đo theo bán kính km, được qua ranh giới tỉnh). Server trả
   `WARD_REQUIRED`; xã khác tỉnh trả `WARD_NOT_IN_PROVINCE` (thay `VALIDATION_FAILED`). Chi nhánh cũ
   thiếu xã vẫn đọc được, mang `needsLocationReview`, và bị buộc bổ sung ở lần sửa địa chỉ kế tiếp.
2. **`address_line` chỉ là "số nhà, đường"** — ô địa chỉ của form có bộ chọn hành chính lưu dòng đậm
   của gợi ý (`lineOnly`). Chuỗi hiển thị do server ghép từ `address_line` + tên xã + tên tỉnh trong
   DANH MỤC (`formatAddress`), không bao giờ từ `formatted_address` của nhà cung cấp.
3. **Gợi ý bị ràng buộc theo tỉnh/xã đã chọn.** `GET /places/search` nhận `provinceCode`/`wardCode`:
   server nối tên xã + tỉnh vào truy vấn (rỗng thì hỏi lại đúng chữ đã gõ — tên xã mới có thể chưa có
   trong dữ liệu bản đồ), kéo về tâm tỉnh, và LOẠI gợi ý nhận ra được là thuộc tỉnh khác (đoạn cuối
   dòng phụ quy qua bảng bí danh tỉnh; không quy được thì giữ). Chọn gợi ý KHÔNG bao giờ đổi tỉnh
   đã chọn. `/places/detail?provinceCode=` trả `suggestedWardCode`
   (khớp TRỌN tên đã chuẩn hoá, đúng một xã trong tỉnh đã chọn) và form TỰ ĐIỀN lại xã kèm lời báo —
   sau sáp nhập, người dùng hay chọn nhầm phường cũ/lân cận (chọn "Cẩm Lệ" mà số nhà ở "Hòa Xuân"),
   và một địa điểm cụ thể đáng tin hơn bộ chọn. Người dùng vẫn đổi lại được. TỈNH không bao giờ tự đổi.

4. **Ghim nằm ở tỉnh khác thì bỏ ghim**, không chặn lưu: `AddressService` tra ngược toạ độ (chỉ cho
   địa chỉ đăng ký), lệch tỉnh ⇒ bỏ ghim, tra lại từ chữ, gắn `needsReview`. Tỉnh/xã người dùng chọn
   thắng.
5. **Mức công khai theo TUYẾN** — một cổng `customerSeesPickupAddress({ engaged, packageTrack })` ở
   `@xeprime/types`, cạnh `hostSeesCustomerContact`; `packageTrack` là mặt tiền có tích xanh
   (`hasVerifiedStorefront`):
   - **Gian hàng tuyến gói:** địa chỉ đủ + toạ độ chính xác ở MỌI bề mặt (trang xe, ảnh
     `pickup-map`, trang gian hàng, "Mở bản đồ") — địa chỉ cửa hàng là thông tin kinh doanh công khai.
   - **Chủ xe tuyến hoa hồng:** trang xe / trang chủ xe chỉ hiện KHU VỰC "Phường/Xã, Tỉnh/TP"
     (`publicAreaLabel`) + toạ độ XẤP XỈ ~1km (`approximatePoint`, `isApproximate = true`), không có
     "Mở bản đồ", kèm câu "Địa chỉ chính xác hiển thị sau khi đặt xe thành công". Địa chỉ đủ mở ở
     trang chuyến (`vehiclePickupPoint`) khi đã có ĐƠN (tiền giữ chỗ về đủ); chờ duyệt và
     `awaiting_hold` vẫn chỉ thấy khu vực.
   - Che ở SERVER (`public_listings` vốn chỉ có tỉnh + xã). `origin` của `delivery-distance` luôn
     xấp xỉ — nó chỉ phục vụ hiển thị, khoảng cách vẫn đo từ toạ độ thật.

## Hệ quả

- App cũ đọc `pickupPoint.address` nhận chuỗi khu vực — vẫn hiển thị được, không vỡ.
- Payload tạo chi nhánh / đăng ký đối tác từ app cũ không gửi `wardCode` sẽ bị `WARD_REQUIRED`.
- Một lượt tra ngược bản đồ thêm cho mỗi lần lưu địa chỉ đăng ký có ghim (có cache).

## Cần xem lại

- Nếu tỉ lệ gợi ý bị loại nhầm đáng kể (dữ liệu bản đồ còn tên tỉnh cũ chưa có trong bảng bí danh).
- Nếu cần tâm XÃ thật cho bản đồ công khai thay cho toạ độ làm tròn.
