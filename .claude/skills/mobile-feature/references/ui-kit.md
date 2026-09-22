# Bộ giao diện: layout, bàn phím, khung chờ, chuyển động

> Tài liệu tham chiếu của skill `mobile-feature`. Đọc khi công việc chạm tới phần này.

## Layout và công thái

The base already solves the three things every screen gets wrong — use them, don't rebuild them:

* **The top bar goes through [`<AppHeader>`](../../../../apps/mobile/src/components/layout/AppHeader.tsx)** —
  the app-wide SHARED header. Do not build a private `XStack` row for your screen: if a variant is
  missing, add it to that file. It adds the top safe-area inset itself, so the `<Screen>` beneath it
  must declare `edges={['left', 'right', 'bottom']}`. The header background does not use the brand
  color — gold is reserved for actions; see the docblock in that file. The `context` slot puts a
  small CONTROL on the subtitle line in place of `subtitle` — the manage portal's branch-scope
  picker lives there rather than costing every screen a separate strip below the bar.
* **Wrap every screen in [`<Screen>`](../../../../apps/mobile/src/components/layout/Screen.tsx).** It
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
`KeyboardAvoidingView` inside the `Modal` — that is why [`<BottomSheet>`](../../../../apps/mobile/src/components/ui/BottomSheet.tsx)
carries one. It needs no `keyboardVerticalOffset` because it IS the window root.

**Nothing scrolls the focused field into view.** The two causes above are about the container
being lifted by the wrong amount; this one bites after the lift is correct. `KeyboardAvoidingView`
only SHRINKS the visible area (so a `footer` stays clear of the keyboard) — the content inside the
`ScrollView` does not move, so a field in the lower half of a long form is simply below the fold
and the user types blind. React Native has no auto-scroll for this: `ScrollView` only exposes an
imperative scroll, and `automaticallyAdjustKeyboardInsets` is iOS-only and double-counts against
the KAV. On Android, `softwareKeyboardLayoutMode: "resize"` stopped covering for it once Expo went
edge-to-edge (SDK 53+) — the window no longer resizes.

`Screen` therefore does it: on `keyboardDidShow` it measures the focused input in WINDOW
coordinates, compares against the keyboard's `screenY`, and scrolls the overlap away; and it
reserves a tail of bottom padding while the keyboard is up, because the LAST field of a form has
nothing below it to scroll into. Nothing to wire per screen.

**Nobody tells the container that focus MOVED.** The three causes above all fire off
`keyboardDidShow` — which the OS only sends when the keyboard comes UP. Tap from one field to the
next while it is already open and Android sends nothing at all (iOS only when the keyboard's shape
changes), so the reveal never runs and the field you just tapped — reliably the LAST one in the
form — sits under the keyboard. `Screen` and `BottomSheet` therefore publish their scroller's
reveal through [`FocusRevealProvider`](../../../../apps/mobile/src/components/layout/focus-reveal.tsx),
and every shared input calls `useRevealOnFocus()` in its `onFocus`. **A new input component must
do the same** — one that does not is the next "the keyboard covers it" bug.

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
* **A round icon badge is [`<IconDisc>`](../../../../apps/mobile/src/components/ui/IconDisc.tsx)**, never a
  hand-rolled circular `YStack`. Two forms: `soft` (tinted fill, tone border, tone glyph) for a disc
  that labels the content next to it — a stat row, a list row; `filled` (solid tone, white glyph) for
  the head of a block, where the disc anchors the whole block. The glyph is always half the diameter,
  so every disc in the app reads as the same family.
* **Confirmations go through [`<AlertDialog>`](../../../../apps/mobile/src/components/ui/AlertDialog.tsx),
  never `Alert.alert`.** The OS dialog ignores the design tokens, orders its buttons differently
  on iOS and Android (so the same array yields "Cancel | Delete" on one and the reverse on the
  other — a real hazard for a destructive action), and has no pending state, so the box closes
  while the request is still in flight and the user taps again.
* **A choice is a radio at TWO options, a menu at three or more.**

  | Options | Control |
  | --- | --- |
  | 2, mutually exclusive | [`<RadioOption>`](../../../../apps/mobile/src/components/ui/RadioOption.tsx) — both laid out, always visible |
  | 3+, mutually exclusive | [`<SelectField>`](../../../../apps/mobile/src/components/ui/SelectField.tsx) (inside RHF) or [`<SelectControl>`](../../../../apps/mobile/src/components/ui/SelectControl.tsx) (plain state) |
  | Any number, multi-select | Checkboxes — a menu cannot show which combination is active |

  Two options cost two lines and let the user read both sides before deciding; hiding them behind
  a menu makes them open it just to learn what the question is. Three or more laid out flat starts
  eating the screen, and that is what the menu is for.

  **A row inside a menu is [`<MenuOption>`](../../../../apps/mobile/src/components/ui/MenuOption.tsx),
  wrapped in `<MenuOptionList>`** — the list rules a hairline BETWEEN adjacent rows (never under
  the last one, which reads as a list cut off mid-scroll) and owns the spacing, since
  `BottomSheet` spaces its direct children by 16px and that much air defeats the rule. Do not
  hand-draw a menu row: the three menus that did drifted apart in text size and selected colour.

  **Never `Chip` for a labelled choice.** `Chip` sets `numberOfLines={1}`, so a label that is a
  sentence — "Bình thường — xe không có dấu hiệu hư hại mới" — loses the clause that makes the
  choice decidable. Chips are for short segmented switches (service type, quick filters).

* **A screen that needs a session is wrapped in
  [`<RequireSession>`](../../../../apps/mobile/src/features/auth/RequireSession.tsx)** — never
  hand-rolled `if (!user) return …` inside the screen. Hiding a tab is not blocking it: a deep
  link or a push notification opens the screen directly. The guard renders the skeleton you pass
  as `fallback`, the sign-in invite on 401, and a retry on a network failure — three states a
  per-screen check reliably gets wrong. Behind it, read the user with `useAuthenticatedUser()`.

Beyond that:

* **Picking and uploading an image goes through
  [`useImageUpload`](../../../../apps/mobile/src/components/ui/use-image-upload.tsx)** — the
  pick/compress/presign/PUT/toast chain, including the signed `Content-Length` trap in §3B.
  `ImageUploadField` is that hook plus the standard field layout; reach for the hook directly only
  when the surface genuinely has another shape (the shop identity header: full-bleed cover with a
  round logo laid over it). Never re-derive the upload chain in a screen.
* **Haptics**: use `expo-haptics` for consequential actions (confirming a booking, approving a
  request, submitting a handover) — not for ordinary navigation.
* **Platform differences**: small ones use `Platform.select` inline; large ones (a different JSX
  tree, a separate native API) split into `<Name>.ios.tsx` / `<Name>.android.tsx`.

---

## Skeletons — every screen whose shape you already know

A spinner says "wait"; a skeleton says "this is what is coming, and it will land HERE". On a screen
whose layout is known before the data arrives — which is nearly all of them — the spinner is the
worse choice twice over: it tells the user nothing, and the page jumps when real content replaces a
24px circle with a 600px body.

**Rule: a screen or section that fetches ships a skeleton in the same change as its happy path.** A
pull request that adds a fetching surface without one is incomplete, exactly like one missing its
empty state. `ScreenLoading` (a spinner) is reserved for the rare surface whose shape genuinely
cannot be known in advance.

Skeletons live in [`src/components/ui/Skeleton.tsx`](../../../../apps/mobile/src/components/ui/Skeleton.tsx):

| Piece | For |
| --- | --- |
| `Skeleton` | One block. `width`/`height`/`round` — the primitive the rest are built from |
| `SkeletonText` | A paragraph: lines of uneven width, last one short |
| `VehicleCardSkeleton` | A vehicle card, same photo ratio and line count as the real one |
| `ListRowSkeleton` | A list row (province, shop) |
| `MiniRowsSkeleton` | A dense two-line quick-look row with an amount + status column (dashboard panels) |
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

## Motion — durations from tokens, transitions from the navigator

Timings come from [`src/theme/motion.ts`](../../../../apps/mobile/src/theme/motion.ts) — `duration`
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
