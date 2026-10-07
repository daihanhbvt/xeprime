# ADR 0054 — Mặt tiền cá nhân dùng danh tính của tài khoản chủ; mặt tiền gian hàng giữ bộ riêng

Ngày: 07/10/2026 · Trạng thái: Accepted · Ghi đè một phần: ADR 0040 (đoạn "SĐT ở bước này là số
liên hệ của GIAN HÀNG", trong phạm vi tuyến hoa hồng) · Mở rộng: ADR 0028/0038 (`resolveStorefrontKind`),
ADR 0053 (tài khoản partner) · Không đổi: ADR 0040 điều 7 (cổng đăng xe tuyến gói)

## Bối cảnh

Một chủ xe cá nhân (tuyến hoa hồng) đang phải giữ HAI bộ danh tính:

| Thứ | Tài khoản (`users`) | "Gian hàng" (`tenants`) |
| --- | --- | --- |
| Tên | Họ tên hiển thị | Tên hiển thị trên chợ |
| SĐT | SĐT đăng nhập (đã qua OTP) | SĐT liên hệ (tự gõ, không ai kiểm) |
| Email | Email đăng nhập | Email liên hệ |
| Ảnh | Ảnh đại diện | Logo |

Hai bộ được điền sẵn giống nhau lúc đăng ký, rồi trôi khỏi nhau. Hệ quả:

- **Rối**: chủ xe không biết sửa tên/SĐT ở đâu thì khách thấy; trang "Hồ sơ chủ xe" hỏi cùng một câu
  hai lần.
- **Không an toàn**: SĐT khách gọi là một chuỗi tự khai — có thể là số của người khác, số đã bỏ, số
  gõ nhầm — trong khi nền tảng có sẵn một số ĐÃ QUA OTP của đúng người đó.
- Với tuyến hoa hồng, "gian hàng" và "con người" là MỘT: khách thuê xe của NGƯỜI ĐÓ. Mặt tiền công
  khai của họ đã được vẽ như hồ sơ một con người (`STOREFRONT_KIND.PERSONAL`, avatar tròn, không bìa).

Bộ riêng vẫn đúng cho gian hàng tuyến gói: doanh nghiệp có tên thương hiệu, tổng đài, logo không
trùng với người đứng tên — và không nên lộ SĐT cá nhân của chủ.

## Quyết định

### 1. Danh tính công khai SUY theo tuyến hiệu lực, lúc ĐỌC

Một hàm thuần `storefrontIdentity(kind, shop, owner)` ở `@xeprime/types` (cạnh `resolveStorefrontKind`):

| Mặt tiền (`resolveStorefrontKind`) | Tên | SĐT | Email | Ảnh |
| --- | --- | --- | --- | --- |
| `personal` (hoa hồng, `unconfigured`, hết ân hạn) | `users.display_name` của chủ | `users.phone` **chỉ khi đã xác thực**, dạng `0…` | `users.email` **chỉ khi đã xác thực** | `users.avatar_url` |
| `shop` (tuyến gói, kể cả ân hạn) | `tenants.name` | `tenants.phone` | `tenants.email` | logo |

- SĐT/email chưa xác thực ⇒ `null`. Nền tảng không công bố một liên hệ mà nó chưa chứng minh là của
  người đó.
- Ở mặt tiền cá nhân, logo KHÔNG thắng ảnh đại diện (bỏ hành vi "logo cũ vẫn thắng" của đợt trước):
  cả bốn trường cùng một luật.

### 2. Không chép, không đồng bộ — cột của gian hàng nằm yên

`tenants.name/phone/email`, logo, ảnh bìa KHÔNG bị ghi đè khi về tuyến hoa hồng và KHÔNG được ghi theo
tài khoản. Hệ quả đúng như sản phẩm cần:

- **Lên gói**: bộ riêng của gian hàng hiện ra ngay (luồng nâng cấp hỏi tên + SĐT + logo).
- **Hết gói**: trang công khai tự đọc lại tài khoản — đúng mốc `now >= endsAt + grace` mà
  `resolveEffectiveBilling` đổi tuyến, không có khoảng hở chờ một job chạy.
- **Lên gói lại**: tên/logo gian hàng cũ quay lại nguyên vẹn.

### 3. Một điểm đọc cho API

`apps/api/src/common/storefront/storefront-identity.ts`: `storefrontTenantSelect(now)` + `resolveStorefront(row, now)`.
Mọi chỗ KHÁCH thấy gian hàng đi qua đó: thẻ xe, danh sách gian hàng, trang gian hàng, chi tiết xe,
chuyến của khách (tên + SĐT sau khi có yêu cầu), hợp đồng (snapshot bên cho thuê), hộp thư + tiêu đề
thông báo tin nhắn, lịch sử thanh toán của khách. `/auth/me` trả `tenant.name` đã phân giải để vỏ
site partner gọi chủ xe bằng tên của họ.

Ngoài phạm vi (đọc `tenants.name` trần, CÓ CHỦ Ý): màn nội bộ của nền tảng (danh sách đối tác, đối
soát, duyệt, kiểm toán, thuế) — đó là bản ghi pháp lý/vận hành, không phải mặt tiền; và trang Cửa
hàng của tuyến gói (nơi sửa bộ riêng).

### 4. SĐT điểm nhận xe trên trang xe công khai

Mặt tiền cá nhân không trả `pickupPoint.phone` trên trang xe công khai: SĐT của họ là SĐT đăng nhập,
chỉ trao cho khách sau khi có yêu cầu thuê — cùng lý do kênh chat của họ không mở công khai
(`storefrontAllowsPublicChat`).

### 5. Giao diện

"Hồ sơ chủ xe" (`/manage/account`) không còn ô tên/SĐT/email/logo/bìa riêng. Khối "Thông tin chủ
xe" gom TOÀN BỘ thứ khách thấy về họ, một nút lưu: ảnh đại diện (BẮT BUỘC, nút "Thay đổi" ngay tại
ảnh, không có nút xoá — `ownerAccountProfileSchema`), họ tên (`PATCH /users/me`) và lời giới thiệu
(`PATCH /tenants/current/profile`, chỉ gửi `bio`). SĐT/email sửa ở "Thông tin đăng nhập". Khối
còn lại của trang chủ xe: địa chỉ nhận xe.

## Hệ quả

- Chủ xe cá nhân CHƯA xác thực SĐT thì khách không có số để gọi — giao diện nói thẳng và mời xác
  thực. Đây là chủ đích (an toàn hơn một số không ai kiểm), không phải lỗi.
- Hợp đồng là snapshot: hợp đồng lập TRƯỚC khi đổi tuyến giữ nguyên bên cho thuê lúc lập.
- `tenants.name` vẫn NOT NULL và vẫn là nguồn của `slug` lúc tạo; không đổi schema.
- App native (`apps/mobile`) còn màn sửa `tenants.name/phone` cho chủ xe hoa hồng: sửa ở đó không còn
  tác dụng trên mặt tiền cá nhân cho tới khi lên gói — app cần đi theo (ADR 0031, hai bản không tự
  đồng bộ).

## Cần xem lại khi

- Chủ xe cá nhân cần một SĐT liên hệ khác SĐT đăng nhập (ví dụ người nhà giao xe) — khi đó thêm một
  "SĐT phụ" ĐÃ XÁC THỰC qua OTP, không quay lại ô tự khai.
- Có tuyến thứ ba (ví dụ hộ kinh doanh nhỏ) không khớp hẳn với `personal`/`shop`.
