# Đăng nhập Google/Facebook do backend chủ trì (bỏ Firebase Auth khỏi luồng login)

Ngày lập: 26/08/2026 · Phạm vi đợt này: **chỉ web**. Mobile làm sau, trên đúng nền này.

## 1. Context

Hôm nay XePrime có bốn đường đăng nhập, ba đường tự làm và một đường đi qua Firebase:

| Đường | Cách làm hiện tại |
| --- | --- |
| Email/SĐT + mật khẩu | Tự làm — bcrypt, [auth.service.ts:104](../../apps/api/src/modules/auth/auth.service.ts#L104) |
| SĐT + OTP | Tự làm — eSMS.vn, [phone-verification.service.ts](../../apps/api/src/modules/phone-verification/phone-verification.service.ts) |
| Google / Facebook | **Firebase JS SDK `signInWithPopup`** trên trình duyệt → ID token → `POST /auth/session` |
| Chat realtime | Firestore projection, custom token uid = Postgres user id (ADR 0009) |

Đường thứ ba là chỗ lệch, và nó chặn kế hoạch mobile:

- **`signInWithPopup` không tồn tại trên React Native.** Firebase JS SDK trên RN không hỗ trợ OAuth provider. Toàn bộ [firebase-social-auth.ts](../../apps/web/src/features/auth/lib/firebase-social-auth.ts) không tái dụng được một dòng nào cho app.
- **Persistence của Firebase trên RN dùng AsyncStorage** — CLAUDE.md mục 5 cấm tuyệt đối, token native chỉ được ở Keychain/Keystore (ADR 0017).
- **Nguy cơ tách đôi tài khoản.** Identity khoá theo `(provider, providerUserId)`. Web đang ghi Firebase uid; nếu mobile đi đường khác sẽ ghi Google `sub` → cùng một người thành hai `users`.
- **Account linking bị Firebase quyết thay.** `auth/account-exists-with-different-credential` hiện chỉ được map thành một câu báo lỗi rồi bỏ mặc người dùng ([firebase-social-auth.ts:60](../../apps/web/src/features/auth/lib/firebase-social-auth.ts#L60)). Ca này rất phổ biến ở XePrime vì luồng chính là đăng ký bằng SĐT/OTP.

Kết quả nhắm tới: **Firebase chỉ còn phục vụ chat realtime.** Danh tính do XePrime tự cầm từ đầu đến cuối, một luồng OAuth duy nhất cho cả web lẫn app native.

Ranh giới này vốn đã được vạch sẵn trong base, đợt này chỉ là hoàn tất nó:
- `IdTokenVerifier` là abstract class, ADR 0002 ghi rõ "đổi sang Auth0/Cognito/tự làm chỉ cần viết một implementation mới" ([token-verifier.ts:21](../../apps/api/src/modules/auth/token-verifier.ts#L21)).
- `FIRESTORE_ENABLED` đã độc lập với `AUTH_MODE` ([env.schema.ts:75](../../apps/api/src/config/env.schema.ts#L75)).
- Chat mint custom token bằng Postgres user id ([firebase-app.service.ts:48](../../apps/api/src/modules/firebase/firebase-app.service.ts#L48)) — **không quan tâm người dùng đăng nhập bằng cách nào**.

**Ba lựa chọn đã chốt với người dùng:** web dùng chuyển trang cả tab (không popup) · gỡ luôn đường Firebase cũ (không giữ song song) · giữ nguyên luật nối tài khoản tự động khi provider đã xác minh email.

## 2. Web đổi những gì

Bề mặt social trên web rất nhỏ — đúng 4 file chạm vào Firebase Auth:

| File | Đổi gì |
| --- | --- |
| [AuthPanel.tsx:238](../../apps/web/src/features/auth/components/AuthPanel.tsx#L238) | `signIn()` đổi từ `popup + createSession` thành `location.assign(<url backend>)`; bỏ nhánh `SocialAuthError` trong `describeError` |
| [auth.service.ts:25](../../apps/web/src/services/auth.service.ts#L25) | Xoá `getProviderIdToken` + `createSession` |
| `features/auth/lib/firebase-social-auth.ts` + `.test.ts` | **Xoá cả hai** |
| [.env.example:149](../../.env.example#L149) | `NEXT_PUBLIC_FIREBASE_*` đổi chú thích: chỉ còn chat |

**Không đổi:** form mật khẩu, tab OTP, đăng ký, quên mật khẩu, `proxy.ts`, `post-auth-destination.ts`, `AuthModalProvider`, toàn bộ `@xeprime/api-client`. Người dùng cuối thấy đúng hai khác biệt: bấm Google là rời trang thay vì mở popup, và không còn gặp lỗi "trình duyệt chặn popup".

Thêm mới trên web:
- `features/auth/lib/social-auth-url.ts` — dựng URL `GET {API}/auth/social/{provider}`.
- Đọc `?authError=` khi hạ cánh → mở modal login kèm Alert. Cắm vào `AuthModalUrlSync` ([AuthModalProvider.tsx:157](../../apps/web/src/features/auth/components/AuthModalProvider.tsx#L157)) vì nguồn sự thật của modal vốn đã là URL.

> ⚠️ **Bẫy `next`.** Khi bấm Google từ modal, URL hiện tại đang chứa `?auth=login&next=…`. Nếu lấy nguyên `currentPathWithQuery()` làm `next` thì sau khi đăng nhập xong modal sẽ mở lại. Phải lọc bỏ `auth` / `next` / `authError` trước khi dựng — đây là bug chắc chắn xảy ra nếu không xử lý ngay.

## 3. Luồng

```
AuthPanel                    API (xeprime)                     Google/Facebook
   │ click Google                  │                                  │
   ├─ location.assign ────────────▶│ GET /auth/social/google          │
   │    ?next=/xe/abc&locale=vi    │  · sinh state + PKCE + nonce      │
   │                               │  · lưu oauth_states (TTL 10')     │
   │                               ├── 302 authorize ────────────────▶│
   │                               │                                  │
   │                               │◀── 302 callback?code=…&state=… ──┤
   │                               │ GET /auth/social/google/callback  │
   │                               │  · consume state (một lần)        │
   │                               │  · POST token (server↔server) ───▶│
   │                               │  · verify id_token / debug_token  │
   │                               │  · upsertUserFromIdentity()       │
   │                               │  · SessionService.issue + attach   │
   │◀── 302 {APP_WEB_URL}/xe/abc ──┤   (Set-Cookie httpOnly)          │
```

Web không đụng vào OAuth một tí nào: không client secret, không provider token, không SDK.

**Vì sao web đợt này không cần one-time code.** Callback nằm trên origin API, `Set-Cookie` đi kèm ngay response 302 → trình duyệt hạ cánh ở web đã có phiên. One-time code chỉ cần khi app native không dùng cookie — thiết kế sẵn ở §5 nhưng không viết code đợt này.

## 4. Backend

### 4.1 Module mới `apps/api/src/modules/auth/social/`

| File | Vai trò |
| --- | --- |
| `identity.ts` | Chuyển `VerifiedIdentity` từ `token-verifier.ts` sang đây (file kia sắp xoá). Interface giữ **nguyên hình dạng** để `upsertUserFromIdentity` không phải đổi. |
| `social-provider.ts` | Interface `SocialProvider` + registry. `authorizeUrl({state, codeChallenge, nonce, redirectUri, locale})` và `exchange({code, codeVerifier, redirectUri}) → VerifiedIdentity`. |
| `google.provider.ts` | OIDC chuẩn. Scope `openid email profile`. Đổi code→token ở `oauth2.googleapis.com/token`, verify `id_token` bằng `jose` (JWKS của Google) + kiểm `nonce`. `providerUserId` = `sub`. `emailVerified` = claim `email_verified`. |
| `facebook.provider.ts` | **Không phải OIDC** — không có id_token để verify chữ ký. Đổi code→access token, rồi `GET /debug_token` bằng app token và **bắt buộc kiểm `app_id` khớp app của mình + `is_valid`** (thiếu bước này là lỗ hổng token substitution), rồi `GET /me?fields=id,name,email,picture`. `emailVerified = false` luôn — Facebook không cam kết email đã xác minh. |
| `oauth-state.service.ts` | `create()` / `consume()`. Consume bằng `updateMany({ where: { state, consumedAt: null } })` rồi kiểm `count === 1` — dùng-một-lần theo cách atomic, không đọc-rồi-ghi. |
| `social-auth.service.ts` | Ghép: `begin()` → URL authorize; `complete()` → `VerifiedIdentity` → `auth.upsertUserFromIdentity()` → `userId`. |
| `social-auth.controller.ts` | Hai route GET. |

`jose` là dependency mới duy nhất. Chọn nó thay `google-auth-library` vì Apple Sign In (bắt buộc khi lên App Store, xem §5) cần **cả** verify JWKS **và** ký client-secret JWT — `jose` làm được cả hai, thư viện của Google thì không.

### 4.2 Controller — hai route trả 302, không trả JSON

```
GET /auth/social/:provider            @Public()  → 302 tới provider
GET /auth/social/:provider/callback   @Public()  → 302 về APP_WEB_URL
```

**Mọi lỗi ở callback đều phải là 302 kèm `?authError=<CODE>`, không bao giờ là JSON.** Người dùng đang ở trong một lần điều hướng trình duyệt; trả JSON là đưa họ tới một trang trắng chứa `{"error":…}`. Bọc toàn bộ thân callback trong try/catch và tự dựng redirect.

Ràng buộc từ [openapi-contract.spec.ts](../../apps/api/test/openapi-contract.spec.ts): mọi route phải có `summary`, thuộc một tag đã khai trong [api-tags.ts](../../apps/api/src/openapi/api-tags.ts), và nói rõ public hay không. 429/500 do `enhance-document.ts` tự thêm. Hai route này trả 302 nên **không** dính luật "response 2xx phải bọc `{ data }`" — khai `@ApiResponse({ status: 302 })` là đủ, đừng dùng `@ApiExcludeEndpoint`.

`@Throttle({ default: { limit: 20, ttl: 60_000 } })` cho cả hai — cùng lý lẽ với [mobile-auth.controller.ts:50](../../apps/api/src/modules/auth/mobile-auth.controller.ts#L50).

Validate `next` **ở backend**, không tin tham số: chỉ nhận đường dẫn nội bộ tuyệt đối. Luật đã viết sẵn ở [safe-next.ts:30](../../apps/web/src/features/auth/safe-next.ts#L30) — theo skill `shared-code`, chuyển `isSafeNextPath` sang `@xeprime/domain` và cho web re-export, không chép tay sang API. Đây là chống open redirect: `?next=https://evil.example` mà redirect thẳng là biến domain của mình thành bàn đạp phishing.

### 4.3 Bảng mới `oauth_states`

```prisma
model OauthState {
  id           String    @id @db.Char(26)
  provider     String    @db.VarChar(20)
  state        String    @unique @db.VarChar(64)
  codeVerifier String    @map("code_verifier") @db.VarChar(128)
  nonce        String    @db.VarChar(64)
  redirectNext String?   @map("redirect_next") @db.VarChar(512)
  /// 'web' | 'native' — cột dành sẵn cho ADR 0017, đợt này luôn 'web'
  client       String    @default("web") @db.VarChar(10)
  expiresAt    DateTime  @map("expires_at") @db.Timestamptz(3)
  consumedAt   DateTime? @map("consumed_at") @db.Timestamptz(3)
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)

  @@index([expiresAt])
  @@map("oauth_states")
}
```

TTL 10 phút. Dọn hàng hết hạn: thêm vào job dọn dẹp sẵn có của `apps/worker` nếu có, không thì cron `deleteMany` đơn giản.

> ⚠️ **Migration.** `prisma/migrations/20260821000000_init/` là baseline gộp. Đọc header của nó trước khi chạy `migrate dev` — nó cảnh báo các FK tổ hợp `(id, tenant_id)` mà `schema.prisma` không mô tả được và Prisma sẽ sinh lệnh DROP chúng. Bảng này không có FK nên rủi ro thấp, nhưng vẫn phải đọc diff migration trước khi apply. `prisma migrate reset` thì người dùng tự gõ — Prisma chặn khi phát hiện agent.

### 4.4 Sửa `AuthService` — tách phần đã có, không viết lại

Thân của `upsertUserFromIdToken` ([auth.service.ts:230](../../apps/api/src/modules/auth/auth.service.ts#L230)) **đã làm đúng toàn bộ** việc cần: tra `(provider, providerUserId)`, chặn tài khoản khoá, nối theo email chỉ khi `emailVerified`, tạo user + identity trong một transaction.

Tách đúng một nhát:

```ts
// GIỮ NGUYÊN toàn bộ logic, chỉ đổi đầu vào từ token sang identity đã verify
async upsertUserFromIdentity(identity: VerifiedIdentity): Promise<{ userId: string }>
```

rồi xoá `upsertUserFromIdToken` cùng `token-verifier.ts`. Luật nối tài khoản ở dòng 258–281 **không đổi một chữ** — đó là quyết định đã chốt ở §1.

### 4.5 Chuẩn hoá `provider`

Hôm nay lệch: schema ghi chú `google | facebook` ([schema.prisma:91](../../prisma/schema.prisma#L91)) nhưng code ghi `decoded.firebase.sign_in_provider` tức `google.com` / `facebook.com`. Web thì đã dùng dạng ngắn ([constants.ts:1](../../apps/web/src/features/auth/constants.ts#L1)).

Chốt **dạng ngắn** và chuyển `AUTH_PROVIDER` + `AUTH_PROVIDER_LABEL` sang `packages/types` (skill `shared-code`: giá trị dùng chung web ↔ api), giữ re-export ở `features/auth/constants.ts` để 
chỗ gọi cũ không phải sửa.

Không cần backfill dữ liệu: seed chỉ tạo identity `provider: 'password'` ([accounts.ts:63](../../prisma/src/seed/accounts.ts#L63)), và dự án chưa lên production nên không có tài khoản social thật. **Đây chính là lý do phải làm đợt này chứ không phải sau Phase 8.**

### 4.6 Env

Thêm:

```
API_PUBLIC_URL="http://localhost:4000"   # dựng redirect_uri tuyệt đối; production bắt buộc https
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
```

Xoá `AUTH_MODE` (và luật production "phải dùng firebase" ở [env.schema.ts:231](../../apps/api/src/config/env.schema.ts#L231)). `FIREBASE_*` **ở lại** — `FIRESTORE_ENABLED` vẫn cần chúng cho chat.

Luật `superRefine` mới: mỗi provider là cặp id+secret, có một nửa mà thiếu nửa kia → fail lúc boot. Không provider nào là bắt buộc (giống `GOOGLE_MAPS_SERVER_KEY`): thiếu thì nút social trả `SOCIAL_NOT_CONFIGURED`, không có gì gãy. Production thì `API_PUBLIC_URL` phải là https tên miền thật.

**Không thêm `NEXT_PUBLIC_*` nào để bật/tắt nút.** Nút luôn hiện; chưa cấu hình thì backend redirect về kèm `?authError=SOCIAL_NOT_CONFIGURED` — đúng hành vi hiện tại (`SocialAuthError('notConfigured')`), một nguồn sự thật thay vì hai.

> **Ghi chú vận hành (không phải việc của đợt này).** Luồng redirect cần trình duyệt giữ được cookie khi hạ cánh ở origin web, tức production phải đặt `SESSION_COOKIE_DOMAIN=.xeprime.vn`. Đây **không phải ràng buộc mới** — `proxy.ts` đọc cookie phía server ở origin web nên đã cần sẵn. Ghi vào `.env.example` cho rõ.

### 4.7 Mã lỗi mới

Thêm vào `API_ERROR_CODE` ([packages/types/src/api.ts:45](../../packages/types/src/api.ts#L45)):

| Mã | Khi nào |
| --- | --- |
| `SOCIAL_NOT_CONFIGURED` | Provider chưa có id/secret |
| `SOCIAL_STATE_INVALID` | `state` sai, hết hạn, hoặc đã dùng |
| `SOCIAL_CANCELLED` | Provider trả `error=access_denied` (người dùng bấm huỷ) |
| `SOCIAL_EXCHANGE_FAILED` | Đổi code thất bại, `debug_token` không khớp app, id_token sai |

Dùng lại `CONFLICT` (email trùng, provider chưa verify) và `ACCOUNT_LOCKED` — đã có sẵn và `upsertUserFromIdentity` vốn ném đúng chúng.

## 5. Chỗ cắm cho mobile (không code đợt này)

Thiết kế trên cho phép mobile là phần **thêm vào**, không phải sửa lại:

1. App mở `WebBrowser.openAuthSessionAsync({API}/auth/social/google?client=native&code_challenge=…)`. `expo-web-browser` dùng `ASWebAuthenticationSession` (iOS) / Custom Tabs (Android) — không cần native module cho phần auth. `scheme: "xeprime"` đã có sẵn ở [app.json:7](../../apps/mobile/app.json#L7).
2. Callback thấy `client=native` → thay vì `Set-Cookie`, mint one-time code (TTL 60s) và redirect về deep link.
3. App gọi `POST /auth/social/exchange { code, code_verifier }` → `MobileSessionDto`, dùng lại `NativeSessionService.issueSession` không sửa gì.

**Hai điều bắt buộc khi làm bước đó** (ghi ở đây để không quên):

- **PKCE giữa app ↔ backend, không chỉ backend ↔ provider.** Trên Android custom scheme không độc quyền: một app khác đăng ký `xeprime://` có thể cướp one-time code. Code bị cướp mà không có `code_verifier` thì vô dụng.
- **Android App Links / iOS Universal Links** (`https://xeprime.vn/auth/callback`) thay custom scheme — hệ điều hành xác minh quyền sở hữu domain.
- **Sign in with Apple**: App Store **từ chối duyệt** app iOS có Google/Facebook mà không có Apple. Là OIDC chuẩn nên chỉ thêm một `SocialProvider`, không thêm kiến trúc. Lưu ý Apple chỉ trả tên/email ở **lần đăng nhập đầu tiên** — không lưu ngay là mất vĩnh viễn.

## 6. Dọn dẹp

Xoá: `apps/api/src/modules/auth/token-verifier.ts` · `POST /auth/session` + `CreateSessionDto` · `authApi.createSession` trong [packages/api-client/src/features/auth/api.ts](../../packages/api-client/src/features/auth/api.ts) · `firebase-social-auth.ts` + test · `AUTH_MODE` khỏi env schema và `.env.example`.

Viết lại: [auth-social.spec.ts](../../apps/api/test/auth-social.spec.ts) (5 test đang dựng identity qua mock ID token → chuyển sang gọi thẳng `upsertUserFromIdentity`, **giữ nguyên 5 kịch bản** vì chúng khoá đúng luật nối tài khoản mà ta cố ý không đổi) · [env-session-cors.spec.ts](../../apps/api/test/env-session-cors.spec.ts) (có assert về `AUTH_MODE`) · `AuthModal.test.tsx`.

i18n — namespace `Auth`, cả `vi` và `en` ở `packages/domain/messages/`: 11 khoá `socialError.*` nói bằng ngôn ngữ Firebase (`popupBlocked`, `unauthorizedDomain`, `operationNotAllowed`…) không còn nghĩa. Thay bằng 4 mã ở §4.7 + `Errors` namespace. Skill `i18n` bắt buộc, và `i18n:check` canh parity vi↔en.

`docs/`: cập nhật [CODEMAP.md](../CODEMAP.md), thêm ghi chú vào [ADR 0002](../decisions/0002-auth-session-cookie.md) rằng phần "Firebase là provider" nay chỉ còn đúng với chat, và cập nhật [completion-roadmap.md](../completion-roadmap.md).

**Nên viết ADR 0019** cho quyết định này — nó ghi đè một phần ADR 0002 và là loại quyết định đúng tầm ADR (đổi nguồn danh tính, có phương án thay thế đã cân nhắc).

## 7. Thứ tự thực hiện

1. `packages/types`: `AUTH_PROVIDER` + 4 mã lỗi mới. `packages/domain`: `isSafeNextPath`.
2. Prisma: `OauthState` + migration.
3. `AuthService`: tách `upsertUserFromIdentity`; sửa `auth-social.spec.ts` — **xanh trước khi đi tiếp**.
4. Module `social/`: provider registry + Google + Facebook + state service.
5. Controller + env + mã lỗi + tag OpenAPI. Sinh lại `openapi.json` → `api.generated.ts` (ADR 0007).
6. Web: `social-auth-url.ts`, sửa `AuthPanel`, đọc `?authError=`, xoá file Firebase.
7. i18n vi+en, sửa test web.
8. Gỡ `/auth/session`, `token-verifier.ts`, `AUTH_MODE`.
9. Docs + ADR 0019.

Bước 3 là chốt chặn: nếu 5 test kia còn xanh thì luật nối tài khoản chưa bị đổi.

## 8. Verify

Theo skill `verify-changes` — chỉ chạy phạm vi đã sửa, không quét cả workspace.

```bash
pnpm --filter @xeprime/api test          # + social-auth.spec.ts mới; openapi-contract.spec.ts phải xanh
pnpm --filter @xeprime/web test
pnpm --filter @xeprime/web i18n:check    # parity vi↔en
pnpm run typecheck
pnpm --filter @xeprime/web lint && pnpm --filter @xeprime/api lint
```

Test tự động cần có:

- **API**: state dùng-một-lần (gửi lại `state` cũ → `SOCIAL_STATE_INVALID`); state hết hạn; `next` không an toàn bị bỏ qua, không redirect ra ngoài; Facebook `debug_token` trả `app_id` lạ → `SOCIAL_EXCHANGE_FAILED`; provider chưa cấu hình → `SOCIAL_NOT_CONFIGURED`; callback lỗi trả **302 chứ không phải JSON**.
- **Web**: bấm Google điều hướng tới đúng URL kèm `next` **đã lọc bỏ** `auth`/`next`/`authError`; hạ cánh có `?authError=` thì mở modal kèm Alert đúng ngôn ngữ.

Kiểm tay (cần OAuth client thật — Google và Facebook đều cho phép `http://localhost` ở chế độ dev):

1. Tạo Google OAuth client (Web application), redirect URI `http://localhost:4000/auth/social/google/callback`.
2. Đăng nhập Google từ trang chi tiết xe → phải quay lại **đúng trang đó**, đã đăng nhập, modal không mở lại.
3. Đăng ký bằng SĐT/OTP trước, rồi đăng nhập Google **cùng email** → phải vào **cùng một tài khoản**, `user_identities` có 2 dòng, `users` chỉ có 1.
4. Bấm huỷ ở màn đồng ý của Google → về web kèm thông báo huỷ, không phải trang lỗi.
5. `FIRESTORE_ENABLED=true` → chat realtime vẫn chạy sau khi đã gỡ hết Firebase Auth khỏi login. Đây là phép thử của cả kế hoạch.
