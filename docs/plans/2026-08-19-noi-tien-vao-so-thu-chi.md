# Epic — Nối tiền vào sổ Thu-Chi + dựng lại `/manage/receipts`

> ✅ **ĐÃ TRIỂN KHAI 19/08/2026.** Verify: jest 187 (7 suite, PostgreSQL thật) · vitest 175
> · typecheck api/types/web sạch · lint scoped sạch · `migrate diff` sạch · backfill chạy lại 0 dòng
> · `i18n:check` 986 khoá parity. Ba khác biệt so với plan gốc, đều ghi tại chỗ bên dưới:
> (1) `source_ref_id` + unique `(tenant, source, source_ref_id)` thay cho chỉ `source` — vừa chống
> ghi kép ở tầng DB vừa trỏ được đường quay về; (2) sửa phiếu tự động là **UPDATE tại chỗ**, không
> huỷ-rồi-tạo-lại (unique index phủ cả dòng đã huỷ); (3) phát hiện `updateRecord` từ chối phiếu bảo
> dưỡng đã đóng ⇒ phải thêm `correctCost` mới không tạo ra đường cụt.
>
> **Bảy lỗi tìm thấy ở vòng review nội bộ, đã xác minh và sửa hết:**
> 1. **Vòng `0đ → có tiền lại` bị khoá VĨNH VIỄN.** `updateAmountWithinTx` lọc
>    `status != cancelled` nên sau khi huỷ nó rơi xuống nhánh tạo mới và đụng chính unique index
>    `(tenant, source, source_ref_id)` — sửa hoàn cọc về 0 rồi sửa lại là 409 mãi mãi cho đơn đó.
>    Nay là upsert-theo-nguồn thật: **hồi sinh** phiếu và xoá `cancelled_by/at`. Khoá bằng test ở
>    cả hoàn cọc lẫn bảo dưỡng.
> 2. **Cọc thổi phồng "Doanh thu" theo xe.** `VehiclesService.stats` gộp mọi phiếu đã duyệt theo
>    `(vehicleId, type)`; từ khi cọc lên sổ thì doanh thu xe phình đúng bằng số cọc đang cầm.
>    Thêm `HELD_FUNDS_RECEIPT_SOURCES`, loại `deposit`/`deposit_refund` khỏi phép gộp đó.
> 3. **`bookingId`/`vehicleId` từ client ghi mà không kiểm tenant.** FK là khoá đơn chứ không
>    composite, nên id của gian hàng khác vẫn ghi được và `LIST_SELECT` join ra tên xe + biển số
>    của họ. Nay 404 nếu không thuộc tenant (CLAUDE.md §6).
> 4. **`correctCost` chưa có UI** ⇒ drawer chi tiết nay trỏ về **hồ sơ xe** cho phiếu bảo dưỡng
>    (loại phiếu này không có `bookingId` để trỏ). Nút "Sửa chi phí" trên phiếu đã hoàn tất vẫn
>    còn thiếu — ghi ở §5.
> 5. **Vòng retry `receipt_no` là mã chết**: mọi lời gọi nằm trong transaction, Postgres huỷ cả
>    transaction ở vi phạm đầu (`25P02`). Bỏ vòng lặp, nới hậu tố 4 → 8 ký tự; `genReceiptNo`
>    dùng ngày **giờ VN** (trước 07:00 nó mang ngày hôm qua).
> 6. **`cost ?? null` ở `correctCost` xoá nhầm**: PATCH bỏ trống trường ≠ `null` tường minh.
> 7. Ô chọn đơn bắn một truy vấn **mỗi phím gõ** → debounce 300ms.
>
> Dọn kèm: `ReceiptAmount` (dấu + màu tiền, trước lặp ở 4 chỗ) · `lib/vehicle-label.ts`
> (`Tên xe (biển số)`, trước lặp ở 5 chỗ kể cả API) · `createApprovedWithinTx` trả cả `receiptNo`
> nên bảo dưỡng không còn `SELECT` thẳng vào `receipts`.
>
> Plan file · tạo 19/08/2026 · phạm vi đã chốt với user
> Kế thừa: [ADR 0005](../decisions/0005-status-enums.md) · [0007](../decisions/0007-api-type-contract.md) ·
> [0003](../decisions/0003-styling-css-modules.md) · [0004](../decisions/0004-client-state.md) ·
> đối chiếu `docs/design-briefs/06_FINANCE_OPERATIONS.md`

---

## 1. Context — vì sao làm

Phase 6 (Finance) **đã đóng**: `receipts` / `payments` / `finance_categories` / `contracts` có đủ,
`PaymentsService` là writer duy nhất của `booking.paid_amount`, công nợ tính động. Nhưng
`docs/completion-roadmap.md` §2.1 đã ghi sẵn epic kế tiếp: *"nối quyết toán đơn thuê vào Finance —
đây là chỗ đứt duy nhất còn lại giữa vận hành (đã đủ) và tiền (đã có module)"*. Khảo sát lần này
xác nhận chỗ đứt đó **rộng hơn mô tả**, và màn `/manage/receipts` mới dùng được ~30% những gì API
đã trả.

### 1.1 Bốn mắt xích tiền đang ĐỨT (đã xác minh trong code)

| # | Sự thật | Hệ quả |
| --- | --- | --- |
| **A** | `payments.service.ts:75` là `payment.create` **duy nhất** trong toàn API và **không bao giờ set `kind`** → mọi payment là `'rental'`. `RecordPaymentDto` không có trường `kind`. | `settlement.service.ts:443-451` tính `depositReceived` = tổng `kind='deposit'` → **luôn = 0**. Kéo theo `proposedRefund`, `additionalDue`, `depositStatus` của Wave 10 đều vô nghĩa. Cả máy quyết toán cọc đang chạy không tải. |
| **B** | `SettlementService.recordRefund` (:216) ghi `booking_deposit_settlements` nhưng **không sinh phiếu chi**. | Tiền thật rời tay chủ xe mà sổ Thu-Chi không thấy. `GET /finance/summary` báo lãi cao hơn thực tế. |
| **C** | `vehicle_maintenance_records.cost` (schema :1600) **không bao giờ** thành phiếu chi. | Chi phí đội xe nằm ngoài sổ. "Lãi thực theo xe" không tính được. |
| **D** | `Receipt.tenantCustomerId` + index `(tenant_id, tenant_customer_id)` **có sẵn, không ai ghi**. `createApprovedWithinTx` cũng **không set `categoryId`** → mọi phiếu tự động hiện danh mục `—`. | Không tổng hợp được thu-chi theo khách; sổ có dòng nhưng không giải thích được tiền từ đâu. |

### 1.2 Màn `/manage/receipts` — API đã có, giao diện chưa dùng

`page.tsx` (131 dòng) chỉ có **2 ô Select** (loại, trạng thái). Trong khi:

- `use-receipt-filters.ts` **đã đọc** `categoryId` / `from` / `to` từ URL và **đã gửi** xuống API —
  không ô giao diện nào ghi chúng. Test `receipts-page.test.tsx:254` ghi thẳng là "HIỆN TRẠNG".
- `GET /receipts/:id` + `queryKeys.receipts.detail(id)` tồn tại, **không nơi nào gọi** → không có
  màn chi tiết phiếu.
- `ReceiptFormDrawer` không có: **ngày phiếu**, **liên kết đơn thuê**, **liên kết xe**,
  **ảnh minh chứng** — dù DTO backend nhận đủ `bookingId` / `vehicleId` / `attachments`.
- `FilterBar` (dùng chung) có sẵn kiểu trường `dateRange` — **được viết ra chính vì receipts**
  (comment `FilterBar.tsx:22-25`) — và trang này không dùng.
- `DataTable` đã có chế độ **thẻ trên mobile** (`renderCard`); `ReceiptTable` không truyền
  `renderCard` → rơi về thẻ tự suy 8 dòng `<dl>`, khó đọc.
- Không `PermissionState` khi thiếu `finance.view`; còn dùng `getErrorMessage` đã `@deprecated`;
  còn một `style={{}}` inline (vi phạm ADR 0003).
- **Không một liên kết nào** vào hay ra: không màn nào trỏ tới `/manage/receipts` đã lọc, và phiếu
  không trỏ tới đơn/xe/khách.

### 1.3 Kết quả mong muốn

1. Mỗi đồng tiền đi qua nghiệp vụ (thu tiền thuê, thu cọc, hoàn cọc, chi bảo dưỡng) **tự lên sổ**
   đúng loại, đúng danh mục, đúng đối tượng — chủ xe không nhập tay lần hai.
2. Nhìn một dòng trong sổ là biết **tiền từ đâu ra** và bấm được sang đơn / xe / khách.
3. Nhập tay một phiếu **nhanh nhất có thể**: chọn đơn → tự điền khách, biển số, danh mục, số tiền
   còn nợ.
4. Màn dùng được thật trên điện thoại, không phải bảng cuộn ngang 1120px.

---

## 2. Quyết định đã chốt với user

| Quyết định | Chốt |
| --- | --- |
| Phạm vi | Nối tiền (A–D) **và** dựng lại màn receipts. Không làm báo cáo/biểu đồ/xuất CSV đợt này. |
| Phiếu tự động | Sinh ở trạng thái `approved`, mang chip **"Tự động"**, và **CẤM huỷ trực tiếp** — muốn đảo phải đảo ở nguồn (void payment / sửa bản ghi hoàn cọc / huỷ phiếu bảo dưỡng). |
| Ngày phiếu | Thêm cột `occurred_at`, backfill `= created_at`; mọi lọc và tổng hợp chuyển sang cột này. |
| Liên kết | receipts ↔ **bookings**, ↔ **vehicles**, ↔ **customers**. Drill-down từ dashboard `/manage/finance` **không** thuộc đợt này. |

---

## 3. Hai quyết định thiết kế cốt lõi (kèm lý do)

### 3.1 Cọc KHÔNG cộng vào `booking.paid_amount`

`totalAmount = base + delivery − discount` là **tiền thuê**. Công nợ = `max(0, total − paid)` nghĩa
là *"khách còn nợ tiền thuê bao nhiêu"*. Cọc là **tài sản bảo đảm đang giữ hộ**, sẽ trả lại — cộng
nó vào `paidAmount` sẽ làm công nợ tụt giả và đơn biến mất khỏi `/manage/debts` trong khi khách chưa
trả đồng tiền thuê nào.

⇒ `recordForBooking` chỉ `increment` `paidAmount` khi `kind === 'rental'`. `voidPayment` đối xứng:
chỉ `decrement` khi payment bị huỷ là `rental`. Cọc đã thu hiển thị qua `depositReceived` của
settlement (nay mới có số thật).

### 3.2 Phụ phí (`booking_surcharges`) **KHÔNG** sinh phiếu

Phụ phí là một **yêu cầu đòi tiền**, không phải một lần tiền đổi tay. Tiền chỉ thật sự chuyển động ở
hai chỗ và cả hai đã có phiếu: (a) khách trả thêm → `payment` `rental` → phiếu thu; (b) trừ vào cọc →
phiếu chi hoàn cọc đã là **số ròng** (`refundAmount = depositReceived − surchargeTotal`). Sinh phiếu
cho phụ phí là **đếm hai lần**.

⇒ Giữ nguyên `addSurcharge`. Ghi rõ lý do vào docblock để lần sau không ai "sửa cho đủ".

---

## 4. Slice — mỗi slice tự đứng được

### Slice 0 — Nền: schema + từ vựng

**Migration** `prisma/migrations/2026XXXXXXXXXX_finance_ledger_links/migration.sql`

```sql
-- 1. Ngày phát sinh tách khỏi thời điểm nhập: phiếu nhập bù phải rơi đúng kỳ.
ALTER TABLE "receipts" ADD COLUMN "occurred_at" TIMESTAMPTZ(3);
UPDATE "receipts" SET "occurred_at" = "created_at" WHERE "occurred_at" IS NULL;
ALTER TABLE "receipts" ALTER COLUMN "occurred_at" SET NOT NULL,
                       ALTER COLUMN "occurred_at" SET DEFAULT now();
CREATE INDEX "receipts_tenant_occurred_idx" ON "receipts" ("tenant_id", "occurred_at");

-- 2. Nguồn gốc + TRỎ VỀ bản ghi gốc: sổ phải nói được tiền từ đâu, và huỷ phải quay đúng module.
ALTER TABLE "receipts" ADD COLUMN "source"        VARCHAR(20) NOT NULL DEFAULT 'manual',
                       ADD COLUMN "source_ref_id" CHAR(26);
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_source_check"
  CHECK ("source" IN ('manual','payment','deposit','deposit_refund','maintenance'));
-- Phiếu tay không có nguồn; phiếu tự động BẮT BUỘC có — không để lửng lơ ở tầng app.
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_source_ref_check" CHECK (
  ("source" =  'manual' AND "source_ref_id" IS NULL) OR
  ("source" <> 'manual' AND "source_ref_id" IS NOT NULL));
-- Chống ghi kép ở tầng DB: hoàn tất lại một phiếu bảo dưỡng không được đẻ phiếu chi thứ hai.
CREATE UNIQUE INDEX "receipts_source_ref_uniq"
  ON "receipts" ("tenant_id","source","source_ref_id") WHERE "source" <> 'manual';

UPDATE "receipts" r SET "source" = 'payment', "source_ref_id" = p.id
  FROM "payments" p WHERE p.receipt_id = r.id;

-- 3. Gắn phiếu vào sổ khách (cột + index đã có từ S-01, chưa ai ghi).
-- `b.tenant_id = r.tenant_id` là BẮT BUỘC: FK là composite (tenant_customer_id, tenant_id).
UPDATE "receipts" r SET "tenant_customer_id" = b.tenant_customer_id
  FROM "bookings" b WHERE b.id = r.booking_id AND b.tenant_id = r.tenant_id
                      AND r.tenant_customer_id IS NULL
                      AND b.tenant_customer_id IS NOT NULL;

-- 4. Tra danh mục hệ thống bằng KHOÁ ổn định, không bằng tên tiếng Việt.
ALTER TABLE "finance_categories" ADD COLUMN "system_key" VARCHAR(50);
UPDATE "finance_categories" SET "system_key" = 'booking_payment'
  WHERE "is_system" AND "name" = 'Thanh toán đơn';
-- … 4 dòng còn lại theo bảng §4.0.1 …
CREATE UNIQUE INDEX "finance_categories_system_key_uniq"
  ON "finance_categories" ("system_key") WHERE "system_key" IS NOT NULL;
ALTER TABLE "finance_categories" ADD CONSTRAINT "finance_categories_system_key_check"
  CHECK ("system_key" IS NULL OR "is_system" = true);

-- 5. Số phiếu là chứng từ kế toán: trùng là hỏng (brief 06 edge 10 / Q8).
CREATE UNIQUE INDEX "receipts_tenant_receipt_no_uniq"
  ON "receipts" ("tenant_id","receipt_no") WHERE "receipt_no" IS NOT NULL;

-- 6. Ô tìm kiếm mã phiếu / mã tra soát.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "receipts_search_trgm_idx" ON "receipts"
  USING gin ("receipt_no" gin_trgm_ops, "reference_code" gin_trgm_ops);

CREATE INDEX "receipts_tenant_vehicle_idx" ON "receipts" ("tenant_id","vehicle_id")
  WHERE "vehicle_id" IS NOT NULL;
```

`prisma/schema.prisma` — thêm `occurredAt`, `source`, `sourceRefId`, `systemKey` (String, `@@map`
snake_case). CHECK để ở migration, **không** ở Prisma (theo `database-change` skill).

`genReceiptNo` phải **thử lại khi đụng unique** — thêm index mà không thêm retry là biến một va chạm
gần-như-không-bao-giờ thành một lỗi 500 không giải thích được.

#### 4.0.1 Khoá danh mục hệ thống

Năm danh mục cần dùng **đã được seed sẵn**, không đẻ danh mục mới — chỉ gán khoá:

| `system_key` | loại | tên đã có | dùng bởi |
| --- | --- | --- | --- |
| `booking_payment` | thu | Thanh toán đơn | `source='payment'` |
| `deposit` | thu | Tiền cọc | `source='deposit'` |
| `deposit_refund` | chi | Hoàn cọc | `source='deposit_refund'` |
| `maintenance` | chi | Bảo dưỡng/Thay nhớt | bảo dưỡng ≠ `repair` |
| `repair` | chi | Sửa chữa sự cố | bảo dưỡng `repair` |

**`packages/types/src/status/finance.ts`** — thêm `RECEIPT_SOURCE` + `_VALUES` + `_META`
(Thủ công · Thu tiền đơn · Thu cọc · Hoàn cọc · Bảo dưỡng) + `isAutoReceipt(source)`, và
`SYSTEM_FINANCE_CATEGORY` (khoá → tên) dùng chung cho seed lẫn service.

**`prisma/src/seed.ts`** — `SYSTEM_FINANCE_CATEGORIES` (:1511) gán `systemKey`; `seedFinanceCategories`
khớp theo `systemKey` trước, vẫn idempotent, vẫn không đổi tên bản ghi cũ.

#### 4.0.2 Sửa lỗi lệch 7 tiếng của bộ lọc ngày ⚠️

`ReceiptsService.list` làm `new Date(query.from)`. `FilterBar` ghi `YYYY-MM-DD` (`DAY_PARAM_FORMAT`),
mà `new Date('2026-08-19')` = `00:00Z` = **07:00 giờ Việt Nam** — mất 7 tiếng đầu ngày. Trong khi
`/manage/finance` (`page.tsx:17-18`) gửi **ISO đầy đủ**. Hai màn cùng hỏi *"từ ngày X"* mà ra hai
kết quả khác nhau.

Hiện lỗi còn **ngủ** vì chưa ô nào ghi `from`/`to` ở receipts — nó **sống dậy đúng lúc** Slice 5 nối
`dateRange` vào. Sửa ở **backend** (một chỗ, cả hai caller cùng đúng), không sửa ở FE:
`apps/api/src/common/day-range.ts` — `dayStartUtc(v)` / `dayEndUtc(v)` nhận cả `YYYY-MM-DD` (quy về
`Asia/Ho_Chi_Minh`) lẫn ISO đầy đủ (đi thẳng). Dùng ở `ReceiptsService.list` và
`FinanceOverviewService.summary`.

---

### Slice 1 — Thu cọc thật (đóng mắt xích A)

| File | Việc |
| --- | --- |
| `apps/api/src/modules/payments/dto/payment.dto.ts` | `RecordPaymentDto` += `kind` (`@IsIn(PAYMENT_KIND_VALUES)`, mặc định `rental`). `PaymentDto` += `kind` để FE phân biệt lịch sử. |
| `apps/api/src/modules/payments/payments.service.ts` | `recordForBooking`: set `kind`; `increment paidAmount` **chỉ khi** `rental` (§3.1); sinh `paymentId` **trước** phiếu để `sourceRefId` nối được hai chiều; `source` = `payment`\|`deposit`, khoá danh mục tương ứng, `occurredAt = paidAt`, `tenantCustomerId` từ booking (thêm vào `select`); audit `after` += `kind`. **`voidPayment`: `select` += `kind`, `decrement` CHỈ khi `rental`** — hiện đang trừ vô điều kiện, thêm `kind` mà quên chỗ này là âm thầm phá `paid_amount` ngay lần void cọc đầu tiên. |
| `apps/api/src/modules/finance/receipts.service.ts` | `ApprovedReceiptInput` += `source`, `sourceRefId`, `categoryKey`, `tenantCustomerId`, `occurredAt`. Thêm `resolveSystemCategoryId(tx, key)` — tra theo `system_key`, trả `null` khi không thấy (**không throw**: thiếu một dòng seed không được phép roll back một transaction tiền). |
| `apps/web/src/features/payments/components/RecordPaymentModal.tsx` | Thêm `Segmented` **Tiền thuê / Tiền cọc**. Nhánh *tiền thuê* hiện công nợ như hiện tại; nhánh *tiền cọc* hiện `depositRequired` / `depositReceived` từ settlement. |
| `apps/web/src/features/payments/components/PaymentHistory.tsx` | Chip `PAYMENT_KIND_LABEL` trên mỗi dòng. |

Test: `apps/api/test/payments.spec.ts` — thu cọc **không** đổi `paidAmount`; thu tiền thuê thì đổi;
void cọc không trừ `paidAmount`; `settlement.get` sau khi thu cọc trả `depositReceived` đúng và
`depositStatus = received`.

---

### Slice 2 — Hoàn cọc + bảo dưỡng lên sổ (đóng B và C)

**Hoàn cọc** — `apps/api/src/modules/bookings/settlement/settlement.service.ts`
- `recordRefund` (:216): trong cùng transaction, gọi `ReceiptsService.createApprovedWithinTx`
  → phiếu **chi**, `source = 'deposit_refund'`, danh mục mã `deposit_refund`, `bookingId`,
  `vehicleId`, `tenantCustomerId`, `occurredAt = refundedAt`, `amount = refundAmount`.
  Bỏ qua khi `refundAmount = 0` (không có tiền nào rời tay).
- `correctRefund` (:288): **sửa TẠI CHỖ** số tiền/thời điểm/mã tra soát của chính phiếu đó, audit
  before+after. **Không** huỷ-rồi-tạo-lại: unique index `(tenant_id, source, source_ref_id)` phủ cả
  dòng đã huỷ, nên tạo lại sẽ đụng constraint. Và "một bản ghi hoàn cọc, sửa được" thì cũng đúng là
  một phiếu, sửa được.
- Không cần cột nối riêng: `source_ref_id` = id của `booking_deposit_settlements` đã là đường nối
  hai chiều (một truy vấn theo unique index).
- Ánh xạ `REFUND_METHOD → PAYMENT_METHOD` (`bank_transfer`/`cash`/`other` trùng tên) — đặt ở
  `packages/types/src/status/settlement.ts` cạnh enum.
- **Sửa docblock `REFUND_METHOD`** (`settlement.ts:44-47`) — hiện ghi *"đây không phải một giao dịch
  trong sổ"*; từ slice này nó **là**.

**Bảo dưỡng** — `apps/api/src/modules/vehicles/maintenance/`
- Khi phiếu bảo dưỡng có `cost > 0` và chuyển sang trạng thái hoàn thành: sinh phiếu **chi**,
  `source = 'maintenance'`, danh mục theo loại việc (`maintenance` | `repair`), `vehicleId`,
  `occurredAt` = ngày hoàn thành.
- **Tự động, không checkbox** — người dùng đã nhập chi phí thì đó *là* một khoản chi; hỏi lại lần
  nữa chỉ tạo ra hai con số không khớp nhau.
- Đường nối hai chiều là `source_ref_id` = id bản ghi bảo dưỡng (không cần cột mới). `receiptCode`
  (text tự do, schema :1602 — *"Wave 6 chưa FK sang `receipts`"*) **tự điền bằng số phiếu sinh ra**
  khi người dùng chưa nhập; vẫn sửa được.
- Sửa `cost` của phiếu **đã hoàn tất**: `receipt.updateMany({ where: { tenantId, source:'maintenance',
  sourceRefId, status: { not: CANCELLED } }, data: { amount } })` — **sửa tại chỗ**, cùng lý do
  constraint như hoàn cọc. Xoá trắng `cost` → `cancelWithinTx`.
- **Chặn đường cụt:** đường sửa này phải nằm TRONG slice này. Cấm huỷ phiếu tự động (Slice 3) mà
  chưa có đường sửa nghĩa là một phiếu chi ghi sai số **không cách nào chữa** qua sản phẩm.

> **Đã phát hiện khi làm:** `updateRecord` **từ chối mọi phiếu đã đóng** (`isClosed` → 409), nên
> nhánh "sửa cost trong updateRecord" là mã chết. Chi phí bảo dưỡng ghi sai vốn đã không sửa được
> **từ trước epic này** — và việc đưa nó vào sổ làm hậu quả nặng hơn hẳn.
> ⇒ Thêm đường riêng `PATCH /vehicles/:id/maintenance/records/:recordId/cost` +
> `MaintenanceService.correctCost`, theo đúng khuôn `SettlementService.correctRefund`: chỉ tiền +
> mã chứng từ, **lý do bắt buộc**, `rowVersion` chống ghi đè, audit giữ CẢ giá trị cũ, và đòi **cả**
> `vehicles.maintenance.manage` **lẫn** `vehicles.maintenance.view_cost` (sửa số đã nằm trong sổ là
> việc của người được phép nhìn tiền).
- Quyền: phiếu chi bảo dưỡng chỉ hiện với người có `finance.view`; `vehicles.maintenance.view_cost`
  vẫn gác số tiền phía hồ sơ xe.

Test: `finance-receipts.spec.ts` mở rộng — hoàn cọc sinh đúng một phiếu chi; sửa hoàn cọc để lại
đúng một phiếu hiệu lực; phiếu bảo dưỡng hoàn thành sinh phiếu chi gắn đúng xe.

---

### Slice 3 — Phiếu tự động là bất khả xâm phạm (đóng D)

- `ReceiptsService.cancel`: `loadFor` nay `select` thêm `source, sourceRefId, bookingId`; nếu
  `source !== 'manual'` → **409** mã mới `RECEIPT_SOURCE_LOCKED` (`packages/types/src/api.ts` →
  `API_ERROR_CODE`), `details: { source, sourceRefId, bookingId }` để FE dựng được đúng đường dẫn
  quay về. Thông điệp: *"Phiếu tự động — huỷ ở chính nơi phát sinh"*. Đây là chặn `F-4` / edge 6.
- `cancelWithinTx` **giữ nguyên** — chính nó là đường đảo hợp lệ mà `cancel` đang chỉ tới.
- `create` (nhập tay) luôn `source = 'manual'`, nhận `occurredAt`, và tự phân giải
  `tenantCustomerId` từ `bookingId` được chọn — **không** lấy từ body (CLAUDE.md §5).
- Ánh xạ mã lỗi mới trong `apps/web/src/i18n/use-error-message.ts` + `messages/{vi,en}/errors.json`.

---

### Slice 4 — API đủ cho màn Thu-Chi

**`apps/api/src/modules/finance/dto/finance.dto.ts`**

`ReceiptListQueryDto` thêm: `q` (tìm mã phiếu / diễn giải / mã đơn / biển số), `vehicleId`,
`tenantCustomerId`, `source`, `paymentMethod`. `from`/`to` **đổi sang lọc `occurred_at`** (sửa cả
mô tả `@ApiPropertyOptional`).

`ReceiptListItemDto` thêm: `occurredAt`, `source`, `sourceRefId`, `bookingCode`, `vehicleId`,
`vehicleName`, `plateNumber`, `tenantCustomerId`, `customerName`. Lấy bằng nested `select` trên
quan hệ **có sẵn** (`booking`, `vehicle`, `tenantCustomer`) trong **cùng một** `findMany` — ba
LEFT JOIN theo FK đã đánh index, ≤100 dòng/trang, không N+1.

`ReceiptDetailDto` thêm: `requestedByName` / `approvedByName` / `cancelledByName` — **chỉ ở chi
tiết**, không ở list: `requested_by`/`approved_by` là cột `Char(26)` trần **không có quan hệ Prisma**,
nên phải một truy vấn thứ hai (dùng lại khuôn `SettlementService.actorNames`). Nhét vào list là một
truy vấn phụ trên mỗi trang để lấy thứ hiếm khi ai đọc.

**Endpoint mới**

| Endpoint | Quyền | Trả về |
| --- | --- | --- |
| `GET /receipts/summary` (nhận **đúng bộ filter** của list) | `FINANCE_VIEW` | `{ totalIncome, totalExpense, balance, incomeCash, incomeTransfer, count }` — thẻ tổng trên màn khớp đúng danh sách đang xem |
| `GET /receipts/booking-options?q=` | `RECEIPT_CREATE` | Danh sách gọn cho ô "Liên kết đơn thuê": `{ id, code, customerName, vehicleName, plateNumber, totalAmount, paidAmount, debtAmount }`, giới hạn 20, ưu tiên đơn còn nợ |
| `POST /uploads/receipt-attachments/presign` | `RECEIPT_CREATE` | Cùng khuôn `storage.controller.ts:43`, prefix `tenants/{tenantId}/receipts` |

`GET /finance/summary` (dashboard) đổi cột lọc `createdAt → occurredAt` cho nhất quán.

> ⚠️ **Bẫy thứ tự route:** `receipts.controller.ts` đã có `@Get(':id')` ở dòng 36. `@Get('summary')`
> và `@Get('booking-options')` phải khai báo **TRƯỚC** nó, nếu không Nest khớp `:id = 'summary'` và
> trả 404 "Không tìm thấy phiếu".

---

### Slice 5 — Dựng lại `/manage/receipts`

**`apps/web/src/app/(manage)/manage/receipts/page.tsx`**
- Gác quyền: thiếu `FINANCE_VIEW` → `<PermissionState kind="forbidden">` (theo mẫu
  `vehicles/page.tsx:82-96`).
- Bỏ 2 `<Select>` thô → **`FilterBar`** với `FILTER_FIELDS` khai báo ở module scope:
  `search q` · `dateRange from/to` · `select` loại · trạng thái · danh mục · hình thức · nguồn.
  Bật `showActiveChips`.
- Hàng preset kỳ (`segmented`): Hôm nay · Tuần này · Tháng này · Tháng trước — ghi `from`/`to` vào
  URL (`DAY_PARAM_FORMAT`).
- `hasFilters` đếm **đủ** mọi filter (sửa nợ ở `page.tsx:53`), `onClearFilters` xoá hết.
- Thay `getErrorMessage` → `useErrorMessage()`.

**Component mới trong `apps/web/src/features/finance/components/`**

| Component | Nội dung |
| --- | --- |
| `ReceiptSummaryCards.tsx` | 4 thẻ đọc `GET /receipts/summary` theo filter đang bật: Tổng thu · Tổng chi · Cân đối · dòng phụ **Thu TM / Thu CK**. Màu lấy từ design token, **không hex cứng** (sửa `F-10` của brief 06). |
| `ReceiptDetailDrawer.tsx` | Dùng `GET /receipts/:id` (đang bỏ không). Hiện đủ trường + ảnh minh chứng (`PreviewImage`) + phả hệ (ai tạo/duyệt/huỷ, lúc nào) + **liên kết ra đơn/xe/khách** + hành động Duyệt/Huỷ với **ô lý do** (đóng `F-6`). |
| `ReceiptCard.tsx` | Thẻ mobile riêng, truyền vào `DataTable renderCard`: số tiền lớn, chip loại/nguồn/trạng thái, dòng đối tượng, ngày. |

**`ReceiptTable.tsx`** — cột mới: `Ngày` (`occurredAt`), `Phiếu` (số + chip nguồn), `Danh mục`,
`Đối tượng` (khách · xe/biển số · mã đơn — dựng bằng `EntityIdentity`), `Số tiền` ±, `Hình thức`,
`Trạng thái`, hành động. Hành động **Huỷ ẩn** khi `isAutoReceipt(source)`; click dòng mở
`ReceiptDetailDrawer`. Truyền `renderCard={ReceiptCard}`.

**`ReceiptFormDrawer.tsx` — viết lại**, thứ tự đúng như thao tác thật của chủ xe:

```
Ngày (mặc định hôm nay)            Loại phiếu (Thu / Chi)
── Liên kết đơn thuê (auto-fill) ──────────────────────────
Khách hàng (tự điền, khoá)         Biển số xe (tự điền, khoá)
Danh mục (gợi ý theo đơn)          Liên quan đến xe
Số tiền  → dòng chữ "Mười lăm triệu…"   Hình thức
Mã tra soát                        Ảnh minh chứng (upload)
Diễn giải / lý do
```

- Ô đơn thuê: `AutoCompleteField` gọi `/receipts/booking-options` (debounce). Chọn xong **tự điền**
  khách, biển số, `vehicleId`, danh mục gợi ý, và **số tiền = công nợ còn lại**.
- Số tiền bằng chữ: hàm mới `moneyToVietnameseWords()` trong `apps/web/src/lib/money.ts`
  (**chưa tồn tại trong repo** — đã kiểm tra). Thuần, có unit test riêng.
- Ảnh minh chứng: `ImageUploadField` + presign mới → đóng authority #4 của brief 06.
- Bỏ `style={{}}` inline → CSS module + `StickyFormActions`.

**Hai món nhỏ đi kèm (đã có API, thiếu FE)**
- `cancelReceipt(id, reason?)` ở `features/finance/api.ts:56` **đã nhận lý do** — chỉ cần ô nhập
  trong drawer là đóng `F-6`.
- `PATCH /finance/categories/:id` có ở backend, `api.ts` chưa có `updateCategory` → thêm để
  `CategoryManagerModal` đổi tên được danh mục của gian hàng.

**Test** — `receipts-page.test.tsx`: 3 spec `HIỆN TRẠNG` (:254, :481 và nhánh "Xoá bộ lọc" :267)
**lật sang hành vi mới**, giữ nguyên phần còn lại. Spec mới: chip nguồn; phiếu tự động không có
hành động Huỷ; lọc ngày/danh mục/tìm kiếm được tính là "đang lọc"; mở drawer chi tiết; thẻ mobile.

---

### Slice 6 — Liên kết qua lại

Nguyên tắc: **màn nào đã có bề mặt tiền thì chỉ cần một đường dẫn**; màn nào chưa có gì mới dựng
khối thật. Tránh đẻ ra bề mặt tiền thứ hai lệch với bề mặt thứ nhất.

| Màn | Thêm gì |
| --- | --- |
| Chi tiết đơn (cạnh `PaymentHistory`, `BookingActionBar.tsx:167`) và `SettlementCard.tsx` | Đã có lịch sử thu tiền + quyết toán ⇒ chỉ thêm link **"Xem trên sổ Thu-Chi"** → `/manage/receipts?bookingId=…`, hiện khi có `finance.view` |
| Hồ sơ xe (`Vehicle360Overview.tsx`, khu chi phí/bảo dưỡng) | Đã có khối chi phí ⇒ link `/manage/receipts?vehicleId=…`, gác `finance.view` |
| Sổ khách (`CustomerDetailView.tsx`) | **Chưa có bề mặt tiền nào** ⇒ tab thật **"Thu chi"** (`useReceipts({ tenantCustomerId, limit: 10 })` + "Xem tất cả"), chỉ hiện khi có `finance.view` (tiền là quyền riêng — luật của S-01) |
| Dòng/drawer phiếu | Link ra `/manage/bookings/[id]`, `/manage/vehicles/[id]`, `/manage/customers/[id]` |

`apps/web/src/constants/routes.ts` — hiện **chỉ có `vehiclePath`**; thêm `bookingPath.detail(id)`,
`customerPath.detail(id)`, `receiptsPath.filtered({ bookingId?, vehicleId?, tenantCustomerId? })`.

Chiều ghi đã nằm ở Slice 1–2: `PaymentsService` / `SettlementService` điền `receipts.tenant_customer_id`
— đây mới là lúc index `(tenant_id, tenant_customer_id)` (nằm không từ S-01) có việc để làm.

---

## 5. Cái cố ý KHÔNG làm đợt này

Báo cáo / biểu đồ / xuất CSV · drill-down từ `/manage/finance` (sau slice này chỉ còn là vài dòng,
vì `occurred_at` + `receiptsPath.filtered` đã có) · chiều **chi nhánh** trên phiếu (`receipts` không
có `branch_id`; suy từ xe được nhưng phiếu không gắn xe thì mù) · i18n màn receipts (cổng quản lý
chưa tới lượt — thứ tự ở roadmap: `components/form` + `manage-common` → vehicles → …) · **thu phần
`additionalDue`** khi phụ phí vượt cọc · hoàn tiền một phần · maker-checker · cổng thanh toán ·
"Phiếu tổng hợp" của bản cũ.

**Không đụng tới:** `receipts.deleted_at` — cột có, không ai ghi. Đó là một mâu thuẫn có sẵn, sửa
trong diff này chỉ làm loãng phạm vi.

**Số tiền bằng chữ** (`moneyToVietnameseWords`) là món **cuối cùng** của Slice 5 — dễ, thuần, có
test riêng, nhưng không đồng nào phụ thuộc vào nó. Cắt trước tiên nếu phải cắt.

### 5.0 Đợt 2 — MỘT con số phải-thu cho một đơn ✅

Người dùng báo một đơn thật (`DHCBDDG6`): thu 720k tiền thuê qua nút "Thu tiền", rồi 200k quá giờ
ghi bằng **phiếu tay** ở sổ ⇒ màn đơn nói 720k, sổ nói 920k.

**Nguyên nhân:** tiền của một đơn nằm ở BA bảng và chúng không nói chuyện với nhau.

| Nơi | Trước | Sau |
| --- | --- | --- |
| `payments` | → `paid_amount`, đơn thấy | không đổi (vẫn là writer duy nhất) |
| `booking_surcharges` | chỉ nuôi phép tính hoàn cọc | **vào `phải thu`** |
| `receipts` gắn tay | chỉ nằm ở sổ | **vào `đã thu`** khi đã duyệt |

**Công thức duy nhất** — `apps/api/src/common/booking-money.ts`, có cả bản TS (`bookingMoney()`)
lẫn bản SQL (`SQL_AMOUNT_DUE` / `SQL_COLLECTED` / `SQL_DEBT` + `BOOKING_MONEY_JOINS`) vì các danh
sách phải so cột-với-cột:

```
phảiThu = total_amount + phụ phí còn hiệu lực
đãThu   = paid_amount + phiếu thu TAY đã duyệt + min(phụ phí, cọc ĐÃ THU)
cònNợ   = max(0, phảiThu − đãThu)
```

> ⚠️ **`min(phụ phí, cọc đã thu)` là mấu chốt chống ĐẾM HAI LẦN.** Quyết toán cọc đã trừ phụ phí
> vào tiền hoàn (`proposedRefund = cọc − phụ phí`). Cộng thẳng phụ phí vào công nợ mà quên trừ lại
> phần cọc gánh là bắt khách trả hai lần: một lần bị giữ bớt cọc, một lần bị đòi nợ.

**Áp cho:** chi tiết + danh sách đơn · `/manage/debts` (kể cả bộ lọc `unpaid`, trước tính trên
`paid_amount`) · dashboard tài chính · sổ khách · giám sát nền tảng.
**Hợp đồng CỐ Ý giữ `total − paid`** — bản đông cứng lúc ký, phụ phí phát sinh sau khi ký.

**Không tính vào `đã thu`:** phiếu `source=payment` (đã ở `paid_amount`) · `source=deposit` (tiền
giữ hộ) · phiếu CHI gắn đơn (chi phí gian hàng) · phiếu chưa duyệt.

**Giao diện:** khối tiền của đơn tách `Tiền thuê / Phát sinh / Phải thu / Đã thu (trong đó thu ở
sổ) / Còn nợ`, và hiện **"Thu vượt"** khi đã thu > phải thu — đúng trường hợp của user (thu 200k
quá giờ nhưng chưa ghi phụ phí, nên hai vế chưa cân). Nút "Lịch sử thanh toán" đổi thành **"Sổ
tiền của đơn"** và liệt kê thêm phiếu ghi thẳng ở sổ.

### 5.1 Việc còn thiếu, đã biết (từ vòng review)

| Việc | Vì sao chưa làm ngay |
| --- | --- |
| **Nút "Sửa chi phí"** trên phiếu bảo dưỡng ĐÃ hoàn tất | `PATCH …/records/:id/cost` đã có và đã test; UI nằm ở `VehicleMaintenanceCard`/workspace — khu vực của epic Vehicle 360, đụng vào là mở rộng phạm vi. Tạm thời drawer phiếu chỉ đường về hồ sơ xe. **Phải làm trước khi coi mảng bảo dưỡng là đóng.** |
| Ô tìm kiếm `q` quét cả `description` và mã đơn ⇒ **index trigram không dùng được** | Postgres chỉ BitmapOr khi mọi nhánh OR có index; `description` không có, `booking.code` là subquery. Chọn một trong hai: thêm `description` vào index và giải mã-đơn bằng truy vấn phụ, hay thu hẹp ô tìm về mã chứng từ. |
| `bookingOptions` sắp theo nợ **chỉ trong 20 đơn mới nhất** | Sắp ở JS sau `take: 20`. Đơn nợ từ ba tháng trước vẫn phải gõ mã mới thấy. Cần `ORDER BY (total_amount - paid_amount) DESC` bằng raw query. |
| Thẻ tổng khi lọc theo **trạng thái** | `summary` luôn ép `status: approved`, nên lọc "Đã huỷ" cho ra bảng phiếu huỷ dưới thẻ cộng phiếu đã duyệt. Hoặc bỏ `status` khỏi `summaryParams`, hoặc phản ánh nó. |
| Ý nghĩa "Tổng thu" của `/finance/summary` | Nay gồm cả cọc (tiền vào), khác với "Doanh thu" theo xe (đã loại cọc). Cần chốt và nói rõ trên giao diện. |

---

## 6. Xác minh

1. `pnpm db:up` **trước mọi lệnh test API** — spec Vehicle 360 tự bỏ qua trong im lặng khi thiếu
   PostgreSQL và vẫn báo xanh (bẫy đã ghi ở roadmap §2.1).
2. `pnpm --filter @xeprime/prisma exec prisma migrate dev` → `migrate status` + `migrate diff` sạch;
   chạy lại backfill lần hai ra **0 dòng** (idempotent). Seed lại: 18 danh mục hệ thống, 5 có `code`.
3. Jest theo module (`verify-changes` skill — không quét cả workspace):
   `payments.spec.ts`, `finance-receipts.spec.ts`, spec settlement, spec maintenance.
4. Vitest `apps/web`: `receipts-page.test.tsx`, test mới của `moneyToVietnameseWords`,
   `ReceiptFormDrawer`, `ReceiptDetailDrawer`.
5. `typecheck` + `lint` scoped cho `apps/api`, `apps/web`, `packages/types`.
6. **Smoke HTTP thật** — một vòng tiền trọn vẹn:
   đăng nhập chủ shop → tạo đơn → **thu cọc** (kiểm `paidAmount` KHÔNG đổi, `depositReceived` đúng)
   → **thu tiền thuê** (`paidAmount` đổi, công nợ giảm) → thêm phụ phí → **hoàn cọc** (sinh đúng 1
   phiếu chi số ròng) → thử **huỷ phiếu tự động** ⇒ 409 `RECEIPT_SOURCE_LOCKED` → ghi phiếu bảo
   dưỡng có chi phí ⇒ phiếu chi gắn đúng xe → mở `/manage/receipts`: thẻ tổng khớp danh sách, lọc
   ngày/danh mục/tìm kiếm chạy, drawer chi tiết mở, bấm sang được đơn/xe/khách → tạo phiếu tay có
   auto-fill từ đơn + ảnh minh chứng → thu nhỏ cửa sổ xuống mobile, kiểm thẻ và bottom-sheet lọc.
7. Cập nhật `docs/completion-roadmap.md` §2.1 (đóng epic) và `docs/design-briefs/06_FINANCE_OPERATIONS.md`
   (F-3, F-4, F-6, F-10, F-11, authority #4, edge 5/6/10 đã xử lý).
