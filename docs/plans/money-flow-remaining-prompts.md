# Prompt cho các phase còn lại — luồng tiền XePrime

> Ngày: 11/09/2026 · Dùng sau khi clear agent.
> Mỗi mục dưới đây là MỘT prompt độc lập, tự chứa đủ ngữ cảnh. Copy nguyên khối vào agent mới.
> Kế hoạch gốc: [`hi-n-t-i-c-n-ho-n-logical-dusk.md`](hi-n-t-i-c-n-ho-n-logical-dusk.md)

---

## Đã xong (Phase 0–5) — để agent mới biết đừng làm lại

| Phase | Nội dung | Bằng chứng |
| --- | --- | --- |
| 0 | ADR 0033 (Ví điểm, phân bổ cọc, định tuyến kết cục) | `docs/decisions/0033-money-ledger-and-deposit-allocation.md` |
| 1 | Công thức `D + S + IV + IP`, `resolveHoldAllocation`, 4 cột tiền trên `booking_holds` | `packages/types/src/fee-policy.ts`, migration `20260911090000_deposit_money_lines` |
| 2 | Mốc 2h/4h đếm xuôi từ `acceptedAt`, countdown 2 chặng, nhắc hạn T+60 | `packages/types/src/holds.ts`, migration `20260911140000_hold_payment_window_2h` |
| 3 | `bank_accounts` + mở lại luồng hoàn tiền đang tắc | `apps/api/src/modules/bank-accounts/`, migration `20260911160000_bank_accounts` |
| 4 | `wallets` / `wallet_entries` / `withdrawal_requests` + cắt hoàn tiền sang ví | `apps/api/src/modules/wallet/wallet.service.ts`, migration `20260911180000_wallet_ledger` + `20260911190000_refund_to_wallet` |
| 5 | Rút tiền: khách, gian hàng, hàng đợi admin | `apps/api/src/modules/wallet/`, `apps/web/src/features/wallet/`, tab "Yêu cầu rút" trong `platform-money` |

**Trạng thái xanh lúc bàn giao:** api 1291 test · web 2050 test · types 191 test · typecheck 5 package · lint 0 error · i18n 43 namespace parity khớp · 32 migration không drift.

---

## PROMPT 0 — Commit chọn lọc (làm TRƯỚC mọi thứ)

```
Working tree của repo XePrime đang có hai khối công việc TRỘN LẪN và tôi cần tách chúng ra
trước khi làm tiếp.

Khối của tôi (luồng tiền, Phase 1–5 theo docs/plans/hi-n-t-i-c-n-ho-n-logical-dusk.md):
- packages/types/src/fee-policy.ts, holds.ts, status/hold.ts, status/wallet.ts,
  status/hold-refund.ts, status/billing.ts, api.ts, holds.test.ts, fee-policy.test.ts
- prisma/schema.prisma + 6 migration 20260911*
- apps/api/src/modules/{wallet,bank-accounts}/ (mới), holds/, booking-requests/,
  fee-policies/, pricing/, customer-trips/, openapi/api-tags.ts, app.module.ts
- apps/api/test/{wallet-ledger,withdrawal-flow,bank-accounts}.spec.ts + các spec đã sửa
- apps/worker/src/jobs/booking-hold-expiry.ts, src/main.ts
- apps/web/src/features/{wallet,bank-accounts}/ (mới), trips/, platform-money/,
  subscription/, fee-policies/, notifications/
- apps/web/src/components/data-display/Countdown.*
- apps/web/src/app/(public)/account/{balance,bank-accounts}/,
  apps/web/src/app/(manage)/manage/balance/
- apps/web/src/constants/{routes,nav,account-nav}.ts + test tương ứng
- packages/domain/messages/{vi,en}/{wallet,bank-accounts,trips,fee-policies,domain,errors,
  navigation,platform-money}.json
- packages/api-client/src/query-keys.ts
- apps/web/src/i18n/namespaces.ts, apps/web/messages/{vi,en}/index.ts
- docs/decisions/0033-*.md + README.md + 0023/0025 (banner ghi đè), CLAUDE.md,
  docs/completion-roadmap.md, docs/plans/*

Khối của NGƯỜI KHÁC (module badges — chuông/chat realtime), TUYỆT ĐỐI KHÔNG đụng:
- apps/api/src/modules/badges/, apps/web/src/features/badges/,
  apps/worker/src/jobs/badge-projection.ts, apps/worker/test/badge-projection.test.ts,
  packages/types/src/badges.ts, prisma/src/badges.ts
- và phần liên quan badges trong packages/types/src/index.ts, prisma/schema.prisma

Việc cần làm:
1. Liệt kê `git status` và phân loại TỪNG file vào một trong hai khối. File nào không chắc
   thì HỎI tôi, đừng đoán.
2. Với packages/types/src/index.ts và prisma/schema.prisma — hai file cả hai khối cùng sửa —
   kiểm tra diff và cho tôi biết phần nào của ai.
3. Tạo branch từ develop và commit CHỈ khối của tôi, chia theo phase nếu hợp lý
   (feat(api): money ledger / feat(web): wallet UI / docs: ADR 0033...).
4. TUYỆT ĐỐI KHÔNG dùng `git add -A` hay `git add .` — Phase 0 của tôi đã từng bị cuốn nhầm
   vào commit push-notification của người khác vì đúng lý do đó.
5. Không merge, không force, không đụng git stash (có 2 stash của tôi phải giữ nguyên).

Sau khi commit, chạy `pnpm --filter @xeprime/api test` và `pnpm --filter @xeprime/web test`
để xác nhận branch mới vẫn xanh.
```

---

## PROMPT 1 — Phase 6: công tắc cọc của gian hàng

```
Repo XePrime (d:\Softrent\Xeprime). Đọc CLAUDE.md trước. KHÔNG đụng apps/mobile.

NHIỆM VỤ: Phase 6 trong docs/plans/hi-n-t-i-c-n-ho-n-logical-dusk.md — công tắc bật/tắt thu
cọc cho gian hàng tuyến gói.

BỐI CẢNH SẢN PHẨM (đã chốt với product owner):
- Tuyến hoa hồng: cọc BẮT BUỘC, không tắt được (ADR 0032 điều 2).
- Tuyến gói: gian hàng có CÔNG TẮC. Bật ⇒ khách cọc trước, XePrime giữ y hệt tuyến hoa hồng.
  Tắt ⇒ không cọc, gian hàng tự liên hệ thoả thuận với khách (giúp shop dễ chốt đơn).

HIỆN TRẠNG (đã có, đừng dựng lại):
- `PLAN_FEATURE.ESCROW_HOLD` đã khai ở packages/types/src/status/billing.ts:93 nhưng CHƯA
  cấp cho gói nào (không nằm trong FULL_MANAGE_FEATURES, dòng ~116-118 có ghi chú "chưa thi công").
- `computeCustomerFees` (packages/types/src/fee-policy.ts) đã nhận tham số `depositRequired`,
  mặc định suy từ tuyến: commission → true, package → false.
- `PricingService.customerFeesFor(tenantId, baseAmount, quoteIsEstimate, opts)` đã nhận
  `opts.depositRequired`.
- `BookingRequestsService.approve` đã phân nhánh theo `fees?.holdAmount`: có thì `approveWithHold`,
  không thì tạo đơn ngay (dòng ~979). NHÁNH KHÔNG-CỌC ĐÃ CHẠY ĐƯỢC, không cần viết mới.
- `bookings.deposit_collection_mode` (platform|direct|none) đã có cột, CHECK đã có, nhưng
  CHƯA ai ghi vào.

VIỆC CẦN LÀM:
1. Bảng mới `tenant_payment_settings` (tenantId PK, `deposit_collection_enabled` bool default
   false, updatedBy, updatedAt). KHÔNG nhét vào `tenant_profiles.settings_json`: cấu hình quyết
   định có thu tiền khách hay không phải là cột có kiểu, có CHECK, có audit.
2. Cấp `ESCROW_HOLD` cho `FULL_MANAGE_FEATURES` + seed (prisma/src/seed/system.ts), cập nhật
   ghi chú "chưa thi công".
3. `DepositPolicyService` mới trong apps/api/src/modules/holds/:
   `resolveForTenant(tenantId) → { required, reason }`
   - billingMode = commission → required = true LUÔN (không tắt được)
   - billingMode = package → required = gói có ESCROW_HOLD && depositCollectionEnabled
   - Đọc billingMode từ `BillingService.billingModeFor` — KHÔNG đọc `tenants.tenant_type`
     (CLAUDE.md cấm).
4. `PATCH /shop/payment-settings` — `@TenantScoped` + `@RequiresFeature(ESCROW_HOLD)` + permission
   quản trị gian hàng. `tenant_id` từ membership, KHÔNG từ body.
5. Nối `DepositPolicyService` vào `commitDecision` trong booking-requests.service.ts để truyền
   `depositRequired` vào `customerFeesFor`.
6. Ghi `bookings.deposit_collection_mode` lúc tạo đơn: 'platform' khi có hold, 'direct' khi không.
   ĐÓNG BĂNG lúc tạo — bật/tắt sau đó KHÔNG đổi cách hiểu đơn đã chạy (ADR 0025 ràng buộc 4).
7. Web: apps/web/src/app/(manage)/manage/shop/payment-settings/page.tsx +
   features/shop/components/DepositToggleCard.tsx. Tuyến hoa hồng thấy công tắc BẬT + KHOÁ kèm
   giải thích, KHÔNG ẩn (ADR 0027 điều 4: ẩn nút chỉ là trang trí, chặn thật ở server).
8. UI đơn không-cọc phải nói rõ: "Gian hàng sẽ liên hệ để thoả thuận cọc trực tiếp — XePrime
   không thu hộ và không đối soát khoản này" (ADR 0028 điều 9; KHÔNG dùng từ "đi đêm").
9. i18n vi+en cho mọi chữ mới.

VERIFY:
- tenant gói TẮT cọc → duyệt yêu cầu tạo đơn ngay, không có `booking_holds`,
  `deposit_collection_mode = 'direct'`.
- bật lại → hold sinh, mode = 'platform'.
- tenant tuyến hoa hồng gọi thẳng `PATCH /shop/payment-settings` bằng curl → 403.
- tenant gói không có cờ ESCROW_HOLD → 403.
- `pnpm --filter @xeprime/api test`, `pnpm --filter @xeprime/web test`,
  `pnpm --filter @xeprime/web i18n:check`.
```

---

## PROMPT 2 — Phase 9: đối soát 3 vế (nên làm trước 7/8)

```
Repo XePrime (d:\Softrent\Xeprime). Đọc CLAUDE.md trước. KHÔNG đụng apps/mobile.

NHIỆM VỤ: Phase 9 trong docs/plans/hi-n-t-i-c-n-ho-n-logical-dusk.md — mở rộng đối soát hằng
ngày từ 1 vế thành 3 vế (ADR 0025 điều 6).

VÌ SAO CẦN: XePrime nay giữ tiền của người khác ở CẢ HAI tuyến (cọc `D` là tiền chủ xe, `IV`/`IP`
giữ hộ hãng bảo hiểm). Không tách được ba con số mỗi ngày nghĩa là không biết mình đang tiêu tiền
của ai — và đó là cách một nền tảng chết vì kế toán chứ không vì sản phẩm.

CÔNG THỨC BẮT BUỘC (ADR 0025 điều 6):
  Số dư ngân hàng cuối ngày
    = Tiền CỦA NỀN TẢNG   (phí dịch vụ đã ghi nhận + tiền gói đã thu − đã chi ra)
    + Tiền GIỮ HỘ         (hold chưa chốt phần custodied + Σ ví (balance + pending)
                           + premium bảo hiểm reserved/issued chưa quyết toán + thuế accrued chưa nộp)
    + Chênh lệch chưa đối soát

HIỆN TRẠNG:
- `BookingHoldsService.dailyReconciliation(date)` ở apps/api/src/modules/holds/booking-holds.service.ts
  (~dòng 763) đang trả MỘT vế: tiền vào ngân hàng ↔ sổ gói/giữ chỗ/hoàn.
- `booking_holds` đã có 4 cột tiền: deposit_amount, service_fee_amount, vehicle_insurance_amount,
  personal_insurance_amount + index `booking_holds_unsettled_idx` (status, created_at) WHERE outcome IS NULL.
- `wallets` có `balance` (KHẢ DỤNG) và `pending_withdraw_amount`. Tổng nghĩa vụ = tổng hai cột.
- `wallet_entries` có unique (wallet_id, kind, source_type, source_ref_id).
- Web: apps/web/src/features/platform-money/components/MoneyOperationsView.tsx đã có 4 tab
  (holds / refunds / withdrawals / reconciliation).

VIỆC CẦN LÀM:
1. Bảng mới `platform_bank_balances` (date PK, balance, source, enteredBy, note, createdAt) —
   SePay webhook KHÔNG gửi số dư tài khoản, nên phải nhập tay.
   `POST /platform/money/reconciliation/bank-balance`.
2. Mở rộng `DailyReconciliationDto`:
   platform:  { serviceFeeRecognized, subscriptionsCollected, total }
   custodied: { holdsUnsettled, walletBalance, walletPending, insuranceReserved, taxAccrued, total }
   outflow:   { withdrawalsPaid, withdrawalsPaidCount, refundsPaid, refundsPaidCount }
   bankBalanceEod: string | null    ← null khi chưa nhập; UI nói rõ, KHÔNG bịa 0
   walletDrift: { wallets: number, amount: string }
   variance
3. `platform.serviceFeeRecognized` = SUM(booking_holds.service_fee_amount) với
   outcome ∈ {settled, split_late_cancel}. ĐỌC CỘT SỐ TIỀN, KHÔNG đọc `purpose` — mọi hold nay
   là mixed (ADR 0033 điều 4, CLAUDE.md có lệnh cấm này).
4. `walletDrift` = số ví có Σ wallet_entries.amount ≠ balance + pending_withdraw_amount.
   Đây chính là phép phát hiện lệch mà ADR 0023 điều 6 đòi.
5. Chuẩn bị đối soát chiều RA: thêm `bank_transactions.direction ('in'|'out')` + `amount_out`,
   `BANK_MATCH_TARGET_TYPE.WITHDRAWAL_REQUEST`, `REFERENCE_CODE_PREFIX` thêm 'XPW'.
   (Mã XPW đã được `WithdrawalService.uniqueCode` sinh sẵn — chỉ thiếu phần khai báo đích khớp.)
6. Web: dựng lại tab `reconciliation` thành 3 khối + ô nhập số dư cuối ngày + cảnh báo ĐỎ khi
   variance ≠ 0 hoặc walletDrift.wallets > 0.
7. i18n vi+en.

VERIFY:
- Seed một ngày có đủ 5 loại giao dịch → ba con số cộng lại bằng bankBalanceEod, variance = 0.
- Cố ý sửa tay `wallets.balance` bằng SQL → walletDrift bắt được.
- Viết test khoá bất biến: KHÔNG hàm nào đọc `booking_holds.purpose` để tính phần giữ hộ.
- `pnpm --filter @xeprime/api test`, `pnpm --filter @xeprime/web test`, i18n:check.
```

---

## PROMPT 3 — Phase 7: bảo hiểm IV/IP (mặc định TẮT)

```
Repo XePrime (d:\Softrent\Xeprime). Đọc CLAUDE.md trước. KHÔNG đụng apps/mobile.

NHIỆM VỤ: Phase 7 trong docs/plans/hi-n-t-i-c-n-ho-n-logical-dusk.md — năng lực thu và phát hành
bảo hiểm chuyến.

RÀNG BUỘC PHÁP LÝ (đọc kỹ): ADR 0028 điều 5 CẤM thu tiền dưới danh nghĩa bảo hiểm khi chưa có
đối tác hợp pháp, biểu phí, chứng nhận và claims flow. Vì vậy: XÂY ĐỦ NĂNG LỰC, nhưng cờ bật/tắt
và biểu phí nằm ở `fee_policies` và MẶC ĐỊNH TẮT. Không được điền tên/logo PVI ở bất cứ đâu.

HIỆN TRẠNG:
- `fee_policies` đã có `vehicle_protection_enabled/percent` (= IV, bảo hiểm xe BẮT BUỘC),
  `trip_insurance_enabled/percent` (= IP, bảo hiểm tai nạn người TUỲ CHỌN), `insurance_partner_name`.
  Cả hai đang false ở version 3 (bản active).
- `computeCustomerFees` đã tính đúng cả hai dòng với `bearer = customer` (ADR 0032 điều 2/4 —
  KHÁCH trả, không phải chủ xe), và nhận `personalAccidentSelected` cho IP.
- `booking_holds` đã có cột `vehicle_insurance_amount` và `personal_insurance_amount`.
- `resolveHoldAllocation` (packages/types/src/fee-policy.ts) đã route IV+IP →
  `insurer_payable` khi settled, → `customer_balance` khi huỷ (hoàn 100%, vì hợp đồng chưa mua).

VIỆC CẦN LÀM:
1. Model `booking_insurance_policies`:
   id, bookingId, tenantId, holdId?, productKind (vehicle_trip | personal_accident),
   status, premiumAmount, partnerName, partnerProductCode, certificateNumber?, certificateUrl?,
   coverageFrom?, coverageTo?, issueAttempts, lastAttemptAt?, lastErrorCode?, lastErrorMessage?,
   nextAttemptAt?, issuedAt?, cancelledAt?, voidedAt?, requestPayloadJson, responsePayloadJson,
   consentAt?, consentSource?, idempotencyKey @unique
   @@unique([bookingId, productKind]), @@index([status, nextAttemptAt])
2. State machine — KHÔNG dùng boolean (ADR 0032 điều 4):
   reserved → issuing → issued → claim
                ↓ lỗi
              failed → (nextAttemptAt) → issuing
   huỷ trước bàn giao → cancelled | issued rồi huỷ → voided
3. Kích hoạt: `BookingsService.transitionWithinTx` khi to = ACTIVE chỉ ĐẶT `nextAttemptAt = now`.
   TUYỆT ĐỐI KHÔNG gọi HTTP partner bên trong transaction DB (CLAUDE.md có lệnh cấm này).
4. Job `apps/worker/src/jobs/insurance-issue.ts` + vòng lặp mới ở worker main.ts (lock key mới,
   nhịp 60s). Claim bằng `updateMany({ where: { id, status: RESERVED }, data: { status: ISSUING } })`.
   Backoff: nextAttemptAt = now + min(2^n, 60) phút.
5. Adapter `apps/api/src/modules/insurance/partner/insurance-partner.port.ts` +
   `noop-insurance.partner.ts` mặc định. Không có adapter thật ⇒ không gọi ai.
6. Hoàn 100% khi huỷ trước bàn giao: nhánh cancel trong `HoldSettlementService.allocateWithinTx`
   đã route IV+IP về customer_balance — chỉ cần lật `booking_insurance_policies` sang `cancelled`
   trong CÙNG transaction.
7. Hàng đợi lỗi cho admin: `GET /platform/money/insurance?status=failed` + retry/void (có lý do,
   có audit) + tab mới trong MoneyOperationsView.
8. Lưu bằng chứng khách CHỌN IP (`consentAt`, `consentSource`) — ADR 0028 điều 5 đòi.
9. i18n vi+en (namespace mới `insurance`).

ĐIỂM CHƯA CHỐT — HỎI TÔI TRƯỚC KHI CODE:
ADR 0032 để mở: phát hành bảo hiểm THẤT BẠI đúng lúc bàn giao thì chặn chuyến, retry, hay đổi xe?
Đề xuất của tôi: KHÔNG chặn chuyến — ghi `failed`, mở support case, báo admin. Chặn một chuyến vì
lỗi API của đối tác là biến sự cố của XePrime thành sự cố của khách. Cần xác nhận.

VERIFY:
- Bật cờ trên một fee policy NHÁP + partner noop trả OK → 2 dòng `issued`.
- noop trả lỗi → `failed` + nextAttemptAt tăng dần + hiện ở hàng đợi admin.
- Huỷ trước bàn giao → `cancelled` + ví khách nhận đủ IV+IP.
- TẮT cờ (trạng thái mặc định) → 0 dòng, job không có việc.
```

---

## PROMPT 4 — Phase 8: thuế T (mặc định TẮT)

```
Repo XePrime (d:\Softrent\Xeprime). Đọc CLAUDE.md trước. KHÔNG đụng apps/mobile.

NHIỆM VỤ: Phase 8 trong docs/plans/hi-n-t-i-c-n-ho-n-logical-dusk.md — khấu trừ và kê khai thuế.

RÀNG BUỘC: ADR 0028 điều 4 — không hard-code con số tham khảo, không bật bằng số thật trước khi
tư vấn thuế xác nhận phân loại. Xây đủ năng lực, cờ `tax_enabled` mặc định TẮT.

QUY TẮC SẢN PHẨM (ADR 0032 điều 3):
- Thuế tính trên giá trị thuê chịu thuế `B`, KHÔNG tính trên bảo hiểm.
- Thuế do CHỦ XE chịu: khấu trừ khỏi khoản XePrime phải trả, KHÔNG cộng vào tổng khách.
- Chỉ phát sinh khi chuyến BẮT ĐẦU. Huỷ trước chuyến → không có thuế.

HIỆN TRẠNG:
- `fee_policies` đã có tax_enabled/tax_percent/tax_label, và CHECK
  `fee_policies_deposit_covers_tax_check` chặn cấu hình `deposit_percent < tax_percent`
  (nếu không, khoản phải trả chủ xe sẽ âm — nền tảng nhận nghĩa vụ nộp thay lớn hơn số nó giữ).
- `computeCustomerFees` đã sinh dòng TAX với `bearer = OWNER` và trả `taxAmount`, `ownerPayableAmount`.
- `bookings.tax_amount` đã có cột (default 0), CHƯA ai ghi.
- `HoldSettlementService.allocateWithinTx` đã đọc thuế từ snapshot qua `taxFromSnapshot()` và trừ
  khỏi phần chủ xe khi outcome = settled.

VIỆC CẦN LÀM:
1. Model `tax_withholdings`:
   id, bookingId @unique, tenantId, sellerProfileId?, taxableBase, percent, label, amount,
   feePolicyId, status (accrued|declared|remitted|reversed), accruedAt, declaredAt?, remittedAt?,
   periodKey VARCHAR(7) ('YYYY-MM' giờ VN), reversalOfId?
   @@index([periodKey, status]), @@index([tenantId, periodKey])
   Các trường percent/label/taxableBase là SNAPSHOT — không join lúc đọc.
2. Ghi dòng thuế trong CÙNG transaction với `to = ACTIVE` (chuyến bắt đầu). Huỷ trước chuyến
   → 0 dòng.
3. Ghi `bookings.tax_amount` lúc tạo đơn từ snapshot.
4. Append-only: sửa sai bằng `reversalOfId`, KHÔNG update `amount`.
5. Báo cáo:
   - Admin: `GET /platform/money/tax/summary?period=YYYY-MM` (tổng theo kỳ / theo
     SellerProfile.entityType / theo tenant, export CSV) + `/rows` + `mark-declared` + `mark-remitted`.
   - Chủ xe: hiện "Thuế đã khấu trừ trong kỳ" ở `/account/tax` (route đã có) và `/manage/finance`.
   - Khách: breakdown KHÔNG có dòng thuế (T không nằm phía khách).
6. i18n vi+en.

VERIFY:
- Bật taxEnabled=7% trên một policy NHÁP → chuyến B=700.000 bắt đầu → 1 dòng `accrued` 49.000đ,
  ví chủ xe nhận D−T = 91.000đ (với D = 20% = 140.000đ).
- Huỷ trước chuyến → 0 dòng thuế.
- Tắt cờ (mặc định) → 0 dòng.
- Kiểm CHECK `deposit_covers_tax` vẫn chặn cấu hình cọc < thuế.
```

---

## PROMPT 5 — Tồn đọng nhỏ

```
Repo XePrime (d:\Softrent\Xeprime). Đọc CLAUDE.md trước. KHÔNG đụng apps/mobile.

Ba việc nhỏ còn sót sau Phase 1–5 của luồng tiền:

1. `/account/payments` vẫn là placeholder `AccountComingSoon`
   (apps/web/src/app/(public)/account/payments/page.tsx).
   Route ROUTES.ACCOUNT.PAYMENTS có docblock nói rõ ý định: "Tiền của các chuyến đã thuê — đọc
   từ `payments`, KHÔNG phải ví". Dựng màn thật: danh sách khoản đã trả theo từng chuyến, phân
   trang server-side. ĐỪNG biến nó thành màn số dư — số dư đã có ở /account/balance.

2. Chạy migration backfill trên STAGING và đối chiếu:
   `prisma/migrations/20260911190000_refund_to_wallet/` có phần backfill chuyển các khoản hoàn
   đang `pending` của khách CÓ tài khoản sang ví điểm. Logic đã được kiểm trên dữ liệu thật ở DB
   dev (dựng 3 khoản, chạy 4 câu SQL, rollback) nhưng CHƯA chạy ở môi trường có dữ liệu thật.
   Sau khi chạy, đối chiếu:
     SELECT SUM(amount) FROM wallet_entries WHERE note LIKE 'Chuyển khoản hoàn%';
     SELECT SUM(amount) FROM hold_refunds WHERE status='credited';
   Hai số phải bằng nhau, và bằng tổng số dư ví tăng thêm.
   Khách VÃNG LAI (customer_user_id IS NULL) phải giữ nguyên `pending` + `bank_transfer`.

3. Rà lại `docs/completion-roadmap.md`: mục R3/R4 đã được sửa ngày 10/09 để phản ánh việc ví và
   rút tiền chuyển từ R4 xuống R3, nhưng bảng trạng thái ở mục 1 ("Marketplace money = Một phần")
   nên cập nhật lại sau khi Phase 6–9 xong.
```

---

## Thứ tự đề nghị

1. **PROMPT 0** (commit) — làm ngay, trước khi context lớn thêm.
2. **PROMPT 1** (Phase 6) — rẻ, không bị chặn bởi gì, và mở được cọc cho tuyến gói.
3. **PROMPT 2** (Phase 9) — trả lời được "XePrime đang giữ tiền của ai" mỗi ngày. Nên có TRƯỚC
   khi bật bảo hiểm/thuế, vì hai thứ đó làm phần "giữ hộ" phức tạp hơn.
4. **PROMPT 3 / 4** (Phase 7/8) — chặn bởi hợp đồng bảo hiểm và tư vấn thuế, nhưng code xây trước
   được vì mặc định TẮT.
5. **PROMPT 5** — bất cứ lúc nào.

## Ba việc ngoài code, chặn việc bật tiền thật (ADR 0028 release gate)

1. Ý kiến pháp lý về thu hộ/chi hộ — với ADR 0032, **cả hai tuyến** đều khiến XePrime giữ tiền
   của người khác. Cái lách của ADR 0021 ("hold đúng bằng hoa hồng nên không phải trả ai") không
   còn đúng ở bất kỳ tuyến nào.
2. Hợp đồng với đối tác bảo hiểm: biểu phí, phạm vi, cấp chứng nhận, claims flow.
3. Tư vấn thuế xác nhận phân loại giao dịch và nghĩa vụ nộp thay.
