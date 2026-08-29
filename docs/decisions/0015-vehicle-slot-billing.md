# ADR 0015 — Cước theo CHỖ XE, trả trước, kỳ tính bằng THÁNG LỊCH; hết hạn thì gỡ khỏi chợ

Ngày: 21/08/2026 · Trạng thái: Accepted · **Sửa [ADR 0010](0010-billing-plans-subscriptions.md)**

> ⚠️ **Ba chỗ đã được sửa (28/08/2026)** khi mô hình chuyển sang hai tuyến doanh thu
> ([ADR 0020](0020-two-revenue-tracks-one-marketplace.md)):
>
> - **Điều 5, câu cuối** (*"`payments.subscription_id` nay nối FK"*) — **HUỶ** bởi
>   [ADR 0022 điều 6](0022-sepay-customer-money.md). Một dòng `payments` có `tenant_id` tự sinh
>   phiếu thu đã duyệt cho tenant đó, tức là tiền nền tảng thu *của* gian hàng sẽ hiện lên báo
>   cáo tài chính của **chính gian hàng** như khoản thu của họ. Tiền gói ghi ở
>   `subscription_invoices.paid_amount` + `bank_transactions`.
> - **Điều 6** (*"hết hạn → gỡ xe khỏi chợ"*) — **SỬA** bởi
>   [ADR 0020 điều 5](0020-two-revenue-tracks-one-marketplace.md): hết hạn thì **rơi về tuyến hoa
>   hồng**, xe **ở lại chợ**. Gỡ xe là đúng khi chưa có tuyến thay thế; nay nó vừa giết nguồn
>   cung vừa bỏ mất doanh thu của chính những xe đó.
> - **Kiểm điểm giao ở mục "Hệ quả"** (*"giá gói ở mốc N xe phải ≥ giá cá nhân cùng N xe"*) — phát
>   biểu lại ở [ADR 0020](0020-two-revenue-tracks-one-marketplace.md) vì "giá cá nhân" nay là một
>   **phần trăm doanh thu**, không phải giá theo chỗ; và nó chuyển từ quy trình thành **code**.
>
> Mục *"Hoãn có chủ đích → Hoa hồng theo đơn"* đã được mở, đúng như nó dự liệu:
> [ADR 0021](0021-booking-hold-is-the-commission.md).
> **Điều 1–4 và 7–10 giữ nguyên hiệu lực.**
>
> ⚠️ **Điều 9 (gói miễn phí có ngày hết hạn) bị THAY (29/08/2026)** bởi
> [ADR 0026](0026-first-trips-free-then-commission.md): ưu đãi khởi đầu nay đếm theo **SỐ CHUYẾN**
> (hai đơn đầu miễn phí), không theo ngày. Phần còn lại của điều 9 — `registerShop` tự gán gói,
> backfill tenant cũ — giữ nguyên.

## Bối cảnh

Mô hình kinh doanh đã chốt: chủ xe cá nhân dùng miễn phí ~6 tháng đầu sau khi mở sàn, sau đó trả
theo **từng xe mỗi tháng** (ô tô và xe máy hai mức khác nhau); gian hàng trả **phí nền + đơn giá
theo xe ưu đãi hơn**, chọn được nhiều kỳ hạn kể cả 1 tháng.

ADR 0010 dựng `plans` + `tenant_subscriptions` theo mô hình **gói phẳng**: một `price`, một
`duration_days`, một `max_vehicles`. Nó trả lời được "tenant này còn hạn không?" nhưng **không**
trả lời được "kỳ này tenant phải trả bao nhiêu?" — con số đó phụ thuộc số xe theo từng loại. Nhét
cước theo lượng vào `plans.price` làm `tenant_subscriptions.price` (vốn là *snapshot giá lúc gán*)
thành con số vô nghĩa ngay kỳ thứ hai.

Ngoài ra `duration_days` mâu thuẫn với kỷ luật đã có: CLAUDE.md cấm suy lịch bằng `số tháng × 30`
và [ADR 0011](0011-long-term-fixed-packages.md) đã chốt thuê dài hạn tính theo **tháng lịch**, có
sẵn `addCalendarMonthsVn` trong `@xeprime/types`.

## Quyết định

1. **Cước tính theo CHỖ (slot), TRẢ TRƯỚC.** Tenant mua *N chỗ ô tô + M chỗ xe máy, trong T tháng*.
   **Số chỗ đã mua chính là hạn mức xe** — không có bước đếm xe cuối kỳ.

2. **Kỳ hạn tính bằng THÁNG LỊCH**, không phải ngày. `plans.duration_days` → `duration_months`
   (1|3|6|12); `endsAt = addCalendarMonthsVn(startsAt, termMonths)`. Dùng lại đúng helper của
   ADR 0011 — hai định nghĩa "một tháng" trong cùng một sản phẩm là lỗi chờ sẵn (gia hạn 12 lần
   gói 30 ngày ra 360 ngày, khách mất 5 ngày mỗi năm).

3. **`plans` tách NĂNG LỰC khỏi KỲ HẠN.** `plans` mô tả bậc năng lực; kỳ hạn là lựa chọn lúc mua,
   lưu ở `tenant_subscriptions.term_months` cùng hệ số giảm giá. Không sinh 3 bậc × 4 kỳ = 12 dòng
   `plans`.

4. **Hình dạng núm vặn nằm ở `plans.limits_json`** (jsonb — ADR 0010 đã chọn để khỏi migrate khi
   thêm giới hạn):

   ```
   perVehiclePrice: { car, motorbike }        đơn giá 1 chỗ / tháng
   includedCars, includedMotorbikes           gói gian hàng gồm sẵn
   maxCars, maxMotorbikes                     null = không giới hạn
   maxMembers, maxBranches
   terms: [{ months, discountPercent }]
   graceDays
   features: [...]
   ```

   **Ranh giới: giá / % / số ngày / số chỗ là DỮ LIỆU admin sửa được; QUY TẮC nằm trong code.**
   Không có núm nào bật/tắt được điều 1, 2 hay 6 — núm vặn được quy tắc tạo ra trạng thái không ai
   debug nổi.

5. **`subscription_invoices` — bảng mới**, chính là phần ADR 0010 ghi "Hoãn: Invoice / ghi nhận
   thanh toán gia hạn". Sinh tại thời điểm mua/gia hạn/mua thêm chỗ, snapshot từng dòng
   (`vehicleType`, số chỗ, đơn giá, thành tiền). `payments.subscription_id` (cột chờ sẵn từ Phase 0)
   nay nối FK.

6. **Hết hạn → GỠ XE KHỎI CHỢ, không khoá tenant.** Sau `ends_at` cộng `graceDays`, xe chuyển
   `approved_public → hidden` **qua `ListingsService.syncFromVehicle`** (ADR 0008 — module billing
   không tự ghi `public_listings`), ghi audit kèm lý do hệ thống. Cổng vận hành vẫn chạy bình
   thường: đơn đang chạy có **khách thật** đang cầm xe, khoá console là phạt nhầm người.

7. **Enforce ở HAI điểm**, không phải một: `assertVehicleQuota` khi **tạo xe** (đã có, nay tách
   theo `vehicle_type`) và khi **`submitPublic`** — ADR 0010 §"Hoãn" để ngỏ điểm thứ hai, mà đó
   mới là cái răng thật của việc bán gói.

8. **Mua thêm chỗ giữa kỳ = HUỶ dòng hiện hành + CHÈN dòng mới cùng `ends_at`**, số chỗ mới, tính
   prorate **tròn tháng** theo số tháng còn lại. Giữ bất biến "**một** dòng hiệu lực tại một thời
   điểm" mà `BillingService.findCurrent` đang dựa vào (`orderBy endsAt desc`, lấy MỘT dòng). Nếu
   để hai dòng chồng lấn thì hạn mức phải là TỔNG — và quên cộng là một lỗ hổng quota im lặng.
   Chi tiết "lúc nào mua thêm bao nhiêu" nằm ở `subscription_invoices`, đúng chỗ của nó.

9. **Gói miễn phí có ngày hết hạn thật**, ghi vào `ends_at` của dòng subscription ngay lúc gán —
   không có khái niệm "khoảng 6 tháng" trôi nổi ngoài dữ liệu. Kèm theo đó, **đảo mặc định của
   ADR 0010**: từ nay `registerShop` tự gán gói, và tenant hiện có được backfill. (ADR 0010 chọn
   "không gói = không giới hạn" để grandfather; giữ nguyên thì free tier không có nghĩa.)

10. **Việc gỡ xe khi hết hạn cần một job định kỳ nhẹ ở `apps/worker`.** ADR 0010 cố ý không có
    cron vì "expired" suy ra được lúc đọc — điều đó vẫn đúng cho *đọc trạng thái*, nhưng *gỡ xe
    khỏi chợ* là một hành động ghi, phải có ai đó chạy. Job idempotent, chạy lại ra 0 dòng.

## Hoãn có chủ đích

- **Tự phục vụ thanh toán online** — xem [ADR 0016](0016-sepay-bank-reconciliation.md).
- **Hoa hồng theo đơn**: bị chặn bởi [ADR 0013](0013-no-online-payment-mvp.md) — không cầm tiền của
  khách thì không cắt được %, phải đi đòi từng đơn. Muốn mở phải mở ADR 0013 trước.
- **Chống gian lận gỡ-xe-rồi-đăng-lại**: mô hình theo chỗ làm câu hỏi này biến mất; nếu sau này
  đổi sang đếm cuối kỳ thì nó quay lại.
- **Tự khoá tenant khi hết hạn** (`TENANT_STATUS.EXPIRED` vẫn chưa flow nào set) — điều 6 cố ý
  không làm.

## Hệ quả

- Migration đổi `duration_days` → `duration_months` + reshape `limits_json` + backfill gói hiện có.
- `assertVehicleQuota` đổi chữ ký (theo loại xe) và có thêm một điểm gọi.
- Kiểm điểm giao bắt buộc khi đặt giá: **giá gói gian hàng ở mốc N xe phải ≥ giá cá nhân cùng N
  xe**, nếu không nâng cấp xong lại trả ít hơn — gói cao cấp thành gói giảm giá.
- `BillingService` vẫn là **đường ghi duy nhất** của `plans`/`tenant_subscriptions`/
  `subscription_invoices` (quy tắc 1-writer, giữ nguyên từ ADR 0010).
