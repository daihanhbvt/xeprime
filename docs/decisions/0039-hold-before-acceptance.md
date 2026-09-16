# ADR 0039 — Giữ chỗ trả tiền trước khi gian hàng duyệt

Ngày: 16/09/2026 · Trạng thái: Accepted · Ghi đè một phần: 0032 (điều 2), 0027 (điều 2 trong phạm vi công tắc cọc) · Liên quan: 0006, 0011, 0021, 0022, 0024, 0033

## Bối cảnh

Thứ tự của ADR 0032 là: khách gửi yêu cầu → gian hàng duyệt → hệ thống phát QR → khách trả trong 2 giờ → đơn thuê ra đời.

Ba vấn đề lộ ra khi đưa luồng này vào dùng thật:

1. **Khách bấm đặt xong không có gì để làm và không có gì bảo đảm.** Yêu cầu `pending_host_approval` cố ý không chiếm lịch (ADR 0006), nên hai khách có thể cùng "đặt" một chiếc xe rồi một người bị loại sau hàng giờ chờ đợi. Người bị loại không làm gì sai và cũng không được báo trước rằng chỗ của họ chưa có thật.
2. **Gian hàng phải quyết định trước khi biết khách có nghiêm túc không.** Họ duyệt, chiếm lịch xe, rồi chờ hai tiếng xem tiền có về không. Tỷ lệ không về là chi phí của họ.
3. **Cửa sổ 2 giờ quá dài cho một chỗ chưa có tiền**, nhưng không rút ngắn được chừng nào nó còn bắt đầu sau một bước duyệt của con người — chủ xe có thể duyệt lúc nửa đêm.

Đồng thời, quyết định sản phẩm ngày 16/09/2026 bật thu cọc cho **toàn bộ** gian hàng (xem `DEPOSIT_COLLECTION_PLATFORM_MANDATORY`), nên "chuyến có thu cọc" không còn là một nhánh thiểu số mà là đường chính của cả sàn.

## Quyết định

### 1. Tiền đi trước, gian hàng duyệt sau

Khoản giữ chỗ sinh ra **lúc khách gửi yêu cầu**, không phải lúc gian hàng duyệt.

```
khách gửi ──► booking_holds (pending) + CHIẾM LỊCH + mã XPH…   [booking_requests: awaiting_hold]
    │            khách quét QR ngay trên màn chi tiết chuyến
    ├─ tiền đủ ─► hold: paid                                    [booking_requests: hold_paid]
    │              ├─ xe bật "Đặt ngay" ⇒ hệ thống nhận ngay ⇒ ĐƠN THUÊ
    │              └─ còn lại ⇒ chờ gian hàng duyệt
    │                    ├─ duyệt   ⇒ ĐƠN THUÊ                  [converted_to_booking]
    │                    ├─ từ chối ⇒ HOÀN 100%, nhả chỗ        [rejected_by_host]
    │                    └─ quá hạn ⇒ HOÀN 100%, nhả chỗ        [rejected_by_host]
    └─ hết giờ ─► hold: expired, nhả chỗ                        [hold_expired]
```

`booking_requests.status = hold_paid` là trạng thái mới. Nó **chiếm lịch** — khách đã trả tiền thật cho chỗ đó.

Không gộp được vào `pending_host_approval`: hai trạng thái khác nhau ở đúng điểm tốn kém nhất — một bên không chiếm lịch và không có đồng nào của khách, bên kia thì cả hai. Nhầm chúng nghĩa là một đơn có tiền bị dọn bằng đường dọn yêu cầu suông.

### 2. Cửa sổ trả tiền 10 phút

`hold_payment_window_minutes` 120 → **10** (chính sách phí v5). Hai con số, đừng lẫn:

- `HOLD_PAYMENT_WINDOW_MINUTES = 10` — đồng hồ khách nhìn thấy;
- `HOLD_TOTAL_WINDOW_MINUTES = 30` — bao lâu thì chiếc xe chắc chắn được nhả.

Rút ngắn được vì mốc bắt đầu nay là hành động của **khách** (họ đang ngồi trước màn hình), không phải của chủ xe (có thể đang ngủ). Phải rút ngắn vì chỗ bị khoá trước cả khi chủ xe kịp nhìn thấy yêu cầu.

`HOLD_MIN_USABLE_WINDOW_MINUTES = 5` phải luôn **nhỏ hơn** cửa sổ: hạn trả tiền bị kẹp bởi giờ nhận xe, và ngưỡng lớn hơn cửa sổ sẽ từ chối **mọi** hold ngay lúc tạo.

### 3. Hai lần tự gia hạn, không cần khách bấm

Hold hết hạn mà chưa đủ tiền và `extension_count < 2` ⇒ worker cộng thêm một cửa sổ và tăng bộ đếm, **tính từ `now`** để khách thấy đúng mười phút như lần đầu. Mỗi lần phát một thông báo và nói rõ lần cuối.

Đánh đổi đã biết và chấp nhận: xe có thể bị giữ đủ 30 phút kể cả khi khách bỏ đi từ phút thứ hai. Đổi lại, không ai mất chỗ vì ngân hàng xử lý chậm hơn một đồng hồ mười phút. `extension_count` được ghi lại nên số lần gia hạn thật đo được để hiệu chỉnh sau.

Điều kiện `extension_count < HOLD_MAX_EXTENSIONS` nằm trong chính câu `UPDATE`; `CHECK` ở DB là lớp gác cuối.

Lượt "nhắc sắp hết hạn" của ADR 0032 bị **bỏ**: nó chia cửa sổ 2 giờ thành hai chặng 60 phút, với cửa sổ 10 phút nó sẽ bắn ngay khi hold vừa tạo. Việc cần làm ở mốc đó nay là cộng thêm thời gian, không phải hối thúc.

### 4. Hai ngoại lệ giữ nguyên thứ tự cũ

Hai loại chuyến **không** chốt được số tiền lúc khách gửi, nên chúng giữ thứ tự duyệt-trước-cọc-sau:

- **Thuê dài hạn** — khách chỉ nêu nguyện vọng ngày nhận, gian hàng chốt lịch khi duyệt (ADR 0011). Chưa có lịch thì chưa có giá.
- **Báo giá còn tạm tính** (`estimateNote != null`) — không thu phần trăm trên một con số chưa chốt.

Với hai ca này, gian hàng **đã nhận chuyến trước khi tiền về**, nên tiền đủ là mở đơn ngay — không bắt duyệt lần thứ hai. Phép phân biệt đọc từ `booking_requests.decided_at`: đường mặc định cố ý để trống cột đó vì chưa ai quyết định gì.

### 5. Gian hàng không nhận ⇒ hoàn 100%

Từ chối, hoặc quá hạn phản hồi sau khi khách đã cọc ⇒ hoàn **toàn bộ** `D + S + IV + IP`, nhả chỗ. Không chia đôi, không giữ phí dịch vụ.

`split_late_cancel` tồn tại để bù cho gian hàng khi họ **đã nhận** chuyến, đã giữ xe và mất cơ hội cho khách khác. Ở chặng này họ chưa nhận gì cả; giữ lại tiền của khách cho một cam kết chưa từng được đưa ra là lấy tiền không có căn cứ. Cùng lý do, **khách huỷ khi gian hàng chưa nhận cũng được hoàn 100%** — và luật đó không dựa vào phép cộng "chặng này luôn nằm trong cửa sổ huỷ miễn phí", dù trên thực tế đúng là vậy.

Khoản hoàn đi qua đúng đường đang chạy (ADR 0033 điều 5): khách có tài khoản thì ghi có **ví điểm** ngay trong cùng transaction, khách vãng lai thành phiếu chờ admin chuyển tay.

### 6. Đồng hồ phản hồi của gian hàng bắt đầu lại khi tiền về

`respond_by` được đặt lại tại thời điểm hold chuyển `paid`. Nghĩa vụ trả lời chỉ phát sinh khi tiền đã về; giữ mốc đặt lúc khách gửi sẽ đẩy chủ xe vào thế quá hạn ngay lập tức khi khách trả ở phút cuối, rồi worker hoàn tiền trước cả khi gian hàng kịp nhìn thấy thông báo.

### 7. Chữ dùng cho khách

Trước khi trả tiền, chuyến **chưa** là "đơn thuê đã xác nhận". Nhãn theo chặng:

| Chặng | Chữ |
| --- | --- |
| `awaiting_hold` | Chờ thanh toán giữ chỗ |
| `hold_paid` | Đã giữ chỗ · chờ chủ xe xác nhận |
| `converted_to_booking` | Đơn thuê đã được xác nhận |

## Hệ quả

- **Gian hàng nhận ít thông báo hơn ở bước gửi**: đường mặc định không báo "có yêu cầu mới" lúc khách bấm, mà báo khi tiền đã về — lúc đó mới có việc để làm. Một thông báo cho mỗi lượt bấm đặt sẽ biến hộp thư gian hàng thành nơi không ai đọc nữa.
- **Xe bị khoá bởi yêu cầu chưa trả tiền.** Hàng rào là `HOLD_MAX_OPEN_PER_CUSTOMER = 3` (ADR 0021 ràng buộc 4) cộng với cửa sổ 30 phút. Cần theo dõi và siết nếu bị lạm dụng.
- **Chuyến sát giờ không cọc trước được** khi phần cửa sổ còn lại dưới 5 phút — rơi về thoả thuận trực tiếp với gian hàng.
- `booking_holds.payment_reminded_at` và `NOTIFICATION_TYPE.HOLD_EXPIRING` đổi vai: cột không còn được ghi, loại thông báo nay mang nghĩa "đã gia hạn". Giữ lại để không mất lịch sử.

## Phương án đã cân nhắc và bỏ

- **Giữ nguyên thứ tự cũ, chỉ rút cửa sổ.** Không giải quyết được vấn đề 1 và 2: chỗ vẫn chưa có thật lúc khách bấm đặt.
- **Bỏ hẳn bước duyệt của gian hàng.** Nhanh nhất cho khách nhưng tước quyền từ chối của chủ xe, và không xử lý được chuyến có tài xế (phải gán tài xế trong chính transaction tạo đơn để `bookings_driver_schedule_excl` gác được).
- **Không chiếm lịch khi chưa trả tiền.** Không ai khoá xe miễn phí được, nhưng đẩy rủi ro về phía người đã trả tiền: họ có thể chuyển khoản xong mới phát hiện mất chỗ và phải chờ hoàn.
- **Khách bấm nút để gia hạn.** Đồng hồ nói thật hơn và nhả chỗ sớm hơn khi khách bỏ đi, nhưng thêm một thao tác đúng vào lúc khách đang bận thao tác với app ngân hàng.
