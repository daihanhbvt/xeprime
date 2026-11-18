# ADR 0091 — Bảo hiểm MIC theo SRS v1.3: chủ xe chọn Bắt buộc/Tuỳ chọn, phí thu hộ bảo hiểm, GCN lưu R2, tự hoàn khi không cấp được, chặn đặt trước 15 ngày và tự lái tối đa 30 ngày

Ngày: 16/11/2026 · Trạng thái: **Accepted** (16/11/2026 — người dùng chốt từng điểm lệch giữa đặc tả
BA `SRS_INSURANCE_10 v1.3` và ADR 0088), **trừ điều 3 (phí thu hộ) là Proposed** cho tới khi luật sư
trả lời · Ghi đè: [0088](0088-mic-trip-insurance-integration.md)
điều 2 (bắt buộc → chủ xe chọn), điều 7 (GCN không lưu → lưu R2; quá giờ trả → tự hoàn) · Bổ sung:
[0064](0064-financial-flow-v2.md) (thêm dòng phí thu hộ của nền tảng), [0011](0011-long-term-fixed-packages.md)
(tự lái dài hơn trần phải đi thuê dài hạn) · Giữ nguyên: 0088 điều 1, 3, 4, 5, 6 · Ghi chú gửi BA:
doc "Bảo hiểm MIC - thay đổi so với SRS v1.3"

## Bối cảnh

ADR 0088 (11/11) làm bảo hiểm vật chất xe MIC BẮT BUỘC với mọi ô tô tự lái đủ điều kiện, không có công
tắc của chủ xe. Ngày 14–16/11 BA phát hành SRS v1.3: chủ xe tự quyết Bắt buộc hay Tuỳ chọn, gọi
`phi_vcx` lúc báo giá, bộ ảnh giám định riêng, chia hợp đồng cho chuyến > 30 ngày, lưu GCN, tự hoàn khi
không cấp được. Người dùng duyệt lại từng điểm ngày 16/11: lấy phần chủ xe chọn chế độ, lưu GCN, tự
hoàn; giữ bảng phí nội bộ và ảnh đăng xe; thay bài toán > 30 ngày bằng trần thời lượng tự lái; và thêm
một khoản nền tảng thu trên phí bảo hiểm.

## Quyết định

### 1. Chủ xe chọn Bắt buộc hoặc Tuỳ chọn (ghi đè 0088 điều 2)

- Chế độ là MỘT cột của chính sách thuê: `rental_policies.insurance_mode` (`required` | `optional`,
  mặc định `optional`, CHECK ở DB). Gian hàng đặt ở dòng mặc định theo loại xe; xe nào cần thì tuỳ
  chỉnh chính sách riêng (dòng ghi đè mang cột này); bỏ tuỳ chỉnh thì xe quay về chính sách gian
  hàng. Chủ xe tuyến hoa hồng không có trang chính sách gian hàng (ADR 0085 điều 3): họ đặt trên từng
  xe. Chế độ của một xe = dòng ghi đè → dòng mặc định theo loại xe → dòng mặc định chung → `optional`.
- **Bắt buộc**: xe đủ điều kiện ⇒ mọi chuyến tự lái có dòng `IV`, khách không bỏ được. Xe chưa đủ
  điều kiện (thiếu giá trị xe, ảnh, cà vẹt, thông tin xe — `insuranceEligibilityGaps`) ⇒ **không nhận
  đặt tự lái**: gửi yêu cầu bị từ chối `VEHICLE_INSURANCE_NOT_READY`, snapshot chợ mang
  `self_drive_insurance_blocked = true` (writer vẫn là `ListingsService`) và tìm xe tự lái loại xe đó
  ra. Có tài xế và thuê dài hạn không bị ảnh hưởng.
- **Tuỳ chọn**: báo giá có ô tích, mặc định CHƯA tích. Tích ⇒ cộng `IV`; không tích ⇒ không có `IV`,
  không có hợp đồng. Xe chưa đủ điều kiện ⇒ không có ô tích, vẫn nhận đặt.
- Đổi chế độ chỉ áp cho báo giá MỚI. Lúc gửi yêu cầu, server đóng băng hai cột:
  `booking_requests.vehicle_protection_required` (chế độ lúc gửi) và `vehicle_protection_selected`
  (Bắt buộc ⇒ server tự đặt `true`; Tuỳ chọn ⇒ đúng lựa chọn của khách; xe không bán được ⇒ `false`).
  Lượt duyệt (tay hoặc "Đặt ngay") chỉ đọc hai cột đó. Khách đã mua mà lúc duyệt xe không còn bán
  được ⇒ lượt duyệt bị chặn `VEHICLE_PROTECTION_UNAVAILABLE` (không tự bỏ dòng `IV` khách đã chọn);
  "Đặt ngay" rơi về chờ chủ xe duyệt tay. Cổng của nền tảng vẫn đứng trước: chưa có đối tác hoặc sản
  phẩm tắt thì không thu đồng nào, không chặn gì.
- Gian hàng đổi sang Bắt buộc ⇒ API trả danh sách xe đang dùng chính sách gian hàng mà thiếu dữ liệu,
  giao diện hỏi lại trước khi lưu. Mọi lượt đổi ghi audit `rental_policy.update` (đã có).
- Khách tích Tuỳ chọn là bằng chứng đồng ý mua: `booking_insurance_policies.consent_at` ghi lúc
  duyệt cho chuyến Tuỳ chọn (ADR 0028 điều 5); chuyến Bắt buộc để `NULL` như cũ.

### 2. Phí lấy từ bảng % nội bộ, admin thấy phí thực tế từng chuyến (giữ 0088 điều 3)

> **Ghi đè bởi [ADR 0097](0097-insurance-premium-from-partner-at-approval.md) (17/11/2026):** lượt DUYỆT
> hỏi MIC (`phi_vcx`, chờ tối đa 1,5 giây), công thức bậc chỉ là dự phòng. Báo giá công khai vẫn không
> gọi MIC.

Không gọi `phi_vcx` lúc báo giá hay lúc duyệt (bỏ Q22 của SRS). Màn Admin › Bảo hiểm hiện cho từng
hợp đồng: giá trị xe, bậc áp dụng (số ngày và %), phí đã thu của khách, phí MIC tính lúc cấp
(`partner_premium_amount`), chênh lệch, và phí thu hộ đã thu.

### 3. Phí thu hộ bảo hiểm của nền tảng (Proposed — chờ luật sư)

- Cấu hình trên sản phẩm bảo hiểm: `insurance_products.service_fee_enabled` (mặc định `false`) và
  `service_fee_percent` (0–100, hai chữ số lẻ — trần nâng từ 50 ngày 17/11/2026, xem ADR 0097). Chỉ admin nền tảng sửa, có audit.
- Dòng phí riêng `insurance_service_fee` (người hưởng: nền tảng, người trả: khách) =
  `roundVnd(IV × %)`, chỉ có khi chuyến có dòng `IV`. Tên hiển thị tạm "Phí thu hộ bảo hiểm".
- Tiền: cộng vào tổng khách và vào tiền giữ chỗ online (không phải tiền của chủ xe); mã khuyến mãi
  KHÔNG trừ vào nó (trần tài trợ vẫn `D + S + H`); không vào thuế, hoa hồng hay tiền chủ xe. Cột riêng
  `booking_holds.insurance_service_fee_amount` (ADR 0033 điều 4: tách quỹ đọc từ cột).
- Phân bổ: hoàn khách ở MỌI trường hợp hoàn `IV` (huỷ, no-show, hết hạn, không cấp được); chuyến hoàn
  thành có hợp đồng ⇒ doanh thu nền tảng. Không bao giờ nằm trong bảng kê chuyển MIC.
- Hiển thị cho khách: MỘT dòng "Bảo hiểm vật chất xe" bằng `IV + phí thu hộ`, icon ⓘ tách hai phần.
  Bề mặt đối tác và quản trị luôn thấy hai dòng riêng. Dữ liệu và sổ sách luôn là hai dòng.
- Câu hỏi cho luật sư: đại lý thu phí có được thu thêm % trên phí bảo hiểm không; tên gọi; hoá đơn
  GTGT; trình bày gộp. Chưa có trả lời thì KHÔNG bật công tắc ở production.
- **Triển khai (16/11/2026):** migration `20261116160000_insurance_service_fee_refund` — cột
  `insurance_products.service_fee_*` (CHECK chỉ `vehicle_trip`, bật ⇒ % > 0),
  `booking_holds.insurance_service_fee_amount` (bốn CHECK tiền của hold dựng lại có `X`),
  `booking_insurance_policies.service_fee_amount`. Tính ở `computeCustomerFees` (`@xeprime/types`), %
  đọc qua `InsuranceOfferService.vehicleTripServiceFeePercent()` (null khi công tắc tắt hay nền tảng
  không bán `IV`); phân bổ ở `resolveHoldAllocation`; đối soát ba vế trừ phần `X` đã hoàn sau quyết
  toán (`platform.insuranceServiceFeeRefunded`). Khách: `customerFeeLines` (web) gộp dòng, ⓘ
  `InsuranceFeeHint`; admin sửa công tắc + % ở form sản phẩm bảo hiểm.

### 4. Chặn thời gian đặt xe (bổ sung 0011)

Hai số của nền tảng, sống ở chính sách phí (có phiên bản như mọi số khác, admin sửa):
`fee_policies.max_advance_booking_days` (mặc định 15) và `self_drive_max_days` (mặc định 30). Áp cho
yêu cầu đặt xe của KHÁCH trên chợ: giờ nhận không quá N ngày kể từ lúc gửi (tự lái và có tài xế,
`BOOKING_TOO_FAR_AHEAD`); chuyến tự lái không dài quá M ngày (`SELF_DRIVE_TOO_LONG`), dài hơn thì đặt
thuê dài hạn. Thuê dài hạn giữ nguyên. Yêu cầu và đơn đã có không bị đụng. Hệ quả: chuyến tự lái luôn
nằm trong bậc phí MIC tối đa 30 ngày, mỗi đơn đúng MỘT hợp đồng — bỏ phần chia hợp đồng của SRS.

### 5. Ảnh gửi MIC: giữ 5 ảnh đăng xe (giữ 0088 điều 4)

Không làm bộ ảnh giám định riêng, không cờ chụp lại.

### 6. GCN PDF lưu R2 riêng tư (ghi đè 0088 điều 7)

Hợp đồng vừa cấp ⇒ vòng quét của API (`InsuranceFollowUpSweeper`, 5 phút) tải PDF từ MIC MỘT lần,
lưu R2 ở khoá riêng tư `insurance/certificates/<policyId>.pdf`
(`booking_insurance_policies.certificate_object_key`). Ở API chứ không ở worker vì client MIC tải GCN
và R2 đã sống ở đó. Ba endpoint có phạm vi (khách, gian hàng, quản trị) trả file từ R2; chưa có bản
lưu thì tải từ MIC, lưu rồi trả. Không có đường công khai nào tới khoá đó.

### 7. Cấp đơn: tra lại, báo khẩn, tự hoàn (ghi đè 0088 điều 7)

- MIC trả tình trạng 3 (chưa nhận ảnh) sau khi cấp ⇒ tra cứu lại tối đa 4 lần, cách nhau 15 giây
  (qua lịch thử lại của worker, không ngủ trong job); vẫn 3 thì về hàng đợi admin.
- Quá 2 giờ sau mốc giao xe mà chưa cấp ⇒ báo khẩn admin MỘT lần (`escalated_at`): hợp đồng vào khối
  "Cần xử lý gấp" đầu tab Chứng nhận (`GET /platform/money/insurance/attention`), cùng hợp đồng MIC hết
  lượt tra mà vẫn chờ ảnh.
- Quá giờ trả mà chưa cấp ⇒ tra cứu `id_tras` lần cuối. Có hợp đồng ⇒ ghi nhận như cấp bình thường.
  Không có ⇒ hợp đồng chuyển `cancelled` và hoàn `IV` + phí thu hộ vào Ví điểm của tài khoản khách
  (`resolveRefundWalletOwner`, `WalletService.creditWithinTx`), cùng transaction, idempotent.
  **Triển khai (16/11/2026):** `InsuranceRefundService.refundOverdue`, chạy trong vòng quét
  `InsuranceFollowUpSweeper` (5 phút). Chỉ xét hợp đồng `reserved`/`failed` của chuyến ĐÃ giao xe, quá
  giờ trả, có tài khoản khách, và khoản giữ chỗ ĐÃ quyết toán `settled` (trước đó tiền còn trong hold,
  hoàn lúc đó là phân bổ hai lần). Lượt tra cuối đi qua `InsuranceService.issueOne` (giữ chỗ bằng
  `updateMany` sang `issuing`, adapter tra `id_tras` trước); đối tác không trả lời ⇒ để lượt quét sau.
  Hoàn: dòng Ví điểm `insurance_refund` nguồn `booking_insurance_policy` (unique ví + loại + nguồn chống ghi đôi),
  hợp đồng `cancelled` + `refunded_at` (CHECK chỉ khi `cancelled`), cùng transaction. Admin thấy dòng
  "Đã tự hoàn" ở ngăn phí của hợp đồng; trang `/insurance` hứa điều này với khách.

### 8. Khấu trừ khi có tổn thất: khách thuê chịu

Mức khấu trừ theo sản phẩm (`insurance_products.deductible_car`). Trang công khai "Quyền lợi bảo hiểm" ghi
rõ quyền lợi, mức khấu trừ, người chịu khấu trừ (khách thuê) và hotline bồi thường.

### 9. Ngoài phạm vi

Thuê dài hạn (gói 1–12 tháng), gia hạn (tự lái không có gia hạn), xe máy, có tài xế. Địa chỉ bên mua
giữ 0088 điều 5 (không thêm ô địa chỉ cho khách). Giá trị xe giữ gợi ý ADR 0090, không chặn ±8%. Hãng
và hiệu giữ danh mục XePrime.

## Hệ quả

- Ô tô mặc định không còn bắt buộc bảo hiểm: gian hàng phải chủ động chọn Bắt buộc.
- Gian hàng chọn Bắt buộc mà xe thiếu dữ liệu thì xe biến khỏi tìm xe tự lái cho tới khi bổ sung.
- Khách không đặt được tự lái quá 30 ngày hay đặt trước quá 15 ngày trên chợ.
- CLAUDE.md: dòng "gọi phí dịch vụ XePrime là bảo hiểm" được nới cho trình bày gộp có tách ở điều 3;
  dòng "lưu GCN PDF" và "bỏ chọn `IV` theo bậc" sửa theo điều 1 và 6.
- App native (`apps/mobile`) cần ô tích bảo hiểm Tuỳ chọn và dòng gộp — việc của nhóm mobile (ADR 0031).

## Cần xem lại khi

Luật sư trả lời về phí thu hộ; MIC công bố API huỷ hoặc biểu phí production; MIC mở bảo hiểm cho thuê
dài hạn, xe máy hoặc có tài xế; có tính năng gia hạn chuyến tự lái.
