# Rút luồng "Yêu cầu thuê xe" của khách còn 2 bước

Ngày: 19/08/2026 · Phạm vi: `apps/web` (luồng khách) + một thay đổi nhỏ ở `apps/api`
(public listing detail). Không đụng luồng đặt hộ của gian hàng.

## Context

Overlay `Yêu cầu thuê xe` hiện có ba bước biểu mẫu `Thời gian → Liên hệ → Xác nhận`
([RequestBookingFlow.tsx](../../apps/web/src/features/booking-requests/components/RequestBookingFlow.tsx)).
Đọc lại cả ba màn cùng lúc thì thấy ba vấn đề thật, không phải cảm giác:

1. **Bảng giá lặp ba lần y hệt.** `PriceBreakdown` được dựng ở bước Thời gian (dòng 868), bước
   Liên hệ (1206) và bước Xác nhận (1380) với cùng `quoteQ.data`. Riêng thuê dài hạn còn có
   surface thứ tư — khối "Tóm tắt lựa chọn" tự vẽ trong
   [LongTermPackageStep.tsx:226-270](../../apps/web/src/features/booking-requests/components/LongTermPackageStep.tsx#L226-L270).
   Khách cuộn qua cùng một bảng tiền 3–4 lần mà không có gì mới.

2. **Bước "Thời gian" hầu như không có việc để làm.** Thẻ tìm kiếm ở trang chủ đã hỏi thời gian
   (`SearchCard` → URL `pickupAt`/`returnAt` → `ListingDetailView` → `RequestBookingButton`), nên
   khi khách đến từ luồng tìm kiếm, bước 1 chỉ còn một ô đã điền sẵn và một nút Tiếp tục. Nó là
   một bước để bấm qua, không phải một bước để quyết định.

3. **Bước "Liên hệ" rỗng với người đã đăng nhập.** `accountPhoneVerified && !editingContact` cho
   ra một thẻ chỉ-đọc gồm tên + SĐT + "Đổi thông tin" (dòng 1056-1082) — một bước toàn màn cho
   một dòng thông tin hệ thống đã biết. Và ô "Nhận tại điểm hẹn" chỉ ghi gợi ý chung chung
   *"Tự tới nhận xe tại địa điểm của chủ xe"*, không nói địa điểm đó ở đâu.

Kết quả mong muốn: luồng còn **hai bước** — một bước nhập mọi thứ về chuyến đi, một bước xác nhận
và gửi; tiền hiện **một chỗ duy nhất** luôn nhìn thấy được; "Nhận tại điểm hẹn" nói được địa chỉ
thật; và toàn bộ luồng chạy song ngữ vi/en theo ADR 0012.

## Quyết định đã chốt với người dùng

| Câu hỏi | Chốt |
| --- | --- |
| Số bước | **2**: `Chuyến đi` → `Xác nhận`. OTP vẫn là trạng thái xen giữa, `done` vẫn là kết quả |
| Điểm nhận xe | **Dùng lại `TenantBranch`** (đã có `address`/`phone`/`lat`/`lng`, xe đã gắn `branchId`) — không thêm cột địa chỉ song song |
| Khối giá | **Một component dính đáy cột phải**, thu gọn ở bước 1, tự mở đầy đủ ở bước Xác nhận |
| Kèm theo | i18n hoá luồng khách · ẩn "Giao xe tận nơi" khi chính sách tắt · rút gọn cột trái |
| KHÔNG làm đợt này | Thêm ô chọn thời gian ở trang chi tiết xe |

---

## 1. Backend — lộ điểm nhận xe và cờ giao xe THẬT

Một file service + một file DTO, không migration.

**`apps/api/src/modules/public-listings/dto/public-listings.dto.ts`** — thêm vào
`PublicListingDetailDto`:

- `pickupPoint: PickupPointDto | null` — `{ branchName, address, provinceName, phone }`. Đây là
  chi nhánh đang giữ xe; `null` khi chi nhánh chưa điền địa chỉ **và** hồ sơ gian hàng cũng trống.
- `deliveryAvailable: boolean` — giao xe tận nơi có **đặt được** không.

> Vì sao cần `deliveryAvailable` bên cạnh `deliveryEnabled` đã có: hai giá trị này là hai thứ
> khác nhau và **đang lệch nhau được**. `deliveryEnabled` là tiện ích của xe (`vehicles`), chỉ để
> gắn chip trên thẻ xe. Cái backend thật sự chặn khi gửi yêu cầu là
> `policy.values.deliveryEnabled` của **chính sách hiệu lực**
> ([booking-requests.service.ts:246](../../apps/api/src/modules/booking-requests/booking-requests.service.ts#L246)
> → `DELIVERY_NOT_SUPPORTED`). Hôm nay FE đọc cái đầu nên khách chọn được một hình thức mà đến
> nút cuối mới bị từ chối. Giữ nguyên ý nghĩa của `deliveryEnabled` (chip), thêm trường mới cho
> đúng cái cổng.

**`public-listings.service.ts` → `getById()`**:

- Mở rộng `select.branch` từ `{ province: { name } }` thành thêm `name, address, phone`; thêm
  `address` vào `tenant.profile.select`.
- Nhấc `this.pricing.effectivePolicy(v.tenantId, v.id)` ra khỏi nhánh `long_term` (dòng 791) để
  luôn có, rồi map `deliveryAvailable: policy?.values.deliveryEnabled ?? false`. Đây là một query
  thêm trên trang chi tiết — chấp nhận được, và nó vốn đã chạy cho mọi xe có dài hạn.
- `pickupPoint.address = branch.address ?? tenant.profile.address ?? null`; `branchName` chỉ đưa
  ra khi có địa chỉ (tên chi nhánh trần không giúp khách tới được chỗ nào).

Chạy `pnpm contract` để `packages/types/src/api.generated.ts` có hai trường mới (ADR 0007 — không
viết tay type).

**Không** đụng `LISTING_CARD_SELECT`/danh sách: tính chính sách hiệu lực cho từng thẻ là N query.

---

## 2. Frontend — cấu trúc hai bước

### 2.1 `BookingSteps` nhận danh sách bước

[BookingSteps.tsx](../../apps/web/src/features/booking-requests/components/BookingSteps.tsx) đang
hardcode ba bước và **dùng chung với `StaffBookingFlow`** — nơi bước "Khách hàng" là nhập liệu
thật (staff gõ thông tin khách), phải giữ nguyên ba bước. Thêm prop `steps` (mặc định
`BOOKING_STEPS` hiện tại) và export thêm `BOOKING_STEPS_CUSTOMER = [trip, review]`. Staff flow
không phải sửa gì.

`current === 'otp'` map về ô `trip` (khách vẫn đang hoàn tất bước 1, chưa tới Xác nhận);
`'done'` vẫn là `steps.length`.

### 2.2 `RequestBookingFlow` — gộp `time` + `contact` thành `trip`

State bước: `'trip' | 'otp' | 'review' | 'done'` (bỏ `'time'`, `'contact'`).

**Thân bước `trip`** (theo thứ tự):

1. Dịch vụ (`Segmented` khi xe phục vụ >1) — giữ nguyên logic hiện có.
2. Lộ trình + mô tả (chỉ `with_driver`).
3. Thời gian thuê (`RentalDateTimeRangeField`) **hoặc** `LongTermPackageStep` cho dài hạn.
4. Hình thức nhận xe + khối phụ thuộc (địa chỉ giao / địa chỉ đón + điểm đến).
5. Khối liên hệ — **chỉ render khi cần**: khách vãng lai, hoặc người đã đăng nhập vừa bấm
   "Đổi thông tin" (`editingContact`). Người đã đăng nhập + SĐT đã xác thực không thấy ô nào.

**Hành động "Tiếp tục"** (`continueFromTrip`) gộp hai hàm cũ:

```
validate(trường của dịch vụ đang chọn + pickupMethod/địa chỉ + liên hệ nếu đang hiện)
  → dịch vụ theo ngày: checkAvailability(); dài hạn: bỏ qua (chưa có khung giờ — ADR 0011)
  → phoneMatchesAccount ? setStep('review') : vp.sendAsync() → setStep('otp')
```

Giữ nguyên mọi cửa bảo vệ đang có: `PHONE_NOT_VERIFIED` từ backend vẫn lùi về `otp`,
`BOOKING_REQUEST_DUPLICATE` vẫn ra màn trùng lặp.

**Thân bước `review`**: danh sách tóm tắt hiện có, **thêm một dòng `Người thuê`** mang tên + SĐT +
chip "Đã xác thực" + nút `Đổi` (quay lại `trip` với `editingContact = true`). Dòng
`Nhận xe`/`Hình thức` nói kèm địa chỉ điểm hẹn thật. Bỏ `PriceBreakdown` khỏi thân — nó nằm ở
khối giá dính đáy (mục 2.3).

**Nút footer**: `trip` → `[Huỷ] [Tiếp tục]`; `otp` → `[Quay lại] [Xác thực]`; `review` →
`[Quay lại] [Gửi yêu cầu thuê]`. `Quay lại` từ `otp`/`review` đều về `trip`.

### 2.3 `BookingPriceSummary` — khối giá DUY NHẤT

Component mới `features/booking-requests/components/BookingPriceSummary.tsx`, đặt trong cùng khối
`sticky` với `.footer` của cột phải (footer đã `position: sticky; bottom: 0` —
[RequestBookingFlow.module.css:400](../../apps/web/src/features/booking-requests/components/RequestBookingFlow.module.css#L400)).
Ba trạng thái:

| Khi | Dòng thu gọn | Mở ra |
| --- | --- | --- |
| Chưa chọn thời gian/gói | `Từ 585.000 đ/ngày · chọn thời gian để xem tạm tính` | các dòng đơn giá theo ĐÚNG dịch vụ đang chọn |
| Đang tải quote | skeleton một dòng | — |
| Có quote | `Tạm tính 585.000 đ ⌄ Chi tiết` | `PriceBreakdown` đầy đủ + cọc + ghi chú |

Bước `review` truyền `defaultExpanded` → mở sẵn (khách sắp cam kết thì phải thấy đủ).

Việc này **xoá** khỏi `RequestBookingFlow`: khối `.priceCard` đơn giá tự vẽ (dòng 916-1035) và cả
ba chỗ gọi `PriceBreakdown`; các dòng đơn giá chuyển vào phần "mở ra" của component mới. Đồng
thời **xoá khối "Tóm tắt lựa chọn" + câu "Tiết kiệm…" khỏi `LongTermPackageStep`** — component đó
chỉ còn chọn gói + nguyện vọng ngày nhận, không còn nhận prop `quote`/`quoteLoading`; phần dài
hạn của `breakdown.longTerm` (giá gốc, ưu đãi, câu tiết kiệm) do `BookingPriceSummary` lo.

Dùng lại `PriceBreakdown` sẵn có ([PriceBreakdown.tsx](../../apps/web/src/components/data-display/PriceBreakdown.tsx))
— không vẽ lại hàng tiền.

### 2.4 Điểm nhận xe trong lựa chọn "Nhận tại điểm hẹn"

Thay dòng gợi ý cứng `Tự tới nhận xe tại địa điểm của chủ xe` bằng địa chỉ thật từ
`listing.pickupPoint`: `{branchName} · {address}` (+ tỉnh). `pickupPoint == null` thì rơi về câu
gợi ý chung như hiện nay — không dựng địa chỉ giả.

Dòng này cũng lặp lại ở bước `review` (`Nhận xe: Tại điểm hẹn · 12 Nguyễn Văn Linh, Đà Nẵng`) —
đây là lặp CÓ ÍCH: khách xác nhận địa điểm trước khi gửi.

### 2.5 Ẩn "Giao xe tận nơi" khi không đặt được

`listing.deliveryAvailable === false` → chỉ render một lựa chọn `Nhận tại điểm hẹn` (bỏ hẳn
`role="radiogroup"` hai ô, thay bằng một dòng thông tin). Đồng thời `useEffect` ép
`pickupMethod = SELF` nếu state cũ còn `DELIVERY` (khách đổi xe trong cùng phiên).

### 2.6 Rút gọn cột trái

[VehicleSummaryPanel.tsx](../../apps/web/src/features/booking-requests/components/VehicleSummaryPanel.tsx)
đang dựng lại gần hết trang chi tiết xe mà khách vừa rời khỏi. Giữ: ảnh đại diện, badge dịch vụ +
`DiscountTag`, tên, `vehicleType · tỉnh`, giá theo dịch vụ đang chọn, 4 dòng thông số, thẻ gian
hàng (đã có sẵn `ratingAvg · N đánh giá`), thẻ "Người thuê" ở bước xác nhận. **Bỏ**: gallery 6
ảnh, chip tiện ích, danh sách đánh giá.

Kéo theo: `RequestBookingFlow` bỏ query `reviewsQ` (`fetchListingReviewsClient`,
`REVIEW_PREVIEW_COUNT`) và ba prop `reviews`/`reviewSummary`/`reviewsLoading`; panel bỏ
`PreviewImageGroup` (chỉ còn một ảnh → `PreviewImage` đứng riêng). Panel ngắn lại đủ để **bỏ nút
"Xem thông tin xe"** trên mobile — hiện luôn cả cột.

---

## 3. i18n hoá luồng khách (ADR 0012)

`RequestBookingFlow` hiện **không** có `useTranslations` — 100% chuỗi tiếng Việt thô, cùng với
`LongTermPackageStep`, `VehicleSummaryPanel`, `BookingSteps`. Viết lại các bước là lúc rẻ nhất để
chuyển.

- Chuỗi mới đặt dưới khoá `flow.*` của namespace **`BookingRequests`** đã có
  (`messages/{vi,en}/booking-requests.json`) — cùng tính năng sở hữu, và mọi namespace đều nằm
  chung một bundle theo locale nên không phát sinh chi phí nạp. Không tạo namespace mới, không
  phải sửa `namespaces.ts`/`index.ts`.
- Nhãn enum đi qua `useDomainLabel()`: `serviceType`, `routeType`, `pickupPreference` **đã có sẵn**
  trong `messages/*/domain.json`. Bỏ import `serviceTypeLabel` / `ROUTE_TYPE_LABEL` /
  `ROUTE_TYPE_DESCRIPTION` / `PICKUP_PREFERENCE_LABEL` từ `@xeprime/types` trong các component
  này (chúng vẫn phục vụ apps/api cho email/thông báo — giữ nguyên ở packages).
- `serviceTypesLabel(list)` (badge cột trái) → `list.map((s) => dl('serviceType', s)).join(' · ')`.
- `longTermPackageLabel(n)` → khoá ICU `flow.packageMonths: "{months, plural, other {# tháng}}"`.
- Tiền/ngày giờ đã đi qua `useAppFormat()` — giữ nguyên.
- Lỗi API hiển thị qua `useErrorMessage()` (ánh xạ từ MÃ), không dựng chữ từ `message` của backend
  — hiện `getErrorMessage(e)` đang bơm thẳng câu tiếng Việt vào `stepError`.

---

## 4. Test

- **Sửa** [RequestBookingModal.test.tsx](../../apps/web/src/features/booking-requests/components/RequestBookingModal.test.tsx)
  (865 dòng) và [long-term-booking-flow.test.tsx](../../apps/web/src/features/booking-requests/components/long-term-booking-flow.test.tsx)
  (412 dòng): các test đang điều hướng theo ba bước phải đi theo hai bước. Payload gửi lên API
  **không đổi** — giữ nguyên mọi assert về body, đó là hợp đồng thật.
- **Thêm**: người đã đăng nhập + SĐT đã xác thực không thấy ô nhập liên hệ nào và đi thẳng
  `trip → review`; `deliveryAvailable: false` → không có lựa chọn giao tận nơi; bảng giá chỉ tồn
  tại **một** instance trên mỗi bước; `pickupPoint` hiện địa chỉ ở cả bước 1 lẫn bước xác nhận.
- `StaffBookingFlow` giữ ba bước — [staff-booking-dialog.test.tsx](../../apps/web/src/features/booking-requests/components/staff-booking-dialog.test.tsx)
  phải xanh mà không sửa gì (đó là bằng chứng `BookingSteps` không bị phá).

---

## 5. Files chính

| File | Việc |
| --- | --- |
| `apps/api/src/modules/public-listings/public-listings.service.ts` | `getById`: select branch/profile address, hoist `effectivePolicy`, map `pickupPoint` + `deliveryAvailable` |
| `apps/api/src/modules/public-listings/dto/public-listings.dto.ts` | `PickupPointDto` + 2 trường mới |
| `packages/types/src/api.generated.ts` | sinh lại bằng `pnpm contract` |
| `apps/web/.../BookingSteps.tsx` | prop `steps` + `BOOKING_STEPS_CUSTOMER` |
| `apps/web/.../RequestBookingFlow.tsx` (+ `.module.css`) | gộp bước, gỡ 3 `PriceBreakdown` + `.priceCard`, gate delivery, điểm nhận xe, i18n |
| `apps/web/.../BookingPriceSummary.tsx` (+ css) | **mới** — khối giá dính đáy 3 trạng thái |
| `apps/web/.../LongTermPackageStep.tsx` (+ css) | bỏ khối tóm tắt giá + prop `quote`, i18n |
| `apps/web/.../VehicleSummaryPanel.tsx` (+ css) | rút gọn, i18n |
| `apps/web/messages/{vi,en}/booking-requests.json` | khoá `flow.*` |
| 3 file test kể trên | cập nhật + bổ sung |

## 6. Verification

```bash
pnpm contract                                   # sau khi sửa DTO
pnpm --filter @xeprime/api typecheck
pnpm --filter @xeprime/web typecheck
pnpm --filter @xeprime/web i18n:check           # parity vi↔en, ICU, không giá trị rỗng
pnpm --filter @xeprime/web i18n:audit           # xác nhận luồng đặt không còn chuỗi thô
cd apps/web && pnpm exec vitest run src/features/booking-requests
```

Kiểm bằng tay trên stack đang chạy (web :3000 · api :4000):

1. `/` → chọn thời gian ở thẻ tìm kiếm → mở một xe → `Chọn thuê`: bước 1 đã có sẵn thời gian, khối
   giá dính đáy hiện `Tạm tính`, không có bảng giá thứ hai khi cuộn.
2. Vào thẳng `/listings/<id>` (không qua filter): ô thời gian trống, bấm Tiếp tục phải báo lỗi
   validate chứ không gọi `check-availability`.
3. Đăng nhập bằng tài khoản có SĐT đã xác thực → bước 1 **không** có ô họ tên/SĐT; bước 2 có dòng
   `Người thuê … Đã xác thực` + nút `Đổi` quay lại được bước 1 với ô nhập hiện ra.
4. Khách vãng lai → nhập SĐT lạ → màn OTP nằm giữa hai bước, thanh tiến trình vẫn sáng ô 1.
5. Xe có `deliveryAvailable = false` (tắt giao xe ở `/manage/shop/policies`) → không thấy lựa chọn
   `Giao xe tận nơi`; xe có chi nhánh đã điền địa chỉ → thấy đúng địa chỉ đó ở cả hai bước.
6. Đổi ngôn ngữ sang EN bằng `LocaleSwitcher` → cả overlay sang tiếng Anh, tiền vẫn VND, giờ vẫn
   `Asia/Ho_Chi_Minh`.
7. Thu cửa sổ ≤640px → một cột, khối giá + nút vẫn dính đáy, không có thanh cuộn ngang.

## 7. Ngoài phạm vi (ghi lại để không quên)

- Ô chọn thời gian ở trang chi tiết xe (đã chốt không làm đợt này).
- Hiện địa chỉ điểm nhận xe ở `/trips/:id` và `/manage/bookings/:id` — hôm nay mới ghi
  `Nhận tại đại lý` trần. Cùng gốc vấn đề nhưng khác endpoint (`customer-trips`), làm sau.
- Gộp `vehicles.delivery_enabled` với `rental_policies.delivery_enabled` thành một nguồn — là nợ
  kỹ thuật thật, nhưng cần migration + sửa form duyệt xe, không nhét vào đợt này.
