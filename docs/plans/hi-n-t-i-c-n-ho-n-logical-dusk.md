# Kế hoạch — Luồng tiền: QR cọc, Ví điểm, Rút tiền

> Ngày: 10/09/2026 · Nhánh gốc: `develop`
> ADR chi phối: **0032** (mới nhất, thắng trong phạm vi ghi đè) · 0022 · 0024 · 0025 · 0028 · 0029

## Context

Bốn luồng tiền của XePrime đang đứt ở những chỗ khác nhau, và chúng buộc phải đi cùng một đợt:

1. **Khách cọc thuê xe** — bắt buộc cho tuyến hoa hồng; tuyến gian hàng có công tắc bật/tắt để shop dễ chốt đơn.
2. **Gian hàng mua gói** — QR quét, tự kích hoạt khi tiền về.
3. **Rút điểm về tiền** — tạo giao dịch rút, khai STK, admin chuyển tay.
4. **Hủy cọc** — hoàn theo mốc, phân bổ theo policy đã đóng băng.

Lý do phải làm chung: theo ADR 0032, khoản cọc `D` là **một phần của giá thuê gốc**, nên ngay cả tuyến hoa hồng cũng sinh khoản **XePrime phải trả chủ xe** (`D − T`). Không có sổ công nợ + đường rút tiền thì tiền cọc vào rồi mắc kẹt — đúng tình trạng hiện tại.

Kết quả mong muốn: một vòng tiền khép kín, đối soát được ba vế mỗi ngày, không bút toán mồ côi và không cộng đôi.

---

## Hiện trạng thật (khảo sát 10/09/2026 — khác tài liệu)

> ⚠️ `CLAUDE.md:79` ghi SePay *"chưa triển khai W4"*; `docs/completion-roadmap.md:24,85` ghi *"đã có trên feature branch"*. **Cả hai lỗi thời.** PR #57 (`feat/api-r3-marketplace-money`) và lát cắt subscription-payments **đã merge vào `develop`**. Không xây lại.

### Đã chạy được

| Mảng | Vị trí |
| --- | --- |
| Webhook SePay (time-safe Apikey, idempotent bằng `@@unique([provider,providerTxId])`, ghi thô trước khớp sau) | `apps/api/src/modules/sepay/sepay.service.ts` |
| Một sổ `bank_transactions`, khớp 2 đích qua tiền tố `XPG…`/`XPH…` | `schema.prisma:3004` · `types/src/status/billing.ts:294` |
| Admin đối soát: list / match tay / ignore / suggest | `/platform/bank-transactions/*` |
| Mua gói → invoice `XPG…` → webhook → kích hoạt cùng transaction | `billing.service.ts:849, 977, 1104` |
| Vòng đời `booking_holds` + worker hết hạn nhả lịch | `holds/booking-holds.service.ts` · `worker/jobs/booking-hold-expiry.ts` |
| Admin money: hàng đợi hold / refund / đối chiếu ngày | `/platform/money/*` · `web/features/platform-money/` |
| `fee_policies` versioned, đã có `taxEnabled/Percent`, `tripInsurance*`, `vehicleProtection*`, `insurancePartnerName` | `schema.prisma:3199` |
| **Tầng types cho ví/escrow đã viết xong + có test** (`WALLET_ENTRY_KIND`, `WITHDRAWAL_STATUS`, `WITHDRAWAL_TERMS`, `BOOKING_HOLD_PURPOSE.ESCROW`, `isOutcomeAllowed`, `creditsShopWallet`) — **mồ côi**, chưa model/module nào dùng | `types/src/status/wallet.ts` · `types/src/status/hold.ts` · `types/src/holds.ts:85` |
| `PLAN_FEATURE.ESCROW_HOLD` đã khai (chưa cấp cho gói nào) | `types/src/status/billing.ts:93` |
| `buildVietQrUrl` chuẩn (đã xử lý `%20`→`+`) | `packages/domain/src/vietqr.ts` |

### Đứt đoạn / sai so với ADR 0032

| # | Vấn đề | Vị trí |
| --- | --- | --- |
| **G1** | **Luồng hoàn tiền TẮC**: `provideRefundAccount()` không controller nào gọi, trong khi `markRefundPaid` chặn cứng nếu thiếu STK ⇒ admin không bấm "đã chuyển" được. Web có state `refundNeedsAccount` nhưng **không có form nhập STK**. | `hold-settlement.service.ts:238,283` · `TripHoldPanel.tsx:128` |
| **G2** | **Hold = phí dịch vụ S**, không phải `D+S+IV+IP` — di sản ADR 0021 đã bị 0032 thay. | `fee-policy.ts:272-274` |
| **G3** | **Thiếu mức cọc `D`** — `fee_policies` không có cột nào. | `schema.prisma:3199` |
| **G4** | **Thuế đang `bearer: CUSTOMER`** — ADR 0032 điều 3: thuế phía **chủ xe**, khấu trừ khỏi khoản phải trả, **không** cộng vào tổng khách. | `fee-policy.ts:225-233` |
| **G5** | **Bảo hiểm xe `IV` đang `bearer: OWNER`** — ADR 0032 điều 2/4 (mới hơn 0028): cả `IV` lẫn `IP` do **khách** trả. | `fee-policy.ts:244-257` |
| **G6** | **Mốc sai**: `holdPaymentWindowMinutes` mặc định `1440` (24h) thay vì **2h**; `freeCancelUntil` tính **ngược từ `pickupAt`** thay vì **xuôi từ `acceptedAt`**. ADR 0032:91 gọi đây là implementation gap phải sửa. | `schema.prisma:3211` · `holds.ts:101` · `booking-holds.service.ts:189` |
| **G7** | **Không có sổ công nợ**: `wallets`/`wallet_entries`/`withdrawal_requests` = 0 model, 0 module, 0 endpoint. | — |
| **G8** | **Tuyến gói không có đường cọc** — `holdAmount = null` khi không có `serviceFee`; chưa có công tắc. | `fee-policy.ts:272` |
| **G9** | **BUG TIỀN THẬT**: hold `UNDERPAID` (khách đã chuyển một phần) hết hạn → `EXPIRED` mà **không sinh `HoldRefund`** ⇒ tiền khách kẹt, không ai hoàn. | `worker/jobs/booking-hold-expiry.ts:29,52` |
| **G10** | **Seed không tạo `fee_policies`** ⇒ `findEffective()` trả `null` ⇒ **không hold nào sinh ra** trên demo/dev. | `prisma/src/seed/system.ts` |
| **G11** | `decideOutcome()` là all-or-nothing (hủy muộn → `FORFEITED` toàn bộ), trong khi ADR 0032 đòi **chia 50/50 `D+S`** và **hoàn 100% `IV+IP`**. | `hold-settlement.service.ts:452-474` |
| **G12** | 2 bản copy-paste VietQR ở web, không dùng helper chung. | `InvoicePaymentPanel.tsx:117` · `TripHoldPanel.tsx:150` |
| **G13** | `CancelTripDialog` vẫn nói "không hoàn lại đồng nào" (design cũ); ADR 0032 điều 5 đòi hiện chính sách hoàn theo mốc + cảnh báo hủy sát giờ. | `CancelTripDialog.tsx:40-48` |

> Đính chính khảo sát: rule "bốn biến `SEPAY_*` khai cùng nhau" **đã có** ở `env.schema.ts:287-305` — không phải gap.

---

## Quyết định sản phẩm đã chốt

| # | Quyết định |
| --- | --- |
| 1 | **Bản chất = sổ công nợ phải trả**; **nhãn hiển thị = "Ví điểm" / "điểm thưởng"**, 1 điểm = 1 VND. Chỉ sinh từ 4 nguồn: hoàn cọc · bồi thường hủy muộn · chuyển thừa · khoản phải trả chủ xe. **Không** nạp, **không** chuyển giữa user, **không** thanh toán nội bộ, **không** hết hạn, **không** thu hồi |
| 2 | **Cả khách và chủ xe/gian hàng** đều có ví điểm và rút tiền |
| 3 | **Cọc tuyến gói**: gian hàng có công tắc bật/tắt. Bật ⇒ XePrime giữ cọc y hệt tuyến hoa hồng. Tắt ⇒ gian hàng tự thỏa thuận. Tuyến hoa hồng: **bắt buộc**, không tắt được |
| 4 | **Mốc theo ADR 0032**: 2h trả cọc + 4h hủy miễn phí, **cả hai từ `acceptedAt`**. QR Pay thành công **không** restart mốc 4h. UI hai countdown 60 phút |
| 5 | **Mức cọc `D` do nền tảng đặt**, admin cấu hình trong `fee_policies`, có sàn/trần, áp chung hai tuyến |
| 6 | **Bật đầy đủ `IV`/`IP` và thuế `T`** — xây đủ năng lực; **bật/tắt + biểu phí nằm ở `fee_policies`** để bật đúng ngày có hợp đồng PVI (ADR 0028 điều 5 cấm thu khi chưa có partner/biểu phí/chứng nhận/claims) |
| 7 | **No-show = như hủy muộn**: `D+S` chia 50/50, hoàn 100% `IV+IP`, không thuế |

### Công thức tiền (ADR 0032)

```text
Khách trả online khi cọc  =  D + S + IV + IP
  D   cọc — MỘT PHẦN của giá thuê gốc B (không phải phí cộng thêm)
  S   phí nền tảng phía khách — hoa hồng 10%×B · gói 0
  IV  bảo hiểm xe/chuyến, bắt buộc      IP  bảo hiểm tai nạn người, tùy chọn

B − D  khách trả TRỰC TIẾP chủ xe khi nhận xe — XePrime không thu hộ, không đối soát
T      thuế — khấu trừ khỏi khoản phải trả chủ xe, KHÔNG cộng vào tổng khách,
       chỉ phát sinh khi chuyến bắt đầu
```

Ví dụ chuẩn ADR (VF5 một ngày): `B=700k`, `S=70k`, `IV=130k` → khách thấy `900k`; `D=20%×B=140k` → QR Pay ngay `340k`, trả trực tiếp `560k`; `T=7%×B=49k` → XePrime phải trả chủ xe `D−T=91k`.

### Bảng định tuyến kết cục (nguồn của `resolveHoldAllocation`)

| Sự kiện | D | S | IV + IP | T |
| --- | --- | --- | --- | --- |
| Quá 2h chưa trả → auto-cancel | — | — | — | — |
| Khách hủy ≤ 4h từ `acceptedAt` | → ví khách | → ví khách | → ví khách | không |
| Khách hủy > 4h, trước bàn giao | 50% ví chủ xe / 50% XePrime | 50/50 như D | → **ví khách 100%** | không |
| **No-show** (quyết định 7) | 50/50 | 50/50 | → ví khách 100% | không |
| Chủ xe/gian hàng hủy | → ví khách | → ví khách | → ví khách | không, + đếm `owner_cancel` |
| Chuyến bắt đầu (bàn giao) | giữ | → doanh thu XePrime | → phải trả hãng BH khi `issued` | **T phát sinh** → `tax_withholdings` |
| Chuyến hoàn thành | **D − T → ví chủ xe** | (đã ghi nhận) | (đã ghi nhận) | → sổ thuế `accrued` |
| Chuyển thừa | — | — | — | phần thừa → ví khách (`hold_overpay`) |

Ba nơi ghi: **ví** → `wallet_entries` · **doanh thu XePrime** → suy từ `booking_holds.service_fee_amount` (outcome `settled`/`split_late_cancel`) + `subscription_invoices.paid` · **thuế** → `tax_withholdings` · **phải trả BH** → `booking_insurance_policies`.

---

## Phase 0 — ADR 0033 (làm trước khi code)

`docs/decisions/0033-money-ledger-and-deposit-allocation.md` — Accepted, ghi đè một phần 0023, 0025, 0028. Nội dung bắt buộc:

1. **Ghi đè tường minh ADR 0023 ràng buộc 1 và ADR 0028 điều 8 về TÊN GỌI**: UI dùng "Ví điểm"/"điểm thưởng". Giữ nguyên **toàn bộ** ràng buộc bản chất: không nạp, không chuyển ngang, không thanh toán nội bộ, không trả lãi, **không hết hạn, không thu hồi**, ledger append-only, rút về STK đã xác minh. Ghi rõ rủi ro đã được nêu và chấp nhận.
2. **Bảng định tuyến outcome** ở trên, gồm nhánh 50/50 và no-show.
3. **`hold_refunds` → `wallet_entries`**: cắt sang ghi có ví; giữ đường chuyển khoản tay **vĩnh viễn** cho khách vãng lai (không có tài khoản).
4. **Cọc mixed**: một hold nay chứa cả tiền XePrime (`S`) lẫn tiền giữ hộ (`D+IV+IP`) ⇒ `booking_holds.purpose` **không còn đủ** để tách quỹ. Tách quỹ đọc từ **cột số tiền**, không đọc `purpose`.
5. Nhắc lại: ADR 0028 release gate 4 (ý kiến pháp lý thu hộ/chi hộ) **vẫn chặn** tiền khách thật — không tự coi là đã vượt.

Đồng thời sửa `CLAUDE.md:79` và `docs/completion-roadmap.md:24,85` cho khớp hiện trạng.

---

## Phase 1 — Từ vựng tiền + công thức `D+S+IV+IP` ⭐ nền của mọi thứ

Mọi snapshot ghi bằng công thức cũ là **không sửa lại được** (ADR 0024 cấm tính lại giá đơn đã tạo) ⇒ phase này phải xong trước khi có đồng tiền thật nào.

**`packages/types/src/fee-policy.ts`**
- `FEE_LINE` thêm `DEPOSIT` (D), `PERSONAL_ACCIDENT` (IP). Giữ `VEHICLE_PROTECTION`=IV, `SERVICE_FEE`=S, `TAX`=T.
- `FEE_BENEFICIARY` thêm `OWNER` — D là phần giá thuê gốc, người hưởng là chủ xe.
- **Sửa bearer (G4/G5)**: `TAX` → `OWNER`; `VEHICLE_PROTECTION` → `CUSTOMER`.
- `FeePolicyValues` thêm `depositPercent`, `depositMinAmount`, `depositMaxPercent`, `personalAccidentEnabled/Percent`. **Giữ nguyên tên cột `vehicleProtection*`** (chỉ đổi docblock) để khỏi migration rename.
- `computeCustomerFees` viết lại: nhận `depositRequired`, `personalAccidentSelected`; trả thêm `depositAmount`, `onlineAmount` (=D+S+IV+IP), `payAtPickupAmount` (=B−D), `ownerPayableAmount` (=D−T), `taxAmount`. `holdAmount = onlineAmount`.
- Hàm thuần mới `resolveHoldAllocation(lines, outcome) → Array<{target, amount}>`, `target ∈ {customer_balance, owner_balance, platform_revenue, tax_ledger, insurer_payable}` — dùng chung api/worker/preview admin.
- `feePolicyActivationBlockers` thêm `deposit_percent_out_of_range`, `personal_accident_requires_partner`, `free_cancel_shorter_than_payment_window`.

**`packages/types/src/status/hold.ts`**: `BOOKING_HOLD_OUTCOME` thêm `SETTLED` (chuyến hoàn thành, phân bổ theo allocation) và `SPLIT_LATE_CANCEL` (50/50). `KEPT` thành **legacy chỉ-đọc**; cập nhật `isOutcomeAllowed` + `creditsShopWallet`.

**Migration `<ts>_money_lines/`**
```
fee_policies   + deposit_percent NUMERIC(5,2) NOT NULL DEFAULT 0
               + deposit_min_amount NUMERIC(14,2) NOT NULL DEFAULT 0
               + deposit_max_percent NUMERIC(5,2) NOT NULL DEFAULT 30
               + personal_accident_enabled BOOL NOT NULL DEFAULT false
               + personal_accident_percent NUMERIC(5,2)
booking_holds  + deposit_amount, service_fee_amount,
                 vehicle_insurance_amount, personal_insurance_amount  NUMERIC(14,2) DEFAULT 0
               + CHECK (tổng 4 cột = amount)
               + CHECK outcome mở rộng cho settled / split_late_cancel
bookings       + deposit_amount_online, owner_payable_amount, tax_amount NUMERIC(14,2)
               + deposit_collection_mode VARCHAR(20)   -- platform|direct|none, đóng băng lúc tạo
```
> Vì sao 4 cột tiền chứ không chỉ jsonb: đối soát tách quỹ (Phase 8) phải `SUM()` phần giữ hộ vs phần nền tảng — không aggregate jsonb cho việc đó. CHECK tổng = `amount` chặn allocation sai ngay từ khi ghi.

**API**: `pricing.service.ts:117` thêm 2 cờ · `booking-holds.service.ts:194-207` ghi 4 dòng allocation + 4 cột · `booking-requests.service.ts:937-980` truyền cờ (nhánh `fees?.holdAmount` giữ nguyên hình dạng) · `holds/dto/hold.dto.ts` thêm breakdown.

**Seed (G10)**: thêm `seedFeePolicy()` cạnh `seedPlans()` trong `prisma/src/seed/system.ts` — một policy `active`, `serviceFeePercent=10`, `depositPercent=20`, thuế/bảo hiểm **tắt**. Idempotent bằng `seedId` + `upsert`.

**Verify**: `pnpm --filter @xeprime/types test` với ca ví dụ ADR 0032 (ra đúng 900k / 340k / 560k / 91k) · `pnpm --filter @xeprime/api test` (holds, pricing) · duyệt một yêu cầu, xem 4 cột cộng đúng `amount`.

---

## Phase 2 — Mốc 2h/4h từ `acceptedAt` (G6)

| File | Sửa |
| --- | --- |
| `types/src/holds.ts:22,32,101` | `HOLD_PAYMENT_WINDOW_MINUTES` 1440 → **120**; `holdFreeCancelUntil(pickupAt,…)` → **`(acceptedAt,…)`**, viết lại docblock; thêm `HOLD_COUNTDOWN_SEGMENT_MINUTES = 60` |
| `types/src/holds.test.ts:54,61-82` | Viết lại theo mốc `acceptedAt` |
| `schema.prisma:3211` | `holdPaymentWindowMinutes @default(120)` |
| `booking-holds.service.ts:153-192` | Nhận `acceptedAt`; `holdExpiresAt(acceptedAt,…)`, `holdFreeCancelUntil(acceptedAt,…)`. Giữ kẹp `min(windowEnd, pickupAt)` + guard 15' |
| `booking-requests.service.ts` (`approveWithHold`) | Truyền **cùng một** `acceptedAt` cho `decidedAt` và hold — hai mốc không được lệch |
| `worker/jobs/booking-hold-expiry.ts` | Thêm nhắc ở T+60: cột `booking_holds.payment_reminded_at` + `updateMany` điều kiện `IS NULL` |
| `TripHoldPanel.tsx:99-100` | Thay text tĩnh bằng countdown sống: trích `RespondDeadline.tsx` thành `components/data-display/Countdown.tsx` dùng chung, render 2 segment 60' |
| `FeePolicyFormModal.tsx:153` | Mặc định form 120 |

**Migration**: chỉ đổi `DEFAULT`. **Không backfill `fee_policies` đang `active`** — bản active bất biến theo thiết kế; admin tạo version mới rồi kích hoạt. Ghi vào header migration.

**Hold đang mở: KHÔNG rút ngắn** — rút `expires_at` xuống 2h có thể expire đúng lúc tiền đang trên đường về ⇒ webhook trả `hold_closed`, tiền thành mồ côi. Hold cũ chạy hết mốc cũ.

**Gộp luôn G12**: hai bản copy VietQR import `buildVietQrUrl` từ `@xeprime/domain`.

**Verify**: duyệt → `expires_at ≈ decided_at+2h`, `free_cancel_until ≈ decided_at+4h`; sửa `pickup_at` không đổi hai mốc; worker nhắc đúng một lần.

---

## Phase 3 — `bank_accounts` + mở lại luồng hoàn tiền (G1) · chạy song song từ đầu

Bug sống, chặn vận hành, độc lập mọi phase khác.

**Gom 2 trong 4 chỗ STK** (bốn chỗ hiện tại là ba khái niệm khác nhau):

| Chỗ | Khái niệm | Xử lý |
| --- | --- | --- |
| `SellerProfile.bank*` | TK **nhận tiền** của gian hàng | → gom (expand: giữ cột cũ) |
| `HoldRefund.bank*` | TK **nhận tiền** của khách | → gom; cột cũ giữ làm **snapshot bằng chứng** |
| `TenantProfile.bank*` + `qrUrl` | TK **thu tiền** của shop | **giữ nguyên** — chiều ngược, quyền khác |
| `VehicleSourceDetail.bankName` | Tên ngân hàng cho vay | **giữ nguyên** — nhãn text |

```prisma
model BankAccount {
  id, ownerType (WALLET_OWNER_TYPE), ownerUserId?, ownerTenantId?
  bankCode, accountNumber, accountName, label?, isDefault, status
  verifiedAt?, verifiedBy?, changedAt?, createdAt, updatedAt
}
```
SQL tay: CHECK owner XOR · partial unique `(owner, bankCode, accountNumber) WHERE status='active'` · partial unique một `isDefault` mỗi chủ.

**Endpoint**: `GET/POST /account/bank-accounts`, `PATCH :id/default`, `DELETE :id` (archive) · bản `/shop/*` (scope tenant từ **membership**) · **`POST /trips/:requestId/refund-account`** ← nối lại `provideRefundAccount` cho khách vãng lai.

Module mới `apps/api/src/modules/bank-accounts/` (service = writer duy nhất).
Web: `features/bank-accounts/` + `app/(public)/account/bank-accounts/page.tsx`; `TripHoldPanel.tsx:128` gắn nút mở form.

**Verify**: khách khai STK → `/platform/money/refunds` đủ 3 trường → `refunds/:id/paid` không còn ném `REFUND_ACCOUNT_REQUIRED`. Test scope: user A không đọc/sửa được STK user B.

---

## Phase 4 — `wallets` / `wallet_entries` / `withdrawal_requests` + cắt hoàn tiền sang ví

```prisma
model Wallet {
  id, ownerType, ownerUserId?, ownerTenantId?
  balance               Decimal(14,2) @default(0)   /// KHẢ DỤNG
  pendingWithdrawAmount Decimal(14,2) @default(0)   /// bị khóa bởi withdrawal pending/approved
  status @default("active")                          // active | frozen
}
```
> **`balance` = khả dụng, không phải tổng nghĩa vụ.** Prisma không so được hai cột trong `where`, nên nếu `balance` là tổng thì guard rút phải viết `$executeRaw`. Cách này giữ đúng hình dạng ADR 0023 điều 6 bằng một câu Prisma thuần:
> `updateMany({ where: { id, status: ACTIVE, balance: { gte: amount } }, data: { balance: { decrement }, pendingWithdrawAmount: { increment } } })`.
> Tổng nghĩa vụ = `balance + pendingWithdrawAmount`, tính lúc đọc. Ghi rõ trong docblock — đây là chỗ dễ hiểu nhầm nhất.

```prisma
model WalletEntry {
  id, walletId, kind, sourceType, sourceRefId
  amount Decimal(14,2)          /// DƯƠNG = vào, ÂM = ra
  balanceAfter Decimal(14,2)    /// ảnh chụp để đối chiếu, KHÔNG phải nguồn sự thật
  bookingId?, holdId?, reversalOfEntryId?, note?, createdByUserId?, createdAt
  @@unique([walletId, kind, sourceType, sourceRefId])
  @@unique([reversalOfEntryId])
}
```
> **Lệch có chủ đích so với ADR 0023 điều 5** (khoá 3 cột): thêm `kind`. Bắt buộc vì một `withdrawal_request` sinh **hai** dòng hợp lệ (`withdrawal` + `withdrawal_reversal` — chính `wallet.ts:66-68` mô tả), và một hold sinh hai dòng hợp lệ (hoàn theo kết cục + hoàn chuyển thừa). Giữ khoá 3 cột sẽ **chặn nhầm** hai ca đúng. Bảo đảm gốc *"một sự kiện nguồn → đúng một dòng"* vẫn nguyên. Thêm `WALLET_ENTRY_KIND.HOLD_OVERPAY`. **Ràng buộc nằm CÙNG migration với bảng** (ADR 0023 điều 5) — không ngoại lệ.

```prisma
model WithdrawalRequest {
  id, code @unique          // XPW + 8, CÙNG không gian tên với XPG/XPH
  walletId, amount, status
  bankCode, bankAccountNumber, bankAccountName   /// SNAPSHOT lúc yêu cầu (ADR 0023 điều 8)
  bankAccountId?, requestedByUserId, reviewedBy?, reviewedAt?, rejectReason?
  paidBy?, paidAt?, bankReference?, dueBy?
  rowVersion Int @default(0)                      /// hai admin không cùng đánh dấu đã chuyển
}
```
SQL tay: `CHECK (amount > 0)` · `CHECK (status <> 'paid' OR bank_reference IS NOT NULL)`.

Types: `status/wallet.ts` thêm `HOLD_OVERPAY`, `WALLET_STATUS`; `status/billing.ts` thêm `BANK_MATCH_TARGET_TYPE.WITHDRAWAL_REQUEST` + prefix `'XPW'`.

**`WalletService`** (`modules/wallet/`) — writer duy nhất (ADR 0023 ràng buộc 3):
`ensureWalletWithinTx` · `creditWithinTx` · `debitForWithdrawalWithinTx` · `reverseWithinTx` · `summaryFor` · `listEntries`. Module khác gọi `creditWithinTx` trong transaction của chính mình.

### Cutover `HoldRefund` → ví (không hoàn hai lần)

`hold_refunds` **không bị xoá, nó chia hai kỷ nguyên**:
1. Thêm `settlement_mode VARCHAR(20)` (`bank_transfer` | `balance`, CHECK) + `wallet_entry_id UNIQUE NULL`.
2. `HOLD_REFUND_STATUS` thêm `CREDITED` — trạng thái cuối, **khác `paid`**: phải phân biệt "tiền đã rời tài khoản ngân hàng" với "nghĩa vụ đổi hình thức", gộp là mất khả năng đối soát chiều ra.
3. Chống hoàn hai lần **bằng ràng buộc DB**: `wallet_entries` unique với `kind=hold_refund, sourceType=booking_hold, sourceRefId=holdId`.
4. **Backfill trong CHÍNH migration đó**: `pending` + có `customer_user_id` → tạo ví + `INSERT … ON CONFLICT DO NOTHING` + set `credited/balance`. `paid`/`rejected` → **không đụng**. `customer_user_id IS NULL` (khách vãng lai) → giữ `pending` + `bank_transfer` — **đường chuyển khoản tay là vĩnh viễn, không phải legacy**.
5. `CHECK (paid_at IS NULL OR settlement_mode = 'bank_transfer')`.
6. Đổi call-site `booking-holds.service.ts:323,363,403,578` + `hold-settlement.service.ts:405` → `creditWithinTx` khi có `customerUserId`, rơi về `upsertRefundWithinTx` khi không.
7. `markRefundPaid` thêm điều kiện `settlement_mode='bank_transfer'` vào `updateMany`.

**Sửa G9 tại đây**: `booking-hold-expiry.ts` — hold `UNDERPAID` hết hạn phải sinh khoản hoàn `paidAmount` (thêm `HOLD_REFUND_REASON.HOLD_EXPIRED`), ghi ví nếu có tài khoản.

**Sửa G11 tại đây**: `decideOutcome()` trả `SPLIT_LATE_CANCEL`/`SETTLED`; `applyOutcomeWithinTx` gọi `resolveHoldAllocation` rồi ghi nhiều dòng ví thay vì một refund toàn phần.

**Verify**: chạy migration trên bản sao staging, đếm `GROUP BY status` trước/sau · `SUM(wallet_entries) = SUM(hold_refunds WHERE credited)` · chạy migration **hai lần** (idempotent) · gọi `refunds/:id/paid` trên dòng `credited` → 409.

---

## Phase 5 — Rút tiền (khách + shop + hàng đợi admin)

```
GET  /account/wallet · /account/wallet/entries?page&limit
POST /account/wallet/withdrawals { amount, bankAccountId } · :id/cancel · GET danh sách
GET  /shop/wallet · … (scope tenant từ membership)

GET  /platform/money/withdrawals?status=&overdue=      (mặc định: pending, sắp theo tuổi)
POST /platform/money/withdrawals/:id/approve|reject|paid|reverse
```
Guard `@PlatformOnly()` + `PERMISSION.PLATFORM_MONEY_MANAGE` (đã có, đã gán `finance_admin`). Cam kết thời gian đọc từ `WITHDRAWAL_TERMS` (`holds.ts:85`) và **hiện trước khi bấm rút** — đó là QUY TẮC (ADR 0025 điều 7), số cụ thể là dữ liệu.

**Web** — một feature, hai scope (ADR 0023 điều 7):
```
features/wallet/{api.ts, hooks/, components/}
  BalanceSummaryCard · WalletEntryList · WithdrawalRequestModal · WithdrawalList · WalletLegalNote
app/(public)/account/balance/page.tsx     ← ROUTES.ACCOUNT.BALANCE
app/(manage)/manage/balance/page.tsx      ← ROUTES.MANAGE.BALANCE
features/platform-money/components/WithdrawalQueue.tsx   (tab thứ 4)
```
- `constants/routes.ts` +2 route; `constants/account-nav.ts` thêm mục vào `OWNER_NAV` **và** `ACCOUNT_NAV`. Docblock `account-nav.ts:139-141` ("Ví & Ưu đãi → bỏ") và test `account-nav.test.ts:64-66` (chặn key `/wallet|voucher|promo/i`) **phải cập nhật theo ADR 0033**.
- `/account/payments` giữ nguyên nghĩa "tiền của các chuyến"; **không** biến thành ví.
- Ví **không** bị gác bởi `PLAN_FEATURE` — tiền của họ; gói hết hạn là `read_only` chứ không `hidden` (ADR 0027 điều 3).

**Verify**: rút vượt số dư → 409 · hai request rút song song → đúng một thành công · reject → `balance` về nguyên · paid → đúng một dòng âm, `balanceAfter` khớp · hai admin cùng bấm "đã chuyển" → một người 409 qua `rowVersion` · `Σ entries = balance + pending`.

---

## Phase 6 — Công tắc cọc của gian hàng (G8)

Hai trục, kiểm **nối tiếp** (ADR 0027 điều 2):
1. **Năng lực GÓI**: `PLAN_FEATURE.ESCROW_HOLD` (đã khai) → thêm vào `FULL_MANAGE_FEATURES` (`billing.ts:116-118` đang loại với ghi chú "chưa thi công" — cập nhật) + seed.
2. **Công tắc GIAN HÀNG**: bảng mới `tenant_payment_settings` (`tenantId` PK, `depositCollectionEnabled Boolean @default(false)`, `updatedBy`, `updatedAt`). **Không** nhét vào `tenant_profiles.settings_json` — cấu hình quyết định có thu tiền khách hay không phải là cột có kiểu, có CHECK, có audit.

**Server chặn 3 lớp**
1. `DepositPolicyService.resolveForTenant()` — `commission` → `required = true` **luôn**; `package` → `required = gói có ESCROW_HOLD && depositCollectionEnabled`. Đọc `billingMode` từ `BillingService.billingModeFor` (**không** đọc `tenants.tenant_type`).
2. `PATCH /shop/payment-settings` — `@RequireFeature(ESCROW_HOLD)` + permission; `tenant_id` từ membership.
3. `commitDecision` gọi `DepositPolicyService` → `holdAmount = null` khi tắt → **nhánh không-cọc đã tồn tại** (`booking-requests.service.ts:984`) chạy nguyên vẹn: tạo đơn ngay, không hold, không occupancy.

Đơn không-cọc: `deposit_collection_mode='direct'` (đóng băng); UI nói rõ *"Gian hàng sẽ liên hệ để thỏa thuận cọc trực tiếp — XePrime không thu hộ và không đối soát khoản này"* (ADR 0028 điều 9; không dùng từ "đi đêm").

Bật/tắt **không đụng đơn đã tạo** (ADR 0025 ràng buộc 4) — tự động đúng nhờ đóng băng lúc tạo.

Web: `app/(manage)/manage/shop/payment-settings/page.tsx` + `features/shop/components/DepositToggleCard.tsx`. Tuyến hoa hồng thấy công tắc **bật + khóa** kèm giải thích, không ẩn (ADR 0027 điều 4).

**Verify**: tenant gói tắt cọc → duyệt tạo đơn ngay, không `booking_holds`; bật lại → hold sinh; tenant hoa hồng gọi thẳng API bằng curl → 403; gói không có cờ → 403.

---

## Phase 7 — Bảo hiểm IV/IP · **mặc định TẮT**

Xây đủ năng lực, nhưng không dòng nào chạy khi hai cờ `fee_policies` tắt ⇒ không vi phạm ADR 0028 điều 5.

```prisma
model BookingInsurancePolicy {
  id, bookingId, tenantId, holdId?
  productKind   // vehicle_trip (IV) | personal_accident (IP)
  status        // reserved | issuing | issued | failed | cancelled | voided | claim
  premiumAmount Decimal(14,2)
  partnerName, partnerProductCode, certificateNumber?, certificateUrl?, coverageFrom?, coverageTo?
  issueAttempts, lastAttemptAt?, lastErrorCode?, lastErrorMessage?, nextAttemptAt?
  issuedAt?, cancelledAt?, voidedAt?
  requestPayloadJson, responsePayloadJson       /// bằng chứng
  consentAt?, consentSource?                    /// bằng chứng khách CHỌN IP (ADR 0028 điều 5)
  idempotencyKey @unique
  @@unique([bookingId, productKind])
  @@index([status, nextAttemptAt])
}
```
- **Kích hoạt**: `transitionWithinTx` khi `to = ACTIVE` chỉ **đặt `nextAttemptAt = now`**. **Không bao giờ gọi HTTP partner trong transaction DB.**
- **Job** `worker/jobs/insurance-issue.ts` (lock mới, nhịp 60s): claim `updateMany({where:{id,status:RESERVED},data:{status:ISSUING}})`; backoff `min(2^n, 60)` phút.
- **Adapter** `modules/insurance/partner/insurance-partner.port.ts` + `noop-insurance.partner.ts` mặc định. Tên/logo PVI **không xuất hiện** cho tới khi có hợp đồng.
- **Hoàn 100% khi hủy trước bàn giao**: `resolveHoldAllocation` route IV+IP → `customer_balance`; **cùng transaction** lật policy sang `cancelled`. Không phụ thuộc khả năng hoàn của partner vì hợp đồng chưa mua.
- **Hàng đợi lỗi**: `GET /platform/money/insurance?status=failed` + `retry`/`void` (có lý do + audit), tab mới trong `MoneyOperationsView`.
- **Điểm ADR 0032:98 để mở** — phát hành lỗi đúng lúc bàn giao: **đề xuất không chặn chuyến**, ghi `failed` + mở support case + báo admin. Chặn chuyến vì lỗi API đối tác là biến sự cố của XePrime thành sự cố của khách. Cần xác nhận khi tới phase này.

**Verify**: bật cờ + partner noop OK → 2 dòng `issued`; noop lỗi → `failed` + backoff tăng + hàng đợi admin; hủy trước bàn giao → `cancelled` + ví hoàn đủ IV+IP; tắt cờ → 0 dòng.

---

## Phase 8 — Thuế T · **mặc định TẮT**

Ghi ở **cả hai** nơi, vì trả lời hai câu khác nhau: ví chủ xe nhận **một dòng net `D − T`** (tiền thuế không bao giờ vào ví); thuế cần bảng riêng để kê khai/nộp theo kỳ (ADR 0028 điều 3-4, NĐ 117/2025).

```prisma
model TaxWithholding {
  id, bookingId @unique, tenantId, sellerProfileId?
  taxableBase, percent, label, amount, feePolicyId   /// snapshot, KHÔNG join lúc đọc
  status          // accrued | declared | remitted | reversed
  accruedAt, declaredAt?, remittedAt?
  periodKey VARCHAR(7)      // 'YYYY-MM' giờ VN
  reversalOfId?             // append-only
  @@index([periodKey, status]) @@index([tenantId, periodKey])
}
```
Chỉ phát sinh khi chuyến **bắt đầu**; hủy trước chuyến → 0 dòng (ADR 0032 điều 3). Ghi cùng transaction với `to = ACTIVE`.

Báo cáo: admin `GET /platform/money/tax/summary?period=` (theo kỳ / `entityType` / tenant, export CSV) + `/rows` + `mark-declared`/`mark-remitted`; chủ xe xem ở `/account/tax` (route đã có) và `/manage/finance`; **khách không thấy dòng thuế** (T không nằm phía khách).

**Verify**: bật 7% → chuyến B=700k bắt đầu → 1 dòng `accrued` 49.000đ, ví chủ xe nhận 91.000đ; hủy trước chuyến → 0 dòng.

---

## Phase 9 — Đối soát 3 vế + chuẩn bị chiều RA

Mở rộng `dailyReconciliation` (`booking-holds.service.ts:763`) từ 1 vế thành 3 (ADR 0025 điều 6):

```
Số dư ngân hàng cuối ngày
  = Tiền CỦA NỀN TẢNG (phí dịch vụ ghi nhận + tiền gói thu − chi ra)
  + Tiền GIỮ HỘ       (hold chưa chốt phần custodied + Σ ví (balance+pending)
                       + premium BH reserved/issued chưa quyết toán + thuế accrued chưa nộp)
  + Chênh lệch chưa đối soát
```
- `platform.serviceFeeRecognized` = `SUM(booking_holds.service_fee_amount)` với outcome `settled`/`split_late_cancel` — **đọc cột số tiền, không đọc `purpose`** (mọi hold nay mixed).
- Bảng mới `platform_bank_balances` (date PK, `balance`, `source`, `enteredBy`) — SePay không gửi số dư, phải nhập tay; `POST /platform/money/reconciliation/bank-balance`.
- **`walletDrift`** = số ví có `Σ entries ≠ balance + pending` — đúng thứ ADR 0023 điều 6 đòi.
- **Chuẩn bị chiều RA**: thêm `bank_transactions.direction ('in'|'out')` + `amount_out`, `BANK_MATCH_TARGET_TYPE.WITHDRAWAL_REQUEST`, prefix `XPW` — để khi SePay có webhook chiều ra thì không phải migrate mã.

Web: tab `reconciliation` dựng lại 3 khối + ô nhập số dư cuối ngày + cảnh báo đỏ khi `variance ≠ 0` hoặc `walletDrift > 0`.

**Verify**: seed một ngày đủ 5 loại giao dịch → ba con số cộng bằng `bankBalanceEod`, `variance = 0`; sửa tay `wallets.balance` bằng SQL → `walletDrift` bắt được.

---

## i18n

**Namespace mới** (`packages/domain/messages/{vi,en}/`, khai ở `apps/web/src/i18n/namespaces.ts` + `apps/web/messages/{vi,en}/index.ts`):

| file | namespace | Phase | Ghi chú |
| --- | --- | --- | --- |
| `wallet` | `Wallet` | 4–5 | Dùng chung khách + shop (`title.user`/`title.tenant`); chứa `unit` ("điểm"), `legalNote` |
| `bank-accounts` | `BankAccounts` | 3 | Form STK dùng chung 3 bề mặt |
| `insurance` | `Insurance` | 7 | Chọn IP, chứng nhận, trạng thái |

**Mở rộng**: `platform-money` (4 tab mới) · `trips` (countdown 2×60', breakdown D/S/IV/IP, form STK, **sửa G13**: chính sách hoàn theo mốc + cảnh báo hủy sát giờ khi pickup < 4h) · `booking-requests` (breakdown, ghi chú cọc trực tiếp) · `domain` (nhãn `WALLET_ENTRY_KIND`, `WITHDRAWAL_STATUS`, `INSURANCE_POLICY_STATUS`, `TAX_WITHHOLDING_STATUS`, `FEE_LINE` mới, outcome mới) · `errors` · `shop` (công tắc cọc) · `navigation`/`account` · `finance` (thuế đã khấu trừ).

> **Toàn bộ chữ "điểm" đi qua i18n key `Wallet.unit` / `Wallet.title.*` / `Wallet.legalNote` — không hardcode trong component.** Đổi cách gọi sau này = sửa 2 file JSON, không sửa một dòng TS.

Mỗi phase chạy `pnpm --filter @xeprime/web i18n:check` + `i18n:audit` cho màn vừa đụng. Không thêm namespace vào `apps/mobile/src/i18n/messages.ts` (bảng gom mobile là tập con).

---

## Thứ tự & rủi ro

```
ADR 0033 → P1 → P2 → P4 → P5 → P9
                  ├──────→ P7
                  └──────→ P8
P3 ──────────────────────────────► (song song từ đầu — bug đang chặn vận hành)
P6 ─────────────► (sau P1)
```

**Phải trước, không thì làm lại**: (1) P1 từ vựng + công thức — mọi snapshot ghi ở giữa là sai vĩnh viễn; (2) 4 cột tiền trên `booking_holds` **cùng migration với P1**; (3) P2 đổi chữ ký `holdFreeCancelUntil` nên đi ngay sau P1, và phải xong **trước** lưu lượng pilot; (4) `wallet_entries` unique **cùng migration với bảng**.

| Rủi ro | Giảm thiểu |
| --- | --- |
| Snapshot bất biến, đơn tạo giữa hai phase mang công thức của phase đó | Gộp P1 + cột hold vào **một PR/một migration**; chạy staging trước khi có tiền thật |
| Hoàn hai lần lúc cutover | Unique **cùng migration** với backfill; `ON CONFLICT DO NOTHING`; không đụng dòng terminal |
| Khách vãng lai không có ví | Đường chuyển khoản tay **vĩnh viễn**, không đánh dấu legacy |
| `purpose` không còn đủ (hold mixed) | Cấm đọc `purpose` để tách quỹ; dùng 4 cột tiền + `resolveHoldAllocation`; viết test khóa invariant |
| `balance` = khả dụng dễ hiểu nhầm là tổng | Docblock + DTO `availableAmount`/`pendingAmount`/`totalPayable`; `CHECK (balance >= 0)` |
| Nhãn "ví điểm/điểm thưởng" dễ bị hiểu là khuyến mãi (có thể hết hạn/thu hồi) | ADR 0033 ghi đè tường minh + khóa cứng bản chất; `Wallet.legalNote` hiện cố định *"1 điểm = 1đ · rút về ngân hàng được · không hết hạn"*; mọi nhãn qua i18n để đổi lại rẻ |
| Giữ tiền người khác nay áp cho **cả hai tuyến** (D là tiền chủ xe) | ADR 0028 release gate 4 (pháp lý thu hộ/chi hộ) **vẫn chặn** tiền khách thật — nêu lại trong ADR 0033 |
| Working tree đang có thay đổi **push notification** của người khác (`PushDevice`/`PushDelivery` trong `schema.prisma`) | Không giao thoa model, nhưng cùng file — rebase cẩn thận, đừng nuốt thay đổi của họ |
| ADR 0032 còn để mở: kết thúc sớm, kéo dài chuyến, hủy sau khi đã bắt đầu, hạ cấp gian hàng | Chưa chặn P1–P5; cần chốt trước P7/P9 |

**Kỷ luật mọi phase**: `Decimal` ở BE / string trong JSON · status từ `packages/types`, không literal trần · `tenant_id` từ membership · ledger append-only (reversal) · chống cộng đôi bằng **constraint DB** · i18n vi+en · CSS Modules + AntD token · verify **chỉ module vừa sửa** (skill `verify-changes`), không quét cả workspace · không đụng `apps/mobile`.

---

## Verify tổng thể (sau P5)

Kịch bản end-to-end trên staging, tuyến hoa hồng, `B = 700.000đ`, `D = 20%`, thuế/bảo hiểm tắt:

1. Khách gửi yêu cầu → chủ xe duyệt → hold `XPH…` = `D + S = 140k + 70k = 210k`; `expires_at = +2h`, `free_cancel_until = +4h`.
2. Quét VietQR, chuyển đúng số → webhook → đơn được tạo **cùng transaction**; 4 cột tiền cộng đúng `amount`.
3. **Nhánh hủy sớm**: hủy ở phút 30 → ví khách +210k → tạo yêu cầu rút → admin duyệt + đánh dấu đã chuyển → `Σ entries = balance + pending`.
4. **Nhánh hủy muộn**: hủy ở giờ thứ 5 → ví chủ xe +105k, XePrime ghi nhận 105k, ví khách +0.
5. **Nhánh hoàn thành**: bàn giao → hoàn thành → ví chủ xe nhận `D − T`.
6. `GET /platform/money/reconciliation/daily` → ba vế cộng đúng, `variance = 0`, `walletDrift = 0`.
7. Chạy lại webhook + worker + bấm admin hai lần → **không dòng nào nhân đôi**.

Test tự động: `apps/api/test/` thêm `wallet-ledger.spec.ts`, `withdrawal-flow.spec.ts`, `hold-allocation.spec.ts` theo khuôn `sepay-webhook.spec.ts` (đã phủ song song/idempotency/thiếu-thừa) và `booking-hold-lifecycle.spec.ts`.
