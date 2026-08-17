# Nghiệp vụ đa dịch vụ: Xe có tài xế & Thuê dài hạn (manage + user)

## 1. Bối cảnh & vấn đề

Đợt 17/08 đã đưa 3 tab dịch vụ (Xe tự lái / Xe có tài xế / Thuê xe dài hạn) vào ô tìm kiếm
trang chủ, chạy trên cột `vehicles.service_type` (single string) sẵn có. Các vấn đề lộ ra:

1. **Một xe chỉ khai được MỘT dịch vụ.** Giá trị `both` là bản vá chỉ phủ 2/3 tổ hợp.
   Thực tế một xe có thể phục vụ **cả 3** dịch vụ. Yêu cầu chủ dự án: shop chọn **nhiều
   dịch vụ cùng lúc** cho một xe.
2. **"Có tài xế" và "dài hạn" mới có tab tìm kiếm, chưa có nghiệp vụ**: không giá riêng,
   không lộ trình, luồng yêu cầu thuê không phân biệt dịch vụ, manage không quản lý gì thêm.
3. **Gap mức bug phát hiện khi khảo sát**: duyệt yêu cầu thuê KHÔNG map dịch vụ → mọi
   Booking sinh từ yêu cầu đều thành `self_drive`; inbox không hiển thị dịch vụ lẫn ghi chú
   của khách.

Đích: hoàn thiện nghiệp vụ 2 dịch vụ xuyên suốt user ↔ manage, tham khảo Mioto.vn có điều
chỉnh theo đặc thù XePrime.

## 2. Phân tích mô hình Mioto (từ ảnh tham khảo)

### 2.1. Xe có tài xế

| Thành phần | Mioto | Ghi chú nghiệp vụ |
| --- | --- | --- |
| Lộ trình | 3 loại: **Nội thành** (lộ trình tự do) · **Liên tỉnh** (khứ hồi) · **Liên tỉnh 1 chiều** | Lộ trình quyết định cách tính giá của Mioto |
| Thời gian | Cho phép khoảng ngắn trong ngày (08:00→10:00) | Nội thành bản chất là thuê giờ có tài xế |
| Địa điểm | Tỉnh/TP đón khách | Địa chỉ đón cụ thể nhập ở bước đặt |

### 2.2. Thuê dài hạn (car subscription)

| Thành phần | Mioto | Ghi chú nghiệp vụ |
| --- | --- | --- |
| Đơn vị giá | **X/tháng** | Neo giá theo tháng — dễ hiểu, dễ so sánh |
| Gói thuê | 1/3/6/9/12 tháng, **-2% từ 3 tháng** | Giảm giá theo cam kết thời hạn |
| Nhóm xe | List gộp theo MẪU xe + nhóm năm SX ("Kia Morning — 3 xe có sẵn") | Mô hình fleet lớn |
| Nhận xe | "7 ngày tới" / "Thời gian khác" | Ngày nhận linh hoạt, chốt khi tư vấn |
| Trọn gói | Gồm VAT, bảo hiểm, giao nhận, bảo dưỡng; thanh toán chu kỳ tháng | Dài hạn = dịch vụ trọn gói |
| Chốt đơn | "CHỌN THUÊ" → tư vấn hotline/fanpage | Không thanh toán online |

### 2.3. Điều chỉnh cho XePrime + quyết định đã chốt với chủ dự án (17/08)

| Điểm | Mioto | XePrime chốt | Lý do |
| --- | --- | --- | --- |
| Thời hạn dài hạn | Gói cứng 1/3/6/9/12 tháng | **Khách chọn ngày cụ thể, tối thiểu 7 ngày** | Yêu cầu chủ dự án; linh hoạt cho shop nhỏ |
| Giá dài hạn | Giá tháng niêm yết | ✅ CHỐT: **`monthly_price` tham chiếu** — ước tính = ngày × giá tháng ÷ 30; chưa khai → máy giá ngày hiện có | Chủ dự án chọn phương án giá tháng |
| Giá có tài xế | Bảng giá theo lộ trình | ✅ CHỐT: **`with_driver_daily_price`** (đã gồm tài xế); chưa khai → giá ngày + nhãn "chưa gồm tài xế" | Chủ dự án chọn thêm trường giá riêng |
| Quản lý tài xế | (nội bộ shop) | ✅ CHỐT: **xây tối thiểu ngay đợt này** — bảng `drivers` + CRUD `/manage/drivers` + gán tài xế vào đơn | Chủ dự án chọn mở rộng scope |
| Chốt giá | Niêm yết + tư vấn | Giá THAM CHIẾU; **giá chốt do shop quyết khi duyệt** | Đúng mô hình request→approval sẵn có |
| Gộp theo mẫu xe | Có | Không (MVP) — listing theo từng xe | Marketplace nhiều shop nhỏ; để sau |
| Lộ trình | Quyết định bảng giá | Ngữ cảnh: chọn ở tìm kiếm → URL → prefill yêu cầu thuê để shop báo giá; KHÔNG lọc danh sách xe | Chưa có dữ liệu xe khai lộ trình phục vụ |

## 3. Nghiệp vụ chốt

### 3.1. Một xe – nhiều dịch vụ

`vehicles.service_type` (đơn, có `both`) → `vehicles.service_types` **String[]**, tập con
của `{self_drive, with_driver, long_term}`, tối thiểu 1, default `['self_drive']`. Backfill
`both → ['self_drive','with_driver']`. Mirror `public_listings.service_types` + GIN index
(cùng pattern cột `features`). Filter marketplace: `has(serviceType)` — thay hàm
`serviceTypeFilter` hiện tại. **Khai tử giá trị `both`** khỏi `SERVICE_TYPE`.

**Booking / BookingRequest mang MỘT `service_type`** (một chuyến thuộc đúng một dịch vụ).
`booking_requests` được THÊM cột này (hiện chưa có — nguồn gốc bug mục 1.3).

### 3.2. Thuê dài hạn

- Thuê liên tục **≥ 7 ngày** (`LONG_TERM_MIN_DAYS = 7` — hằng chung ở `@xeprime/types`),
  khách chọn ngày nhận – trả cụ thể. Validate ở: form (yup) + control chọn ngày (minDays)
  + backend (quote & tạo yêu cầu — nguồn chặn thật).
- Giá: `monthly_price` (Decimal, /30 ngày). Quote dài hạn khi có giá tháng: đơn giá
  ngày phẳng = monthly/30 (không tách weekday/weekend, KHÔNG áp bậc giảm giá — tránh giảm
  kép); chưa khai → máy giá ngày + discountTiers như hiện tại. Luôn nhãn "giá tham chiếu —
  gian hàng xác nhận khi duyệt".
- Tìm kiếm: tab Dài hạn CÓ chọn khoảng ngày (minDays 7, chỉ mode daily) + lọc lịch trống
  bình thường (đổi so với đợt 17/08). Card hiện "X ₫/tháng" khi ở ngữ cảnh dài hạn.
- Chống trùng lịch: nguyên trạng ADR 0006.

### 3.3. Xe có tài xế

- Lộ trình: union mới `ROUTE_TYPE = { IN_CITY: 'in_city', INTER_CITY: 'inter_city',
  INTER_CITY_ONE_WAY: 'inter_city_one_way' }` + nhãn, ở `@xeprime/types`.
- Tab hero có radio Lộ trình (3 loại + mô tả ngắn) → URL `routeType` → prefill yêu cầu
  thuê. Không lọc danh sách xe theo lộ trình (ngữ cảnh, không phải filter).
- Giá: `with_driver_daily_price` (đơn giá ngày phẳng, đã gồm tài xế; áp discountTiers bình
  thường). Chưa khai → giá ngày + nhãn "chưa gồm phí tài xế". Phụ phí 1 chiều/lưu đêm:
  shop báo khi duyệt (ghi chú hiển thị ở flow).
- Yêu cầu thuê with_driver: thêm Lộ trình (bắt buộc) + Địa chỉ đón (bắt buộc) + Điểm đến
  (bắt buộc khi liên tỉnh). Trường `pickup_address`/`destination` riêng, không nhồi note.

### 3.4. Tài xế (tối thiểu)

- Bảng `drivers` theo spec `docs/xeprime_database_design.md` (§drivers): `tenant_id`,
  `name`, `phone`, `driver_type` (staff|collaborator|temporary — union mới `DRIVER_TYPE`),
  `license_no`, `id_no`, `note`, `status` (active|inactive — `DRIVER_STATUS`), soft-delete
  `deleted_at`. Unique phụ `(id, tenant_id)` để làm composite-FK (pattern TenantBranch).
- `bookings.driver_id` nullable, composite FK `(driver_id, tenant_id) →
  drivers(id, tenant_id)` — DB tự chặn gán tài xế của shop khác.
- API module `drivers`: CRUD tenant-scoped, phân trang + tìm kiếm server-side; cặp quyền
  cùng pattern module `branches` (xác nhận chính xác khi code). Gán tài xế:
  `PATCH /bookings/:id/driver` (gán/bỏ gán, validate driver active cùng tenant).
- UI: `/manage/drivers` thay PlaceholderPage bằng list + form dialog (bỏ `comingSoon` ở
  nav); booking detail thêm khối "Tài xế" (Select gán/bỏ gán, nổi bật khi đơn with_driver);
  cột/label tài xế ở bảng bookings.
- KHÔNG làm đợt này: `driver_documents`, lịch bận/điều phối tài xế, chấm công.

## 4. Phạm vi KHÔNG làm (chống trôi scope)

- Gộp listing theo mẫu xe + nhóm năm sản xuất (fleet Mioto).
- Bảng giá gói tháng + % ưu đãi theo cam kết; bảng giá theo lộ trình; lọc xe theo lộ trình.
- Thanh toán online / chu kỳ thanh toán tháng.
- `driver_documents`, điều phối/lịch tài xế.
- Sort theo giá tháng ở marketplace (sort giá hiện tại vẫn theo weekdayPrice).

## 5. Kết quả khảo sát code (điểm neo — 3 nhánh đã khảo sát 17/08)

- **Luồng yêu cầu thuê** `RequestBookingFlow.tsx` (3 bước Thời gian → Liên hệ+OTP → Xác
  nhận): payload không có serviceType; không có ô ghi chú. `approve()`
  (`booking-requests.service.ts:353-440`) tính giá qua
  `PricingService.effectivePolicy → buildQuote → buildSnapshot` rồi
  `BookingsService.createWithinTx` — KHÔNG map serviceType (rơi default self_drive), không
  map note/delivery sang booking. `StaffBookingFlow.tsx:259` hardcode SELF_DRIVE.
- **Máy giá** (`pricing.service.ts`): tính theo ngày (weekday/weekend, `vehicle_daily_prices`
  ghi đè, `discountTiers` theo `minDays` trong `RentalPolicy` kế thừa shop→xe). Quote
  public `GET /public/listings/:id/quote` chỉ nhận pickupAt/returnAt. `chargedDays = max(1,
  ceil(Δ/24h))`. Không tồn tại: monthlyPrice, min ngày thuê, lộ trình, tài xế.
- **Control ngày** `RentalRangePanel`/`RentalDateTimeRangeField`: chưa có prop `minDays`
  (ràng buộc duy nhất ≥1 ngày); yup `bookingPeriodSchema`
  (`packages/validators/src/index.ts:401`) chỉ kiểm end > start.
- **Form xe manage**: `VehicleFormSections.tsx:236-244` SelectField `serviceType` đơn (bước
  Cơ bản); giá ở bước 2 (`PricesSection` :647-701). Yup `validators/index.ts:80`. Mappers
  `features/vehicles/mappers.ts:38,86,133`. Sửa giá qua `PUT /vehicles/:id/pricing`
  (`pricing.dto.ts:224-244` — chỉ weekday/weekend + policy).
- **Đường ghi vehicles duy nhất** `vehicles.service.ts`: `writableFields()` (~895-933);
  filter `serviceType` equality (~315); `hasSensitiveChange()` (~1060) so sánh
  `String(curVal)` — mảng phá logic này, cần so sánh array (sorted). 4 điểm gọi
  `listings.syncFromVehicle` trong transaction (:499,620,762,844).
- **Writer public_listings duy nhất** `listings.service.ts` (snapshot :66-99). BẢN SAO ở
  `prisma/src/seed.ts syncSeedListing()` (~1400-1450) phải sửa song song; seed demoFields
  serviceType ~1764 (toàn self_drive).
- **`SERVICE_TYPE.BOTH`** chỉ còn 3 chỗ code thật: types định nghĩa, `serviceTypeFilter`
  (`public-listings.service.ts:130-135`), fixture `test/public-listings-filter.spec.ts:124`.
- **Hợp đồng**: `contracts.service.ts:123` đóng băng serviceType CỦA XE vào snapshot →
  đổi sang đóng băng `booking.serviceType`; snapshot cũ đã ký giữ tương thích đọc.
- **Inbox manage** `BookingRequestTable.tsx`: 4 cột, không hiện dịch vụ, không render note.
- **Drivers**: 0% code — placeholder page + nav `comingSoon`; spec bảng ở
  `docs/xeprime_database_design.md`; `bookings` chưa có driver_id.
- **Hiển thị label dịch vụ đơn** (phải đổi khi sang mảng): `VehicleCard.tsx:46`,
  `ListingDetailView.tsx:35`, `VehicleSummaryPanel.tsx:123`, features/vehicles (card/row/
  360/filters), admin drawers, `approvals/constants.ts:62-64`, `ContractDocument.tsx:77`.
- **Contract types**: `packages/types/src/api.generated.ts` sinh từ OpenAPI — mọi đổi DTO
  phải `pnpm contract` (ADR 0007).

## 6. Trình tự thi công (4 nhịp — mỗi nhịp kết thúc repo xanh)

Nguyên tắc xuyên suốt (đã kiểm chứng với code thật):
- **Query param filter GIỮ NGUYÊN `serviceType` đơn** ở `/vehicles` lẫn `/public/listings`
  (ngữ nghĩa "xe phục vụ được dịch vụ X") → toàn bộ plumbing filter FE, URL contract, tab
  hero, chip `/search` KHÔNG đổi. Chỉ response DTO đổi sang mảng.
- Snapshot jsonb đã đóng băng (approval_tasks, contracts) KHÔNG migrate — tương thích đọc:
  hợp đồng giữ key cũ, chỉ đổi nguồn giá trị sang `booking.serviceType`; approvals FE đọc
  cả shape string cũ lẫn mảng mới; label helper có fallback legacy `'both'`.
- `pnpm contract` chạy đúng MỘT thời điểm (đầu nhịp 3) — chạy giữa chừng khi API nửa vời
  sẽ emit contract lai.

### Nhịp 0 — types cộng thêm (commit 1, xanh độc lập)

- `packages/types`: `ROUTE_TYPE` (+VALUES/LABEL — `in_city | inter_city |
  inter_city_one_way`), `DRIVER_TYPE` (staff|collaborator|temporary), `DRIVER_STATUS`
  (active|inactive) + label/màu, `LONG_TERM_MIN_DAYS = 7`; helper
  `serviceTypeLabel(v)` (fallback legacy `'both'`) + `serviceTypesLabel(v[])` — điểm dùng
  chung cho ~10 chỗ hiển thị badge (skill shared-code).

### Nhịp 1 — DB + types breaking + toàn bộ API + seed (commit 2, ATOMIC)

**Migration MỘT file SQL tay `20260817xxxxxx_multi_service_and_drivers`** (SQL nháp đã
review ở mục 6.1): vehicles/public_listings sang mảng + 2 cột giá; bookings CHECK + driver_id;
booking_requests 4 cột mới; bảng drivers. `prisma/schema.prisma` khớp từng field
(`serviceTypes String[] @default(["self_drive"])`, GIN index như cột `features`);
`prisma migrate diff` xác nhận không drift.

**Types breaking + validators** (cùng nhịp): xoá `BOTH` khỏi `SERVICE_TYPE`;
`VEHICLE_PUBLIC_SENSITIVE_FIELDS`: `serviceType` → `serviceTypes`; yup `vehicleFormSchema`
→ `serviceTypes array.min(1)` + `monthlyPrice`/`withDriverDailyPrice` (moneySchema optional).
⚠️ `apps/web/src/features/vehicles/sensitive-changes.ts` typed từ types — phải sửa CÙNG
nhịp này (normalize mảng sort+join đối xứng với BE), không đợi nhịp FE.

**API** (skill backend-endpoint):
- `vehicles`: DTO `serviceTypes` (`@IsArray @ArrayNotEmpty @ArrayUnique @IsIn each`) + 2
  field giá (MONEY_PATTERN); `writableFields()` **canonicalize sort+dedupe trước khi ghi**;
  filter list → `{ serviceTypes: { has } }`; `hasSensitiveChange()` normalizer
  `Array.isArray(v) ? [...v].sort().join(',') : String(v)` cho cả hai vế.
- `public-listings`: `listings.service.ts` snapshot copy `serviceTypes` + 2 giá;
  `serviceTypeFilter()` rút còn `{ serviceTypes: { has } }` (khai tử special-case BOTH);
  card/detail DTO trả `serviceTypes[]` + 2 giá (string|null theo quy ước tiền).
- `pricing`: quote nhận `serviceType?`; nhánh `long_term` (validate ≥ `LONG_TERM_MIN_DAYS`
  — error code mới; đơn giá phẳng monthly/30, KHÔNG áp discountTiers) và `with_driver`
  (đơn giá `withDriverDailyPrice`, giữ tiers); fallback máy giá ngày khi chưa khai giá;
  breakdown label rõ; `buildSnapshot` ghi serviceType.
- `booking-requests`: Create DTO + 4 field (validate: `serviceType ∈ vehicle.serviceTypes`
  — chỗ duy nhất DB không tự cross-check được; route bắt buộc khi with_driver + CHECK DB
  route⇒with_driver; destination bắt buộc khi liên tỉnh; ≥7 ngày khi long_term);
  `approve()` truyền `serviceType` vào quote + `createWithinTx` (fix bug rơi về self_drive).
- `bookings`: `PATCH /bookings/:id/driver` gán/bỏ gán (validate driver active cùng tenant);
  response thêm driver tóm tắt.
- `drivers` (module mới): CRUD tenant-scoped, phân trang/tìm kiếm/lọc status server-side,
  soft-delete; cặp quyền theo pattern module `branches`.
- `contracts`: dòng freeze đổi nguồn sang `booking.serviceType`, GIỮ key snapshot cũ.

**Seed**: `syncSeedListing()` copy field mới; `demoFields` đa dạng hoá (vài xe
`['self_drive','with_driver']`, vài xe có `long_term` + giá tháng/giá tài xế demo) để 3
tab marketplace có dữ liệu thật. **API test fixtures** sửa cùng nhịp (jest dùng Prisma
client mới, để qua nhịp là đỏ).

### Nhịp 2 — regen contract + FE user (commit 3, ATOMIC)

- Đầu nhịp: `pnpm contract` → api.generated đổi → web đỏ → sửa hết trong cùng commit.
- Điểm hiển thị label đơn → `serviceTypesLabel`/badge list: `VehicleCard` (badge chính
  + "+n"), `ListingDetailView` specs, `VehicleSummaryPanel`, features/vehicles
  (card/row/360), admin drawers, `approvals/constants.ts` (đọc cả shape cũ lẫn mới),
  `ContractDocument` (key không đổi — chỉ label fallback).
- `RentalDateTimeRangeField` + `RentalRangePanel`: prop `minDays` (default 1) — chặn Áp
  dụng, auto-adjust, thông điệp.
- `HeroSearch`/`SearchDialog`: tab Có tài xế thêm radio Lộ trình (`routeType` vào URL —
  key mới ở `filter-params`, KHÔNG gửi API listings); tab Dài hạn khôi phục chọn ngày
  (minDays 7, chỉ daily); state chung giữa tab.
- Giá theo ngữ cảnh trên card/detail: `long_term` → "X ₫/tháng" khi có; `with_driver` →
  giá tài xế khi có; fallback giá ngày + nhãn "chưa gồm phí tài xế"/"giá tham chiếu".
- `RequestBookingFlow`: bước Thời gian thêm chọn Dịch vụ (Segmented — chỉ services của
  xe, default từ URL); with_driver → Lộ trình + Địa chỉ đón + Điểm đến (+ prefill
  routeType); long_term → minDays 7 + ước tính theo tháng; quote kèm serviceType; review
  đủ field; yup `features/booking-requests/schema.ts` mở rộng theo dịch vụ; bỏ hardcode
  SELF_DRIVE ở `StaffBookingFlow`.

### Nhịp 3 — FE manage + test + docs (commit 4)

- Form xe: `serviceTypes` multi-select; bước Giá thêm `monthlyPrice` (hiện khi tick dài
  hạn) + `withDriverDailyPrice` (khi tick có tài xế); mappers (gỡ bridge nếu có), default,
  review, completeness.
- Inbox yêu cầu thuê: cột Dịch vụ (tag) + lộ trình/điểm đến/địa chỉ đón + render `note`
  (sửa gap sẵn có).
- Booking detail: khối Tài xế (Select gán/bỏ gán); bảng bookings cột tài xế.
- `/manage/drivers`: thay PlaceholderPage bằng list phân trang server + search + lọc
  status + form dialog; bỏ `comingSoon` ở nav.
- Web test: fixtures mảng; test mới RentalRangePanel minDays, RequestBookingFlow nhánh
  dịch vụ, filter-params routeType. Cập nhật `docs/completion-roadmap.md`.

### 6.1. SQL migration nháp (đã review, các CHECK là THÊM MỚI — init chưa có CHECK nào)

```sql
-- 1. vehicles: service_type (đơn) -> service_types (mảng năng lực)
ALTER TABLE "vehicles"
    ADD COLUMN "service_types" VARCHAR(50)[] NOT NULL DEFAULT ARRAY['self_drive']::VARCHAR(50)[],
    ADD COLUMN "monthly_price" DECIMAL(14,2),
    ADD COLUMN "with_driver_daily_price" DECIMAL(14,2);
UPDATE "vehicles" SET "service_types" = CASE
    WHEN "service_type" = 'both' THEN ARRAY['self_drive','with_driver']::VARCHAR(50)[]
    ELSE ARRAY["service_type"]::VARCHAR(50)[] END;
ALTER TABLE "vehicles"
    ADD CONSTRAINT "vehicles_service_types_subset_check"
        CHECK ("service_types" <@ ARRAY['self_drive','with_driver','long_term']::VARCHAR(50)[]),
    ADD CONSTRAINT "vehicles_service_types_not_empty_check"
        CHECK (cardinality("service_types") >= 1),
    ADD CONSTRAINT "vehicles_monthly_price_non_negative"
        CHECK ("monthly_price" IS NULL OR "monthly_price" >= 0),
    ADD CONSTRAINT "vehicles_with_driver_daily_price_non_negative"
        CHECK ("with_driver_daily_price" IS NULL OR "with_driver_daily_price" >= 0);
DROP INDEX "vehicles_vehicle_type_service_type_idx";
ALTER TABLE "vehicles" DROP COLUMN "service_type";
CREATE INDEX "vehicles_vehicle_type_idx" ON "vehicles"("vehicle_type");
CREATE INDEX "vehicles_service_types_idx" ON "vehicles" USING GIN ("service_types");

-- 2. public_listings: mirror snapshot (ADR 0008) — tương tự khối 1
--    (service_types + 2 cột giá + 2 CHECK; DROP index (status,vehicle_type,service_type)
--     → (status,vehicle_type) btree + GIN(service_types); DROP service_type)

-- 3. bookings: giữ cột ĐƠN; normalize dữ liệu dev cũ rồi mới siết CHECK
UPDATE "bookings" SET "service_type" = 'self_drive' WHERE "service_type" = 'both';
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_type_check"
    CHECK ("service_type" IN ('self_drive','with_driver','long_term'));

-- 4. booking_requests: dịch vụ của yêu cầu + ngữ cảnh có tài xế
ALTER TABLE "booking_requests"
    ADD COLUMN "service_type" VARCHAR(50) NOT NULL DEFAULT 'self_drive',
    ADD COLUMN "route_type" VARCHAR(30),
    ADD COLUMN "pickup_address" TEXT,
    ADD COLUMN "destination" TEXT;
ALTER TABLE "booking_requests"
    ADD CONSTRAINT "booking_requests_service_type_check"
        CHECK ("service_type" IN ('self_drive','with_driver','long_term')),
    ADD CONSTRAINT "booking_requests_route_type_check"
        CHECK ("route_type" IS NULL OR "route_type" IN ('in_city','inter_city','inter_city_one_way')),
    ADD CONSTRAINT "booking_requests_route_type_service_check"
        CHECK ("route_type" IS NULL OR "service_type" = 'with_driver');

-- 5. drivers + gán tài xế (composite FK pattern TenantBranch — DB chặn gán chéo tenant)
CREATE TABLE "drivers" (
    "id" CHAR(26) NOT NULL, "tenant_id" CHAR(26) NOT NULL,
    "name" VARCHAR(255) NOT NULL, "phone" VARCHAR(30) NOT NULL,
    "driver_type" VARCHAR(30) NOT NULL DEFAULT 'staff',
    "license_no" VARCHAR(50), "id_no" VARCHAR(50), "note" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL, "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "drivers_driver_type_check" CHECK ("driver_type" IN ('staff','collaborator','temporary')),
    CONSTRAINT "drivers_status_check" CHECK ("status" IN ('active','inactive')),
    CONSTRAINT "drivers_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "drivers_id_tenant_id_key" ON "drivers"("id","tenant_id");
CREATE INDEX "drivers_tenant_status_idx" ON "drivers"("tenant_id","status");
ALTER TABLE "bookings" ADD COLUMN "driver_id" CHAR(26);
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_fkey"
    FOREIGN KEY ("driver_id","tenant_id") REFERENCES "drivers"("id","tenant_id")
    ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX "bookings_driver_id_idx" ON "bookings"("driver_id");
```

### 6.2. Bẫy đã nhận diện (từ khảo sát — phải tôn trọng khi code)

1. `hasSensitiveChange` với mảng: thiếu canonicalize → false positive kéo xe public về
   `pending_public_review` oan. Sort+dedupe khi ghi; normalizer đối xứng BE ↔
   `sensitive-changes.ts` FE.
2. CHECK subset không chặn trùng phần tử (`['x','x']` qua được) → chặn ở DTO
   `@ArrayUnique` + dedupe service.
3. Seed và migration phải cùng nhịp; chạy seed 2 lần xác nhận idempotent.
4. `prisma migrate diff` sau khi viết SQL tay — `@default(["self_drive"])` phải khớp
   `DEFAULT ARRAY[...]`; đừng tin `migrate` exit 0.
5. Chỗ render giá trị THÔ từ snapshot cũ sẽ in `both` trần nếu quên fallback ở helper label.
6. Giữa commit 2 và 3 web runtime lệch API (typecheck xanh nhờ api.generated cũ) — không
   deploy demo giữa hai commit.
7. GIN phục vụ `has`, không giúp sort — giữ btree `(status, vehicle_type)` để BitmapAnd.

## 7. Verify

1. `pnpm db:migrate` + `pnpm db:seed` (chạy 2 lần — idempotent) trên DB dev.
2. Scoped: `pnpm --filter @xeprime/api typecheck` + Jest specs theo path (filter, pricing,
   booking-requests, drivers); `pnpm contract`; `pnpm --filter @xeprime/web typecheck` +
   Vitest theo file.
3. Dev server: curl `/public/listings?serviceType=…` (xe đa dịch vụ xuất hiện ở nhiều tab),
   quote long_term/with_driver; screenshot Chrome headless: hero 3 tab (radio lộ trình,
   date range dài hạn), card giá tháng, RequestBookingFlow từng dịch vụ, inbox manage,
   `/manage/drivers`, booking detail gán tài xế.
4. Luồng xuyên suốt: tạo yêu cầu long_term 10 ngày → duyệt → Booking `long_term` đúng giá
   tháng; yêu cầu with_driver liên tỉnh → duyệt → gán tài xế → hợp đồng in đúng dịch vụ.
