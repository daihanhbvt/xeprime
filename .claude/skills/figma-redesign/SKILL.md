---
name: figma-redesign
description: Rebuilding an existing apps/web screen, menu or shell from a new Figma design — above all the partner site (`app/(manage)/manage`, Partner-XePrime file). Load as soon as the user sends a Figma link for a screen that already exists in code, before reading the design, so no existing feature is lost or duplicated and every gap is confirmed with the user before coding.
---

# Redesigning a screen without losing what it does

The user is moving the partner site onto a new design, one screen or feature at a time. The menu was regrouped and features moved between groups. The last redesign (customer site) followed the mock-ups literally and silently dropped many working features. The user does not want that to happen again. The ledger of what lives where is [`docs/design/09_PARTNER_REDESIGN.md`](../../../docs/design/09_PARTNER_REDESIGN.md). Read it first, every time.

## Who decides what

- **Figma decides how it looks**: layout, grouping, order, spacing, type, colour, icons, labels (read labels from the design's TEXT, never from layer names).
- **Code and ADRs decide what it does**: which actions exist, who may do them, which data may be shown. A design never removes a feature and never overrides an ADR.

## The loop for every screen

1. **Read the ledger.** Find the screen in `09_PARTNER_REDESIGN.md` §3. It tells you which features moved INTO this screen from elsewhere (they must appear here) and which moved OUT (they must not be built twice).
2. **Inventory the code.** List every capability the current screen has: actions and buttons, filters, tabs, columns, sorts, drawers and dialogs, states (loading/empty/error/no-permission/read-only), track differences (package vs commission), permission and `ownerOnly` gates, deep links that point at it.
3. **Read the design** (see "Reading Figma" below) and list what it draws.
4. **Classify** each item into one table:

   | Mark | Meaning | What you do |
   | --- | --- | --- |
   | ✅ | In code and in the design | Build to the design |
   | 🟡 | In code, NOT in the design | Ask. Propose a slot in the design's own language (menu "…", tab, drawer, section). Never delete it, never hide it, never ship it "later" |
   | 🆕 | In the design, NOT in code | Ask. It may need backend work or an ADR. Never ship a control that does nothing |
   | ⚠️ | The design contradicts an ADR (contact data before a booking exists — ADR 0056/0073; "đã giữ chỗ" on an unapproved request — ADR 0044; …) | Report it with the ADR and propose a compliant rendering |

5. **Ask once.** Send the 🟡/🆕/⚠️ rows to the user in a single `AskUserQuestion` round, each option carrying your recommendation. Wait for the answer. Do not code a screen with open rows.
6. **Record the decisions** in the ledger (§3 for the screen, §2 when a feature changes home) in the SAME change as the code.
7. **Build.** States the design does not draw — loading, empty, error, no permission, read-only (expired plan), commission-track variant, narrow screens — you build yourself in the design's language, and you list them in your report. You don't ask about each one.
8. **Verify against the ledger**: every row of the screen's inventory is either on the screen, or has a recorded new home. Then run the scoped checks (`verify-changes`).

## Things that never change because of a design

- Routes keep working. A feature that moves gets a redirect or a tab, not a dead URL; links in emails and bookmarks must not break.
- Permission, `feature` (plan) and `ownerOnly` gates move with the item. Hiding is never access control (ADR 0027 điều 4).
- Every word goes through i18n (`i18n` skill); every value through tokens (`frontend-feature` skill). Measure colours/spacing on the screen frame, not on the library's palette page.
- The admin site (`admin.xeprime.vn`) and mobile apps keep their current shell until their own designs arrive. Shared components change for everyone, so check the other users of a component you restyle.

## Reading Figma

- File: Partner-XePrime `3ky32n5AZKViYsCfoVrEiZ` (account designersoftrent@gmail.com — run `whoami` on a permission error). Call `create_session` first.
- Ask the user for "Copy link to selection" on a FRAME. A link copied with nothing selected points at the page and returns nothing useful; don't `get_metadata` a whole page to hunt for it.
- `get_screenshot` first (cheap, shows what the frame is), `get_metadata` on small frames to learn variant names, then `get_design_context` only on the frames you will build. Record node ids you used in the ledger §4 so later sessions don't pay to rediscover them.
