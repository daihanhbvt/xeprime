# ADR 0058 — MoMo và VNPAY là phương thức thanh toán BỔ SUNG: một sổ cổng riêng, một đường tiền chung, mặc định tắt

Ngày: 09/10/2026 · Trạng thái: **Proposed** — phần kỹ thuật đã hiện thực trên nhánh, mọi cổng mặc định
TẮT; production **từ chối boot khi bật cổng cho bất kỳ luồng nào** cho tới khi ADR này chuyển Accepted
(xem mục "Còn mở") · Mở rộng: [ADR 0016](0016-sepay-bank-reconciliation.md) mục "Hoãn có chủ đích"
(nhiều nhà cung cấp) · [ADR 0022](0022-sepay-customer-money.md) mục "Hoãn có chủ đích" · Không ghi đè
ADR nào.

## Bối cảnh

Tiền vào nền tảng hiện có đúng một đường: khách/gian hàng chuyển khoản VietQR mang mã đối soát
(`XPG…` hoá đơn gói · `XPH…` tiền giữ chỗ), SePay báo biến động tài khoản, `SepayService` ghi
`bank_transactions` rồi khớp vào đích (ADR 0016 · 0022 · 0044). Đường đó đúng nhưng hẹp: người không
quen chuyển khoản bằng QR, hoặc muốn trả bằng ví MoMo / thẻ qua VNPAY, không có lối nào khác.

Thêm cổng thanh toán đặt ra ba câu hỏi thiết kế mà ADR cũ chưa trả lời:

1. Tiền qua cổng ghi vào đâu? `bank_transactions` là sổ của MỘT tài khoản ngân hàng — mỗi dòng là một
   biến động thật của tài khoản đó. Tiền qua cổng nằm ở tài khoản merchant của cổng và về ngân hàng
   sau, gộp nhiều giao dịch, đã trừ phí.
2. Ai được nói "đã thanh toán"? Cổng chuyển trình duyệt về kèm kết quả trên URL — URL đó ai cũng sửa
   được.
3. Hai đích có bản chất tiền khác hẳn nhau: tiền gói là doanh thu của XePrime; tiền giữ chỗ chứa tiền
   của nhiều bên (`D` của chủ xe, `IV`/`IP` giữ hộ hãng bảo hiểm — ADR 0033 điều 4) và đang bị chặn bởi
   release gate pháp lý L1/L5 (roadmap §8.2).

## Quyết định

### 1. Cổng là phương thức BỔ SUNG; SePay giữ nguyên

Chuyển khoản VietQR vẫn là đường mặc định ở mọi màn thanh toán. Nút MoMo/VNPAY nằm DƯỚI khối chuyển
khoản và chỉ hiện khi có cổng mở cho đúng luồng đó. Không đường nào của SePay đổi.

### 2. Một sổ riêng: `payment_gateway_orders` + nhật ký, writer duy nhất `PaymentGatewayService`

Mỗi lượt mở phiên thanh toán là MỘT dòng `payment_gateway_orders` — đích (FK tới hoá đơn HOẶC khoản
giữ chỗ, CHECK đúng một), mã đối soát của đích, `tenant_id` suy từ đích, số tiền đã gửi, trạng thái
theo lời cổng, mã giao dịch của cổng, payload kết quả cuối đã bỏ chữ ký, và hai trục kết luận: lượt áp
(`applied_at` + `apply_outcome`) và hàng đợi người xử lý (`review_status` + `review_reason`).

Mọi kết quả đã xác minh của cổng (IPN gửi lại, truy vấn, kết quả lệch số tiền…) để lại một dòng
`payment_gateway_order_events` — chỉ ghi thêm, ghi CÙNG transaction với lần đổi trạng thái. Dòng lượt
chỉ giữ lời cuối; nhật ký là bằng chứng khi cổng kể hai lời khác nhau.

FK từ lượt tới gian hàng, hoá đơn, khoản giữ chỗ và từ nhật ký tới lượt đều `RESTRICT`: bằng chứng tiền
về không được biến mất vì một lần xoá dữ liệu khác.

**Không ghi giả vào `bank_transactions`.** Ghi một giao dịch cổng vào sổ ngân hàng là bịa ra một biến
động không có thật và làm hỏng đối soát ba vế (số dư cuối ngày của ngân hàng không chứa khoản đó).

Chống ghi đôi bằng CONSTRAINT, không bằng check tầng app (cùng kỷ luật ADR 0016 điều 4):
`UNIQUE(provider, provider_order_ref)` và `UNIQUE(provider, provider_tx_id)`.

### 3. Một đường tiền chung

Hiệu ứng tiền đi qua ĐÚNG hai hàm mà webhook SePay đã kiểm chứng —
`BillingService.applyBankPaymentWithinTx` (hoá đơn gói) và `BookingHoldsService.applyBankPaymentWithinTx`
(tiền giữ chỗ). Vì vậy mọi luật hiện hành áp nguyên cho tiền qua cổng, không viết lại:

- thiếu ⇒ không kích hoạt; đủ ⇒ gói bật / đơn thuê tạo TRONG cùng transaction;
- khoản giữ chỗ quá hạn THEO MỐC `expires_at` ⇒ không tạo đơn (ADR 0044 điều 7);
- hoá đơn `void`/`draft` ⇒ không nhận;
- thừa vào khoản giữ chỗ ⇒ đường hoàn chuyển thừa (ADR 0022 điều 5 · ADR 0033 điều 5).

Khoản trả TRÙNG (đích đã đủ từ trước, thường vì khách vừa chuyển khoản vừa trả qua cổng):

- **hoá đơn gói** ⇒ hàng đợi cổng, lý do `overpaid` — hoá đơn không có hàng đợi hoàn nào, nên người
  trực phải thấy khoản này ở đâu đó;
- **khoản giữ chỗ** ⇒ `BookingHoldsService` ghi yêu cầu hoàn phần thừa (`hold_refunds`, lý do
  `overpaid`) trong chính transaction áp tiền và BÁO LẠI có ghi được không (`refundRecorded`). Ghi được
  ⇒ KHÔNG mở hàng đợi cổng: hàng đợi hoàn là chủ duy nhất, hai hàng đợi cho cùng một đồng là mời người
  trực hoàn hai lần; người trả thấy chặng `duplicate_refunded`. KHÔNG ghi được (hold đã có một khoản
  hoàn ĐÓNG từ trước — `hold_id` unique) ⇒ hàng đợi cổng `overpaid`: tiền không bao giờ nằm ngoài
  mọi hàng đợi.

Tiền gói qua cổng KHÔNG sinh dòng `payments` (ADR 0022 điều 6 giữ nguyên).

### 4. Chỉ kết quả đã xác minh phía server đổi được tiền

Hai nguồn, và chỉ hai:

- **IPN** của cổng — chữ ký HMAC kiểm bằng so sánh thời gian hằng (MoMo: HMAC-SHA256, chuỗi ký theo
  thứ tự tài liệu; VNPAY 2.1.0: HMAC-SHA512 trên tham số `vnp_*` đã sắp và URL-encode), đúng merchant,
  rồi đúng đơn, đúng số tiền, đúng VND.
- **Truy vấn do chính server gửi** (MoMo `/v2/gateway/api/query`, VNPAY `querydr` — phản hồi `querydr`
  có chữ ký và được kiểm). Kích hoạt khi trang quay về hỏi trạng thái một lượt còn chờ (giới hạn nhịp
  `PAYMENT_GATEWAY_QUERY_MIN_INTERVAL_SECONDS`), khi người trực bấm "hỏi lại cổng", hoặc bởi bộ quét
  định kỳ (điều 5).

Trình duyệt quay về chỉ mang ID của lượt. Mọi tham số mà cổng gắn lên URL quay về bị bỏ qua. Truy vấn
không xác minh được (mạng, phản hồi không ký đúng) KHÔNG BAO GIỜ được hiểu là thất bại — lượt giữ nguyên.

### 5. Ghi nhận trước, áp sau — hai transaction; một bộ quét làm lưới an toàn

Lượt "cổng đã thu tiền" được COMMIT trước khi áp vào đích — cùng bài học 16/09/2026 của `SepayService`:
một lượt áp hỏng không được cuốn mất bằng chứng tiền đã về. Lượt áp khoá dòng (`FOR UPDATE`), đọc lại,
và ghi `applied_at` CÙNG transaction với hiệu ứng tiền (CHECK ở DB đòi `applied_at` ⇔ `apply_outcome`).
Lượt áp hỏng ⇒ hàng đợi người xử lý (`apply_failed`); IPN gửi lại, lượt hỏi trạng thái kế tiếp, bộ quét
hoặc người trực đều thử áp lại an toàn, và áp thành công thì gỡ cờ `apply_failed`.

Luật chuyển trạng thái: thành công thắng mọi thứ chưa thành công (kể cả một lượt đã ghi "huỷ" trước đó —
tiền về là tiền về); thất bại chỉ đổi được lượt còn chờ; không bao giờ hạ cấp một lượt đã thu. Cổng báo
"không tìm thấy đơn" chỉ làm lượt hết hạn khi đã quá hạn phiên một khoảng
`PAYMENT_GATEWAY_NOT_FOUND_GRACE_MINUTES`.

**Bộ quét** (`PaymentGatewaySweeper`, trong tiến trình API, mỗi `PAYMENT_GATEWAY_SWEEP_INTERVAL_MS`, chỉ
chạy khi có cổng đủ khoá) phủ đúng ca IPN và trang quay về cùng hụt — khách trả trong app MoMo rồi đóng
luôn: hỏi cổng các lượt còn chờ đủ cũ (`SWEEP_MIN_AGE_MINUTES` – `SWEEP_MAX_AGE_DAYS`), và áp lại các lượt
đã thu mà lần áp trước hỏng. Nó nằm ở API chứ không ở `apps/worker` vì việc cần làm là ÁP TIỀN, và đường
đó chỉ sống trong `BillingService`/`BookingHoldsService` — viết lại ở worker là một writer thứ hai của
tiền. Nhiều tiến trình API chạy song song vẫn an toàn: lượt hỏi được claim bằng `last_queried_at`, lượt
áp khoá dòng.

### 6. Số tiền và hạn của phiên đến từ DB; không mở phiên thứ hai khi khoản trước đang ghi nhận

Số tiền gửi sang cổng = phần CÒN THIẾU của đích, đọc dưới khoá theo đích (`pg_advisory_xact_lock`).
Client không gửi số tiền, mã, hay đích nào ngoài ID trên đường dẫn — và quyền sở hữu nằm trong câu truy
vấn (khách: chủ khoản giữ chỗ; đối tác: tenant của phiên).

Phiên còn hạn (cùng cổng, cùng số tiền, cùng loại client) được DÙNG LẠI thay vì mở phiên thứ hai. Đích
đang có một khoản cổng ĐÃ THU mà chưa ghi nhận xong ⇒ `409 PAYMENT_ORDER_IN_PROGRESS`: mở phiên lúc đó
là mời trả hai lần. Hạn của phiên = `PAYMENT_GATEWAY_ORDER_TTL_MINUTES`, kẹp trước hạn của đích
`PAYMENT_GATEWAY_EXPIRY_MARGIN_MINUTES` phút; khoản giữ chỗ còn dưới
`PAYMENT_GATEWAY_MIN_HOLD_WINDOW_MINUTES` phút thì không mở phiên (`PAYMENT_HOLD_WINDOW_TOO_SHORT`). VNPAY
nhận hạn này qua `vnp_ExpireDate` và tự từ chối trả muộn; tài liệu MoMo `captureWallet` không công bố
tham số hạn, nên với MoMo một khoản trả muộn vẫn có thể tới — và đi qua luật tiền về muộn.

### 7. Không tự hoàn tiền qua cổng; người trực có ba thao tác

Lượt không áp được (đích đã đóng, lệch số tiền, cổng nghi ngờ, mã giao dịch trùng, trả trùng vào hoá
đơn, áp hỏng) vào **hàng đợi người xử lý** ở màn Tài chính nền tảng (`platform.billing.manage`, cùng
quyền với hàng đợi tiền vào ngân hàng). Người trực:

- **Hỏi lại cổng** — truy vấn ngay, bỏ qua nhịp; màn hình nói đúng kết quả (có gì mới / chưa có gì /
  không hỏi được), không luôn báo thành công.
- **Đóng lượt** kèm ghi chú và mã hoàn — ghi lại việc đã làm BÊN NGOÀI (vd hoàn tay qua portal của
  cổng). Không di chuyển tiền. Lượt đã đóng thì trang quay về, bộ quét và IPN đều KHÔNG tự áp nữa.
- **Ghi nhận khoản này** — chỉ khi cổng báo thu đúng số SAU khi lượt đã bị đóng (lý do
  `result_after_resolution`). Một đơn ở cổng là một giao dịch, nên khoản đó gần như chắc chắn là khoản
  người trực có thể đã hoàn; máy không tự áp, lượt mở lại với ghi chú và mã hoàn của lần trước. Người
  trực đối chiếu rồi tự quyết; server chạy đúng hàm áp tiền của webhook, ghi ghi chú và audit
  `payment_gateway_order.apply` trong cùng transaction. Lần đóng trước (ghi chú, người, mốc, mã hoàn)
  chuyển vào `before` của audit đó và mã hoàn cũ bị xoá khỏi dòng — để nó đứng cạnh kết luận "đã ghi
  nhận, chưa hoàn" là đọc thành "vừa ghi nhận vừa hoàn".

Mọi thao tác của người trực ghi `audit_logs`. API hoàn tiền của cổng CHƯA tích hợp.

### 8. Bật theo hai trục, mặc định tắt, fail closed

Phương thức mở cho một luồng = **luồng bật** (`PAYMENT_GATEWAY_SUBSCRIPTION`, `PAYMENT_GATEWAY_BOOKING_HOLD`)
**VÀ cổng đủ khoá** (mỗi cổng là nhóm bốn biến, khai nửa nhóm thì API từ chối boot). Thiếu một trong
hai: không nút nào hiện, checkout trả 503 `PAYMENT_GATEWAY_UNAVAILABLE`, IPN không xác nhận gì.

Release gate nằm ở env schema, không ở thói quen của người deploy:

- `APP_ENV=production` + **bất kỳ** luồng nào bật ⇒ **từ chối boot** khi ADR này còn Proposed. Lý do
  luồng gói cũng bị chặn: phí cổng (Q2), chứng từ (Q6) và vế đối soát tiền đang nằm ở merchant (Q5) chưa
  có câu trả lời. Gỡ chặn là một PR kèm ADR này chuyển Accepted, không phải một lần đổi biến.
- `APP_ENV=production` + luồng bật ⇒ `PAYMENT_GATEWAY_MODE` bắt buộc `live` (giữ cho lúc gỡ chặn).
- Môi trường đã triển khai ⇒ URL của cổng bắt buộc https.
- Staging được bật cả hai luồng ở `sandbox` để chuẩn bị và UAT.

## Còn mở — chặn production (chủ sản phẩm / pháp lý / tài chính quyết)

| # | Câu hỏi | Chặn | Mặc định hiện tại trong mã |
| --- | --- | --- | --- |
| Q1 | Ý kiến pháp lý về thu hộ tiền giữ chỗ QUA TRUNG GIAN THANH TOÁN (cùng gate L1) và điều khoản người dùng cho phương thức mới (L5) | Tiền giữ chỗ qua cổng ở production | Production từ chối boot |
| Q2 | Ai chịu phí cổng (MDR)? Nếu XePrime chịu: ghi chi phí ở đâu. Nếu cộng vào khách: là một dòng phí riêng, không được trừ vào `D`/`IV`/`IP` của bên khác (ADR 0028 điều 3) | Cả hai luồng | Không thu thêm phí; XePrime nhận ít hơn số khách trả. Production từ chối boot |
| Q3 | Hoàn tiền về khách: qua API hoàn của cổng (toàn phần/một phần) hay vào ví điểm như hiện nay? Hoàn vào ví một khoản mà cổng đã trừ phí là XePrime chịu phần phí đó | Tiền giữ chỗ | Luật hoàn hiện hành (ví điểm / chuyển tay) áp nguyên; không gọi API hoàn |
| Q4 | Tiền qua MoMo tới sau khi chỗ đã nhả: hoàn tự động hay tay, SLA bao lâu | Tiền giữ chỗ | Hàng đợi người xử lý, hoàn tay |
| Q5 | Đối soát: tiền đang nằm ở tài khoản merchant của cổng (chưa về ngân hàng) cần một vế "đang trên đường" và đối chiếu với báo cáo quyết toán của cổng; `dailyReconciliation` hiện chưa tính | Cả hai luồng (gate R2/R3 "khớp sổ hằng ngày") | Chưa có vế này |
| Q6 | Chứng từ/hoá đơn cho tiền gói thu qua cổng; tên đơn vị nhận trên trang cổng | Luồng gói | Như chuyển khoản |
| Q7 | Chuyển thừa hoá đơn gói (ADR 0016 điều 6 "ghi có kỳ sau") chưa có cơ chế tự động — áp cho cả SePay lẫn cổng | Luồng gói | Ghi bằng chứng ở `paid_amount`; khoản trả trùng qua cổng vào hàng đợi `overpaid` |
| Q8 | Hợp đồng merchant MoMo/VNPAY (production credentials), quyền `deeplink`/`qrCodeUrl` của MoMo nếu muốn mở thẳng app MoMo | Cả hai luồng | Dùng `payUrl` (trang web của MoMo) |

## Hệ quả

- Hai bảng mới `payment_gateway_orders` + `payment_gateway_order_events` (migration
  `20261009150000_payment_gateway_orders`), module mới `apps/api/src/modules/payment-gateway` (adapter
  MoMo/VNPAY + điều phối + bộ quét + hàng đợi quản trị).
- Endpoint: site khách `account/payment-gateway/*`, site partner `subscription/payment-gateway/*`, IPN
  công khai `payment-gateway/{momo,vnpay}/ipn` trên host API, quản trị `platform/payment-orders/*`
  (danh sách, chi tiết kèm nhật ký, hỏi lại, đóng, ghi nhận tay).
- Web: nút cổng dưới khối chuyển khoản (hoá đơn gói, tiền giữ chỗ), trang chuyến là trang quay về của
  tiền giữ chỗ (ẩn nút cổng khi lượt vừa quay về còn dùng được hoặc đang ghi nhận), trang
  `/payment-return` của site partner cho hoá đơn gói, hàng đợi "Cổng thanh toán cần xử lý" ở màn Tài
  chính.
- App native chưa có lối này (phần của đội mobile): mở `checkoutUrl` bằng trình duyệt ngoài với
  `client: native`; trang quay về web hiện nút mở lại app.
- Bí mật của cổng chỉ ở env backend; không đi vào bundle web/app, log, hay OpenAPI.

## Cần xem lại khi nào

- Khi các câu Q1–Q8 có câu trả lời — chuyển ADR này Accepted và gỡ chặn production tương ứng (luồng
  gói có thể gỡ trước luồng giữ chỗ nếu Q2/Q5/Q6 xong trước Q1).
- Khi muốn hoàn tiền tự động qua cổng (cần API refund + chính sách Q3/Q4).
- Khi tỉ lệ lượt rơi vào hàng đợi người xử lý vượt ~1% số lượt thành công — dấu hiệu IPN không tới hoặc
  cấu hình hạn phiên sai.
