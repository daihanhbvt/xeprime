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
  the API base URL.

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

3. **Client UI State (Zustand / Redux Toolkit)**:
   * Only persist global app shell state: auth session tokens (in SecureStore), user profile preview, current tenant scope, active locale, and transient filter selections.

4. **Screen Filters & Search State**:
   * On mobile, there is no browser URL bar. Store active filter states in local screen state or navigation params (`route.params`), allowing state to preserve when navigating backward.

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

### C. Authentication (AUTH-01 → AUTH-04)

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
* Support **Apple Sign-In** on iOS and Google Sign-In, alongside Phone + OTP — these exchange a
  Firebase ID token at `POST /auth/mobile/session`.

### D. Push Notifications (COM-07)
* Integrate Firebase Cloud Messaging (FCM) / APNs.
* Register device push tokens upon login via `POST /notifications/device-token`.
* Handle foreground banner alerts, background notification routing, and badge counts.

---

## 4. UI & Ergonomics Guidelines

* **Touch Targets**: Minimum interactive area of 44x44 points for all buttons, chips, and list items.
* **Safe Area**: Respect `SafeAreaView` / `react-native-safe-area-context` on all screens (Notch, Dynamic Island, Home Indicator).
* **Feedback & States**:
  * Every screen must handle **Loading** (Skeleton screens, pull-to-refresh), **Empty** (helpful message + call-to-action), and **Error** (clear message + retry button).
  * Use haptic feedback (`expo-haptics`) for key user actions (confirming booking, approving request, submitting handover).
* **Keyboard Handling**: Wrap input screens in `KeyboardAvoidingView` / `react-native-keyboard-aware-scroll-view` with auto-dismiss on tap outside.

---

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

## 7. Pre-Commit Verification Checklist

Before considering a mobile feature complete:
1. `pnpm --filter @xeprime/mobile typecheck`: 0 TypeScript errors.
2. `pnpm --filter @xeprime/mobile lint`: 0 lint errors.
3. Test all 4 screen states: Loading skeleton, Populated list, Empty state, Network Error.
4. Test keyboard interaction and safe area insets on both iOS and Android simulators.
5. Verify that API contracts match `@xeprime/types/src/api.generated.ts`.
