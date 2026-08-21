# Chuẩn hoá chính sách bảo đảm (thế chấp) + tách giá khỏi chính sách

## Context

Trang `/manage/shop/policies` hiện chỉ có **một ô tiền cọc**. Thực tế cho thuê xe ở Việt Nam có
ba hình thức bảo đảm loại trừ nhau — cọc tiền / cọc tài sản / miễn cọc — và một việc riêng biệt
luôn phải làm: **đối chiếu giấy tờ tuỳ thân** của khách. Hệ thống không mô tả được điều đó.

Đây đúng là gap **C-04 (P0)** đã ghi trong [03_PRODUCT_GAP_ANALYSIS.md:41](../design/03_PRODUCT_GAP_ANALYSIS.md)
("chuẩn hoá thành trường có cấu trúc"), nguyên tắc ở [06_DESIGN_PRINCIPLES.md:61](../design/06_DESIGN_PRINCIPLES.md)
("chính sách thế chấp là trường có cấu trúc, không phải đoạn văn tự do"), và khái niệm "loại tài sản
thế chấp" đã được thiết kế sẵn ở [11_FIGMA_MASTER_PROMPT.md:323](../design/11_FIGMA_MASTER_PROMPT.md).

Ba khiếm khuyết đi kèm, phát hiện khi khảo sát, được đóng luôn trong đợt này:

1. **`noCollateral` là cờ marketing rời.** Switch "Miễn thế chấp" ở form xe
   ([VehicleFormSections.tsx:852-857](../../apps/web/src/features/vehicles/components/VehicleFormSections.tsx#L852-L857))
   không liên quan gì tới `depositAmount`. Một xe có thể vừa gắn nhãn "Miễn thế chấp" trên sàn
   vừa đòi cọc 5 triệu.
2. **Muốn đặt giá riêng cho xe thì buộc phải ghi đè TOÀN BỘ chính sách**
   ([vehicles.service.ts:640-658](../../apps/api/src/modules/vehicles/vehicles.service.ts#L640-L658)) —
   giá chỉ sửa được ở chế độ override.
3. **Không có chỗ bổ sung giấy tờ khách ngay trên màn đơn thuê**, dù panel giấy tờ đã tồn tại.

### Kế thừa hiện tại hoạt động thế nào (trả lời câu hỏi đã đặt)

**Không phải merge theo từng mục.** `rental_policies` dùng chung một bảng: `vehicle_id = NULL` là
hàng mặc định gian hàng, `vehicle_id` có giá trị là hàng ghi đè.
[`effectivePolicy()`](../../apps/api/src/modules/pricing/pricing.service.ts#L198-L223) chọn **thắng
cả dòng** theo thứ tự *ghi đè của xe → mặc định theo loại xe → legacy*. Khi bật "Tùy chỉnh riêng",
form prefill từ `shopPolicy` ([VehiclePricingWorkspace.tsx:90](../../apps/web/src/features/rental-policies/components/VehiclePricingWorkspace.tsx#L90))
rồi lưu **nguyên bản sao**. Hệ quả: sau đó gian hàng sửa cọc chung, xe đang ghi đè **không** nhận
thay đổi, kể cả mục chưa từng đụng tới.

**Đợt này GIỮ nguyên mô hình ghi đè nguyên khối cho phần chính sách** (đổi sang merge theo từng
trường là thay schema + resolver + hai màn UI, không thuộc phạm vi). Chỉ **tách phần GIÁ ra** để
không còn bị ép ghi đè chính sách chỉ vì muốn giá riêng.

## Quyết định đã chốt

| Điểm | Chốt |
| --- | --- |
| Hình thức bảo đảm | 3 chế độ **loại trừ nhau**: `cash` (cọc tiền) · `asset` (cọc tài sản) · `none` (miễn cọc) |
| Loại tài sản (khi `asset`) | Enum **cố định**, không cho tự nhập: cà vẹt/đăng ký xe máy · xe máy · hộ chiếu. **Không** có "hộ khẩu", **không** có "Khác" |
| Đối chiếu giấy tờ | Luôn bắt buộc, **thủ công có ghi nhận** — nhân viên tự đối chiếu VNeID rồi tích "Đã đối chiếu"; lưu ai/lúc nào/phương thức + audit. Không gọi API VNeID |
| Giấy tờ cần đối chiếu | **Cố định theo dịch vụ**: tự lái + dài hạn ⇒ CCCD + GPLX; có tài xế ⇒ chỉ CCCD |
| `noCollateral` | **Hợp nhất** — bỏ switch nhập tay, suy ra từ chính sách hiệu lực (`mode === 'none'`) |
| Giá theo xe | **Tách** khỏi ghi đè chính sách — đặt giá riêng mà chính sách vẫn kế thừa |

### Giả định cần nêu rõ

- **Đối chiếu là cảnh báo, chưa phải chốt chặn cứng.** Đợt này hiển thị trạng thái đối chiếu và
  cảnh báo khi thiếu, **không** chặn tạo/duyệt đơn. Biến nó thành chốt chặn sẽ khoá mọi đơn của dữ
  liệu cũ chưa từng có giấy tờ — phải là một quyết định riêng, có migration dữ liệu.
- **Bản ghi đối chiếu gắn vào hàng giấy tờ** (`tenant_customer_documents`), không phải cột phẳng
  trên khách. Lý do: tái dùng bảng/quyền/UI sẵn có và cho phép CCCD đã đối chiếu còn GPLX thì chưa.
  Hệ quả: muốn ghi nhận đối chiếu thì phải có hàng giấy tờ tương ứng.
- Cọc tiền vẫn là **nguồn tiền duy nhất** chảy vào sổ thu-chi. Chế độ `asset`/`none` ⇒
  `depositAmount = 0` ⇒ không sinh phiếu thu cọc. Máy quyết toán không đổi.

---

## Phần A — Model hình thức bảo đảm

### A1. `packages/types/src/pricing.ts`

Thêm cạnh `POLICY_SOURCE` (cùng file, cùng khuôn `*_META` — ADR 0005):

```ts
export const COLLATERAL_MODE = { CASH: 'cash', ASSET: 'asset', NONE: 'none' } as const;
export const COLLATERAL_ASSET_TYPE = {
  VEHICLE_REGISTRATION: 'vehicle_registration',  // Cà vẹt / đăng ký xe máy
  MOTORBIKE: 'motorbike',                        // Chính chiếc xe máy
  PASSPORT: 'passport',
} as const;
```

Kèm `*_VALUES`, `COLLATERAL_MODE_META` (StatusMeta như `POLICY_SOURCE_META`),
`COLLATERAL_ASSET_TYPE_LABEL`. **Mã đi trên dây giữ nguyên snake_case tiếng Anh**, chỉ NHÃN mới
dịch (ADR 0012).

### A2. Schema + migration

`prisma/schema.prisma`, trong `model RentalPolicy` (~dòng 1262, cạnh `depositAmount`):

```prisma
/// @xeprime/types → CollateralMode. Ba chế độ LOẠI TRỪ nhau.
collateralMode       String   @default("cash") @map("collateral_mode") @db.VarChar(20)
/// @xeprime/types → CollateralAssetType. Chỉ có nghĩa khi mode='asset' — CHECK ở migration.
collateralAssetTypes String[] @default([]) @map("collateral_asset_types") @db.VarChar(50)
```

`String[] @db.VarChar(50)` là khuôn đã dùng cho `Vehicle.serviceTypes` (schema.prisma:624) và
`PublicListing.features` (:880) — không phát minh kiểu mới.

Migration SQL tay `prisma/migrations/<ts>_rental_policy_collateral/`:

- Thêm hai cột.
- **Backfill**: `collateral_mode = CASE WHEN deposit_amount > 0 THEN 'cash' ELSE 'none' END`.
- CHECK `rental_policies_collateral_mode_check`: mode ∈ 3 giá trị.
- CHECK `rental_policies_collateral_scope_check` — luật nhất quán, ràng ở DB chứ không ở app:
  - `cash` ⇒ `deposit_amount > 0` AND `cardinality(collateral_asset_types) = 0`
  - `asset` ⇒ `deposit_amount = 0` AND `cardinality(collateral_asset_types) > 0`
  - `none` ⇒ `deposit_amount = 0` AND `cardinality(collateral_asset_types) = 0`
- CHECK phần tử mảng thuộc enum.

> Migration này đụng dữ liệu đang chạy: hàng nào `deposit_amount > 0` mà backfill ra `cash` thì
> hợp lệ ngay; không có hàng nào rơi vào `asset` sau backfill. Chạy `database-change` skill trước.

### A3. Backend

- `dto/pricing.dto.ts`: `SaveRentalPolicyDto` + `RentalPolicyValuesDto` thêm `collateralMode`
  (`@IsIn(COLLATERAL_MODE_VALUES)`) và `collateralAssetTypes` (`@IsArray` + `@IsIn(each)`).
- `PricingService.validatePolicy()` (:248): thêm ràng buộc chéo **đúng câu chữ như CHECK** —
  `asset` mà mảng rỗng, `cash` mà cọc = 0, `none` mà còn cọc. Hai lớp cùng thông điệp, giống cách
  bậc giao nhận đang làm.
- `policyData()` (:1005) + `toValues()` (:978) + `POLICY_SELECT` (:38) + `auditShape()` (:1021):
  thêm hai trường. **Bỏ sót `POLICY_SELECT` là bug thầm lặng** — giá trị sẽ luôn về mặc định.
- `BookingPriceSnapshot.policy` ở `packages/types/src/pricing.ts:140` và `SnapshotPolicyDto`
  (`dto/pricing.dto.ts:540`): thêm hai trường để snapshot đơn đóng băng đủ điều kiện lúc chốt.

### A4. Frontend — dùng chung cho CẢ hai màn

Toàn bộ nằm ở `DepositSection` trong
[PolicySections.tsx:112-150](../../apps/web/src/features/rental-policies/components/PolicySections.tsx#L112-L150)
— component này đã được **cả** `ShopPolicyForm` **lẫn** `VehiclePricingWorkspace` dùng, nên sửa một
chỗ là có mặt ở cả hai màn, đúng như yêu cầu.

Đổi thành: `Radio.Group` ba chế độ → ô tiền cọc chỉ hiện khi `cash`, `Checkbox.Group` loại tài sản
chỉ hiện khi `asset`, `none` hiện dòng giải thích. Đổi tiêu đề khối thành "Yêu cầu bảo đảm
(thế chấp)".

- `schema.ts`: `policyFormSchema` (:56) thêm `collateralMode` + `collateralAssetTypes` với các
  `.when()` phản chiếu đúng luật CHECK. `depositAmount` chỉ `required` khi `mode === 'cash'`.
- `form.ts`: `EMPTY_POLICY_FORM` (:16), `policyToForm` (:28), `formToSaveInput` (:50).
  `vehiclePricingFormSchema` kế thừa tự động qua `.shape()` (:175) — không cần đụng.

---

## Phần B — Tách GIÁ khỏi ghi đè chính sách

Hôm nay `source` điều khiển cả hai thứ. Tách thành hai trục độc lập: **giá luôn sửa được**
(giá vốn nằm trên `vehicles`, không nằm trên `rental_policies`), **`source` chỉ còn điều khiển hàng
chính sách**.

- `dto/vehicle.dto.ts` — `SaveVehiclePricingDto`: `source` (:307) đổi ngữ nghĩa thành *nguồn chính
  sách*, `policy` thành **optional** (chỉ gửi khi `source='vehicle'`). Giữ nguyên tên trường để
  không phá contract; cập nhật docblock cho đúng.
- `VehiclesService.savePricing` ([:595-754](../../apps/api/src/modules/vehicles/vehicles.service.ts#L595-L754)):
  bỏ điều kiện "chỉ ghi giá khi override" ở :640-658 — ghi giá theo `serviceTypes` như hiện tại,
  **độc lập** với nhánh chính sách. Nhánh `source='shop'` vẫn xoá hàng ghi đè (:676-678) nhưng
  **không còn động tới giá**.
- Knockback ADR 0008 (:659-661, :685-698) giữ nguyên: đổi **giá** ⇒ chờ duyệt lại. Đổi **chính
  sách** không knockback (hành vi hiện tại).
- `VehiclePricingWorkspace.tsx`: khối giá ra khỏi vùng bị `editMode` khoá; `InheritedSummary`
  (:566-703) từ "read-only toàn bộ" thành "giá sửa được + chính sách read-only kèm link về trang
  gian hàng". Switch ở :193-208 chỉ còn điều khiển khối chính sách. `submit` (:117-180) chỉ đính
  `policy` khi đang ghi đè.
- Test `rental-pricing.spec.ts` (describe :228, precedence :489-533) và
  `vehicle-pricing-workspace.test.tsx` phải cập nhật — chúng đang khẳng định đúng cái ràng buộc
  ta vừa gỡ.

---

## Phần C — Hợp nhất `noCollateral`

### C1. Gỡ vòng phụ thuộc module (làm trước, nếu không sẽ kẹt)

`PublicListingsModule` **đã** import `PricingModule`, nên `PricingModule` không import ngược được.
Nhưng `ListingsService` chỉ phụ thuộc `PrismaService` (listings.service.ts:22) và là thứ **duy
nhất** được export ra ngoài (public-listings.module.ts:20).

→ Tách `ListingsService` sang module lá **`ListingsSyncModule`** (`providers`+`exports` chỉ nó).
`PublicListingsModule` import module mới; bốn module đang dùng (`vehicles`, `branches`, `review`,
`platform-admin`) đổi import sang module lá. `PricingModule` khi đó import được — **không cần
`forwardRef`**, và ADR 0008 giữ nguyên vì lớp writer không đổi.

### C2. Suy `noCollateral` từ chính sách

- `ListingsService.syncFromVehicle` (:24): thay vì chép `vehicle.noCollateral`, tự truy
  `rental_policies` theo đúng precedence (override xe → theo loại → legacy) và đặt
  `noCollateral = (mode === 'none')`. Service vẫn là lá — nó tự query Prisma, không gọi
  `PricingService`.
- Thêm `ListingsService.syncCollateralForPolicy(tenantId, vehicleType, tx)`: **một câu UPDATE
  gộp** cho mọi xe đang kế thừa, theo đúng tiền lệ `syncBranchLocation` (:141) — không lặp
  `syncFromVehicle` từng xe.
- `PricingService.saveShopPolicy` (:138-185) gọi hàm trên **trong cùng transaction**: đổi chính
  sách gian hàng phải kéo theo nhãn/facet trên sàn, nếu không sàn hiển thị sai cho tới lần sửa xe
  kế tiếp.
- Bỏ `noCollateral` khỏi form xe: `VehicleFormSections.tsx:852-857`,
  `packages/validators/src/index.ts:179`, `vehicle.dto.ts:241,557`,
  `CreateVehiclePricingStep.tsx`. **Giữ cột `vehicles.no_collateral`** ở đợt này (bỏ cột là
  migration huỷ dữ liệu, tách riêng) — chỉ ngừng ghi và ngừng đọc.
- Filter/facet marketplace (`public-listings.service.ts:251,381,417,456`) và
  `LISTING_AMENITY.NO_COLLATERAL` giữ nguyên — chúng đọc `public_listings`, giờ được nuôi đúng.

### C3. Hiện cho khách

`ListingDetailView` bổ sung khối "Bảo đảm & giấy tờ cần có" theo
[11_FIGMA_MASTER_PROMPT.md:191](../design/11_FIGMA_MASTER_PROMPT.md) — chế độ bảo đảm + loại tài sản
+ giấy tờ phải đối chiếu. Lấy từ `effectivePolicy` ở `public-listings.service.ts:800` (đã có sẵn ở
đó cho `deliveryAvailable`), thêm vào `PublicListingDetailDto`.

---

## Phần D — Đối chiếu giấy tờ + nút "Bổ sung giấy tờ"

### D1. Giấy tờ bắt buộc theo dịch vụ

Hàm thuần trong `packages/types` (dùng chung BE/FE — skill `shared-code`):

```ts
requiredIdentityDocuments(serviceType): CustomerDocumentType[]
// self_drive | long_term → [CITIZEN_ID, DRIVER_LICENCE]
// with_driver            → [CITIZEN_ID]
```

Tái dùng `CUSTOMER_DOCUMENT_TYPE` đã có ở
[tenant-customer.ts:103-118](../../packages/types/src/status/tenant-customer.ts#L103-L118) —
**không** tạo enum giấy tờ thứ hai.

### D2. Ghi nhận đối chiếu

`TenantCustomerDocument` (schema.prisma:1211-1239) thêm:
`verifiedAt Timestamptz?`, `verifiedByUserId Char(26)?`, `verifyMethod VarChar(20)?`
(`IDENTITY_VERIFY_METHOD = { VNEID, IN_PERSON }`), `verifyNote VarChar(255)?`.

Endpoint mới `POST /customers/:id/documents/:documentId/verify` trong
`customer-documents.controller.ts`, quyền `CUSTOMER_DOCUMENT_MANAGE` (rbac.ts:175), ghi
`audit_logs` — đối chiếu danh tính là hành vi cần truy vết (database_design §:1633).

`CustomerDocumentDto` (customer.dto.ts:337-353) trả thêm trạng thái đối chiếu.
`CustomerDocumentsPanel` thêm nút "Đã đối chiếu" + badge trên từng hàng.

### D3. Nút trên màn đơn thuê

**Chốt chặn phải xử lý trước:** `BookingDetailDto` không hề lộ id khách. Thêm
`tenantCustomerId!: string | null` — có sẵn tiền lệ y hệt ở
[booking-request.dto.ts:275](../../apps/api/src/modules/booking-requests/dto/booking-request.dto.ts#L275)
(lộ `tenantCustomerId`, **cố ý giấu** `customerUserId` vì đó là định danh xuyên tenant — làm đúng
như vậy). Kèm `tenantCustomerId: true` vào `DETAIL_SELECT` (bookings.service.ts:72-88) và map ở
`toDetail()` (:936-953).

- `BookingDetailContent.tsx:155-168` (khối "Khách hàng đặt xe"): thêm nút **"Bổ sung giấy tờ"**,
  đặt **ngay trong khối** — đúng luật đã ghi ở docblock :255-260 (nút sửa đứng cạnh dữ liệu nó
  sửa, không dồn lên thanh hành động). Ẩn khi `tenantCustomerId == null` (đơn cũ không khớp được
  khách) hoặc thiếu quyền.
- Component mới `BookingCustomerDocumentsDialog` bọc `ResponsiveDialog size="lg"` quanh
  `<CustomerDocumentsPanel />` — khuôn 50 dòng của `CustomerDetailDialog`. Panel nhận props thuần
  `{ customerId, canManage, canViewFiles }` nên nhét vào modal được nguyên trạng.
- **Quyền không mượn:** gate bằng `CUSTOMER_DOCUMENT_MANAGE` / `CUSTOMER_DOCUMENT_FILE_VIEW`,
  **không** bằng `BOOKING_UPDATE` (rbac.ts:160-180 tách bốn tầng theo mức thiệt hại). Kết quả
  thực tế: staff không thấy nút; manager upload được nhưng không xem được ảnh; owner/admin đủ.
- Hiện badge cảnh báo khi khách thiếu giấy tờ theo `requiredIdentityDocuments(serviceType)` của
  đơn — đây là chỗ "đối chiếu bắt buộc" hiện diện, ở mức cảnh báo (xem Giả định).

---

## i18n

Màn `/manage/shop/policies` hiện **chưa** i18n hoá (không có namespace; `MESSAGE_NAMESPACES`
không liệt kê) và câu chữ validation tiếng Việt đến thẳng từ backend. Đợt này:

- **Nhãn enum mới bắt buộc có cả vi/en** trong `messages/{vi,en}/domain.json` — vì chúng hiện ra
  **marketplace**, khu đã i18n hoá. Chế độ bảo đảm, loại tài sản, phương thức đối chiếu.
- Chuỗi ở `listings.json` cho khối "Bảo đảm & giấy tờ cần có" (Phần C3).
- **Không** chuyển trọn màn policies sang `t()` trong đợt này — đó là việc riêng, gộp vào đây sẽ
  làm phình một thay đổi vốn đã đụng schema + hai màn quản trị + marketplace. Ghi nhận để
  `i18n:audit` tiếp tục kiểm kê.

---

## Verify

Theo skill `verify-changes` — chỉ chạy phạm vi đã sửa, không quét cả workspace.

```bash
# 1. Migration + Prisma client
pnpm --filter @xeprime/prisma migrate:dev
pnpm --filter @xeprime/prisma seed          # idempotent, phải chạy lại sạch

# 2. Contract FE↔BE (ADR 0007) — BẮT BUỘC sau khi đổi DTO
pnpm contract                                # openapi.json + api.generated.ts

# 3. Backend
pnpm --filter @xeprime/api test -- rental-pricing.spec.ts long-term-packages.spec.ts
pnpm --filter @xeprime/api test -- vehicle-approval.spec.ts booking-settlement.spec.ts
pnpm --filter @xeprime/api lint

# 4. Frontend
pnpm --filter @xeprime/web test -- rental-policies bookings customers
pnpm --filter @xeprime/web i18n:check        # parity vi↔en cho nhãn enum mới
pnpm --filter @xeprime/web lint
```

**Test phải viết thêm:**

- CHECK constraint từ chối đủ 3 tổ hợp sai (`cash` cọc 0 · `asset` mảng rỗng · `none` còn cọc) —
  test đụng constraint thật, chạy trên Postgres qua `@testcontainers/postgresql`.
- Backfill: hàng cũ `deposit_amount > 0` → `cash`; `= 0` → `none`.
- **Phần B (dễ hồi quy nhất)**: đặt giá riêng cho xe mà `source` vẫn là `shop` → giá ghi được, hàng
  ghi đè **không** được tạo, `effectivePolicy` vẫn trả `source: 'shop'`.
- **Phần C**: sửa chính sách gian hàng sang `none` → mọi `public_listings` của xe đang **kế thừa**
  đổi `noCollateral = true`, xe đang **ghi đè** thì **không** đổi.
- Quyền: staff (`BOOKING_VIEW` + `CUSTOMER_VIEW`, không có quyền giấy tờ) **không** thấy nút "Bổ
  sung giấy tờ"; manager thấy nút nhưng không mở được file.

**Kiểm bằng luồng thật (không chỉ test):** `/manage/shop/policies` đổi sang "Cọc tài sản → cà vẹt"
→ mở `/manage/vehicles/<id>/edit?tab=pricing` thấy kế thừa đúng → đổi riêng giá xe mà chính sách
vẫn báo "Đang kế thừa" → mở trang xe trên sàn thấy khối "Bảo đảm & giấy tờ cần có" và nhãn "Miễn
thế chấp" biến mất → mở một đơn ở `/manage/bookings/<id>` bấm "Bổ sung giấy tờ", tải CCCD lên và
tích "Đã đối chiếu".

## Ngoài phạm vi (cố ý)

- Kế thừa **theo từng mục** (cột nullable + merge trong `effectivePolicy`) — giữ ghi đè nguyên khối.
- Tích hợp API VNeID thật.
- Chốt chặn cứng: chặn tạo/duyệt đơn khi chưa đối chiếu đủ giấy tờ.
- Bỏ cột `vehicles.no_collateral` khỏi schema.
- i18n hoá trọn màn `/manage/shop/policies`.
