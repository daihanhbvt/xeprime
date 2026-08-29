# ADR 0026 — Hai chuyến đầu miễn phí; từ chuyến thứ ba rơi về tuyến hoa hồng và được chào gói

Ngày: 29/08/2026 · Trạng thái: Accepted · **Mở rộng [ADR 0020](0020-two-revenue-tracks-one-marketplace.md) và [ADR 0024](0024-billing-mode-from-plan-frozen-on-booking.md)**

## Bối cảnh

[ADR 0020](0020-two-revenue-tracks-one-marketplace.md) kết luận tuyến hoa hồng là **phễu thu hút**,
không phải nguồn thu chính. Nhưng ngay cả phễu vẫn còn một bậc thềm: chủ xe mới chưa biết sàn có
khách hay không, mà đã phải chấp nhận mất 10–15% hoặc mua gói trả trước.

[ADR 0015 điều 9](0015-vehicle-slot-billing.md) từng giải bằng **gói miễn phí có hạn ngày**
(~6 tháng). Cách đó thưởng cho người *đăng ký sớm*, không thưởng cho người *bắt đầu cho thuê* —
một chủ xe mở gian hàng rồi để đó ba tháng đã tiêu mất nửa ưu đãi mà chưa nhận được gì.

Đếm theo **CHUYẾN** thì ưu đãi bám đúng vào thứ người ta quan tâm: chuyến đầu tiên có tiền về.

## Quyết định

1. **Hai đơn đầu tiên của một tenant là miễn phí hoàn toàn**: `commission_percent = 0`, **không thu
   khoản giữ chỗ**. `FREE_TRIP_ALLOWANCE = 2`, hằng số dùng chung, không phải số rải trong code.

2. **Đếm theo ĐƠN ĐƯỢC TẠO, không theo chuyến hoàn thành.**

   Đếm theo chuyến hoàn thành nghe công bằng hơn nhưng mở đúng một lỗ: đặt rồi huỷ vô hạn mà không
   bao giờ tiêu hết ưu đãi. Đếm theo đơn tạo thì lỗ đó đóng, và cái giá phải trả — một chủ xe xui
   bị khách huỷ hai lần là hết ưu đãi — được bù bằng điều 6.

3. **Từ đơn thứ ba, tenant rơi vào tuyến hoa hồng** ([ADR 0020](0020-two-revenue-tracks-one-marketplace.md)):
   mất 10–15%, thu qua khoản giữ chỗ ([ADR 0021](0021-booking-hold-is-the-commission.md)).

4. **Đồng thời sinh sẵn hoá đơn gói và nhắc — KHÔNG tự kích hoạt gói.**

   "Tự động đăng ký gói" ở mức *tạo hoá đơn + phát VietQR + nhắc* là làm được và nên làm. Ở mức
   *mở quyền dùng gói khi chưa có tiền về* là **không làm được**: chuyển khoản ở Việt Nam là **đẩy**
   ([ADR 0016 điều 3](0016-sepay-bank-reconciliation.md)), nền tảng không tự trừ tiền của ai. Kích
   hoạt gói chưa trả tiền = cho hàng nghìn cá nhân nợ mỗi người vài trăm nghìn, rồi đi đòi — chi
   phí đòi vượt số tiền đòi.

   Gói bật lên **do webhook báo tiền đã về**, không do bất cứ sự kiện nào khác
   ([ADR 0016 điều 4](0016-sepay-bank-reconciliation.md)).

5. **Hai chuyến miễn phí KHÔNG có "đặt & giữ chỗ ngay".**

   Đây là hệ quả trực tiếp và phải nói ra, vì nó nghe như một lỗi: cơ chế giữ chỗ tức thì hoạt động
   được là **nhờ** có khoản tiền khách chuyển ([ADR 0021 điều 1](0021-booking-hold-is-the-commission.md)).
   Không thu tiền thì không có gì để giữ chỗ, nên hai chuyến đầu đi **luồng gửi yêu cầu** như tuyến
   gói. Ưu đãi nằm ở chỗ chủ xe **giữ trọn 100% tiền chuyến**, không nằm ở trải nghiệm đặt.

6. **Ưu đãi chỉ tiêu khi đơn thật sự phát sinh.** Đơn bị huỷ **trước giờ nhận xe do gian hàng** hoặc
   bị nền tảng gỡ (vi phạm, trùng lịch, lỗi hệ thống) **hoàn lại lượt** — ghi rõ lý do hoàn, có
   audit. Khách huỷ thì **không** hoàn lượt: chuyến đó đã chiếm lịch thật và tiêu công thật.

7. **Đóng băng như mọi đơn khác.** Đơn miễn phí vẫn ghi `billing_mode`, `commission_percent = 0`,
   `commission_amount = 0` và `platformFee` vào snapshot
   ([ADR 0024 điều 4](0024-billing-mode-from-plan-frozen-on-booking.md)). Không có nhánh "đơn không
   có thông tin thu phí" — một đơn thiếu snapshot là một đơn không giải thích được về sau.

8. **Số lượt đã dùng là một CỘT trên `tenants`, không phải một phép đếm lúc đọc.**

   Đếm `bookings` mỗi lần tạo đơn là một câu truy vấn trên bảng nóng nhất, và tệ hơn: hai đơn tạo
   đồng thời cùng đọc ra "đã dùng 1" rồi cùng cho miễn phí. Cột `free_trips_used` tăng **trong cùng
   transaction tạo đơn**, ràng buộc `CHECK (free_trips_used >= 0)`.

## Lý do chọn hai, không phải một hoặc năm

Một chuyến không đủ để biết sàn có khách đều hay không — chủ xe vẫn phải đoán. Năm chuyến thì với
xe chạy tốt là gần một tháng doanh thu miễn phí, tức nền tảng trả tiền cho nhóm đông nhất mà không
đổi được gì. Hai chuyến đủ để thấy quy trình chạy hết một vòng (đặt → giao → trả → đánh giá) hai
lần, và vẫn nằm trong tuần đầu với xe có khách.

Con số nằm ở `FREE_TRIP_ALLOWANCE` nên đổi được. Nhưng đổi nó **không hồi tố**: tenant đã tiêu lượt
theo mức cũ giữ nguyên mức cũ — cùng kỷ luật đóng băng của
[ADR 0024](0024-billing-mode-from-plan-frozen-on-booking.md).

## Chống lách

- **Một người mở nhiều gian hàng để lấy lại ưu đãi.** `registerShop` đã từ chối người đang có
  membership hoạt động, nên lách phải qua tài khoản mới + SĐT mới (đã xác thực OTP). Đợt này
  **không xây thêm rào**, nhưng ghi `audit_logs` khi một tenant tiêu hết lượt để sau này dò cụm.
- **Tự đặt xe của chính mình cho hết lượt rồi bán tiếp không mất phí.** Không lợi gì: tiêu lượt là
  mất ưu đãi, không phải nhận ưu đãi. Lỗ này không tồn tại.

## Hoãn có chủ đích

- **Ưu đãi theo giới thiệu** (mời được chủ xe khác thì thêm lượt). Cần cơ chế giới thiệu, chưa có.
- **Ưu đãi lại cho tenant quay lại sau thời gian dài ngừng.** Nghe hợp lý nhưng chưa có dữ liệu để
  chọn ngưỡng, và mở sớm thì thành đường lách của mục trên.
- **Hoàn lượt khi khách huỷ trước 4h.** Cố ý không làm ở điều 6: khách huỷ sớm vẫn đã chiếm lịch
  một quãng, và phân biệt "huỷ sớm" với "huỷ muộn" ở đây tạo thêm một luật cho người dùng phải nhớ.

## Hệ quả

- `tenants` thêm `free_trips_used`; hằng số `FREE_TRIP_ALLOWANCE` ở `packages/types`.
- Đường quyết định chế độ thu phí ([ADR 0024 điều 1](0024-billing-mode-from-plan-frozen-on-booking.md))
  có thêm một bậc **trước** khi hỏi gói: còn lượt miễn phí thì 0%, hết lượt mới hỏi gói hiện hành.
- Luồng đặt xe phải biết trước là chuyến này có thu giữ chỗ hay không, để hiện đúng nút — cùng chỗ
  đã chặn "đặt ngay" với thuê dài hạn và giá tạm tính
  ([ADR 0021 điều 8](0021-booking-hold-is-the-commission.md)).
- Màn "Gói của tôi" phải hiện **còn mấy lượt** và điều gì xảy ra khi hết — người dùng không được
  bất ngờ ở đơn thứ ba.
- Sinh hoá đơn gói tự động khi tiêu hết lượt: một việc mới của job vòng đời gói (W2).

## Cần xem lại khi nào

Khi tỉ lệ tenant dừng lại đúng ở chuyến thứ hai vượt ~40% — nghĩa là bậc thềm chưa được gỡ, chỉ
được dời. Hoặc khi chi phí ưu đãi (số chuyến miễn phí × hoa hồng lẽ ra thu được) vượt chi phí thu
hút khách bằng cách khác.
