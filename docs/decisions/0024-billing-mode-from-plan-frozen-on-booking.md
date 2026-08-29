# ADR 0024 — Chế độ thu phí do GÓI quyết định và ĐÓNG BĂNG vào đơn lúc tạo

Ngày: 28/08/2026 · Trạng thái: Accepted · **Mở rộng [ADR 0014](0014-owner-and-shop-single-role.md) điều 3 và [ADR 0015](0015-vehicle-slot-billing.md) điều 4**

> ⚠️ **[ADR 0026](0026-first-trips-free-then-commission.md) thêm một bậc vào điều 1 (29/08/2026):**
> đường quyết định chế độ thu phí hỏi **lượt miễn phí trước**, hết lượt mới hỏi gói hiện hành.

## Bối cảnh

[ADR 0020](0020-two-revenue-tracks-one-marketplace.md) tạo ra hai chế độ thu phí. Câu hỏi kế
tiếp nghe có vẻ nhỏ nhưng quyết định độ phức tạp của cả hệ thống: **một chuyến cụ thể chịu chế
độ nào, và hỏi ai để biết?**

Có ba nguồn ứng viên, và chọn sai bất kỳ cái nào cũng để lại một loại nợ khác nhau:

- **`tenants.tenant_type`** — sai. [ADR 0014 điều 2](0014-owner-and-shop-single-role.md) chốt nó
  là **nhãn hiển thị**, không bao giờ dùng cho quyền hay hạn mức. Dùng nó cho tiền là để một
  người sửa nhãn hiển thị và vô tình đổi hoá đơn.
- **Một cờ riêng trên `tenants`** — sai theo cách tinh vi hơn. Nó tạo ra khả năng "đã mua gói
  nhưng cờ vẫn là hoa hồng" và ngược lại, tức là hai nguồn sự thật cho một câu hỏi.
- **Gói hiện hành** — đúng, và là mở rộng tự nhiên của
  [ADR 0014 điều 3](0014-owner-and-shop-single-role.md).

Và câu hỏi khó hơn: **tenant nâng cấp lên gói giữa lúc một chuyến đang chạy thì sao?**

## Quyết định

1. **Mở rộng [ADR 0014 điều 3](0014-owner-and-shop-single-role.md).** Câu cũ: *"`plans` quyết
   định NĂNG LỰC"*. Câu mới: *"`plans` quyết định **NĂNG LỰC và CHẾ ĐỘ THU PHÍ**"*.

   Nguồn sự thật là `BillingService.findCurrent(tenantId, now)` → `subscription.billing_mode`.
   `tenants.tenant_type` **không bao giờ được hỏi tới** cho việc này — nhãn phân biệt hai tuyến
   trên card chợ cũng đọc `billing_mode`.

2. **Snapshot chế độ lên `tenant_subscriptions`, không đọc xuyên qua `plans`.** Cột
   `billing_mode` + `commission_percent` chốt tại thời điểm gán, đúng kỷ luật cột `price` đã có
   từ [ADR 0010](0010-billing-plans-subscriptions.md).

   Lý do: admin sửa một bậc gói **không được phép** lật chế độ thu phí của mọi tenant đang dùng
   bậc đó giữa kỳ. Kèm lợi ích phụ: câu hỏi "tenant này đang ở tuyến nào" trả lời bằng **một
   cột trên dòng `findCurrent` vốn đã select**, không join, không lệch.

3. **Không có gói hiện hành ⇒ coi là `package` (0%), không phải `commission`.**

   An toàn khi hỏng nghĩa là **đừng lấy tiền mà không giải thích được**. Sau backfill của
   [ADR 0015 điều 9](0015-vehicle-slot-billing.md) trạng thái này lẽ ra không xảy ra — nên khi
   xảy ra thì ghi log, vì nó là dấu hiệu backfill sót chứ không phải một trạng thái hợp lệ.

4. **ĐÓNG BĂNG vào đơn lúc tạo.** `bookings` mang `billing_mode`, `commission_percent`,
   `commission_amount`, và `platformFee` trong snapshot giá. **Đơn không bao giờ được tính lại
   giá** — cùng bất biến mà `price_snapshot_json` đã có từ đầu.

5. **Nâng cấp giữa chuyến là chuyện KHÔNG CẦN XỬ LÝ.** Đây là phần thưởng lớn nhất của thiết kế
   thu-trước ở [ADR 0021](0021-booking-hold-is-the-commission.md), và phải ghi ra để không ai
   mất công xây thứ không cần:

   > Hoa hồng đã nằm trong tài khoản ngân hàng của nền tảng **từ trước khi tenant bấm nâng cấp**.
   > Không có gì để hoàn, không có gì để đòi, không có gì để đối soát.

   Chuyến đang chạy giữ nguyên hoa hồng của nó. Chỉ đơn **tạo sau** khi gói có hiệu lực mới
   miễn hoa hồng. Không prorate, không hồi tố, không có "chế độ hỗn hợp".

6. **Hạ cấp (gói hết hạn → tuyến A) đối xứng.** Đơn đang chạy không đổi; đơn mới rơi về hoa
   hồng. Xe **không bị gỡ khỏi chợ** —
   [ADR 0020 điều 5](0020-two-revenue-tracks-one-marketplace.md) đã sửa
   [ADR 0015 điều 6](0015-vehicle-slot-billing.md).

   Hạn mức số chỗ **không** rơi theo. Tenant hết gói vẫn giữ số xe đang có; họ chỉ chuyển sang
   trả theo chuyến. Thu hồi xe khi hết hạn là phạt người đã ngừng trả tiền bằng cách khiến họ
   không thể trả tiếp.

7. **Điều khoản của khoản giữ chỗ đóng băng lúc TẠO HOLD, chấm hết.** Hold tạo lúc 10:00, gói
   kích hoạt lúc 10:10, tiền về lúc 10:15 → **vẫn thu hoa hồng**. Tiền có thể đang trên đường
   và VietQR khách đang cầm ghi số đó. Một dòng quy tắc, không có ngoại lệ nào.

8. **Ranh giới dữ liệu / quy tắc — mở rộng [ADR 0015 điều 4](0015-vehicle-slot-billing.md).**

   | Là DỮ LIỆU (admin sửa được) | Là QUY TẮC (nằm trong code) |
   | --- | --- |
   | `billing_mode` của từng bậc gói | Khoản giữ chỗ **là** hoa hồng và nền tảng giữ luôn |
   | `commission_percent` | Hoa hồng trừ phía chủ xe, **không** cộng phía khách |
   | `base_price_monthly`, `perVehiclePrice` | Hoa hồng **không** là một dòng trong bảng kê giá khách |
   | `terms[].discountPercent`, `graceDays` | Mốc huỷ miễn phí đóng băng lúc tạo |
   | `assumed_monthly_gmv_json` | Đơn không bao giờ được tính lại giá |

   **Không có núm nào bật/tắt được cột bên phải.** Núm vặn được quy tắc tạo ra trạng thái không
   ai debug nổi — nguyên văn tinh thần [ADR 0015](0015-vehicle-slot-billing.md).

## Ràng buộc bắt buộc

1. **Denormalize `billing_mode` + `commission_percent` xuống `public_listings`.** Câu hỏi này
   được hỏi trên **mỗi card chợ**; join lên subscription cho mỗi card là hỏng hiệu năng ở đúng
   trang quan trọng nhất.
2. **Writer vẫn là `ListingsService.syncFromVehicle`** — [ADR 0008](0008-public-listings-sync.md)
   không có ngoại lệ. `BillingService` **gọi** `ListingsService` khi gán/huỷ gói và khi job vòng
   đời chạy; nó **không tự ghi** `public_listings`. Cùng chiều phụ thuộc mà
   [ADR 0015 điều 6](0015-vehicle-slot-billing.md) đã đặt.
3. **Đồng bộ listing là hệ quả bắt buộc của mọi thay đổi gói**, không phải việc tuỳ chọn. Quên
   nó nghĩa là card chợ hiện nhãn sai và nút đặt sai — khách bấm "đặt & giữ chỗ ngay" trên một
   xe đã chuyển sang tuyến B.
4. **`platformFee` trong snapshot là optional.** Snapshot chốt trước đợt này đọc ra `undefined`
   = **"không biết"**, và **không được suy ngược từ `totalAmount`**. Chép đúng cảnh báo đã có
   sẵn cho các field snapshot khác.

## Hoãn có chủ đích

- **Chế độ thu phí theo từng xe** thay vì theo tenant (ví dụ tenant mua gói cho 5 xe, xe thứ 6
  chạy hoa hồng). Nghe hợp lý, nhưng làm cho câu hỏi "chuyến này chế độ nào" phải hỏi tới cấp
  xe và số chỗ đang dùng — và mở ra bài toán chọn xe nào ăn chỗ. Hiện tại: **hết chỗ thì không
  đưa xe lên chợ được**, đúng như [ADR 0015 điều 7](0015-vehicle-slot-billing.md).
- **Prorate khi nâng cấp giữa kỳ.** Điều 5 làm nó không cần thiết.
- **Tỉ lệ hoa hồng riêng cho từng tenant** (thương lượng). Cột nằm trên `plans` nên phải tạo bậc
  gói riêng — chấp nhận được ở quy mô hiện tại.

## Hệ quả

- `tenant_subscriptions` thêm `billing_mode` + `commission_percent` (snapshot);
  `bookings` và `public_listings` thêm cùng hai cột (+ `commission_amount` trên `bookings`).
- `BillingService.assign` / `cancel` và job vòng đời gói đều phải kích hoạt đồng bộ listing.
- Test phải khoá được ba tình huống: nâng cấp giữa chuyến không đổi đơn đang chạy; hold tạo
  trước khi gói kích hoạt vẫn thu hoa hồng; hết gói không gỡ xe khỏi chợ.

## Cần xem lại khi nào

Khi có nhu cầu thật về chế độ theo từng xe (tenant lớn muốn tách đội xe), hoặc khi tỉ lệ hoa
hồng cần thương lượng theo từng đối tác — cả hai đều làm mô hình "một chế độ cho một tenant"
không còn đủ.
