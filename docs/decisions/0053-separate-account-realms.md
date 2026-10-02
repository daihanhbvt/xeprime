# ADR 0053 — Ba không gian tài khoản tách biệt: `customer` · `partner` · `platform`

Ngày: 02/10/2026 · Trạng thái: Accepted · Đi cùng: [ADR 0051](0051-product-surfaces-web-zones-and-mobile-variants.md)
(ba site, URL sạch, `/api` cùng origin) · Ghi đè một phần: 0002 (cookie), 0014 (một người một tài
khoản), 0019 (định danh social + callback web), 0032 điều 6 (vị trí Owner Lite), 0033 điều 2 (chủ ví),
0038 điều 2 · 6 · 7 · 8 · 9 · 10, 0040 (nơi đăng ký) · Mở rộng: 0017 (realm của phiên native) ·
Không đổi: 0050

## Bối cảnh

Quyết định sản phẩm 02/10/2026: ba site là ba hệ thống **tách biệt về tài khoản, phiên, tiền và
vận hành**. Một số điện thoại tạo được một tài khoản ở `xeprime.vn` và một tài khoản khác ở
`partner.xeprime.vn`, mật khẩu hoàn toàn độc lập.

Mô hình hiện tại đi ngược điều đó ở mọi tầng:

- `users.phone`, `users.email` unique toàn cục; `user_identities` unique theo
  `(provider, provider_user_id)` — một người chỉ có MỘT tài khoản.
- Một tài khoản mang cùng lúc vai khách, vai chủ xe và vai nhân sự nền tảng (ADR 0014 và ADR 0038).
- Cookie phiên `Domain=.xeprime.vn` đi tới mọi subdomain; đăng nhập một nơi là vào được mọi nơi.
- Một người một ví, thuộc tenant từ khi họ thành chủ xe (ADR 0038 điều 2); hộp thư hợp nhất, `/trips`
  hai vai, khu `/account` riêng cho tài khoản gian hàng (ADR 0038 điều 7–10) đều tồn tại chỉ để vá
  việc một tài khoản phải đứng hai vai.

Chưa có người dùng thật (staging chưa dựng — gate H1). Đây là thời điểm rẻ nhất để đổi mô hình danh
tính; sau khi có khách, việc tách tài khoản sẽ cần di trú dữ liệu.

## Quyết định

### 1. Ba không gian tài khoản (realm); mỗi tài khoản thuộc ĐÚNG MỘT

| Realm | Site / app | Ai |
| --- | --- | --- |
| `customer` | `xeprime.vn` · app XePrime | Khách thuê |
| `partner` | `partner.xeprime.vn` · app XePrime Partner | Chủ gian hàng tuyến gói, nhân viên gian hàng, chủ xe cá nhân tuyến hoa hồng |
| `platform` | `admin.xeprime.vn` | Nhân sự nền tảng |

- Cột `users.realm` (string, union type ở `@xeprime/types` — ADR 0005; CHECK ở DB).
- Unique theo realm: `(realm, phone)`, `(realm, email)`, `user_identities (realm, provider,
  provider_user_id)`. Cùng một số điện thoại, email hay tài khoản Google tồn tại được ở tối đa ba
  realm, mỗi nơi là một tài khoản độc lập.
- Mọi bảng gắn với đăng nhập mang realm: OTP (`phone_verifications`), đặt lại mật khẩu, xác minh
  email, `oauth_states`, phiên native.
- Không có liên kết hay chuyển đổi giữa các tài khoản của cùng một người. Hệ thống KHÔNG biết hai tài
  khoản là của cùng một người, trừ đúng một phép so số điện thoại ở điều 7.

### 2. Realm nào làm được gì

| Việc | Realm |
| --- | --- |
| Tìm xe, gửi yêu cầu thuê, trả tiền giữ chỗ, chuyến đi thuê, đánh giá, chat phía khách, ví hoàn tiền, yêu cầu hỗ trợ của khách | `customer` |
| Đăng ký chủ xe/gian hàng (hai tuyến — ADR 0040), xe, lịch, duyệt yêu cầu, bàn giao, quyết toán, ví khoản phải trả, thuế, gói, thành viên, chat phía gian hàng | `partner` |
| Quản trị nền tảng, duyệt, đối soát, hỗ trợ gian hàng (ADR 0050) | `platform` |

Ranh giới hai TUYẾN bên trong realm `partner` giữ nguyên (`resolveEffectiveBilling`,
`@SubscriptionTrackOnly`, `@ShopOwnerOnly` — ADR 0038 điều 1, 3, 4, 5, 11–14).

### 3. Đăng ký và đăng nhập theo realm

- `customer`: tự đăng ký ở `xeprime.vn` và app XePrime — mật khẩu, OTP, social như hiện tại.
- `partner`: tự đăng ký ở `partner.xeprime.vn` (chọn tuyến bằng `registrationTrack`); nhân viên vào
  bằng lời mời — nhận lời mời tạo hoặc dùng một tài khoản `partner`.
- `platform`: **không tự đăng ký**; tài khoản do admin nền tảng tạo. Đăng nhập bằng mật khẩu; quên
  mật khẩu qua email. **Không bắt xác thực hai bước** (chỉ đạo 02/10/2026). Đăng nhập social và
  đăng nhập bằng OTP không mở cho `platform` ở đợt này.

### 4. Phiên tách biệt thật

- **Web:** API phục vụ dưới `/api` của chính từng site (ADR 0051 điều 4). Cookie phiên **host-only**
  (không đặt `Domain`) và **mỗi realm một tên cookie** (staging thêm hậu tố riêng). Trình duyệt không
  bao giờ gửi cookie của site này tới site kia.
- **Realm của request do proxy quyết, không do client:** Caddy gắn header realm theo host và ghi đè
  mọi giá trị client gửi. Chỉ máy dev (chế độ `path` của ADR 0051) được nhận realm từ web app qua một
  cờ tường minh; API từ chối khởi động nếu cờ đó bật ở `APP_ENV` staging/production.
- `AuthGuard` so `user.realm` với realm của request; lệch ⇒ 401 như phiên không tồn tại. Không thêm
  claim realm vào JWT phiên — realm đọc từ DB mỗi request (ADR 0002).
- **Native:** realm = app đăng nhập (`clientApp`: `customer` ⇒ `customer`, `partner` ⇒ `partner`;
  thiếu ⇒ `customer`). Refresh token gắn vào phiên nên không dùng chéo realm. Cookie không được chấp
  nhận trên `api.xeprime.vn`.
- **OAuth:** realm ghi vào `oauth_states` lúc bắt đầu; callback web nằm dưới `/api` của site
  (`https://<site>/api/auth/social/:provider/callback`) và quay về đúng site đó. Luồng native giữ
  nguyên (ADR 0019 §8).
- Đăng xuất là của một realm; không có đăng xuất "mọi nơi".

### 5. Mọi endpoint khai realm — mặc định từ chối

Mỗi route khai realm nó phục vụ; không khai là bị chặn trước khi chạm DB. Ánh xạ mặc định:
`@PlatformOnly` ⇒ `platform`; `@TenantScoped`, `shop/*` ⇒ `partner`; đặt xe, chuyến của khách, ví hoàn
tiền, `account/*` của khách ⇒ `customer`; auth, thông báo, chat, upload ⇒ khai nhiều realm và hành vi
theo realm. Test contract làm đỏ khi có route chưa khai.

### 6. Một nhân viên chỉ thuộc MỘT gian hàng

Một tài khoản `partner` có tối đa **một** membership `active` (unique index một phần trên
`tenant_memberships(user_id) WHERE status = 'active'`). Mời một tài khoản đã thuộc gian hàng khác ⇒ từ
chối bằng mã lỗi riêng. Hệ quả: `TenantScopeGuard` không còn phải chọn "membership cũ nhất", và không
cần bộ chọn gian hàng.

### 7. Không ai đặt xe của chính mình, kể cả bằng tài khoản khách khác

Tài khoản `customer` có số điện thoại đã xác minh **trùng** số điện thoại của bất kỳ thành viên
`active` nào (mọi vai) của tenant sở hữu xe ⇒ không gửi được yêu cầu thuê xe đó
(`CANNOT_BOOK_OWN_VEHICLE`). Kiểm ở server, cùng vị trí cổng đặt xe của ADR 0038 điều 6 (sau OTP và
điểm hội tụ danh tính, trước khi ghi `booking_requests`).

Lý do: chuyến tự đặt thổi phồng chỉ số uy tín và điểm xếp hạng (ADR 0045), mở đường tự đánh giá, và
đặt một người vào hai vai trên một đơn (lỗi kế toán của ADR 0038 điều 6). Giới hạn đã chấp nhận: hai
số điện thoại khác nhau thì không phát hiện được.

### 8. Tiền theo tài khoản — một DB

- **Chủ ví:** tài khoản `customer` có ví `owner_type = user` (tiền hoàn của chuyến họ thuê); tenant có
  ví `owner_type = tenant` (khoản XePrime phải trả). Chủ xe tuyến hoa hồng đi thuê xe bằng tài khoản
  khách ⇒ tiền hoàn vào ví của tài khoản khách đó, không vào ví tenant. Tài khoản ngân hàng nhận tiền
  đi theo chủ ví.
- Không chuyển tiền hay điểm giữa các tài khoản, kể cả của cùng một người.
- Dòng tiền **băng qua hai realm trong MỘT transaction** (khách trả giữ chỗ ⇒ đơn ra đời ⇒ ghi có ví
  tenant; hoặc hoàn tiền về ví khách) và giữ nguyên mọi constraint của ADR 0006, 0022, 0033. Đây là
  lý do không tách DB theo realm.

### 9. Vận hành

Màn quản trị hiện realm của mọi tài khoản; tìm theo số điện thoại trả về mọi tài khoản trùng số,
mỗi dòng một realm. Yêu cầu hỗ trợ, thông báo và audit thuộc về một tài khoản cụ thể.

### 10. Dữ liệu hiện có

Chưa có dữ liệu thật. Migration gán realm theo thứ tự ưu tiên `platform` > `partner` > `customer`.
Seed viết lại để tạo tài khoản tách theo realm (vd. chủ gian hàng demo có thêm tài khoản khách cùng
số). Máy dev cần reset DB — `prisma migrate reset` do người dùng tự chạy.

## Quan hệ với ADR cũ

| ADR | Phần bị ảnh hưởng | Nay |
| --- | --- | --- |
| 0002 | Cookie `Domain=.xeprime.vn` dùng chung | Cookie host-only, mỗi realm một tên, API cùng origin dưới `/api` — đúng nhánh "cùng domain" mà 0002 điều 3 đã dự liệu |
| 0014 | Giả định một người là một tài khoản mang cả vai khách | Bị thay. Điều 1 (chủ xe cá nhân cũng là `shop_owner` của một tenant) giữ nguyên |
| 0017 | Phiên native | Thêm realm = `clientApp`; phần còn lại giữ nguyên |
| 0019 | `user_identities` unique toàn cục; callback web trên `api.xeprime.vn` | Unique theo realm; callback web dưới `/api` của từng site. Luồng native giữ nguyên |
| 0032 điều 6 | Owner Lite ở `/account` (User Portal) | Owner Lite ở `partner.xeprime.vn`. Ranh giới năng lực Owner Lite ↔ Manage giữ nguyên |
| 0033 điều 2 | Chủ ví | Theo tài khoản (điều 8 ở trên) |
| 0038 điều 2 | Một người một ví | Một TÀI KHOẢN một ví; tenant vẫn một ví |
| 0038 điều 6 | `SHOP_ACCOUNT_CANNOT_BOOK`, "dùng số điện thoại khác" | Tài khoản `partner` không gọi được endpoint đặt xe (ranh giới realm). Chủ xe đi thuê bằng tài khoản `customer` (cùng số được). Chặn tự đặt xe mở rộng sang realm khác bằng số điện thoại (điều 7) |
| 0038 điều 7 | Khu `/account` của tài khoản gian hàng, lối chuyển tiếp | Bỏ — tài khoản gian hàng không có khu khách |
| 0038 điều 8 | `/trips` hai vai trong một tài khoản | Chuyến đi thuê ở site khách; chuyến cho thuê ở site partner |
| 0038 điều 9 | Menu Owner Lite trong `/account` | Menu Owner Lite là menu tuyến hoa hồng của site partner |
| 0038 điều 10 | Hộp thư hợp nhất | Bỏ — hai tài khoản, hai hộp thư |
| 0040 | Hai cửa đăng ký ở site khách; tuyến hoa hồng vào Owner Lite ở `/account` | Cả hai cửa ở `partner.xeprime.vn`; tuyến hoa hồng vào Owner Lite của site partner |
| 0050 | Hỗ trợ gian hàng | Không đổi: phiên realm `platform`, gọi qua `admin.xeprime.vn/api` |

**Mobile (ghi nhận, không xử lý đợt này):** app XePrime ↔ realm `customer`, app Partner ↔ realm
`partner`. App Partner hiện chặn tuyến hoa hồng và app XePrime vẫn chứa Owner Lite — lệch với ADR này,
đội mobile căn lại khi mở việc mobile. Đợt triển khai ADR này không sửa `apps/mobile/**`.

## Ràng buộc bắt buộc

1. Không suy realm từ dữ liệu client ở staging/production — chỉ từ proxy theo host (web) hoặc từ
   phiên (native).
2. Không thêm realm, role, tenant hay quyền vào JWT (ADR 0002/0017).
3. Không route nào không khai realm.
4. Không liên kết, gộp hay chuyển dữ liệu/tiền giữa các tài khoản khác realm.
5. Không nới unique index "một membership `active` cho một tài khoản" bằng kiểm ở tầng app.
6. Phép chặn tự đặt xe đọc số điện thoại ĐÃ XÁC MINH, không đọc số tự khai.
7. Không tách DB theo realm.

## Cần xem lại khi nào

- Có nhu cầu thật về một nhân viên làm cho nhiều gian hàng.
- Số nhân sự nền tảng hoặc khối lượng thao tác tiền tăng ⇒ cân nhắc lại xác thực hai bước cho
  `platform`.
- Người dùng cần "chuyển" từ tài khoản khách sang tài khoản chủ xe (liên kết tài khoản).
- Mở lại việc mobile.
