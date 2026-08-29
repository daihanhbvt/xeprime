# ADR 0020 — Hai đường doanh thu trên MỘT chợ: hoa hồng phía chủ xe và gói theo chỗ

Ngày: 28/08/2026 · Trạng thái: Accepted · **Sửa [ADR 0014](0014-owner-and-shop-single-role.md) điều 5**

> ⚠️ **[ADR 0026](0026-first-trips-free-then-commission.md) thêm một bậc TRƯỚC hai tuyến
> (29/08/2026):** hai đơn đầu của một tenant là **0% hoa hồng, không thu giữ chỗ**; từ đơn thứ ba
> mới rơi vào tuyến hoa hồng. Điều đó **thay** gói miễn phí theo hạn ngày của
> [ADR 0015 điều 9](0015-vehicle-slot-billing.md).
>
> ⚠️ **[ADR 0025](0025-shop-escrow-hold-and-payout.md) thêm một dòng vào cột “VẪN đứng giữa” của
> điều 4:** khi gian hàng bật thu cọc qua sàn, nền tảng **giữ tiền của gian hàng** và đứng giữa
> tranh chấp “đã chuyển / chưa nhận”.

## Bối cảnh

[ADR 0015](0015-vehicle-slot-billing.md) chốt mô hình thu tiền: chủ xe cá nhân dùng miễn phí
~6 tháng rồi trả theo từng xe mỗi tháng. Mô hình đó có hai lỗ hổng mà thực tế thị trường phơi ra:

1. **Chủ xe một chiếc, chạy vài ngày một tháng, không có lý do gì trả trước một khoản cố định.**
   Hết hạn miễn phí là họ đi. [ADR 0015 điều 6](0015-vehicle-slot-billing.md) trả lời bằng cách
   gỡ xe khỏi chợ — tức là nền tảng chủ động tự giảm nguồn cung của chính mình.
2. **Không có gì để so với đối thủ.** Mioto lấy tổng cộng ~30–40%: cộng ~28% lên đầu khách
   (phí dịch vụ + bảo hiểm) rồi trừ tiếp ~22% của chủ xe. Một chuyến niêm yết 780.000đ thành
   998.580đ với khách và còn 608.400đ với chủ xe. XePrime không có câu trả lời nào cho việc
   "tại sao chủ xe nên chuyển sang đây" ngoài giá gói.

Đồng thời [ADR 0015](0015-vehicle-slot-billing.md) tự ghi ở mục hoãn: *"Hoa hồng theo đơn: bị
chặn bởi ADR 0013 — không cầm tiền của khách thì không cắt được %. Muốn mở phải mở ADR 0013
trước."* Và [ADR 0013](0013-no-online-payment-mvp.md) tự ghi ở mục xem lại: *"khi XePrime đổi
mô hình sang thu phí nền tảng trên mỗi đơn"*. Cả hai đều chừa sẵn chỗ cho quyết định này.

## Quyết định

1. **Một chợ, hai chế độ thu phí.** Xe của mọi tenant nằm chung một danh sách tìm kiếm, chung
   bộ lọc, chung xếp hạng. Cái khác nhau là **cách nền tảng thu tiền**, không phải chỗ đứng
   trên sàn.

   | | Tuyến A — hoa hồng | Tuyến B — gói |
   | --- | --- | --- |
   | Ai | Tenant chưa mua gói | Tenant đã mua gói theo chỗ |
   | Nền tảng thu | % trên mỗi chuyến, **chỉ trừ phía chủ xe** | Cước theo chỗ, trả trước ([ADR 0015](0015-vehicle-slot-billing.md)) |
   | Trên chuyến | Thu qua khoản giữ chỗ ([ADR 0021](0021-booking-hold-is-the-commission.md)) | **Không một đồng nào** |
   | Nút đặt | "Đặt & giữ chỗ ngay" | "Gửi yêu cầu" (giữ nguyên) |
   | Cọc xe | Hai bên tự thoả thuận, ngoài sàn | Hai bên tự thoả thuận, ngoài sàn |

2. **Giá hiển thị trên chợ = ĐÚNG giá chủ xe niêm yết.** Không cộng phí dịch vụ, không cộng
   bảo hiểm, không cộng thuế lên đầu khách — ở cả hai tuyến. Hoa hồng là khoản **trừ phía chủ
   xe**, không phải khoản cộng phía khách.

   Đây là điều khoản dễ bị xói mòn nhất trong ADR này. Nó là toàn bộ lời hứa của sản phẩm, và
   nó có một cái neo kỹ thuật ở [ADR 0021](0021-booking-hold-is-the-commission.md): hoa hồng
   **không được phép** là một dòng trong bảng kê giá của khách.

3. **Không có dòng phí bảo hiểm.** Rủi ro gộp trong tỉ lệ hoa hồng. Bán bảo hiểm là bán một sản
   phẩm tài chính — cần đối tác thật, hợp đồng thật, và quy trình bồi thường thật. Trưng một
   dòng "bảo hiểm" mà không có ba thứ đó là hứa điều không giữ được.

4. **Sửa [ADR 0014 điều 5](0014-owner-and-shop-single-role.md).** Bảng "nền tảng đứng giữa
   những gì" thêm **đúng một dòng** vào cột **VẪN đứng giữa**:

   > **Phí dịch vụ của chính nền tảng** (khoản giữ chỗ ở tuyến A, tiền gói ở tuyến B).

   Mọi dòng khác **ở nguyên chỗ cũ**. Đặc biệt: *"Giá, điều kiện thuê, cọc"* vẫn nằm ở cột
   **KHÔNG đứng giữa** — nền tảng không định giá, không đặt điều kiện thuê, không giữ cọc xe,
   không xử lý tranh chấp, không xác minh giấy tờ khách thay gian hàng. Cái duy nhất đổi là
   nền tảng nay thu **tiền của chính nó** qua một đường online.

5. **Hết hạn gói ⇒ RƠI VỀ TUYẾN A, không gỡ xe khỏi chợ.** Điều này **sửa
   [ADR 0015 điều 6](0015-vehicle-slot-billing.md)**. Gỡ xe là đúng khi không có tuyến thay
   thế; bây giờ nó vừa giết nguồn cung vừa bỏ mất doanh thu hoa hồng của chính những chiếc xe
   đó. Job vòng đời gói đổi từ "ẩn xe" thành "chuyển chế độ thu phí, đồng bộ lại
   `public_listings` qua `ListingsService`, thông báo cho chủ".

   Hạn mức số chỗ vẫn có hiệu lực khi còn gói. Rơi về tuyến A là rơi về **chế độ thu phí**,
   không phải rơi về "muốn đăng bao nhiêu xe cũng được" — chi tiết ở
   [ADR 0024](0024-billing-mode-from-plan-frozen-on-booking.md).

## Lý do

**Vì sao không chỉ làm một tuyến.**

Chỉ hoa hồng: gian hàng 40 xe chạy đều sẽ trả cho nền tảng hàng chục triệu mỗi tháng, và họ có
đủ lý do lẫn đủ nguồn lực để đưa khách ra ngoài sàn. Mô hình % chỉ giữ được người không có kênh
riêng.

Chỉ gói: chủ xe một chiếc không mua, và đó chính là nhóm đông nhất ở giai đoạn đầu — nhóm làm
nên mật độ xe trên bản đồ, thứ quyết định khách có quay lại hay không.

Hai tuyến giải cả hai: người ít xe vào miễn phí và chỉ trả khi có doanh thu; người nhiều xe
mua gói vì rẻ hơn hẳn.

**Bài toán khuyến khích, viết ra thành công thức.** Với `N` xe, doanh thu trung bình `G` mỗi xe
mỗi tháng:

```
Chi phí tuyến A = commissionPercent × N × G
Chi phí tuyến B = basePriceMonthly + N × perVehiclePrice
```

Gói thắng khi `perVehiclePrice < commissionPercent·G − basePriceMonthly/N`.

Với `perVehiclePrice = 100.000` và `commissionPercent = 10`, điểm hoà vốn là
`G = 1.000.000đ/xe/tháng` — khoảng **1,3 ngày thuê** với xe 780.000đ/ngày.

**Hệ quả phải nói thẳng: tuyến A không phải nguồn thu chính.** Nó là phễu thu hút và mạng lưới
an toàn cho xe ít chạy. Doanh thu thật, ổn định, trả trước, dự báo được nằm ở tuyến B. Đừng lập
kế hoạch tài chính dựa trên tiền hoa hồng.

**Và hệ quả kỹ thuật của điều đó: `basePriceMonthly = 0` giết cả mô hình.** Nếu gói rẻ hơn hoa
hồng ở *mọi* quy mô thì chủ xe một chiếc cũng mua gói, và nền tảng thu 100.000đ từ một người lẽ
ra trả 1.170.000đ. Bậc gói gian hàng phải có phí nền đủ để **chỉ có lợi từ một số xe nhất định
trở lên**.

Đây là chỗ **kiểm điểm giao** của [ADR 0015](0015-vehicle-slot-billing.md) phải được viết lại:
bản gốc nói *"giá gói gian hàng ở mốc N xe phải ≥ giá cá nhân cùng N xe"*, nhưng "giá cá nhân"
nay là một **phần trăm doanh thu**, không phải giá theo chỗ. Cách phát biểu mới:

> `BillingService` **từ chối** lưu một bậc gói mà điểm hoà vốn so với tuyến hoa hồng nằm **dưới**
> `includedCars` của chính bậc đó. Phép kiểm chạy trên `plans.assumed_monthly_gmv_json` — dữ
> liệu admin nhập, quy tắc nằm trong code, đúng ranh giới
> [ADR 0015 điều 4](0015-vehicle-slot-billing.md) đã đặt.

## Ràng buộc bắt buộc

1. **Chế độ thu phí đọc từ GÓI, không bao giờ từ `tenants.tenant_type`.**
   [ADR 0014 điều 2](0014-owner-and-shop-single-role.md) giữ nguyên hiệu lực: `tenant_type` là
   **nhãn hiển thị**. Nhãn phân biệt hai tuyến trên card chợ đọc `billing_mode`.
2. **Nhãn trên chợ nói về cách ĐẶT, không nói về đẳng cấp.** "Đặt & giữ chỗ ngay" là một tiện
   ích của khách, không phải huy hiệu chất lượng của chủ xe. Không được thiết kế nhãn khiến xe
   tuyến B trông kém tin cậy hơn — họ là nhóm trả tiền nhiều nhất.
3. **Không xếp hạng tìm kiếm theo tuyến.** Đẩy xe tuyến A lên trước vì nó sinh hoa hồng là cách
   nhanh nhất để gian hàng lớn rời sàn.

## Hoãn có chủ đích

- **Hình phạt khi chủ xe huỷ đơn tuyến A.** Nền tảng phải hoàn tiền khách vì lỗi của chủ xe mà
  không có đòn bẩy nào để đòi lại. Đợt này **chỉ ghi audit và đếm**, chưa xây hình phạt — nhưng
  phải ghi từ ngày đầu, vì điểm uy tín sau này cần dữ liệu lịch sử chứ không dựng được từ số 0.
- **Tỉ lệ hoa hồng theo khu vực / loại xe / mùa.** Cột `commission_percent` nằm trên `plans` nên
  làm được, nhưng chưa có dữ liệu để chọn số.
- **Chủ xe cá nhân đăng xe không qua luồng mở gian hàng.** Vẫn giữ nguyên luồng hiện tại —
  [ADR 0014 điều 1](0014-owner-and-shop-single-role.md) (mọi xe thuộc một tenant) không đổi.
  Rút gọn onboarding là việc trải nghiệm, không phải việc mô hình.

## Hệ quả

- `plans` thêm `billing_mode`, `commission_percent`, `base_price_monthly`,
  `assumed_monthly_gmv_json`; `tenant_subscriptions` snapshot `billing_mode` +
  `commission_percent`; `public_listings` denormalize hai cột đó để card chợ không thêm truy vấn.
- Job vòng đời gói đổi hành vi (điều 5) — **không** còn ẩn xe khi hết hạn.
- Kiểm điểm giao của [ADR 0015](0015-vehicle-slot-billing.md) được phát biểu lại và **chuyển từ
  quy trình sang code**.
- Kéo theo bốn ADR: [0021](0021-booking-hold-is-the-commission.md) (cơ chế thu),
  [0022](0022-sepay-customer-money.md) (đối soát), [0023](0023-wallet-refund-and-compensation.md)
  (ví), [0024](0024-billing-mode-from-plan-frozen-on-booking.md) (chế độ quyết định lúc nào).

## Cần xem lại khi nào

Khi tỉ lệ tenant mua gói vượt ~90% — lúc đó tuyến A hết vai trò phễu và trở thành chi phí vận
hành thuần (đối soát, hoàn tiền, hỗ trợ) cho một nhóm nhỏ. Hoặc khi có đối thủ hạ hoa hồng xuống
dưới mức này, vì lúc đó lợi thế giá không còn là thứ giữ chân chủ xe.
