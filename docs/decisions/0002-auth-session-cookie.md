# ADR 0002 — Session bằng httpOnly cookie do NestJS phát

Ngày: 22/07/2026 · Trạng thái: Accepted (phần "Firebase là provider" đã bị **[ADR 0019](0019-backend-led-social-oauth.md)** ghi đè — 26/08/2026)

> ⚠️ **Phần còn đúng nguyên vẹn:** session là httpOnly cookie do NestJS phát, quyền không nằm
> trong token, và Firebase chỉ được phép xuất hiện sau một interface.
>
> **Phần đã đổi:** vòng OAuth không còn chạy trong trình duyệt. Không còn
> `signInWithPopup`, không còn `POST /auth/session`, không còn `AUTH_MODE`. Backend tự chạy
> authorization code + PKCE ở `GET /auth/social/:provider` và đặt cookie ngay tại chặng callback
> — xem ADR 0019. Firebase nay chỉ phục vụ chat realtime (ADR 0009).
>
> Đoạn "Luồng" bên dưới giữ nguyên như bản gốc để đọc được lịch sử quyết định; nó **không** mô tả
> hệ thống hiện tại.

## Bối cảnh

Toàn bộ `docs/` **không có một chữ nào** về `cookie`, `httpOnly`, hay `middleware`. Tài liệu chỉ nói "Firebase Auth là provider → backend verify token → sync user vào MySQL", tức là ngầm định browser giữ Firebase ID token rồi gắn `Authorization: Bearer` vào mỗi request.

Ngầm định đó có 4 hệ quả tài liệu không lường:

1. ID token nằm trong JS memory/localStorage → **Server Component không đọc được** → mọi trang cần đăng nhập buộc phải client-render. Mất luôn lý do chọn Next.js App Router.
2. `middleware.ts` của Next không guard được route → phải redirect ở client, người dùng thấy nháy màn hình.
3. Token trong tầm với của JS → một lỗ XSS là mất token.
4. Firebase ID token hết hạn sau 1 giờ → phải tự viết refresh logic ở mọi nơi gọi API.

Đây là quyết định đắt nhất nếu retrofit: sửa sau khi đã có 50 màn hình nghĩa là sờ vào mọi trang.

## Quyết định

**NestJS phát httpOnly session cookie.** Firebase Auth chỉ dùng để lấy ID token đúng một lần lúc đăng nhập.

Luồng:

```text
Browser: signInWithPopup(Google/Facebook) → Firebase ID token
   ↓ POST /auth/session { idToken }   (một lần duy nhất)
NestJS: firebase-admin verifyIdToken()
        → upsert users + user_identities trong Postgres
        → ký session JWT của XePrime (chứa userId, không chứa quyền)
        → Set-Cookie: xp_session=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/
   ↓
Mọi request sau: cookie tự gửi kèm. AuthGuard đọc cookie, không đọc Bearer.
   ↓ DELETE /auth/session → xoá cookie
```

## Lý do

- Server Component và `middleware.ts` đọc được cookie → guard ở tầng route, không nháy màn hình, SEO đúng.
- `HttpOnly` → XSS không lấy được session.
- Vòng đời session do XePrime kiểm soát, không bị buộc theo 1 giờ của Firebase.
- Khi bỏ Firebase Auth sau này, chỉ phải thay đúng endpoint `POST /auth/session`. Phần còn lại của hệ thống không biết Firebase tồn tại.

## Ràng buộc bắt buộc

1. **Session JWT chỉ chứa `userId` + `sessionId`.** Không nhét role/permission/tenant_id vào token — nếu nhét thì thu hồi quyền sẽ không có hiệu lực cho tới khi token hết hạn. Quyền luôn đọc từ DB mỗi request (cache Redis sau MVP nếu cần).
2. **`tenant_id` không nằm trong cookie.** Scope tenant lấy từ `tenant_memberships` theo `userId`, đúng như lằn ranh bảo mật 1 trong `CLAUDE.md`.
3. Cookie `SameSite=Lax` + CSRF token cho request ghi (`POST`/`PATCH`/`DELETE`) nếu web và API khác origin. Nếu deploy cùng domain (`/api` reverse proxy) thì `Lax` là đủ.
4. `Secure` bắt buộc ở production; ở local dev cho phép tắt qua env.
5. Refresh: session cookie sống 7 ngày, sliding renewal khi còn dưới 1 ngày. Có bảng/`sessionId` để revoke được — cần cho chức năng "reset nhân viên" ở màn admin.

## Hệ quả

- `apps/api` cần `cookie-parser` + `@fastify/csrf` tương đương cho Express (`csurf` đã deprecated → dùng double-submit token tự viết hoặc `csrf-csrf`).
- `apps/web` gọi API bằng `credentials: 'include'`.
- `AuthGuard` viết dạng adapter: đọc credential từ cookie, verify bằng `SessionService`. Firebase Admin chỉ xuất hiện trong `FirebaseTokenVerifier`. Khi chưa có service account JSON, thay verifier bằng `MockTokenVerifier` — không phải sửa guard (khớp ghi chú ở `CLAUDE.md` mục 10).
- App native sau này: cho `AuthGuard` chấp nhận thêm nguồn `Authorization: Bearer <session jwt>`. Cùng một session, khác cách vận chuyển.
