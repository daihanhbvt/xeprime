# ADR 0047 — Đơn giản hoá trạng thái đơn thuê & điều hướng "Đơn thuê"

Ngày: 23/09/2026 · Trạng thái: Accepted · Ghi đè: **0005 điều `booking.status`** (một phần) · Kích hoạt bởi: 0044 · Liên quan: 0006, 0012, 0031, 0045

## Bối cảnh

Ba màn dưới `/manage` — "Yêu cầu đặt xe", "Chờ giao xe" (mới), "Tất cả đơn thuê" — chồng lấn ý nghĩa trạng thái tới mức nhân viên vận hành không phân biệt được đơn nào **cần xử lý**, đơn nào **chờ khách thanh toán**, đơn nào **chờ giao xe**, và view **tất cả**. Ba bằng chứng cụ thể, xác minh trực tiếp trên code trước khi sửa:

1. **"Yêu cầu đặt xe"** có 6 tab nhưng `awaiting_hold` — đúng nhóm "chờ khách thanh toán" — không có tab riêng, chỉ ẩn trong tổng "Tất cả". Header "Chờ duyệt/Hoàn thành" đọc đúng cùng `statusCounts` với badge tab — trùng lặp 100%.
2. **"Chờ giao xe"** đã LÀ một preset lọc sẵn theo nhóm việc, nhưng vẫn còn ô lọc + cột trạng thái hiện "Đã giữ xe"/"Đã xác nhận" — hai giá trị của cùng một khái niệm mơ hồ (`reserved`/`confirmed`).
3. **`confirmed`** chưa từng được bất kỳ luồng sản phẩm THẬT nào để lại ở trạng thái nghỉ — nó chỉ là một bước kỹ thuật thoáng qua trong CÙNG một transaction xác nhận bàn giao (`reserved → confirmed → active`, ghi rồi ghi đè ngay). Chính code trước đợt này (chú giải lịch web lẫn mobile) đã tự nhận xét điều đó. Không có CHECK constraint nào ở DB canh `bookings.status`, dù văn bản migration gốc tuyên bố "ADR 0005: DB canh bằng CHECK".

ADR 0044 (22/09/2026) là nguyên nhân trực tiếp khiến `confirmed` thành thừa: cách duyệt-rồi-giữ-chỗ mới khiến bước "xác nhận đơn" không còn ý nghĩa độc lập — duyệt yêu cầu đã CHÍNH LÀ xác nhận.

## Quyết định

### 1. Mô hình trạng thái đơn thuê đích: 5 giá trị

`reserved` ("Chờ giao xe") · `active` ("Đang thuê") · `completed` ("Hoàn thành") · `cancelled` ("Đã hủy") · `no_show` ("Khách không đến").

`confirmed` **giữ lại trong `packages/types` dưới dạng `@deprecated`**, không xoá khỏi enum: `apps/mobile` (phụ thuộc workspace, không phải bản build tách riêng) còn tham chiếu nó ở test (`booking-rules.test.ts`) và sản xuất (`calendar-tone.ts`), và xoá hẳn sẽ làm vỡ biên dịch mobile ngay lập tức dù không sửa file mobile nào — vi phạm đúng điều phạm vi đợt này loại trừ. Tiêu chí xoá hẳn: khi `apps/mobile` không còn tham chiếu `BOOKING_STATUS.CONFIRMED` ở bất kỳ đâu (việc của đội mobile).

`BOOKING_STATUS_TRANSITIONS[RESERVED]` thêm cạnh trực tiếp `→ ACTIVE` — trước đây cố ý không có, để chặn endpoint chuyển trạng thái công khai nhảy thẳng `reserved → active` mà bỏ qua biên bản bàn giao thật (đường vòng qua `confirmed` là cơ chế chặn đó). Cạnh trực tiếp an toàn ngay khi điều 2 dưới đây có hiệu lực — xem lý do ở điều 2. `BOOKING_STATUS_TRANSITIONS[CONFIRMED]` giữ nguyên cạnh đi ra (không dùng tới trong luồng mới) để một hàng dữ liệu cũ không rơi vào ngõ cụt.

Thêm export `BOOKING_STATUS_SELECTABLE_VALUES` (5 giá trị, loại `CONFIRMED`) — nguồn duy nhất cho mọi ô lọc UI.

### 2. Endpoint chuyển trạng thái công khai chỉ còn hai quyết định bấm tay

`TransitionBookingDto.status` khoá còn `@IsIn([CANCELLED, NO_SHOW])`. Đây là điểm chốt khiến cạnh `RESERVED → ACTIVE` ở điều 1 an toàn: đường DUY NHẤT gọi `transitionWithinTx(..., to=ACTIVE)` sau khi khoá DTO là nội bộ — rà toàn bộ điểm gọi `transitionWithinTx` trong `apps/api/src`, chỉ có ba: endpoint công khai (giờ bị DTO chặn ở biên trước khi service chạy), `HandoversService` xác nhận biên bản giao xe (đúng chỗ đang đơn giản hoá), và khách tự huỷ chuyến (`customer-trips.service.ts`, chỉ nhắm `CANCELLED`). `active`/`completed` chỉ còn tới được từ một biên bản bàn giao thật; `confirmed` không còn ai "xác nhận đơn" thủ công — duyệt yêu cầu ở `Duyệt & giữ xe` CHÍNH LÀ sự xác nhận.

`HandoversService` (`handovers.service.ts`) đổi luồng hai bước (`reserved→confirmed` silent rồi `confirmed→active`) thành MỘT lệnh `reserved → active` trực tiếp trong cùng transaction xác nhận biên bản. Audit-log của `transitionWithinTx` ghi VÔ ĐIỀU KIỆN (`silent` chỉ chặn thông báo, không chặn audit) — gộp hai bước còn MỘT dòng audit là chính xác hơn, không mất sự kiện thật: `confirmed` chưa từng là một sự kiện độc lập trong đời thật.

`HANDOVER_ELIGIBLE_BOOKING_STATUS[PICKUP]` thu hẹp từ `[RESERVED, CONFIRMED]` còn `[RESERVED]`.

### 3. Migration dữ liệu — không đoán khi mâu thuẫn

`prisma/migrations/20260923150000_booking_status_simplification/`, chạy trên PostgreSQL thật, theo đúng thứ tự bắt buộc:

1. Với mỗi `bookings.status = 'confirmed'`: thiếu `actual_pickup_at` VÀ không có biên bản pickup đã xác nhận ⇒ `reserved`; có MỘT trong hai ⇒ `active` (backfill `actual_pickup_at` từ mốc biên bản nếu trống). Hai nguồn CÙNG có nhưng lệch nhau quá 5 phút ⇒ `RAISE EXCEPTION` nêu rõ id đơn, dừng cả migration.
2. Xác nhận bất biến: không còn hàng nào ở `confirmed` trước khi thêm CHECK.
3. `bookings_driver_schedule_excl` (EXCLUDE constraint lịch tài xế) bỏ `'confirmed'` khỏi danh sách trạng thái chiếm lịch.
4. Thêm `bookings_status_check` — CHECK constraint ĐẦU TIÊN cho cột này (5 giá trị) — đóng khoảng trống ADR 0005 để lại.

Đã chạy thật trên DB dev: 25 đơn `confirmed` tồn tại trước migration, cả 25 đều thiếu `actual_pickup_at` lẫn biên bản — toàn bộ chuyển sang `reserved` (40 = 15 + 25). Chạy lại `migrate deploy` lần hai: không pending migration nào — idempotent. Thử `UPDATE bookings SET status='confirmed'` sau migration: bị `bookings_status_check` chặn đúng như thiết kế.

`prisma/src/seed/shop-operations.ts` không còn sinh `confirmed`: nhánh cũ đổi thành một nhánh `reserved` thứ hai ở offset khác — giữ độ đa dạng demo, cho "Chờ giao xe" nhiều dữ liệu hơn để thấy badge mức khẩn. Seed chạy hai lần liên tiếp cho cùng số liệu — idempotent.

### 4. "Yêu cầu đặt xe" — còn 3 tab

**Cần xử lý** (`pending_host_approval`, `hold_paid`) · **Chờ khách thanh toán** (`awaiting_hold`, TAB MỚI) · **Đã đóng** (`rejected_by_host`, `cancelled_by_customer`, `expired`, `hold_expired`, `slot_taken`, `cancelled_by_host` — gộp MỘT tab nhưng mỗi thẻ vẫn tự hiện đúng kết cục của nó qua `StatusTag`, không đổi thành một nhãn chung). Bỏ tab "Đã tạo đơn" và "Tất cả" — ba tab trên đã phủ hết 11 trạng thái, và `converted_to_booking` là lịch sử của một ĐƠN THUÊ đang sống, tra cứu đúng chỗ là "Tất cả đơn thuê". Bỏ header "Chờ duyệt/Hoàn thành" — trùng số với badge tab.

**Đảo ngược quyết định 19/09/2026**: `awaiting_hold` từng CỐ Ý không có tab riêng ("một trạng thái không-hành-động-được chỉ thêm rối", lúc đó vẫn còn tab "Tất cả" để xem nó). Sau khi tab "Tất cả" bị xoá ở đợt này, nó sẽ không còn cách nào xem riêng nếu không có tab của chính nó — và người dùng hôm nay xác nhận cần phân biệt rõ đúng bốn việc (cần xử lý / chờ khách thanh toán / chờ giao xe / tất cả). Thẻ `awaitingHold.*` (tiền đã chuyển, hạn thanh toán, nút liên hệ/huỷ) không đổi — đã có sẵn từ trước, chỉ thiếu một tab để lọc riêng.

Sửa nội dung hộp thoại duyệt (nói sai ADR 0044: luôn tuyên bố "tạo đơn thuê" dù nhánh phổ biến hơn — có hold — chỉ giữ lịch, đơn ra đời khi khách thanh toán đủ). Khoá dùng chung web+mobile (`booking-requests.json` `approve.effect`) nên sửa một chỗ tự động đúng ở cả hai. Swagger `summary` của `POST /booking-requests/:id/approve` sửa tương tự.

### 5. "Chờ giao xe" — bỏ ô lọc + cột trạng thái, đổi nhãn bàn giao theo ngữ cảnh

Bỏ hẳn field lọc trạng thái và cột trạng thái đơn khi ở preset này — không chỉ thu hẹp lựa chọn như trước. Sau điều 1–2, `HANDOVER_ELIGIBLE_BOOKING_STATUS[PICKUP] = [RESERVED]` — một ô lọc/cột chỉ có đúng một giá trị khả dĩ là trang trí, không phải thông tin.

Cột "Bàn giao" đổi nhãn RIÊNG cho màn này (không dùng chung `Domain.handoverStatus.*` — khoá đó đúng hơn ở trang chi tiết biên bản): trống → "Chưa chuẩn bị", `draft` → "Đang chuẩn bị", `ready` → "Sẵn sàng xác nhận". Nút hành động "Giao xe" → "Xử lý giao xe" (nút chỉ mở trang chi tiết, không tự thực hiện bàn giao).

### 6. "Tất cả đơn thuê" — tiêu đề, ô lọc 5 trạng thái, nhãn `reserved`

Tiêu đề trang sửa từ "Đơn thuê" thành "Tất cả đơn thuê" — khớp đúng nhãn sidebar đang lệch với tiêu đề trang thật. Ô lọc trạng thái dùng `BOOKING_STATUS_SELECTABLE_VALUES` (5 giá trị) thay vì cả 6.

**Nhãn `bookingStatus.reserved` đổi TOÀN CỤC** từ "Đã giữ xe" sang "Chờ giao xe" (2 dòng JSON vi+en trong `packages/domain/messages/`) — dùng chung một khoá dịch ở mọi nơi (lịch, dashboard, sổ khách...) thay vì dựng cơ chế nhãn ngữ cảnh riêng cho hai màn. Đã xác minh trước khi đổi: màn khách hàng "Chuyến của tôi" dùng bộ nhãn RIÊNG (`customerTripStage`), không đọc khoá `bookingStatus.*` — khách hàng không thấy đổi, chỉ nhân viên/chủ xe thấy (web lẫn mobile, cùng nguồn message).

### 7. `approved_by_host` — kiểm tra rồi mới quyết, kết quả: GIỮ, không xoá

Rà toàn bộ writer trong `apps/api`/`apps/web`/`apps/worker`: **không có writer nào** (chỉ một nhánh đọc phòng thủ trong `customer-trips.service.ts` cho dữ liệu cũ). `SELECT COUNT(*)` trên DB dev lẫn DB test: **0 hàng cả hai**.

Dù vậy **không xoá khỏi enum**: `apps/mobile/src/features/booking-requests/inbox-rules.test.ts` tham chiếu trực tiếp `BOOKING_REQUEST_STATUS.APPROVED_BY_HOST` — xoá sẽ vỡ biên dịch mobile, đúng loại rủi ro đã tránh ở điều 1 cho `confirmed`. Chỉ thêm docblock đánh dấu rõ CHẾT (0 writer, 0 hàng, xác nhận 23/09/2026), không dùng trong code mới.

### 8. `packages/domain/messages/{vi,en}/booking-requests.json` giữ khoá CŨ bên cạnh khoá MỚI

`apps/mobile/src/features/booking-requests/BookingRequestInboxScreen.tsx` có `RequestStats`/`StatusTabs` RIÊNG (không dùng chung `constants.ts` của web — ADR 0031), đọc trực tiếp `t('stats.pending')`, `t('stats.converted')`, `t('tabs.converted'|'rejected'|'cancelled'|'expired'|'all')` — những khoá này là literal type do next-intl suy ra TỪ CHÍNH cấu trúc JSON, nên xoá khoá (không chỉ đổi giá trị) là lỗi biên dịch TypeScript ở mobile, không phải một dòng test đỏ.

Quyết định: **JSON giữ cả khoá cũ lẫn khoá mới** cho tới khi mobile tự chuyển sang cấu trúc 3 tab và dọn phần của họ. `constants.ts` có docblock cảnh báo rõ lý do các khoá "không dùng" đó không được xoá.

## Hệ quả

- **Ba tab của "Yêu cầu đặt xe" trả lời đúng ba câu hỏi vận hành, không câu nào chồng lấn.** `awaiting_hold` lần đầu tiên có chỗ để xem riêng kể từ khi ADR 0044 sinh ra nó.
- **"Chờ giao xe" hết mơ hồ.** Không còn "Đã giữ xe"/"Đã xác nhận" cạnh nhau không rõ khác gì — cột status biến mất vì nó không còn mang thông tin.
- **`bookings.status` có CHECK constraint lần đầu tiên** — khoảng trống ADR 0005 để lại từ migration gốc nay đã đóng.
- **Một dòng audit cho một sự kiện thật**, thay vì hai dòng cho một bước kỹ thuật.
- **Không phá mobile**: typecheck (`tsc --noEmit`) sạch tuyệt đối sau toàn bộ thay đổi. Đúng 2 test mobile đỏ (dự đoán trước, xác nhận bằng chạy thật) — xem checklist bàn giao dưới.

## Checklist bàn giao cho `apps/mobile` (không tự sửa, chỉ báo cáo)

| File | Ảnh hưởng | Đã xác nhận |
|---|---|---|
| `apps/mobile/src/features/bookings/booking-rules.test.ts:81` | `isHandoverEligible(PICKUP, CONFIRMED)` kỳ vọng `true`, nay `false` (điều 2). Test đỏ, không phải lỗi biên dịch. | ✅ chạy thật, đúng 1 assertion sai |
| `apps/mobile/src/features/calendar/components/calendar-legend.test.tsx` | Assertion còn chữ "Đã giữ xe" — nhãn đã đổi thành "Chờ giao xe" (điều 6, khoá dùng chung). | ✅ chạy thật, đỏ |
| `apps/mobile/src/features/calendar/calendar-tone.ts` | Biên dịch bình thường — `CONFIRMED` vẫn là thành viên hợp lệ của enum (điều 1). | ✅ `tsc --noEmit` sạch |
| `packages/domain/messages/{vi,en}/domain.json` `bookingStatus.reserved` | Đổi chữ áp dụng tự động mọi màn mobile dùng nhãn này (lịch, thẻ đơn, dashboard...) — không cần sửa code. | — |
| `packages/domain/messages/vi/booking-requests.json` `approve.effect` | Sửa lợi tự động cho `ApproveRequestSheet.tsx` — cùng câu sai như web, nay đúng, không cần mobile làm gì. | — |
| `apps/mobile/src/features/booking-requests/*` | Cấu trúc tab RIÊNG (ADR 0031) — không vỡ gì, nhưng lệch với 3-tab mới của web cho tới khi mobile tự làm theo (không bắt buộc). | — |

**Không bị ảnh hưởng:** mobile chưa từng gửi `confirmed`/`active`/`completed` lên endpoint transition (chỉ `cancelled`/`no_show`) — khoá DTO ở điều 2 không đổi hành vi ghi của mobile.

## Phương án đã cân nhắc và bỏ

- **Xoá hẳn `BOOKING_STATUS.CONFIRMED` khỏi enum.** Vỡ biên dịch mobile ngay lập tức dù không sửa file mobile nào — tệ hơn cả việc không làm gì.
- **Xoá `BOOKING_REQUEST_STATUS.APPROVED_BY_HOST` vì 0 hàng.** Đúng về dữ liệu, sai về type surface: mobile tham chiếu trực tiếp constant này ở test.
- **Xoá luôn khoá `tabs.converted/rejected/cancelled/expired/all` và `stats.*` khỏi JSON dùng chung.** Phát hiện MUỘN (sau khi đã xoá) rằng mobile có `RequestStats`/`StatusTabs` riêng đọc đúng các khoá đó — next-intl suy kiểu TỪ cấu trúc JSON nên xoá khoá là lỗi biên dịch, không phải test đỏ. Khôi phục lại các khoá cũ (giữ nguyên giá trị) bên cạnh khoá mới.
- **Nhãn ngữ cảnh riêng cho `reserved`** (giữ "Đã giữ xe" ở màn khác, chỉ hiện "Chờ giao xe" ở hai màn đơn thuê). Cần dựng thêm cơ chế, và cùng một trạng thái hiện hai tên khác nhau tuỳ màn còn khó hiểu hơn cái đang sửa.
- **Giữ tab "Tất cả" cho `awaiting_hold` thay vì cho nó tab riêng.** Chính lý do ban đầu xoá tab "Tất cả" (ba tab đã phủ hết) mâu thuẫn với việc giữ nó chỉ để lộ một trạng thái.

## Điều kiện xem lại

- Khi `apps/mobile` không còn tham chiếu `BOOKING_STATUS.CONFIRMED` ở bất kỳ đâu: xoá khỏi `packages/types` enum, dọn `BOOKING_STATUS_TRANSITIONS[CONFIRMED]`/`BOOKING_STATUS_META[CONFIRMED]`.
- Khi `apps/mobile` chuyển "Yêu cầu đặt xe" sang cấu trúc 3 tab (không bắt buộc, tự nguyện): xoá khoá `tabs.converted/rejected/cancelled/expired/all` + `stats.*` khỏi `booking-requests.json`, xoá docblock cảnh báo ở `constants.ts`.
- Khi có bằng chứng DB `booking_requests.status = 'approved_by_host'` khác 0 ở bất kỳ môi trường nào: điều tra nguồn ghi mới trước khi coi nó là chết.
