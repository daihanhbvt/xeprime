# ADR 0011 — Thuê dài hạn: gói cố định theo tháng lịch + nguyện vọng ngày nhận

Ngày: 18/08/2026 · Trạng thái: Accepted · Thay thế mô hình dài hạn của đợt 17/08

## Bối cảnh

Dịch vụ **Thuê dài hạn** ra đời ngày 17/08 với mô hình "thuê theo ngày nhưng dài": khách tự chọn
khoảng nhận–trả (sàn 7 ngày), giá = `monthly_price ÷ 30 × số ngày`, mốc ưu đãi cấu hình theo
NGÀY, và UI quảng cáo mức "tiết kiệm" bằng cách so đơn giá quy đổi với giá thuê tự lái theo ngày.

Bốn vấn đề, xếp theo mức nghiêm trọng:

1. **Quảng cáo một khuyến mãi không tồn tại.** Badge `-38%` và dòng "Tiết kiệm 67.500.000₫ so
   với thuê theo ngày" so hai DỊCH VỤ KHÁC NHAU. Chênh lệch giữa giá dài hạn và giá tự lái là
   *cách định giá*, không phải ưu đãi khách được hưởng — khách thuê dài hạn chưa bao giờ có
   phương án trả giá tự lái để mà "tiết kiệm". Cùng lúc, panel xe vẫn trưng `585.000đ/ngày` và
   badge `-10%` của **khuyến mãi tự lái** trong khi khách đang mua gói dài hạn.
2. **`× 30` không phải một tháng.** Gói "3 tháng" ký ngày 30/11 kết thúc 28/02 hay 01/03? Với
   quy ước 90 ngày thì ra 28/02; với tháng lịch thì ra 28/02 (kẹp) — nhưng gói 1 tháng ký 31/01
   thì `× 30` cho 02/03 còn tháng lịch cho 28/02. Hợp đồng thuê xe dài hạn nói bằng THÁNG, nên
   độ dài phải là tháng lịch.
3. **Thời lượng tuỳ ý làm giá không giải thích được.** Thuê 47 ngày ăn mốc ưu đãi nào? Bảng giá
   trở thành hàm liên tục theo ngày trong khi sản phẩm là gói cam kết.
4. **Nguyện vọng bị ép thành lịch.** Khách gửi yêu cầu 3 tháng thường chưa biết chính xác mấy
   giờ nhận xe; bắt chọn giờ ở bước gửi tạo ra một lịch giả mà cả hai bên đều hiểu là "để đó",
   rồi gian hàng lại phải sửa.

## Quyết định

### 1. Sáu gói cố định, không có thời lượng tuỳ ý

`LONG_TERM_PACKAGE_MONTHS = [1, 2, 3, 6, 9, 12]` ở `packages/types/src/long-term.ts` là nguồn
DUY NHẤT — DTO validate bằng nó, form Select đổ từ nó, CHECK constraint liệt kê đúng bộ đó.
Không còn `LONG_TERM_MIN_DAYS`, không còn trạng thái "Tuỳ chỉnh".

### 2. Độ dài đơn = tháng lịch, tính ở SERVER

`addCalendarMonthsVn(pickupAt, months)`: cộng tháng theo giờ Việt Nam, giữ nguyên giờ-phút, kẹp
về ngày cuối tháng khi tháng đích ngắn hơn (31/01 + 1 tháng → 28 hoặc 29/02).

**Client không bao giờ gửi ngày trả cho thuê dài hạn.** `CreateBookingRequestDto` và
`CreateBookingDto` bỏ qua `returnAt` khi `serviceType = long_term`; `BookingsService` tự suy.
Sửa `returnAt` trên một đơn dài hạn bị từ chối — đổi giờ nhận thì giờ trả dịch theo.

### 3. Khách nêu NGUYỆN VỌNG, gian hàng chốt LỊCH

`booking_requests` thêm `long_term_package_months`, `pickup_preference`
(`within_7_days` | `specific_date`), `requested_pickup_date`, `pickup_window_start_date`,
`pickup_window_end_date`; `pickup_at`/`return_at` thành **nullable**.

- `within_7_days`: server tính khoảng từ THỜI ĐIỂM NHẬN yêu cầu (ngày mai → hết ngày thứ 7).
  Client không gửi khoảng và không giả mạo được.
- `specific_date`: chỉ thu NGÀY; giờ do gian hàng chốt.
- `POST /booking-requests/:id/approve` nhận body `{ scheduledPickupAt, longTermPackageMonths? }`.
  Server kiểm ngày chốt có ĐÚNG nguyện vọng không, rồi tính ngày trả từ gói. Chốt lệch nguyện
  vọng → 400 kèm ngày khách yêu cầu; **không** có đường đổi ngày im lặng.
- Yêu cầu còn `pending_host_approval` KHÔNG chiếm lịch (giữ nguyên ADR 0006). Trùng lịch lúc
  duyệt → `23P01` → 409, yêu cầu **vẫn chờ duyệt**, hộp thoại giữ nguyên để chọn giờ khác.

CHECK constraint cưỡng chế phần dữ liệu: gói chỉ thuộc `[1,2,3,6,9,12]` và chỉ có nghĩa với
`long_term`; ngày cụ thể và khoảng linh hoạt LOẠI TRỪ nhau; dịch vụ khác vẫn bắt buộc đủ
`pickup_at`/`return_at`.

### 4. Giá gói — một công thức, một hàm

```text
basePackageAmount      = monthlyPrice × packageMonths
durationDiscountAmount = basePackageAmount × tier% / 100      (mốc CAO NHẤT gói đạt tới)
finalPackageAmount     = basePackageAmount − durationDiscountAmount
effectiveMonthlyAmount = finalPackageAmount ÷ packageMonths
```

`PricingService` tách hai hàm không dùng chung đường nào: `buildDailyQuote` (tự lái, có tài xế)
và `buildLongTermPackageQuote` (gói). Gọi nhầm dài hạn vào hàm ngày bị ném lỗi ngay.

Mốc ưu đãi **không cộng dồn**: mốc 1 tháng 5%, 3 tháng 15%, 6 tháng 20% ⇒ gói 2 tháng hưởng 5%,
gói 9 và 12 tháng hưởng 20%. Cấu hình bị chặn khi % GIẢM lúc thời hạn TĂNG.

Bảng chọn gói và breakdown của gói đang chọn gọi **cùng một** hàm `longTermAmounts`, nên giá trên
nút và giá trong báo giá không thể lệch. Frontend không nhân giá tháng với số tháng ở bất cứ đâu:
`GET /public/listings/:id` trả sẵn `longTermPackages` (đủ sáu gói, tiền do server tính).

### 5. Ba loại "giảm giá" tách bạch tuyệt đối

| Loại | Thuộc về | Hiển thị ở đâu |
| --- | --- | --- |
| `Vehicle.discountPercent` | CHỈ dịch vụ tự lái | Chỉ khi khách đang xem/đặt tự lái |
| `monthlyPrice` | Giá cơ sở dài hạn | "Giá dài hạn cơ sở X/tháng" — không phải khuyến mãi |
| Mốc ưu đãi cam kết thời hạn | Gói dài hạn | Dòng DUY NHẤT được gọi là ưu đãi trong breakdown gói |

Bị xoá khỏi luồng khách và luồng nhân viên: badge `-38%` suy từ giá ngày ↔ giá tháng, dòng
"Tiết kiệm X **so với thuê theo ngày**", và giá tự lái + badge `-10%` trong panel khi khách đang
chọn dài hạn.

Vẫn GIỮ badge `-X%` trên từng thẻ gói, nhưng nó nay mang nghĩa khác hẳn: đó là **mốc ưu đãi cam
kết thời hạn của chính gói đó** (server tính), không phải một con số suy từ giá thuê theo ngày.
Badge dùng nguyên component chung `DiscountTag` — màu và typography thuộc về common, màn này chỉ
định vị nó vào góc thẻ.

Bước "Chọn gói thuê" (`LongTermPackageStep`) trình bày: sáu thẻ gói (tên gói + badge % + dấu tích
khi chọn) → nguyện vọng nhận xe → **Tóm tắt lựa chọn** (giá thuê chưa ưu đãi · ưu đãi (X%) · tổng
giá trị gói thuê) → dải tiết kiệm → ba cam kết dịch vụ. Gói **1 tháng chọn sẵn** để mở ra là
đã có một mức giá thật để so, và bấm "Chọn ngày cụ thể" **mở luôn lịch** thay vì đẻ thêm một ô
nhập phải bấm lần nữa. Câu "tiết kiệm" duy nhất được phép so với
**giá gốc của chính gói**: *"Tiết kiệm 600.000₫ khi thuê 1 tháng so với giá gốc."*

Tiền cọc nói riêng trong ghi chú của tóm tắt (thu riêng, hoàn khi trả xe) — KHÔNG gộp vào "tổng
giá trị gói thuê", và cũng không tuyên bố gói đã bao gồm VAT/bảo hiểm/giao nhận: mỗi gian hàng tự
đặt chính sách, nói thay họ là hứa hẹn sai.

### 6. Mốc ưu đãi canonical theo THÁNG

`rental_policies.discount_tiers_json` đổi từ `{minDays}` sang `{minMonths}`. Form quản lý dùng
**Select** giới hạn đúng sáu gói (mốc đã dùng bị loại khỏi danh sách nên không trùng được), tối
đa 6 mốc, tăng dần, % không giảm.

## Chiến lược dữ liệu cũ

Nguyên tắc: **không làm tròn ngầm, không sửa snapshot giá lịch sử.**

| Dữ liệu | Xử lý |
| --- | --- |
| Yêu cầu/đơn dài hạn cũ | Gán gói CHỈ khi `return_at = pickup_at + N tháng lịch` đúng khít (giờ VN). Không khớp → gói NULL, giữ nguyên ngày cũ |
| Yêu cầu pending không khớp gói | Hợp lệ theo CHECK nhờ còn đủ lịch. Luồng duyệt bắt gian hàng **chọn gói** (`longTermPackageMonths` trong body), giữ nguyên giờ nhận khách đã chọn nếu không chốt lại |
| Mốc ưu đãi theo ngày | 30/60/90/180/270/360 → `minMonths` tương ứng. Mốc khác (7, 14, 45…) **giữ nguyên** trong jsonb kèm cờ `legacy: true`: máy giá bỏ qua, màn cấu hình cảnh báo, biến mất khi chủ xe lưu lại |
| `bookings.price_snapshot_json` | KHÔNG migrate. Type snapshot chấp nhận cả `minDays` lẫn `minMonths` |
| Đơn dài hạn lịch sử | Giữ nguyên tiền, ngày và snapshot |

## Hệ quả

- Yêu cầu dài hạn chưa duyệt **không có lịch**, nên mọi bề mặt hiển thị phải nói gói + nguyện
  vọng thay vì một khoảng ngày. `pickupWishText` (`apps/web/src/lib/long-term.ts`) là câu chữ dùng
  chung để bốn màn không ngụ ý bốn mức chắc chắn khác nhau.
- Index dedupe cũ khoá trên `(xe, SĐT, pickup_at, return_at)` mất tác dụng với dài hạn (NULL là
  "khác nhau") → thêm partial unique `NULLS NOT DISTINCT` trên `(xe, SĐT, gói, nguyện vọng, ngày
  yêu cầu)`.
- `QuoteBreakdownDto.days` thành nullable; báo giá gói không có khái niệm số ngày.
- Hợp đồng đóng băng thêm `rental.longTermPackageMonths` — "90 ngày" và "3 tháng" là hai điều
  khác nhau khi tháng lệch độ dài.

## Test bắt buộc

Thuần (không cần DB) ở `packages/types/src/long-term.test.ts`; DB thật ở
`apps/api/test/long-term-packages.spec.ts` và `rental-pricing.spec.ts`; UI ở
`apps/web/src/features/booking-requests/components/long-term-booking-flow.test.tsx`.

1. Hằng đúng `[1,2,3,6,9,12]`; nhận 1/2/3/6/9/12, từ chối 0/4/5/7/10/13.
2. Tháng lịch: 19/08 + 9 tháng = 19/05; 31/01 + 1 tháng kẹp cuối tháng 2 (thường và nhuận); giữ
   nguyên giờ; đúng ngày lịch Việt Nam kể cả mốc sát nửa đêm.
3. Mốc kế thừa (2 tháng ăn mốc 1; 9 và 12 ăn mốc 6), KHÔNG cộng dồn, % không được giảm khi hạn tăng.
4. Gói 9 tháng, 12tr/tháng, mốc 20% → base 108tr, giảm 21,6tr, cuối 86,4tr, bình quân 9,6tr.
5. Khuyến mãi tự lái không chạm giá gói; dài hạn đi nhầm máy giá ngày bị chặn.
6. Window 7 ngày do server tính, client không giả mạo; duyệt chỉ nhận ngày trong nguyện vọng.
7. Yêu cầu pending không tạo occupancy; duyệt tạo booking + occupancy trong một transaction;
   trùng lịch → 409 và yêu cầu vẫn pending.
8. Client gửi `returnAt` cho long-term bị bỏ qua hoàn toàn.
9. Tự lái/có tài xế giữ nguyên hành vi theo ngày.
10. UI: không range picker ở dài hạn; đúng 6 gói, mỗi gói mang % ưu đãi cam kết CỦA GÓI; tóm tắt
    hiện giá gốc/ưu đãi/tổng đúng số server trả; hai nguyện vọng, ngày cụ thể mới hiện date picker;
    panel không lộ giá/khuyến mãi tự lái; badge không nằm trên tab dịch vụ; payload không mang lịch.
