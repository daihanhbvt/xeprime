# ADR 0033 — Sổ công nợ "Ví điểm", phân bổ cọc nhiều dòng và định tuyến kết cục

Ngày: 10/09/2026 · Trạng thái: Accepted · Ghi đè một phần: [0023](0023-wallet-refund-and-compensation.md) (ràng buộc 1, điều 5), [0025](0025-shop-escrow-hold-and-payout.md) (điều 1–4), [0028](0028-marketplace-subscription-fees-and-custodied-funds.md) (điều 6, điều 8 phần tên gọi) · Liên quan: 0016, 0022, 0024, 0027, 0032

## Bối cảnh

[ADR 0032](0032-booking-deposit-insurance-and-owner-lite.md) chốt công thức tiền `D + S + IV + IP` và
quy tắc hủy, nhưng để mở bốn thứ mà **code settlement không viết được nếu thiếu**:

1. Kết cục của một hold nay là **phân bổ nhiều dòng cho nhiều người hưởng**, không còn là một giá
   trị đơn — nhánh "hủy muộn chia 50/50 chủ xe/XePrime, hoàn 100% bảo hiểm" không diễn đạt được
   bằng `BOOKING_HOLD_OUTCOME` hiện có.
2. Khách không đến (no-show) chưa có quy tắc.
3. `hold_refunds` là chuyển khoản tay từng lần; với `D` nay là tiền chủ xe, mỗi chuyến hoàn thành
   đều sinh một nghĩa vụ phải trả ⇒ **rút tiền thành luồng thường xuyên**, không thể chạy bằng
   một hàng đợi chuyển tay không có sổ.
4. Tên hiển thị của sổ công nợ.

Ngoài ra, hiện trạng khảo sát ngày 10/09/2026 cho thấy `packages/types/src/status/wallet.ts` đã mô
tả xong toàn bộ từ vựng ví nhưng **chưa có model, module hay endpoint nào dùng** — quyết định dưới
đây biến nó thành thứ chạy được.

## Quyết định

### 1. Tên hiển thị là "Ví điểm"; bản chất không đổi

Chủ sản phẩm chọn gọi sổ công nợ này là **"Ví điểm"**, đơn vị **"điểm"**, tỉ lệ cố định
**1 điểm = 1 VND**.

Điều này **ghi đè [ADR 0023 ràng buộc 1](0023-wallet-refund-and-compensation.md)** (*"đừng gọi là
ví tiền"*) và **phần tên gọi của [ADR 0028 điều 8](0028-marketplace-subscription-fees-and-custodied-funds.md)**
(*"Số dư chủ xe" / "Khoản XePrime phải trả"*).

Rủi ro đã được nêu trước khi chốt và được chấp nhận: chữ "điểm"/"ví" gợi ý một công cụ thanh toán
hoặc một chương trình khuyến mãi — mà khuyến mãi thì người dùng mặc định là **có thể hết hạn, có
thể bị thu hồi, có thể chỉ tiêu trong hệ thống**. Sổ này không có tính chất nào trong số đó. Vì vậy
**bản chất bị khoá cứng, không có ngoại lệ**:

| Cấm | Lý do |
| --- | --- |
| Nạp tiền vào ví | Biến nó thành ví điện tử → giấy phép trung gian thanh toán (NĐ 52/2024) |
| Chuyển ngang giữa người dùng | Như trên |
| Thanh toán hàng hoá/dịch vụ bằng điểm | Như trên |
| Trả lãi | Như trên |
| **Cho điểm hết hạn** | Nó là **nghĩa vụ phải trả**, không phải khuyến mãi ([ADR 0023 ràng buộc 2](0023-wallet-refund-and-compensation.md) giữ nguyên) |
| **Thu hồi điểm** | Như trên. Sửa sai chỉ bằng **dòng đảo** có lý do và người thực hiện |
| Tặng điểm khuyến mãi vào `wallets.balance` | Xem điều 2 |

Nếu sau này có chương trình khuyến mãi thật, nó là **sổ khác, bảng khác**, không bao giờ cộng vào
`wallets.balance`. Hai loại nghĩa vụ có tính chất pháp lý khác nhau nằm chung một cột là cách nhanh
nhất để mất khả năng trả lời "chúng ta đang nợ người dùng bao nhiêu tiền thật".

**Ràng buộc giao diện:** mọi màn hiện số dư phải hiện cố định, cùng chỗ, câu:
*"1 điểm = 1đ · rút về tài khoản ngân hàng · không hết hạn"*.

**Ràng buộc kỹ thuật:** toàn bộ chữ đi qua i18n (`Wallet.unit`, `Wallet.title.*`,
`Wallet.legalNote`). **Không hardcode chữ "điểm" trong component.** Tên bảng, cột, module, DTO và
mã lỗi giữ từ vựng kế toán (`wallets`, `wallet_entries`, `balance`, `availableAmount`) — đổi cách
gọi trên UI về sau chỉ tốn hai file JSON.

### 2. Bốn nguồn sinh, không có nguồn thứ năm

| Nguồn | Chủ ví | Khi nào |
| --- | --- | --- |
| Hoàn khoản đã thanh toán | Khách | Hủy trong cửa sổ miễn phí · chủ xe hủy · hold trả thiếu rồi hết hạn |
| Hoàn phần chuyển thừa | Khách | [ADR 0022 điều 5](0022-sepay-customer-money.md) |
| Hoàn bảo hiểm chưa phát hành | Khách | Mọi lần hủy trước bàn giao — 100% `IV + IP` |
| Khoản XePrime phải trả chủ xe | Chủ xe / gian hàng | Chuyến hoàn thành (`D − T`) · phần chia khi khách hủy muộn hoặc no-show |

Không có nguồn nào khác được ghi có. Một nguồn mới đồng nghĩa với một ADR mới.

### 3. Kết cục của hold là PHÂN BỔ, không phải một giá trị

`BOOKING_HOLD_OUTCOME` thêm `settled` (chuyến hoàn thành) và `split_late_cancel` (chia 50/50).
`kept` trở thành **legacy chỉ-đọc** cho đơn đã tồn tại: nó mang nghĩa "nền tảng giữ toàn bộ, không
sinh dòng ví nào", điều không còn đúng khi hold chứa `D` là tiền của chủ xe.

Bảng định tuyến — nguồn của hàm thuần `resolveHoldAllocation`:

| Sự kiện | `D` | `S` | `IV + IP` | `T` |
| --- | --- | --- | --- | --- |
| Quá cửa sổ thanh toán, chưa trả | — | — | — | — |
| Khách hủy trong cửa sổ miễn phí | → ví khách | → ví khách | → ví khách | không |
| Khách hủy sau cửa sổ, trước bàn giao | 50% ví chủ xe / 50% XePrime | 50/50 như `D` | → **ví khách 100%** | không |
| **Khách không đến (no-show)** | 50/50 | 50/50 | → ví khách 100% | không |
| Chủ xe/gian hàng hủy trước chuyến | → ví khách | → ví khách | → ví khách | không, + đếm tần suất hủy |
| Chuyến bắt đầu / bàn giao | giữ | → doanh thu XePrime | → phải trả hãng bảo hiểm khi `issued` | **phát sinh** |
| Chuyến hoàn thành | **`D − T` → ví chủ xe** | (đã ghi nhận) | (đã ghi nhận) | → sổ thuế |
| Chuyển thừa | — | — | — | phần dư → ví khách |

**No-show xử lý như hủy muộn** (dòng thứ tư) — chốt điểm để mở của
[ADR 0032](0032-booking-deposit-insurance-and-owner-lite.md). Lý do chọn 50/50 thay vì dồn hết cho
chủ xe: no-show và hủy muộn gây ra cùng một thiệt hại (xe bị giữ trống), nên hai kết cục khác nhau
sẽ tạo động cơ méo — khách sắp lỡ hẹn sẽ chọn im lặng nếu im lặng rẻ hơn, hoặc chọn báo hủy nếu báo
hủy rẻ hơn. Bằng nhau thì không có gì để tối ưu, và khách được khuyến khích báo trước vì lý do
đúng đắn (lịch được nhả sớm).

Ba nơi ghi, không lẫn nhau:

- **Ví** → `wallet_entries`.
- **Doanh thu XePrime** → không có bảng riêng; suy từ `booking_holds.service_fee_amount` với
  outcome `settled`/`split_late_cancel`, cộng `subscription_invoices` đã trả.
- **Nghĩa vụ với bên thứ ba** → `tax_withholdings` (ngân sách) và `booking_insurance_policies`
  (hãng bảo hiểm).

### 4. Một hold nay chứa tiền của NHIỀU người ⇒ `purpose` không còn đủ để tách quỹ

[ADR 0025 điều 1](0025-shop-escrow-hold-and-payout.md) đặt `booking_holds.purpose` để trả lời "tiền
này của ai": `commission` là của nền tảng, `escrow` là của gian hàng.

**Câu hỏi đó nay không có câu trả lời ở cấp một hold.** Với công thức của ADR 0032, một hold tuyến
hoa hồng chứa đồng thời `S` (của XePrime), `D` (của chủ xe, trừ thuế) và `IV + IP` (giữ hộ cho hãng
bảo hiểm). Không tỉ lệ cố định nào giữa chúng.

Vì vậy:

1. **Tách quỹ đọc từ CỘT SỐ TIỀN, không đọc `purpose`.** `booking_holds` mang bốn cột
   `deposit_amount`, `service_fee_amount`, `vehicle_insurance_amount`, `personal_insurance_amount`,
   với `CHECK` tổng đúng bằng `amount`. Cấm mọi hàm suy phần giữ hộ từ `purpose`.
2. `purpose` **giữ lại** đúng vai trò còn đúng của nó: phân biệt hold do tuyến hoa hồng sinh với
   hold do gian hàng bật thu cọc, phục vụ báo cáo và ràng buộc outcome. Nó vẫn **đóng băng lúc tạo**
   ([ADR 0025 điều 1](0025-shop-escrow-hold-and-payout.md) giữ nguyên ở điểm này).
3. Bốn cột tiền là **cột thật, không phải khoá trong `allocation_json`**: đối chiếu quỹ hằng ngày
   phải `SUM()` chúng, và không aggregate jsonb cho một phép cộng chạy mỗi ngày trên toàn bộ sổ.
   `allocation_json` vẫn giữ để **giải thích** từng dòng (người hưởng, người chịu, tỉ lệ).

Hệ quả với [ADR 0025 điều 4](0025-shop-escrow-hold-and-payout.md) (*"nền tảng không bao giờ giữ lại
một đồng escrow nào"*): nguyên tắc giữ nguyên nhưng áp cho **từng dòng tiền**, không cho cả hold.
XePrime giữ `S`, không bao giờ giữ `D`, `IV`, `IP`.

### 5. Hoàn tiền mặc định vào ví; chuyển khoản tay là đường VĨNH VIỄN cho khách vãng lai

`hold_refunds` không bị xoá. Nó chia hai kỷ nguyên bằng cột `settlement_mode`:

| `settlement_mode` | Dùng khi | Trạng thái cuối |
| --- | --- | --- |
| `balance` | Khách có tài khoản (`customer_user_id` khác NULL) | `credited` |
| `bank_transfer` | **Khách vãng lai** — đặt xe không cần tài khoản | `paid` |

`credited` **tách khỏi** `paid` có chủ đích: phải phân biệt "tiền đã rời tài khoản ngân hàng của
nền tảng" với "nghĩa vụ đổi hình thức". Gộp hai cái là mất khả năng đối chiếu chiều ra.

Đường chuyển khoản tay **không phải legacy và không bị loại bỏ**: XePrime cho đặt xe không cần tài
khoản, nên luôn tồn tại người được hoàn tiền mà không có ví để ghi có.

### 6. Chống cộng đôi: khoá bốn cột, không phải ba

[ADR 0023 điều 5](0023-wallet-refund-and-compensation.md) đặt
`@@unique([wallet_id, source_type, source_ref_id])`. **Khoá này chặn nhầm hai ca đúng** và được
thay bằng `@@unique([wallet_id, kind, source_type, source_ref_id])`:

- Một `withdrawal_request` sinh **hai** dòng hợp lệ: `withdrawal` khi chi và `withdrawal_reversal`
  khi chuyển hụt — chính ADR 0023 mô tả cả hai.
- Một hold sinh **hai** dòng hợp lệ: hoàn theo kết cục, và hoàn phần chuyển thừa.

Bảo đảm gốc không đổi: **một sự kiện nguồn sinh đúng một dòng ghi có.** Worker chạy lại, webhook
gửi lại, admin bấm hai lần đều ra cùng một kết quả.

Giữ nguyên toàn bộ phần còn lại của [ADR 0023](0023-wallet-refund-and-compensation.md):
append-only (điều 4), `balance` lưu sẵn để có phép ghi có điều kiện nguyên tử (điều 6), một bộ bảng
cho cả hai loại chủ ví (điều 7), snapshot thông tin ngân hàng lúc tạo yêu cầu rút (điều 8),
`WalletService` là writer duy nhất (ràng buộc 3).

**`balance` mang nghĩa KHẢ DỤNG**, không phải tổng nghĩa vụ; phần đang bị khoá bởi yêu cầu rút nằm
ở `pending_withdraw_amount`. Tổng nghĩa vụ = `balance + pending_withdraw_amount`, tính lúc đọc.
Lý do: phép rút phải là **một câu lệnh có điều kiện** (`where: { balance: { gte: amount } }`); Prisma
không so được hai cột trong `where`, nên `balance` là tổng sẽ buộc phải viết raw SQL cho đúng chỗ
nguy hiểm nhất của hệ thống.

### 7. Mức cọc do nền tảng đặt

`D` là một tỉ lệ trong `fee_policies` (có sàn và trần), áp chung cho cả hai tuyến, có phiên bản và
ngày hiệu lực như mọi giá trị khác của chính sách phí
([ADR 0028 điều 2](0028-marketplace-subscription-fees-and-custodied-funds.md)).

Điều này **ghi đè [ADR 0025 điều 3](0025-shop-escrow-hold-and-payout.md)** (*"số tiền escrow do gian
hàng đặt"*): khi cọc là một phần của giá thuê chứ không phải công cụ chống bỏ chuyến riêng của shop,
để mỗi gian hàng tự đặt sẽ làm khách thấy cùng một hạng xe có mức trả trước khác nhau mà không
giải thích được. `ESCROW_MAX_PERCENT` vẫn là trần cứng trong code.

Gian hàng tuyến gói giữ **công tắc bật/tắt thu cọc** (không phải mức cọc). Tuyến hoa hồng bắt buộc
thu cọc, không tắt được ([ADR 0032 điều 2](0032-booking-deposit-insurance-and-owner-lite.md)).

## Ràng buộc bắt buộc

1. **Không hàm nào đọc `purpose` để quyết định phần giữ hộ** — có test khoá bất biến này.
2. Ràng buộc unique của `wallet_entries` nằm **cùng migration với bảng**
   ([ADR 0023 điều 5](0023-wallet-refund-and-compensation.md)) — thêm sau là chấp nhận một cửa sổ
   thời gian tiền tự nhân đôi.
3. Backfill khi cắt `hold_refunds` sang ví phải nằm **trong chính migration tạo ràng buộc**, dùng
   `ON CONFLICT DO NOTHING`, và **không đụng** dòng đã `paid`/`rejected`.
4. Không dòng ví nào được ghi ngoài `WalletService`.
5. Mọi số tiền là `Decimal` ở backend, **string** trong JSON
   ([ADR 0007](0007-api-type-contract.md)).

## Release gate — chưa được coi là đã vượt

[ADR 0028 release gate 4](0028-marketplace-subscription-fees-and-custodied-funds.md) (ý kiến pháp lý
và đối tác cho thu hộ/chi hộ) **vẫn chặn việc thu tiền khách thật**. ADR này mô tả mô hình dữ liệu
và quy tắc phân bổ, không tuyên bố gate đã qua.

Điểm cần chú ý khi xin ý kiến pháp lý: với ADR 0032, **cả hai tuyến** đều khiến XePrime giữ tiền của
người khác (`D` là tiền chủ xe, `IV + IP` là tiền của hãng bảo hiểm). Cái lách của
[ADR 0021](0021-booking-hold-is-the-commission.md) — *"hold đúng bằng hoa hồng nên không bao giờ
phải trả ai"* — không còn nữa ở bất kỳ tuyến nào.

## Điểm còn để mở

[ADR 0032](0032-booking-deposit-insurance-and-owner-lite.md) để mở và ADR này **chưa** chốt:

- Kết thúc sớm, kéo dài chuyến, hủy sau khi chuyến đã bắt đầu.
- Hạ cấp gian hàng khi hết gói.
- Hành vi khi phát hành bảo hiểm thất bại đúng lúc bàn giao. *Đề xuất làm việc:* không chặn chuyến,
  ghi `failed`, mở support case và báo admin — chặn một chuyến vì lỗi API của đối tác là biến sự cố
  của XePrime thành sự cố của khách. Cần chốt trước khi bật dòng bảo hiểm bằng số thật.

## Hệ quả

- Sáu bảng mới: `wallets`, `wallet_entries`, `withdrawal_requests`, `bank_accounts`,
  `booking_insurance_policies`, `tax_withholdings` (+ `platform_bank_balances` cho đối chiếu).
- Bốn cột tiền trên `booking_holds`; cột cọc/thuế/phải-trả trên `bookings`; cột mức cọc và bảo hiểm
  người trên `fee_policies`.
- Module mới `wallet`, `bank-accounts`, `insurance`; `DepositPolicyService` trong `holds`.
- Đối chiếu hằng ngày mở rộng thành ba vế
  ([ADR 0025 điều 6](0025-shop-escrow-hold-and-payout.md)) và thêm phép phát hiện lệch ví.
- `packages/types/src/status/wallet.ts` thôi mồ côi.

## Xem lại khi nào

- Khi có yêu cầu tặng điểm khuyến mãi — lúc đó phải dựng sổ thứ hai, không nới điều 1.
- Khi số dư tồn đọng lớn tới mức người dùng coi đó là tiền gửi.
- Khi khối lượng rút tay vượt sức người trực, hoặc khi có API chi hộ của ngân hàng.
- Sau 100 booking trả tiền đầu tiên, cùng mốc xem lại của
  [ADR 0028](0028-marketplace-subscription-fees-and-custodied-funds.md).
