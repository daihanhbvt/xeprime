# ADR 0110 — Nguồn đơn: mọi chủ xe tự lập đơn ngoài sàn, mỗi đơn mang nguồn

Ngày: 26/11/2026 · Trạng thái: **Accepted** (26/11/2026 — chủ sản phẩm chốt qua trao đổi ngày 26/11: mở cho
mọi chủ xe, mục đích là quản lý nguồn đơn) · Ghi đè: quyết định 26/10/2026 "lập đơn tay chỉ dành cho tuyến
gói" (cổng `@SubscriptionTrackOnly()` ở `POST /bookings`) · Bổ sung:
[0028](0028-marketplace-subscription-fees-and-custodied-funds.md) điều 9 (giao dịch ngoài nền tảng),
[0027](0027-feature-tiers-basic-owner-vs-shop.md) điều 1 (bậc cơ bản có thêm "lập đơn"),
[0109](0109-negotiated-price-and-booking-collateral.md) (đơn tự lập) · Giữ nguyên: luồng đặt xe ở site khách
(ADR 0044 · 0060), tiền giữ chỗ (0064 · 0066), báo cáo tổng hợp là tính năng của gói (0027 điều 1)

## Bối cảnh

Chủ sản phẩm muốn partner dùng XePrime để quản lý lịch của chính xe mình, không chỉ để đăng xe lên chợ:
tắt xe khỏi sàn được (đã có, ADR 0048), và ghi được mọi chuyến - chuyến từ XePrime, từ người quen giới
thiệu, từ nền tảng khác - vào MỘT lịch.

Trước ADR này:

- `POST /bookings` chỉ mở cho tuyến gói. Chủ xe tuyến hoa hồng giữ lịch cho chuyến ngoài chợ bằng KHOÁ XE
  (`vehicle_blocks`): không khách, không tiền, không hợp đồng, không biết chuyến đến từ đâu.
- Đơn tự lập không mang dấu nguồn. Muốn biết một đơn có qua sàn hay không phải suy từ ba dấu hiệu rời
  (`booking_requests.booking_id`, `billing_mode` NULL, `price_snapshot.source = 'manual'`), và hầu hết màn
  không suy: Tổng quan của admin cộng cả đơn tự lập vào số đơn và GMV của sàn.

Lo ngại đã nêu và câu trả lời của chủ sản phẩm:

- Đơn tự lập không có phí sàn, hoa hồng, thuế, bảo hiểm ⇒ chủ xe kéo khách ra ngoài sàn. **Chấp nhận**: tắt
  tính năng thì họ vẫn giao dịch ngoài được (ghi sổ tay, tắt xe trên chợ); chặn chỉ làm XePrime mất dữ liệu.
- Nghĩa vụ phí và thuế của nền tảng: **chỉ đơn đi qua sàn**. Đơn tự lập là ghi chép của chủ xe trên công cụ
  quản lý, không phải giao dịch của sàn; phần giải trình với cơ quan quản lý do công ty lo.

## Quyết định

### 1. Mọi chủ xe tự lập được đơn - cả hai tuyến

`POST /bookings` bỏ `@SubscriptionTrackOnly()`, chỉ còn quyền `bookings.create`. Web: `useCanCreateBooking`
chỉ xét quyền; nút "Đặt xe cho khách" (danh sách đơn, ô lịch) hiện cho chủ xe tuyến hoa hồng.

Đơn tự lập giữ nguyên bản chất của ADR 0028 điều 9 · ADR 0109: nằm NGOÀI SÀN - không phí sàn `S`, không hoa
hồng `H`, không thuế `T`, không bảo hiểm `IV`/`IP`, không tiền giữ chỗ, không QR. Tiền thuê và cọc khách
đưa thẳng chủ xe; XePrime chỉ GHI NHẬN (số tiền đơn, lượt thu `payments`, tài sản thế chấp). Đơn vẫn chiếm
lịch qua `vehicle_occupancies` + EXCLUDE (ADR 0006) như mọi đơn: một xe không có hai chuyến chồng giờ, dù
chuyến đến từ nguồn nào. Khoá xe (`vehicle_blocks`) vẫn còn, cho lúc xe không có khách (bảo dưỡng, dùng riêng).

Trần Owner Lite (3 xe, ADR 0041) và mọi cổng khác của tuyến hoa hồng không đổi.

### 2. `bookings.source` - MỘT cột trả lời hai câu hỏi

| Giá trị | Ai đặt | Nghĩa |
| --- | --- | --- |
| `xeprime` | **Chỉ server** | Đơn QUA SÀN: sinh ra từ một yêu cầu đặt xe của khách (ADR 0044) - có tiền giữ chỗ, phí, thuế, bảo hiểm |
| `walk_in` · `repeat_customer` · `referral` · `social` | Chủ xe chọn | Đơn tự lập: khách vãng lai · khách quen · người quen giới thiệu · mạng xã hội |
| `other_platform` · `other` | Chủ xe chọn + `source_label` | Nền tảng khác / nguồn khác, kèm tên tự nhập (≤ 50 ký tự) |

- Hằng ở `@xeprime/types` (`BOOKING_SOURCE`); phép hỏi "đơn qua sàn?" là `isMarketplaceBooking(source)` -
  một hàm cho API, web và app. Không màn nào tự suy lại từ `booking_request_id` hay `billing_mode`.
- **DB giữ luật `source = 'xeprime'` ⇔ đơn có yêu cầu trỏ vào**, bằng hai trigger viết tay ở migration
  `20261126100000_booking_source`:
  - `booking_requests_mark_booking_source` (AFTER INSERT/UPDATE OF `booking_id`): yêu cầu trỏ vào đơn ⇒ đơn
    tự thành `xeprime`, nhãn bị xoá. Mọi đường gắn yêu cầu vào đơn (duyệt, tiền về đủ, seed, test) đi qua đây,
    nên tầng app KHÔNG ghi `xeprime` ở đâu cả.
  - `bookings_source_matches_request` (CONSTRAINT TRIGGER, DEFERRED): lượt ghi `source` lệch khỏi luật - gắn
    `xeprime` cho đơn không có yêu cầu, hay gỡ `xeprime` khỏi đơn có yêu cầu - bị từ chối lúc commit.
- DTO tạo đơn nhận `source` thuộc `BOOKING_DIRECT_SOURCE_VALUES` (không có `xeprime`). Vắng `source` (app
  chưa cập nhật) ⇒ `other` không nhãn. Gửi `other_platform` / `other` thì `sourceLabel` bắt buộc; nhãn gửi kèm
  nguồn không nhận nhãn bị bỏ. CHECK ở DB: nhãn chỉ có ở hai nguồn nhận nhãn và không rỗng.
- Đơn tự lập trước ADR này được gán `other` (chưa ai khai nguồn); đơn đã sinh từ yêu cầu được gán `xeprime`.
- Chủ xe **không** tự lập được đơn nguồn `xeprime`. Đơn qua sàn cần tài khoản khách (tiền hoàn về ví của
  tài khoản khách - ADR 0053 điều 8, bằng lái đã xác thực - ADR 0057, khách tự đồng ý bảo hiểm, khách xác nhận
  bàn giao). Muốn khách của mình đặt qua sàn thì gửi khách link xe để họ tự đặt ở site khách (việc về sau).

### 3. Đổi nguồn, gợi ý nhãn, bộ lọc

- `PATCH /bookings/:id/source` (quyền `bookings.update`, có audit `booking.source_update`): đổi nguồn của đơn
  tự lập ở mọi trạng thái - nguồn là nhãn thống kê, không chạm tiền, lịch hay trạng thái. Đơn qua sàn ⇒ 409
  `BOOKING_SOURCE_LOCKED`. Gửi lại y nguyên không ghi audit lần hai.
- `GET /bookings/source-labels`: các nhãn gian hàng đã từng nhập, mới dùng nhất trước (≤ 30) - nuôi ô gợi ý
  của hộp lập đơn / đổi nguồn và bộ lọc, để một nguồn chỉ có một cách viết.
- `GET /bookings`, `GET /booking-history`, `GET /platform/bookings` nhận `source`: một mã nguồn, hoặc `direct`
  = mọi đơn ngoài sàn. `GET /bookings` nhận thêm `sourceLabel` (khớp đúng chuỗi). Lọc ở DB, có index
  `(tenant_id, source, pickup_at)`. Yêu cầu đặt xe (chưa thành đơn) luôn thuộc nguồn XePrime: lọc một nguồn
  ngoài sàn thì các nhóm yêu cầu rỗng.

### 4. Nguồn và thanh toán hiện ở đâu

Giữ các màn quản lý CHUNG, thêm nhãn và bộ lọc - không dựng màn riêng cho đơn ngoài sàn.

| Màn (site partner) | Thêm |
| --- | --- |
| Hộp "Đặt xe cho khách" - bước Xem lại | Ô "Nguồn đơn" bắt buộc, không chọn sẵn; hai nguồn nhận nhãn mở ô tên có gợi ý |
| Đơn thuê xe (List + Kanban) | Viên nguồn trên thẻ đơn; ô lọc "Nguồn đơn" (XePrime · Tự khai thác · từng nguồn · từng nhãn đã nhập) |
| Chi tiết đơn | Dòng "Nguồn đơn" + nút "Đổi nguồn" (chỉ đơn tự lập) |
| Đơn đã kết thúc | Viên nguồn trong cột dịch vụ; ô lọc nguồn |
| Lịch xe | Dấu nguồn trên thanh đơn (chữ cái đầu, gold = XePrime); dấu thanh toán: thu đủ = dấu tích, thu một phần = `n%`, chưa thu = không dấu; thẻ xem nhanh có dòng Nguồn đơn + Thanh toán; chú thích thêm hai dấu |
| Tài chính (gói) | Khối "Doanh thu theo nguồn đơn" |

Dấu thanh toán trên lịch đọc `paidPercent` do SERVER tính (`bookingPaidPercentOf`, cùng phép "Còn phải thu
của khách" của trang đơn: phải thu = tiền thuê + phụ phí; còn thiếu = công nợ trừ phần `D` khách đã trả
trong tiền giữ chỗ). Nguồn dữ liệu là lượt thu chủ xe ghi ở `POST /bookings/:id/payments` (mở cho cả hai tuyến).

### 5. Thống kê tiền: tổng và từng nguồn

- **Gian hàng (gói)** - `GET /finance/by-source` (`@RequiresFeature(finance)`): doanh thu ĐÃ THU trong kỳ gộp
  theo (nguồn, nhãn), cùng định nghĩa doanh thu với `/finance/summary` nên tổng các dòng bằng thẻ Doanh thu.
  Trả sẵn ba số: `total`, `marketplaceAmount` (qua XePrime), `directAmount` (tự khai thác), và
  `unlinkedAmount` (khoản thu không gắn đơn - có dòng riêng, không biến mất). Mỗi dòng kèm số chuyến nhận
  xe trong kỳ và giá trị các chuyến đó.
- **Chủ xe tuyến hoa hồng** - không có báo cáo tổng hợp (ADR 0027 điều 1 giữ nguyên): họ có nhãn, bộ lọc
  nguồn trên danh sách đơn và số tiền của từng đơn. Báo cáo theo nguồn là một lý do của gói.
- **Admin nền tảng** - số đơn, đơn huỷ, GMV và chuỗi 30 ngày ở Tổng quan **chỉ tính đơn qua sàn**
  (`source = 'xeprime'`). Đơn tự lập không phải giao dịch của sàn. Danh sách đơn của admin vẫn thấy mọi đơn,
  có trường nguồn và ô lọc nguồn.

### 6. Những chỗ đơn tự lập KHÔNG tham gia

Đã đúng sẵn nhờ cách dữ liệu được nối, ADR này ghi lại để không ai nới:

| Chỗ | Vì sao đơn tự lập đứng ngoài |
| --- | --- |
| Tiền giữ chỗ, ví, quyết toán, sổ thuế khấu trừ, hợp đồng bảo hiểm | Chỉ sinh từ `booking_holds` / snapshot có `fees` - đơn tự lập không có |
| Chỉ số uy tín, xếp hạng (`HostMetricsService`) | Đọc từ `booking_requests` + `booking_cancellations.booking_request_id` |
| Đánh giá công khai | `ReviewService` đòi `bookingRequest.customerUserId` - đơn tự lập không có tài khoản khách |
| Chuyến đi của khách, chat | Đi theo tài khoản khách của yêu cầu |

## Hệ quả

- Gói mất tính năng "lập đơn tay" như một lý do mua. Giá trị còn lại của gói: `H = 0` trên đơn qua sàn, thu
  chi, công nợ, báo cáo (gồm báo cáo theo nguồn), nhân viên, chi nhánh, bảo dưỡng.
- Giao dịch ngoài sàn hiện rõ trong dữ liệu (đơn nguồn "khách quen" của một khách từng đặt qua sàn). Đây là
  dữ liệu, không phải vi phạm bị chặn.
- App Partner (mobile) chưa có ô chọn nguồn: đơn app tạo mang `other` cho tới khi app theo kịp (ADR 0031 -
  hai bản không tự đồng bộ).

## Cấm

- ❌ Nhận `xeprime` từ client, hay để tầng app tự ghi `xeprime` - nguồn đó chỉ đến từ trigger khi yêu cầu trỏ vào đơn.
- ❌ Tự suy "đơn qua sàn" từ `booking_request_id` / `billing_mode` / `price_snapshot.source` ở một màn mới -
  dùng `isMarketplaceBooking(source)`.
- ❌ Cộng đơn tự lập vào số đơn / GMV / doanh thu của SÀN, cho nó vào chỉ số uy tín, hay cho đánh giá công khai.
- ❌ Thu phí sàn, hoa hồng, thuế, bảo hiểm hay phát QR tiền giữ chỗ cho đơn tự lập; thu hộ tiền thuê hay giữ
  cọc của đơn tự lập (ADR 0028 điều 8).
- ❌ Dựng lại `@SubscriptionTrackOnly()` ở `POST /bookings`, hay dựng báo cáo tổng hợp theo nguồn cho bậc cơ bản.

## Cần xem lại khi

- Có đối tác hoặc luồng cho phép bán bảo hiểm cho đơn tự lập (cần ADR riêng: thu phí bảo hiểm qua QR).
- Làm "gửi link đặt xe cho khách" để chủ xe đưa khách của mình vào luồng qua sàn.
- Cơ quan quản lý yêu cầu khác về đơn ghi trên hệ thống mà tiền không qua sàn.
