# 13 — Figma Prompts: Vehicle 360 Management

> Dùng sau khi đã đưa [`12_VEHICLE_360_MANAGEMENT.md`](12_VEHICLE_360_MANAGEMENT.md) vào Figma hoặc agent đọc được file đó.  
> Chạy lần lượt 4 prompt; duyệt từng batch trước khi chạy batch tiếp theo.  
> Đây là prompt thiết kế Figma, không phải prompt code ứng dụng.

## Chuẩn bị một lần

Đảm bảo agent đọc được các section `01 — XePrime Foundations`, `04 — Shop Onboarding & Settings`, `05 — Fleet Management`, `06 — Rental Operations`, `07 — Finance Operations`, `12 — Product Coverage & Consistency Audit`.

Đính kèm:

- `12_VEHICLE_360_MANAGEMENT.md`;
- screenshot mới nhất của `/manage/vehicles`, vehicle detail, create wizard, edit vehicle;
- screenshot frame Figma tương ứng chỉ khi MCP không lấy được screenshot node.

Không gửi ảnh tham khảo màu khác; XePrime Foundations là nguồn màu, typography và component.

---

## Prompt 1/4 — Safe workspace, Vehicle Core, Create/Edit IA

```text
You are the Lead Product Designer and Senior UX Architect for XePrime.

Use the connected Figma file and read the attached `12_VEHICLE_360_MANAGEMENT.md` completely before designing. Inspect `01 — XePrime Foundations`, `05 — Fleet Management`, `06 — Rental Operations`, and `07 — Finance Operations` for context and reusable components.

GOAL
Create a safe Proposed v2 workspace and redesign the core vehicle-management information architecture. This is a Figma design task, not an application-code task.

NON-DESTRUCTIVE RULES — MANDATORY
1. Do not move, resize, rename, delete, reparent, detach, replace or edit any existing top-level section, frame, component or design.
2. Create a new top-level section named exactly `13 — Vehicle 360 Management — Proposed v2`.
3. Place it in empty canvas space to the right of the rightmost top-level section, with at least a 1200px gutter. Grow only this section rightward or downward.
4. Existing Fleet frames are baseline/reference. Duplicate a screen into the new section and suffix `-v2`; never overwrite its original.
5. Use instances/tokens from `01 — XePrime Foundations`. Never edit a shared main component. If a variant is missing, create `V360/Local/<Component>` inside the new section and document why.
6. Product frames stay at 1440 desktop, 768 tablet and 390 mobile. Never widen a product frame to fit content.

CREATE THESE LANES
`00 — Scope & Change Map`, `01 — Vehicle Core & Navigation`, plus placeholders for lanes 02, 03, 04, 05 and 99 defined in the product spec.

DESIGN THIS BATCH
A. A change map classifying every surface as existing screen updated, new route, drawer/dialog, or out of scope.

B. `/manage/vehicles` v2:
- preserve the approved XePrime shell and card-first fleet grid;
- compact actionable indicators for source type, document expiry and maintenance due only when data/permission allow;
- do not turn cards into full finance reports or leak sensitive amounts;
- preserve search, filter, sort, count and actions;
- populated, loading skeleton, first empty, no-results, error/retry and restricted-action states.

C. `/manage/vehicles/:id` Vehicle 360 overview:
- profile header: image, name, code, plate, two independent status axes, source, odometer and one contextual primary action;
- maximum 3 prioritized action alerts plus `Xem tất cả`;
- summaries for policy, next booking, documents, maintenance and finance, permission-aware;
- cross-links to edit tab, calendar, booking, maintenance and obligations;
- never show fake zero when data is missing.

D. `/manage/vehicles/:id/edit` is one page with six tabs, not a wizard:
`Thông tin xe`, `Hình ảnh & tiện ích`, `Giá & chính sách`, `Nguồn xe & tài chính`, `Giấy tờ`, `Bảo dưỡng & KM`.
Create the shell and representative first-two-tab content. Tabs are conceptually deep-linkable through `?tab=`. Desktop tabs are sticky. Mobile tabs remain one horizontally scrollable row and never wrap.

E. `/manage/vehicles/new` remains a short 5-step wizard:
`Cơ bản`, `Thông số`, `Giá & chính sách`, `Hình ảnh`, `Xác nhận`.
Step 1 asks source type without the full finance form. Step 3 defaults to `Dùng chính sách chung của gian hàng` and shows a compact summary. Design desktop/mobile step 1, step 3, review, validation error and success checklist. Checklist links to Source & Finance, Documents, KM, Maintenance and public readiness.

LAYOUT AND COMPONENTS
- Do not change global sidebar/topbar dimensions.
- Use available width, 24px desktop gutters, about 1440px max workspace.
- Forms stay readable at 960–1120px, at most 2 columns.
- Mobile padding 16px and sticky bottom primary actions where appropriate.
- Reuse AppShell, navigation, Button, Tabs, Card, StatusTag, FormField, Select, Upload, ResponsiveDialog/Drawer, Skeleton, EmptyState, ErrorState and Toast.
- Gold is brand/action, not a semantic status color.
- Use exact Vietnamese labels.

DELIVERABLES
Desktop 1440 key frames; representative 768/390 frames; annotated state/permission matrix; `B1 — Handoff` listing frame names, reused components, local candidates and questions.

STOP
Only edit nodes inside Proposed v2. Do not design detailed Pricing, Finance, OCR or Maintenance yet.
```

---

## Prompt 2/4 — Pricing, Deposit, Delivery, Overtime, Discount

```text
Continue in the connected XePrime Figma file. Read `12_VEHICLE_360_MANAGEMENT.md` completely and inspect Prompt 1 output.

Work only in `13 — Vehicle 360 Management — Proposed v2` → `02 — Pricing & Rental Policies`. Do not change anything outside Proposed v2 or any shared main component. Use existing instances; missing candidates stay `V360/Local/*`.

GOAL
Design one coherent policy system shared by shop defaults, vehicle overrides, booking-request quotes and booking snapshots.

PRESERVE THESE RULES
- Deposit is a fixed VND amount.
- Delivery distance is one-way.
- Delivery has non-overlapping tiers, e.g. 0–3km free, >3–5km 30,000đ, >5–10km 50,000đ; examples are not hard-coded defaults.
- Outside the automatic radius requires a manual quote.
- Overtime has separate settings.
- Discount applies only to base rental, never to deposit, delivery, overtime, fines/damage or other charges.
- Requests/bookings use price snapshots.
- A vehicle inherits shop defaults or explicitly overrides them; always show the active source.

DESIGN
1. New `/manage/settings/rental-policies` with `Tiền cọc`, `Giao nhận`, `Quá giờ`, `Giảm giá mặc định`; show active defaults and inherited/overridden vehicle counts.

2. Delivery-tier editor: enable; one-way explanation; From/To/Fee rows; add/reorder/delete; validation for gaps, overlap, negative values and ambiguous boundaries; auto-radius limit; manual quote outside radius; readable preview.

3. Overtime setting: price/hour; optional grace and rounding with `Cần cấu hình` because defaults remain Unknown; example formula preview. Manual adjustment with reason belongs to return workflow.

4. Vehicle tab `Giá & chính sách`: `Dùng mặc định gian hàng` / `Thiết lập riêng`; inherited read-only display; override for rental price, discount, deposit, delivery, overtime; sensitive-public-edit warning; unsaved changes; reset-to-default confirmation.

5. Manual-delivery-quote responsive drawer/dialog from booking request: `Cần báo phí giao nhận`; confirmed one-way distance, fee, note, price breakdown; submit/submitting/success/validation/conflict; customer-facing summary.

6. Shared breakdown:
`Tiền thuê gốc` → `Giảm giá` → `Tiền thuê sau giảm` → `Phí giao nhận` → `Phí quá giờ` → `Khoản khác` → `Tổng trước cọc`; display `Tiền cọc` separately.

RESPONSIVE/STATES
Desktop 1440, representative tablet 768/mobile 390. Mobile tiers are stacked cards, not a squeezed table. Desktop tables align by content, money right, overflow scroll, right action sticky. Include loading, unconfigured, inherited, overridden, validation/save error, success, read-only and no-permission.

Reuse common input/currency/switch/segmented/table/card/alert/dialog/button/toast/skeleton patterns. Do not duplicate them per surface.

DELIVERABLE
`B2 — Handoff` with frames, states, components and API/product dependencies. Do not design source finance, OCR or maintenance.
```

---

## Prompt 3/4 — Source, Loan, Lease, Partnership, Obligations

```text
Continue in the connected XePrime Figma file. Read `12_VEHICLE_360_MANAGEMENT.md` completely and inspect Prompt 1–2 outputs.

Work only in `13 — Vehicle 360 Management — Proposed v2` → `03 — Source & Financial Obligations`. Never alter old sections or shared main components. Reuse instances/tokens; missing candidates stay `V360/Local/*`.

GOAL
Design a permission-safe source and recurring-obligation experience for owned, financed, re-rented and partnership vehicles. Keep sensitive amounts out of fleet cards and unauthorized summaries.

SOURCE TYPES
`Sở hữu`, `Trả góp`, `Thuê lại`, `Hợp tác`.

DESIGN
1. Vehicle tab `Nguồn xe & tài chính`: selector and source-change consequence; owned, financed, re-rented, partnership, read-only and no-permission states; impact confirmation when changing existing type.

2. Financed form: bank/lender; contract number/file; principal; disbursement date; term; annual interest; `Dư nợ giảm dần` or `Trả đều/niên kim`; due day; schedule separating principal/interest/total/remaining principal. Clearly label estimates and support actual-statement reconciliation without rewriting paid history.

3. Re-rented form: owner identity/contact; recurring rent, cycle/due day, start/end; contract images/files; notes; expiry warning without auto-hide/block.

4. Partnership form: owner identity/contact; `Tỷ lệ của chủ xe`; settlement cycle/cutoff/payment day; effective dates; contract; notes. Visibly explain basis `Tiền thuê sau giảm + phí quá giờ`; exclude deposit, delivery, fines/damage, cleaning/fuel and unrelated entries; derive shop share instead of entering two percentages.

5. New `/manage/finance/vehicle-obligations`: upcoming/due/overdue/paid summary; filters by vehicle/source/obligation/status/date; desktop table with sensible widths, money right, horizontal scroll and sticky right actions; mobile cards; `Xem lịch`, `Ghi nhận đã trả`, `Liên kết phiếu chi` by permission.

6. Drawers/dialogs: payment schedule/detail; record payment and link/create receipt; partnership settlement with each eligible booking/excluded line; contract preview/upload.

PERMISSION
Owner full. Manager has no amounts by default unless separately granted. Staff/viewer has no finance tab, amounts, contract or balance-leaking warning. View-only gets an explicit read-only surface. Source/ratio/payment edits expose audit history.

STATES/RESPONSIVE
Loading, no obligations, partial setup, calculation/upload error, overdue, paid, success, denied and concurrent conflict. Desktop 1440 and mobile 390; tablet when behavior changes.

Reuse AppShell, PageHeader, Tabs, Card, FormField, CurrencyField, Select, Upload, StatusTag, DataTable, MobileCard, Drawer/ResponsiveDialog, ConfirmDialog, Toast, Skeleton and Empty/Error. Do not duplicate per source.

DELIVERABLE
`B3 — Handoff` with formulas, state coverage, permissions, reused components and dependencies. Do not design OCR or maintenance.
```

---

## Prompt 4/4 — Documents/OCR, Maintenance/KM, Handover, Audit

```text
Continue in the connected XePrime Figma file. Read `12_VEHICLE_360_MANAGEMENT.md` completely and inspect Prompt 1–3 outputs.

Work only in `13 — Vehicle 360 Management — Proposed v2` lanes `04 — Documents, Maintenance & Handover`, `05 — Responsive & State Audit`, and `99 — Handoff Notes`. Do not alter anything outside Proposed v2 or any shared main component.

GOAL
Complete the loop: documents are safely reviewed through OCR; confirmed return odometer updates the vehicle; maintenance becomes actionable and availability-aware; the whole Proposed v2 remains consistent.

DESIGN
1. Vehicle tab `Giấy tờ`: cards for `Đăng ký/Cà vẹt`, `Đăng kiểm`, `Bảo hiểm`, `Khác`; statuses `Chưa có`, `Đang xử lý`, `Cần kiểm tra`, `Còn hiệu lực`, `Sắp hết hạn`, `Đã hết hạn`, `Không đọc được`; image/PDF upload, preview, replace, archive/history. Documents are optional; expiry warns only.

2. OCR responsive drawer/dialog: upload progress; processing; cannot-read/retry/manual; extracted-field review with confidence/source highlight; `Hiện tại` vs `Nhận dạng` for relevant owner/address/plate/chassis/engine/date fields; select individual fields before update; never auto-overwrite and do not make Apply-all primary.

3. Vehicle tab `Bảo dưỡng & KM`: odometer/source/time; oil interval; last-service KM; calculated next/remaining KM; `Chưa đủ dữ liệu` instead of fake 0; history/upcoming; maintenance drawer; manual correction reason; high-friction permission warning for decreasing KM.

4. New `/manage/maintenance`: overdue, due soon, in maintenance and missing-KM task-first views/filters; document-expiry may be related filter but not a maintenance record; scheduling shows availability-blocking period and explains status alone is insufficient.

5. Handover integration: inspect `06 — Rental Operations` first. If handover exists, duplicate relevant frames into Proposed v2 and extend them; do not create duplicate navigation. Pickup/return capture odometer, fuel, condition, photos, notes, confirmation. Validate return KM >= pickup KM and show vehicle/maintenance impact. Cover missing/suspicious KM, upload error, draft, confirmed and read-only. Desktop drawer/dialog; mobile may be full-screen responsive dialog.

6. Cross-surface warnings: concise document/maintenance indicators on fleet cards and up to 3 prioritized Vehicle 360 alerts; no sensitive finance leak.

FINAL AUDIT
Audit all Proposed v2 frames for component reuse/duplicates; tokens/type/spacing/radius/status colors; navigation/Vietnamese terms; desktop 1440/tablet 768/mobile 390; one-row non-wrapping mobile tabs; table widths/money alignment/horizontal scroll/sticky action; loading, empty, no-results, null, error/retry, success, disabled, read-only, denied, upload, conflict; focus order, focus visibility, keyboard, labels, non-color cues and 44px touch targets; verify no existing section/main component changed.

Create a coverage matrix linking every route/tab/drawer to desktop/mobile/state frames. Annotate any unrendered low-value combination instead of silently marking complete.

DELIVERABLES
Completed lane 04; lane 05 audit issues as Blocker/Major/Minor; `99 — Handoff Notes` with frame, route, responsive, component, formula/rule and implementation dependencies; final list of existing nodes changed outside Proposed v2 — expected answer `None`.

Do not write application code and do not merge Proposed v2 into canonical sections. Merge only after human approval.
```

## Sau 4 prompt

Duyệt Proposed v2 rồi mới merge theo từng frame đã duyệt:

1. xác định frame v2 và frame cũ nó thay thế;
2. giữ frame cũ trong archive, không xóa;
3. copy frame v2 vào canonical section;
4. merge `V360/Local/*` vào Foundations trong một lượt riêng;
5. chạy coverage audit lại.

Không gộp merge vào bốn prompt sáng tạo trên.

