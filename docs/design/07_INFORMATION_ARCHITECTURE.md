# 07 — Information Architecture

> Cập nhật: 06/10/2026
> Trạng thái: **Canonical — cấu trúc trải nghiệm, vai trò và lối vào**
> Nguồn quyết định: [ADR 0051](../decisions/0051-product-surfaces-web-zones-and-mobile-variants.md) (bề mặt) ·
> [ADR 0053](../decisions/0053-separate-account-realms.md) (không gian tài khoản) ·
> [ADR 0040](../decisions/0040-registration-track-split.md) (đăng ký hai tuyến) ·
> [ADR 0050](../decisions/0050-platform-tenant-support-context.md) (hỗ trợ gian hàng).
> Route trong tài liệu đã đối chiếu với `apps/web/src/app` và `apps/web/src/constants/{routes,nav,account-nav}.ts` ngày 06/10/2026.

Mô hình doanh thu, persona và giá/phí ở [`02_PRODUCT_VISION.md`](02_PRODUCT_VISION.md); khoảng trống
còn phải làm ở [`03_PRODUCT_GAP_ANALYSIS.md`](03_PRODUCT_GAP_ANALYSIS.md). Tài liệu này trả lời: **ai
vào đâu, thấy menu gì, bắt đầu một việc từ chỗ nào.**

## 1. Ba site, ba không gian tài khoản

```text
xeprime.vn            realm customer   Khách thuê            app/(public)
partner.xeprime.vn    realm partner    Gian hàng tuyến gói   app/(manage)/manage
                                       + chủ xe cá nhân tuyến hoa hồng (Owner Lite)
admin.xeprime.vn      realm platform   Nhân sự nền tảng      app/(admin)/admin
```

- **Một Next app, một API, một DB.** Ba site là ba cách trình bày cùng dữ liệu xe, lịch, booking và
  tiền — không clone feature theo site.
- **URL hiển thị không mang tiền tố** `/manage` hay `/admin`: `partner.xeprime.vn/vehicles`,
  `admin.xeprime.vn/money`. Hai tiền tố đó chỉ là tên thư mục; đường dẫn dựng qua
  `apps/web/src/zones/` (máy dev chạy chế độ `path`, nên ở `localhost:3000` vẫn thấy `/manage/…`).
  Trong thiết kế và tài liệu, ghi **site + đường dẫn**, ví dụ "site partner · `/vehicles`".
- **Mỗi site là một tài khoản riêng.** Cùng SĐT/email/Google đăng ký ở hai site là **hai tài khoản**,
  mật khẩu và phiên riêng, không liên kết, không chuyển đổi. Đăng xuất chỉ áp cho site đó.
- **Site khách và site partner** đăng nhập bằng **SĐT + mật khẩu** hoặc Google/Facebook; đăng ký xác
  minh SĐT bằng OTP; OTP không phải một cách đăng nhập. Tài khoản chưa xác minh SĐT phải xác minh
  trước khi dùng tiếp. Gửi yêu cầu thuê cần tài khoản khách — khách chưa đăng nhập được mời đăng nhập
  giữa luồng và quay lại đúng chỗ (ADR 0060).
- **Site quản trị** không tự đăng ký (tài khoản do admin tạo), đăng nhập bằng email + mật khẩu, không social/OTP.
- Quyền, tuyến và realm **do server quyết**. Host chỉ là trình bày; ẩn menu không phải kiểm soát quyền.

### 1.1 Ai làm được gì

| Việc | Site |
| --- | --- |
| Tìm xe, gửi yêu cầu thuê, trả tiền giữ chỗ, chuyến đi thuê, đánh giá, chat phía khách, ví tiền hoàn | khách |
| Đăng ký chủ xe/gian hàng (cả hai tuyến), xe, lịch, duyệt yêu cầu, bàn giao, quyết toán, ví khoản phải trả, thuế, gói, thành viên, chat phía gian hàng | partner |
| Duyệt xe, đối soát tiền, chính sách/gói/mã khuyến mãi, hỗ trợ gian hàng, nhân sự, audit | quản trị |

### 1.2 Quy tắc tài khoản

- **Chỉ tài khoản khách đặt được xe.** Tài khoản partner (mọi vai) và tài khoản quản trị không có
  luồng đặt xe. Chủ xe muốn đi thuê thì dùng tài khoản khách ở `xeprime.vn`.
- **Không tự đặt xe của mình**, kể cả bằng tài khoản khách: tài khoản khách có SĐT đã xác minh trùng
  SĐT của một thành viên `active` (mọi vai) của gian hàng sở hữu xe ⇒ server từ chối với
  `CANNOT_BOOK_OWN_VEHICLE` (ADR 0053 điều 7). Hai SĐT khác nhau thì không phát hiện được — giới hạn
  đã chấp nhận. UI giải thích bằng câu ánh xạ từ mã lỗi, không ẩn xe.
- **Một tài khoản partner thuộc tối đa MỘT gian hàng** (ADR 0053 điều 6). Không có bộ chọn gian hàng,
  không có bộ chuyển scope.
- **Ví theo tài khoản** (ADR 0053 điều 8): tài khoản khách có ví tiền hoàn của chuyến họ thuê; gian
  hàng (tenant) có ví khoản XePrime phải trả, giữ nguyên khi nâng gói; nhân viên gian hàng không có ví.
  Cùng một người có hai tài khoản thì có hai ví, không bao giờ gộp, không chuyển qua lại.
- **Một gian hàng, một tuyến hiệu lực**: tuyến hoa hồng (Owner Lite) hoặc tuyến gói (Full Manage),
  do gói hiện hành quyết (`resolveEffectiveBilling`), không do `tenant_type`.
- Tài xế là bản ghi để phân công, **không** có tài khoản hay app.

### 1.3 Persona và scope

| Persona | Site | Scope | Nguồn quyết định |
| --- | --- | --- | --- |
| Khách thuê | khách | Dữ liệu và chuyến của chính mình | Quyền sở hữu resource |
| Chủ xe cá nhân (tuyến hoa hồng) | partner | Gian hàng của mình, bộ năng lực Owner Lite, trần **3 xe tính tổng** ô tô + xe máy | Membership `shop_owner` của tenant (ADR 0014 điều 1) + tuyến hiệu lực + hạn mức |
| Gian hàng tuyến gói | partner | Gian hàng của mình, Full Manage, trần theo bậc gói (ADR 0041) | Membership + permission + năng lực gói |
| Nhân viên gian hàng | partner | Gian hàng duy nhất của mình | Role `shop_manager` / `shop_staff` / `shop_viewer` + permission |
| Nhân sự nền tảng | quản trị | Toàn sàn trong phạm vi role | Platform role + permission |

Chủ xe cá nhân **không có role riêng**: họ là `shop_owner` của một tenant ở tuyến hoa hồng. Tuyến
không phải permission — hai trục kiểm tra nối tiếp (ADR 0027 điều 2); ranh giới tuyến chặn ở server
bằng `@SubscriptionTrackOnly()` (`403 SUBSCRIPTION_TRACK_ONLY`), ví và tài khoản nhận tiền chặn bằng
`@ShopOwnerOnly()`.

## 2. Site khách — `xeprime.vn`

### Công khai

| Nhóm | Màn chính | Route |
| --- | --- | --- |
| Khám phá | Trang chủ, kết quả tìm/lọc, chi tiết xe | `/`, `/search`, `/listings/[id]` |
| Niềm tin | Trang gian hàng/chủ xe, đánh giá, chính sách, lịch trống, bảng giá từng dòng | `/shops/[slug]` |
| Chuyển đổi | Gửi yêu cầu thuê (modal trên trang xe), xác thực SĐT, trả tiền giữ chỗ | — |
| Giới thiệu | Về XePrime, ứng dụng di động, lối "Đăng xe cho thuê" dẫn sang site partner | `/about`, `/app`, `/list-your-vehicle` |
| Pháp lý & hỗ trợ | Văn bản pháp lý, trung tâm hỗ trợ công khai, yêu cầu xoá tài khoản không cần đăng nhập | `/legal/[doc]`, `/support`, `/delete-account` |

Đăng nhập/đăng ký ở site khách là **modal** (`/?auth=login`), không phải trang.

### Sau đăng nhập

Menu tài khoản khách là MỘT nhóm, giống nhau cho mọi tài khoản khách:

| Mục | Route |
| --- | --- |
| Hồ sơ | `/account` |
| Trở thành chủ xe — mở site partner (tài khoản riêng) | `partner…/register` |
| Chuyến của tôi | `/trips`, `/trips/[id]` |
| Lịch sử thanh toán | `/account/payments` |
| Số dư (ví tiền hoàn) | `/account/balance` |
| Tài khoản nhận tiền | `/account/bank-accounts` |
| Đổi mật khẩu | `/account/change-password` |
| Yêu cầu xoá tài khoản | `/account/delete-account` |

Tin nhắn ở `/chat` (biểu tượng trên header và tab mobile). Các route `/account/favorites`,
`/account/addresses`, `/account/documents`, `/account/notifications`, `/account/settings`,
`/account/support` tồn tại nhưng không nằm trong menu tài khoản — mở từ ngữ cảnh.

Khách thuê không có gian hàng là **trạng thái hợp lệ vĩnh viễn**: site khách không có form tạo gian
hàng, không coi hồ sơ là "chưa hoàn thiện" vì thiếu xe.

Checkout tách ba con số: **tổng giá chuyến**, **chuyển ngay qua QR** (tiền giữ chỗ = cọc · phí nền
tảng phía khách · bảo hiểm xe · bảo hiểm người, trừ mã khuyến mãi nếu có) và **trả trực tiếp chủ xe
khi nhận xe**. Thứ tự: gửi yêu cầu (không thu tiền, không giữ lịch) → chủ xe duyệt hoặc "Đặt ngay" →
QR với cửa sổ 120 phút → đối soát đủ tiền ⇒ đơn thuê ra đời (ADR 0044). Thông báo "đặt xe thành
công" chỉ xuất hiện ở mốc cuối.

## 3. Site partner — `partner.xeprime.vn`

Một cây URL phục vụ **hai tuyến**. Trang cùng ý nghĩa (xe, lịch, yêu cầu, đơn, chat, số dư, gói,
hỗ trợ, tài khoản) dùng **một URL**, nội dung chọn theo tuyến hiệu lực do server trả. Trang chỉ của
tuyến gói bị server chặn và vắng khỏi menu tuyến hoa hồng.

### 3.1 Lối vào và đăng ký (ADR 0040)

```text
xeprime.vn "Đăng xe cho thuê" / "Trở thành chủ xe"
└─ partner…/register            chưa đăng nhập: tạo tài khoản partner
                                 đã đăng nhập, chưa có gian hàng: chọn tuyến
   ├─ /onboarding?track=commission   hồ sơ chủ xe → đăng xe đầu tiên → duyệt xe → lên chợ
   │                                  (sau đó tiến trình ở /registration)
   └─ /onboarding?track=package       tạo gian hàng → chọn gói → QR chuyển khoản
                                      → chờ webhook SePay → /shop?welcome=1
```

- Cửa vào lưu ở `tenants.onboarding_state` (`commission` · `package_pending` · `package_active`);
  `?track=` chỉ có nghĩa khi chưa có gian hàng. F5 không làm mất tuyến đã chọn.
- Hai lựa chọn phải giải thích **chi phí, giới hạn xe, phí theo chuyến và phạm vi công cụ** trước khi
  người dùng quyết định (con số lấy từ `02` và chính sách phí hiệu lực, không gõ cứng).
- Tuyến gói **không** nhận gói hoa hồng tạm và chỉ vào được `/onboarding` cho tới khi hoá đơn `paid`;
  bấm "Tôi đã chuyển khoản" không mở Manage — webhook mới mở.
- Nhân viên vào bằng lời mời: `/invites/[token]` (xem trước rồi đăng nhập/tạo tài khoản partner).
  Mời một tài khoản đã thuộc gian hàng khác bị từ chối.
- Nâng cấp hoa hồng → gói đi qua `/subscription` (phễu nâng cấp): mua gói, **không** tạo lại tài
  khoản, tenant hay xe. Booking tạo trước thời điểm nâng cấp giữ mô hình và phí đã snapshot.
- Hết gói và hết ân hạn ⇒ tenant về tuyến hoa hồng: menu Owner Lite, xe ở nguyên trên chợ, chuyến
  đang chạy khép bình thường, ví và chứng từ vẫn xem/rút được; trần Owner Lite chặn TẠO MỚI, không gỡ
  xe đang bán (ADR 0038 điều 5). Họ là khách cũ cần gia hạn, không bị đưa lại vào wizard.

### 3.2 Menu Full Manage — gian hàng tuyến gói

| Khối | Mục | Route |
| --- | --- | --- |
| Tổng quan (luôn hiện) | Tổng quan | `/` |
| Vận hành | Xe của tôi → Danh sách xe · Bảo dưỡng | `/vehicles`, `/maintenance` |
| | Lịch | `/calendar` |
| | Đơn thuê → Yêu cầu đặt xe · Chờ giao xe · Tất cả đơn thuê | `/booking-requests`, `/bookings/awaiting-pickup`, `/bookings` |
| | Khách hàng | `/customers` |
| Kinh doanh | Tin nhắn | `/chat` |
| | Tài chính → Số dư & rút tiền (chỉ `shop_owner`) · Doanh thu · Thu chi · Công nợ | `/balance`, `/finance`, `/receipts`, `/debts` |
| Mặt tiền | Gian hàng — một trang năm section (hiển thị · chủ gian hàng · địa chỉ & pháp lý · tài khoản nhận tiền · gói & hạn mức) | `/shop?section=` |
| Cấu hình | Chính sách thuê · Chi nhánh · Tài xế · Thành viên | `/shop/policies`, `/shop/branches`, `/drivers`, `/members` |
| Hỗ trợ (luôn hiện) | Trung tâm hỗ trợ · Hỗ trợ & khiếu nại | `/support`, `/support/cases` |

Ngoài sidebar: **Tài khoản & bảo mật** của NGƯỜI đăng nhập (tên, ảnh, email/SĐT đăng nhập, mật khẩu,
xoá tài khoản) ở `/account?section=`, mở từ thẻ người dùng — tách khỏi hồ sơ gian hàng (pháp nhân).
Đăng xuất ở cùng menu đó.

- "Yêu cầu đặt xe" có ba tab: **Cần xử lý** · **Chờ khách thanh toán** · **Đã đóng** (ADR 0047).
- Huy hiệu menu chỉ có hai: yêu cầu chờ duyệt và tin chưa đọc.
- Lọc chi nhánh nằm trên TỪNG màn và sống trên URL, không có bộ chọn chung ở thanh trên (ADR 0052).
- Mục gắn năng lực gói (bảo dưỡng, tài chính, công nợ, chi nhánh, tài xế, thành viên): hạ bậc hoặc
  đang ân hạn ⇒ `read_only`; hết ân hạn ⇒ về tuyến hoa hồng, các mục này vắng hẳn. **Ví, hoá đơn,
  bàn giao, khai thuế, chuyến đang chạy không bao giờ nằm sau cờ tính năng** (ADR 0027 điều 3 · 0038
  điều 5).

### 3.3 Menu Owner Lite — chủ xe tuyến hoa hồng

| Khối | Mục | Route |
| --- | --- | --- |
| Vận hành (luôn hiện) | Tổng quan · Xe của tôi · Lịch · Yêu cầu đặt xe · Đơn thuê · Tin nhắn | `/`, `/vehicles`, `/calendar`, `/booking-requests`, `/bookings`, `/chat` |
| Kinh doanh | Số dư & rút tiền · Tài khoản nhận tiền · Thông tin khai thuế · Gói dịch vụ (phễu nâng cấp) | `/balance`, `/bank-accounts`, `/tax`, `/subscription` |
| Mặt tiền | Hồ sơ chủ xe (tiến trình đăng ký) | `/registration` |
| Hỗ trợ | Cẩm nang cho thuê xe · Hợp đồng & chứng từ mẫu · Chính sách bảo vệ dữ liệu · Hỗ trợ & khiếu nại | `/host-guide`, `/contracts-documents`, `/data-protection`, `/support/cases` |

Không có: chi nhánh, nhân viên, tài xế, sổ thu chi, khách hàng — đó là năng lực của gói, server chặn
bằng `@SubscriptionTrackOnly()`.

Nguyên tắc Owner Lite: chủ xe 1–3 xe phải **hoàn thành được một chuyến từ đầu tới cuối** mà không bị
ép dùng quy trình đội xe. Biên bản, ảnh tình trạng, odometer, nhiên liệu/pin **không bắt buộc**.
Cổng đăng xe của tuyến hoa hồng không đòi logo (ADR 0040 điều 7).

### 3.4 Quản lý một chiếc xe

Hồ sơ xe ở `/vehicles/[id]`; thiết lập chi tiết ở `/vehicles/[id]/manage/…`: thông tin, ảnh, giấy
tờ, giá, giờ giao nhận, lịch sử chuyến của xe; theo dịch vụ **tự lái** (giá, giao tận nơi, giờ giao
nhận, tối ưu nhận chuyến/"Đặt ngay", điều khoản) và **có tài xế** (giá, phụ phí, tối ưu, điều khoản).
Đăng xe mới: `/vehicles/new` (đầy đủ) hoặc `/vehicles/register` (wizard nhanh 3 bước). Công tắc hiển
thị trên chợ của chủ xe là trục riêng, tách khỏi trạng thái kiểm duyệt (ADR 0048).

## 4. Site quản trị — `admin.xeprime.vn`

### 4.1 Menu hiện có

| Khối | Mục | Route | Quyết định |
| --- | --- | --- | --- |
| Tổng quan (luôn hiện) | Tổng quan nền tảng | `/dashboard` | |
| Chợ xe | **Kiểm duyệt xe** — hàng đợi duyệt trên ảnh chụp hồ sơ lúc gửi, checklist thủ công là cổng backend | `/` | ADR 0049 |
| | Tất cả xe | `/vehicles` | |
| Đối tác | Gian hàng gói · Chủ xe cá nhân — hai danh sách riêng, mỗi danh sách một URL | `/partners/shops`, `/partners/owners` | |
| Đơn & khách hàng | Đơn thuê toàn sàn · Khách thuê · Tra cứu tài khoản xuyên ba realm theo SĐT/email | `/bookings`, `/customers`, `/accounts` | ADR 0053 điều 9 |
| Tiền & vận hành | **Tài chính** — một màn nhiều hàng đợi: tiền vào chưa khớp (giao dịch ngân hàng), giữ chỗ, hoàn, rút, bảo hiểm, thuế, đối soát ngày | `/money?queue=` | ADR 0022 · 0033 |
| | Hỗ trợ & tranh chấp | `/support` | |
| Chính sách & gói | Gói & phí → Gói dịch vụ · Chính sách phí | `/plans`, `/fee-policies` | ADR 0041 · 0028 |
| | **Mã khuyến mãi** (do nền tảng tài trợ) | `/promo-codes` | ADR 0046 |
| | Xác minh người bán | `/sellers` | |
| Hệ thống | Nhân sự · Danh mục xe · Địa điểm · Banner · Nhật ký audit | `/staff`, `/catalog`, `/locations`, `/marketplace-banners`, `/audit` | |

Ngoài sidebar: Bảo mật tài khoản (`/security`). URL cũ `/bank-transactions` chuyển tiếp về hàng đợi
tiền vào của `/money`; `/partners` và `/tenants` là bộ chuyển tiếp/tra loại đối tác.

Mobile của site quản trị có bốn tab: Tổng quan · Kiểm duyệt · Tài chính · Đơn thuê.

### 4.2 Hỗ trợ một gian hàng — phiên hỗ trợ, không giả danh (ADR 0050)

Nhân sự nền tảng **không** "vào Manage toàn quyền như chủ gian hàng". Lối duy nhất là **phiên hỗ trợ**:

```text
Đối tác → chi tiết gian hàng/chủ xe → "Mở chế độ hỗ trợ"
└─ chọn chế độ (Chỉ xem | Hỗ trợ thao tác) + nhập lý do (10–500 ký tự)
   └─ admin…/tenant-support/[contextId]/…   (vẫn ở site quản trị)
      băng phiên: tên gian hàng · chế độ · thời gian còn lại · Thoát
```

- Hạn cứng **45 phút**, không gia hạn — hết là mở phiên mới kèm lý do mới. Phiên gắn với người mở và
  phiên đăng nhập của họ.
- **Default-deny**: chỉ endpoint tự khai `@SupportAction` mới chạy trong phiên; capability do server
  cấp (đọc theo miền; ghi hẹp: thông tin xe, ảnh xe, bảo dưỡng). Không membership tạm, không đổi danh
  tính, không phát cookie; vai hiệu lực là `shop_viewer` nên mọi cổng chỉ-chủ (ví, tài khoản nhận
  tiền) đóng.
- Giao diện là **chính các màn của site partner** dựng lại dưới `/tenant-support/[contextId]/`
  (Tổng quan, xe, lịch, yêu cầu, đơn, khách, bảo dưỡng, tài xế, thành viên, gian hàng, chi nhánh,
  chính sách, khiếu nại), menu theo tuyến của gian hàng. Không có bản Manage riêng cho admin.
- Mọi dòng audit trong phiên ghi phía nền tảng: người mở phiên, id phiên, capability.

### 4.3 Còn thiếu (theo dõi ở `03`)

Funnel/GMV/SLA ở tổng quan; hàng đợi ticket có SLA và mẫu trả lời; risk flag, maker–checker; tiết lộ
PII gắn case. Không đưa mục chưa có luồng thật vào menu.

## 5. Mobile

Hai Expo project mỏng + một package dùng chung (ADR 0051 điều 5):

| App | Project | Bundle | Realm |
| --- | --- | --- | --- |
| XePrime | `apps/mobile/customer` | `vn.xeprime.mobile` | customer |
| XePrime Partner | `apps/mobile/manage` | `vn.xeprime.partner` | partner |

Mã chung ở `apps/mobile/shared`. **Lệch đã biết, chưa xử lý:** app Partner hiện chỉ nhận tuyến gói,
còn app XePrime vẫn chứa Owner Lite; theo ADR 0053 chủ xe tuyến hoa hồng thuộc realm `partner`, đội
mobile phải căn lại khi mở việc mobile. Thiết kế mới cho chủ xe cá nhân trên mobile vẽ ở **app
Partner**, không ở app khách.

Web responsive vẫn là bề mặt chính của site partner và site quản trị; mọi màn phải dùng được trên
điện thoại (xem `08` §2).

## 6. Giao dịch trong và ngoài nền tảng

| Loại | XePrime ghi nhận | Bảo vệ có thể cam kết |
| --- | --- | --- |
| On-platform | Báo giá, yêu cầu, tiền giữ chỗ qua QR, huỷ/hoàn; bằng chứng bàn giao nếu gian hàng dùng | Theo chính sách và dữ liệu hệ thống |
| Liên hệ trên XePrime, trả tiền trực tiếp | Booking và giao nhận nếu hai bên vẫn cập nhật | Không bảo đảm đối soát khoản trả ngoài hệ thống |
| Hai bên tự giao dịch hoàn toàn bên ngoài | Chỉ có lead/contact event | Không cam kết hoàn tiền hay phân xử phần không có chứng cứ |

Trước khi mở thông tin liên hệ, UI phải cho khách hiểu sự khác nhau này. Không mô tả giao dịch ngoài
nền tảng như giao dịch được XePrime bảo vệ đầy đủ.

## 7. Quy tắc điều hướng

1. Navigation phản ánh việc người dùng làm hôm nay, không phản ánh bảng database.
2. Không có stub trong nav. Mục chưa có luồng thật thì **ẩn hẳn**, không thay bằng dòng giải thích.
3. Thêm một mục vào sidebar thì phải nói mục nào gộp/bỏ — cây menu hiện tại đã sắp theo khối việc.
4. Feature ít dùng nằm trong Cấu hình hoặc link theo ngữ cảnh.
5. Mỗi trang có đủ năm trạng thái, gồm 403 nói thiếu quyền/năng lực gì và ai giải quyết được (`08` §1.4).
6. Điều hướng khác site là URL tuyệt đối (`zoneHref`/`siteHref`), mở site kia với **phiên của site
   đó** — người dùng có thể phải đăng nhập lại bằng tài khoản khác; copy phải nói rõ.
7. URL cũ (`xeprime.vn/manage/*`, `/manage/admin/*`, các trang Owner Lite cũ dưới `/account`) chuyển
   tiếp qua `zones/legacy-redirects.ts`; bookmark và link email không được chết vì sắp lại menu.
