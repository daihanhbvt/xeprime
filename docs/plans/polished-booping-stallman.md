# Đơn giản hoá trạng thái & điều hướng ba màn Đơn thuê

## Bối cảnh

Ba màn "Yêu cầu đặt xe", "Chờ giao xe" (vừa xây trong đúng working tree chưa commit này), và
"Tất cả đơn thuê" đang chồng lấn ý nghĩa trạng thái theo cách khiến nhân viên vận hành không
phân biệt được: đơn nào **cần xử lý**, đơn nào **chờ khách thanh toán/cọc**, đơn nào **chờ giao
xe**, và view **tất cả**. Ba bằng chứng cụ thể (đã xác minh trực tiếp trên code, không suy
đoán):

1. **"Yêu cầu đặt xe"**: 6 tab (`Cần xử lý/Đã tạo đơn/Đã từ chối/Khách đã huỷ/Quá hạn/Tất cả`)
   nhưng `awaiting_hold` — đúng nhóm "chờ khách thanh toán" mà bạn đang tìm — **không có tab
   riêng nào cả**, chỉ ẩn trong tổng "Tất cả" (11 = 4 hiện trong 5 tab đặt tên + 7 ẩn gồm cả
   `awaiting_hold`). Header "Chờ duyệt/Hoàn thành" đọc **đúng cùng một `statusCounts`** với
   badge tab — trùng lặp 100%, đã xác minh code.
2. **"Chờ giao xe"**: màn này đã LÀ một preset lọc sẵn theo nhóm việc, nhưng vẫn còn ô lọc
   trạng thái + cột trạng thái hiện "Đã giữ xe"/"Đã xác nhận" — hai giá trị của cùng một khái
   niệm mơ hồ (`reserved`/`confirmed`) khiến bạn không hiểu "lúc nào có status này".
3. **"Tất cả đơn thuê"**: filter đủ 6 trạng thái nhưng `confirmed` **chưa từng được** bất kỳ
   luồng sản phẩm thật nào để lại ở trạng thái nghỉ — nó chỉ là một bước kỹ thuật thoáng qua
   trong CÙNG một transaction xác nhận bàn giao (`reserved → confirmed → active`, ghi rồi ghi
   đè ngay, không ai đọc thấy chặng giữa). Chính code hiện tại (`CalendarScheduler.tsx`,
   `calendar-tone.ts` bên mobile) đã tự nhận xét điều này. Không có CHECK constraint nào ở DB
   canh `bookings.status` — một khoảng trống thật so với ý định ghi trong ADR 0005.

Mục tiêu: rút gọn còn đúng 5 trạng thái đơn thuê nghiệp vụ thật (`reserved · active ·
completed · cancelled · no_show`), tách "Yêu cầu đặt xe" thành 3 tab đúng ý nghĩa, và làm màn
"Chờ giao xe" + "Tất cả đơn thuê" hết mơ hồ — mà không phá vỡ dữ liệu cũ, không phải sửa
`apps/mobile`, và không mở rộng phạm vi ra ngoài ba màn này.

## Quyết định đã chốt (đã hỏi bạn)

- **Thêm tab "Chờ khách thanh toán" riêng cho `awaiting_hold`** — đảo ngược quyết định
  19/09/2026 ghi trong `apps/web/src/features/booking-requests/constants.ts:65-71`. Thẻ đã sẵn
  có số tiền đã chuyển + hạn thanh toán (`BookingRequestCard.tsx` khối `awaitingHold`), chỉ
  thiếu MỘT tab để lọc riêng — không phải xây lại từ đầu.
- **Đổi nhãn `bookingStatus.reserved` TOÀN CỤC** từ "Đã giữ xe" → "Chờ giao xe" (2 dòng JSON
  vi+en trong `packages/domain/messages/`, không dựng cơ chế nhãn ngữ cảnh riêng). Đã xác minh:
  màn khách hàng "Chuyến của tôi" dùng bộ nhãn RIÊNG (`customerTripStage`), không đọc khoá này
  — khách hàng không thấy đổi, chỉ nhân viên/chủ xe (web + mobile, cùng nguồn message) thấy.

---

## 1. Mô hình trạng thái đơn thuê đích

**File:** `packages/types/src/status/booking.ts`, `packages/types/src/status/handover.ts`

- Giữ `BOOKING_STATUS.CONFIRMED` trong enum (**không xoá**) — đánh dấu `@deprecated`: không còn
  writer nào tạo ra giá trị này sau migration, chỉ giữ lại để `apps/mobile` (workspace
  dependency, không phải bản build riêng) còn biên dịch được. Lý do không xoá hẳn: xoá sẽ làm
  vỡ biên dịch `apps/mobile` ngay lập tức dù không sửa file mobile nào — vi phạm đúng điều bạn
  yêu cầu tránh.
- `BOOKING_STATUS_TRANSITIONS`: đổi `RESERVED: [CONFIRMED, CANCELLED, NO_SHOW]` thành
  `RESERVED: [ACTIVE, CANCELLED, NO_SHOW]` — thêm cạnh trực tiếp `reserved → active`. Giữ
  nguyên `CONFIRMED: [ACTIVE, CANCELLED, NO_SHOW]` (không dùng tới, nhưng không để một hàng dữ
  liệu cũ rơi vào ngõ cụt).
- **Vì sao thêm cạnh trực tiếp này AN TOÀN bây giờ** (trước đây cố ý KHÔNG có, để chặn endpoint
  công khai nhảy thẳng `reserved → active` mà bỏ qua biên bản bàn giao thật — xem comment ở
  `handovers.service.ts:433-441`): một khi `TransitionBookingDto.status` (mục 2) chỉ còn nhận
  đúng 2 giá trị `cancelled`/`no_show`, đường DUY NHẤT gọi tới `transitionWithinTx(...,
  to=active)` là nội bộ, không qua client — đã rà toàn bộ `grep -rn "\.transitionWithinTx\("`
  trong `apps/api/src`, chỉ có 3 điểm gọi: endpoint công khai (giờ bị DTO chặn), luồng bàn giao
  (`handovers.service.ts` — chỗ ta đang đơn giản hoá), và tự-huỷ của khách
  (`customer-trips.service.ts:426`, chỉ nhắm `cancelled`). Không có điểm gọi thứ tư.
- `HANDOVER_ELIGIBLE_BOOKING_STATUS[PICKUP]` (`handover.ts:74`): thu hẹp từ `[RESERVED,
  CONFIRMED]` còn `[RESERVED]` — đúng sự thật sau khi bỏ `confirmed`, và chính điều này chứng
  minh CƠ HỌC (không chỉ gu thẩm mỹ) rằng ô lọc trạng thái ở "Chờ giao xe" là thừa: nó chỉ còn
  đúng MỘT giá trị khả dĩ.
- Thêm export mới `BOOKING_STATUS_SELECTABLE_VALUES` (5 giá trị, loại `CONFIRMED`) để mọi ô lọc
  UI dùng chung, tránh mỗi nơi tự `.filter(v => v !== CONFIRMED)`.

**File:** `apps/api/src/modules/bookings/dto/booking.dto.ts`

- `TransitionBookingDto.status`: khoá còn `@IsIn([BOOKING_STATUS.CANCELLED,
  BOOKING_STATUS.NO_SHOW])`, thu hẹp luôn `@ApiProperty({ enum: ... })` cho khớp Swagger. Đã
  xác minh mọi nơi gọi endpoint này (web: `BookingStatusTransitionDialog.tsx` đã tự định kiểu
  `BookingClosingTarget = CANCELLED | NO_SHOW`; mobile: `BookingDetailScreen.tsx` chỉ gọi 2 giá
  trị này) — khoá lại không phá ai đang dùng đúng.

**File:** `apps/api/src/modules/bookings/handovers/handovers.service.ts:429-469`

- Xoá đoạn hai bước (`reserved→confirmed` silent rồi `confirmed→active`), thay bằng MỘT lệnh
  `transitionWithinTx(tx, tenantId, bookingId, userId, BOOKING_STATUS.RESERVED,
  BOOKING_STATUS.ACTIVE, { actualPickupAt: ... })`. Không cần `silent: true` nữa vì chỉ còn một
  bước.
- **Đã xác minh audit không mất thông tin quan trọng**: `this.audit.record(...)` ở
  `bookings.service.ts:1128` ghi **vô điều kiện**; `if (!opts.silent)` ở dòng 1145 chỉ chặn
  THÔNG BÁO, không chặn audit. Hai bước hiện tại tạo 2 dòng audit
  (`reserved→confirmed`,`confirmed→active`); gộp còn 1 dòng (`reserved→active`) — không mất sự
  kiện thật nào, vì bước `confirmed` chưa từng là một sự kiện độc lập trong đời thật, chỉ là
  bước kỹ thuật của máy trạng thái cũ.

---

## 2. Migration DB (không reset production)

**File mới:** `prisma/migrations/<timestamp>_booking_status_simplification/migration.sql`
(theo đúng phong cách các migration gần đây: `DO $$ ... RAISE EXCEPTION` khi phát hiện dữ liệu
mâu thuẫn, `RAISE NOTICE` tổng kết cuối — xem `20260915120000_wallet_owner_unification` làm
mẫu).

Thứ tự BẮT BUỘC trong file (UPDATE dữ liệu phải chạy TRƯỚC khi thêm CHECK constraint, nếu
không hàng `confirmed` còn sót sẽ vi phạm CHECK ngay khi thêm):

1. Với mỗi `bookings.status = 'confirmed'`:
   - `actual_pickup_at IS NULL` **và** không có `vehicle_handovers` (`type='pickup'`,
     `status='confirmed'`) ứng với đơn đó → `UPDATE ... SET status = 'reserved'`.
   - `actual_pickup_at IS NOT NULL` **hoặc** có biên bản pickup đã xác nhận → `UPDATE ... SET
     status = 'active'` (bổ sung `actual_pickup_at` từ mốc biên bản nếu đang trống, theo đúng
     quy tắc `occurred_at ?? confirmed_at` đã có ở `handoverOccurredAt()`, `handover.ts:233`).
   - **Dữ liệu mâu thuẫn** (có cả `actual_pickup_at` lẫn biên bản đã xác nhận nhưng hai mốc lệch
     nhau quá một khoảng dung sai, ví dụ 5 phút) → `RAISE EXCEPTION` nêu rõ id đơn + hai giá trị
     lệch nhau, dừng migration — không đoán.
   - Ghi `RAISE NOTICE` tổng số đã chuyển sang mỗi trạng thái.
2. Kiểm tra bất biến: `IF EXISTS (SELECT 1 FROM bookings WHERE status='confirmed') THEN RAISE
   EXCEPTION` — chặn cứng trước khi thêm CHECK.
3. `ALTER TABLE bookings DROP CONSTRAINT bookings_driver_schedule_excl;` rồi thêm lại với
   `WHERE (... AND status IN ('reserved','active') AND ...)` (bỏ `'confirmed'` khỏi danh sách —
   an toàn vì bước 2 đã đảm bảo không còn hàng nào ở đó). `vehicle_occupancies` không cần sửa —
   exclusion của nó không lọc theo status.
4. `ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN
   ('reserved','active','completed','cancelled','no_show'));` — CHECK constraint ĐẦU TIÊN cho
   cột này (các bảng khác như `drivers`, `receipts` đã có mẫu tương tự trong migration gốc,
   riêng `bookings` thì thiếu — đóng đúng khoảng trống ADR 0005 để lại).
5. Viết idempotent (`DROP CONSTRAINT IF EXISTS` trước khi thêm lại) để chạy lại an toàn.

**File:** `prisma/src/seed/shop-operations.ts`

- Dòng ~309: thay nhánh `{status: CONFIRMED, from:4, to:7}` bằng một nhánh `RESERVED` thứ hai ở
  offset khác (giữ được độ đa dạng demo, còn cho màn "Chờ giao xe" nhiều dữ liệu hơn để xem
  urgency badge).
- Dòng ~1224: đổi `bookings.find(b => b.plan.status === CONFIRMED)` (dùng để gắn một
  `bookingRequest.status = converted_to_booking` demo) thành tìm theo `RESERVED`.

---

## 3. "Yêu cầu đặt xe" — còn 3 tab

**File:** `apps/web/src/features/booking-requests/constants.ts`

`BOOKING_REQUEST_TABS` đổi thành:
- **Cần duyệt**: `[pending_host_approval, hold_paid]` — giữ nguyên
  `BOOKING_REQUEST_NEEDS_ACTION_STATUSES` hiện có.
- **Chờ khách thanh toán**: `[awaiting_hold]` — tab mới. Thay comment 19/09/2026 giải thích lý
  do CŨ bằng comment mới nói rõ đây là đảo ngược có chủ đích, có ngày tháng hôm nay.
- **Đã đóng**: `[rejected_by_host, cancelled_by_customer, expired, hold_expired, slot_taken,
  cancelled_by_host]`. Đã xác minh **không cần sửa `BookingRequestCard.tsx`** — nó đã render
  `StatusTag` theo `BOOKING_REQUEST_STATUS_META` cho từng dòng bất kể đang ở tab nào, nên gộp 6
  trạng thái vào 1 tab KHÔNG làm mất nhãn/lý do riêng của từng kết cục.

Bỏ tab "Đã tạo đơn" (`converted_to_booking`) và "Tất cả". `converted_to_booking` vẫn còn trong
dữ liệu; xem lại qua "Tất cả đơn thuê" (đã có tìm kiếm) — bấm vào dòng đã chuyển đơn vẫn mở
thẳng chi tiết Booking (`BookingRequestsView.tsx:121-124`, không đổi).

**File:** `apps/web/src/features/booking-requests/components/BookingRequestsView.tsx:189-217`

- Xoá khối `headerStats` ("Chờ duyệt"/"Hoàn thành") — trùng số với badge tab.

**File:** `packages/domain/messages/{vi,en}/booking-requests.json`

- `approve.effect` (khoá dùng chung web+mobile — sửa 1 chỗ tự động đúng luôn ở app mobile,
  không phải sửa code mobile) đổi thành:
  `"Duyệt sẽ giữ lịch xe và chốt giá. Đơn thuê được tạo khi khách thanh toán đủ; chuyến không
  thu tiền giữ chỗ được tạo ngay."` — khớp đúng ADR 0044, không dùng chữ "cọc" (đúng quy tắc
  CLAUDE.md).
- Cập nhật `tabs.*` cho 3 tab mới; bỏ khoá `stats.*` không còn dùng.

---

## 4. "Chờ giao xe" — bỏ filter/cột trạng thái, đổi nhãn bàn giao theo ngữ cảnh

**File:** `apps/web/src/features/bookings/components/BookingsListView.tsx`

- Bỏ hẳn field `status` khỏi mảng `fields` khi `awaitingPickup === true` (hiện chỉ thu hẹp
  *lựa chọn*, vẫn hiện field — sửa để field biến mất luôn).

**File:** `apps/web/src/features/bookings/components/BookingTable.tsx`

- Bỏ `statusColumn` khỏi cột khi `awaitingPickup === true`.
- Nhãn cột "Bàn giao" đổi theo ngữ cảnh màn này (đã xác minh qua test
  `bookings-awaiting-pickup.spec.ts` — `pickupHandoverStatus` ở màn này chỉ có thể là
  `null | draft | ready`, không bao giờ `confirmed`/`canceled`):
  - trống (`null`): "Chưa lập biên bản" → **"Chưa chuẩn bị"**
  - `draft`: mới — **"Đang chuẩn bị"**
  - `ready`: "Chờ xác nhận" → **"Sẵn sàng xác nhận"**
- Nút hành động: "Giao xe" → **"Xử lý giao xe"** (nút chỉ mở trang chi tiết, không tự thực hiện
  bàn giao — tên cũ nói quá tay).
- Giữ nguyên phân loại Quá giờ/Hôm nay/Sắp tới và thứ tự ưu tiên — đã đúng, không đổi.

**File:** `packages/domain/messages/{vi,en}/bookings.json` — các khoá `awaitingPickup.*` tương
ứng ở trên.

---

## 5. "Tất cả đơn thuê" — tiêu đề, filter 5 trạng thái, nhãn `reserved`

**File:** `packages/domain/messages/{vi,en}/bookings.json`

- `list.title`: "Đơn thuê" → **"Tất cả đơn thuê"** (khớp đúng nhãn sidebar hiện tại, đang lệch
  với tiêu đề trang thật).

**File:** `apps/web/src/features/bookings/components/BookingsListView.tsx`

- Options của ô lọc trạng thái đổi từ `BOOKING_STATUS_VALUES` (6) sang
  `BOOKING_STATUS_SELECTABLE_VALUES` (5, mục 1) — "Đã giữ xe"/"Đã xác nhận" hai giá trị mơ hồ
  biến mất tự nhiên, chỉ còn "Chờ giao xe" (nhãn mới của `reserved`).

**File:** `packages/domain/messages/vi/domain.json`, `en/domain.json`

- `bookingStatus.reserved`: "Đã giữ xe" → **"Chờ giao xe"** (vi); en tương ứng → **"Awaiting
  pickup"** (khớp chữ đã dùng ở `bookings.json` `awaitingPickup.title`). Đây là thay đổi TOÀN
  CỤC theo quyết định đã chốt ở trên — chỉ 2 dòng JSON, không sửa logic nào khác.
- Cập nhật lại đoạn comment ở `packages/types/src/status/booking.ts:102-106` (lý do chọn "Đã
  giữ xe" cũ) để phản ánh lý do mới: nhãn giờ trả lời "việc tiếp theo là gì" thay vì "khoảnh
  khắc chiếm lịch nào".

Giữ nguyên tìm kiếm/chi nhánh/phân trang/sort server-side — không đổi.

---

## 6. `approved_by_host` (trạng thái yêu cầu legacy) — kiểm tra rồi mới quyết, không chặn phần còn lại

Đã rà toàn bộ writer (`apps/api`, `apps/web`, `apps/worker`, `apps/mobile`) — **không tìm thấy
writer nào**, chỉ còn một nhánh đọc phòng thủ ở `customer-trips.service.ts:1232` và vài fixture
test. Việc cần làm lúc triển khai (không phải lúc lập kế hoạch — cần truy DB thật):

```sql
SELECT COUNT(*) FROM booking_requests WHERE status = 'approved_by_host';
```

- **Bằng 0** (dự đoán, vì không còn writer): xoá `APPROVED_BY_HOST` khỏi
  `BOOKING_REQUEST_STATUS`, khỏi `BOOKING_REQUEST_STATUS_OCCUPYING`, xoá nhánh đọc phòng thủ ở
  `customer-trips.service.ts:1232`, sửa 2-3 fixture test còn nhắc tới nó.
- **Khác 0**: KHÔNG xoá — coi như `hold_paid`, giữ legacy, không hiện tab, để dành xử lý riêng
  sau.

Việc này độc lập, không chặn các mục 1-5.

---

## 7. Danh sách file theo tầng (tổng hợp)

| Tầng | File |
|---|---|
| types/domain | `packages/types/src/status/booking.ts`, `handover.ts`, `status.test.ts` |
| domain messages | `packages/domain/messages/{vi,en}/domain.json`, `bookings.json`, `booking-requests.json` |
| API | `apps/api/src/modules/bookings/dto/booking.dto.ts`, `handovers/handovers.service.ts` |
| web | `BookingsListView.tsx`, `BookingTable.tsx`, `booking-requests/constants.ts`,
`BookingRequestsView.tsx` |
| migration/seed | `prisma/migrations/<mới>/migration.sql`, `prisma/src/seed/shop-operations.ts` |
| docs | `docs/decisions/0047-booking-status-simplification.md` (mới), `docs/decisions/README.md`,
`docs/CODEMAP.md` |

---

## 8. Test cần sửa (chính xác theo file, không đoán)

**Phải sửa vì premise thay đổi:**
- `apps/api/test/bookings-awaiting-pickup.spec.ts` — bỏ nhánh test `confirmed` cùng tồn tại với
  `reserved`; mọi chỗ dùng `bookings.transition(...,{status:CONFIRMED})` làm bước đệm trước
  `active` phải đổi sang gọi thật `handovers.confirm(...)` (giống cách
  `booking-handovers.spec.ts` đang làm); xoá test lọc `status=CONFIRMED` ở preset (không còn
  đúng với đời thật).
- `apps/api/test/booking-status-transition.spec.ts` — xoá khối `describe('Xác nhận đơn', ...)`
  (endpoint công khai không còn nhận `confirmed`); thêm test khẳng định endpoint từ chối
  `active`/`completed`/`confirmed` (400).
- `apps/api/test/booking-handovers.spec.ts` — helper `createBooking()` bỏ bước
  `transition(...,CONFIRMED)`; test hai-bước ở dòng ~892-933 đổi kỳ vọng audit trail còn
  **MỘT** dòng `[ACTIVE]` (không phải `[CONFIRMED,ACTIVE]`).
- `apps/api/test/booking-hold-lifecycle.spec.ts` — gộp 2 lệnh `transitionWithinTx` (qua
  `confirmed`) thành 1 lệnh thẳng `reserved→active`.
- `apps/api/test/vehicle-alerts.spec.ts` — bỏ dòng `transition(...,CONFIRMED)` thừa trong
  `makeMissingReturnKm()`.
- `packages/types/src/status/status.test.ts` — sửa test đường đi
  `reserved→confirmed→active→completed` thành `reserved→active→completed`; nếu mục 6 xoá
  `approved_by_host` thì bỏ luôn khỏi assertion liên quan.
- `apps/web/src/features/bookings/components/bookings-awaiting-pickup.test.tsx` — xoá test ô
  lọc trạng thái (premise sai); thêm test khẳng định KHÔNG còn ô lọc/cột trạng thái; cập nhật
  nhãn bàn giao mới ("Chưa chuẩn bị"/"Sẵn sàng xác nhận") và nút "Xử lý giao xe".
- Test tab booking-requests (file đang cover `BookingRequestsView`/`BOOKING_REQUEST_TABS`,
  xác định tên chính xác lúc code) — khẳng định đúng 3 tab, header stats không còn render.

**Không cần sửa** (đã xác minh premise không đổi): `booking-status-actions.test.tsx`,
`BookingDetailContent.test.tsx`, `booking-settlement.spec.ts`, `booking-write-guards.spec.ts`,
`customer-trips.spec.ts` (trừ dòng `APPROVED_BY_HOST` nếu mục 6 xoá), `vehicle-summary.spec.ts`,
`customer-trip.test.ts`, `nav.test.ts` — chạy lại làm hồi quy, không cần viết lại.

---

## 9. ADR mới

`docs/decisions/0047-booking-status-simplification.md` — ADR mới (không phải phụ lục 0044/0045),
vì đây là quyết định ghi đè riêng điều `booking.status` của ADR 0005, tuy được kích hoạt bởi
ADR 0044 (cách duyệt-rồi-giữ-chỗ khiến `confirmed` thành bước thừa). Nội dung chính: mô hình 5
trạng thái đích; `confirmed` giữ lại trong shared type chỉ để mobile biên dịch, tiêu chí xoá hẳn
sau này (khi mobile không còn tham chiếu); cạnh `reserved→active` trực tiếp và lý do an toàn
(khoá DTO); endpoint công khai chỉ còn `cancelled`/`no_show`; quy tắc migration (không đoán khi
mâu thuẫn); 3 tab yêu cầu đặt xe (ghi rõ đảo ngược quyết định 19/09); nhãn `reserved` đổi toàn
cục; kết quả xử lý `approved_by_host`. Cập nhật `docs/decisions/README.md` (thêm dòng 0047,
đánh dấu 0005 "một phần bị ghi đè bởi 0047 — booking.status") và `docs/CODEMAP.md`.

---

## 10. Thứ tự triển khai

1. `packages/types` (booking.ts, handover.ts) — nền cho mọi thứ khác.
2. API: khoá DTO + đơn giản hoá `handovers.service.ts` + sửa test API liên quan → `pnpm
   --filter @xeprime/api test` xanh trước khi đụng web.
3. Migration + seed (làm song song bước 2, nhưng phải cùng release — khoá DTO phải đi TRƯỚC
   hoặc CÙNG lúc CHECK constraint, không bao giờ sau).
4. `pnpm run contract` (sinh lại OpenAPI + `api.generated.ts` — bắt buộc vì enum DTO đổi).
5. Web: 3 tab yêu cầu đặt xe, bỏ filter/cột ở Chờ giao xe, tiêu đề + filter Tất cả đơn thuê, sửa
   message JSON + test web liên quan.
6. ADR 0047 + cập nhật CODEMAP + README ADR.
7. Xác minh phạm vi đã sửa (mục 11 dưới) — không quét toàn workspace.
8. Gửi checklist mobile (mục 12) cho đội mobile — không sửa file mobile.

---

## 11. Xác minh

- `pnpm --filter @xeprime/types test` — máy trạng thái, transitions, status.test.ts.
- `pnpm --filter @xeprime/api test` — toàn bộ spec liệt kê ở mục 8, cộng `booking-requests-inbox.spec.ts`,
  `bookings-awaiting-pickup.spec.ts` mở rộng.
- `pnpm --filter @xeprime/web test` — component test bookings/booking-requests liên quan.
- `pnpm --filter @xeprime/web i18n:check` — parity vi/en cho các khoá vừa sửa/thêm.
- `pnpm --filter @xeprime/api lint`, `pnpm --filter @xeprime/web lint`, typecheck từng package
  đã sửa (theo skill `verify-changes`, không sweep cả workspace).
- Kiểm tra migration thủ công trên DB dev: chạy migration, xác nhận 0 hàng `confirmed` còn lại,
  thử insert `confirmed` để xác nhận CHECK constraint chặn đúng.
- Chạy `pnpm db:seed` (mode demo) kiểm tra không còn sinh booking `confirmed`.

---

## 12. Checklist bàn giao cho dev mobile (không tự sửa, chỉ báo cáo)

| File | Ảnh hưởng |
|---|---|
| `apps/mobile/src/features/calendar/calendar-tone.ts:183` | Biên dịch bình thường, không cần sửa gì — `CONFIRMED` vẫn tồn tại trong shared type (giữ deprecated). |
| `apps/mobile/src/features/bookings/booking-rules.test.ts:81` | **Test sẽ đỏ** (không phải lỗi biên dịch): `isHandoverEligible(PICKUP, CONFIRMED)` hiện kỳ vọng `true`, sau khi `HANDOVER_ELIGIBLE_BOOKING_STATUS[PICKUP]` thu hẹp còn `[RESERVED]` sẽ thành `false`. Cần đội mobile sửa/xoá assertion này. Dòng 27, 87 không bị ảnh hưởng. |
| `packages/domain/messages/{vi,en}/domain.json` — `bookingStatus.reserved` | Đổi chữ áp dụng tự động cho mọi màn mobile dùng nhãn này (lịch, thẻ đơn, dashboard...) — không cần sửa code, chỉ cần soát mắt một lượt (chữ tiếng Việt dài hơn 1 ký tự, rủi ro layout gần như không có). |
| `packages/domain/messages/vi/booking-requests.json` — `approve.effect` | Sửa TỰ ĐỘNG áp dụng đúng cho `ApproveRequestSheet.tsx` bên mobile (đang hiện y hệt câu sai của web) — là một fix có lợi đi kèm, không cần đội mobile làm gì. |
| `apps/mobile/src/features/booking-requests/*` (tab riêng, không dùng chung `constants.ts` của web theo ADR 0031) | Không vỡ gì, nhưng mobile sẽ LỆCH với cấu trúc 3-tab mới của web cho tới khi đội mobile tự làm theo (không bắt buộc, không có trong phạm vi đợt này). |
| `apps/mobile/src/features/booking-requests/inbox-rules.test.ts:31` | Chỉ ảnh hưởng NẾU mục 6 xoá `APPROVED_BY_HOST` — nếu vậy, fixture này lỗi biên dịch. |

**Không bị ảnh hưởng:** mobile chưa từng gửi `confirmed`/`active`/`completed` lên endpoint
transition (chỉ `cancelled`/`no_show`) — khoá DTO không đổi hành vi ghi của mobile.

---

## 13. Rủi ro / điều chưa chắc chắn còn lại

- Migration cần chạy thật trên DB dev để xác nhận không có hàng nào rơi vào nhánh "mâu thuẫn,
  dừng lại" — chưa kiểm được trước khi có DB thật trong tay lúc code.
- `approved_by_host` — số liệu thật (0 hay khác 0) chỉ biết được lúc chạy `SELECT COUNT(*)` khi
  triển khai; kế hoạch đã có nhánh rẽ rõ ràng cho cả hai trường hợp.
- Đội mobile cần chủ động sửa 1 dòng test của họ (`booking-rules.test.ts:81`) — không tự động
  xanh lại, cần báo trước khi merge để CI mobile không đỏ bất ngờ.
