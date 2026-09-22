# ADR 0046 — Mã khuyến mãi do NỀN TẢNG tài trợ

Ngày: 23/09/2026 · Trạng thái: Accepted · Mở rộng: 0029 điều 1–2, 0032 điều 2, 0033 điều 3–4, 0044 · Không ghi đè ADR nào

## Bối cảnh

XePrime đã có MỘT loại giảm giá: `vehicles.discount_percent` — khuyến mãi TRỰC TIẾP của chủ xe. Nó
đi vào `PRICE_ROW.DISCOUNT` và trừ thẳng vào `bookings.total_amount`, tức là chủ xe tự bớt doanh
thu của chính mình. Cơ chế đó đúng cho thứ nó làm, và không dùng lại được cho thứ sản phẩm cần
tiếp: **một mã khuyến mãi mà XePrime bỏ tiền ra để khách trả ít hơn, còn gian hàng vẫn nhận đủ.**

Ba lý do khiến "dùng lại cột `discount_amount`" là sai chứ không phải tiện:

1. **Hai loại giảm giá cộng dồn được trên cùng một chuyến.** Một chiếc xe đang giảm trực tiếp 10%
   vẫn phải nhận được mã 100.000đ của nền tảng. Gộp vào một cột là mất vĩnh viễn khả năng trả lời
   "ai đã bớt tiền cho chuyến này", và không có câu trả lời đó thì ngân sách tài trợ không đối soát
   được với bất cứ thứ gì.
2. **`total_amount` là sổ của gian hàng.** `PRICE_ROW` là hoá đơn của chủ xe với khách, và
   `totalAmount = Σ rows` là con số mà sổ thu chi của họ đọc (ADR 0029). Trừ tiền của XePrime vào
   đó là ghi một khoản giảm doanh thu cho một người không hề giảm giá.
3. **Đường tiền đã có ba bên.** Từ ADR 0032/0033, một khoản giữ chỗ chứa tiền của chủ xe (`D`),
   của XePrime (`S`) và của hãng bảo hiểm (`IV`/`IP`). Một khoản giảm không nói rõ nó lấy từ quỹ
   nào sẽ làm phép đối soát ba vế lệch đúng bằng số tiền đã giảm.

Thứ tự đặt xe của ADR 0044 thêm một ràng buộc nữa: giá chỉ được ĐÓNG BĂNG lúc chuyến được NHẬN,
còn khách áp mã ở bước xem giá — trước đó hàng chục phút. Nên một mã không phải một con số, nó là
một **lời hứa phải sống được qua khoảng giữa hai mốc đó**.

## Quyết định

### 1. Chỉ NỀN TẢNG phát hành mã; gian hàng không có đường nào

`promo_codes` KHÔNG có `tenant_id`, và đó là chủ đích ở tầng dữ liệu chứ không chỉ ở tầng quyền:
một mã thuộc về XePrime, không thuộc gian hàng nào. Đường ghi duy nhất là `PromoCodesService` sau
`@PlatformOnly()` + permission RIÊNG `platform.promo_codes.manage`.

Quyền tách khỏi `platform.fee_policies.manage` vì hai việc ngược chiều nhau về ngân sách: chính
sách phí đặt cách nền tảng **THU**, mã khuyến mãi là cách nền tảng **CHI**. Người được quyền đặt
tỷ lệ phí không nhất thiết được quyền phát hành ngân sách marketing.

Không có trang tương ứng ở khu Manage của gian hàng, và ẩn menu KHÔNG phải lớp chặn — chặn thật ở
controller (ADR 0027 điều 4).

### 2. Dòng tiền: mã chỉ trừ vào phần khách chuyển ONLINE

```text
  B            tiền thuê (doanh thu gian hàng)          ← mã KHÔNG đụng
  S, T, IV, IP tính trên B như trước                    ← mã KHÔNG đụng (giữ cơ sở tính)
  D            cọc theo chính sách nền tảng             ← mã KHÔNG đụng (quyền của chủ xe)
  grossOnline  = D + S + IV + IP  (đã kẹp sàn)          ← mã KHÔNG đụng
  P            = số giảm đã áp (XePrime tài trợ)
  holdAmount   = grossOnline − P                         ← con số in lên QR
  customerTotal= B + S + IV + IP − P
  payAtPickup  = B − D                                   ← mã KHÔNG đụng
  ownerPayable = D − T                                   ← mã KHÔNG đụng
  ownerNet     = B − T                                   ← mã KHÔNG đụng
```

`P` **chỉ** trừ vào khoản khách chuyển cho XePrime. Lý do là một điều kiện đủ: đó là khoản tiền
DUY NHẤT nền tảng thật sự cầm trong tay. Trừ vào `payAtPickup` là bắt chủ xe nhận ít tiền mặt hơn
rồi chờ nền tảng bù — một nghĩa vụ mới, với một bên không ký gì cả, và không có bảng nào ghi nó.

Hệ quả có chủ đích: **phí dịch vụ, thuế và bảo hiểm vẫn tính trên `B`**, không trên `B − P`. Mã là
tài trợ, không phải một lần hạ giá thuê — hạ mẫu số của `S` là để nền tảng tự giảm doanh thu của
mình hai lần cho cùng một chương trình.

### 3. Cộng dồn với khuyến mãi trực tiếp, và bốn cái trần

Tiền thuê ĐỦ ĐIỀU KIỆN = `PRICE_ROW.BASE − |PRICE_ROW.DISCOUNT|` (`promoEligibleAmount`). Tức là
**chủ xe bớt trước, nền tảng tài trợ sau**. Tính ngược lại (mã trên giá gốc) là nền tảng tài trợ
cho cả phần chủ xe đã bớt.

KHÔNG đủ điều kiện: phí giao nhận (công của người mang xe tới), phụ phí phát sinh sau chuyến, phí
dịch vụ, bảo hiểm, và **cọc thế chấp** (tiền khách lấy lại — giảm nó không giảm chi phí của ai).

Bốn trần, áp theo đúng thứ tự (`computePromoDiscount`):

1. trần của chính mã (`maxDiscountAmount`, chỉ mã phần trăm);
2. tiền thuê đủ điều kiện — không giảm nhiều hơn thứ đang được giảm;
3. `grossOnline − holdMinAmount` — dưới sàn đối soát thì mã QR không còn đáng thu, và một QR 0đ là
   một chuyến chiếm chỗ hai giờ mà không ai chuyển đồng nào (ADR 0044 điều 4);
4. `D + S` — phần TÀI TRỢ ĐƯỢC. Tuyệt đối không lấn vào `IV`/`IP`: đó là tiền giữ hộ hãng bảo
   hiểm, và XePrime vẫn phải chuyển đủ cho đối tác dù nó có giảm giá cho khách hay không
   (ADR 0033 điều 4).

Số giảm bị kẹp thì giao diện nói rõ con số ĐÃ ÁP; nó không bao giờ hiện mệnh giá rồi để khách tự
trừ. Trần (3) và (4) về 0 ⇒ mã trả `DISCOUNT_BELOW_FLOOR` thay vì trả `0`: một mã "giảm 0đ" là một
nút bấm được mà không có tác dụng.

**MỘT mã cho MỘT yêu cầu.** `promo_redemptions.booking_request_id` là UNIQUE — ràng buộc ở DB, nên
hai lượt bấm gửi song song chỉ có đúng một bên ghi được.

### 4. Hạch toán: bốn dòng tiền là QUYỀN LỢI, `amount` là TIỀN MẶT

`booking_holds` thêm `promo_discount_amount`, và CHECK cũ được viết lại thành:

```sql
deposit + service_fee + vehicle_insurance + personal_insurance − promo_discount = amount
```

Bốn dòng tiền vẫn mang **quyền lợi đầy đủ**: chủ xe nhận đủ `D`, hãng bảo hiểm nhận đủ `IV + IP`.
`amount` là con số khách thật sự chuyển. Hiệu giữa hai bên đúng bằng phần nền tảng tài trợ, và
`promo_discount_amount <= deposit + service_fee` là CHECK thứ hai gác trần (4) ở điều 3.

Phân bổ khi chốt kết cục (`resolveHoldAllocation`) giữ đúng một luật: **nền tảng gánh khoản tài
trợ ở cả ba kết cục, quyền lợi của những bên khác không đổi.**

| Kết cục | Chủ xe | Ngân sách | Hãng bảo hiểm | Nền tảng | Khách |
| --- | --- | --- | --- | --- | --- |
| `settled` | `D − T` | `T` | `IV + IP` | `S − P` (ÂM được) | — |
| `split_late_cancel` | `⌊(D+S)/2⌋` | — | — | phần dư `− P` | `IV + IP` |
| `refund_all` | — | — | — | 0 | `amount` (đúng số đã chuyển) |

Hai điểm đáng đọc kỹ:

- **`settled_platform_amount` ÂM được**, và không có CHECK nào đòi nó ≥ 0. Một mã 100.000đ trên
  một chuyến có phí dịch vụ 80.000đ là một khoản chi marketing thật, không phải lỗi làm tròn.
- **Hoàn toàn bộ chỉ hoàn số khách ĐÃ CHUYỂN**, trừ theo thứ tự cọc → phí dịch vụ (không bao giờ
  vào bảo hiểm). Hoàn cả `P` là biến mã khuyến mãi thành tiền mặt: đặt xe, huỷ trong cửa sổ miễn
  phí, và rút phần XePrime bỏ ra về ví điểm.

Trên đơn: `bookings.promo_code_id` + `promo_discount_amount`, và `total_amount` **không bị trừ**.
Số khách trả nằm ở `customer_total_amount`.

### 5. "Khách hàng mới" đo bằng DANH TÍNH, không bằng SĐT tự khai

Đối tượng `new_customer` = tài khoản CHƯA có yêu cầu nào từng `converted_to_booking`. Hai chi tiết
đóng đinh:

- Đo theo **đơn đã hình thành**, không theo số lượt gửi: một người gửi mười yêu cầu rồi không trả
  tiền lần nào vẫn chưa từng thuê xe của XePrime.
- Danh tính là `users.id`, và khách vãng lai cũng có — `submitPublic` quy SĐT đã qua OTP về một tài
  khoản (`resolveOrCreateUserByPhone`) TRƯỚC khi giữ lượt. Nên không có đường nào giữ lượt mà
  không có danh tính đã xác thực, và `promo_redemptions.customer_user_id` là `NOT NULL`.

### 6. Vòng đời lượt dùng: GIỮ → CHỐT → NHẢ

| Mốc | Việc |
| --- | --- |
| Khách GỬI yêu cầu | GIỮ lượt (`reserved`), đóng băng điều kiện vào `promo_snapshot_json` |
| ĐƠN hình thành | CHỐT (`redeemed`) — nhánh không thu tiền giữ chỗ chốt lúc duyệt; nhánh có thu chốt trong transaction đối soát tiền về |
| Yêu cầu chết trước khi thành đơn | NHẢ (`released`) kèm lý do |

Xem trước **KHÔNG giữ lượt**: nó là một lượt đọc, và giữ lượt ở đó thì một vòng lặp `curl` dùng
cạn một chiến dịch trong vài giây.

**Đơn đã hình thành rồi bị huỷ KHÔNG khôi phục lượt.** Quy tắc này được THI HÀNH bằng điều kiện
`status = 'reserved'` trong câu `UPDATE` của `releasePromoRedemption` — lượt đã `redeemed` không
khớp, nên mọi đường huỷ đơn gọi vào đó đều không làm gì cả, và không ai phải nhớ kiểm. Lý do
nghiệp vụ: huỷ trong cửa sổ miễn phí không mất đồng nào, nên nếu huỷ mà hoàn lượt thì vòng "đặt
rồi huỷ" biến một mã dùng-một-lần thành mã dùng vô hạn. Màn quản trị nói rõ điều này trong form.

**Chống dùng vượt hạn mức khi nhiều yêu cầu tới đồng thời** — hai cơ chế DB, không có câu `if` nào
ở tầng app gác chúng:

- **Trần TỔNG**: `UPDATE promo_codes SET reserved_count = reserved_count + 1 WHERE … AND
  (total_usage_limit IS NULL OR reserved_count < total_usage_limit)`. Một câu lệnh vừa đọc vừa
  ghi, nên Postgres tuần tự hoá hai transaction trên chính hàng đó và bên đến sau trượt mệnh đề
  `WHERE`. `CHECK promo_codes_counters_check` là chốt chặn cuối.
- **Trần MỖI KHÁCH**: `pg_advisory_xact_lock` trên `(promoCodeId, customerUserId)` rồi mới đếm.
  `READ COMMITTED` cho hai transaction cùng đọc "đang có 0" rồi cùng ghi, và không ràng buộc DB
  nào diễn đạt được "≤ N dòng thoả một vị từ" — nên thứ duy nhất còn lại là tuần tự hoá theo
  KHÁCH. Cùng khuôn với `assertHoldQuotaWithinTx` (ADR 0044).

Vòng đời này sống ở `@xeprime/prisma` (`promo-redemption.ts`) vì HAI tiến trình phải thực hiện nó:
API (giữ/chốt/nhả trên đường nghiệp vụ) và worker (nhả khi yêu cầu quá hạn phản hồi, và khi khách
không trả tiền giữ chỗ đúng hạn). Cùng lý do với `badges.ts` và `push-outbox.ts`.

### 7. Ba cửa kiểm, và mã đã áp thì đọc từ SNAPSHOT

| Cửa | Nơi | Việc |
| --- | --- | --- |
| Xem trước | `POST /public/promo-codes/preview` | đọc thuần, không giữ lượt |
| Gửi yêu cầu | `submitPublic` | đánh giá lại + GIỮ lượt + đóng băng điều kiện |
| Chốt giá | `commitDecision` (duyệt tay và tự nhận) | tính lại từ SNAPSHOT, đóng băng vào `BookingPriceSnapshot` |

Cửa thứ ba tính lại từ `booking_requests.promo_snapshot_json`, **không** đọc lại `promo_codes`:
admin sửa mức giảm, tắt hoặc xoá mềm chiến dịch giữa lúc khách chờ duyệt là việc bình thường, còn
lời hứa đã hiện trên màn hình của khách thì không được viết lại. Những gì VẪN kiểm ở cửa ba là các
điều kiện phụ thuộc SỐ TIỀN (đơn tối thiểu, các trần) — vì giá có thể đã đổi khi gian hàng sửa giá
xe hoặc chốt lịch dài hạn.

Mã hết đủ điều kiện ở cửa ba ⇒ **nhả lượt + BÁO KHÁCH** (`NOTIFICATION_TYPE.PROMO_CODE_DROPPED`),
lượt duyệt vẫn đi tiếp. Chặn lượt duyệt là phạt gian hàng cho một chi tiết marketing; im lặng bỏ
mã là tăng tiền khách phải trả mà không nói. Khách luôn còn thời gian vì ADR 0044 đặt việc thu
tiền SAU lượt duyệt.

### 8. Sửa mã đã dùng: khoá đúng những trường làm lịch sử bị hiểu sai

Chiến dịch đã phát sinh lượt (`reserved_count > 0`) thì `PROMO_LOCKED_FIELDS_AFTER_USE` bị khoá:
mã, hình thức + mức giảm, trần, đơn tối thiểu, đối tượng và mọi phạm vi. Sửa chúng làm bảng lượt
sử dụng và báo cáo tài trợ mô tả hai thứ khác nhau — kể cả khi từng lượt vẫn giữ snapshot riêng.

Vẫn sửa được: tên, mô tả, nới thời gian, nới trần lượt, và **bật/tắt**. Chúng không viết lại một
lượt nào đã xảy ra. Đường để "sửa một chiến dịch đang chạy" là **NHÂN BẢN** — bản sao ra đời ở
trạng thái TẮT để người ta soát lại số trước khi nó chạy thật.

Xoá là **xoá MỀM**, và `promo_redemptions.promo_code_id` là `RESTRICT`: kể cả một `deleteMany` viết
sai cũng bị DB chặn, nên lịch sử giá của những đơn đã dùng mã không thể mất.

### 9. Endpoint công khai: không lộ gì về khách, không cho dò mã

- **Danh tính đến từ COOKIE/BEARER, không từ payload.** DTO xem trước không có ô SĐT, nên không có
  cách nào hỏi "số này đã từng thuê xe chưa". Khách chưa đăng nhập áp một mã có điều kiện theo
  người thì nhận `REQUIRES_IDENTITY` — một câu trả lời không nói gì về ai.
- **Rate limit siết hơn mức chung của app** (20 req/phút cho xem trước, 30 cho danh sách). Mã là
  một không gian tên ngắn nên nó dò được bằng từ điển; con số này là trần cứng cho việc đó.
- **Chỉ mã đã `listed` ra tới danh sách công khai.** Mã riêng gửi cho một nhóm khách qua email/SMS
  chỉ dùng được khi gõ tay.
- `POST` cho một lượt ĐỌC là chủ đích: mã không nên nằm trên URL — nó đi vào log truy cập, lịch sử
  trình duyệt và referer.

### 10. Chuyến KHÔNG thu trước thì không áp được mã

Điều kiện là `fees.holdAmount != null`, không phải `grossOnlineAmount > 0`. Một báo giá TẠM TÍNH
(thuê dài hạn chưa chốt lịch, giá lộ trình chưa niêm yết) vẫn có `S + IV + IP` khác 0 nhưng
XePrime chưa thu đồng nào của nó — tài trợ ở đó là hứa một khoản giảm trên một con số chưa chốt
(ADR 0044 điều 4). Giao diện nói thẳng điều đó thay vì mời gõ một mã sẽ bị từ chối.

## Hệ quả

- **Hai loại giảm giá phân biệt được ở mọi bề mặt và mọi bảng.** `discount_amount` là của chủ xe,
  `promo_discount_amount` là của nền tảng; báo cáo tài trợ đọc cột thứ hai và chỉ đếm lượt đã CHỐT
  (lượt đang giữ chưa tiêu đồng nào).
- **`settled_platform_amount` nay có thể âm.** Mọi phép đọc "doanh thu nền tảng" phải đọc nó như
  một con số NET; phí dịch vụ gộp vẫn nằm ở `service_fee_amount`.
- **Thuê dài hạn chưa áp được mã** ở đợt này (điều 10). Mở được khi nào lượt duyệt chốt lịch xong
  cho khách một cửa áp mã thứ hai — và đó là một quyết định sản phẩm, không phải một việc còn dở.
- **Khu vực áp dụng (`province_codes`) có ở dữ liệu/API/phép kiểm nhưng form admin chưa có ô chọn
  tỉnh**, nên mọi mã tạo từ giao diện là toàn quốc. Ghi ra đây để nó không bị hiểu là một lỗ hổng
  kiểm tra.
- `booking_requests.promo_snapshot_json` là bản ghi giải thích giá lịch sử. Không đường nào tính
  lại một đơn cũ theo mã đang hiệu lực hôm nay.

## Phương án đã cân nhắc và bỏ

- **Dùng lại `PRICE_ROW.DISCOUNT` / `bookings.discount_amount`.** Rẻ nhất về code và đắt nhất về
  sổ sách: mất khả năng phân biệt ai bớt tiền, và ghi một khoản giảm doanh thu cho gian hàng
  không hề giảm giá.
- **Cho mã trừ vào `payAtPickupAmount` khi nó lớn hơn khoản online.** Sẽ mở được mã lớn hơn
  `D + S`, nhưng đổi lại nền tảng nợ chủ xe một khoản tiền mặt mà khách không trả — một dòng công
  nợ mới, cho một bên không ký gì, ở đúng chỗ tiền dễ lạc nhất.
- **Giữ lượt ngay khi khách XEM TRƯỚC.** Trông "an toàn" hơn cho khách, nhưng biến mọi chiến dịch
  thành thứ dùng cạn được bằng một vòng lặp `curl`, và mọi giỏ hàng bỏ dở thành một lượt bị treo.
- **Tính `S`/`T`/`IV`/`IP` trên `B − P`.** Khách trả ít hơn một chút nữa, nhưng nền tảng tự giảm
  doanh thu HAI LẦN cho cùng một chương trình, và cơ sở tính của ba dòng tiền của ba người khác
  nhau bị đổi bởi một quyết định marketing.
- **Chặn lượt duyệt khi mã hết đủ điều kiện.** Đúng về mặt "không ai bị bất ngờ", nhưng nó phạt
  gian hàng cho một việc họ không gây ra, và khách thì vẫn phải chờ thêm một vòng thoả thuận.
- **Cho gian hàng tự phát hành mã.** Là một tính năng thật và có thể sẽ tới, nhưng nó là một dòng
  tiền KHÁC (họ tự bớt doanh thu của mình) và vì thế là một bảng khác, một quyền khác, một báo cáo
  khác. Trộn vào đây là để một ngày nào đó không ai biết ngân sách tài trợ của XePrime đang là bao
  nhiêu.
