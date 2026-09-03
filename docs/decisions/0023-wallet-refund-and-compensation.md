# ADR 0023 — Ví chỉ chứa tiền HOÀN và tiền BỒI THƯỜNG; rút bằng chuyển khoản admin thủ công

Ngày: 28/08/2026 · Trạng thái: **Superseded bởi [ADR 0025](0025-shop-escrow-hold-and-payout.md) và [ADR 0028](0028-marketplace-subscription-fees-and-custodied-funds.md)** — giữ nguyên các nguyên tắc ledger append-only/idempotency.

> ⚠️ **[ADR 0025](0025-shop-escrow-hold-and-payout.md) VIẾT LẠI điều 1–2 (29/08/2026).** Câu
> *“ví chỉ chứa tiền hoàn và bồi thường”* và *“không phải escrow”* **không còn đúng** cho tuyến
> gói: ví gian hàng nay là **sổ công nợ phải trả**, phát sinh trên mỗi chuyến có bật escrow.
> Rút tiền thành **luồng thường xuyên** và có cam kết thời gian (0025 điều 7); đối chiếu phải
> **tách quỹ nền tảng khỏi tiền giữ hộ** (0025 điều 6), không chỉ so tổng.
> Điều 3–8 (append-only, chống cộng đôi bằng constraint, không nạp/không thanh toán bằng ví)
> **giữ nguyên**.

## Bối cảnh

[ADR 0021](0021-booking-hold-is-the-commission.md) thiết kế luồng thuận lợi **không cần chuyển
trả cho ai đồng nào**. Nhưng hai nhánh không thuận lợi vẫn tạo ra nghĩa vụ trả tiền:

- **Khách huỷ trước mốc 4 giờ** → nền tảng phải hoàn khoản giữ chỗ.
- **Khách huỷ muộn hoặc không đến** → khoản giữ chỗ chuyển thành bồi thường cho chủ xe, vì chủ
  xe đã giữ xe trống mà không thu được gì.

Chuyển khoản ở Việt Nam là **đẩy**: nền tảng không có API nào tự trả tiền về tài khoản người
nhận. Mọi lần hoàn tiền đều là một con người mở app ngân hàng. Ở quy mô vài trăm chuyến một
ngày, đó là nút thắt — và là chỗ duy nhất cái đơn giản hoá của
[ADR 0021](0021-booking-hold-is-the-commission.md) bị rò.

## Quyết định

1. **Ví là SỔ GHI CÓ, không phải nơi giữ tiền.** Số dư ví là **nghĩa vụ của nền tảng với chủ
   ví**, không phải tiền của chủ ví do nền tảng cất hộ. Tiền vật lý nằm trong tài khoản ngân
   hàng của nền tảng, đúng như [ADR 0021](0021-booking-hold-is-the-commission.md) điều 2 mô tả.

2. **Ví chỉ nhận đúng hai loại tiền vào**, không có loại thứ ba:

   | Chủ ví | Nguồn | Khi nào |
   | --- | --- | --- |
   | Khách | Hoàn khoản giữ chỗ | Huỷ trước `free_cancel_until`; chủ xe huỷ; phần chuyển thừa |
   | Gian hàng | Bồi thường | Khách huỷ sau mốc, hoặc không đến |

   **Không** tiền thuê xe. **Không** cọc xe. **Không** nạp tiền vào ví. **Không** thanh toán
   bằng ví cho tuyến B. Mỗi thứ trong danh sách đó biến ví thành ví điện tử, và ví điện tử cần
   giấy phép trung gian thanh toán — đúng thứ [ADR 0013](0013-no-online-payment-mvp.md) và
   [ADR 0021](0021-booking-hold-is-the-commission.md) xây quanh để tránh.

3. **Hoàn về ví là mặc định; rút về ngân hàng là tuỳ chọn.** Ghi có tức thì, dùng được ngay cho
   chuyến sau, không cần khách nhập số tài khoản, không có SLA để lỡ. Chỉ ai muốn tiền mặt mới
   tạo yêu cầu rút, và admin chuyển tay. Điều này **xoá gần hết khối lượng hoàn tiền thủ công**
   — đó là toàn bộ lý do ví tồn tại.

4. **Sổ cái CHỈ GHI THÊM.** Sửa sai bằng **dòng đảo**, không update, không delete — cùng tinh
   thần append-only của [ADR 0010](0010-billing-plans-subscriptions.md) với
   `tenant_subscriptions`.

5. **Chống cộng tiền hai lần bằng CONSTRAINT DB**, không bằng check ở tầng app —
   `@@unique([wallet_id, source_type, source_ref_id])`. Một nguồn sinh **đúng một** dòng ghi có.
   Worker chạy lại, webhook gửi lại, admin bấm hai lần: cùng ra một kết quả.

   **Ràng buộc này phải nằm trong CÙNG migration với bảng.** Thêm sau là chấp nhận một cửa sổ
   thời gian trong đó tiền tự nhân đôi mà không ai biết. Cùng kỷ luật
   [ADR 0006](0006-booking-concurrency.md) đặt cho chống trùng lịch.

6. **`balance` lưu sẵn trên `wallets`, không tính bằng `SUM()`.** Không phải để nhanh, mà để có
   **một phép ghi có điều kiện nguyên tử** khi rút tiền:
   `updateMany({ where: { id, balance: { gte: amount } } })`. `SUM()` không cho được điều đó nếu
   không khoá cả sổ cái. Writer cập nhật `balance` và chèn dòng sổ cái trong **cùng một
   transaction**; màn admin hiện chênh lệch đối chiếu để phát hiện lệch.

7. **MỘT bộ bảng cho cả khách và gian hàng**, phân biệt bằng `owner_type` (`user` | `tenant`).
   Cùng sổ cái, cùng kỷ luật, một service. Hai bộ bảng song sinh là hai chỗ để quên sửa.

8. **Yêu cầu rút snapshot thông tin ngân hàng tại thời điểm yêu cầu.** Người dùng đổi số tài
   khoản sau đó không được làm đổi lệnh chuyển admin đang cầm. Có `row_version` như
   `booking_deposit_settlements` để hai admin không cùng đánh dấu đã chuyển.

## Ràng buộc bắt buộc

1. **Đừng gọi nó là "ví tiền" trên giao diện.** Cùng lý do
   [ADR 0013 ràng buộc 1](0013-no-online-payment-mvp.md) cấm gọi `payments` là "thanh toán":
   tên gọi sai là cách nhanh nhất để ai đó xây tiếp lên một nền không tồn tại. Dùng
   **"Bồi thường huỷ chuyến"** (gian hàng) và **"Số dư hoàn tiền"** (khách).
2. **Số dư không hết hạn.** Nó là nghĩa vụ, không phải khuyến mãi.
3. **`WalletService` là writer duy nhất** của cả ba bảng. Module khác gọi
   `creditWithinTx(...)` trong transaction của chính nó.
4. **Không hiện ví cho tenant tuyến B** — họ không bao giờ có dòng nào. Một màn hình luôn rỗng
   là một câu hỏi hỗ trợ định kỳ.

## Hoãn có chủ đích

- **Nạp tiền vào ví / thanh toán bằng ví.** Biến ví thành ví điện tử → giấy phép. Không làm.
- **Rút tiền tự động.** Cần API chi hộ của ngân hàng; chưa có, và khối lượng chưa đáng.
- **Trừ ví khi chủ xe vi phạm** (huỷ đơn tuyến A). Hình phạt để lại cho sau —
  [ADR 0020](0020-two-revenue-tracks-one-marketplace.md) mục hoãn. Đợt này chỉ ghi audit và đếm.
- **Ví cho tenant tuyến B**, ví dụ để trừ vào tiền gói kỳ sau. Làm được sau vì sổ cái đã có
  `owner_type`, nhưng nay chưa có nguồn tiền nào chảy vào.

## Hệ quả

- Ba bảng mới: `wallets`, `wallet_entries`, `withdrawal_requests`. Module mới `wallet`.
- Màn `/manage/wallet` cho gian hàng (chỉ tuyến A) và một khu số dư trong `/account` cho khách.
- Màn admin duyệt và đánh dấu đã chuyển yêu cầu rút.
- Thông báo mới: bồi thường đã vào ví, tiền hoàn đã vào ví, yêu cầu rút đã chuyển.
- Một phép đối chiếu vận hành cần có từ đầu: **tổng số dư mọi ví ≤ số dư tài khoản ngân hàng
  nền tảng**. Lệch là có lỗi ở đâu đó, và phát hiện muộn thì không truy được.

## Cần xem lại khi nào

Khi số dư ví tồn đọng lớn tới mức người dùng coi nó là tiền gửi chứ không phải tiền hoàn — lúc
đó nghĩa vụ pháp lý đổi tính chất và phải xem lại có phải xin phép hay không. Hoặc khi khối
lượng rút tay vượt sức một người trực.
