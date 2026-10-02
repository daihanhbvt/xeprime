# Tách `apps/mobile` thành hai app: XePrime (Customer) và XePrime Partner

Ngày: 25/09/2026 · Nền: `dbcc18cb` (`origin/develop`) · Branch: `feat/split-mobile-customer-partner`

Tài liệu impact + thiết kế cho việc tách app mobile hợp nhất thành HAI app Expo phát hành riêng,
cài song song trên cùng thiết bị, dùng chung backend/DB.

## 1. Bản đồ route hiện tại → app đích

### XePrime (Customer) — giữ nguyên identity đã phát hành (`vn.xeprime.mobile`, scheme `xeprime`)

- Tabs: `explore` · `chat` · `trips` · `account`.
- Marketplace: `search`, `listings/[id]`, `listings/[id]/request`, `shops/[slug]`.
- Chi tiết: `chat/[id]`, `trips/[id]`.
- Owner Lite (tuyến hoa hồng): toàn bộ `app/account/**` (vehicles, calendar, earnings, tax,
  contracts-documents, registration, subscription, balance, bank-accounts, payments, host-guide,
  vehicles/[id]/manage/**…) + `list-your-vehicle`, `list-your-vehicle/register`.
- Auth/public: `login`, `register`, `forgot-password`, `reset-password`, `set-password`,
  `auth/callback`, `about`, `support`, `legal/*`, `invites/[token]` (nhận lời mời → handoff sang
  Partner, xem §5).
- MỚI: `partner/register` (tạo hồ sơ gian hàng — bước POST /tenants) và `partner/success`
  (màn handoff Mở/Tải XePrime Partner).
- KHÔNG còn: toàn bộ `app/manage/**`, `ScopeGuard`, `ScopeSwitcher`, `ShopAccountGate`,
  `PLATFORM_NAV`/`PlatformHomeScreen`.

### XePrime Partner (`apps/mobile/manage`) — identity mới (placeholder, cần team chốt)

- Giữ nguyên prefix đường dẫn `/manage/**` bên trong app (quyết định thiết kế: mọi
  `ROUTES.manage.*`, deep link push `/manage/...` cũ và code màn hình giữ nguyên — không cần
  migration đường dẫn; app mới nên không có deep link "cũ" nào cần fallback thêm).
- Route: `index` (điều phối login/onboarding/dashboard), auth (`login`, `forgot-password`,
  `reset-password`, `set-password`, `auth/callback`), `invites/[token]`, `legal/*`, `support`
  (public), `+not-found`, và toàn bộ cây `manage/**` hiện tại (tabs + deep screens), gồm
  `manage/onboarding` (khôi phục onboarding từ `tenants.onboarding_state`).
- KHÔNG chứa: marketplace, trips khách, account khách, Owner Lite, admin platform
  (`PlatformHomeScreen`/`PLATFORM_NAV` bị loại — admin không được phục vụ trên mobile).

### `apps/mobile/shared` — package `@xeprime/mobile-shared`

Chứa phần dùng chung THẬT: `src/api` (33 feature), `src/components`, `src/features` (phần
không phải shell/gate), `src/hooks`, `src/i18n`, `src/lib` (auth-session, secure-storage,
api-client wiring helpers), `src/queries`, `src/store`, `src/theme`, `src/utils`,
`src/constants`, assets/fonts, plugins config-plugin dùng chung.

KHÔNG nằm trong shared (mỗi app một bản, đặt ở `<app>/src/`):
`navigation/routes.ts`, root layout/landing, eligibility gate, deep-link allowlist
(`features/notifications/deep-link.ts`), `features/auth/enter-app.ts` + `use-enter-app`,
shell (drawer/nav/menu), app.config, Firebase config file.

**Cơ chế overlay**: code shared import qua alias `@/*`. Mỗi app phân giải `@/*` theo thứ tự
`<app>/src/*` → `shared/src/*` (tsconfig `paths` nhiều mục, Metro `resolveRequest`, Jest
resolver). Nhờ đó feature dùng chung (ví dụ trips, chat) gọi `@/navigation/routes` và nhận
đúng bản đồ route CỦA APP đang build — shared không chứa route builder nào, đúng yêu cầu.
Hai app giữ CHUNG một interface `RoutesContract` (định nghĩa type ở shared) để shared
typecheck được; mục không thuộc app nào thì trỏ tới fallback an toàn của app đó
(`+not-found` / màn handoff).

## 2. Ma trận eligibility (đề xuất — cần product xác nhận mục ⑤⑦)

| Người dùng | XePrime (Customer) | XePrime Partner |
| --- | --- | --- |
| ① Khách thuần | ✅ | ❌ `PARTNER_ACCESS_REQUIRED` |
| ② Owner Lite / chủ xe hoa hồng | ✅ (Owner Lite ở account) | ❌ `PARTNER_ACCESS_REQUIRED` |
| ③ Chủ gian hàng tuyến gói (`package_active`, billing current/grace) | ✅ (vai khách — vẫn thuê xe được) | ✅ |
| ④ Manager/staff/viewer của gian hàng gói | ✅ (vai khách) | ✅ (RBAC như hiện tại) |
| ⑤ Đang onboarding gói (`package_pending`) | ✅ | ✅ → vào thẳng `/manage/onboarding` |
| ⑥ Tenant hết ân hạn (billing `lapsed` → về tuyến hoa hồng) | ✅ (Owner Lite) | ❌ như quy tắc ScopeGuard hiện tại (`tenantUsesManagePortal` false) — ADR 0038 điều 5. Tiền/hoá đơn vẫn xem được ở web; **cần product xác nhận** có mở Partner chỉ-xem không |
| ⑦ Platform admin/staff (không tenant) | ✅ (vai khách) | ❌ `PARTNER_ACCESS_REQUIRED` — bỏ `PlatformHomeScreen` placeholder; **cần product xác nhận** |
| ⑧ Nhiều vai (partner đồng thời là khách) | ✅ | ✅ |

Mâu thuẫn đã ghi nhận: "Partner không được tự rơi vào giao diện Customer trong app Partner"
được giải bằng việc app Partner KHÔNG đăng ký route customer; còn "mọi user đều thuê xe được"
giữ nguyên → tài khoản partner vẫn dùng app Customer với vai khách (hàng ③④⑧). Đây là phương
án ít phá vỡ nghiệp vụ nhất.

Quy tắc server (một nguồn): `canUsePartnerApp(me) = tenantUsesManagePortal(tenant) ||
isPackageOnboardingPending(tenant)` — helper ở `packages/types`, dùng chung cho guard API và
cả hai app. Đăng nhập Customer không kiểm tra gì thêm (mọi tài khoản hợp lệ đều vào được).

HTTP contract: sai credentials/refresh hỏng → **401**; credentials đúng nhưng ngoài phạm vi
app → **403 `PARTNER_ACCESS_REQUIRED`** (mã mới trong `API_ERROR_CODE`); đăng ký gian hàng
thành công → **2xx**. Không lộ tồn tại email/SĐT: kiểm eligibility CHỈ chạy sau khi
credentials đã xác minh.

## 3. Thay đổi API / DB / worker

### Bắt buộc

1. **`clientApp` trong auth native** (`customer` | `partner`, optional — thiếu = `customer`
   để tương thích app cũ):
   - `MobileLoginDto`, `MobileRegisterDto`, `MobileSocialExchangeDto`, phone OTP login DTO.
   - Migration: `native_auth_sessions.client_app` text NOT NULL DEFAULT `'customer'` + CHECK.
   - `POST /auth/mobile/login|register|social/exchange|phone/login` với `clientApp='partner'`:
     sau khi xác thực, nếu `!canUsePartnerApp` → 403 `PARTNER_ACCESS_REQUIRED`.
   - Refresh token vốn buộc vào session (session mang `client_app`) → không dùng chéo app
     được; `rotate` không cần đổi. Logout thu hồi đúng session của app đó (hành vi hiện tại).
2. **Ràng buộc social code với app**: `native_auth_codes.client_app` (suy từ `redirect_uri`
   lúc issue: scheme `xeprime` → customer, `xeprimepartner` → partner); `consume` đối chiếu
   `clientApp` của exchange — lệch → `SOCIAL_STATE_INVALID`. `MOBILE_AUTH_REDIRECT_URIS`
   default thêm `xeprimepartner://auth/callback`.
3. **Push theo app**: `push_devices.client_app` text NULL + CHECK (`customer`/`partner`);
   NULL = app hợp nhất cũ (nhận mọi audience). `RegisterPushDeviceDto.clientApp` optional.
   Worker `push-dispatch`: suy app đích từ `data_json.url` (`/manage…` → partner, còn lại →
   customer) và lọc device `client_app IS NULL OR client_app = <đích>`. Một thiết bị cài cả
   hai app = hai dòng `push_devices` độc lập (unique theo provider+token, FCM token khác nhau
   giữa hai package). Uninstall/logout một app chỉ tắt device của session app đó (hành vi
   `revokeSession` hiện tại).
4. **Mã lỗi**: thêm `PARTNER_ACCESS_REQUIRED` vào `packages/types/src/api.ts` + bản dịch
   namespace `Errors` (vi/en).
5. **OpenAPI/types/client**: chạy lại `pnpm contract`; hai app dùng types sinh ra, không DTO tay.

### Khuyến nghị (chưa làm đợt này, ghi để theo dõi)

- Cột `notifications.audience` tường minh thay cho suy từ URL prefix.
- `MOBILE_JWT_AUDIENCE` tách theo app (`xeprime-mobile-customer|partner`) — hiện `sid` +
  `client_app` của session đã đủ chặn dùng chéo, đổi audience chỉ thêm giá trị khi muốn
  revoke hàng loạt theo app ở tầng JWT; không làm để giữ tương thích app cũ.

### Không cần đổi

- Toàn bộ API nghiệp vụ (vehicles/bookings/…): AuthGuard + guard tenant giữ nguyên.
- `MeDto` đã đủ dữ liệu eligibility (`tenant.billingMode`, `onboardingState`, `platformRole`).
- Firebase: MỘT project FCM dùng chung; mỗi app là một Android/iOS app RIÊNG trong cùng
  project (google-services.json/plist riêng theo package id). Không cần project mới.

### Tương thích app cũ (rollout)

App hợp nhất cũ (không gửi `clientApp`) tiếp tục hoạt động: session mặc định `customer`
nhưng KHÔNG bị chặn vào `/manage` API (guard tenant như cũ — eligibility chỉ chặn ở cổng
đăng nhập `partner`); push device NULL nhận cả hai audience. Thứ tự rollout: API/worker
(backward-compatible) → phát hành 2 app → khi app cũ hết lưu hành mới siết. Rollback: revert
merge; migration chỉ THÊM cột nullable/default nên rollback code không cần rollback DB.

## 4. Handoff đăng ký gian hàng (Customer → Partner)

1. Customer: `list-your-vehicle` CTA gian hàng → `partner/register` (form POST /tenants,
   `registrationTrack='package'`) → 201 → `partner/success`.
2. `partner/success`: nút **Mở XePrime Partner** (`xeprimepartner://manage/onboarding` qua
   `Linking.openURL`, bọc trong helper `openPartnerApp()`), **Tải XePrime Partner** (store
   URL từ config, placeholder khi chưa phát hành → fallback web `APP_WEB_URL`), **Để sau**.
   Deep link KHÔNG mang token/dữ liệu mật — chỉ intent mở đúng màn; Partner tự đăng nhập và
   đọc `onboarding_state` từ server để khôi phục đúng bước (`package_pending` → checkout).
3. Các điểm customer→`/manage` còn lại đổi thành handoff hoặc bỏ: `account-nav` (3 mục
   MANAGE), `AccountTrackNotice`, `ShopEntryCard`, `TaxScreen`, `SupportCenterScreen`,
   `InviteAnswerScreen`, `ContentWebScreen`, `ChatListScreen` (nhánh shop),
   `ShopListingGateAlert`, `shop-account-gate` (xoá), `deep-link.ts` (bỏ prefix `manage/*`).

## 5. Cấu trúc & tooling

- `pnpm-workspace.yaml`: thêm `apps/mobile/*`.
- Ba package: `@xeprime/mobile-customer`, `@xeprime/mobile-manage`, `@xeprime/mobile-shared`
  (source package, Metro đọc thẳng TS, không build step).
- Version chung (expo/RN/react/tamagui/…): pnpm `catalog:` ở `pnpm-workspace.yaml`, ba
  package.json mobile tham chiếu catalog — một chỗ nâng version.
- Metro: customer port 8081, partner port 8082 (script `start`), hai server chạy đồng thời;
  `android/`/`ios/` sinh riêng trong từng app (gitignore từng app) — clean/prebuild/gradlew
  của app này không đụng app kia.
- `eas.json` mỗi app: profile `development`, `preview` (APK), `production` (AAB).
- Identity Partner (PLACEHOLDER — cần team chốt trước khi phát hành): package/bundle
  `vn.xeprime.partner`, scheme `xeprimepartner`, tên hiển thị "XePrime Partner"; icon/splash
  tạm dùng bộ hiện có cho tới khi có nhận diện riêng.

## 5b. Điều chỉnh trong lúc triển khai (khác thiết kế ban đầu)

- **Partner giữ thêm hai route `account.*` thật**: `change-password`, `delete-account` — nhân
  sự chỉ dùng Partner vẫn phải đổi mật khẩu/yêu cầu xoá tài khoản trong app (lộ ra khi chạy
  test `ManageAccountScreen`).
- **Đăng xuất theo app**: `leaveApp` về `guestHome()` của `@/app-profile` (Customer → chợ xe,
  Partner → `/login`).
- **Test của phần shared chạy trong ngữ cảnh của TỪNG app** (jest `roots` gồm `shared/src`);
  assertion so bằng builder `ROUTES.*`/`@/app-profile` thay vì literal. Suite chỉ có nghĩa ở
  một app nằm trong `testPathIgnorePatterns` của app kia (12 suite manage-screen bị bỏ ở
  Customer; 2 suite account khách bị bỏ ở Partner).
- `apps/web/scripts/i18n-check.mjs` trỏ bảng gom mobile sang `apps/mobile/shared/src/i18n/`.
- Ghi chú UX cần product xem: huy hiệu chat ở app Customer vẫn đếm cả tin nhắn phía GIAN HÀNG
  và bấm vào rơi về màn handoff `/partner` — cân nhắc loại `chatShop` khỏi badge ở Customer.

## 6. Kiểm thử

- API: spec cho login/exchange partner bị chặn 403 đúng mã, clientApp bind vào social code,
  push-dispatch lọc đúng app, app cũ (không clientApp) không bị ảnh hưởng.
- Mobile: typecheck + lint + jest từng app; customer không đăng ký route `manage/**`
  (kiểm bằng cây `app/`), partner không đăng ký route customer.
- Build/emulator (chỉ chạy được khi môi trường cho phép): hai Metro song song, hai APK cài
  song song, handoff, push đúng audience — phần chưa chạy thật sẽ ghi rõ ở báo cáo cuối.
