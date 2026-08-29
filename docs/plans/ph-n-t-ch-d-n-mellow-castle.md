# Playbook triển khai mô hình doanh thu — prompt cho từng đợt

Ngày: 29/08/2026 · Chuẩn theo **ADR 0020–0027**

## Context

Bảy phase đầu của XePrime đã đóng (auth, gian hàng, xe, chợ, đơn, lịch, tài chính, admin) nhưng
**chưa có nguồn thu nào chạy được**: module `billing` còn ở hình dạng ADR 0010, `assertVehicleQuota`
không được gọi lúc đưa xe lên chợ nên hạn mức gói không có răng, và ADR 0015/0016 đã duyệt từ 21/08
mà chưa có dòng code nào.

Từ 28–29/08 đã chốt xong toàn bộ mô hình qua **tám ADR mới (0020–0027)**. Việc còn lại là thi công.
Tài liệu này **không lặp lại lý do** — lý do nằm ở ADR. Nó trả lời đúng một câu: *mỗi đợt dán prompt
gì vào phiên làm việc mới.*

**Đợt W0 đã xong** (ADR + bộ từ vựng dùng chung, 125 test xanh). Tài liệu này bắt đầu từ W1.

## Cách dùng

Mỗi đợt là **một prompt tự chứa**, dán vào một phiên Claude Code mới. Bên trong chia thành **LÔ**
— mỗi lô là một điểm dừng an toàn để `/commit` và review. Không cần nhớ gì giữa các phiên: prompt
nào cũng nhắc lại đủ bối cảnh.

Trước khi dán, **luôn dán kèm [Khối bối cảnh chung](#khối-bối-cảnh-chung) ở đầu**.

### Thứ tự và phụ thuộc

```
        ┌─► W2 ──► W4 ──┐
W1 ─────┼─► W3          ├──► W6 ──► W7 ──► W8
        └─► W5 ─────────┘
```

| Đợt | Nội dung | Cần trước | Tự nó ship được gì |
| --- | --- | --- | --- |
| **W1** | Đổi hình mô hình gói sang cước theo chỗ | W0 | Admin bán gói đúng mô hình, kỳ hạn tính đúng tháng lịch |
| **W2** | Hạn mức theo loại xe + hoá đơn gói + "Gói của tôi" | W1 | Gian hàng tự mua gói, hạn mức có hiệu lực thật |
| **W3** | Phân quyền tính năng theo gói (ADR 0027) | W1 | **Gói có giá trị thật ngay cả khi chưa có SePay** |
| **W4** | Đối soát SePay cho tiền gói | W2 · *tài khoản SePay* | **Đồng tiền đầu tiên tự về** |
| **W5** | Tính hoa hồng + nhãn hai tuyến | W1 | Chỉ đọc, chưa thu đồng nào — ship tối được |
| **W6** | Đặt & giữ chỗ ngay — thu tiền khách | W4 · W5 | ⚠️ **Điểm không quay lại** |
| **W7** | Ví, hoàn tiền, escrow, đường chuyển trả | W6 | Vòng đời tiền khép kín |
| **W8** | Mobile ngang bằng web | W6 | — |

Sau W1 có **ba nhánh chạy song song được**: W2→W4 (bán gói + thu tiền), W3 (năng lực), W5 (hoa hồng).
Dừng sau W4 vẫn là một sản phẩm hoàn chỉnh có doanh thu.

**W3 có nhịp riêng.** Năm lô của nó không nên dồn vào một lần phát hành: lô 5(a) — bật cổng chặn —
phải chờ log cảnh báo im qua **ít nhất một chu kỳ kinh doanh**. Cứ chạy các đợt khác trong lúc ngâm.

---

## Khối bối cảnh chung

> Dán khối này ở ĐẦU mọi prompt bên dưới.

````text
Bạn đang làm việc trong repo XePrime (monorepo pnpm: apps/{web,api,worker,mobile},
packages/{types,domain,api-client,ui,validators,config}, prisma).

ĐỌC TRƯỚC KHI VIẾT DÒNG NÀO:
- CLAUDE.md — kỷ luật repo, bảng "Cấm tuyệt đối"
- docs/decisions/ ADR 0020–0027 — mô hình doanh thu; ADR THẮNG mọi tài liệu khác
- docs/CODEMAP.md — cái gì nằm ở đâu

SKILL phải nạp đúng loại việc (đừng tự nhớ luật rời rạc):
- backend-endpoint — trước khi thêm/sửa bất cứ thứ gì ở apps/api
- database-change  — trước khi đụng schema.prisma / migration / seed
- frontend-feature — trước khi viết gì ở apps/web
- i18n             — trước khi viết BẤT KỲ chữ nào hiện cho người dùng
- shared-code      — khi thấy giá trị/logic lặp lần thứ hai
- verify-changes   — trước khi chạy build/lint/test/typecheck

BẪY CỦA REPO NÀY — sai là mất thời gian ngay bước đầu:
1. Migration VIẾT TAY, không sinh bằng `prisma migrate dev`. schema.prisma không mô tả được FK tổ
   hợp (id, tenant_id), partial index, CHECK, EXCLUDE — Prisma sẽ sinh lệnh DROP chúng. Chép khối
   header của prisma/migrations/20260821000000_init/migration.sql, viết SQL tay, rồi đối chiếu:
   prisma migrate diff --from-schema ./schema.prisma --to-config-datasource
   (số khác biệt cố ý phải giữ nguyên).
2. Test apps/api chạy trên Postgres THẬT ở TEST_DATABASE_URL — KHÔNG phải testcontainers.
3. Guard ở apps/api đều là GLOBAL qua APP_GUARD trong app.module.ts, THỨ TỰ CÓ Ý NGHĨA:
   Throttler → Auth → TenantScope → PlatformScope → Permission.
   Không bao giờ @UseGuards(...) ở controller cho các guard này — chúng chạy sau guard global.
   Decorator nằm chung ở apps/api/src/common/decorators/index.ts:
   @Public() @RequirePermissions() @PlatformOnly() @TenantScoped() @CurrentUser() @CurrentTenant()
   @TenantScoped() là OPT-IN; tenantId LUÔN lấy từ membership, KHÔNG BAO GIỜ từ body/query/header.
4. Không có helper AppException. Service ném exception Nest chuẩn với body
   { code: API_ERROR_CODE.X, message, details } — all-exceptions.filter.ts lo phần còn lại.
5. Transaction: kiểu là Prisma.TransactionClient. Hàm công khai mở tx, phần lõi dùng lại đặt tên
   `*WithinTx(tx, ...)`.
6. Đổi bề mặt API (controller/DTO/guard/permission) ⇒ BẮT BUỘC chạy `pnpm contract`, commit
   packages/types/openapi.json + api.generated.ts, rồi
   `pnpm --filter @xeprime/api test -- openapi-contract` (17 khẳng định, vài giây, không cần DB).
   Mỗi route cần @ApiTags (tag phải có trong api-tags.ts) + @ApiOperation({summary}) +
   @ApiOkResponse({type: XDto}) — khai `type`, KHÔNG khai schema inline. Chi tiết: docs/api-docs.md §6.
7. apps/web KHÔNG viết tay DTO: `type Schemas = components['schemas']` từ @xeprime/types.
   Query key ở packages/api-client/src/query-keys.ts, import qua '@/services/query-keys'.
8. Chữ hiện cho người dùng: vi + en, message ở packages/domain/messages/{vi,en}/.
   Thêm namespace MỚI phải sửa đủ 5 file (2 json + namespaces.ts + 2 file gom index.ts) —
   thiếu một cái là `pnpm --filter @xeprime/web i18n:check` đỏ. Lỗi API dịch từ MÃ, không từ
   `message` của backend.
9. Style: CSS Modules cạnh component, mọi giá trị qua biến --xp-*. Không inline style.
10. verify-changes: KHÔNG chạy build/lint/test toàn workspace. Chỉ quét package vừa sửa.

CÁCH LÀM VIỆC:
- Làm theo từng LÔ trong prompt. Hết mỗi lô: chạy phần kiểm chứng của lô đó, báo kết quả THẬT
  (đỏ thì nói đỏ kèm output), rồi dừng cho tôi review trước khi sang lô sau.
- Gặp chỗ mâu thuẫn với ADR hoặc thiếu thông tin để quyết: DỪNG và hỏi, đừng đoán.
- Không tự chạy /commit; tôi sẽ gõ khi review xong.
````

---

## W1 — Đổi hình mô hình gói sang cước theo chỗ

**Cần trước:** W0 · **Ship được:** admin bán gói đúng mô hình, kỳ hạn tính đúng tháng lịch.

````text
[DÁN KHỐI BỐI CẢNH CHUNG Ở ĐÂY]

NHIỆM VỤ — W1: đổi `plans` + `tenant_subscriptions` từ mô hình gói phẳng (ADR 0010) sang
cước theo CHỖ XE, kỳ tính bằng THÁNG LỊCH (ADR 0015), và bổ sung chế độ thu phí (ADR 0020/0024).

Đọc trước: ADR 0015 (toàn bộ), ADR 0020 điều 1–4, ADR 0024 điều 1–2 và điều 8,
apps/api/src/modules/billing/billing.service.ts, prisma/schema.prisma model Plan + TenantSubscription.

── LÔ 1 · Migration ────────────────────────────────────────────────────────
Đây là bước expand của expand/contract. TUYỆT ĐỐI KHÔNG drop cột cũ ở đợt này —
tenant_subscriptions có khoá ngoại RESTRICT tới plans.

Thêm vào `plans`:
  base_price_monthly       Decimal(14,2) NOT NULL DEFAULT 0
  billing_mode             VarChar(30)   NOT NULL DEFAULT 'commission'
  commission_percent       Decimal(5,2)  NULL
  assumed_monthly_gmv_json JsonB         NULL
Thêm vào `tenant_subscriptions`:
  term_months        Int          NULL   (backfill xong mới NOT NULL ở đợt sau)
  slots_json         JsonB        NULL
  billing_mode       VarChar(30)  NULL   ← SNAPSHOT, không đọc xuyên qua plans
  commission_percent Decimal(5,2) NULL

CHECK viết tay trong migration:
  - plans: billing_mode IN ('commission','package')
  - plans: (billing_mode='package' AND commission_percent IS NULL)
        OR (billing_mode='commission' AND commission_percent BETWEEN 1 AND 20)
  - tenant_subscriptions: term_months IS NULL OR term_months IN (1,3,6,12)
  Ghi kèm comment: "ADR 0005 — status lưu String, DB canh bằng CHECK; thêm giá trị mới thì sửa CẢ HAI nơi."

Backfill trong cùng migration:
  - Reshape plans.limits_json theo ADR 0015 điều 4:
    { perVehiclePrice:{car,motorbike}, includedCars, includedMotorbikes, maxCars, maxMotorbikes,
      maxMembers, maxBranches, terms:[{months,discountPercent}], graceDays, features:[...] }
    Gói hiện có: suy maxCars từ max_vehicles cũ, motorbike để null.
  - tenant_subscriptions: term_months suy từ plans.duration_days cũ (30→1, 90→3, 180→6, 365→12;
    số lạ thì 1 và ghi log), billing_mode/commission_percent copy từ plan tương ứng.
  - features: gói hiện có nhận ĐỦ cờ đang dùng — xem cảnh báo ở W3, đừng khoá nhầm ai.

Kiểm chứng lô 1:
  pnpm db:deploy
  prisma migrate diff --from-schema ./schema.prisma --to-config-datasource   # số diff cố ý không đổi
  docker compose exec db psql -U xeprime -c "\d plans"

── LÔ 2 · BillingService ───────────────────────────────────────────────────
- billing.service.ts:260 đang tính `startsAt + durationDays * 86400000`. THAY bằng
  `addCalendarMonthsVn(startsAt, termMonths)` từ @xeprime/types. Đây là phép nhân CLAUDE.md cấm.
- `assign()` nhận thêm termMonths + slots, ghi snapshot billing_mode + commission_percent lên dòng
  subscription (ADR 0024 điều 2: admin sửa plan KHÔNG được lật chế độ của tenant giữa kỳ).
- `findCurrent()` trả thêm billing_mode + commission_percent + slots.
- KIỂM ĐIỂM GIAO (ADR 0020, quy tắc trong code, không phải núm): khi lưu/sửa một bậc gói
  billing_mode='package', tính điểm hoà vốn so với tuyến hoa hồng từ assumed_monthly_gmv_json.
  Nếu điểm hoà vốn nằm DƯỚI includedCars của chính bậc đó ⇒ TỪ CHỐI lưu.
  Lý do: base_price_monthly = 0 làm chủ xe một chiếc cũng mua gói và tuyến hoa hồng mất vai trò phễu.
  Mã lỗi mới: PLAN_INCENTIVE_INVALID (thêm vào packages/types/src/api.ts + errors.json vi/en).
- DTO: bổ sung field mới, @ApiProperty đầy đủ.

Kiểm chứng lô 2:
  pnpm --filter @xeprime/api typecheck
  pnpm --filter @xeprime/api test -- platform-billing
  pnpm contract && pnpm --filter @xeprime/api test -- openapi-contract

── LÔ 3 · Màn quản trị gói + seed ──────────────────────────────────────────
- apps/web/src/features/admin-plans/: thêm bộ núm mới vào PlanFormModal (chế độ thu phí, % hoa hồng,
  phí nền/tháng, đơn giá theo loại xe, số chỗ gồm sẵn, trần chỗ, kỳ hạn + % giảm, graceDays, cờ tính năng).
- Hiện cảnh báo kiểm điểm giao ngay trong form, đọc lỗi từ MÃ.
- prisma/src/seed/system.ts đã có sẵn BA gói `free` / `standard` / `pro` (mảng PLANS ~dòng 187,
  upsert theo `code` ~dòng 233). RESHAPE ba gói đó, ĐỪNG tạo mã mới — đổi mã là mồ côi mọi
  tenant_subscriptions đang trỏ tới.
    free     → billing_mode 'commission', commission_percent 10, base_price_monthly 0
    standard → billing_mode 'package', có phí nền + đơn giá theo chỗ
    pro      → như standard, đơn giá theo chỗ rẻ hơn, trần chỗ cao hơn
  Giá đặt tạm, admin chỉnh sau; KHÔNG hard-code trong mã.
  ⚠️ `free` là gói MẶC ĐỊNH lúc đăng ký — mọi gian hàng thật đang ở đó. Đặt nó vào tuyến hoa hồng
  là quyết định có ý nghĩa tiền bạc, không phải giá trị placeholder.
- Chữ mới: vi + en.

Kiểm chứng lô 3:
  pnpm --filter @xeprime/web typecheck
  pnpm --filter @xeprime/web i18n:check
  pnpm db:seed

XONG W1 KHI: tạo được một bậc gói gian hàng có phí nền + đơn giá theo chỗ, gán cho tenant thì
ends_at rơi đúng ngày cùng số của N tháng sau (không phải N×30 ngày), và lưu một bậc gói có
điểm hoà vốn sai bị từ chối.
````

---

## W2 — Hạn mức theo loại xe, hoá đơn gói, "Gói của tôi"

**Cần trước:** W1 · **Ship được:** gian hàng tự mua gói, hạn mức có hiệu lực thật.

````text
[DÁN KHỐI BỐI CẢNH CHUNG Ở ĐÂY]

NHIỆM VỤ — W2: cho hạn mức gói mọc răng và dựng hoá đơn gói.

Đọc trước: ADR 0015 điều 1, 5, 7, 8, 10; ADR 0022 điều 3 (tiền tố mã); ADR 0026 điều 4.

── LÔ 1 · Hạn mức theo loại xe + điểm chặn thứ hai ─────────────────────────
- billing.service.ts:368 `assertVehicleQuota` hiện đếm TẤT CẢ xe và so plan.maxVehicles.
  Tách theo `vehicle_type` (ô tô và xe máy đếm riêng, so với maxCars/maxMotorbikes).
- Giữ NGUYÊN mã lỗi PLAN_LIMIT_REACHED, thêm `details: { vehicleType, used, limit }`.
- ĐIỂM CHẶN THỨ HAI — quan trọng nhất của cả đợt: gọi assertVehicleQuota ở đường ĐƯA XE LÊN CHỢ
  (vehicles.service.ts submitPublic, ~dòng 801). Hiện chỉ chặn lúc TẠO xe, nên gian hàng đăng bao
  nhiêu xe lên sàn cũng được — ADR 0015 điều 7 gọi đây là "cái răng thật".

Kiểm chứng lô 1:
  pnpm --filter @xeprime/api test -- platform-billing
  # thủ công: tenant 1 chỗ ô tô → tạo xe thứ 2 → 409; đưa xe thứ 2 lên chợ → 409

── LÔ 2 · Bảng subscription_invoices ───────────────────────────────────────
Migration viết tay. Cột theo ADR 0015 điều 5:
  id · tenant_id · subscription_id (NULL tới khi kích hoạt) · code · period_from · period_to
  lines_json · subtotal · discount_amount · total_amount · paid_amount · status
  paid_at · expires_at · created_at · updated_at
  @@unique([code])  ← UNIQUE TOÀN SÀN, không phải theo tenant: webhook chỉ có chuỗi nội dung
                       chuyển khoản, không có ngữ cảnh tenant nào để thu hẹp.
  CHECK status IN ('draft','issued','partially_paid','paid','void')
  Index (tenant_id, created_at), (status, expires_at)
Sinh mã: tiền tố XPG + REFERENCE_CODE_BODY_LENGTH ký tự từ REFERENCE_CODE_ALPHABET
  (@xeprime/types — đã bỏ 0/O/1/I).
KHÔNG nối FK payments.subscription_id (ADR 0022 điều 6) — cột đó vẫn để trống; cập nhật docblock
của nó nói rõ vì sao.

BillingService là writer DUY NHẤT. Sinh hoá đơn khi mua / gia hạn / mua thêm chỗ.
Mua thêm chỗ giữa kỳ = HUỶ dòng hiện hành + CHÈN dòng mới cùng ends_at, prorate TRÒN THÁNG theo số
tháng còn lại (ADR 0015 điều 8 — giữ bất biến "một dòng hiệu lực tại một thời điểm").

── LÔ 3 · Màn "Gói của tôi" ────────────────────────────────────────────────
- Route mới apps/web/src/app/(manage)/manage/subscription/page.tsx + feature folder
  features/subscription/ theo khuôn chuẩn (api.ts, types.ts, hooks/, components/).
- Hiện: gói hiện hành, hạn, số chỗ đã dùng / đã mua theo loại xe, CÒN MẤY LƯỢT MIỄN PHÍ
  (ADR 0026 — người dùng không được bất ngờ ở đơn thứ ba), lịch sử hoá đơn, nút mua/gia hạn.
- Mua/gia hạn ⇒ sinh hoá đơn + hiện mã đối soát; CHƯA có QR ở đợt này (QR ở W4).
- Namespace i18n mới `subscription` — nhớ đủ 5 file.

── LÔ 4 · Job vòng đời gói ─────────────────────────────────────────────────
apps/worker/src/jobs/subscription-lifecycle.ts, theo đúng khuôn
apps/worker/src/jobs/booking-request-deadlines.ts:
  - withAdvisoryLock, lock key 4_206 (kế tiếp 4_205), interval 1 giờ
  - claim bằng updateMany theo đúng điều kiện đã chọn ⇒ chạy lại ra 0 dòng
  - BATCH giới hạn mỗi nhịp
  - đăng ký trong apps/worker/src/main.ts
Việc của job:
  1. Nhắc hạn trước / đúng hạn / trong ân hạn qua module notification (ADR 0016 điều 3).
  2. Hết ends_at + graceDays ⇒ CHUYỂN TUYẾN sang hoa hồng và đồng bộ lại listing.
     ⚠️ KHÔNG ẩn xe khỏi chợ — ADR 0020 điều 5 đã SỬA ADR 0015 điều 6.
     Đồng bộ phải gọi ListingsService, billing KHÔNG tự ghi public_listings (ADR 0008).
  3. Tenant tiêu hết lượt miễn phí ⇒ sinh sẵn hoá đơn gói + nhắc (ADR 0026 điều 4).
     TUYỆT ĐỐI không kích hoạt gói chưa trả tiền.

Kiểm chứng W2:
  pnpm --filter @xeprime/api typecheck && pnpm --filter @xeprime/web typecheck
  pnpm --filter @xeprime/web i18n:check
  pnpm contract && pnpm --filter @xeprime/api test -- openapi-contract
  # chạy job hai lần liên tiếp → lần hai ra 0 dòng

XONG W2 KHI: gian hàng tự đặt mua gói và nhận được mã đối soát; vượt hạn mức bị chặn ở CẢ hai
điểm; gói hết hạn thì xe VẪN Ở TRÊN CHỢ và chuyển sang tuyến hoa hồng.
````

---

## W3 — Phân quyền tính năng theo gói

**Cần trước:** W1 (chạy song song được với W2) · **Ship được:** gói có giá trị thật ngay cả khi
chưa có SePay — đây là đợt biến gói từ "một con số" thành "một sản phẩm".

> ⚠️ Đợt này có một **thứ tự deploy bắt buộc**. Bật cổng chặn sai lúc sẽ khoá sổ sách của **toàn
> bộ gian hàng đang dùng thật trong một lần deploy**. Đọc LÔ 3 trước khi bắt đầu LÔ 1.

````text
[DÁN KHỐI BỐI CẢNH CHUNG Ở ĐÂY]

NHIỆM VỤ — W3: dựng trục năng lực theo gói (ADR 0027). Ba trạng thái enabled / read_only / hidden,
chặn ở SERVER, menu chỉ là trang trí.

Đọc trước: ADR 0027 (TOÀN BỘ), ADR 0014 điều 2–3, ADR 0015 điều 4.
Bộ từ vựng đã có sẵn từ W0 ở packages/types/src/status/billing.ts:
PLAN_FEATURE (8 cờ), PLAN_FEATURE_LABEL, FEATURE_STATE, featureState(), canWriteFeature(),
isFeatureVisible().

⚠️ BA SỰ THẬT VỀ REPO NÀY LÀM HỎNG CÁCH LÀM NGÂY THƠ — đọc kỹ:
1. `receipts` được sinh TỰ ĐỘNG cho MỌI tenant từng nhận tiền đơn (ReceiptsService
   .createApprovedWithinTx được gọi từ settlement, payments, maintenance). Nên
   "tenant này đã dùng sổ thu chi chưa" KHÔNG phải `EXISTS(receipts)` — phải là
   `source = 'manual'` HOẶC có finance_categories riêng. Dùng EXISTS thẳng là biến CẢ SÀN
   thành read_only và không bao giờ có ai ở trạng thái hidden.
2. `registerShop` LUÔN tạo sẵn một chi nhánh mặc định và một membership chủ shop.
   Nên ngưỡng của branches/members là `> 1`, không phải EXISTS.
3. `plans.limits_json` hiện là NULL ở cả ba gói đã seed và KHÔNG có dòng code nào đọc nó.
   Nghĩa là nếu bật cổng chặn trước khi seed cờ, MỌI tenant có tập cờ RỖNG.

── LÔ 1 · Cột used_features + đọc trạng thái (chưa chặn gì) ────────────────
Migration viết tay prisma/migrations/&lt;ts&gt;_tenant_used_features/:
  ALTER TABLE tenants ADD COLUMN used_features text[] NOT NULL DEFAULT '{}';
  CHECK used_features <@ ARRAY['finance','debts','maintenance','members','branches',
                               'drivers','contracts','escrow_hold']::text[]
  (CHECK này cố ý: thêm cờ thứ 9 buộc phải viết migration nới nó ⇒ PLAN_FEATURE và DB không trôi
   khỏi nhau. Không index — luôn đọc theo khoá chính.)

Backfill NGAY TRONG migration đó, mỗi cờ một câu lệnh riêng để review được từng cái:
  finance     : EXISTS(receipts WHERE source='manual') OR EXISTS(finance_categories tenant riêng)
  debts       : đi theo finance (không có bảng riêng — /debts suy từ bookings + receipts)
  maintenance : EXISTS(vehicle_maintenance_records) OR EXISTS(vehicle_maintenance_profiles)
  members     : count(tenant_memberships) > 1 OR EXISTS(tenant_invites)
  branches    : count(tenant_branches WHERE deleted_at IS NULL) > 1
  drivers     : EXISTS(drivers)
  contracts   : EXISTS(contracts)
  escrow_hold : KHÔNG backfill — chưa có endpoint nào (ADR 0025 chưa thi công)

apps/api/src/common/plan/feature-state.ts (mới):
  - CURRENT_SUBSCRIPTION_WHERE(now) — điều kiện "gói hiện hành", DÙNG CHUNG với
    BillingService.findCurrent. Hai định nghĩa "gói hiện hành" trôi khỏi nhau là lỗi chờ sẵn.
  - planFeatureFlags(limitsJson): Set<PlanFeature> — parse phòng thủ, chuỗi lạ thì BỎ, không ném.
  - featureStatesFrom(flags, usedFeatures) — dựng trên featureState() đã có.

Mở rộng SELECT SẴN CÓ trong tenant-scope.guard.ts (KHÔNG thêm truy vấn mới): lấy kèm
tenant.usedFeatures + subscription hiện hành + plan.limitsJson + plan.code + endsAt.
TenantContext (common/types/request-context.ts) mọc thêm: features, usedFeatures, planCode, planEndsAt.
  ⚠️ ĐỪNG cho PlanFeatureGuard inject BillingService: tốn thêm một truy vấn mỗi request và sẽ cần
  cache — mà cache chính là thứ phá ADR 0027 điều 5 (gia hạn xong phải mở lại NGAY).

Đưa xuống client qua MeDto — KHÔNG thêm query riêng. Lý do: useManageNav cần nó ở LẦN VẼ ĐẦU,
query thứ hai làm menu nhấp nháy; và MeDto dùng chung cho cả web lẫn app native.
  CurrentTenantSummaryDto (apps/api/src/modules/auth/dto/auth.dto.ts) mọc thêm:
    features: TenantFeatureStateDto[]   ← LUÔN đủ 8 mục, kể cả hidden (vắng mặt ≠ hidden)
    planCode: string | null
    planEndsAt: string | null
  Dùng mảng cặp {feature,state} chứ không phải object khoá cố định: cờ là snake_case, và thêm cờ
  thứ 9 không nên phải sửa class DTO. Theo đúng quy ước nullable trong file đó.
  AuthService.me() mở rộng select y hệt guard và gọi cùng featureStatesFrom().

Kiểm chứng lô 1:
  pnpm db:deploy && prisma migrate diff --from-schema ./schema.prisma --to-config-datasource
  pnpm contract && pnpm --filter @xeprime/api test -- openapi-contract
  Spec mới: plan-features.spec.ts (ma trận ba trạng thái; limits_json NULL/hỏng/chuỗi lạ KHÔNG
  được ném; chèn subscription mới ⇒ read_only → enabled ngay request kế tiếp — đây là điểm KHÁC
  ADR 0024, năng lực không đóng băng)
  Spec mới: plan-feature-backfill.spec.ts — tenant chỉ có receipt tự sinh KHÔNG được đánh dấu
  finance; tenant mới tinh KHÔNG được đánh dấu branches/members. Ba khẳng định này chặn đúng lỗi
  sẽ lật ngược hidden↔read_only cho cả sàn.
→ LÔ 1 ship một mình được: hệ thống TRẢ LỜI được câu "tenant này ở trạng thái nào", chưa chặn gì.

── LÔ 2 · Guard + interceptor, chạy ở chế độ CẢNH BÁO ──────────────────────
Decorator mới trong common/decorators/index.ts: RequiresFeature(f), FeatureReadSafe().
common/guards/plan-feature.guard.ts:
  - Đăng ký CUỐI CÙNG trong app.module.ts, SAU PermissionGuard.
    Lý do phải ghi thành comment: một shop_staff không có finance.view ở gian hàng chưa mua gói
    phải nhận MISSING_PERMISSION, KHÔNG phải FEATURE_NOT_IN_PLAN — tình trạng gói của gian hàng
    không phải thứ một người không có quyền được biết. Quyền trả lời "anh là ai" trước.
  - Không có metadata → cho qua (opt-in, y như @TenantScoped).
  - req.platform có mặt → cho qua (nhân sự nền tảng không bị gói của tenant chặn).
  - ĐỌC vs GHI suy từ req.method: GET/HEAD/OPTIONS là đọc. Đã đối chiếu: mọi route hình-đọc ở 7
    module đều là GET (kể cả GET /receipts/booking-options tuy đòi quyền receipts.create).
    @FeatureReadSafe() là lối thoát cho POST-hình-đọc sau này; đợt này KHÔNG dùng ở đâu.
  - hidden → FEATURE_NOT_IN_PLAN, details {feature}
    read_only + ghi → FEATURE_READ_ONLY, details {feature, planEndsAt}
    CẢ HAI là HTTP 403 (ForbiddenException). Không dùng 402 — toàn bộ máy móc
    enhance-document/openapi-contract coi 403 là nhánh phân quyền, và 402 bị proxy xử lý lung tung.
  - Hai mã mới vào packages/types/src/api.ts + errors.json vi/en + ERROR_MESSAGES trong
    openapi/enhance-document.ts. RouteAccess mọc thêm `feature`, collectForbiddenCodes() tự thêm
    hai mã đó ⇒ luật "route đòi quyền phải mô tả 403" của contract test tự nới theo.

common/interceptors/feature-usage.interceptor.ts (APP_INTERCEPTOR toàn cục):
  Chỉ ghi khi 2xx + có metadata + method ghi + state ENABLED:
    UPDATE tenants SET used_features = array_append(used_features,$2)
     WHERE id=$1 AND NOT ($2 = ANY(used_features));
  ⚠️ Phải là INTERCEPTOR, không phải guard: guard chạy TRƯỚC ValidationPipe, nên ghi ở guard sẽ
  đánh dấu "đã dùng" cho cả request trả 400. Hậu quả nhẹ (hidden→read_only) nhưng VĨNH VIỄN.

Gắn marker (bảng đầy đủ):
  finance     → finance/receipts.controller.ts (class), finance/finance-categories.controller.ts (class),
                finance/finance-overview.controller.ts (THEO TỪNG ROUTE — nó là @Controller() trần
                và còn ôm cả GET /debts)
  debts       → finance-overview.controller.ts @Get('debts') duy nhất
  maintenance → vehicles/maintenance/*.controller.ts (class)
  members / branches / drivers / contracts → controller tương ứng (class)
  escrow_hold → chưa gác gì (ADR 0025 chưa thi công)
  ⚠️ NGOẠI LỆ PHẢI CHỪA, ghi comment giải thích: basic tenant vẫn phải sửa được CHI NHÁNH MẶC ĐỊNH
  DUY NHẤT của mình — đó là địa chỉ công khai của họ. Bỏ marker ở đúng route PATCH đó (để nó hiện
  trong route-access và test coverage nhìn thấy), đừng giấu ngoại lệ trong service.
  KHÔNG gác: payments.controller.ts (tiền TRÊN MỘT ĐƠN là bậc cơ bản — ADR 0027 điều 1 nói chủ xe
  vẫn thấy số tiền từng đơn, chỉ SỔ TỔNG HỢP mới bán), bookings/settlement/* (thuộc giao nhận xe),
  odometer lúc bàn giao, vehicle-contracts.service.ts (hợp đồng NGUỒN GỐC xe, khác hợp đồng thuê).

Biến env mới PLAN_FEATURE_ENFORCEMENT: z.enum(['off','warn','on']).default('warn').
Ở 'warn' guard GHI LOG {tenantId, feature, state, method, path} rồi TRẢ TRUE.
⚠️ Nhớ khai biến này ở GitHub Environment, nếu không deploy đỏ ở bước "Thiếu giá trị bắt buộc".

Spec: plan-feature-guard.spec.ts (ma trận method × state, @FeatureReadSafe, req.platform, warn
không bao giờ ném) · feature-usage.spec.ts (ghi đúng một lần ở 2xx, KHÔNG ghi ở 4xx, không ghi ở
GET, lần hai là no-op) · plan-feature-coverage.spec.ts — QUAN TRỌNG NHẤT: duyệt collectRouteAccess(app),
khẳng định mọi route của 7 controller bị gác đều có marker, và danh sách controller bậc cơ bản thì
KHÔNG có. Một endpoint /receipts/export mới ship thiếu marker sẽ đỏ CI thay vì lọt ra ngoài.
→ LÔ 2 ship một mình được: used_features tự cập nhật, và log cảnh báo cho biết CHÍNH XÁC ai sẽ bị
  chặn — đó là dữ liệu để làm được lô 3. Vẫn chưa ai bị chặn.

── LÔ 3 · Seed cờ vào gói ──────────────────────────────────────────────────
prisma/src/seed/system.ts: ba gói hiện có nhận limits_json.features.
⚠️ GÓI `free` PHẢI CÓ CỜ, không được để rỗng — mọi tenant tự gán gói lúc đăng ký đều đang ở đó và
đều là gian hàng thật.
Nguyên tắc: `free` và `standard` phải mang ÍT NHẤT hợp của mọi cờ mà tenant đang hoạt động trên
gói đó hiện có trong used_features. Ưu tiên GIỮ NGUYÊN QUYỀN CŨ hơn là đúng lý thuyết — siết lại
sau, và chỉ siết với thuê bao MỚI.
Cập nhật cả dữ liệu production, không chỉ seed.
→ Đầu ra của lô này là MỘT CON SỐ: số request bị-cảnh-báo trong log phải về 0 trước khi sang lô 5.

── LÔ 4 · Giao diện ────────────────────────────────────────────────────────
- nav.ts: NavLeaf mọc thêm `feature?: PlanFeature`. Gán: maintenance→MAINTENANCE,
  finance-overview→FINANCE, receipts→FINANCE, debts→DEBTS, shop-branches→BRANCHES,
  drivers→DRIVERS, members→MEMBERS. (contracts KHÔNG có mục menu — vào từ chi tiết đơn, nên chỉ
  gác ở server + useFeature trên nút "tạo hợp đồng".) Thêm `feature?` vào MobileTab luôn để lần
  sau không ai thêm được tab bị gác mà quên lọc.
- use-manage-nav.tsx — MỘT vị từ, BA chỗ gọi:
    const canSeeLeaf = (leaf) => has(leaf.permission) && isVisible(leaf.feature);
  · buildLeaf (~115)  · rollup badge của buildBranch (~159)  · rollup badge của buildSection (~201)
  ⚠️ Thiếu một trong hai rollup thì nhánh/section thu gọn sẽ đếm badge cho mục người dùng không
  thấy — một con số chỉ vào hư không. buildBranch/buildSection đã tự trả null khi rỗng, không cần
  sửa thêm. ĐỪNG đụng matchSelectedKey/flattenLeaves — chúng chạy trên cây CHƯA lọc, và đó chính
  là thứ làm băng thông báo bên dưới tra được.
- use-feature.ts (mới): useFeature(f) → {state, canWrite, isVisible, planEndsAt}, useFeatureStates().
  Dựng trên useCurrentUser() + canWriteFeature()/isFeatureVisible() từ @xeprime/types.
  Thiếu `features` trong cache cũ ⇒ mặc định NHÌN THẤY + GHI ĐƯỢC (đừng khoá ai vì cache cũ).
- Băng thông báo đặt ở AppShell.tsx — nó đã làm đúng việc này cho shopStatusNotice. Tra
  pathname → leaf → leaf.feature → state==='read_only' → <FeatureExpiredNotice/>.
  Một chỗ sửa phủ cả 7 khu, và tái dùng cây nav làm bản đồ href→feature thay vì đẻ bản đồ thứ hai.
- Hai component mới cạnh PermissionState: FeatureExpiredNotice (Alert warning + planEndsAt + nút
  gia hạn + nút "Tôi đã gia hạn — tải lại" gọi invalidateQueries(auth.me)) và FeatureUpsellState
  (cho hidden khi vào thẳng URL — KHÁC PermissionState kind="forbidden": người dùng không thiếu
  quyền, gian hàng của họ thiếu tính năng, nên CTA là "xem gói" chứ không phải "liên hệ quản trị").
  Chữ lấy từ PLAN_FEATURE_LABEL (đã có) — ngôn ngữ người dùng, không phải tên module.
- Nút ghi ở 8 khu: disabled={!canWrite} + Tooltip giải thích. Hàng trong bảng GIỮ NGUYÊN nút,
  chỉ disable — ẩn đi làm trang trông hỏng chứ không trông hết hạn.
- Đường lỗi của api-client: gặp FEATURE_READ_ONLY / FEATURE_NOT_IN_PLAN thì
  invalidateQueries(queryKeys.auth.me()) — tự chữa chiều lệch nguy hiểm (cache nói còn, server nói hết).
  KHÔNG hạ staleTime toàn cục: nó dùng chung với quyền và danh tính, hạ xuống là gấp ba lưu lượng
  /auth/me để chữa một độ trễ 60 giây thuần hiển thị.
- Chữ mới vi + en, gồm cả hai mã lỗi.
- Spec web: use-manage-nav.test.tsx mở rộng (hidden vắng mặt dù có quyền; read_only vẫn hiện;
  nhánh finance ẩn hết thì biến mất; BADGE ROLLUP loại hidden ở CẢ hai đường thu gọn) ·
  use-feature.test.ts · FeatureExpiredNotice.test.tsx · AppShell.test.tsx mở rộng.
→ LÔ 4 ship một mình được: gian hàng bậc cơ bản thấy menu gọn đúng như ADR 0027 điều 3 hứa.
  Server vẫn dễ tính, nên gán sai một cờ chỉ mất một mục menu, KHÔNG khoá ai.

── LÔ 5 · Bật cổng, rồi mới bán ────────────────────────────────────────────
HAI commit, đúng thứ tự này:
  (a) ĐỔI DUY NHẤT PLAN_FEATURE_ENFORCEMENT=on, không kèm thay đổi nào khác.
      Điều kiện tiên quyết: log cảnh báo của lô 2 đã im (0 request bị-chặn) qua ít nhất một chu kỳ
      kinh doanh. Còn hit nghĩa là hoặc gói thiếu cờ (lô 3 siết quá tay) hoặc vị từ backfill sai
      (lô 1 siết quá tay) — sửa, deploy lại, ngâm lại.
      Tách riêng để rollback = một biến env, không phải revert code.
  (b) Màn admin sửa cờ của gói (PlanDto.features, validate theo PLAN_FEATURE_VALUES,
      features/admin-plans) + danh sách "nâng cấp được thêm gì" trong màn "Gói của tôi",
      render từ PLAN_FEATURE_LABEL.
⚠️ TUYỆT ĐỐI không làm lô 3 và lô 5(a) trong cùng một lần deploy.
⚠️ (b) phải sau (a): admin bỏ tick một ô trước khi chế độ chặn được tin cậy là biến một lỗi bấm
  nhầm thành một lần khoá cửa.

XONG W3 KHI: gian hàng bậc cơ bản không thấy 7 mục menu nâng cao; gian hàng hết hạn VẪN XEM ĐƯỢC
toàn bộ sổ cũ và thấy băng gia hạn; gia hạn xong mở lại NGAY ở request kế tiếp; và một endpoint
mới thiếu marker làm đỏ CI.
````

---

## W4 — Đối soát SePay cho tiền gói

**Cần trước:** W3 · **⚠️ chặn bởi bên ngoài:** tài khoản SePay + tài khoản ngân hàng thật.
**Ship được:** đồng tiền đầu tiên tự về — đợt này tự nó đã ra doanh thu.

````text
[DÁN KHỐI BỐI CẢNH CHUNG Ở ĐÂY]

NHIỆM VỤ — W4: dựng sổ giao dịch ngân hàng và webhook SePay, đối soát cho HOÁ ĐƠN GÓI.
Khoản giữ chỗ của khách (tiền tố XPH) để đợt W6; đợt này chỉ XPG.

Đọc trước: ADR 0016 (toàn bộ), ADR 0022 (toàn bộ).

⚠️ Đây là endpoint CÔNG KHAI, KHÔNG SESSION, CÓ QUYỀN GHI TIỀN đầu tiên trong apps/api.
Đọc kỹ ADR 0016 điều 4 trước khi viết dòng nào.

── LÔ 1 · Bảng bank_transactions ───────────────────────────────────────────
Migration viết tay. MỘT bảng dùng chung cho cả tiền gói lẫn tiền giữ chỗ về sau (ADR 0022 điều 2):
  id · provider (default 'sepay') · provider_tx_id · account_number · gateway
  amount · direction (default 'in') · transferred_at
  content (Text, THÔ — không chuẩn hoá trước khi lưu, đây là bằng chứng khi tranh cãi)
  reference_code (mã rút được, NULL = không rút được)
  match_status · matched_type · matched_ref_id (KHÔNG FK — hai loại đích) · matched_at
  raw_json · created_at
  @@unique([provider, provider_tx_id])   ← KHOÁ CHỐNG GHI ĐÔI, ràng buộc DB
  Index (match_status, transferred_at), (reference_code), (matched_type, matched_ref_id)
  CHECK match_status IN ('unmatched','matched','manual','ignored')
  CHECK matched_type IS NULL OR matched_type IN ('subscription_invoice','booking_hold')

Vì sao MỘT bảng chứ không hai: webhook phải ghi được một giao dịch TRƯỚC khi biết nó khớp vào đâu.
Tách hai bảng thì giao dịch lạ không có chỗ nằm ⇒ bị bỏ ⇒ lần retry sau chèn lại lần nữa.

── LÔ 2 · Module sepay + webhook ───────────────────────────────────────────
apps/api/src/modules/sepay/ — SepayService là writer DUY NHẤT của bank_transactions.

Webhook controller, ADR 0016 điều 4 đầy đủ:
- @Public() — TƯỜNG MINH, kèm comment nói rõ vì sao, không phải vì quên decorator.
- KHÔNG @TenantScoped() — request không có tenant nào. MỌI thao tác ghi suy tenant_id từ ĐÍCH ĐÃ
  KHỚP, KHÔNG BAO GIỜ từ payload. Tin payload = mở đường cho người lạ kích hoạt gói của tenant bất kỳ.
- SepayApiKeyGuard riêng: header `Authorization: Apikey ...`, so sánh bằng crypto.timingSafeEqual.
  Sai khoá → 401, mã SEPAY_SIGNATURE_INVALID, KHÔNG kèm chi tiết nào.
- Nới ThrottlerGuard cho route này (SePay bắn dồn khi retry) — @SkipThrottle hoặc @Throttle riêng.
- Idempotent bằng CONSTRAINT DB: bắt vi phạm unique (provider, provider_tx_id) ⇒ trả 200.
  TUYỆT ĐỐI KHÔNG trả 500 khi trùng — 500 làm SePay retry vĩnh viễn.
- Env mới SEPAY_API_KEY + SEPAY_ACCOUNT_NUMBER vào apps/api/src/config/env.schema.ts (zod),
  đặt đúng tầng trong superRefine. ⚠️ Biến env mới PHẢI khai thêm ở GitHub Environment,
  nếu không job deploy dừng ở bước "Thiếu giá trị bắt buộc" (docs/deployment.md §9.2).

Ghi THÔ trước, khớp sau. BankReconciliationService:
- Rút mã từ content, chuẩn hoá hoa + bỏ dấu, dùng referenceCodeTarget() từ @xeprime/types.
- Tiền tố XPG → subscription_invoices.code. (XPH để W6.)
- Khớp và hiệu ứng phía đích nằm trong CÙNG một transaction.
- Chuyển THIẾU → invoice `partially_paid`, KHÔNG kích hoạt gói, báo admin (ADR 0016 điều 6).
- Chuyển THỪA → ghi có kỳ sau.
- Không rút được mã → match_status='unmatched', vào hàng đợi admin. KHÔNG khớp tự động theo số tiền:
  nhiều hoá đơn cùng số tiền, khớp tự động sẽ gán tiền người lạ vào hoá đơn người khác.

KÍCH HOẠT GÓI DO WEBHOOK, không do redirect trình duyệt (ADR 0016 điều 4).

── LÔ 3 · VietQR + màn admin ───────────────────────────────────────────────
- Sinh VietQR CÓ SẴN nội dung chuyển khoản (ADR 0016 điều 5) — không để người dùng tự gõ.
  Gắn vào màn "Gói của tôi" đã dựng ở W2.
- Route mới /manage/admin/bank-transactions: danh sách giao dịch chưa khớp, khớp tay.
  Khớp tay ghi match_status='manual' để về sau truy được ai chịu trách nhiệm.
- Nhắc hạn trước / đúng hạn / trong ân hạn — nối vào job đã dựng ở W2 (ADR 0016 điều 3:
  SePay KHÔNG tự trừ tiền, chuyển khoản VN là ĐẨY, nên không có nhắc hạn thì đối soát tự động
  chỉ giỏi ghi nhận việc khách rời đi).

Kiểm chứng W4:
  pnpm --filter @xeprime/api typecheck
  pnpm contract && pnpm --filter @xeprime/api test -- openapi-contract
  pnpm --filter @xeprime/api test -- sepay
  curl -X POST localhost:4000/webhooks/sepay -H 'Authorization: Apikey sai'    # 401
  # bắn lại CÙNG provider_tx_id → 200 và bank_transactions vẫn đúng 1 dòng

XONG W4 KHI: chuyển khoản đúng nội dung thì gói tự kích hoạt mà không ai bấm gì; bắn lại webhook
không cộng tiền lần hai; chuyển thiếu thì gói KHÔNG mở và admin thấy cảnh báo.
````

---

## W5 — Tính hoa hồng và hiện nhãn hai tuyến

**Cần trước:** W1 (chạy song song được với W2–W4) · **Ship được:** chỉ đọc và hiển thị, chưa thu đồng nào.

````text
[DÁN KHỐI BỐI CẢNH CHUNG Ở ĐÂY]

NHIỆM VỤ — W5: tính được phần phía chủ xe và hiện nhãn hai tuyến trên chợ. KHÔNG thu tiền ở đợt này.

Đọc trước: ADR 0020 điều 2, ADR 0021 điều 9, ADR 0024, ADR 0026 điều 1–3 và 5,
apps/api/src/modules/pricing/pricing.service.ts.

⚠️ RÀNG BUỘC CỨNG NHẤT CỦA ĐỢT NÀY: tổng tiền KHÁCH PHẢI TRẢ không được đổi một đồng nào.
`buildDailyQuote` (dòng ~537) và `buildLongTermPackageQuote` (~792) KHÔNG được sửa vì lý do hoa hồng —
chúng tính giá KHÁCH, mà giá khách không phụ thuộc chế độ thu phí của chủ xe.

── LÔ 1 · Hàm tính phần phía chủ xe ────────────────────────────────────────
- Thêm hàm THUẦN `platformFeeFor(totalAmount, mode, percent)` vào PricingService, đặt cạnh
  `chargedDays` (~505). Trả về PlatformFeeSnapshot (đã khai ở packages/types/src/pricing.ts từ W0).
- Làm tròn: Prisma.Decimal, ROUND_HALF_UP 0 chữ số — giống hệt phần giảm giá ở dòng ~673.
  KHÔNG làm tròn khoản giữ chỗ lên nghìn: VietQR mang sẵn số tiền và số chính xác là thứ làm cho
  đối soát tự động rẻ. Dùng SÀN HOLD_MIN_AMOUNT, giữ cả computedAmount lẫn holdAmount.
- `buildSnapshot` (~859) nhận tham số thứ ba tuỳ chọn, spread y như `longTerm` ở dòng ~870.
- HOA HỒNG KHÔNG PHẢI MỘT PRICE_ROW. `rows` là hoá đơn của KHÁCH và `totalAmount = Σ rows`.
  Nhét vào đó là cách để sáu tháng nữa ai đó vô tình cộng phí lên đầu khách.

Đường quyết định chế độ thu phí (ADR 0024 điều 1 + ADR 0026 điều 7) — theo ĐÚNG thứ tự này:
  1. Tenant còn lượt miễn phí?           → 0%, không thu giữ chỗ
  2. Gói hiện hành (findCurrent) billing_mode  → commission / package
  3. Không có gói hiện hành              → coi là 'package' (0%), GHI LOG
     (an toàn khi hỏng = đừng lấy tiền mà không giải thích được; sau backfill thì nhánh này
      lẽ ra không xảy ra, nên nó là dấu hiệu backfill sót)
  ⚠️ tenants.tenant_type KHÔNG BAO GIỜ được hỏi tới.

── LÔ 2 · Lộ ra chợ ────────────────────────────────────────────────────────
- `publicQuote` (~913) trả kèm platformFee khi listing là commission.
- Denormalize `billing_mode` + `commission_percent` xuống public_listings (migration viết tay).
  Writer vẫn là ListingsService.syncFromVehicle (ADR 0008 không có ngoại lệ).
  BillingService GỌI ListingsService khi gán/huỷ gói và trong job vòng đời — nó KHÔNG tự ghi
  public_listings. Thêm ListingsService.syncTenant(tenantId).
- Index (status, billing_mode).

── LÔ 3 · Giao diện ────────────────────────────────────────────────────────
- Nhãn hai tuyến trên card: apps/web/src/features/marketplace/components/VehicleCard.tsx.
  ⚠️ Card CỐ Ý KHÔNG CÓ NÚT ĐẶT — cả card là một Link phủ kín (docblock nói rõ, Wave 11.1).
  Nhãn đặt vào styles.amenityRow hoặc làm badge thứ hai trên ảnh. ĐỪNG thêm CTA vào card.
- Nút đặt đổi chữ theo tuyến ở TRANG CHI TIẾT: ListingDetailView.tsx (~284) →
  RequestBookingButton.tsx. "Đặt & giữ chỗ ngay" (commission) vs "Gửi yêu cầu" (package).
- Trang chi tiết hiện trước khi khách cam kết: "Giữ chỗ X · trả chủ xe Y khi nhận xe".
- Nhãn nói về CÁCH ĐẶT, không nói về đẳng cấp (ADR 0027 ràng buộc 2) — xe gian hàng là nhóm trả
  tiền nhiều nhất, không được thiết kế nhãn khiến họ trông kém tin cậy hơn.
- Chữ mới vi + en. Mobile để W8.

Kiểm chứng W5:
  pnpm --filter @xeprime/api test -- rental-pricing     # tổng khách trả PHẢI y hệt trước
  pnpm --filter @xeprime/api typecheck && pnpm --filter @xeprime/web typecheck
  pnpm --filter @xeprime/web i18n:check
  pnpm contract && pnpm --filter @xeprime/api test -- openapi-contract

Viết THÊM một test khoá: gọi buildDailyQuote với cùng input trước/sau đợt này ⇒ totalAmount và
rows giống hệt nhau. Đây là test bảo vệ lời hứa sản phẩm.

XONG W5 KHI: /public/listings/:id/quote trả totalAmount y như trước và có thêm platformFee;
card chợ hiện đúng nhãn; chưa có đồng nào chuyển động.
````

---

## W6 — Đặt & giữ chỗ ngay: thu tiền khách

**Cần trước:** W4 và W5 · **⚠️ ĐIỂM KHÔNG QUAY LẠI** — đồng tiền đầu tiên của khách vào tài khoản nền tảng.

````text
[DÁN KHỐI BỐI CẢNH CHUNG Ở ĐÂY]

NHIỆM VỤ — W6: dựng khoản giữ chỗ và luồng đặt-ngay của tuyến hoa hồng.

Đọc trước: ADR 0021 (TOÀN BỘ), ADR 0022 điều 3, ADR 0026 điều 5, ADR 0013 (để hiểu ranh giới còn lại).

⚠️ Trước khi bắt đầu: rà lại bảo mật webhook đã dựng ở W4 và diễn tập một lần hoàn tiền thủ công.
Sau đợt này tiền của khách thật bắt đầu vào tài khoản nền tảng.

── LÔ 1 · Bảng booking_holds ───────────────────────────────────────────────
Migration viết tay. Cột theo ADR 0021 + ADR 0025 điều 1:
  id · tenant_id · booking_request_id (UNIQUE) · booking_id (UNIQUE, NULL) · customer_user_id
  code (UNIQUE toàn sàn) · purpose ('commission' | 'escrow')
  trip_total_amount · commission_percent · computed_amount · amount · received_amount
  status · expires_at · paid_at
  free_cancel_until   ← CỘT LƯU, chốt MỘT LẦN lúc tạo
  outcome · outcome_at · refund_amount · refund_reference · refunded_by · refunded_at
  forfeited_amount · row_version · created_at · updated_at
  CHECK status IN ('pending','underpaid','paid','expired','cancelled','released')
  CHECK outcome IS NULL OR outcome IN ('kept','refunded','forfeited','released_to_shop')
  CHECK NOT (purpose='escrow' AND outcome='kept')          ← ADR 0025 điều 4
  CHECK NOT (purpose='commission' AND outcome='released_to_shop')
  Index (status, expires_at), (tenant_id, created_at), (customer_user_id)

TẠI SAO KHÔNG DÙNG BẢNG `payments`: PaymentsService là writer duy nhất của booking.paid_amount VÀ
tự sinh phiếu thu ĐÃ DUYỆT cho tenant trong cùng transaction. Khoản giữ chỗ không phải thu nhập của
gian hàng — ghi vào đó là làm sai báo cáo tài chính của chính khách hàng mình.
Cũng KHÔNG mở rộng HELD_FUNDS_RECEIPT_SOURCES: khoản này không hề đi qua sổ sách của tenant.

Module mới apps/api/src/modules/booking-holds/. BookingHoldsService chỉ ghi booking_holds —
KHÔNG ghi booking_requests, bookings, wallets. Điều phối nằm trong transaction của BÊN GỌI.

── LÔ 2 · Nhánh đặt-ngay ───────────────────────────────────────────────────
- booking_requests thêm hai trạng thái: awaiting_hold, hold_expired (đã khai ở @xeprime/types từ W0).
- Thêm AWAITING_HOLD vào BOOKING_REQUEST_STATUS_OCCUPYING — CHIẾM LỊCH ngay khi bấm đặt.
  Đây là khoá mềm 15 phút. Nếu đợi tiền về mới chiếm thì hai khách cùng chuyển tiền cho một khung
  giờ và buộc phải hoàn một người — phá đúng cái đơn giản hoá mà cả mô hình dựa vào.
- submitPublic (booking-requests.service.ts) mọc nhánh: tuyến hoa hồng thì TÍNH GIÁ NGAY TẠI ĐÓ
  (hiện chỉ tính lúc approve) vì số tiền giữ chỗ phải tồn tại trước khi khách chuyển khoản.
- HAI CỔNG CHẶN, enforce ở SERVER, không phải giấu nút (ADR 0021 điều 8):
  · serviceType === 'long_term'  → không đủ điều kiện (chưa có giờ nhận chốt ⇒ không có mốc 4h)
  · breakdown.estimateNote != null → không đủ điều kiện (giá còn tạm tính)
  Cả hai rơi về luồng gửi yêu cầu, mã INSTANT_BOOK_UNAVAILABLE + details.reason.
  KHÔNG lấy 10% của một con số đoán.
- Còn lượt miễn phí ⇒ KHÔNG thu giữ chỗ, đi luồng gửi yêu cầu (ADR 0026 điều 5).
- free_cancel_until = pickupAt − HOLD_FREE_CANCEL_HOURS, tính bằng holdFreeCancelUntil() và LƯU.
  Số học trên mốc tuyệt đối — KHÔNG đụng máy móc múi giờ VN.
- Giới hạn HOLD_MAX_OPEN_PER_CUSTOMER hold đang mở mỗi khách; rate-limit endpoint đặt-ngay TÁCH
  khỏi endpoint gửi yêu cầu (awaiting_hold chiếm chỗ thật mà chưa có tiền — đây là bề mặt phá hoại).

── LÔ 3 · Đối soát XPH + tạo đơn ───────────────────────────────────────────
Mở rộng BankReconciliationService của W4 nhận thêm tiền tố XPH.
Tiền về đủ ⇒ MỘT transaction duy nhất:
   holds.markPaidWithinTx → bookingRequests.convertHoldWithinTx → bookings.createWithinTx
   (status = 'reserved', billing_mode + commission_percent + commission_amount + snapshot.platformFee
    ĐÓNG BĂNG) → holds.attachBookingWithinTx → notification cho khách và chủ xe.
KHÔNG có trạng thái 'hold_paid': trạng thái "đã trả mà chưa có đơn" không bao giờ quan sát được,
và một trạng thái đáng lẽ không ai thấy là một trạng thái sẽ có người thấy.
BOOKING_STATUS KHÔNG thêm giá trị nào (ADR 0013 ràng buộc 2 giữ đúng nghĩa đen).
Chuyển THIẾU → hold 'underpaid', request VẪN awaiting_hold, nới expires_at, giữ NGUYÊN mã để khách
chuyển bù; KHÔNG tạo đơn.
Chuyển THỪA → coi là paid, đánh dấu phần dư để hoàn qua ví ở W7 (khác ADR 0016 điều 6 vì hold
không có "kỳ sau" để ghi có).

── LÔ 4 · Job dọn hold + sửa nợ ảo ─────────────────────────────────────────
- apps/worker/src/jobs/booking-hold-expiry.ts — lock key 4_207, nhịp 60 giây, khuôn giống job
  deadline: claim bằng updateMany theo đúng điều kiện đã chọn ⇒ chạy lại ra 0 dòng.
  Quá hạn ⇒ hold 'expired', request 'hold_expired', NHẢ LỊCH.
  Partial index WHERE status='pending' viết tay trong migration.
- ⚠️ SỬA apps/api/src/common/booking-money.ts TRONG CÙNG ĐỢT NÀY, không để sau:
  đơn tuyến hoa hồng có total_amount là TỔNG chuyến nhưng chủ xe chỉ ghi nhận 90% họ thực thu,
  nên phép trừ để lại ĐÚNG khoản giữ chỗ làm nợ ảo treo VĨNH VIỄN trên /manage/debts và chi tiết đơn.
  Thêm platformHoldCollected vào BookingMoneyInput và tính hold 'paid'/'kept' là đã thu.
  File đó tồn tại để tránh hai con số cho một đồng — bỏ qua là tạo con số thứ ba.

── LÔ 5 · Giao diện đặt xe ─────────────────────────────────────────────────
- RequestBookingFlow.tsx (1380 dòng): thêm bước 'hold' giữa 'otp' và 'done', CHỈ khi
  listing.billingMode === 'commission' và qua được hai cổng chặn.
- features/booking-holds/ mới: HoldPaymentStep (VietQR + số tiền chính xác + mã + đếm ngược),
  useHoldStatus (poll 3 giây khi pending, dừng khi kết thúc), HoldStatusBadge.
- BookingPriceSummary.tsx: tổng khách trả GIỮ NGUYÊN, thêm khối tách
  "Chuyển giữ chỗ ngay: X · Trả chủ xe khi nhận xe: Y" + dòng huỷ miễn phí trước 4h.
- /trips/[id]: trạng thái hold + đếm ngược tới free_cancel_until.
  ĐỌC MỐC TỪ SERVER, KHÔNG tự tính pickupAt − 4h — lệch đồng hồ máy khách sẽ rơi đúng vào lúc
  tiền phụ thuộc vào nó.
- Chữ mới vi + en; 6 mã lỗi HOLD_* đã có bản dịch từ W0, kiểm lại còn đủ.

Kiểm chứng W6:
  pnpm --filter @xeprime/api test -- booking-money    # KHÔNG còn nợ ảo
  pnpm --filter @xeprime/api typecheck && pnpm --filter @xeprime/web typecheck
  pnpm --filter @xeprime/web i18n:check
  pnpm contract && pnpm --filter @xeprime/api test -- openapi-contract
  pnpm dev  → đặt xe tuyến hoa hồng → nhận VietQR → giả lập webhook → đơn 'reserved' xuất hiện
           → đặt lại cùng khung giờ → 409 trùng lịch
           → để quá 15 phút không chuyển → request 'hold_expired', lịch nhả ra

XONG W6 KHI: trả tiền là có xe, không cần chủ xe duyệt; quá hạn thì lịch nhả; và màn công nợ
KHÔNG có nợ ảo nào.
````

---

## W7 — Ví, hoàn tiền, escrow và đường chuyển trả

**Cần trước:** W6 · **Phải xong TRƯỚC khi mở thu cọc qua sàn cho khách thật.**

````text
[DÁN KHỐI BỐI CẢNH CHUNG Ở ĐÂY]

NHIỆM VỤ — W7: khép vòng đời tiền. Ví, quy tắc huỷ 4 giờ, escrow của gian hàng, và đường chuyển trả.

Đọc trước: ADR 0023 (toàn bộ, LƯU Ý điều 1–2 đã bị ADR 0025 viết lại), ADR 0025 (TOÀN BỘ),
ADR 0021 điều 10.

⚠️ VIỆC NGOÀI CODE PHẢI XONG TRƯỚC KHI BẬT ESCROW CHO KHÁCH THẬT: rà soát nghĩa vụ pháp lý của
trung gian thanh toán. Từ đợt này nền tảng GIỮ TIỀN CỦA NGƯỜI KHÁC — đúng thứ ADR 0013 dựng ra để
tránh, và tuyến hoa hồng đã lách được nhưng tuyến gói thì không.

── LÔ 1 · Ba bảng ví ───────────────────────────────────────────────────────
Migration viết tay. MỘT bộ bảng dùng chung cho khách và gian hàng (ADR 0023 điều 7 — hai bộ song
sinh là hai chỗ để quên sửa):
  wallets              id · owner_type ('user'|'tenant') · owner_id · balance
                       · pending_withdraw_amount · updated_at
                       @@unique([owner_type, owner_id])
  wallet_entries       id · wallet_id · kind · amount (dương=vào, âm=ra) · balance_after
                       · source_type · source_ref_id · note · created_by · created_at
                       @@unique([wallet_id, source_type, source_ref_id])   ← BẮT BUỘC CÙNG MIGRATION
  withdrawal_requests  id · wallet_id · amount · status · bank_name · bank_account_number
                       · bank_account_name (SNAPSHOT lúc yêu cầu) · transfer_reference
                       · reject_reason · reviewed_by · reviewed_at · paid_at · row_version

⚠️ Ràng buộc unique trên wallet_entries là thứ DUY NHẤT đứng giữa một lần worker chạy lại và tiền
tự nhân đôi. Ship nó CÙNG migration tạo bảng, không bao giờ "để sau".
Sổ cái CHỈ GHI THÊM: sửa sai bằng dòng ĐẢO, không update, không delete.
`balance` lưu sẵn không phải để nhanh mà để có phép ghi có điều kiện nguyên tử khi rút:
  updateMany({ where: { id, balance: { gte: amount } } })  — SUM() không cho được điều đó.
Cập nhật balance + chèn dòng sổ cái trong CÙNG một transaction.

── LÔ 2 · Kết cục và quy tắc 4 giờ ─────────────────────────────────────────
BookingsService gọi holds.settleWithinTx(tx, bookingId, outcome) trong CÙNG transaction với bước
chuyển trạng thái đơn; hold service KHÔNG bao giờ tự ghi bookings.
  chuyến hoàn thành       → commission: 'kept' (nền tảng giữ, không sinh dòng ví nào)
                          → escrow:     'released_to_shop' → ví gian hàng
  khách huỷ TRƯỚC mốc     → 'refunded'  → ví khách, TỨC THÌ
  khách huỷ SAU mốc / no-show → 'forfeited' → ví gian hàng
  chủ xe/gian hàng huỷ    → 'refunded'  → ví khách + GHI AUDIT và đếm
                             (chưa xây hình phạt, nhưng điểm uy tín sau này cần dữ liệu lịch sử)
So mốc bằng isWithinFreeCancel(hold.freeCancelUntil) — MỐC ĐÃ LƯU, không tính lại từ pickupAt.
'forfeited' và 'released_to_shop' cùng vào ví gian hàng nhưng là HAI bút toán khác nhau
(HOLD_FORFEIT vs HOLD_RELEASE): một bên là bồi thường vì khách sai hẹn, bên kia là trả lại tiền của
chính họ. Gộp lại thì báo cáo của gian hàng nói sai về việc khách của họ có đáng tin không.

── LÔ 3 · Escrow của gian hàng ─────────────────────────────────────────────
- Cờ PLAN_FEATURE.ESCROW_HOLD (đã có từ W0) bật/tắt ở hồ sơ gian hàng; chỉ tenant tuyến gói bật được.
  Tenant tuyến hoa hồng KHÔNG có lựa chọn này — họ đã có commission hold, hai khoản chồng nhau trên
  một chuyến là thu tiền khách hai lần.
- Số tiền do GIAN HÀNG đặt, nhưng TRẦN CỨNG ESCROW_MAX_PERCENT chặn ở SERVER. Không có trần thì
  "cọc giữ chỗ" biến thành thu tiền thuê trước, và nền tảng đang giữ hộ gần như cả chuyến tiền.
- purpose đóng băng lúc tạo hold. TUYỆT ĐỐI không viết
  `mode === 'package' ? 'escrow' : 'commission'` khi đọc một hold ĐÃ TỒN TẠI — chế độ thu phí của
  tenant đổi được, mục đích của một khoản tiền đã nhận thì không.
- Escrow KHÔNG BAO GIỜ vào payments hay booking.paid_amount: nó chưa phải tiền gian hàng đã thu,
  nó là tiền nền tảng đang NỢ họ. Thành thu nhập của họ khi RÚT XONG, không sớm hơn.

── LÔ 4 · Rút tiền + đối chiếu tách quỹ ────────────────────────────────────
- Cam kết (ADR 0025 điều 7, dùng WITHDRAWAL_TERMS từ @xeprime/types): vào ví TỨC THÌ; rút tối
  thiểu MIN_AMOUNT; yêu cầu trước CUTOFF_HOUR_VN ngày làm việc → chuyển trong ngày, sau đó → ngày
  làm việc kế; tối đa MAX_BUSINESS_DAYS ngày làm việc. HIỆN CAM KẾT TRƯỚC KHI người dùng bấm rút.
- Chuyển hụt / sai số tài khoản → hoàn về ví bằng dòng ĐẢO (WITHDRAWAL_REVERSAL), không sửa dòng cũ.
- Màn: /manage/wallet (gian hàng, chỉ hiện khi có dòng), số dư hoàn tiền trong /account,
  /manage/admin/withdrawals (duyệt, đánh dấu đã chuyển, ghi mã tham chiếu).
- ⚠️ /manage/admin/fund-reconciliation — ĐỐI CHIẾU TÁCH QUỸ, mỗi ngày ba con số (ADR 0025 điều 6):
      số dư ngân hàng = tiền CỦA NỀN TẢNG (hoa hồng đã hưởng + tiền gói)
                      + TIỀN GIỮ HỘ (escrow chưa chốt + mọi số dư ví chưa rút)
                      + chênh lệch chưa đối soát
  So tổng là CHƯA ĐỦ. Con số giữa là NỢ PHẢI TRẢ; không tách được nghĩa là không biết mình đang
  tiêu tiền của ai. Mọi báo cáo doanh thu phải trừ phần này.
- Trên giao diện ĐỪNG gọi là "ví tiền": dùng "Số dư gian hàng" và "Số dư hoàn tiền".

Kiểm chứng W7:
  # huỷ trước mốc → ví khách +X ; huỷ sau mốc → ví gian hàng +X
  # chạy lại worker và bắn lại webhook → số dư KHÔNG đổi (unique theo nguồn)
  # escrow chuyến hoàn thành → ví gian hàng, và thử ép outcome='kept' phải bị DB từ chối
  pnpm --filter @xeprime/api typecheck && pnpm --filter @xeprime/web typecheck
  pnpm --filter @xeprime/web i18n:check

XONG W7 KHI: tổng số dư mọi ví khớp với phần "giữ hộ" trong đối chiếu, và không thao tác lặp nào
làm đổi số dư.
````

---

## W8 — Mobile ngang bằng web ở luồng đặt xe

**Cần trước:** W6.

````text
[DÁN KHỐI BỐI CẢNH CHUNG Ở ĐÂY]

NHIỆM VỤ — W8: đưa luồng đặt-ngay lên app native.

Nạp thêm skill `mobile-feature`. Đọc apps/mobile/README.md §10.

- apps/mobile/src/features/marketplace/components/VehicleCard.tsx: nhãn hai tuyến, DÙNG LẠI đúng
  type (@xeprime/types) và namespace message ('Listings.card') như web — một hợp đồng, hai vỏ mỏng.
  Card mobile cũng KHÔNG có CTA thuê, giống web.
- Màn QR giữ chỗ: features/booking-hold/ mới, liên kết mở thẳng app ngân hàng từ chuỗi VietQR.
- ⚠️ HỎI LẠI TRẠNG THÁI KHI MÀN HÌNH ĐƯỢC FOCUS. Khách rời app sang app ngân hàng rồi quay lại —
  đó là hành vi MẶC ĐỊNH của luồng này, không phải trường hợp hiếm. Không có bước này thì màn hình
  đứng im ở "chờ chuyển khoản" trong khi tiền đã về.
- Ví CHƯA lên mobile ở đợt này (mobile là phía khách; ví gian hàng ở web quản trị).
- Message: thêm namespace cần dùng vào apps/mobile/src/i18n/messages.ts ở CẢ vi và en — danh sách
  mobile phải là TẬP CON hợp lệ, i18n:check canh cả hai bảng gom.
- Nợ cũ nên trả luôn: đưa apps/mobile vào CI (hiện không có job nào, typecheck đang đỏ vì thiếu
  expo/tamagui). Nếu quá phạm vi thì nói rõ và để lại.

Kiểm chứng W8:
  pnpm --filter @xeprime/mobile typecheck   # lưu ý: đang có lỗi CÓ SẴN không liên quan
  pnpm --filter @xeprime/web i18n:check
````

---

## Rủi ro xuyên suốt — dán vào prompt của đợt tương ứng

| # | Rủi ro | Đợt | Xử lý |
| --- | --- | --- | --- |
| 1 | Webhook gửi lại → cộng tiền hai lần | W4 | `@@unique([provider, provider_tx_id])` — **constraint DB**, không check ở tầng app |
| 2 | Worker chạy lại → cộng ví hai lần | W7 | `@@unique([wallet_id, source_type, source_ref_id])`, **cùng migration** với bảng |
| 3 | `base_price_monthly = 0` giết mô hình | W1 | Kiểm điểm giao **trong code**, từ chối lưu plan sai |
| 4 | Nợ ảo vĩnh viễn trên `/manage/debts` | W6 | Sửa `booking-money.ts` **cùng đợt**, không để sau |
| 5 | Doanh thu gói hiện thành thu nhập của tenant | W2 | **Không** nối FK `payments.subscription_id` |
| 6 | Migration `plans` phá dữ liệu (FK RESTRICT) | W1 | Expand/contract, drop cột cũ ở **deploy sau** |
| 7 | **Khoá sổ sách cả sàn trong một lần deploy** | W3 | `plans.limits_json` đang NULL ở cả ba gói ⇒ bật cổng chặn trước khi seed cờ là mọi tenant có tập cờ RỖNG. Bắt buộc: `warn` → ngâm → log im → mới `on`, và **không bao giờ** seed cờ cùng deploy với bật cổng |
| 7b | Đánh dấu nhầm "đã dùng" cho cả sàn | W3 | `receipts` sinh TỰ ĐỘNG cho mọi tenant ⇒ vị từ backfill phải là `source='manual'`; `branches`/`members` phải là `> 1` vì `registerShop` tạo sẵn một cái |
| 8 | Chuyển khoản không có session, ngân hàng cắt nội dung | W4 | Lưu `content` thô; khớp dự phòng là **gợi ý cho admin**, không bao giờ tự động |
| 9 | Chiếm lịch mà không có tiền (griefing) | W6 | Giới hạn hold mở/khách + rate-limit riêng |
| 10 | Mốc 4h lệch đồng hồ máy khách | W6 | `free_cancel_until` là **cột lưu**; client đọc mốc từ server |
| 11 | Nền tảng tiêu nhầm tiền giữ hộ | W7 | Đối chiếu **tách quỹ** ba con số, mỗi ngày |
| 12 | Quên `pnpm contract` | mọi đợt | `openapi-contract.spec.ts` khẳng định thứ 17 bắt được |

## Sau mỗi đợt

1. Chạy phần kiểm chứng của đợt (chỉ package vừa sửa — skill `verify-changes`).
2. Gọi agent `reviewer` review diff trước khi commit.
3. Gõ `/commit` — tạo branch, commit, push. **KHÔNG merge**, không commit thẳng vào `develop`.
4. Cập nhật `docs/completion-roadmap.md` và bảng theo dõi.
