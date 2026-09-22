# Chuyển đổi native: lịch, ảnh bàn giao, đăng nhập, thông báo đẩy

> Tài liệu tham chiếu của skill `mobile-feature`. Đọc khi công việc chạm tới phần này.

## Tổng quan

Certain web patterns must be re-architected for touchscreens and small viewports:

### A. Calendar & Scheduling (CAL-01)
* **Web**: 1000px+ horizontal resource-timeline with virtualized drag-and-drop.
* **Mobile**: redesign into an **Agenda view**, a **Day/Week view**, or a **vehicle availability
  card list**.
* Tapping a date or a vehicle opens a quick bottom sheet showing current occupancies (bookings,
  maintenance, blocks). Do not attempt to port the 2D grid drag-and-drop to a 375px screen.

### B. Vehicle Handovers & Photos (BKG-09)
* **Web**: `<input type="file">`.
* **Mobile**: native camera with instant preview, corner guides for exterior angles (front, rear,
  left, right, interior, odometer), client-side JPEG compression, and direct upload to Cloudflare
  R2 via presigned URLs.
* **⚠️ CHỤP đi qua `captureInAppPhoto()` (`src/features/camera/`), NEVER `ImagePicker.launchCameraAsync`.**
  The system camera Intent backgrounds XePrime, and Android kills it there to reclaim RAM — the app
  relaunches to a white screen at the root route and the photo is gone (`getPendingResultAsync()`
  returns `null`). Measured on a Galaxy A23: `am_kill` in logcat and a changed PID. Picking from the
  LIBRARY still uses `ImagePicker` — that picker runs inside the calling process.
* **⚠️ The presigned PUT signs `Content-Length` — measure the bytes you are ABOUT TO SEND.**

  The API passes `ContentLength` to `PutObjectCommand`, and `content-length` is a signable header,
  so it lands in `X-Amz-SignedHeaders`. Declare one number at presign time and send a different
  one at PUT time and R2 answers **403** — a signature mismatch that reads exactly like a CORS
  problem, an expired URL, or a permissions bug, and is none of them.

  This bites native and not web, because native COMPRESSES between picking and sending. The size
  the image picker reports belongs to the original camera file; the bytes on the wire are the
  compressed ones. Web sends the very `File` it measured, so it never diverges.

  The fix is structural, not arithmetic: **open the file first, presign with `blob.size`, then PUT
  that same blob.** One read, one number, no second value to drift. See `uploadHandoverPhoto` in
  `src/features/handovers/photo-upload.ts`; the server then re-checks the size by HEAD before
  marking the file `ready`, so a wrong number fails twice.

  Related: `ImageManipulator` `resize: { width: N }` means "set to N", not "cap at N". Feeding it
  an 800px photo UPSCALES to 1600 — larger and blurrier, the opposite of compressing. Resize only
  when `asset.width > MAX_WIDTH`.

### C. Authentication — the ONE endpoint family that differs from web

Everything else in this app calls the **same endpoints as web**. Auth is the single exception, and
it is an exception about **transport, not about rules**: web carries the session in an httpOnly
cookie (ADR 0002), native carries it in `Authorization: Bearer` (ADR 0017). Same users, same
passwords, same permissions, same lockout rules, same error codes — a different envelope.

Because a cookie cannot be set for a native app and a token must not be handed to a browser, the
two need separate endpoints. They are PAIRS, not alternatives:

| Task | Web | Native |
| --- | --- | --- |
| Password login | `POST /auth/login` → sets cookie | `POST /auth/mobile/login` → returns `{ tokens, user }` |
| Register | `POST /auth/register` → sets cookie | `POST /auth/mobile/register` → returns `{ tokens, user }` |
| Guest booking (self-login) | `POST /public/booking-requests` → sets cookie | same route + `client: "native"` → `receipt.session` |
| Phone + OTP login | `POST /auth/phone/login` → sets cookie | `POST /auth/mobile/phone/login` → returns `{ tokens, user }` |
| Google/Facebook login | `GET /auth/social/:provider` → sets cookie | same route + `?client=native&code_challenge=…&redirect_uri=…` → one-time code on the deep link → `POST /auth/mobile/social/exchange` |
| Session renewal | cookie renews itself | `POST /auth/mobile/refresh` — rotates the refresh token |
| Logout | `DELETE /auth/session` | `POST /auth/mobile/logout` — revokes per device |
| Profile + permissions | `GET /auth/me` | **same endpoint**, reads the DB on every call |

The shared `GET /auth/me` is the important detail: permissions and tenant scope are **never** a
claim inside the token, on either platform. Revoking a permission must take effect immediately,
without a re-login.

Never call the web endpoints from native — `/auth/login` sets a cookie React Native's fetch will not
persist reliably, so it looks like it worked and then the session vanishes on the next launch. The
reverse is worse: `/auth/mobile/*` returns tokens in the body, and a browser has no `httpOnly` to
protect them with.

**Already built — do not reimplement it per feature.** `src/lib/auth-session.ts` owns the token
lifecycle and `src/lib/api-client.ts` wires it into the shared client. A feature calls `apiGet`; the
Bearer header, the refresh and the retry happen underneath.

* Native sends **`Authorization: Bearer <accessToken>`** — never a session cookie (that is the web
  transport, ADR 0002).
* **Access token in memory only** (15 min). **Refresh token only in Keychain/Keystore** via
  `expo-secure-store` — never `AsyncStorage`, `localStorage`, or redux-persist.
* Refresh is **rotating and single-flight**: parallel 401s must produce exactly ONE call to
  `/auth/mobile/refresh`, or the server sees a reused refresh token, treats it as theft, and revokes
  the whole session.
* **A 401 is routine, not a logout** — it happens every 15 minutes. Two layers handle it: proactive
  (refresh before `exp`) and reactive (`onUnauthorized` retries once when the server rejects earlier
  than the device clock expects). Logout happens only when the refresh itself is rejected. A network
  error during refresh must NOT clear the session.
* Social sign-in (Google/Facebook, plus **Apple Sign-In — mandatory for iOS App Store review**) goes
  through the backend-led OAuth flow, not a provider SDK — and it is **built and ready**:
  1. generate PKCE, keep `codeVerifier` in memory (never on disk);
  2. `WebBrowser.openAuthSessionAsync(…/auth/social/:provider?client=native&code_challenge=…&redirect_uri=…)`;
  3. read `?code=` off the deep link, then `mobileAuthApi.exchangeSocialCode(authClient, { code, codeVerifier })`.

  The deep link carries a **one-time code, not tokens** — deep links are logged by the OS, and a
  60-day refresh token there is a long-lived secret written to disk. The code lives 60 seconds, is
  single-use, and a wrong `codeVerifier` burns it. `redirect_uri` must be in the API's
  `MOBILE_AUTH_REDIRECT_URIS` allowlist — Expo dev builds use `exp://…`, so that URI has to be added
  to the dev API's env; it is not accepted automatically. Errors come back on the same deep link as
  `?error=<code>`: read both, or the app freezes when the user cancels. Details in
  `docs/api-docs.md` §2.3 and ADR 0019 §8. Firebase is NOT part of this — it only serves chat
  (ADR 0009).

### D. Push Notifications (COM-07)
* Integrate Firebase Cloud Messaging (FCM) / APNs.
* Register device push tokens upon login via `POST /notifications/device-token`.
* Handle foreground banner alerts, background notification routing, and badge counts.

---
