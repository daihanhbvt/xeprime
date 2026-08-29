# ADR 0022 — SePay mở sang tiền của KHÁCH: một sổ giao dịch ngân hàng, hai loại đích khớp

Ngày: 28/08/2026 · Trạng thái: Accepted · **Mở rộng [ADR 0016](0016-sepay-bank-reconciliation.md) điều 1 · huỷ [ADR 0015](0015-vehicle-slot-billing.md) điều 5 câu cuối**

## Bối cảnh

[ADR 0016](0016-sepay-bank-reconciliation.md) mở một khe hẹp của
[ADR 0013](0013-no-online-payment-mvp.md): SePay đối soát **chỉ tiền gói, chỉ chiều gian hàng →
nền tảng**. [ADR 0021](0021-booking-hold-is-the-commission.md) nay cần đúng cơ chế đó cho một
nguồn tiền thứ hai: **khách → nền tảng**.

Cả hai đều là **tiền vào một tài khoản ngân hàng duy nhất của nền tảng**. Câu hỏi thiết kế thật
sự không phải "có mở rộng không" mà là **một sổ hay hai sổ**.

## Quyết định

1. **Mở rộng [ADR 0016 điều 1](0016-sepay-bank-reconciliation.md).** Câu cũ: *"chỉ tiền GÓI, chỉ
   chiều gian hàng → nền tảng"*. Câu mới:

   > Mọi khoản **VÀO** tài khoản của nền tảng. Hai nguồn: gian hàng trả hoá đơn gói, và khách
   > chuyển khoản giữ chỗ. Khoá phân loại là **TIỀN TỐ của mã đối soát**, không phải suy đoán.

   Điều 4 (bề mặt tấn công), điều 5 (VietQR có sẵn nội dung), điều 6 (chuyển thiếu/thừa) **giữ
   nguyên câu chữ** và áp cho cả hai nguồn.

2. **MỘT bảng `bank_transactions`, không phải hai.** Lý do:
   - Chống ghi đôi phải là **ràng buộc unique trong database** trên mã giao dịch của SePay
     ([ADR 0016 điều 4](0016-sepay-bank-reconciliation.md)), và webhook phải **ghi trước khi
     biết nội dung khớp vào đâu**. Tách hai bảng thì một giao dịch không khớp được **không có
     chỗ nào để nằm** → bị bỏ → lần retry sau chèn lại lần nữa.
   - Một tài khoản ngân hàng là một thực tại. Hàng đợi "tiền về mà không khớp được" của admin là
     **một danh sách**, không phải hai.

   Ghi **thô trước, khớp sau**: `content` lưu nguyên văn (bằng chứng khi tranh cãi),
   `reference_code` là phần rút ra được, `matched_type` + `matched_ref_id` điền sau.
   `matched_ref_id` **không có khoá ngoại** vì có hai đích — toàn vẹn đến từ kỷ luật *chỉ
   `BankReconciliationService` ghi các cột `matched_*`, và ghi trong cùng transaction với hiệu
   ứng ở phía đích*.

3. **Tiền tố mã quyết định loại đích, không có bước đoán.**

   ```
   XPG…   hoá đơn gói        → subscription_invoices.code
   XPH…   khoản giữ chỗ      → booking_holds.code
   ```

   Bảng chữ cái theo [ADR 0016 điều 5](0016-sepay-bank-reconciliation.md): không dấu, tránh cặp
   dễ nhầm `0/O` và `1/I`. Mã **unique toàn sàn**, không unique theo tenant — webhook không có
   ngữ cảnh tenant nào để thu hẹp.

   > Sửa một chi tiết của kế hoạch cũ: bản kế hoạch 21/08 ghi `subscription_invoices.code` là
   > `unique/tenant`. Sai — webhook chỉ có chuỗi nội dung chuyển khoản.

4. **Khớp dự phòng là TRỢ GIÚP ADMIN, không bao giờ tự động.** Khách có thể chuyển từ tài khoản
   người khác, và một số ngân hàng cắt bớt nội dung. Khi không rút được mã: hiện trong hàng đợi
   admin kèm gợi ý (số tiền + cửa sổ thời gian + các khoản đang chờ). **Khớp tự động theo số
   tiền sẽ gán tiền của người lạ vào đơn của người khác** — và ở tuyến A số tiền giữ chỗ của
   nhiều chuyến giống hệt nhau.

5. **Chuyển thiếu / thừa — [ADR 0016 điều 6](0016-sepay-bank-reconciliation.md) áp nguyên, trừ
   một chỗ:**
   - Thiếu → ghi nhận một phần, **không kích hoạt** (không tạo booking, gói không mở), giữ
     nguyên mã để khách chuyển bù, báo admin. Giao dịch thứ hai khớp vào cùng đích và cộng dồn.
   - Thừa với **hoá đơn gói** → ghi có kỳ sau, như cũ.
   - Thừa với **khoản giữ chỗ** → **không có "kỳ sau"** để ghi có. Xử lý là: coi như đã trả đủ,
     đánh dấu phần dư để hoàn qua ví khách ([ADR 0023](0023-wallet-refund-and-compensation.md)).
     Đây là chỗ duy nhất quy tắc của 0016 không chuyển sang được.

6. **HUỶ [ADR 0015 điều 5 câu cuối](0015-vehicle-slot-billing.md)** — *"`payments.subscription_id`
   (cột chờ sẵn từ Phase 0) nay nối FK"*. **Không nối, và cột đó vẫn để trống.**

   Lý do: một dòng `payments` có `tenant_id` sẽ **tự sinh phiếu thu đã duyệt cho tenant đó**
   trong cùng transaction. Nghĩa là tiền **nền tảng thu CỦA gian hàng** sẽ hiện lên báo cáo
   `/manage/finance` của **chính gian hàng đó như một khoản thu của họ**. Sai kế toán, và sai ở
   chỗ khách hàng nhìn thấy.

   Tiền gói ghi ở `subscription_invoices.paid_amount` + `bank_transactions`. Cập nhật docblock
   của `payments.subscription_id` để ghi rõ vì sao nó vẫn trống.

## Ràng buộc bắt buộc

Giữ nguyên toàn bộ [ADR 0016 điều 4](0016-sepay-bank-reconciliation.md), nhắc lại vì nay có
thêm một nguồn tiền và bề mặt không đổi:

1. `Authorization: Apikey …`, **so sánh time-safe**. Đứng ngoài `AuthGuard` một cách **tường
   minh**, không phải vì quên gắn decorator.
2. **Idempotent bằng constraint DB** `@@unique([provider, provider_tx_id])`, không bằng check ở
   tầng app — cùng kỷ luật [ADR 0006](0006-booking-concurrency.md).
3. Đứng ngoài `TenantScopeGuard` **tường minh** — request không có tenant nào. **Mọi thao tác
   ghi đều suy `tenant_id` từ ĐÍCH ĐÃ KHỚP, không bao giờ từ payload.** Đây là endpoint công
   khai đầu tiên có quyền ghi tiền; tin payload là mở đường cho người lạ kích hoạt gói của
   tenant bất kỳ.
4. Nới `ThrottlerGuard` cho route này — SePay bắn dồn khi retry.
5. **Trả 200 khi trùng mã giao dịch** (bắt vi phạm unique = đã xử lý rồi). **Không bao giờ trả
   500** — 500 làm SePay retry vĩnh viễn.
6. **Kích hoạt do webhook, không do redirect trình duyệt.** Tiền về lúc nào không liên quan tới
   việc người dùng có quay lại trang hay không — đặc biệt đúng trên mobile, nơi khách rời app
   sang app ngân hàng và có thể không quay lại.
7. `SEPAY_API_KEY`, `SEPAY_ACCOUNT_NUMBER` vào env, validate bằng `zod` như mọi biến khác.

## Hoãn có chủ đích

- **Tự động gia hạn.** Không khả thi bằng chuyển khoản đẩy —
  [ADR 0016](0016-sepay-bank-reconciliation.md) đã ghi.
- **Nhiều tài khoản ngân hàng / nhiều nhà cung cấp đối soát.** Cột `provider` đã có sẵn trong
  khoá unique nên mở được sau; chưa có nhu cầu.
- **Đối soát chiều RA** (nền tảng chuyển tiền đi: hoàn khách, chi trả yêu cầu rút). Hiện là thao
  tác tay có ghi mã tham chiếu. Bảng này chỉ ghi chiều **VÀO**.

## Hệ quả

- Bảng mới `bank_transactions`, module mới `sepay`, writer duy nhất `SepayService`.
- `booking_holds.code` và `subscription_invoices.code` dùng chung một bộ sinh mã và **chung một
  không gian tên** — mã trùng nhau giữa hai bảng là khớp nhầm tiền.
- Màn admin cho hàng đợi giao dịch chưa khớp + khớp tay.
- Phụ thuộc bên ngoài: tài khoản SePay + tài khoản ngân hàng thật. Phần này **chặn được** trong
  khi các phần khác vẫn làm được.

## Cần xem lại khi nào

Khi tỉ lệ giao dịch không rút được mã vượt ~5% (nội dung chuyển khoản bị cắt nhiều hơn dự tính
⇒ cần rút ngắn mã hoặc đổi cách đặt mã), hoặc khi cần một tài khoản ngân hàng thứ hai — lúc đó
"một sổ" vẫn đúng nhưng cách khớp phải xét thêm số tài khoản nhận.
