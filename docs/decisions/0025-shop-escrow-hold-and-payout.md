# ADR 0025 — Gian hàng được bật thu cọc qua sàn: nền tảng GIỮ TIỀN HỘ và có đường chuyển trả

Ngày: 29/08/2026 · Trạng thái: Accepted · **Thu hẹp [ADR 0021](0021-booking-hold-is-the-commission.md) điều 1 · viết lại [ADR 0023](0023-wallet-refund-and-compensation.md) điều 1–2**

## Bối cảnh

[ADR 0021](0021-booking-hold-is-the-commission.md) mua được một sự đơn giản lớn bằng một mẹo:
khoản giữ chỗ **đúng bằng** hoa hồng, nên nền tảng giữ luôn và **không bao giờ phải chuyển trả cho
ai**. Không escrow, không payout, không nghĩa vụ trung gian thanh toán — đúng lý do gốc của
[ADR 0013](0013-no-online-payment-mvp.md).

Mẹo đó chỉ chạy được ở tuyến hoa hồng. Gian hàng tuyến gói trả **0% trên chuyến**, nên bất kỳ đồng
nào khách chuyển cho nền tảng thay mặt họ đều là **tiền của người khác**.

Nhưng gian hàng có một vấn đề thật mà tuyến A đã giải: **khách đặt rồi không đến**. Tuyến A chống
được vì có khoản giữ chỗ; tuyến B thì không có công cụ nào ngoài gọi điện.

Hai đường ra đã được cân nhắc:

| | Nền tảng không cầm tiền | Nền tảng thu hộ |
| --- | --- | --- |
| Cách làm | VietQR trỏ thẳng tài khoản gian hàng; shop tự bấm xác nhận đã nhận | Tiền vào tài khoản nền tảng, đối soát tự động, rồi chuyển trả shop |
| Trải nghiệm | Shop phải tự đối chiếu, có thể gian dối hoặc quên | Giống hệt tuyến A, tự động hoàn toàn |
| Cái giá | Gần như bằng không | **Giữ tiền của người khác** — payout, đối soát hai chiều, tranh chấp, nghĩa vụ pháp lý |

**Quyết định của chủ sản phẩm là đường thứ hai**, sau khi cái giá đã được nêu rõ. ADR này ghi lại
quyết định đó **cùng toàn bộ cái giá của nó**, để người đọc sau này không phải đoán rằng chi phí
đã bị bỏ sót.

## Quyết định

1. **Khoản giữ chỗ có HAI MỤC ĐÍCH, phân biệt bằng cột `purpose`**, không phải bằng suy luận từ
   chế độ thu phí:

   | `purpose` | Tiền của ai | Nền tảng có được giữ không |
   | --- | --- | --- |
   | `commission` | **Của nền tảng** — chính là phí dịch vụ ([ADR 0021](0021-booking-hold-is-the-commission.md)) | Có, khi chuyến hoàn thành |
   | `escrow` | **Của gian hàng** — nền tảng chỉ giữ hộ | **Không bao giờ** |

   Suy `purpose` từ `billing_mode` lúc đọc là sai: chế độ thu phí của tenant đổi được, còn mục đích
   của một khoản tiền đã nhận thì không. Cột này **đóng băng lúc tạo hold**, cùng kỷ luật
   [ADR 0024](0024-billing-mode-from-plan-frozen-on-booking.md).

2. **`escrow` là TÍNH NĂNG CỦA GÓI, chỉ tenant tuyến gói bật được.** Cờ nằm trong
   `plans.limits_json.features`, bật/tắt ở cấp gian hàng. Tenant tuyến hoa hồng không có lựa chọn
   này — họ đã có `commission` hold rồi, và hai khoản chồng nhau trên một chuyến là hai lần thu
   tiền khách.

3. **Số tiền escrow do GIAN HÀNG đặt**, không phải phần trăm hoa hồng — nó là công cụ chống bỏ
   chuyến của họ, không phải doanh thu của nền tảng. Nhưng có **trần cứng trong code**:
   không vượt `ESCROW_MAX_PERCENT` của tổng chuyến. Không có trần thì "cọc giữ chỗ" biến thành
   thu tiền thuê trước, và lúc đó nền tảng đang giữ hộ gần như cả chuyến tiền.

4. **Nền tảng KHÔNG BAO GIỜ giữ lại một đồng escrow nào.** Ba kết cục, không có kết cục thứ tư:

   | Tình huống | Kết cục | Tiền về |
   | --- | --- | --- |
   | Chuyến hoàn thành | `released_to_shop` *(giá trị MỚI)* | Ví gian hàng |
   | Khách huỷ **sau** `free_cancel_until`, hoặc không đến | `forfeited` | Ví gian hàng |
   | Khách huỷ **trước** mốc | `refunded` | Ví khách |

   `kept` chỉ dùng cho `purpose = commission`. Một escrow mang `kept` là một lỗi kế toán, không
   phải một trạng thái — ràng buộc `CHECK` ở migration, không phải quy ước trong code.

5. **Ví đổi vai.** [ADR 0023 điều 1–2](0023-wallet-refund-and-compensation.md) nói ví *"chỉ chứa
   tiền hoàn và bồi thường"* và *"không phải escrow"*. **Câu đó nay sai** cho tuyến gói: ví gian
   hàng nay là **sổ công nợ phải trả** của nền tảng, phát sinh trên **mỗi chuyến** có bật escrow,
   không phải thỉnh thoảng khi có huỷ.

   Hệ quả trực tiếp: **rút tiền là luồng thường xuyên**, không phải ngoại lệ. Nó phải có cam kết
   thời gian, có hàng đợi, có người trực — xem điều 7.

6. **Đối chiếu phải TÁCH quỹ, không chỉ so tổng.** [ADR 0023](0023-wallet-refund-and-compensation.md)
   đề một phép đối chiếu "tổng số dư mọi ví ≤ số dư ngân hàng". Nay **chưa đủ**. Bắt buộc trả lời
   được, mỗi ngày, ba con số tách nhau:

   ```
   Số dư ngân hàng của nền tảng
     = Tiền của nền tảng (hoa hồng đã hưởng + tiền gói)
     + Tiền GIỮ HỘ  (escrow chưa chốt + mọi số dư ví chưa rút)
     + Chênh lệch chưa đối soát
   ```

   Con số giữa là **nợ phải trả**. Không tách được nghĩa là không biết mình đang tiêu tiền của ai —
   và đó là cách một nền tảng chết vì kế toán chứ không vì sản phẩm.

7. **Cam kết rút tiền — số cụ thể, không phải "sớm nhất có thể".**

   | | Quy định |
   | --- | --- |
   | Tiền vào ví | **Tức thì** khi kết cục được chốt. Không có bước chờ |
   | Rút tối thiểu | 50.000đ |
   | Giờ cắt | Yêu cầu trước **16:00** ngày làm việc → chuyển **trong ngày đó**. Sau 16:00, cuối tuần, ngày lễ → ngày làm việc kế tiếp |
   | Cam kết tối đa | **3 ngày làm việc** kể từ khi duyệt |
   | Chuyển hụt / sai số tài khoản | Hoàn về ví bằng **dòng đảo**, không bao giờ sửa dòng cũ; báo người dùng nhập lại |

   Những con số này là **DỮ LIỆU cấu hình** (admin đổi được), nhưng *việc phải có một cam kết và
   hiện nó ra trước khi người dùng bấm rút* là **QUY TẮC** — cùng ranh giới
   [ADR 0015 điều 4](0015-vehicle-slot-billing.md) đã đặt.

8. **Đối soát vẫn dùng chung một sổ** `bank_transactions` ([ADR 0022](0022-sepay-customer-money.md)).
   Escrow đi cùng tiền tố `XPH` như hold hoa hồng — cùng bản chất *tiền vào cho một khoản giữ chỗ*,
   khác nhau ở `purpose` của đích đã khớp, không ở mã.

## Cái giá — ghi ra để không ai quên

- **Nền tảng nay giữ tiền của người khác.** Đây là điều [ADR 0013](0013-no-online-payment-mvp.md)
  dựng ra để tránh, và [ADR 0021](0021-booking-hold-is-the-commission.md) đã lách được ở tuyến A.
  Ở tuyến B thì không lách được nữa. Cần rà soát nghĩa vụ pháp lý của trung gian thanh toán trước
  khi bật tính năng này cho khách thật — **đây là việc ngoài code và phải xong trước W6**.
- **Đối soát thành hai chiều.** Chiều vào đã có SePay; chiều ra là admin chuyển tay, và mỗi lệnh
  chuyển phải có mã tham chiếu khớp ngược về `withdrawal_requests`.
- **Tranh chấp có bên thứ ba.** Khách nói đã chuyển, shop nói chưa nhận — nay nền tảng đứng giữa và
  phải trả lời được, chứ không còn quyền nói "hai bên tự làm việc"
  ([ADR 0014 điều 5](0014-owner-and-shop-single-role.md) mất thêm một dòng nữa ở cột phải).
- **W6 lớn lên và không còn là đợt cuối.** Ví, sổ cái, rút tiền, đối chiếu quỹ trở thành hạ tầng
  bắt buộc của tuyến B chứ không phải phần đuôi của tuyến A.

## Ràng buộc bắt buộc

1. **Không bao giờ tiêu tiền giữ hộ.** Số dư ngân hàng trừ đi nợ phải trả (điều 6) là số tiền
   nền tảng thật sự có. Mọi báo cáo doanh thu phải trừ phần này.
2. **`purpose` là cột, không phải suy luận.** Không hàm nào được viết
   `mode === 'package' ? 'escrow' : 'commission'` khi đọc một hold đã tồn tại.
3. **Escrow không bao giờ đi vào `payments` hay `booking.paid_amount`** — cùng lý do
   [ADR 0021 điều 4](0021-booking-hold-is-the-commission.md): nó chưa phải tiền gian hàng đã thu,
   nó là tiền nền tảng đang nợ họ. Nó thành thu nhập của shop **khi rút xong**, không sớm hơn.
4. **Bật/tắt escrow không đụng tới đơn đã tạo.** Shop tắt tính năng giữa chừng: hold đang mở vẫn
   đi hết vòng đời của nó.

## Hoãn có chủ đích

- **Chuyển trả tự động cho gian hàng.** Cần API chi hộ của ngân hàng. Đến khi có thì cam kết ở
  điều 7 là thứ giữ cho việc thủ công không thành lời hứa suông.
- **Escrow cho tuyến hoa hồng.** Bị chặn bởi điều 2 — hai khoản thu trên một chuyến.
- **Nền tảng phân xử tranh chấp escrow.** Đợt này chỉ ghi nhận và chuyển cho admin; chưa có quy
  trình maker-checker.

## Hệ quả

- `booking_holds` thêm `purpose`; `BOOKING_HOLD_OUTCOME` thêm `released_to_shop`; migration có
  `CHECK` cấm `kept` trên escrow.
- `plans.limits_json.features` thêm cờ escrow; màn cài đặt gian hàng có công tắc và ô số tiền,
  chặn trần ở server.
- `withdrawal_requests` thêm cam kết thời gian; màn admin có hàng đợi theo tuổi và giờ cắt.
- Màn đối chiếu quỹ cho admin — ba con số ở điều 6, mỗi ngày.
- W6 phải làm **trước hoặc cùng lúc** với việc mở escrow cho khách thật, không phải sau.

## Cần xem lại khi nào

Khi số dư giữ hộ vượt một ngưỡng khiến nghĩa vụ pháp lý đổi tính chất, hoặc khi có API chi hộ để
tự động hoá chiều ra — lúc đó phần lớn cái giá ở trên biến mất và tính năng này rẻ hẳn.
