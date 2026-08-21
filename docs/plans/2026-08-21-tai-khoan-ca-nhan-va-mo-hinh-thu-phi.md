# Kế hoạch — Tài khoản cá nhân (`/account`) + Mô hình gói & thu phí

Ngày: 21/08/2026 · Nguồn: phiên trao đổi 21/08 (vai chủ xe/gian hàng · thu phí · trang tài khoản)

> Đọc kèm: [ADR 0010](../decisions/0010-billing-plans-subscriptions.md) (bị sửa bởi kế hoạch này) ·
> [ADR 0011](../decisions/0011-long-term-fixed-packages.md) (tháng lịch) ·
> [ADR 0013](../decisions/0013-no-online-payment-mvp.md) (bị mở một khe hẹp) ·
> [ADR 0008](../decisions/0008-public-listings-sync.md) (writer duy nhất của `public_listings`).

---

## 0. Quyết định nền đã chốt trong phiên

| # | Quyết định | Hệ quả |
| --- | --- | --- |
| 1 | **Chủ xe và chủ gian hàng là MỘT role** (`shop_owner`), một tenant | Không có luồng dữ liệu thứ hai. "Nâng cấp" = đổi gói, không chuyển sở hữu |
| 2 | **`tenants.tenant_type` chỉ quyết định CHỮ HIỂN THỊ** | Không bao giờ quyết định quyền hay hạn mức |
| 3 | **`plans` quyết định NĂNG LỰC** | Ẩn/hiện tính năng đọc từ gói, không đọc từ `tenant_type` |
| 4 | **Thu phí prepaid theo CHỖ (slot)**, không đếm cuối kỳ | Không cần cron chốt kỳ; `assertVehicleQuota` đã có sẵn làm đúng việc này |
| 5 | **Kỳ hạn tính theo THÁNG LỊCH**, không phải ngày | Dùng lại `addCalendarMonthsVn` (ADR 0011) |
| 6 | **Hết hạn → gỡ xe khỏi chợ, KHÔNG khoá tenant** | Đơn đang chạy có khách thật; khoá console là phạt nhầm người |
| 7 | **Giá/%/số ngày = admin sửa được; quy tắc = nằm trong code** | Núm vặn ở `plans.limits_json`, không có bảng settings mới |
| 8 | **`/account` là MỘT trang dùng chung**, `/manage` chỉ link sang | Đường đi hai chiều đã dựng sẵn, xem §2.0 |
| 9 | **Bỏ "Ví & Ưu đãi"** khỏi mockup | Gỡ luôn rủi ro giấy phép trung gian thanh toán |
| 10 | **XePrime là cái CHỢ — nền tảng không đứng giữa quan hệ khách ↔ shop** | Giấy tờ, giá, điều kiện thuê, tranh chấp: hai bên tự thương lượng. Xác thực giấy tờ là **shop tự làm tay**, admin chỉ can thiệp theo ca |

**Ranh giới của điều 10** (viết rõ để đừng hiểu thành "không kiểm duyệt gì"):

| Nền tảng VẪN kiểm duyệt | Nền tảng KHÔNG đứng giữa |
| --- | --- |
| Gian hàng được mở hay không (`approval_tasks`) | Giấy tờ của khách thuê |
| Xe được lên chợ hay không (`approved_public`) | Giá, điều kiện thuê, cọc |
| Xe vi phạm bị ẩn (`platform.vehicles.moderate`) | Tranh chấp giữa khách và shop |
| Gói/hạn mức của gian hàng | Việc giao nhận xe |

---

## 1. ADR phải viết trước khi code

| ADR | Nội dung | Ghi đè gì |
| --- | --- | --- |
| **0014** | Vai chủ xe / gian hàng: một role · `tenant_type` là nhãn · năng lực theo gói | — (mới) |
| **0015** | Cước theo chỗ, prepaid, tháng lịch, hoá đơn, hết hạn gỡ khỏi chợ | **Sửa ADR 0010** (§2 `duration_days`, §4 enforce) |
| **0016** | SePay: đối soát chuyển khoản tự động cho tiền GÓI | **Sửa phạm vi ADR 0013** (khe hẹp, không phải bỏ) |

ADR 0015 phải nói rõ ba chỗ sửa ADR 0010:
1. `duration_days` → `duration_months` (tháng lịch).
2. `plans` tách năng lực ↔ kỳ hạn; kỳ hạn là lựa chọn lúc mua, lưu trên `tenant_subscriptions`.
3. Mua thêm chỗ giữa kỳ = **huỷ dòng cũ + chèn dòng mới cùng `ends_at`** — giữ bất biến "một dòng
   hiệu lực" mà `BillingService.findCurrent` đang dựa vào (`orderBy endsAt desc`, lấy MỘT dòng).
   Nếu để hai dòng chồng lấn, hạn mức phải là TỔNG → lỗ hổng quota im lặng.

---

## 2. EPIC A — Trang tài khoản `/account`

### 2.0 Điều hướng — ĐÃ CÓ, không phải làm lại

| Chiều | Chỗ trong code |
| --- | --- |
| `/manage` → `/account` | [`ManageUserCard.tsx:62`](../../apps/web/src/components/layout/ManageUserCard.tsx#L62) — avatar sidebar ▸ Hồ sơ |
| `/account` → `/manage` | [`MarketHeader.tsx:141`](../../apps/web/src/features/marketplace/components/MarketHeader.tsx#L141) — "Quản lý gian hàng" / "Trở thành chủ xe" nếu chưa có tenant |

Chủ xe, chủ gian hàng và khách thuê **vào cùng URL `/account`**, thấy cùng trang; trang tự hiện/ẩn
khối theo cái user THỰC SỰ có. Không dựng `/manage/account`.

### 2.1 Sửa gì so với mockup

| Trong mockup | Xử lý | Vì sao |
| --- | --- | --- |
| Khối "Tỉ lệ phản hồi / Phản hồi trong / Tỉ lệ 5★" | **Bỏ khỏi `/account`** → chuyển về `/manage` + `/shops/[slug]` | Là chỉ số của GIAN HÀNG (trả lời khách). Người đi thuê không có "tỉ lệ phản hồi" |
| "Quản lý đơn thuê" | **Bỏ** → thay bằng thẻ "Gian hàng của tôi" → `/manage` | Đã là `/manage/bookings`; để lại thành hai đường vào một việc |
| "Ví & Ưu đãi" | **Bỏ** (user chốt) | Ví giữ số dư tiền cần giấy phép trung gian thanh toán (ADR 0013) |
| "Chuyến của tôi" | **Trỏ thẳng `/trips`** đã có | Đừng dựng lại; `tripPath` đang được thông báo dùng |
| "0 điểm · Điểm tích luỹ" | **Ẩn ở đợt này** | Chưa chốt nghiệp vụ tích điểm; hiện "0 điểm" mãi mãi là nợ UI |
| Icon bút chì ở SĐT / Email | **Không sửa trần** — phải qua xác minh | Đổi SĐT là đổi định danh đăng nhập (`users.phone @unique`) |

Thêm mới: thẻ **"Gian hàng của tôi" → `/manage`** (có tenant) / **"Đăng xe cho thuê" → `/manage/onboarding`**
(chưa có). Đây cũng là cửa vào của toàn bộ phễu thu phí ở EPIC B.

### 2.2 Wave

#### A1 — Khung `/account` + menu (nền, mở khoá phần còn lại)

- `app/(public)/account/layout.tsx`: sidebar riêng theo mockup; mobile → drawer/tab
  (`docs/design/05_MOBILE_FIRST_GUIDELINES.md`).
- `ROUTES.ACCOUNT` mở thành object con: `ROOT · PAYMENTS · FAVORITES · ADDRESSES · DOCUMENTS ·
  NOTIFICATIONS · SUPPORT · SETTINGS`. Mục đã có nơi khác (`TRIPS`, `CHAT`) trỏ thẳng route cũ.
- `constants/account-nav.ts` + cờ `comingSoon` (mẫu đã có ở `constants/nav.ts`) — **mục chưa làm
  vẫn hiện trong menu, disabled + nhãn "Sắp có"**, đúng ý user.
- Thẻ "Gian hàng của tôi" / "Đăng xe cho thuê" (đọc `useCurrentUser().tenant`).
- i18n: namespace `Account` mở rộng, vi + en song song ngay từ đầu (skill `i18n`).
- **Không đụng backend.**

*Tuỳ chọn (không bắt buộc đợt này):* cho `/trips` dùng chung sidebar của `/account` để điều hướng
liền mạch — làm sau nếu thấy rời rạc.

#### A2 — Hồ sơ cá nhân

- **DB:** `users` + `birth_date` (`@db.Date`) + `gender` (String, union `USER_GENDER` ở
  `packages/types`, KHÔNG enum Postgres — ADR 0005).
- `modules/users` hiện **chỉ có controller** (`GET/PATCH /users/me`), chưa có service. Tách
  `UsersService` — nó sẽ là writer của mọi thứ thuộc con người ở A2–A5.
- **Avatar upload thật**: hiện `AccountView` chỉ có ô nhập URL. Dùng `R2Service` + presign
  (mẫu `vehicle-contracts.service.ts`), bucket **công khai** (avatar hiện trên chợ).
- **Liên kết Facebook / Google**: đọc từ `user_identities` (đã có `provider google|facebook`) —
  đợt này **chỉ hiển thị + gỡ liên kết**; liên kết mới cần Firebase provider flow, để A5 hoặc sau.
  ⚠️ Chặn gỡ identity cuối cùng khi user không có mật khẩu → tự khoá mình ra ngoài.
- **Đổi SĐT** đi qua `phone-verification` với purpose mới (`phone_change`), không PATCH trực tiếp.
  **Đổi email** gửi link xác minh. Badge "Đã xác thực" đọc `phoneVerifiedAt`/`emailVerifiedAt` (đã có).

#### A3 — Giấy tờ của khách (KHO, không phải hàng đợi duyệt)

> **Sửa 21/08 theo user:** nền tảng KHÔNG làm trọng tài giấy tờ. Xác thực là **shop tự đối chiếu
> tay lúc giao xe**; admin chỉ can thiệp theo ca. Wave này vì thế nhẹ đi rất nhiều — bỏ hẳn hàng
> đợi duyệt, bỏ `approval_tasks`, bỏ bộ quyền review.

- **Bảng mới `user_documents`**: `user_id · doc_type (driver_license|citizen_id) · number · class ·
  issued_at · expires_at · issued_place` + `user_document_files` (R2 **bucket riêng tư**).
  Đây là **kho giấy tờ của khách** — tải lên MỘT lần, dùng ở mọi shop.
- ⚠️ **KHÔNG dùng lại `tenant_customer_documents`** — đó là ảnh shop tự chụp tại quầy, thuộc sổ
  khách của MỘT shop. Hai vòng đời, hai chủ sở hữu. Giữ riêng.

**Hai mức xác thực, độc lập nhau:**

| Mức | Ai làm | Lưu ở đâu | Nghĩa là gì |
| --- | --- | --- | --- |
| **Shop** (mặc định, là chính) | Nhân viên/chủ shop đối chiếu tay lúc giao xe | `tenant_customers.documents_verified_at` + `verified_by` | "Shop này đã xem giấy tờ thật của khách này" |
| **Nền tảng** (tuỳ ca, không bắt buộc) | Admin, khi có lý do | `user_documents.platform_verified_at` | Badge "Đã xác minh" hiện toàn sàn |

- **Không có hàng đợi duyệt mặc định.** Không `approval_tasks`, không màn "chờ duyệt giấy tờ".
  Admin xác minh từ màn khách hiện có (`/manage/admin/customers`) khi cần.
- **Ai xem được giấy tờ của khách:** shop mà khách **đã có yêu cầu/đơn thuê ở đó** — scope tự
  nhiên theo dữ liệu, không cần quyền platform mới. Dùng lại quyền đã có
  `customers.documents.view_files` (đã tách sẵn 4 mức ở sổ khách S-01).
- **PII:** số giấy tờ masking ở list; mở file ghi `audit_logs` từng lần, **không chép giá trị PII
  vào log** (mẫu `platform-customers`).
- Trên `/account`: khách thấy trạng thái theo mức nền tảng + danh sách shop đã xác nhận. Chưa có
  giấy tờ → nhắc, **không chặn đặt xe** (chợ, không phải cổng kiểm duyệt).

**Bỏ so với bản trước:** quyền `platform.user_documents.review` · `platform.user_documents.view_files`
· `approval_tasks.target_type = user_document` · trạng thái `pending|rejected` + `reject_reason`.

#### A4 — Địa chỉ · Xe yêu thích · Lịch sử thanh toán

- `user_addresses` (label · provinceCode · address · recipientName/Phone · isDefault).
  Tỉnh/thành lấy từ `provinces` đã có, chỉ nhận **mã**, server tra tên.
- `user_favorite_vehicles` (unique `(user_id, vehicle_id)`) + nút tim trên card marketplace.
- **Lịch sử thanh toán**: đọc-only từ `payments` của các booking của user — **không bảng mới**.
  ⚠️ Cẩn thận `HELD_FUNDS_RECEIPT_SOURCES` (cọc không phải doanh thu) và định nghĩa tiền một chỗ
  ở `common/booking-money.ts` — đừng viết công thức thứ hai.

#### A5 — Bảo mật & Cài đặt

- Đổi mật khẩu (đã có `POST /auth/password/set` cho ca chưa có; thêm ca đã có → yêu cầu mật khẩu cũ).
- Ngôn ngữ (`LocaleSwitcher` đã có, đưa vào Cài đặt).
- Tuỳ chọn nhận thông báo (module `notification` đã có).
- Liên kết Google/Facebook (nếu chưa làm ở A2).

---

## 3. EPIC B — Gói & thu phí

### 3.1 Hình dạng dữ liệu

```
plans
  code · name · status · sort_order
  base_price_monthly        Decimal(14,2)     -- 0 với gói cá nhân
  limits_json = {
    perVehiclePrice:  { car, motorbike },      -- đơn giá 1 chỗ / tháng
    includedCars, includedMotorbikes,          -- gói gian hàng gồm sẵn
    maxCars, maxMotorbikes,                    -- null = không giới hạn
    maxMembers, maxBranches,
    terms: [{ months: 1|3|6|12, discountPercent }],
    graceDays,
    features: ['members','branches','drivers','reports','branding'],
  }
  -- BỎ duration_days

tenant_subscriptions            (append-only, giữ nguyên tinh thần ADR 0010)
  + term_months                 -- 1|3|6|12
  + slots_json { cars, motorbikes }
  ends_at = addCalendarMonthsVn(starts_at, term_months)
  price   = tổng đã chốt cho kỳ

subscription_invoices           (BẢNG MỚI — ADR 0010 đã hoãn đúng cái này)
  tenant_id · subscription_id · code (unique/tenant) · period_from · period_to
  lines_json [{ vehicleType, slots, unitPrice, amount }]
  subtotal · discount · total
  status: draft | issued | paid | partially_paid | void
  paid_at · bank_ref (mã giao dịch SePay, UNIQUE)
```

`payments.subscription_id` (cột chờ sẵn từ Phase 0, chưa FK) — đợt này nối FK.

### 3.2 Wave

#### B1 — Đổi hình mô hình gói
Migration: `duration_days` → `duration_months`; thêm `base_price_monthly`; reshape `limits_json`.
Backfill gói hiện có. `BillingService.assign/renew` dùng `addCalendarMonthsVn`. Cập nhật
`/manage/admin/plans` để sửa được bộ núm mới. Seed gói khởi điểm (cá nhân + 2 bậc gian hàng) với
giá đặt tạm — **admin chỉnh sau, không hard-code trong code**.

⚠️ Kiểm điểm giao: **giá gói gian hàng ở mốc N xe phải ≥ giá cá nhân cùng N xe**, nếu không nâng
cấp xong lại trả ít hơn.

#### B2 — Hạn mức theo loại xe
`assertVehicleQuota` hiện đếm TẤT CẢ xe và so `plan.maxVehicles`
([billing.service.ts:368](../../apps/api/src/modules/billing/billing.service.ts#L368)) → tách theo
`vehicle_type`. Enforce thêm ở **`submitPublic`** (ADR 0010 đang để ngỏ) — đây là cái răng thật.
Lỗi `PLAN_LIMIT_REACHED` giữ nguyên mã, thêm `details` chỉ loại xe nào chạm trần.

#### B3 — Hoá đơn + tự phục vụ
Bảng `subscription_invoices`; sinh hoá đơn khi mua/gia hạn/mua thêm chỗ; mua thêm chỗ giữa kỳ tính
prorate **tròn tháng** theo số tháng còn lại. Màn **"Gói của tôi"** trong `/manage` cho chủ shop tự
xem hạn, số chỗ đang dùng, đặt mua/gia hạn (chưa trả tiền online — ra mã QR + chờ đối soát).

#### B4 — SePay
Webhook **công khai, không session** — endpoint đầu tiên loại này trong `apps/api`:
- Xác thực `Authorization: Apikey …` **so sánh time-safe**; nằm ngoài `AuthGuard` **tường minh**.
- **Idempotent bằng constraint DB** trên mã giao dịch (unique), không check ở tầng app (ADR 0006).
- **VietQR có sẵn nội dung** — không để khách tự gõ. Mã ngắn, không dấu, tránh `0/O`, `1/I`.
- Tiền không khớp: thiếu → `partially_paid`, **không kích hoạt**, báo admin; thừa → ghi có kỳ sau.
- **Kích hoạt do webhook**, không do redirect.

#### B5 — Hết hạn & nhắc hạn
Hết hạn + qua `graceDays` → **gỡ xe khỏi chợ** qua `ListingsService.syncFromVehicle` (ADR 0008 —
module billing KHÔNG tự ghi `public_listings`), `public_status → hidden`, có lý do hệ thống, ghi
audit. **Không khoá tenant, không đụng đơn đang chạy.** Nhắc trước hạn / đúng hạn / trong ân hạn
qua module `notification`.

⚠️ Đây là chỗ duy nhất trong kế hoạch cần **job định kỳ** — ADR 0010 cố ý không có cron. Hoặc chấp
nhận một job nhẹ ở `apps/worker`, hoặc kiểm tra lazy lúc đọc. **Quyết trong ADR 0015.**

---

## 4. Thứ tự đề nghị

```
ADR 0014 + 0015 + 0016        (chốt trước, ngắn)
   │
   ├─ A1 khung /account ──► A2 hồ sơ ──► A3 giấy tờ ──► A4 địa chỉ/yêu thích/thanh toán ──► A5 bảo mật
   │
   └─ B1 mô hình gói ──► B2 hạn mức ──► B3 hoá đơn ──► B4 SePay ──► B5 hết hạn/nhắc hạn
```

A và B **độc lập**, chạy song song được. A1 nên đi trước tất cả vì nó rẻ và mở khoá phần còn lại.

**Chặn bởi bên ngoài:** B4 cần tài khoản SePay + tài khoản ngân hàng thật. B1–B3 và B5 làm được ngay.

---

## 5. Việc còn treo, chưa đưa vào kế hoạch

| Việc | Vì sao hoãn |
| --- | --- |
| Điểm tích luỹ / ưu đãi | Chưa chốt nghiệp vụ |
| `individual → business` có cần duyệt lại không | Theo tinh thần "chợ" (§0 điều 10) thì nghiêng về **cho tự đổi**, nhưng chưa chốt vì `tenant_type` xuất hiện trên hợp đồng gửi khách |
| Liên kết MXH mới (không chỉ hiển thị) | Cần Firebase provider flow |
| Cho `/trips` dùng chung sidebar `/account` | Làm nếu thấy điều hướng rời rạc |
| **Ảnh "flow booking"** user nhắc ở đầu phiên | Chưa nhận được — hai ảnh gửi sau đều là trang tài khoản |
