# Kế hoạch: Module Booking / Rental cho app native (BKG-01 → BKG-16)

> Ngày viết: 27/08/2026 · Trạng thái: **KẾ HOẠCH — CHƯA CODE**
> Phạm vi: `apps/mobile` + `packages/api-client` + `packages/domain/messages`.
> Đây là tài liệu **giao việc**: đọc xong là code được, không phải đọc xong rồi đi hỏi tiếp.
>
> Toàn bộ mục 1 là **kết quả rà soát thật** trên `apps/api/src/modules/*`, `apps/web/src/features/*`
> và `packages/types/src/status/*` — không phải giả định. Mọi con số, tên hằng, tên endpoint trong
> tài liệu này đều đã đối chiếu với mã nguồn ngày 27/08/2026.

---

## 0. Cách dùng tài liệu này

| Bạn là | Đọc mục |
| --- | --- |
| Người code | 1 (luật nghiệp vụ) → 3 (phase của bạn) → 4 (endpoint) → 6 (checklist) |
| Người review | 1 → 6 |
| Người quyết định | 2 → 5 |

Trước khi gõ dòng đầu tiên, đọc: `CLAUDE.md` · `apps/mobile/docs/15_MOBILE_DUAL_NAVIGATOR.md` ·
ADR `0005` `0006` `0011` `0014` `0017` `0018`.
Gọi skill: `mobile-feature`, `i18n`, `shared-code`. Dùng agent `navigator` để định vị file.

**Nguyên tắc bao trùm: NGHIỆP VỤ GIỐNG WEB 100%, UI được thiết kế lại cho native.**

| Phải giống web tuyệt đối | Được tự do làm khác |
| --- | --- |
| Máy trạng thái, điều kiện cho phép mỗi hành động | Bảng → thẻ; modal → bottom sheet / màn riêng |
| Công thức tiền, thứ tự cộng trừ, cách hiển thị cọc | Cách chia bước, cách gom section |
| Điều kiện ẩn/hiện theo permission | Vị trí nút, action bar dính đáy màn |
| Luật gói dài hạn (tháng lịch) | Cách chọn gói |
| Validation, mã lỗi | Cách trình bày lỗi |

---

## 1. Kết quả rà soát luồng web/API

### 1.1 Backend đã sẵn sàng 100% — kể cả cho native

Không có endpoint nào phải viết mới cho BKG-01→16 (trừ BKG-14, mục 5). Hai điểm đã được backend
chuẩn bị sẵn cho app mà **web không dùng tới**:

**1. `POST /public/booking-requests` nhận `client: 'native'`.**
Khi khách vãng lai vừa được tạo tài khoản từ SĐT đã xác thực, response trả thẳng cặp token:

```jsonc
{
  "...": "receipt",
  "session": {
    "tokens": { "accessToken", "accessTokenExpiresIn", "refreshToken", "refreshTokenExpiresAt" },
    "user": { /* MeDto */ }
  }
}
```

Web bỏ trống `client` và nhận `Set-Cookie`. **App BẮT BUỘC gửi `client: 'native'` + `device`** —
không gửi thì phiên rơi vào hư không và khách vừa đặt xe xong bị coi như chưa đăng nhập. Nhận được
`session` thì nạp vào phiên đúng đường `src/lib/auth-session.ts` đang dùng, **không** tự chế đường
lưu token thứ hai.

**2. `GET /trips/:id` nhận CẢ id yêu cầu lẫn id đơn.** Một màn phục vụ hai giai đoạn của cùng một
chuyến. Không cần hai route, không cần đoán loại id.

### 1.2 Luật nghiệp vụ nằm ở `packages/types` — Metro đọc được, DÙNG LẠI, đừng viết lại

Đây là phát hiện quan trọng nhất của lần rà này: gần như toàn bộ luật mà UI cần đã là hàm thuần
dùng chung. **Viết lại bất kỳ thứ nào dưới đây là lỗi review.**

| Cần biết | Hàm/hằng có sẵn | File |
| --- | --- | --- |
| Chuyển trạng thái đơn nào hợp lệ | `BOOKING_STATUS_TRANSITIONS`, `canTransitionBooking(from,to)` | `status/booking.ts` |
| Đơn đã khép chưa | `isBookingFinal(status)` — suy từ chính bảng chuyển trạng thái | `status/booking.ts` |
| Trạng thái nào chiếm lịch xe | `BOOKING_STATUS_OCCUPYING`, `occupiesSchedule()` | `status/booking.ts` |
| Khi nào được ghi `no_show` | `BOOKING_NO_SHOW_GRACE_MINUTES = 30`, `noShowAllowedFrom()`, `isNoShowGracePassed()` | `status/booking.ts` |
| Nhãn + màu trạng thái đơn | `BOOKING_STATUS_META` (qua `useDomainLabel()`) | `status/booking.ts` |
| Chiều bàn giao nào mở được | `HANDOVER_ELIGIBLE_BOOKING_STATUS`, `isHandoverEligible()` | `status/handover.ts` |
| Xác nhận bàn giao đẩy đơn sang đâu | `HANDOVER_CONFIRM_BOOKING_TARGET` | `status/handover.ts` |
| Biên bản còn sửa được không | `HANDOVER_STATUS_EDITABLE`, `isHandoverEditable()` | `status/handover.ts` |
| Ghi xăng hay ghi % pin | `handoverEnergyKind(fuelType)`, `FUEL_LEVEL` | `status/handover.ts` |
| Góc chụp ảnh | `HANDOVER_PHOTO_SLOT`, `HANDOVER_EXTERIOR_SLOTS` | `status/handover.ts` |
| Hạn phản hồi yêu cầu | `BOOKING_REQUEST_RESPOND_WINDOW_MINUTES = 60` | `status/booking-request.ts` |
| Yêu cầu nào chiếm lịch | `BOOKING_REQUEST_STATUS_OCCUPYING` (**chỉ** `approved_by_host`) | `status/booking-request.ts` |
| Lộ trình xe có tài xế | `ROUTE_TYPE`, `ROUTE_TYPE_LABEL`, `ROUTE_TYPE_DESCRIPTION` | `status/booking-request.ts` |
| Chặng của khách | `CUSTOMER_TRIP_STAGE`, `customerTripStage({requestStatus, bookingStatus})` | `status/customer-trip.ts` |
| Cộng tháng lịch, gói dài hạn | `addCalendarMonthsVn`, `longTermPackages` | `@xeprime/domain` |

### 1.3 Tiền — server tính hết, client chỉ hiển thị

`apps/api/src/common/booking-money.ts` là **định nghĩa duy nhất** của "khách còn nợ bao nhiêu":

```
phảiThu = total_amount + tổng phụ phí còn hiệu lực
cọcGánh = min(tổng phụ phí, cọc ĐÃ THU)
đãThu   = paid_amount + phiếu thu TAY đã duyệt gắn đơn + cọcGánh
cònNợ   = max(0, phảiThu − đãThu)
```

`cọcGánh` là mấu chốt chống đếm hai lần: quyết toán cọc đã trừ phụ phí vào tiền hoàn rồi, cộng
thẳng phụ phí vào công nợ nữa là bắt khách trả hai lần.

**Không tái hiện công thức này ở client.** `BookingListItemDto` đã mang sẵn `totalAmount`,
`paidAmount`, `surchargeTotal`, `amountDue`, `otherCollected`, `collectedAmount`, `debtAmount` —
đọc thẳng, format bằng `useAppFormat()`. Tiền luôn là **string** trong JSON (ADR 0007).

### 1.4 Máy trạng thái đơn — và vì sao KHÔNG có dropdown đổi trạng thái

```
reserved ──> confirmed ──> active ──> completed
    │             │
    ├─> cancelled ├─> cancelled
    └─> no_show   └─> no_show
```

`completed` / `cancelled` / `no_show` là điểm cuối (`isBookingFinal` trả `true`).

Luật UI mà web cố ý áp, app phải giữ nguyên:

- **`active` và `completed` KHÔNG BAO GIỜ đặt được bằng một cú bấm.** Chúng là **hệ quả** của một
  lần xác nhận bàn giao thật (có giờ giao/nhận + số KM). Một dropdown "đổi trạng thái" xoá đúng
  ranh giới đó.
- **Không có nút "Xác nhận đơn".** Sự xác nhận của gian hàng đã xảy ra ở `Duyệt & giữ xe` trên
  yêu cầu thuê — đó là thứ sinh ra chính đơn này.
- Chỉ còn **hai** quyết định bấm tay: **huỷ đơn** và **ghi nhận khách không đến** (sau 30 phút ân
  hạn kể từ giờ nhận theo đơn). Cả hai **bắt buộc có lý do**, và đều vào `audit_logs`.
- Hành động chính suy từ ngữ cảnh bàn giao: `handover.canStartPickup && !pickup.confirmedAt` →
  *"Xác nhận đã giao xe"*; `canStartReturn && !return.confirmedAt` → *"Xác nhận đã nhận xe"*;
  không thoả thì **không có CTA**.

### 1.5 Bàn giao (BKG-09) — luồng nhanh 2 chạm, ảnh là TUỲ CHỌN

`draft → ready → confirmed` (+ `canceled`). `confirmed` là **điểm không quay lại**: từ đó biên bản
chỉ đọc, sửa KM phải đi đường điều chỉnh có lý do + quyền riêng.

| Luật | Chi tiết |
| --- | --- |
| Mở chiều nào | `pickup` ← đơn `reserved`/`confirmed` · `return` ← đơn `active` |
| Xác nhận đẩy đơn sang | `pickup` → `active` · `return` → `completed` (trong **cùng transaction**) |
| Ảnh | **KHÔNG có slot bắt buộc.** `HANDOVER_REQUIRED_SLOTS` bị xoá có chủ ý — "một chuyến bình thường phải xong bằng đúng hai lần bấm". Đừng tô viền "bắt buộc" |
| Ảnh sau khi xác nhận | **Vẫn gắn được** — trạng thái gắn/gỡ ảnh rộng hơn trạng thái sửa đúng một bậc |
| Số KM | `odometerKm: null` = **chưa nhập**, tuyệt đối không phải 0 km. Có cờ `odometerMissing` riêng |
| KM bất thường | Server trả `HandoverSuspicionDto` (`expectedMinKm`, `deltaKm`, `rentalDays`, `thresholdKmPerDay`); người vận hành phải `suspiciousAcknowledged` |
| Xăng hay pin | Suy từ `fuelType` của xe — **chỉ xe thuần điện** ghi % pin; hybrid vẫn đổ xăng. Mức xăng theo **nấc kim** (`full`…`empty`), không nhận số lít |
| Đồng thời | `rowVersion` — nộp lại khi lưu/xác nhận, sai thì 409 |

**Upload ảnh 3 bước** (kho riêng tư, không phải URL công khai):

```
POST /bookings/:id/handovers/:type/photos/presign   → { uploadUrl, fileId, ... }
PUT  <uploadUrl>                                      ảnh lên R2, KHÔNG qua API
POST /bookings/:id/handovers/:type/photos             { fileId, slot } → HandoverDto
```

Xem lại ảnh: `GET .../photos/:fileId/download` trả **signed URL ngắn hạn** (`{ downloadUrl }`),
gác bằng quyền RIÊNG `handovers.view_files` — người lập biên bản không đương nhiên đọc lại được
kho bằng chứng.

### 1.6 Yêu cầu thuê (BKG-01 → 05)

**Luồng khách gửi** — wizard của web: `trip` → (`otp`) → `review` → `done`.

| Luật | Chi tiết |
| --- | --- |
| Không gửi `tenant_id` | Server suy từ xe (chỉ xe đã duyệt của shop đang hoạt động) |
| **Bước OTP là CÓ ĐIỀU KIỆN** | Server bỏ qua OTP khi SĐT của tài khoản **đang đăng nhập** trùng và đã verify. UI phải nhảy thẳng sang `review` — hỏi lại là hỏi cùng một câu hai lần |
| OTP không đi trong body | `CreateBookingRequestDto` **không có** trường token. Xác thực SĐT (purpose `booking`) xảy ra **trước**, server tự tra |
| Trùng yêu cầu | Có unique một phần `(xe, SĐT, giờ nhận)` cho yêu cầu đang chờ → gửi lại bị chặn. Web có nhánh `duplicate` riêng, **không phải lỗi đỏ** |
| Khách bị chặn | `assertNotBlocked` — shop đã chặn khách thì từ chối ngay |
| Thuê dài hạn | **KHÔNG gửi** `pickupAt`/`returnAt` (gửi cũng bị bỏ qua). Gửi `pickupPreference` = `within_7_days` \| `specific_date` (+ `requestedPickupDate` khi chọn ngày cụ thể). Server tính khoảng linh hoạt |
| Xe có tài xế | `routeType` bắt buộc; `pickupAddress`; `destination` khi liên tỉnh |
| Giao xe tận nơi | `deliveryRequested` chỉ nhận khi chính sách giao nhận của xe đang bật; kèm `deliveryAddress` |

**Luồng shop duyệt:**

- Yêu cầu `pending_host_approval` **KHÔNG chiếm lịch** — nhiều khách được phép cùng hỏi một xe
  cùng khung giờ, ai được duyệt trước thì được xe. Chỉ `approved_by_host` mới giữ chỗ.
- Hạn phản hồi **60 phút**, đếm ngược tới `respondBy`. Đó là lời hứa với khách, không phải cơ chế
  dọn dữ liệu.
- Duyệt → tạo đơn + giữ chỗ lịch trong **cùng một transaction**; trạng thái đi thẳng sang
  `converted_to_booking` (nên `approved_by_host` **không có tab riêng**).
- Duyệt yêu cầu **dài hạn** bắt buộc gửi `scheduledPickupAt`; ngày trả do **server** tính bằng
  tháng lịch (ADR 0011) — client không cộng.
- Từ chối: 4 preset (`vehicleUnavailable`, `scheduleUnavailable`, `requirementsUnsuitable`,
  `other`) + lý do tự do, tối đa **1000 ký tự**.
- Tab inbox theo VIỆC PHẢI LÀM: `pending_host_approval` (**mặc định**) · `converted_to_booking` ·
  `rejected_by_host` · `cancelled_by_customer` · `expired` · `all`. Giá trị `all` **không gửi lên
  server** — lớp gọi API dịch thành "không gửi `status`".

### 1.7 Chuyến của khách (BKG-15, 16)

- `CUSTOMER_TRIP_STAGE` gộp yêu cầu + đơn thành **7 chặng** khách hiểu được: `pending_approval` ·
  `ready` · `active` · `completed` · `cancelled` · `rejected` · `no_show`. Suy bằng
  `customerTripStage()` — `bookingStatus` ưu tiên hơn `requestStatus`.
- **Đường GHI duy nhất của khách là `POST /trips/:id/cancel`.** Phát sinh, hoàn cọc, đổi lịch đều
  thuộc luồng chủ xe. Mở thêm đường ghi cho khách = dựng máy trạng thái thứ hai chạy song song.
- Bằng chứng bàn giao cho khách là bề mặt **RIÊNG** (`/trips/:id/handover-evidence`), cố ý không
  dùng lại route tenant — route kia trả ghi chú nội bộ, tên người xác nhận, `fileId`, `rowVersion`.
- Khối tiền của khách (`CustomerTripFinanceDto`) có ngôn ngữ riêng: `rentalTotal`, `deliveryFee`,
  `finalTotal`, `depositDeducted`, `additionalDue`, `expectedRefund`, cờ `legacyPricing`.
- Đánh giá (BKG-16): chỉ khi `booking.status === completed`; đánh giá lần hai trả **409**.
  Phần **hiển thị** đánh giá trên trang xe **đã có sẵn** ở `ListingDetailScreen.tsx` (`Reviews`).

---

## 2. Ranh giới

### 2.1 Kéo theo BẮT BUỘC (không có thì module không chạy)

| Kéo theo | Lý do |
| --- | --- |
| **Vỏ Navigator B** (`15_MOBILE_DUAL_NAVIGATOR.md`) | 9/16 dòng route `/manage/...`; `apps/mobile/app/manage/` hiện **không tồn tại** |
| **FIN-05, FIN-06** | Cùng màn `/manage/bookings/[id]` với BKG-08/10. BKG-10 không chạy nếu chưa ghi thu tiền và thu/hoàn cọc |
| **Tách API vào `packages/api-client/src/features/`** | Hiện mới có `auth`, `catalog`, `marketplace`. Theo đúng khuôn đó, thêm: `booking-requests`, `bookings`, `handovers`, `settlement`, `payments`, `contracts`, `trips`, `reviews`, `drivers` |
| **Khoá i18n mới** | `bookings.json` gốc chung mới có **37 khoá** (so với `booking-requests.json` 263) — màn chi tiết đơn + biên bản bên web còn tiếng Việt thô. Phải tự viết khoá mới vào gốc chung, **cả vi lẫn en** |

### 2.2 KHÔNG làm

- ADM-05 (giám sát đơn toàn hệ thống) — màn khác, quyền khác, P3
- CAL-01/02 (lịch) — không port được, cần thiết kế màn dọc riêng
- SHP-06 (quản lý tài xế) — BKG-12 chỉ cần `GET /drivers/assignable`
- **Sửa backend** — nhiệm vụ này là client-only. Cần đụng API thì dừng lại hỏi.

---

## 3. Các phase

> P0 và P1 **độc lập nhau** → chạy song song được. Chỗ giao nhau đúng 3 file:
> `app/_layout.tsx`, `src/navigation/routes.ts`, `src/i18n/messages.ts`.

### P0 — Vỏ Navigator B

Không có màn nghiệp vụ nào. Làm trọn theo `15_MOBILE_DUAL_NAVIGATOR.md`:

1. `app/index.tsx`: đổi `<Redirect href="/explore" />` thành màn **Bootstrap** — đọc
   `XP_SHELL_SCOPE` → `useSessionGate()` → `resolveInitialScope()` → `router.replace()` → mới
   `hideAsync()`. **Timeout 2.5s bắt buộc**; quá hạn coi như `unreachable` và vào navigator Khách.
2. `packages/domain/src/app-scope.ts`: `resolveScopeCapability()`, `resolveInitialScope()`.
3. `app/manage/_layout.tsx`: `<Tabs>` riêng + `ScopeGuard` + header có switcher.
4. Switcher: bottom sheet ở Quản lý (góc trên phải) · thẻ trong tab Tài khoản ở Khách
   (**không thêm tab thứ 5** — tab bar không được đổi số mục theo vai).
5. Redux slice `shellScope` (`scope`, `lastRoute` theo scope) + `XP_SHELL_SCOPE` ở AsyncStorage
   (**chỉ chuỗi `"customer"`/`"manage"`** — không tenantId, không quyền, không token).
6. Deep link: **set scope TRƯỚC khi điều hướng**. Nếu không, `ScopeGuard` đá ngược ngay khung hình
   đầu và triệu chứng là "link mở ra rồi tự đóng" — rất khó lần.
7. Refetch `/auth/me` khi `AppState` → `active` (hiện chưa có).
8. Logout reset scope về `customer` + xoá `XP_SHELL_SCOPE`.
9. `routes.ts`: thêm namespace `manage`.

**Xong khi:** chủ shop mở app vào thẳng `/manage`; khách thuần không thấy gì đổi; mất quyền giữa
phiên thì bị đưa về khu khách kèm toast, **không bị đăng xuất**.

### P1 — Khách: đặt xe → theo dõi → đánh giá · BKG-01, 15, 16 (+ MKT-06)

Không cần P0.

| Việc | Ghi chú thi công |
| --- | --- |
| Báo giá server | `POST /public/listings/:id/quote` — thay preview cục bộ ở `ListingDetailScreen.tsx:158`. Preview giữ cho lúc chưa chọn thời gian, nhưng số **chốt** phải là của server |
| Sheet chọn thời gian | `GET /public/booking-requests/busy-days` tô ngày bận (`fullyBusy` + `periods`); cửa sổ tra cứu bị **kẹp trần** phía server — đọc `from`/`to` trong kết quả, đừng giả định |
| Wizard | `trip` → (`otp`) → `review` → `done`. Dùng lại `src/features/phone-verification/` (đã dựng sẵn, **chưa màn nào dùng**) |
| Bỏ qua OTP | User đang đăng nhập có `phone` trùng và `phoneVerified` → nhảy thẳng `review` |
| Gửi | `POST /public/booking-requests` với **`client: 'native'` + `device`**; có `session` thì nạp phiên (mục 1.1) |
| Trùng yêu cầu | Nhánh `duplicate` riêng, không phải lỗi đỏ |
| Dài hạn | Không gửi `pickupAt`/`returnAt`; gửi `pickupPreference` (+`requestedPickupDate`) |
| Tab Chuyến | Thay màn rỗng ở `app/(tabs)/trips.tsx`. Lọc theo `filter`, phân trang server-side, `CustomerTripCountsDto` cho huy hiệu |
| Chi tiết chuyến | Khối tiền theo `CustomerTripFinanceDto`; `legacyPricing` thì hiện cảnh báo dữ liệu cũ |
| Bằng chứng bàn giao | `/trips/:id/handover-evidence`; ảnh qua `.../photos/:slot/download` |
| Huỷ chuyến | `POST /trips/:id/cancel` — **đường ghi duy nhất** |
| Đánh giá | `POST /reviews`, chỉ khi chặng `completed`; đã đánh giá rồi → 409, hiện đánh giá cũ |

### P2 — Hộp thư yêu cầu · BKG-02, 03, 04, 05

Cần P0. Quyền: `booking_requests.view` (xem) · `booking_requests.approve` (duyệt/từ chối).

- Danh sách theo tab (mục 1.6), huy hiệu số chờ, đếm ngược `respondBy`, kéo-để-làm-mới.
- Bộ lọc: `q`, `serviceType`, `status`, `vehicleId`, `branchId` — phân trang server-side.
- Duyệt: sheet xác nhận → tạo đơn + giữ chỗ lịch (một transaction) → màn thành công có lối đi
  thẳng sang đơn vừa tạo.
- Duyệt dài hạn: sheet riêng, bắt buộc chọn `scheduledPickupAt`; hiện ngày trả **server tính**.
- Từ chối: 4 preset + ô lý do (≤1000 ký tự).
- Thiếu quyền → **ẩn** nút duyệt/từ chối, không disable.

### P3 — Đơn thuê · BKG-07, 08, 12, 13

Cần P0. Quyền: `bookings.view`, `bookings.update`, `handovers.view`.

- Danh sách: lọc `q`/`status`/`vehicleId`/`branchId`/khoảng ngày (`returnFrom`/`returnTo`), `sort`,
  phân trang server-side. Thẻ hiện `debtAmount` đọc thẳng từ DTO.
- Chi tiết: khối thông tin · khối tiền · **Diễn biến chuyến đi** · thanh hành động dính đáy màn.
- Thanh hành động: **đúng một CTA chính** suy từ ngữ cảnh bàn giao (mục 1.4). Thao tác phụ bày
  thẳng, không giấu sau menu ba chấm — đều là việc thường ngày ở quầy.
- Quyết định trạng thái: chỉ **huỷ đơn** + **khách không đến** (chặn trước mốc `noShowAllowedFrom`
  — đừng bày ra một nút chắc chắn nhận 409).
- BKG-12 gán tài xế: `GET /drivers/assignable` theo cửa sổ `{pickupAt, returnAt, excludeBookingId}`
  → `PATCH /bookings/:id/driver` (`driverId: null` để gỡ).
- BKG-13 phí giao nhận: `PATCH /bookings/:id/delivery-fee`, đặt **cạnh chính con số nó sửa** trong
  khối chi phí; `note` là ghi chú **nội bộ**, chỉ vào audit, không hiện cho khách. Số bản đồ là
  **ước lượng**, chủ xe vẫn chốt phí (ADR 0018).

### P4 — Biên bản giao/nhận · BKG-09

Cần P3. Quyền: `handovers.view` / `.manage` / `.confirm` / `.view_files`;
`vehicles.odometer.correct` (+ `.decrease`).

**Phase rủi ro cao nhất, và là chỗ duy nhất native ăn đứt web.** Làm riêng, không trộn.

- Camera native + chọn từ thư viện; nén trước khi upload.
- 3 bước presign → PUT R2 → attach (mục 1.5). **Hàng đợi offline**: chụp ở bãi xe thường mất sóng;
  ảnh nằm chờ, biên bản vẫn xác nhận được (ảnh là tuỳ chọn).
- Luồng nhanh: xác nhận trong ~2 chạm. Ảnh gắn bổ sung **sau khi xác nhận** vẫn được.
- Ô số KM: `null` ≠ 0; cảnh báo KM bất thường + ô tích `suspiciousAcknowledged`.
- Xăng theo **nấc kim**; xe thuần điện đổi sang % pin.
- `rowVersion` mọi lần lưu/xác nhận; 409 thì tải lại và nói rõ chuyện gì vừa xảy ra.
- Hàng đợi thiếu KM trả: `GET /handovers/missing-odometer`.

### P5 — Quyết toán & tiền của đơn · BKG-10, 11 + FIN-05, FIN-06

Cần P3. Quyền: `payments.record` (ghi) · `payments.void` (huỷ/điều chỉnh) · `finance.view`.

- `GET /bookings/:id/settlement` trả sẵn: `depositRequired` (theo cấu hình, **chưa chắc đã thu**)
  vs `depositReceived` (thật), `surcharges[]`, `surchargeTotal`,
  `proposedRefund = max(cọc đã thu − phụ phí, 0)`, `additionalDue = max(phụ phí − cọc đã thu, 0)`,
  `depositStatus`, `refund`, `overtime`.
- **Gợi ý phí quá giờ** (`OvertimeSuggestionDto`): `available`, `lateMinutes`, `chargedHours`,
  `feePerHour`, `amount`, `formula` — hiện `formula` để người dùng thấy vì sao ra con số đó.
  `available: false` thì **không bịa** số.
- Phụ phí: `category` (**không có danh mục nhiên liệu**), `amount` (string, không âm), `reason`
  **bắt buộc** — đây là khoản trừ vào tiền của khách. Gỡ phụ phí cũng bắt buộc lý do.
- Hoàn cọc: `POST .../settlement/refund`; điều chỉnh `PATCH` cần `payments.void` + `rowVersion`.
- FIN-05/06: `POST /bookings/:id/payments` (thu tiền thuê / thu cọc), `GET` lịch sử,
  `POST /payments/:id/void`. **Cọc không cộng vào "đã trả"** — nó là tài sản giữ hộ.

### P6 — Tạo đơn tay tại quầy · BKG-06

Cần P3. Quyền: `bookings.create`.

Wizard tạo mới: chọn xe → khung giờ (kiểm chéo lịch bận) → khách → giá (`baseAmount`,
`deliveryFee`, `discountAmount`, `depositAmount`) → tạo. Nguồn nghiệp vụ: `StaffBookingFlow.tsx`,
`StaffVehiclePicker.tsx` bên web.

Để cuối vì đây là màn **nhập liệu nhiều nhất** của module, và desktop vẫn nhanh hơn.

### P7 — Hợp đồng · BKG-14 ⛔ CHẶN

Xem mục 5. Không bắt đầu khi chưa có endpoint PDF.

---

## 4. Bảng endpoint đầy đủ

| Dòng | Endpoint | Quyền |
| --- | --- | --- |
| BKG-01 | `POST /public/booking-requests` · `POST /public/booking-requests/check-availability` · `GET /public/booking-requests/busy-days` · `POST /public/listings/:id/quote` | công khai |
| BKG-02 | `GET /booking-requests` · `GET /booking-requests/:id` | `booking_requests.view` |
| BKG-03/04 | `POST /booking-requests/:id/approve` | `booking_requests.approve` |
| BKG-05 | `POST /booking-requests/:id/reject` | `booking_requests.approve` |
| — | `POST /booking-requests/:id/conversation` (mở chat với khách) | `booking_requests.view` |
| BKG-06 | `POST /bookings` | `bookings.create` |
| BKG-07 | `GET /bookings` | `bookings.view` |
| BKG-08 | `GET /bookings/:id` · `PATCH /bookings/:id` · `POST /bookings/:id/transition` | `bookings.view` / `bookings.update` |
| BKG-09 | `GET /bookings/:id/handovers` · `POST .../:type/confirm` · `.../cancel` · `.../odometer` · `.../photos/presign` · `.../photos` · `DELETE .../photos/:slot` · `GET .../photos/:fileId/download` · `GET /handovers/missing-odometer` | `handovers.view` / `.manage` / `.confirm` / `.view_files` · `vehicles.odometer.correct` |
| BKG-10 | `GET /bookings/:id/settlement` · `POST\|PATCH /bookings/:id/settlement/refund` | `bookings.view` · `payments.record` / `payments.void` |
| BKG-11 | `POST /bookings/:id/surcharges` · `PATCH /bookings/:id/surcharges/:surchargeId` | `payments.record` |
| BKG-12 | `PATCH /bookings/:id/driver` · `GET /drivers/assignable` | `bookings.update` |
| BKG-13 | `PATCH /bookings/:id/delivery-fee` | `bookings.update` |
| BKG-14 | `POST\|GET /bookings/:id/contract` · `GET /contracts/:id` | `contracts.manage` / `bookings.view` |
| BKG-15 | `GET /trips` · `GET /trips/:id` · `POST /trips/:id/cancel` · `GET /trips/:id/handover-evidence` · `GET .../photos/:slot/download` | đăng nhập |
| BKG-16 | `POST /reviews` | đăng nhập |
| FIN-05/06 | `POST\|GET /bookings/:id/payments` · `POST /payments/:id/void` | `payments.record` / `payments.void` |

---

## 5. Chặn — dừng lại và hỏi

1. **BKG-14 chặn cứng.** Web chỉ in qua `Ctrl+P` bằng CSS print. `ContractDto` trả **dữ liệu có
   cấu trúc** (bên A/B, xe, kỳ thuê, giá, snapshot) — **không phải PDF**. Mobile không có gì để in.
   → Cần endpoint xuất PDF phía server. **Không tự dựng bộ render PDF trong app.**
   Chưa có thì làm P0→P6, báo lại, đừng chế giải pháp thay thế.
2. **Multi-shop** (doc 15 §4.2). `AuthService.me()` dùng `findFirst` → chỉ trả **một** tenant.
   Chưa có câu trả lời thì code theo tenant đơn + ghi giới hạn vào docblock. **Không tự thêm field
   vào `MeDto`.**
3. **COM-07 push chưa có gì cả hai đầu.** Hộp thư yêu cầu (P2) trên điện thoại mà không có push =
   cái điện thoại phải nhớ mở. Không chặn code, nhưng chặn **giá trị** — nêu lại khi bắt đầu P2.
4. **eSMS**: OTP đang chạy provider mock. P1 demo được; khách thật thì không.

---

## 6. Ràng buộc & định nghĩa "xong"

### 6.1 Cấm

- ❌ `import next/*`, `antd`, DOM API, CSS vào `packages/api-client` / `packages/domain`
- ❌ String literal trần cho status — `BOOKING_STATUS.ACTIVE`, không `'active'` (ADR 0005)
- ❌ Tự tính lại tiền ở client (mục 1.3)
- ❌ Viết lại bất kỳ hàm nào ở bảng mục 1.2
- ❌ Gửi `tenant_id` từ client — backend lấy từ membership
- ❌ `number` cho tiền — string trong JSON
- ❌ Nhân `số tháng × 30` — dùng `addCalendarMonthsVn` / `longTermPackages` (ADR 0011)
- ❌ Hiện `discountPercent` của tự lái khi khách đang chọn gói dài hạn (ADR 0011)
- ❌ Chuỗi giao diện viết thẳng trong component — `t()` + `packages/domain/messages/{vi,en}/`
- ❌ Token ở `AsyncStorage` (ADR 0017)
- ❌ Màn tự xử lý 401 — `SessionBoundary` lo. 403 hiện trạng thái lỗi của chính màn, **không đá về
  login**
- ❌ Disable nút khi thiếu quyền — **ẩn**. Một nút xám không giải thích được vì sao nó xám

### 6.2 Bắt buộc

- ✅ Redux = UI state · TanStack Query = server data · query key từ `queryKeys` dùng chung
- ✅ Mọi route qua `src/navigation/routes.ts`
- ✅ Đủ trạng thái loading / rỗng / lỗi cho **mọi** màn; list lớn → phân trang server-side
- ✅ `rowVersion` ở mọi chỗ có (biên bản, hoàn cọc); 409 phải nói được chuyện gì vừa xảy ra

### 6.3 Xong một phase nghĩa là

1. Chạy thật trên thiết bị/emulator với `SEED_MODE=demo` — **không phải mock**
2. Đủ chữ cả `vi` và `en`; `pnpm --filter @xeprime/web i18n:check` xanh
3. Có test cho phần logic (điều kiện chuyển trạng thái, gói dài hạn, quyền, huỷ chuyến) — theo
   khuôn `apps/mobile/src/features/auth/`
4. Verify theo skill `verify-changes` — **chỉ phần vừa sửa**, không quét cả workspace
5. Tự review bằng agent `reviewer`
6. Cập nhật `docs/completion-roadmap.md` + cột `Mobile Status` trong `Mobile Tracking`

### 6.4 Báo cáo

Sau **mỗi phase**: dòng tracking nào xong · file thêm/sửa · chỗ nào **cố ý làm khác web** và vì
sao · chỗ nào bị chặn. Không gộp báo cáo cuối cho cả 16 dòng.

---

## 7. Tổng kết

Xong module: **31/97 dòng** (16 BKG + FIN-05/06 + vỏ navigator + MKT-06).
App đi từ "xem xe được" thành **vận hành trọn vòng đời một chuyến thuê**: khách đặt → shop duyệt →
giao xe → nhận xe → quyết toán → khách đánh giá.
