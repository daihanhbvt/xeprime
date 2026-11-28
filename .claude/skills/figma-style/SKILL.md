---
name: figma-style
description: Build or restyle one screen (Partner app, customer app, web at phone width or desktop) from a Figma link or a design image - the LOOK follows Figma (layout, style, font, colour, type size, spacing, radius, shadow, icons, motion) while BUSINESS LOGIC stays 100% as the current code; wherever Figma implies a logic change, show a gap TABLE and ask with AskUserQuestion before coding. Load as soon as the user sends a figma.com link or a design image and asks to match it, before reading the design.
---

# Style from Figma, keep the logic

## Who decides what

| Aspect | Source of truth | Notes |
| --- | --- | --- |
| Layout, block order, grouping, grid | **Figma** | Match 100%, including the gaps between blocks |
| Style: colour, font, type size, line height, weight, radius, shadow, border, illustration | **Figma** | **100%** identical - measure on the SCREEN frame, not on the library palette page. "Close enough" is not done |
| Icons | **Figma, stroke for stroke** | Use Figma's EXACT vector (download the SVG from `get_design_context`); never swap in a look-alike Ionicons/AntD glyph. See "Icons" below |
| Visible copy (labels, titles, lead text) | **Figma** (read the TEXT node, never the layer name) | Still through i18n vi + en, following `ui-text-style` |
| Pure UI interaction (open a sheet, tabs, scrolling, animation) | **Figma**, adapted to native where needed | Must not change any business outcome |
| Whether a feature exists, what data is shown, who may do what, show/hide flags, permissions, track (package/commission), validation, API calls, booking states | **Current code + ADRs** | Keep 100% UNCHANGED. Web is the source of truth for the apps |

Figma NEVER silently removes a feature, adds a dead button, or overrides an ADR.

## Loop for EVERY screen

1. **Scope**: which screen, which surface (Partner app `apps/mobile/manage` + `apps/mobile/shared`; customer app `apps/mobile/customer`; web `apps/web`). Default: do the app, then the matching web phone-width version (≤640px, CSS only - web logic untouched), unless the user says otherwise.
2. **Inventory the current code** of the screen: every block, button/action, input + validation rule, tab/filter/sort, sheet/dialog, state (loading/empty/error/no permission/read-only), track and permission differences, deep links pointing at it.
   - Re-inventory from scratch EVERY time, even for a screen styled in an earlier pass. A code comment saying "matches Figma" / "user decided" is NOT evidence - verify against the frame again.
3. **Read Figma** (see "Reading Figma") and list what the design draws - walk the frame's NODE TREE, not just the screenshot:
   - Every direct child of the frame, INCLUDING screen chrome: status bar, "Back navigation"/top bar, back arrow, close button, title placement (in a bar vs in the content), bottom bar/sticky footer. A missing back arrow or a moved title is a gap like any other.
   - Every TEXT node with its constraints: font/size/line-height/weight/colour, `whitespace-nowrap` (= must stay ONE line), number of lines in the screenshot, and every styled RUN inside a rich text (a bold/coloured word inside a sentence).
4. **Classify** everything into ONE table:

   | Mark | Meaning | Action |
   | --- | --- | --- |
   | ✅ | In code and in Figma | Build to Figma |
   | 🎨 | Only style/layout differs | Build to Figma, don't ask |
   | 🟡 | In code, NOT drawn in Figma | ASK - EVERY time, on EVERY pass, even if an earlier pass/comment says it was kept (e.g. "Bắt đầu trong 3 bước", "Linh hoạt chuyển đổi", "Quy định sử dụng chợ xe", login/logout footer lines, app version). Options: keep (propose a place in the design's language: "…" menu, sheet, collapsible block) / move / remove from this screen. Never silently keep, delete or hide it |
   | 🆕 | In Figma, NOT in code (new feature/data) | ASK - may need API/ADR work. Never ship a control that does nothing |
   | 🔁 | Figma implies a behaviour change (flow, validation, dropped step, show condition) | ASK - state current behaviour vs Figma |
   | ⚠️ | Figma contradicts an ADR (contact/address before a booking - ADR 0056/0073/0077; calling the hold payment a "deposit"/"cọc" - ADR 0044; mentioning plans/"gói" in the Partner app; IAP…) | Report with the ADR number and propose a compliant rendering |

   **Copy diff (mandatory):** compare every text node with the code (vi) character by character, not by meaning. Skip dynamic data (names, money, dates, counts). Show ONLY differing rows: `# · Figma text · Code key · Code text · Note` (Note: shared with web? contradicts an ADR/server fact ⇒ ⚠️). Never change copy yourself - ask the user (AskUserQuestion) to pick Figma / keep / other. Kept differences go under "remaining differences from Figma".

   The inventory table has an **Evidence** column: Figma node id ↔ `file:line` in code (or "none"). A row without evidence on one side is a gap by definition - this is what catches a missing back arrow or a block the design never drew.

5. **Ask ONCE**: print the gap table (only 🟡/🆕/🔁/⚠️ rows) as a markdown table with columns `# · Block/feature · Current (code) · Figma · Proposal`. Then call `AskUserQuestion` - one question per row (max 4 per round, group if more), each question self-contained (name the block), recommended option first with "(Khuyến nghị)". If nothing needs asking, say "no logic gaps" and proceed.
   - Unanswered ⇒ don't code that part yet (✅/🎨 work can go ahead).
6. **Build**:
   - Map Figma values onto existing tokens: app `apps/mobile/shared/src/theme/tokens.ts` (`space`, `typeScale`, `fontSize`, `fontWeight`, `radius`…), `layout.ts`, `elevation.ts`, colours via `useColors()`; web `@xeprime/ui` (`XP_TOKENS`, `tokens.css`) + CSS Modules + AntD tokens. Missing token ⇒ ADD a token (light + dark); never scatter hard-coded hex/px.
   - **Colour = match by HEX, not by token name**: read the Figma hex (`var(--bg\/gray-50,#fafafa)`), grep that exact hex in `packages/ui/src/tokens/index.ts`, use its `useColors()` key. Names mislead (`surfaceMuted` = gray-100, `borderSubtle` = #f5f5f5). No match ⇒ add a token.
   - A block/style used a second time ⇒ shared component in `apps/mobile/shared/src/components/ui` (applies to both apps). When you change a shared component, check every other screen using it.
   - New copy ⇒ i18n in `packages/domain/messages/{vi,en}`, short hyphen `-` only, date-time/list separators via the shared constants.
   - States the design doesn't draw (loading, empty, error, no permission, read-only, commission track, dark mode, iPad/wide, large font) ⇒ build them yourself in the design's language, list them in the report, don't ask about each.
   - App: `useMemo`/`useCallback`/`React.memo` per the `mobile-feature` skill; iPad via `use-responsive`. Web: `frontend-feature` skill.
   - DO NOT change: routes/deep links, data hooks, query keys, validation schemas, API payloads, show/hide conditions, permissions. If wiring the UI truly requires touching logic ⇒ go back to step 5.
   - Font family: Figma uses **Google Sans Flex** (`font-googlesan`, ADR 0062) everywhere; the app's `FONT_FAMILY` (`theme/fonts.ts`) must be that family (switched from Be Vietnam Pro 20/11/2026). Any raw React Native `Text` (not Tamagui) must set `fontFamily: FONT_FAMILY.<weight>` itself - pick the weight by FILE, not `fontWeight` (Android). Only native OS dialogs (`Alert.alert`) and the Apple sign-in label keep the system font. A text that wraps or truncates unexpectedly is often a wrong font: check the family before tweaking spacing.
   - Text fidelity (RN): a Figma one-line text (`whitespace-nowrap`) ⇒ `FitOneLineText` (`components/ui`, measures the natural width and sets the exact font size). Do NOT use `adjustsFontSizeToFit` for it: Android shrinks in coarse steps, the text ends up smaller than needed and the leftover space piles on one side (uneven margins). When the user asks for bigger/unshrunk text, make ROOM (padding, gaps, a slight negative margin into the card padding) instead of shrinking the font. A styled run inside a sentence ⇒ nested `Text` that re-declares EVERY property it needs (`fow`, `fontFamily`, `col`, `fos`) - a nested Tamagui `Text` does NOT reliably inherit weight/family from its parent.
   - Line count is part of the design: a label Figma draws on N lines (explicit `\n` or wrap) must not render on N+1 in the app. Fix in this order: tighten inner padding/gaps of that cell (note the deviation in the report) → `numberOfLines={N}` + `adjustsFontSizeToFit` with a `minimumFontScale` floor (≥ 0.8) → ask. Never truncate with "…" a label that carries meaning.
   - **Single primary action ⇒ sticky (app behaviour, overrides Figma's in-flow placement):** when a screen has ONE main action button (submit a form, "Đăng ký & đăng xe đầu tiên", "Lưu", "Tiếp tục"…), the app pins it to the bottom via `Screen footer` (+ `hideFooterWhileTyping` on long forms) instead of leaving it at the end of the scroll. Notes/footnotes that Figma draws under the button stay at the end of the content. Several equal actions (cards each with their own button, like "Chọn mô hình & đăng ký" per card) are NOT sticky. Exception (user decision 20/11/2026): SHORT account screens whose whole content fits one screen - login, forgot-password steps, OTP entry - keep Figma's in-flow placement (button right under the field + the companion line); sticky is for long scrolling forms (partner signup, create vehicle…). When unsure whether a screen is "short", ask. Web phone-width keeps Figma's in-flow placement unless told otherwise.
   - "Fit on one screen" requests: solve with layout (flex, scaling hero art by available height, compact spacing on short screens), never by dropping information or features.
7. **Verify**:
   - Compare every block with the Figma screenshot (margins, gaps, type size, colour, icons), node by node from the step-3 list - chrome first (back arrow, title, bars), then content.
   - Visual evidence: before reporting done, put a RENDERED app screenshot (emulator/device, or one the user sends) next to the Figma screenshot. Reading code is not enough (line breaks, nested text weight, image overflow only show when rendered). If no screenshot is possible, the report says "chưa soát bằng mắt" and lists the render risks for the user to check (one-line texts, styled runs, overlapping art, long VI/EN strings).
   - The diff contains no logic change other than rows the user approved in step 5.
   - Partner app: run the local `figma-screen-check` skill (device/emulator, light + dark) before reporting done. The user's physical phone may be used when they allow it (`adb devices`, `ANDROID_SERIAL`).
   - Typecheck/tests only when the user asks (`verify-changes`).
8. **Report** (in Vietnamese, as tables): files changed · blocks matched · decisions applied from the questions · extra states built · remaining differences from Figma and why - this last table MUST include every copy row still not verbatim (with both strings), so "matches Figma" is never claimed while a text differs. No commit/push without permission.

## Reading Figma

- Partner file: `3ky32n5AZKViYsCfoVrEiZ`. Link `figma.com/design/:fileKey/...?node-id=1-2` ⇒ nodeId `1:2`; for branch links use the branchKey.
- Call `create_session` before any file tool; load the `figma-design-to-code` skill before `get_design_context`.
- Cheap → expensive: `get_screenshot` (what is this frame) → `get_metadata` on small frames (variant names) → `get_variable_defs` (colour/type variables) → `get_design_context` only for frames you will build. Its output is a REFERENCE; translate to the project's Tamagui/RN or CSS Modules.
- Link without a frame selected (points at a whole page) ⇒ ask the user for "Copy link to selection" on the FRAME; don't `get_metadata` a whole page to hunt.
- Permission error ⇒ `whoami`.
- Only an image (no link) ⇒ measure from the image and state in the report which values are estimates.

## Icons - must match Figma 100%

- **GATE - applies to EVERY Figma-driven change, including quick fixes and feedback sweeps, not only the per-screen loop** (user complaint 20/11/2026: a `menu-outline` Ionicons glyph was used for the Overview ☰ instead of Figma's "Menu Hamburger"): before typing `<Ionicons` (or any glyph from a font/icon set) in code you are writing from a Figma frame, STOP and fetch that icon's SVG from the frame (`get_design_context` asset URL → `curl` → `LineIcon` entry). Ionicons is allowed only when the frame has no icon there AND you say so in the report. "Looks like a hamburger/arrow/close" is not a match - compare paths.
- List EVERY icon in the frame (inputs, buttons, menu rows, states, empty states…), including small icons inside nested components (input prefix/suffix, password eye, chevrons).
- For each icon: download Figma's SVG (asset URL from `get_design_context`, `curl -L` into the scratchpad) and compare its path with what the code draws. Different path = wrong, even if it "looks similar".
- Look for an existing copy in this order: app `components/icons/LineIcon.tsx` (+ `line-icon-web.ts`) → web `features/auth/components/AuthIcons.tsx`, `public/icons/menu/*.svg`. Same path ⇒ reuse.
- Missing ⇒ ADD it to the shared icon set (app: a `LineIcon` entry, 20 frame / the exact Figma frame, `translate` by Figma's inset, hard-coded colour → `currentColor`; web: `AuthIcons` / SVG in `public/icons`). Never inline a one-off SVG in a screen.
- Icon colour comes from the token matching Figma's hex (e.g. `#717680` = `colors.placeholder` / `--xp-color-text-tertiary`), with a dark variant.
- States Figma doesn't draw (e.g. eye-slash while the password is visible) ⇒ derive from the Figma icon itself (add a stroke of the same weight), never borrow a glyph from another set.
- A shared component still drawing Ionicons for the new design style (e.g. `v2` inputs) ⇒ fix it inside the component for that style, so every screen using it is right; check those screens.
- Verify step: compare each icon against a large Figma screenshot (`get_screenshot` with a high `maxDimension`) before reporting done.

## Tabs vs chips - which control (designer rule, 20/11/2026)

Pick the control by what a tap DOES to the content below, not by how the frame happens to look:

| Tap does… | Control | App component | Example in Figma |
| --- | --- | --- | --- |
| Switches to a different SECTION/MODULE of the same object - the blocks below change structure (other cards, other fields) | **Underline tabs** (text + 2px underline on the active tab). Designer: "tabs dạng switch module giữ nguyên" | `UnderlineTabs` | Customer detail "Tổng quan · Lịch sử · Thu chi · Giấy tờ" |
| Narrows the SAME list - same card type, only fewer/more rows; usually shows a count | **Filter chips** (pill row, scrolls horizontally; active = dark fill + white text, others = white with a light border; label "Tất cả (26)") | `ChipTabs` (default `look="chip"` = Figma "_Tab MB" `24547:137212`: h32, pad 8/6, pill, gap 8, active `text/gray/high` bg + white text, idle `bg/gray-50` + `stroke/gray-low200` border, 12/18 medium, count as "Quá giờ (7)") in the `tabs` slot of `ManageListShell` | Customer list "Tất cả (26) · Còn nợ (16) · Khách quen (2) · Lưu ý (7)" |
| Changes the period / view mode INSIDE one card (2-4 fixed options) | **Segmented** (grey tray, raised white cell) | `SegmentedTabs` (Partner default = `neutral`; `fit` for long labels) - the ONLY segmented control, never a second tray | Overview revenue card "7 ngày · 30 ngày" |

- Quick test: "after the tap, is it still the same list?" Yes ⇒ chip. No (different blocks) ⇒ underline tab. Inside a card ⇒ segmented.
- Never use chips to switch modules, and never use underline tabs to filter a list.
- A filter chip is only a SHORTCUT of a filter dimension that also exists in the filter sheet (same state, not a second one).
- Chips must stay light and small (user feedback: chips "thô và to"): take height, padding, font size and border from the Figma frame (`get_design_context`), small size, medium weight - not bold, no icons, no heavy shadow.
- When a screen in code uses a different control than this table says, list it in the gap table (🎨 row) instead of keeping the old one silently.

## Action popups (user rule 27/11/2026)

- "⋮" menu / any action popup = `BottomSheet chrome="v2" headerDivider` + `ActionSheetButtons` (icon buttons, 2 per row, danger = red border, primary = yellow) - same as booking detail "Thao tác" and Công nợ. Never a list of rows, even if Figma draws a dropdown ("CRUD Action").
- Confirm popup = `AlertDialog`/`ConfirmSheet`: title = SHORT action label ("Tạm khoá"), the explanatory sentence goes in `message`. Never pass `scroll={false}` to a sheet without a virtualised list (it fixes the height to the ceiling ⇒ tall empty sheet). Check the popup on device.

## Action popups (Partner app, user rule 27/11/2026)

- "⋮" menu of a card/header = `BottomSheet chrome="v2" headerDivider` + `ActionSheetButtons` (icon buttons, two per row, danger = red border, primary = yellow) - same as booking detail "Thao tác" / Công nợ. Never a list of rows, even if Figma draws a dropdown ("CRUD Action").
- Confirm popup (`AlertDialog`/`ConfirmSheet`): title = SHORT action label ("Tạm khoá"), the explanation sentence goes in `message`. Never pass `scroll={false}` to a sheet without a list - it pins the sheet to full height.

## Hard rules

- No IAP in either app; the Partner app never mentions plans ("gói") - use neutral wording.
- Don't touch `apps/web` beyond phone-width styling (web is the read-only logic source).
- No inline styles on web (CSS Modules); no hard-coded colours in the app (light + dark theme).
- Don't rename routes/APIs because the design names things differently.
- Replies to the user are in Vietnamese.
