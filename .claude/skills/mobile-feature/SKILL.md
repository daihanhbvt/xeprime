---
name: mobile-feature
description: Building or modifying features in the XePrime mobile app (apps/mobile - React Native / Expo). Load this skill before writing mobile code to ensure architecture alignment, API contract reuse, state management, domain rules, offline handling, and native-first UX.
---

# Building Mobile Features the XePrime Way

You are developing the **XePrime Mobile Application** (React Native / Expo) within the XePrime
monorepo. Your primary objective is to replicate the business logic, UI capabilities, and security
boundaries established on the XePrime Web Platform, while adhering to mobile-first ergonomics and
native mobile best practices.

---

## 0. What this app IS

**`apps/mobile` is `apps/web` ported to native — the SAME product, not a second one.** Every
screen, rule, status transition, permission check, price calculation, and validation message is
already decided in the web app and the ADRs. Your job is to render that on native, not to
redesign it.

* **Do not change business logic.** If the web flow requires an approval step, the mobile flow has
  that step. When mobile seems to need different rules, that is a signal you misread the web flow —
  read `apps/web/src/features/<same-feature>` before writing anything.
* **Read the web feature first.** Its `api.ts`, `types.ts`, and hooks are the specification. Port
  them; do not re-derive them from the API docs.
* **Differences are allowed only in PRESENTATION and PLATFORM affordances** — navigation shape,
  touch targets, camera/biometrics/push, offline behaviour, infinite scroll instead of a pager.
  Never in what the data means or what the user is allowed to do.
* **⚠️ NON-NEGOTIABLE RULE — web uses a SESSION COOKIE, the app uses a BEARER TOKEN.**

  ```
  apps/web    →  httpOnly cookie `xp_session`             (ADR 0002)
  apps/mobile →  Authorization: Bearer <accessToken>      (ADR 0017)
  ```

  No exceptions, no "just use the other one for now". Consequences you must remember:

  - **Never call a web endpoint from the app.** `/auth/login` sets a cookie React Native does not
    persist reliably — it *looks* like it worked, then the session vanishes on the next launch. The
    reverse is worse: `/auth/mobile/*` returns tokens in the body, and a browser has no `httpOnly`
    to protect them with.
  - **Only endpoints that ISSUE a session have two versions.** `AuthGuard` is registered globally
    and accepts both transports, so **every business API is shared** — do not go looking for, or
    create, a "mobile" variant for vehicles, bookings, calendar, or chat.
  - **Tokens never leave `src/lib/auth-session.ts`.** Features call `apiGet`; the Bearer header, the
    refresh, and the retry all happen underneath. Never read a token in a component, never put one
    in Redux, never write one to a log.
  - This is a difference in **how the session travels on the wire**, NOT in who may log in or what
    they may do afterwards. The business rules still follow web.

  Full endpoint table in §3C.

* **The second deliberate exception:** the API base URL (`EXPO_PUBLIC_API_URL`).
* **Clone from web by default; extract to a package only when BOTH apps use it.** Porting a web
  feature means copying its `api.ts`, `types.ts`, hooks and helpers into
  `apps/mobile/src/features/<same-name>` and adapting the presentation. A copy that only mobile
  uses stays in `apps/mobile` — moving it to `packages/*` gives it a second consumer to keep happy
  (`pnpm --filter @xeprime/web test` on every edit, a build step before Metro sees the change) and
  buys nothing back.

  What DOES belong in a package is what would otherwise drift into two disagreeing truths: the API
  contract (`@xeprime/types`, generated — ADR 0007), the HTTP client and query keys
  (`@xeprime/api-client`), business rules and money/time maths (`@xeprime/domain`), form schemas
  (`@xeprime/validators`), design tokens (`@xeprime/ui`), and UI strings
  (`@xeprime/domain/messages`). Rule of thumb: **duplicated LOOKS is fine, duplicated MEANING is
  not.** A styled list row rewritten for native is fine; a second copy of "how long is this rental"
  is not.

---

## 1. Core Architecture & Monorepo Reuse

Never reinvent logic that is already canonical in the monorepo:

* **API contracts & types**: always import generated types and status constants from
  `@xeprime/types` (e.g. `BOOKING_STATUS`, `VEHICLE_STATUS`, `api.generated.ts`). Never hand-craft
  a DTO type or use a raw status string.
* **Shared logic**: consume domain helpers (`rental-busy.ts`, `long-term.ts`, `money.ts`,
  `datetime.ts`) from `@xeprime/domain` or `@xeprime/types`.
* **API client**: consume endpoints and TanStack Query keys from `@xeprime/api-client`.
* **Design tokens**: `XP_TOKENS` in `@xeprime/ui` is the SINGLE source for colors, typography,
  radii, spacing and shadows across every client (ADR 0003). On native, consume them through
  `src/theme/tokens.ts` (`colors`, `space`, `radius`, `fontSize`, `fieldFontSize`, `fontWeight`,
  `iconSize`, `sizing`) and `src/theme/elevation.ts` — those files translate CSS-flavoured token
  values into React Native ones. Never write a hex code or a raw size into a component, and never
  start a local palette: the last one drifted until native primary was black while web was gold.
* **UI strings**: the message root is `@xeprime/domain/messages/{vi,en}`, shared verbatim with
  `apps/web` — one key, one translation. `src/i18n/messages.ts` is only a gather table; add the
  namespace a feature already owns (`bookings`, `vehicles`, …) rather than copying strings.
  `mobile-shell` is for the native shell alone (app-level error, not-found, root navigation).
  Declare new namespaces in `apps/web/src/i18n/namespaces.ts` and run
  `pnpm --filter @xeprime/web i18n:check`.

```
apps/mobile/
├── src/
│   ├── app/ (Expo Router / navigation stacks)
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
│   ├── components/ (shared mobile UI: Button, Input, Modal, Card, StatusBadge)
│   ├── hooks/ (usePermissions, useNetworkState, useAuth)
│   ├── services/ (Notification, Storage/R2, Camera)
│   ├── i18n/ (use-intl provider + gather table over @xeprime/domain/messages)
│   └── theme/ (native adapter over XP_TOKENS from @xeprime/ui)
```

---

## 2. State Management Boundaries

Adhere strictly to the state architecture:

1. **Server state (TanStack Query)**:
   * All data originating from the NestJS backend must be queried and mutated via TanStack Query.
   * Key management must use the shared `queryKeys`.
   * On mutation success, invalidate the exact query sub-trees.
   * Provide optimistic updates where appropriate for instant tactile feedback (chat messages,
     toggle states).

2. **Form state (React Hook Form + Yup)**:
   * Use `react-hook-form` paired with `@hookform/resolvers/yup` and schemas from
     `@xeprime/validators`.
   * Form state is strictly local to the active screen/modal; never persist raw form inputs to
     global state.

3. **Client UI state (Redux Toolkit)**:
   * Redux only, not Zustand — ADR 0004 keeps Redux for this app.
   * It holds UI state the USER chose and nothing else: the active locale today, later things like
     a collapsed panel or a selected view mode. Each slice is owned by the feature that created it.
   * **Never put tokens in Redux.** The access token lives in a module variable inside
     `src/lib/auth-session.ts` (memory only, 15 min) and the refresh token only in
     Keychain/Keystore — ADR 0017. A store is serialisable, inspectable and often persisted; every
     one of those properties is wrong for a credential.
   * **Never mirror server data into Redux** — the user profile, permissions and tenant scope come
     from `useCurrentUser()` (TanStack Query), which re-reads them from the API. Copying them into
     a store creates a second truth that goes stale exactly when permissions are revoked.

4. **Screen filters & search state**:
   * On mobile there is no browser URL bar. Store active filter state in local screen state or in
     navigation params (`route.params`), so it survives navigating back.

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
  `finance`, … matching `src/features/<domain>`. Adding a domain means adding a namespace, never
  appending to a flat object: flat stops being readable after two phases, and nobody can tell which
  screen belongs to which feature.
* **Each entry is a FUNCTION returning `Href`**, not a string constant. Params go through the
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
* **Mobile**: redesign into an **Agenda view**, a **Day/Week view**, or a **vehicle availability
  card list**.
* Tapping a date or a vehicle opens a quick bottom sheet showing current occupancies (bookings,
  maintenance, blocks). Do not attempt to port the 2D grid drag-and-drop to a 375px screen.

### B. Vehicle Handovers & Photos (BKG-09)
* **Web**: `<input type="file">`.
* **Mobile**: native camera with instant preview, corner guides for exterior angles (front, rear,
  left, right, interior, odometer), client-side JPEG compression, and direct upload to Cloudflare
  R2 via presigned URLs.
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

## 4. UI & Ergonomics Guidelines

The base already solves the three things every screen gets wrong — use them, don't rebuild them:

* **The top bar goes through [`<AppHeader>`](../../../apps/mobile/src/components/layout/AppHeader.tsx)** —
  the app-wide SHARED header. Do not build a private `XStack` row for your screen: if a variant is
  missing, add it to that file. It adds the top safe-area inset itself, so the `<Screen>` beneath it
  must declare `edges={['left', 'right', 'bottom']}`. The header background does not use the brand
  color — gold is reserved for actions; see the docblock in that file.
* **Wrap every screen in [`<Screen>`](../../../apps/mobile/src/components/layout/Screen.tsx).** It
  gathers safe area, keyboard avoidance and `keyboardShouldPersistTaps` in one place; miss one and
  you get text under the notch, a keyboard covering the input, or taps that need two presses. Pass
  `padded={false}` for edge-to-edge lists.

### The keyboard covers the last input — the one bug that keeps coming back

Any form field low on the screen is a candidate: a note textarea at the end of a step, a reference
code under three other fields, a reason box at the bottom of a sheet. **Before shipping a form,
open it on a device and focus its LAST field.** If it hides, the cause is almost always one of two
things, and both are already solved in the codebase — copy the solved one, do not invent a third.

**A container that does not start at the top of the window.** `KeyboardAvoidingView` lifts content
by *keyboard height minus the screen below its own frame*. That subtraction is only right when the
frame starts at the window's top edge. `<AppHeader>` is a SIBLING above `<Screen>`, so `Screen`'s
frame starts lower and the lift comes up short by exactly the header — the last field stays under
the keyboard. `Screen` fixes this by MEASURING its own distance from the window top
(`measureInWindow`) and feeding it to `keyboardVerticalOffset`. Measure; never take it as a prop —
some screens have a header and some do not, and a flag someone forgets is a silent 56dp error that
only appears once a keyboard opens.

**A `Modal` is its own OS window.** `Screen`'s `KeyboardAvoidingView` cannot reach inside one, and
on Android `adjustResize` does not apply there either. So every modal surface needs its OWN
`KeyboardAvoidingView` inside the `Modal` — that is why [`<BottomSheet>`](../../../apps/mobile/src/components/ui/BottomSheet.tsx)
carries one. It needs no `keyboardVerticalOffset` because it IS the window root.

Corollary: content inside a `BottomSheet` never needs its own keyboard handling, and content
inside a `Screen` never should either — if a field is still covered, the container is wrong, not
the field.
* **Loading / empty / error come from `src/components/state/`** — `ScreenLoading`, `ScreenMessage`,
  `ScreenError`. `ScreenError` already maps an API error to translated copy by CODE, so never print
  a backend `message`. But read §4b before reaching for `ScreenLoading`: it is the EXCEPTION, not
  the default.
* **The UI kit is TAMAGUI.** Lay screens out with its primitives — `YStack`, `XStack`, `Text` —
  and use its style props (`f`, `ai`, `jc`, `gap`, `px`, `br`, `bg`, `col`, `fos`, `fow`) instead
  of hand-written `StyleSheet` objects. Drop to bare React Native `View`/`StyleSheet` only where
  Tamagui has no equivalent: `Modal`, `Pressable`, `FlatList`, `ScrollView`, `TextInput`,
  `Image`, and any style an `Animated` worklet must own.

  Reason: Tamagui compiles those props to flattened native styles, so a stack of them costs no
  more at runtime than a `StyleSheet` — while a screen that mixes both conventions loses the one
  thing a design system buys you, which is that every screen is written the same way and reads
  the same way.

  **⚠️ Anything TAPPABLE keeps a `Pressable` wrapper.** Tamagui stacks accept `onPress` and
  `pressStyle`, and it is tempting to collapse `<Pressable><XStack/></Pressable>` into one node.
  Do not: `accessibilityRole` set on a Tamagui stack does not reach the accessibility tree.
  Collapsing `Button` this way made 27 tests that query `getByRole('button')` fail at once — and
  what a test cannot find by role, a screen reader cannot announce as a button either.

  So the split is: **Tamagui for the SHAPE, React Native primitives for the INTERACTION.** Put the
  `Pressable` (with `accessibilityRole` / `accessibilityState` / `accessibilityLabel`) on the
  outside and the `XStack`/`YStack` carrying the visuals immediately inside it.

  Do NOT introduce a second UI library, and do NOT reach for a native module for something the
  kit already covers (see the `react-native-svg` note in `StripePattern`/`BrandMark`: a native
  module absent from the installed dev build crashes at runtime, not at build time).
* **Sizes and colors come from `src/theme/tokens.ts`** (`space`, `radius`, `fontSize`,
  `fieldFontSize`, `fontWeight`, `iconSize`, `sizing`, `colors`) — the native adapter over
  `XP_TOKENS`, NOT Tamagui's own theme tokens. `sizing.touchTarget` is the 44pt/48dp floor — use
  it rather than typing a number. `iconSize` (`xs`/`sm`/`md`/`lg`) is the icon scale: named by
  ROLE, not by pixel count.
* **Text INSIDE a form control uses `fieldFontSize`, never `fontSize` directly** — `value` for
  what the user typed or picked, `label` above the box, `message` for hint and error, `affix` for
  a unit or counter inside it. `fontSize` is the WEB scale: its `body` step (14px) is desktop's
  default content size, while this app runs nearly three quarters of its text at 12px, so a field
  written against `fontSize.body` renders larger than its own label. One constant also means a
  future change to input text is one edit, not a sweep across every field.
* **Confirmations go through [`<AlertDialog>`](../../../apps/mobile/src/components/ui/AlertDialog.tsx),
  never `Alert.alert`.** The OS dialog ignores the design tokens, orders its buttons differently
  on iOS and Android (so the same array yields "Cancel | Delete" on one and the reverse on the
  other — a real hazard for a destructive action), and has no pending state, so the box closes
  while the request is still in flight and the user taps again.
* **A choice is a radio at TWO options, a menu at three or more.**

  | Options | Control |
  | --- | --- |
  | 2, mutually exclusive | [`<RadioOption>`](../../../apps/mobile/src/components/ui/RadioOption.tsx) — both laid out, always visible |
  | 3+, mutually exclusive | [`<SelectField>`](../../../apps/mobile/src/components/ui/SelectField.tsx) (inside RHF) or [`<SelectControl>`](../../../apps/mobile/src/components/ui/SelectControl.tsx) (plain state) |
  | Any number, multi-select | Checkboxes — a menu cannot show which combination is active |

  Two options cost two lines and let the user read both sides before deciding; hiding them behind
  a menu makes them open it just to learn what the question is. Three or more laid out flat starts
  eating the screen, and that is what the menu is for.

  **Never `Chip` for a labelled choice.** `Chip` sets `numberOfLines={1}`, so a label that is a
  sentence — "Bình thường — xe không có dấu hiệu hư hại mới" — loses the clause that makes the
  choice decidable. Chips are for short segmented switches (service type, quick filters).

* **A screen that needs a session is wrapped in
  [`<RequireSession>`](../../../apps/mobile/src/features/auth/RequireSession.tsx)** — never
  hand-rolled `if (!user) return …` inside the screen. Hiding a tab is not blocking it: a deep
  link or a push notification opens the screen directly. The guard renders the skeleton you pass
  as `fallback`, the sign-in invite on 401, and a retry on a network failure — three states a
  per-screen check reliably gets wrong. Behind it, read the user with `useAuthenticatedUser()`.

Beyond that:

* **Haptics**: use `expo-haptics` for consequential actions (confirming a booking, approving a
  request, submitting a handover) — not for ordinary navigation.
* **Platform differences**: small ones use `Platform.select` inline; large ones (a different JSX
  tree, a separate native API) split into `<Name>.ios.tsx` / `<Name>.android.tsx`.

---

## 4b. Skeletons — every screen whose shape you already know

A spinner says "wait"; a skeleton says "this is what is coming, and it will land HERE". On a screen
whose layout is known before the data arrives — which is nearly all of them — the spinner is the
worse choice twice over: it tells the user nothing, and the page jumps when real content replaces a
24px circle with a 600px body.

**Rule: a screen or section that fetches ships a skeleton in the same change as its happy path.** A
pull request that adds a fetching surface without one is incomplete, exactly like one missing its
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
  not mean its images arrived: `<Image>` with a remote `uri` paints an empty box until the last byte
  lands, which on a full-width banner reads as a broken white screen. Keep a skeleton under the
  image until `onLoad`, and clear it on `onError` too — a pulse that never stops promises a picture
  that is never coming. See `BannerSlide` in `HomeHero.tsx`.
* **Pagination footers** use the skeleton of the row being appended, not a spinner: the next page is
  vehicle cards, so say so.

---

## 4c. Motion — durations from tokens, transitions from the navigator

Timings come from [`src/theme/motion.ts`](../../../apps/mobile/src/theme/motion.ts) — `duration`
(`fast` / `base` / `slow` / `pulse`), `dwell` (how long a message STAYS on screen to be read), and
`easing.standard`. Never type a raw millisecond count: scattered numbers is how one screen ends up a
third slower than the next for no reason.

* **Screen transitions belong to the navigator, not to screens.** Configured once in
  `app/_layout.tsx`: `ios_from_right` for pushes (direction teaches depth — in from the right, back
  to the left), `slide_from_bottom` for `login` (a task that interrupts and returns, not a level
  deeper), `fade` into `(tabs)`. Tabs cross-fade rather than slide: tabs are PEERS, and a horizontal
  slide would imply a swipeable strip that does not exist.
* **`ios_from_right`, not `slide_from_right`** — the difference is the OUTGOING screen, and it shows
  up on BACK. `slide_from_right` holds the old screen still while the new one slides over it, so
  popping snaps the underlying screen back in one piece and reads as a flicker. `ios_from_right`
  moves both with parallax and a dim, so the motion is continuous end to end. The name means
  "iOS-style", not "iOS-only". Do not set `animationDuration` on it: it follows the platform curve,
  and forcing a linear timing on top makes it worse.
* **Do NOT set `freezeOnBlur` — on the Stack OR on the Tabs.** It sounds free (a covered screen
  stops rendering), but the bill arrives on BACK: the screen underneath rebuilds its whole tree in
  one frame in the middle of the pop animation. That is the exact signature — push smooth, pop
  janky. Tabs are not exempt: the `(tabs)` group IS the screen sitting underneath when you push a
  detail screen from a tab, so freezing there moves the thaw one level down without removing it.
* **Push smooth + pop janky is never the animation curve** — it is work happening as the screen
  underneath comes back. Isolate before changing anything: set `animation: 'none'` for one run.
  Still janky means it is render cost (a thaw, a refetch, a layout pass), and no amount of tuning the
  transition will fix it.
* **Touch feedback animates over time.** Flipping `opacity` in `style={({pressed}) => …}` is a jump
  cut; on a large surface it reads as the screen blinking. `Card` presses in and springs back on the
  UI thread — reuse `Card` rather than re-deriving this per screen.
* **Reanimated only, never `Animated` from `react-native`.** The JS-thread driver stutters exactly
  when the thread is busy — which is precisely when an animation is running.
* **Judge smoothness on a release build.** A dev bundle runs unoptimised with Metro attached; jank
  there is not evidence of jank in production.

## 5. Security & Domain Invariants

* **Tenant scope**: always rely on the backend `TenantScopeGuard` to resolve `tenant_id`. Never
  allow client-side spoofing.
* **No uncontrolled string enums**: always use status constants (`BOOKING_STATUS.ACTIVE`, not
  `'active'`).
* **Currency formatting**: format money using the string-safe `@xeprime/domain` helpers to avoid
  floating-point inaccuracies.
* **Masked PII**: respect platform masking policies for customer phones and emails.

---

## 6. Comment Discipline

Comments explain **why**, never **what**. The code already says what it does.

Write a comment only when a reader who knows React Native would otherwise get it wrong:

* A **trap** — code that looks redundant or wrong but is load-bearing (a side-effect import, a
  config flag that breaks pnpm resolution if flipped).
* A **domain invariant** — cite the ADR (`ADR 0011: return date = pickup date + N calendar months,
  not N×30`).
* A **non-obvious choice** where the obvious alternative is broken, with the failure named.

Do **not** write:

* Docblocks that restate the signature or the JSX tree (`/** Shared QueryClient for the app. */`,
  `/** Root layout — sets up the providers. */`).
* Comments on self-evident config (`staleTime: 30_000, // cache for 30 seconds`).
* Section banners, `// ===== Helpers =====`, author/date headers.
* Placeholder comments for features not written yet (`// TODO: booking goes here`).

Prefer a better name over a comment. Prefer deleting the comment over updating it.

Keep the form tight: one or two lines, inline, directly above what it explains. A `/** */` block is
for an exported symbol whose contract is genuinely not obvious — not for narration.

**Example — cut this:**

```ts
/**
 * Shared QueryClient for the whole app.
 *
 * `refetchOnWindowFocus` is off because React Native has no window focus — refetching when
 * the app returns to the foreground (AppState) and when the network comes back (NetInfo)
 * will be wired up with the first feature that calls the API.
 */
export const queryClient = new QueryClient({ ... });
```

**Down to this:**

```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // React Native has no window focus — AppState/NetInfo refetching is wired up later.
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

**A stale diagram is worse than no diagram.** This already happened here: after the interceptor layer
was deleted, `apps/mobile/README.md` still drew `SessionBoundary → registers errorInterceptor 401`.
The next reader either hunts for a module that no longer exists, or rebuilds it — and rebuilding
that particular one reintroduces the reset-refetch-401 loop the new design removed. Typecheck cannot
catch this. Only you can.

Ask after every change: **did the shape change, or only the behaviour inside it?** If the shape
changed, update the row that applies:

| What you changed | Also update |
| --- | --- |
| Added / deleted / renamed a module in `src/lib` or `src/features/*` | `apps/mobile/README.md` — folder table **and** any mermaid diagram naming it · `docs/CODEMAP.md` |
| Added a variant to `AppHeader`, or a component to `src/components/ui/` | `apps/mobile/README.md` §8 · §4 of this skill — otherwise the next screen will rebuild the very thing you just added |
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

* **Delete beats update.** If a paragraph exists only to explain what the code used to be, remove it
  — git history already holds it, and archaeology in a README rots faster than anything else.
* **Docs go in the same commit as the change.** A follow-up commit "fix docs" never arrives, and in
  between, the repository is actively lying to whoever reads it next.

---

## 8. Pre-Commit Verification Checklist

Before considering a mobile feature complete:

1. `pnpm --filter @xeprime/mobile typecheck` — 0 TypeScript errors.
2. `pnpm --filter @xeprime/mobile lint` — 0 lint errors.
3. `pnpm --filter @xeprime/mobile test` — green.
4. **If you touched `packages/*`, run the web suite too**: `pnpm --filter @xeprime/web test`. The API
   client, design tokens and message root are shared — a change that looks mobile-only can break
   1600 web tests.
5. **If you added or changed user-facing text**: `pnpm --filter @xeprime/web i18n:check`. It checks
   vi↔en parity across the shared root and validates the native gather table.
6. Test all 4 screen states: loading, populated, empty, network error.
7. Test keyboard interaction and safe area insets on both iOS and Android.
8. Verify API contracts against `@xeprime/types/src/api.generated.ts` — never hand-write a DTO.
9. **If the shape changed, §7 applies** — the docs describing it ship in this same commit.
