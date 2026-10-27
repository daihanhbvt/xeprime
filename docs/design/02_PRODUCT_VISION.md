# 02 — Product Vision

> Cập nhật: 06/10/2026
> Trạng thái: **Canonical — định hướng sản phẩm hiện hành**
> Dựa trên ADR đến **0053** — trọng tâm: [0028](../decisions/0028-marketplace-subscription-fees-and-custodied-funds.md) (hai tuyến) · [0032](../decisions/0032-booking-deposit-insurance-and-owner-lite.md) · [0033](../decisions/0033-money-ledger-and-deposit-allocation.md) · [0038](../decisions/0038-owner-track-split-and-unified-wallet.md) · [0040](../decisions/0040-registration-track-split.md) · [0041](../decisions/0041-plan-tiers-by-vehicle-count.md) · [0043](../decisions/0043-marketplace-relevance-ranking.md)–[0053](../decisions/0053-separate-account-realms.md). Chỉ mục và quan hệ ghi đè: [`decisions/README.md`](../decisions/README.md).
> Tài liệu này TÓM TẮT cho người đọc sản phẩm. Khi lệch với ADR, **ADR thắng** — sửa tài liệu này, không sửa theo nó.

## 1. XePrime là gì

XePrime là **chợ đăng và thuê xe** đồng thời là **giải pháp quản lý hoạt động cho thuê xe**.

- Người thuê tìm xe, xem giá/lịch/chính sách, gửi yêu cầu, trả **tiền giữ chỗ** sau khi được nhận chuyến và theo dõi chuyến đi.
- Chủ có ít xe bắt đầu bằng bộ công cụ rút gọn (Owner Lite), không trả thuê bao; nền tảng thu phí dịch vụ theo chuyến ở phía khách.
- Chủ xe chuyên nghiệp/đơn vị cho thuê mua gói gian hàng (ba bậc theo số xe) để dùng toàn bộ công cụ quản lý, 0% phí dịch vụ XePrime theo chuyến.
- Xe của mọi nhóm cùng nằm trên **một** marketplace; không tách hai chợ.

Giá trị cốt lõi là một vòng kín: **nguồn xe thật → lịch thật → đặt xe thật → giao nhận phù hợp từng mô hình → tiền và trách nhiệm giải thích được**.

## 2. Những người XePrime phục vụ

### 2.1 Ba site, ba không gian tài khoản

| Site / app | Realm | Ai |
| --- | --- | --- |
| `xeprime.vn` · app **XePrime** | `customer` | Người thuê |
| `partner.xeprime.vn` · app **XePrime Partner** | `partner` | Chủ xe cá nhân tuyến hoa hồng (Owner Lite), chủ gian hàng tuyến gói, nhân viên gian hàng |
| `admin.xeprime.vn` | `platform` | Nhân sự nền tảng |

- Mỗi tài khoản thuộc đúng một realm. Cùng SĐT/email/Google ở hai site là **hai tài khoản riêng**, mật khẩu riêng, phiên riêng; hệ thống không liên kết chúng ([ADR 0053](../decisions/0053-separate-account-realms.md) điều 1–4).
- Chủ xe muốn đi thuê xe thì dùng tài khoản khách. Không ai đặt được xe của chính gian hàng mình: server so SĐT đã xác minh của tài khoản khách với thành viên gian hàng (`CANNOT_BOOK_OWN_VEHICLE` — điều 7).
- Một tài khoản đối tác thuộc tối đa **một** gian hàng (điều 6).
- Bề mặt sản phẩm: một Next app, ba site theo host; hai app mobile mỏng dùng chung `shared` ([ADR 0051](../decisions/0051-product-surfaces-web-zones-and-mobile-variants.md)).

### 2.2 Người thuê xe

Tìm được xe đúng nhu cầu, biết tổng tiền và điều kiện trước khi gửi yêu cầu, biết khi nào chuyến chắc chắn thuộc về mình, nhận đúng xe và có đường xử lý khi phát sinh sự cố. Tiền hoàn của chuyến đi thuê vào **ví điểm của tài khoản khách** đã đặt chuyến.

### 2.3 Chủ xe cá nhân — tuyến hoa hồng (Owner Lite)

Thường có 1–3 xe. Làm việc ở **site partner**, cùng cây URL với gian hàng; menu chỉ hiện năng lực của tuyến ([ADR 0051](../decisions/0051-product-surfaces-web-zones-and-mobile-variants.md) điều 3). Họ cần:

- Đăng và quản lý xe (tối đa **3 xe, tính TỔNG ô tô + xe máy** — [ADR 0041](../decisions/0041-plan-tiers-by-vehicle-count.md) điều 4); chỉ có một cổng duyệt là duyệt XE ([ADR 0036](../decisions/0036-single-approval-gate-for-commission-owners.md)).
- Mở/khóa lịch, nhận và xử lý yêu cầu/đơn thuê, chat.
- Biết từng khoản khấu trừ, số thực nhận, ví điểm và rút tiền; khai thuế, chứng từ.
- Hỗ trợ/tranh chấp.

Đây là **trải nghiệm quản lý rút gọn**, không phải bản source được clone: cùng module, API và dữ liệu với gian hàng; ranh giới tuyến chặn ở server (`resolveEffectiveBilling`, `@SubscriptionTrackOnly` — [ADR 0038](../decisions/0038-owner-track-split-and-unified-wallet.md) điều 1, 4).

### 2.4 Gian hàng — tuyến gói

Cá nhân muốn vận hành chuyên nghiệp hoặc doanh nghiệp nhiều xe/nhân viên/chi nhánh. Ngoài bộ cơ bản, gói mở: thu chi, công nợ, báo cáo; bảo trì; nhân viên/phân quyền, chi nhánh, tài xế; hợp đồng; 0% phí dịch vụ XePrime theo chuyến khi gói còn hiệu lực.

- **Nâng cấp**: chủ xe tuyến hoa hồng mua gói ngay trên tài khoản đối tác hiện có, không tạo lại xe. Đơn đã tạo giữ snapshot thương mại cũ ([ADR 0024](../decisions/0024-billing-mode-from-plan-frozen-on-booking.md)). Đăng ký tuyến gói ngay từ đầu chỉ vào được Manage khi hoá đơn đã `paid` — kích hoạt là việc của webhook SePay ([ADR 0040](../decisions/0040-registration-track-split.md) điều 1–3).
- **Hạ cấp khi hết gói** (đã chốt): hết hạn + hết ân hạn ⇒ tenant về tuyến hoa hồng, dùng Owner Lite; không có Manage chỉ-xem. Xe ở nguyên trên chợ, chuyến đang chạy khép bình thường; ví, chứng từ, bàn giao, khai thuế không nằm sau cờ tính năng nào. Trần chặn TẠO mới, không gỡ xe đang bán ([ADR 0038](../decisions/0038-owner-track-split-and-unified-wallet.md) điều 5 · [ADR 0041](../decisions/0041-plan-tiers-by-vehicle-count.md) điều 4). `onboarding_state = package_active` không lùi — họ là khách cũ cần gia hạn ([ADR 0040](../decisions/0040-registration-track-split.md) điều 4).

### 2.5 Nhân sự nền tảng

`platform_admin` · `reviewer` (duyệt xe/hồ sơ) · `support` (ticket, sự cố, tranh chấp) · `finance_admin` (đối soát, hoàn tiền, rút tiền) · `platform_staff`. Tài khoản do admin tạo, không tự đăng ký; đăng nhập mật khẩu.

Làm hộ gian hàng đi qua **phiên hỗ trợ** có lý do, hạn 45 phút, capability do server cấp và audit phía nền tảng — không giả danh, không membership tạm ([ADR 0050](../decisions/0050-platform-tenant-support-context.md)). Tiền, thành viên, gói, giá và trạng thái đơn nằm ngoài phiên hỗ trợ.

## 3. Hai lựa chọn cho chủ xe

| Nội dung | Tuyến hoa hồng (Owner Lite) | Tuyến gói (gian hàng) |
| --- | --- | --- |
| Phí cố định | 0đ | Theo bậc gói và kỳ hạn |
| Trần xe | 3 xe (tổng hai loại) | Theo bậc: 3 · 10 · không giới hạn |
| Phí dịch vụ XePrime/chuyến | `S` = `fee_policies.service_fee_percent` × giá thuê (pilot 10%), **cộng vào phía khách**, không trừ tiền chủ xe | 0% khi gói hiệu lực |
| Thuế `T` | Khấu trừ khỏi khoản XePrime phải trả chủ xe khi chuyến bắt đầu; không cộng vào tổng khách | Như bên trái |
| Bảo hiểm | Xe/chuyến (`IV`) bắt buộc + tai nạn con người (`IP`) tùy chọn — **khách trả** | Như bên trái |
| Tiền giữ chỗ (QR) | Bắt buộc thu cọc | Gian hàng có **công tắc bật/tắt thu cọc**; mức cọc do nền tảng đặt ([ADR 0033](../decisions/0033-money-ledger-and-deposit-allocation.md) điều 7) |
| Tiền thuê còn lại `B − D` | Khách trả trực tiếp chủ xe khi nhận xe; XePrime không thu hộ | Như bên trái |
| Công cụ | Rút gọn | Đầy đủ (Manage) |
| Hiển thị | Theo độ phù hợp/chất lượng/uy tín (§6) | Như bên trái — **chưa có ưu tiên gói** (§6) |

### Bậc gói ([ADR 0041](../decisions/0041-plan-tiers-by-vehicle-count.md))

Bán theo **trần TỔNG số xe** và **kỳ hạn**; giá mỗi kỳ là **số tuyệt đối** admin nhập ở `limits.termPrices`, phần trăm "tiết kiệm" chỉ là phép so hiển thị. Cả ba bậc mở cùng bộ tính năng — khác nhau ở quy mô.

| Bậc | Trần xe | Trần chi nhánh | Giá seed (1 · 3 · 6 · 12 tháng) |
| --- | --- | --- | --- |
| Cơ bản | 3 | 1 | 100.000 · 250.000 · 450.000 · 800.000đ |
| Nâng cao | 10 | 3 | 250.000 · 650.000 · 1.200.000 · 2.000.000đ |
| Chuyên nghiệp | Không giới hạn | Không giới hạn | Không niêm yết — `salesOnly`, bán qua tư vấn, admin gán với giá đàm phán |

Giá seed là **policy pilot** cấu hình được ở admin, chưa phải giá production. Tỷ lệ phí dịch vụ, thuế và bảo hiểm cũng là tham số có phiên bản ở `fee_policies`; đơn lưu snapshot lúc tạo, không tính lại.

## 4. Nguyên tắc giá, thuế và bảo hiểm

### 4.1 Không che nguồn thu của nền tảng

Không gọi phí của XePrime là "thuế" hay "bảo hiểm" nếu tiền không nộp cho cơ quan thuế/doanh nghiệp bảo hiểm. Ba dòng tách bạch:

- **Phí dịch vụ chuyến đi**: khoản XePrime hưởng để vận hành marketplace, thanh toán, hỗ trợ, chống gian lận.
- **Thuế khấu trừ/nộp thay**: đúng số thực tế theo loại người bán và loại dịch vụ.
- **Phí bảo hiểm chuyến đi**: đúng phí sản phẩm bảo hiểm thật, kèm nhà bảo hiểm, quyền lợi, loại trừ.

UI có thể gom ở phần tóm tắt nhưng trước khi xác nhận phải cho mở breakdown và biết tiền đi đâu.

### 4.2 Thuế

Theo Nghị định 117/2025/NĐ-CP, nền tảng có chức năng thanh toán có thể phải khấu trừ/nộp thay thuế cho hộ/cá nhân theo từng giao dịch. Việc cho thuê xe được phân loại thế nào phải do tư vấn thuế xác nhận. Không dùng một tỷ lệ chung cho mọi chủ thể. Tỷ lệ hiện cấu hình ở dev là **số tham khảo thị trường**, chưa qua tư vấn thuế — xem [`completion-roadmap.md`](../completion-roadmap.md) §5.

### 4.3 Bảo hiểm

Định hướng đối tác đầu tiên là **PVI**, chưa có hợp đồng. Mô hình: `IV` bắt buộc, `IP` tùy chọn (khách bỏ chọn dễ dàng), cả hai do khách trả; tiền giữ chỗ thu `IV`/`IP` dự kiến nhưng **chỉ mua/phát hành ở mốc bàn giao**; hủy trước mốc đó hoàn 100% `IV + IP` ([ADR 0032](../decisions/0032-booking-deposit-insurance-and-owner-lite.md) điều 4). Adapter đối tác hiện là `noop` — từ chối phát hành, phần đã thu nằm trong quỹ giữ hộ.

Chỉ được gọi là "bảo hiểm" ở production khi có: hợp đồng với đối tác hợp pháp; quy tắc, biểu phí, phạm vi; cách cấp chứng nhận; quy trình bồi thường; chứng từ phí thực tế.

## 5. Quy tắc nghiệp vụ

Tóm tắt để đọc nhanh — chi tiết, công thức và ràng buộc nằm ở ADR được dẫn. Không chép thêm công thức tiền vào tài liệu khác; dẫn link ADR.

### 5.1 Thứ tự đặt xe — [ADR 0044](../decisions/0044-approve-before-hold.md)

```text
Khách gửi yêu cầu (không thu tiền, không chiếm lịch)
→ chủ xe DUYỆT tay, hoặc xe bật "Đặt ngay" tự nhận (cùng một đường commitDecision)
   = chốt lịch, chốt giá, giữ xe, phát QR tiền giữ chỗ   [awaiting_hold]
→ khách chuyển khoản trong 120 phút (đồng hồ hai chặng 60′; nhắc khi còn 60′ và 15′; KHÔNG gia hạn)
→ đối soát SePay xác nhận ĐỦ tiền ⇒ ĐƠN THUÊ ra đời        ["Đặt xe thành công"]
→ bàn giao → chuyến đang chạy → trả xe → hoàn thành
```

- **Đơn thuê ra đời DUY NHẤT trong transaction đối soát đủ tiền** — không vì một cú bấm hay một lượt quét QR. `acceptedAt` là mốc "đã được nhận · chờ thanh toán", không phải "đặt xe thành công" (điều 2, 9).
- Không có khoản nào phải thu online (gian hàng tắt thu cọc, báo giá còn tạm tính, dài hạn chưa chốt lịch) ⇒ đơn tạo ngay lúc duyệt, **không có QR giả** (điều 4).
- Giờ nhận quá gần (cửa sổ còn < 15′) ⇒ không phát QR, trả `HOLD_WINDOW_TOO_SHORT`; chuyến thỏa thuận trực tiếp (điều 5).
- Một khung giờ một người thắng: khi một yêu cầu được nhận, các yêu cầu chồng lấn còn chờ đóng bằng `slot_taken` và khách được báo ngay (điều 6).
- Gian hàng có hạn phản hồi yêu cầu động theo khoảng cách tới giờ nhận (4 giờ cho chuyến đặt trước ≥ 24 giờ; 20% khoảng đó, 15 phút – 4 giờ, cho chuyến gần hơn — ADR 0066). Chuyến **có tài xế** không tự nhận khi có thu tiền giữ chỗ (điều 8).

### 5.2 Tiền giữ chỗ và phân bổ — [ADR 0032](../decisions/0032-booking-deposit-insurance-and-owner-lite.md) điều 2 · [ADR 0029](../decisions/0029-per-vehicle-flat-pricing-and-customer-side-fees.md) điều 1–2 · [ADR 0033](../decisions/0033-money-ledger-and-deposit-allocation.md)

| Khoản | Ai trả / chịu | Đi đâu |
| --- | --- | --- |
| `D` cọc — một phần giá thuê `B`; tỷ lệ do nền tảng đặt | Khách, online | Khoản XePrime phải trả chủ xe (sau khi trừ thuế) |
| `S` phí dịch vụ (chỉ tuyến hoa hồng) | Khách, online | Doanh thu XePrime khi chuyến hoàn thành |
| `IV`, `IP` bảo hiểm | Khách, online | Giữ hộ cho hãng bảo hiểm |
| `B − D` | Khách, trực tiếp chủ xe lúc nhận xe | XePrime không thu hộ |
| `T` thuế | Chủ xe chịu | Khấu trừ khỏi khoản phải trả khi chuyến bắt đầu; không cộng vào tổng khách |

- **Tiền giữ chỗ** = `D + S + IV + IP` (trừ mã khuyến mãi nếu có, §5.3). Ở giao diện luôn gọi "tiền giữ chỗ" — khác hẳn **cọc thế chấp khi nhận xe** (`rental-policies`), khoản chủ xe tự giữ và trả lại khi trả xe ([ADR 0044](../decisions/0044-approve-before-hold.md) điều 9).
- Kết cục của tiền giữ chỗ là một **phân bổ nhiều dòng**, tổng luôn bằng số đã thu; tách quỹ đọc từ bốn cột số tiền, không đọc `purpose` ([ADR 0033](../decisions/0033-money-ledger-and-deposit-allocation.md) điều 3–4).

### 5.3 Mã khuyến mãi nền tảng — [ADR 0046](../decisions/0046-platform-funded-promo-codes.md)

- Chỉ admin nền tảng phát hành; gian hàng không có đường nào. Mã do XePrime tài trợ.
- Chỉ trừ vào khoản khách chuyển online; **không bớt tiền gian hàng** — `B`, `S`, `T`, `IV`, `IP`, `D` giữ nguyên. Trần tài trợ `D + S`, sàn `holdMinAmount`. Cộng dồn được với khuyến mãi trực tiếp của chủ xe.
- Lượt dùng: GIỮ lúc gửi yêu cầu → CHỐT khi có đơn → NHẢ khi yêu cầu chết. Hoàn khi huỷ không vượt số khách đã chuyển. Mã áp đọc từ snapshot; mã hết điều kiện lúc duyệt thì nhả và báo khách, lượt duyệt đi tiếp.
- Chuyến không thu trước thì không áp được mã. "Khách mới" đo bằng tài khoản và số yêu cầu đã thành đơn.

### 5.4 Huỷ và hoàn

**Khách** ([ADR 0032](../decisions/0032-booking-deposit-insurance-and-owner-lite.md) điều 5 · [ADR 0044](../decisions/0044-approve-before-hold.md) điều 7):

| Tình huống | Kết quả |
| --- | --- |
| Huỷ trước khi trả / hết 120′ chưa đủ tiền | Nhả lịch; phần đã chuyển dở được hoàn; không phí huỷ |
| Huỷ trong **thời gian huỷ miễn phí, tính từ lúc tiền giữ chỗ về đủ (`paidAt`, ADR 0072)** | Hoàn 100% số đã chuyển online |
| Huỷ sau cửa sổ miễn phí, trước bàn giao | Hoàn 100% `IV + IP`; `D + S` chia 50/50 chủ xe ↔ XePrime; không tính thuế |
| Tiền về sau khi hold đã chết | Không tạo đơn; giao dịch nằm lại cho admin đối soát |

Hạn thanh toán tính XUÔI từ `acceptedAt`; huỷ miễn phí chỉ bắt đầu khi tiền giữ chỗ về ĐỦ và tính XUÔI từ `paidAt` (ADR 0072); hết hạn thanh toán mà chưa đủ tiền là tự huỷ. Các mốc snapshot ở server. Đơn sát giờ phải cảnh báo trước khi khách gửi yêu cầu. Tiền hoàn vào **ví điểm** của tài khoản khách; khách không có tài khoản thì chuyển khoản tay ([ADR 0033](../decisions/0033-money-ledger-and-deposit-allocation.md) điều 5).

**Chủ xe/gian hàng** — theo chặng ([ADR 0045](../decisions/0045-host-cancellation-and-reputation.md) điều 1–2):

| Chặng | Hành động | Tiền |
| --- | --- | --- |
| Chờ duyệt | **Từ chối** | Không có gì |
| Đã nhận · chờ khách trả | **Huỷ chuyến** | Đóng hold, nhả lịch, hoàn phần đã chuyển |
| Đơn chờ giao xe | **Huỷ đơn** (kèm lý do) | Hoàn 100% cho khách, kể cả quá cửa sổ miễn phí |
| Đơn đang thuê | **Không huỷ** | Kết thúc sớm = bàn giao trả xe rồi quyết toán |

Trách nhiệm do server suy từ người thao tác; nhân viên huỷ tính như chủ xe huỷ. Chưa phạt tiền chủ xe, nhưng mỗi lượt huỷ trừ vào chỉ số uy tín (§6).

### 5.5 Trạng thái đơn, bàn giao, tài xế — [ADR 0047](../decisions/0047-booking-status-simplification.md) · [ADR 0032](../decisions/0032-booking-deposit-insurance-and-owner-lite.md) điều 6

- Đơn thuê có **5 trạng thái**: chờ giao xe (`reserved`) · đang thuê · hoàn thành · đã huỷ · khách không đến. Trạng thái "chờ thanh toán" sống ở yêu cầu/hold, không ở đơn.
- Đơn chỉ sang đang thuê/hoàn thành qua lượt xác nhận bàn giao; thao tác chuyển trạng thái bằng tay chỉ còn **huỷ** và **khách không đến**.
- Bằng chứng bàn giao (ảnh, km, nhiên liệu/pin) là **tùy chọn**. Trả muộn, vượt km, hư hỏng là công cụ ghi nhận của gian hàng; XePrime không thu hộ các khoản đó.
- Tài xế là **bản ghi nội bộ** của gian hàng, không có tài khoản/app; chủ xe tuyến hoa hồng mặc định là tài xế.

### 5.6 Thuê dài hạn — [ADR 0011](../decisions/0011-long-term-fixed-packages.md)

Gói cố định 1/2/3/6/9/12 tháng; ngày trả = ngày nhận + N **tháng lịch** (server tính). Khách nêu nguyện vọng ngày nhận, gian hàng chốt lịch khi duyệt — chỉ khi đó mới có giá để in lên QR ([ADR 0044](../decisions/0044-approve-before-hold.md) điều 4). Ưu đãi cam kết thời hạn tính theo tháng, không cộng dồn; không trưng chênh lệch giá dài hạn ↔ giá ngày như khuyến mãi.

### 5.7 Hiển thị xe trên chợ — [ADR 0048](../decisions/0048-owner-marketplace-visibility.md) · [ADR 0049](../decisions/0049-vehicle-review-workbench.md)

Ba trục độc lập: **vận hành** (gian hàng), **kiểm duyệt** (nền tảng — duyệt trên ảnh chụp lúc gửi; "bị ẩn" là quyết định của nền tảng) và **công tắc hiển thị của chủ xe** (`marketplace_enabled`: tắt luôn được, bật có cổng). Lý do một xe không lên chợ do server suy và trả về một chỗ.

### 5.8 Ví điểm, không phải ví điện tử — [ADR 0033](../decisions/0033-money-ledger-and-deposit-allocation.md) · [ADR 0053](../decisions/0053-separate-account-realms.md) điều 8

- Tên hiển thị **"Ví điểm"**, 1 điểm = 1đ. Bản chất là **sổ công nợ phải trả**: không nạp, không chuyển ngang, không thanh toán nội bộ, **không hết hạn, không thu hồi**; ledger chỉ ghi thêm, sửa bằng dòng đảo. Mọi màn số dư hiện câu "1 điểm = 1đ · rút về tài khoản ngân hàng · không hết hạn".
- **Một ví cho một TÀI KHOẢN**: tài khoản khách có ví nhận tiền hoàn; gian hàng (tenant) có ví nhận khoản XePrime phải trả, chỉ chủ gian hàng thao tác; nhân viên không có ví. Hai tài khoản của cùng một người là hai ví, không gộp.
- Rút về tài khoản ngân hàng: người dùng gửi lệnh, admin duyệt, chuyển tay và xác nhận; cam kết chuyển tối đa 2 ngày làm việc kể từ khi duyệt (`WITHDRAWAL_TERMS`).

Nền tảng giữ/thu hộ tiền thật chỉ mở sau ý kiến pháp lý và mô hình với ngân hàng/đơn vị thanh toán phù hợp ([ADR 0028](../decisions/0028-marketplace-subscription-fees-and-custodied-funds.md) release gate).

## 6. Xếp hạng và uy tín

Đã triển khai ([ADR 0043](../decisions/0043-marketplace-relevance-ranking.md) · [ADR 0045](../decisions/0045-host-cancellation-and-reputation.md) điều 3–5):

- Sort **mặc định** của chợ theo `rank_score` — cột dẫn xuất trên `public_listings`, sáu vế: chất lượng (Bayes), số chuyến, độ đầy hồ sơ, độ mới, **uy tín chủ xe** và **khám phá** cho xe mới khai đủ hồ sơ (phai trong 30 ngày). Sort do khách chọn (giá, mới nhất) giữ nguyên tuyệt đối.
- Trang chủ ưu tiên tỉnh của khách nhưng không loại xe; mỗi gian hàng tối đa 2 xe ở đầu khối, phần dư đẩy xuống cuối.
- **Ba chỉ số uy tín công khai** (tỉ lệ phản hồi · thời gian phản hồi · tỉ lệ nhận và giữ chuyến), cửa sổ 90 ngày, một nguồn tính `HostMetricsService`. Chưa đủ mẫu thì hiện "chưa có", không quy về 0. Không gắn vào thẻ kết quả tìm kiếm.
- **Chưa có ưu tiên cho gói thuê bao**: ADR 0028 cho phép trong nhóm kết quả tương đương nhưng chỉ khi giao diện có nhãn vị trí tài trợ — vế đó vắng mặt có chủ đích ([ADR 0043](../decisions/0043-marketplace-relevance-ranking.md) điều 6). Không bảo đảm "lên đầu" cho xe không phù hợp hoặc chất lượng thấp.

## 7. Nguyên tắc sản phẩm

1. Một marketplace, một hồ sơ xe, một lịch, một booking engine.
2. Gói quyết định năng lực; role quyết định ai được thao tác trong năng lực đó; realm quyết định site. Cả ba do server quyết.
3. Bản cơ bản phải đủ hoàn thành một chuyến, không phải bản demo bị khóa ngẫu nhiên.
4. Không clone source giữa Owner Lite và Manage; một cây URL, menu chọn theo tuyến.
5. Mọi số tiền đã thỏa thuận đóng băng vào đơn, không tính lại theo cấu hình mới.
6. Phí dịch vụ, thuế, bảo hiểm, tiền giữ chỗ, cọc thế chấp và tiền phải trả chủ xe là các loại tiền khác nhau.
7. Mọi thao tác admin làm thay đổi tiền hoặc quyền truy cập phải có audit.
8. Web responsive là bề mặt vận hành chính. Mobile: app **XePrime** cho khách và app **XePrime Partner** cho đối tác — hai Expo project mỏng + `shared`. Lệch đã biết: app Partner hiện chỉ phục vụ tuyến gói, Owner Lite vẫn nằm trong app XePrime; phải căn lại theo ADR 0053 khi mở lại việc mobile ([ADR 0051](../decisions/0051-product-surfaces-web-zones-and-mobile-variants.md) điều 5).

## 8. Chỉ số thành công

**North Star:** số ngày-xe được hoàn thành trọn vẹn qua XePrime mỗi tháng.

| Nhóm | Chỉ số |
| --- | --- |
| Marketplace | Tìm kiếm → xem xe → gửi yêu cầu → được nhận → trả tiền giữ chỗ → đơn thuê |
| Chủ xe mới | Thời gian từ đăng ký đến xe đầu tiên được duyệt; chuyến đầu tiên |
| Chủ xe tuyến hoa hồng | Tỷ lệ đơn hoàn thành; thu nhập ròng; thời gian nhận tiền |
| Gian hàng | Tỷ lệ nâng cấp/gia hạn; số xe active; thời gian xử lý yêu cầu |
| Chất lượng | Ba chỉ số uy tín; tỷ lệ hủy, tranh chấp, hoàn tiền, listing bị ẩn; tỷ lệ hold hết hạn |
| Vận hành tiền | Tỷ lệ đối soát tự động; lệnh rút quá SLA; chênh lệch quỹ; ngân sách mã khuyến mãi đã dùng |

## 9. Những gì chưa cam kết

- Tỷ lệ thuế chính xác cho hoạt động cho thuê xe và từng loại chủ thể.
- Hợp đồng/sản phẩm chính thức với PVI; mức phí, phạm vi hai lớp bảo hiểm; hành vi khi phát hành thất bại đúng lúc bàn giao.
- Giá production của gói sau pilot.
- Quy tắc no-show, kéo dài chuyến và tranh chấp sau khi chuyến đã bắt đầu ở mức chính sách công khai.
- Thời điểm mở liên hệ trực tiếp ở tuyến hoa hồng (working rule: sau khi tiền giữ chỗ được xác nhận — [ADR 0032](../decisions/0032-booking-deposit-insurance-and-owner-lite.md)).
- Ưu tiên hiển thị/vị trí tài trợ cho gói (§6).
- Tự động chi tiền về ngân hàng; XePrime tự làm ví điện tử, bảo hiểm hoặc trung gian thanh toán.
- Cam kết bảo vệ giao dịch hai bên thực hiện hoàn toàn ngoài nền tảng.

Các mục này là release gate hoặc giả thuyết cần thử nghiệm, không phải phần đã hoàn thành. Tiến độ và gate: [`completion-roadmap.md`](../completion-roadmap.md).
