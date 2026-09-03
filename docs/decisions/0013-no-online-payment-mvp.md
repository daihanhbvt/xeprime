# ADR 0013 — Không làm thanh toán trực tuyến ở giai đoạn hiện tại

Ngày: 21/08/2026 · Trạng thái: **Superseded bởi [ADR 0028](0028-marketplace-subscription-fees-and-custodied-funds.md)** — giữ làm lịch sử của MVP không thanh toán.

> ⚠️ **Đã được [ADR 0016](0016-sepay-bank-reconciliation.md) mở một KHE HẸP (21/08/2026):** tiền
> GÓI theo chiều gian hàng → nền tảng được đối soát tự động qua SePay. Lệnh cấm ở đây **vẫn giữ
> nguyên** cho tiền thuê xe (khách ↔ gian hàng).
>
> ⚠️ **[ADR 0021](0021-booking-hold-is-the-commission.md) thu hẹp RÀNG BUỘC ĐIỀU 2 (28/08/2026):**
> listing chế độ `commission` có thêm bước chuyển khoản GIỮ CHỖ, và trạng thái "chờ tiền" nằm
> trên `booking_holds` — **không** trên `bookings`. Khoản đó là **phí dịch vụ của chính nền
> tảng**, không phải tiền giữ hộ, nên **lý do gốc ở mục "Lý do" bên dưới không bị phá**. Tiền
> thuê xe (khách ↔ gian hàng) **vẫn nằm nguyên trong lệnh cấm**; ràng buộc 1, 3, 4 giữ nguyên.
> Điều kiện xem lại ở cuối trang (*"đổi mô hình sang thu phí nền tảng trên mỗi đơn"*) chính là
> điều đã xảy ra — xem [ADR 0020](0020-two-revenue-tracks-one-marketplace.md).

## Bối cảnh

Câu hỏi "XePrime có trung gian thu tiền không?" chưa từng được ghi ở đâu. Hệ quả là mỗi tài liệu
trả lời một kiểu, và cả ba đều tự tin:

- `docs/design/03_PRODUCT_GAP_ANALYSIS.md` C-01 xếp **"Thanh toán / cọc online"** là **P0**, công L,
  ghi chú "Chặn 'đặt xe là chắc chắn'. Cần chọn cổng (VNPay/Momo/ZaloPay)". Nó nằm ở **Đợt D** của
  lộ trình đề xuất.
- `docs/design/10_IMPLEMENTATION_CONSTRAINTS.md` liệt kê chi phí kỹ thuật: "Bảng giao dịch + trạng
  thái + webhook".
- [ADR 0010](0010-billing-plans-subscriptions.md) lại xếp self-serve/thanh toán online vào phần
  **hoãn**.
- `docs/design-briefs/10_PLATFORM_ORGANIZATION_AND_BILLING.md` Q5 để ngỏ: *"Is self-serve purchase
  (online payment) on the roadmap?"*

Trong khi đó mã nguồn đã trả lời từ lâu, chỉ là không ai ghi lại: grep 12 từ khoá cổng thanh toán
(`vnpay`, `momo`, `zalopay`, `stripe`, `payos`, `onepay`, `napas`, `paypal`, `payment_gateway`,
`paymentIntent`, `checkout_url`, `webhook`) trên toàn bộ `apps/*/src`, `packages/*/src` và `prisma`
cho **0 kết quả nghiệp vụ**; `api.generated.ts` khai báo `webhooks = Record<string, never>`; và
63 model Prisma không có `Invoice`/`Transaction`/`PaymentGateway` nào.

Khoảng trống này thành vấn đề thật khi chuẩn bị làm app native: luồng đặt xe của mobile kết thúc ở
"đã gửi yêu cầu" hay ở "đã trả tiền" là hai kiến trúc khác nhau, và không ai trả lời được.

## Quyết định

**XePrime KHÔNG trung gian thu tiền ở giai đoạn hiện tại.** Không cổng thanh toán, không webhook,
không trạng thái giao dịch online, không hoá đơn tự động.

Module `payments` hiện có là **ghi sổ thủ công**: nhân viên gian hàng ghi nhận khoản đã thu bằng
tiền mặt/chuyển khoản, và huỷ phiếu khi ghi sai. Nó **không phải** một tầng thanh toán —
`payments.controller.ts` đã ghi rõ điều này trong chính docblock của nó.

## Lý do

- Tiền chảy **trực tiếp** giữa khách và gian hàng. XePrime không giữ tiền hộ, nên không phát sinh
  nghĩa vụ pháp lý của một trung gian thanh toán, không cần đối soát, không cần quy trình hoàn tiền.
- Cổng thanh toán kéo theo một chuỗi bắt buộc: đối soát, hoàn tiền một phần, tranh chấp, maker-checker,
  và lưu vết giao dịch. Chi phí đó chỉ đáng khi khối lượng đơn đủ lớn — hiện chưa.
- Việc đang chặn doanh thu thật **không phải** thanh toán mà là OTP: chưa có credential eSMS.vn thì
  khách thật không qua nổi cổng xác thực SĐT để gửi yêu cầu thuê.

## Ràng buộc bắt buộc

1. **Đừng gọi module `payments` là "thanh toán"** trong tài liệu hay giao diện. Nó là *ghi nhận thu
   tiền*. Nhầm tên là cách nhanh nhất để ai đó xây tiếp lên một nền không tồn tại.
2. **Luồng đặt xe kết thúc ở "đã gửi yêu cầu → gian hàng duyệt"**, trên web lẫn mobile. Không thiết
   kế bước thanh toán, không thiết kế trạng thái "chờ thanh toán".
3. Cọc vẫn là **tài sản giữ hộ**: không cộng vào `paid_amount`, và bị loại khỏi "Doanh thu" theo xe
   qua `HELD_FUNDS_RECEIPT_SOURCES`.
4. Gán gói dịch vụ cho gian hàng là **thao tác admin thủ công**, không phát sinh hoá đơn —
   nhất quán với [ADR 0010](0010-billing-plans-subscriptions.md).

## Hệ quả

- `docs/design/03_PRODUCT_GAP_ANALYSIS.md` C-01 (P0) và "Đợt D" **không còn là lộ trình đang theo**;
  đã đánh dấu tại chỗ.
- `docs/design-briefs/10` Q5 **đã có câu trả lời**: không, không nằm trong lộ trình hiện tại.
- Feature `PAY-01`…`PAY-04` trong bảng theo dõi giữ nguyên `Not Started`, nhưng lý do đổi từ
  "chưa quyết" sang **"đã quyết là không làm"** — khác nhau khi báo cáo tiến độ.
- Đảo quyết định này là **đắt**: cần bảng giao dịch, endpoint webhook, đối soát, và một vòng
  bảo mật riêng. Viết ADR mới thay thế ADR này, đừng sửa nó.

## Cần xem lại khi nào

Khi có **một** trong ba điều: khối lượng đơn đủ lớn để đối soát tay thành nút thắt; đối tác/khách
doanh nghiệp yêu cầu hoá đơn tự động; hoặc XePrime đổi mô hình sang thu phí nền tảng trên mỗi đơn.
