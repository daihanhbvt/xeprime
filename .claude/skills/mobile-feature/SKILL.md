---
name: mobile-feature
description: Building or modifying features in the XePrime mobile app (apps/mobile - React Native / Expo). Load this skill before writing mobile code to ensure architecture alignment, API contract reuse, state management, domain rules, offline handling, and native-first UX.
---

# Building Mobile Features the XePrime Way

You are developing the **XePrime Mobile Application** (React Native / Expo) within the XePrime Monorepo. 
Your primary objective is to replicate the business logic, UI capabilities, and security boundaries established on the XePrime Web Platform, while adhering to mobile-first ergonomics and native mobile best practices.

---

## 0. What this app IS

**`apps/mobile` is `apps/web` ported to native — the SAME product, not a second one.** Every
screen, rule, status transition, permission check, price calculation, and validation message is
already decided in the web app and the ADRs. Your job is to render that on native, not to
redesign it.

* **Do not change business logic.** If the web flow requires an approval step, the mobile flow
  has that step. When mobile seems to need different rules, that is a signal you misread the web
  flow — read `apps/web/src/features/<same-feature>` before writing anything.
* **Read the web feature first.** Its `api.ts`, `types.ts`, and hooks are the specification.
  Port them; do not re-derive them from the API docs.
* **Differences are allowed only in PRESENTATION and PLATFORM affordances** — navigation shape,
  touch targets, camera/biometrics/push, offline behaviour, infinite scroll instead of a pager.
  Never in what the data means or what the user is allowed to do.
* **Two exceptions ARE by design**, each isolated to one file: the auth transport (native sends
  `Authorization: Bearer` per ADR 0017, web sends an httpOnly session cookie per ADR 0002) and
  the API base URL. The transport difference is why auth has its own `/auth/mobile/*` endpoints —
  see §3C. It changes how the session travels, **not** who may log in or what they may then do.

---

## 1. Core Architecture & Monorepo Reuse

Never reinvent logic that is already canonical in the monorepo:

* **API Contracts & Types**: Always import generated types and status enums from `@xeprime/types` (e.g. `BOOKING_STATUS`, `VEHICLE_STATUS`, `api.generated.ts`). Never hand-craft DTO types or use raw status strings.
* **Shared Logic**: Consume domain helpers (`rental-busy.ts`, `long-term.ts`, `money.ts`, `datetime.ts`) from `@xeprime/domain` or `@xeprime/types`.
* **API Client**: Consume endpoints and TanStack Query keys from `@xeprime/api-client`.
* **Design Tokens**: `XP_TOKENS` in `@xeprime/ui` is the SINGLE source for colors, typography, radii, spacing and shadows across every client (ADR 0003). On native, consume them through `src/theme/tokens.ts` (`colors`, `space`, `radius`, `fontSize`, `fontWeight`, `sizing`) and `src/theme/elevation.ts` — those files translate CSS-flavoured token values into React Native ones. Never write a hex code or a raw size into a component, and never start a local palette: the last one drifted until native primary was black while web was gold.
* **UI Strings**: The message root is `@xeprime/domain/messages/{vi,en}`, shared verbatim with `apps/web` — one key, one translation. `src/i18n/messages.ts` is only a gather table; add the namespace a feature already owns (`bookings`, `vehicles`, …) rather than copying strings. `mobile-shell` is for the native shell alone (app-level error, not-found, root navigation). Declare new namespaces in `apps/web/src/i18n/namespaces.ts` and run `pnpm --filter @xeprime/web i18n:check`.

```
apps/mobile/
├── src/
│   ├── app/ (Expo Router / Navigation stacks)
│   ├── features/
│   │   ├── auth/
│   │   ├── marketplace/
│   │   ├── bookings/
│   │   ├── vehicles/
│   │   ├── handovers/
│   │   ├── calendar/
│   │   ├── finance/
│   │   ├── customers/
│   │   └── chat/
│   ├── components/ (Shared mobile UI components: Button, Input, Modal, Card, StatusBadge)
│   ├── hooks/ (usePermissions, useNetworkState, useAuth)
│   ├── services/ (Notification, Storage/R2, Camera)
│   ├── i18n/ (use-intl provider + gather table over @xeprime/domain/messages)
│   └── theme/ (native adapter over XP_TOKENS from @xeprime/ui)
```

---

## 2. State Management Boundaries

Adhere strictly to the state architecture:

1. **Server State (TanStack Query)**:
   * All data originating from the NestJS backend must be queried and mutated via TanStack Query.
   * Key management must use shared `queryKeys`.
   * On mutation success, invalidate exact query sub-trees.
   * Provide optimistic updates where appropriate for instant tactile feedback (e.g. chat messages, toggle states).

2. **Form State (React Hook Form + Yup)**:
   * Use `react-hook-form` paired with `@hookform/resolvers/yup` and schemas from `@xeprime/validators`.
   * Form state is strictly local to the active screen/modal; never persist raw form inputs to global state.

3. **Client UI State (Redux Toolkit)**:
   * Redux only, not Zustand — ADR 0004 keeps Redux for this app.
   * It holds UI state the user chose and nothing else: active locale today, later things like a
     collapsed panel or a selected view mode. Each slice is owned by the feature that created it.
   * **Never put tokens in Redux.** The access token lives in a module variable inside
     `src/lib/auth-session.ts` (memory only, 15 min) and the refresh token only in
     Keychain/Keystore — ADR 0017. A store is serialisable, inspectable and often persisted;
     every one of those properties is wrong for a credential.
   * **Never mirror server data into Redux** — the user profile, permissions and tenant scope come
     from `useCurrentUser()` (TanStack Query), which re-reads them from the API. Copying them into
     a store creates a second truth that goes stale exactly when permissions are revoked.

4. **Screen Filters & Search State**:
   * On mobile, there is no browser URL bar. Store active filter states in local screen state or navigation params (`route.params`), allowing state to preserve when navigating backward.

---

## 2b. Navigation — one route map, one namespace per domain

Route paths live in the `app/` file tree, so a raw `router.push('/listings/...')` scattered across
components is an untyped string that silently breaks when a file is renamed. **Never write a route
path literal in a component.** Every destination comes from `apps/mobile/src/navigation/routes.ts`:

```ts
export const ROUTES = {
  explore: {
    home: (): Href => '/explore',
    listingDetail: (vehicleId: string, serviceType?: string): Href => ...,
  },
  booking: { list: (): Href => '/trips' },
  account: { home: (): Href => '/account', login: (): Href => '/login' },
} as const;
```

Rules:

* **One namespace per domain** — `explore`, `booking`, `chat`, `account`, `vehicles`, `calendar`,
  `finance`, ... matching `src/features/<domain>`. Adding a domain means adding a namespace, never
  appending to a flat object: flat stops being readable after two phases, and nobody can tell which
  screen belongs to which feature.
* **Each entry is a function returning `Href`**, not a string constant. Params go through the
  function signature so they cannot be forgotten, and the params shape is built in exactly one
  place. Param types (e.g. `ExploreSearchParams`) live next to the namespace that uses them.
* **Call it from every navigation site** — `router.push`, `router.replace`, `<Redirect href>`,
  `<Link href>`, and `useNavigateOnce()`. Pushes still go through `useNavigateOnce` (§4): the route
  map decides WHERE, that hook decides HOW MANY TIMES.
* **Adding a screen = adding a file under `app/` AND an entry in its namespace** in the same
  change. A route that exists only as a file is one the rest of the app has no typed way to reach.

---

## 3. Mobile-Specific Adaptations (Web vs Mobile)

Certain web patterns must be re-architected for touchscreens and small viewports:

### A. Calendar & Scheduling (CAL-01)
* **Web**: 1000px+ horizontal resource-timeline with virtualized drag-and-drop.
* **Mobile**: Redesign into **Agenda View**, **Day/Week View**, or **Vehicle Availability Card List**.
* Tapping a date or vehicle opens a quick bottom sheet showing current occupancies (bookings, maintenance, blocks). Do not attempt to port the 2D grid drag-and-drop to a 375px mobile screen.

### B. Vehicle Handovers & Photos (BKG-09)
* **Web**: `<input type="file">`.
* **Mobile**: Native Camera with instant preview, corner guides for vehicle exterior angles (Front, Rear, Left, Right, Interior, Odometer), client-side JPEG compression, and direct upload to Cloudflare R2 via presigned URLs.

### C. Authentication — the ONE endpoint family that differs from web

Everything else in this app calls the **same endpoints as web**. Auth is the single exception,
and it is an exception about **transport, not about rules**: web carries the session in an
httpOnly cookie (ADR 0002), native carries it in `Authorization: Bearer` (ADR 0017). Same users,
same passwords, same permissions, same lockout rules, same error codes — a different envelope.

Because a cookie cannot be set for a native app and a token must not be handed to a browser, the
two need separate endpoints. They are pairs, not alternatives:

| Việc | Web | Native |
| --- | --- | --- |
| Đăng nhập mật khẩu | `POST /auth/login` → đặt cookie | `POST /auth/mobile/login` → trả `{ tokens, user }` |
| Đăng ký | `POST /auth/register` → đặt cookie | `POST /auth/mobile/register` → trả `{ tokens, user }` |
| Khách vãng lai đặt xe (tự đăng nhập) | `POST /public/booking-requests` → đặt cookie | cùng route + `client: "native"` → `receipt.session` |
| Đăng nhập SĐT + OTP | `POST /auth/phone/login` → đặt cookie | `POST /auth/mobile/phone/login` → trả `{ tokens, user }` |
| Đăng nhập Google/Facebook | `GET /auth/social/:provider` → đặt cookie | cùng route + `?client=native&code_challenge=…&redirect_uri=…` → one-time code ở deep link → `POST /auth/mobile/social/exchange` |
| Gia hạn phiên | cookie tự gia hạn | `POST /auth/mobile/refresh` — xoay refresh token |
| Đăng xuất | `DELETE /auth/session` | `POST /auth/mobile/logout` — thu hồi theo thiết bị |
| Hồ sơ + quyền | `GET /auth/me` | **cùng endpoint**, đọc DB mỗi lần gọi |

`GET /auth/me` dùng chung là chi tiết quan trọng: quyền và tenant scope **không bao giờ** là claim
trong token, ở cả hai nền tảng. Thu hồi quyền phải có hiệu lực ngay mà không cần đăng nhập lại.

Never call the web endpoints from native — `/auth/login` sets a cookie React Native's fetch will
not persist reliably, so it looks like it worked and then the session vanishes on next launch.
The reverse is worse: `/auth/mobile/*` returns tokens in the body, and a browser has no
`httpOnly` to protect them with.

**Already built — do not reimplement it per feature.** `src/lib/auth-session.ts` owns the token
lifecycle and `src/lib/api-client.ts` wires it into the shared client. A feature calls `apiGet`;
the Bearer header, the refresh and the retry happen underneath.

* Native sends **`Authorization: Bearer <accessToken>`** — never a session cookie (that is the
  web transport, ADR 0002).
* **Access token in memory only** (15 min). **Refresh token only in Keychain/Keystore** via
  `expo-secure-store` — never `AsyncStorage`, `localStorage`, or redux-persist.
* Refresh is **rotating and single-flight**: parallel 401s must produce exactly ONE call to
  `/auth/mobile/refresh`, or the server sees a reused refresh token, treats it as theft, and
  revokes the whole session.
* **A 401 is routine, not a logout** — it happens every 15 minutes. Two layers handle it:
  proactive (refresh before `exp`) and reactive (`onUnauthorized` retries once when the server
  rejects earlier than the device clock expects). Logout happens only when the refresh itself is
  rejected. A network error during refresh must NOT clear the session.
* Social sign-in (Google/Facebook, plus **Apple Sign-In — mandatory for iOS App Store review**)
  goes through the backend-led OAuth flow, not a provider SDK — it is **built and ready**:
  1. generate PKCE, keep `codeVerifier` in memory (never on disk);
  2. `WebBrowser.openAuthSessionAsync(…/auth/social/:provider?client=native&code_challenge=…&redirect_uri=…)`;
  3. read `?code=` off the deep link, then `mobileAuthApi.exchangeSocialCode(authClient, { code, codeVerifier })`.

  The deep link carries a **one-time code, not tokens** — deep links are logged by the OS, and a
  60-day refresh token there is a long-lived secret written to disk. The code lives 60 seconds,
  is single-use, and a wrong `codeVerifier` burns it. `redirect_uri` must be in the API's
  `MOBILE_AUTH_REDIRECT_URIS` allowlist — Expo dev builds use `exp://…`, so that URI has to be
  added to the dev API's env; it is not accepted automatically. Errors come back on the same deep
  link as `?error=<code>`: read both, or the app freezes when the user cancels. Details in
  `docs/api-docs.md` §2.3 and ADR 0019 §8. Firebase is NOT part of this — it only serves chat
  (ADR 0009).

### D. Push Notifications (COM-07)
* Integrate Firebase Cloud Messaging (FCM) / APNs.
* Register device push tokens upon login via `POST /notifications/device-token`.
* Handle foreground banner alerts, background notification routing, and badge counts.

---

## 4. UI & Ergonomics Guidelines

The base already solves the three things every screen gets wrong — use them, don't rebuild them:

* **Thanh trên đi qua [`<AppHeader>`](../../../apps/mobile/src/components/layout/AppHeader.tsx)** —
  header DÙNG CHUNG của toàn app. Đừng dựng một hàng `XStack` riêng cho màn của bạn: thiếu biến
  thể thì thêm vào chính file đó. Nó tự cộng safe-area trên, nên `<Screen>` bên dưới phải khai
  `edges={['left', 'right', 'bottom']}`. Nền header không dùng màu thương hiệu — gold dành cho
  hành động, xem docblock trong file.
* **Wrap every screen in [`<Screen>`](../../../apps/mobile/src/components/layout/Screen.tsx).** It
  gathers safe area, keyboard avoidance and `keyboardShouldPersistTaps` in one place; miss one and
  you get text under the notch, a keyboard covering the input, or taps that need two presses. Pass
  `padded={false}` for edge-to-edge lists.
* **Loading / empty / error come from `src/components/state/`** — `ScreenLoading`, `ScreenMessage`,
  `ScreenError`. `ScreenError` already maps an API error to translated copy by CODE, so never print
  a backend `message`. But read §4b before reaching for `ScreenLoading`: it is the EXCEPTION, not
  the default.
* **Sizes and colors come from `src/theme/tokens.ts`** (`space`, `radius`, `fontSize`,
  `fontWeight`, `sizing`, `colors`). `sizing.touchTarget` is the 44pt/48dp floor — use it rather
  than typing a number.

Beyond that:

* **Haptics**: use `expo-haptics` for consequential actions (confirming a booking, approving a
  request, submitting a handover) — not for ordinary navigation.
* **Platform differences**: small ones use `Platform.select` inline; large ones (different JSX
  tree, separate native API) split into `<Name>.ios.tsx` / `<Name>.android.tsx`.

---

## 4b. Skeletons — every screen whose shape you already know

A spinner says "wait"; a skeleton says "this is what is coming, and it will land HERE". On a screen
whose layout is known before the data arrives — which is nearly all of them — the spinner is the
worse choice twice over: it tells the user nothing, and the page jumps when real content replaces
a 24px circle with a 600px body.

**Rule: a screen or section that fetches ships a skeleton in the same change as its happy path.**
A pull request that adds a fetching surface without one is incomplete, exactly like one missing its
empty state. `ScreenLoading` (a spinner) is reserved for the rare surface whose shape genuinely
cannot be known in advance.

Skeletons live in [`src/components/ui/Skeleton.tsx`](../../../apps/mobile/src/components/ui/Skeleton.tsx):

| Piece | For |
| --- | --- |
| `Skeleton` | One block. `width`/`height`/`round` — the primitive the rest are built from |
| `SkeletonText` | A paragraph: lines of uneven width, last one short |
| `VehicleCardSkeleton` | A vehicle card, same photo ratio and line count as the real one |
| `ListRowSkeleton` | A list row (province, shop) |
| `ListingDetailSkeleton` | The vehicle detail page |
| `ProfileSkeleton` | Account: avatar + identity + setting rows |

Writing a new one:

* **Match the real layout, not a generic grey rectangle.** Same heights, same gaps, same number of
  rows. The point is that nothing MOVES when data lands. If the skeleton and the real component
  drift apart, the page jumps — so build the skeleton next to the component it stands in for, and
  update both together (§7).
* **Add it to `Skeleton.tsx`**, do not inline it in the screen. The next screen with that shape
  reuses it, and the pulse timing stays identical everywhere.
* **Remote images need their OWN waiting state**, separate from the API call. A list arriving does
  not mean its images arrived: `<Image>` with a remote `uri` paints an empty box until the last
  byte lands, which on a full-width banner reads as a broken white screen. Keep a skeleton under
  the image until `onLoad`, and clear it on `onError` too — a pulse that never stops promises a
  picture that is never coming. See `BannerSlide` in `HomeHero.tsx`.
* **Pagination footers** use the skeleton of the row being appended, not a spinner: the next page
  is vehicle cards, so say so.

---

## 4c. Motion — durations from tokens, transitions from the navigator

Timings come from [`src/theme/motion.ts`](../../../apps/mobile/src/theme/motion.ts) — `duration`
(`fast` / `base` / `slow` / `pulse`) and `easing.standard`. Never type a raw millisecond count:
scattered numbers is how one screen ends up a third slower than the next for no reason.

* **Screen transitions belong to the navigator, not to screens.** Configured once in
  `app/_layout.tsx`: `ios_from_right` for pushes (direction teaches depth — in from the right,
  back to the left), `slide_from_bottom` for `login` (a task that interrupts and returns, not a
  level deeper), `fade` into `(tabs)`. Tabs cross-fade rather than slide: tabs are PEERS, and a
  horizontal slide would imply a swipeable strip that does not exist.
* **`ios_from_right`, not `slide_from_right`** — the difference is the OUTGOING screen, and it
  shows up on BACK. `slide_from_right` holds the old screen still while the new one slides over
  it, so popping snaps the underlying screen back in one piece and reads as a flicker.
  `ios_from_right` moves both with parallax and a dim, so the motion is continuous end to end.
  The name means "iOS-style", not "iOS-only". Do not set `animationDuration` on it: it follows the
  platform curve, and forcing a linear timing on top makes it worse.
* **Do NOT set `freezeOnBlur` — on the Stack OR on the Tabs.** It sounds free (a covered screen
  stops rendering), but the bill arrives on BACK: the screen underneath rebuilds its whole tree in
  one frame in the middle of the pop animation. That is the exact signature — push smooth, pop
  janky. Tabs are not exempt: the `(tabs)` group IS the screen sitting underneath when you push a
  detail screen from a tab, so freezing there moves the thaw one level down without removing it.
* **Push smooth + pop janky is never the animation curve** — it is work happening as the screen
  underneath comes back. Isolate before changing anything: set `animation: 'none'` for one run.
  Still janky means it is render cost (a thaw, a refetch, a layout pass), and no amount of tuning
  the transition will fix it.
* **Touch feedback animates over time.** Flipping `opacity` in `style={({pressed}) => …}` is a
  jump cut; on a large surface it reads as the screen blinking. `Card` presses in and springs back
  on the UI thread — reuse `Card` rather than re-deriving this per screen.
* **Reanimated only, never `Animated` from `react-native`.** The JS-thread driver stutters exactly
  when the thread is busy — which is precisely when an animation is running.
* **Judge smoothness on a release build.** A dev bundle runs unoptimised with Metro attached; jank
  there is not evidence of jank in production.

## 5. Security & Domain Invariants

* **Tenant Scope**: Always rely on the backend `TenantScopeGuard` to resolve `tenant_id`. Never allow client-side spoofing.
* **No Uncontrolled String Enums**: Always use status constants (`BOOKING_STATUS.ACTIVE`, not `'active'`).
* **Currency Formatting**: Format money using `@xeprime/domain` string-safe helpers to avoid floating-point inaccuracies.
* **Masked PII**: Respect platform masking policies for customer phones and emails.

---

## 6. Comment Discipline

Comments explain **why**, never **what**. The code already says what it does.

Write a comment only when a reader who knows React Native would otherwise get it wrong:

* A **trap** — code that looks redundant or wrong but is load-bearing (a side-effect import, a config flag that breaks pnpm resolution if flipped).
* A **domain invariant** — cite the ADR (`ADR 0011: ngày trả = ngày nhận + N tháng lịch, không phải N×30`).
* A **non-obvious choice** where the obvious alternative is broken, with the failure named.

Do **not** write:

* Docblocks that restate the signature or the JSX tree (`/** QueryClient dùng chung cho toàn app. */`, `/** Root layout — dựng các provider. */`).
* Comments on self-evident config (`staleTime: 30_000, // cache 30 giây`).
* Section banners, `// ===== Helpers =====`, author/date headers.
* Placeholder comments for features not written yet (`// TODO: booking sẽ vào đây`).

Prefer a better name over a comment. Prefer deleting the comment over updating it.

Keep the form tight: one or two lines, inline, directly above what it explains. A `/** */` block is for an exported symbol whose contract is genuinely not obvious — not for narration.

**Example — cut this:**

```ts
/**
 * QueryClient dùng chung cho toàn app.
 *
 * `refetchOnWindowFocus` tắt vì React Native không có window focus — refetch khi app
 * trở lại foreground (AppState) và khi có mạng lại (NetInfo) sẽ được cắm cùng feature
 * đầu tiên gọi API.
 */
export const queryClient = new QueryClient({ ... });
```

**Down to this:**

```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // React Native không có window focus — refetch theo AppState/NetInfo cắm sau.
      refetchOnWindowFocus: false,
    },
  },
});
```

---

## 7. When You Change Shape, Fix What Describes It

Writing a feature touches code only. Changing **shape** — adding, deleting, renaming or moving a
module; changing how a layer is wired; changing a boundary — also invalidates the files that
*describe* that shape, and nothing in the toolchain will tell you.

**A stale diagram is worse than no diagram.** This already happened here: after the interceptor
layer was deleted, `apps/mobile/README.md` still drew `SessionBoundary → đăng ký errorInterceptor
401`. The next reader either hunts for a module that no longer exists, or rebuilds it — and
rebuilding that particular one reintroduces the reset-refetch-401 loop the new design removed.
Typecheck cannot catch this. Only you can.

Ask after every change: **did the shape change, or only the behaviour inside it?** If the shape
changed, update the row that applies:

| What you changed | Also update |
| --- | --- |
| Added / deleted / renamed a module in `src/lib` or `src/features/*` | `apps/mobile/README.md` — folder table **and** any mermaid diagram naming it · `docs/CODEMAP.md` |
| Added a variant to `AppHeader`, or a component to `src/components/ui/` | `apps/mobile/README.md` §8 · §4 of this skill — nếu không, màn tiếp theo sẽ dựng lại chính thứ bạn vừa thêm |
| How the API client is configured, or what `@xeprime/api-client` exposes | `packages/api-client/README.md` · `apps/mobile/README.md` §4 · §1 of this skill |
| The auth / token / session flow | `apps/mobile/README.md` §5 — diagram **and** the numbered rules · `packages/api-client/README.md` · §3C of this skill |
| A state boundary (what belongs in Redux vs TanStack Query vs RHF) | §2 of this skill |
| Design tokens, or how native reads them | `packages/ui` · `src/theme/*` · §1 of this skill |
| Added a message namespace | `apps/web/src/i18n/namespaces.ts` · both gather tables · run `i18n:check` |
| A decision that contradicts an existing doc | Write an **ADR** in `docs/decisions/`. Per CLAUDE.md the ADR wins over every other document — editing prose without one leaves two docs disagreeing |
| Finished a phase or milestone | `docs/completion-roadmap.md` · `docs/mobile-readiness-audit.md` |

**Verify instead of remembering.** After deleting or renaming anything exported, grep the docs for
the old name — the point is to find *prose and diagrams*, which no compiler checks:

```bash
rg -n 'OldName|old-file-name' apps/mobile/README.md packages/*/README.md docs/ .claude/ CLAUDE.md
```

Two habits that keep this cheap:

* **Delete beats update.** If a paragraph exists only to explain what the code used to be, remove
  it — git history already holds it, and archaeology in a README rots faster than anything else.
* **Docs go in the same commit as the change.** A follow-up commit "fix docs" never arrives, and
  in between, the repository is actively lying to whoever reads it next.

---

## 8. Pre-Commit Verification Checklist

Before considering a mobile feature complete:

1. `pnpm --filter @xeprime/mobile typecheck` — 0 TypeScript errors.
2. `pnpm --filter @xeprime/mobile lint` — 0 lint errors.
3. `pnpm --filter @xeprime/mobile test` — green.
4. **If you touched `packages/*`, run the web suite too**: `pnpm --filter @xeprime/web test`. The
   API client, design tokens and message root are shared — a change that looks mobile-only can
   break 1600 web tests.
5. **If you added or changed user-facing text**: `pnpm --filter @xeprime/web i18n:check`. It
   checks vi↔en parity across the shared root and validates the native gather table.
6. Test all 4 screen states: loading, populated, empty, network error.
7. Test keyboard interaction and safe area insets on both iOS and Android.
8. Verify API contracts against `@xeprime/types/src/api.generated.ts` — never hand-write a DTO.
9. **If the shape changed, §7 applies** — the docs describing it ship in this same commit.
