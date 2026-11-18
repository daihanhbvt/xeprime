# ADR 0097 — Phí bảo hiểm của từng hợp đồng lấy từ MIC lúc duyệt (chờ tối đa 1,5 giây, lỗi thì công thức bậc), bảng kê trả theo phí MIC, màn quản trị bảo hiểm

Ngày: 17/11/2026 · Trạng thái: **Accepted** (17/11/2026 — người dùng chốt: mỗi hợp đồng hỏi MIC, chậm/lỗi
mới dùng công thức; chờ tối đa 1,5 giây) · Ghi đè: [0091](0091-insurance-owner-mode-service-fee-booking-limits.md)
điều 2 (bỏ "không gọi `phi_vcx` lúc duyệt"); [0088](0088-mic-trip-insurance-integration.md) điều 6 (cơ sở
"tổng phí" của bảng kê) · Giữ: 0088 điều 3 (báo giá công khai theo bảng bậc, KHÔNG gọi MIC), 0091 điều 3
(phí thu hộ vẫn Proposed, chờ luật sư)

## Bối cảnh

Từ ADR 0088, phí `IV` của mọi chuyến tính bằng bảng bậc trong hệ thống (giá trị xe × % bậc thời lượng);
MIC chỉ trả `total_fee` lúc cấp hợp đồng, ghi `partner_premium_amount` để đối soát. Hai hệ quả:

- Bảng bậc lệch biểu phí MIC (MIC đổi biểu phí, bảng gõ sai) thì XePrime thu sai của khách mà không ai biết
  cho tới lúc đối soát.
- Bảng kê tháng tính "phải trả MIC" trên phí ĐÃ THU của khách, trong khi MIC thu theo số của chính nó.

Đo trên sandbox (17/11/2026, từ VPS staging): `phi_vcx` trả lời khoảng 0,2 giây mỗi lượt khi token còn hạn;
`total_fee` đã gồm VAT và khớp bảng bậc mặc định (xe 340 triệu: 44.200 · 112.200 · 224.400 · 333.200 ·
680.000).

Admin cũng chưa có chỗ nào nhìn ra: một chiếc xe thuê N ngày thì khách trả bao nhiêu, chuyển MIC bao nhiêu,
XePrime giữ lại bao nhiêu (phí thu hộ + hoa hồng đại lý + chênh lệch).

## Quyết định

### 1. Hỏi MIC phí của từng hợp đồng ở lượt DUYỆT

- Điểm hỏi duy nhất: `BookingRequestsService.resolveFeesWithPromo` (đường chung của duyệt tay và "Đặt
  ngay"), qua `PricingService.approvalVehicleProtectionTier` → `InsurancePremiumQuoteService.confirmForApproval`.
  Hỏi MỘT lần mỗi lượt duyệt, kết quả truyền vào mọi lượt `customerFeesFor` của quyết định đó
  (`resolvedVehicleProtectionTier`), nên lượt có mã và lượt không mã đứng trên cùng một `IV`.
- Chỉ hỏi khi chuyến THẬT SỰ thu `IV` (chủ xe đặt Bắt buộc lúc khách gửi, hoặc khách đã tích).
- Báo giá công khai, xem trước mã và ước tính trong hộp thư gian hàng giữ công thức bậc (là giá tạm tính;
  lượt duyệt mới chốt giá — ADR 0044).
- Cổng đối tác có thêm `quotePremium` (tuỳ chọn). Adapter MIC gọi `POST /api/e/xel_chuyen/v1/phi_vcx`
  với thân phẳng KHÔNG có dữ liệu cá nhân (năm SX, số chỗ, giá trị xe, giờ nhận → giờ trả, `M1.11`, mục
  đích `C`), đọc `total_fee`. `mic_mock` trả đúng phí công thức. `none` không bán bảo hiểm nên không hỏi.

### 2. Chờ tối đa 1,5 giây, công thức là dự phòng

`INSURANCE_PARTNER_QUOTE_TIMEOUT_MS = 1500` chặn TỔNG thời gian (gồm cả lượt lấy token nếu token hết hạn —
lượt đó chạy tiếp ngầm và token vẫn được cache). Dùng công thức bậc, ghi lý do, khi:

| Lý do           | Khi                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `timeout`       | quá 1,5 giây                                                                                               |
| `unavailable`   | mạng lỗi, HTTP 5xx, không lấy được token, adapter ném                                                      |
| `rejected`      | MIC trả mã lỗi nghiệp vụ (vd "chưa khai biểu phí"); xe thiếu năm SX/số chỗ                                 |
| `out_of_range`  | số MIC ngoài [công thức ÷ 2, công thức × 2] (`partnerPremiumProblem`, `INSURANCE_PARTNER_QUOTE_MAX_RATIO`) |
| `not_supported` | adapter đang chạy không có API tính phí                                                                    |

Lượt duyệt KHÔNG BAO GIỜ hỏng vì MIC: bảo hiểm là một dòng của báo giá, không phải cổng của nó.

### 3. Ghi nguồn phí lên snapshot và hợp đồng

`VehicleProtectionTierQuote` mang thêm `source` (`partner` | `formula`), `formulaAmount`, `fallbackReason`;
chúng đóng băng cùng bảng phí (ADR 0024). Lúc tạo đơn, `booking_insurance_policies` chép sang ba cột mới
`premium_source`, `formula_premium_amount`, `premium_quote_fallback_reason` (migration
`20261117170000_insurance_partner_premium_quote`; CHECK: nguồn thuộc tập; lý do chỉ có khi nguồn là
`formula` và thuộc tập; phí công thức ≥ 0). Hợp đồng trước ADR này để trống — không đoán.

### 4. Bảng kê trả MIC theo phí MIC tính

"Tổng phí" của bảng kê (và của "chưa kê") = Σ `COALESCE(partner_premium_amount, premium_amount)`: MIC thu
theo số của chính nó; hợp đồng MIC không trả số thì rơi về phí khách trả, và bảng kê đếm riêng các dòng
đó (`partnerPremiumMissingCount`) kèm tổng phí khách đã trả (`collectedPremiumTotal`) để thấy chênh lệch.

### 5. % hoa hồng đại lý cấu hình trên sản phẩm

`insurance_products.agency_commission_percent` (0..100, hai chữ số lẻ, CHECK; trần % phí thu hộ và % hoa hồng của bảng kê cũng nâng 50 → 100, migration `20261117180000_insurance_percent_caps_100`) — theo hợp đồng đại lý với
MIC. Là giá trị MẶC ĐỊNH của hộp lập bảng kê (người lập vẫn sửa được ở từng bảng); Tổng quan dùng nó để
ước tính hoa hồng tháng.

### 6. Màn Admin › Bảo hiểm

Năm tab, mỗi tab gác bằng quyền của endpoint nó gọi:

- **Tổng quan** (`platform.money.manage`, `GET /platform/insurance/overview?month=`): hợp đồng cấp trong
  tháng (giờ VN) — phí thu khách, phí MIC tính, hoa hồng đại lý ước tính, phải chuyển MIC, phí thu hộ,
  chênh lệch, XePrime thu từ bảo hiểm (= phí thu hộ + hoa hồng + chênh lệch); nguồn phí của hợp đồng TẠO
  trong tháng (MIC báo / công thức kèm lý do, cảnh báo khi dưới 90% là MIC báo); hoàn tiền trong tháng;
  việc tồn (cần xử lý gấp, lỗi cấp, đã cấp chưa kê).
- **Biểu phí & sản phẩm** (`platform.insurance.manage`): danh mục + ô % hoa hồng đại lý; thẻ **Tính thử**
  (gõ giá trị xe ⇒ mỗi bậc: phí MIC · phí thu hộ · khách trả · hoa hồng · chuyển MIC · XePrime giữ lại);
  form sản phẩm xem trước bảng đó theo số ĐANG SỬA. Biểu phí theo NĂM SẢN XUẤT và việc đồng bộ nó từ
  MIC: [ADR 0106](0106-insurance-premium-by-manufacture-year-synced-from-partner.md) (thẻ "Biểu phí đang
  áp dụng"; thẻ "Biểu phí MIC theo năm sản xuất" thêm sáng 18/11/2026 đã gỡ cùng ngày vì mỗi lần bấm
  tốn 75-100 lượt hỏi MIC).
- **Xe** (`platform.insurance.manage`, `GET /platform/insurance/vehicles`): ô tô phân trang/lọc ở server
  (đủ / chưa đủ điều kiện — lọc bằng điều kiện Prisma cùng các vế với `insuranceEligibilityGaps`), giá
  trị xe, chế độ chủ xe, việc còn thiếu, phí từng bậc.
- **Đối chiếu với MIC** (`POST /platform/insurance/premium-check`, chờ tối đa 8 giây, throttle 10/phút,
  không ghi gì): hỏi MIC phí từng bậc cho một xe hoặc một bộ giá trị/năm/số chỗ (thời lượng mẫu = trần
  bậc − 1 giờ, bắt đầu 09:00 sáng mai), đặt cạnh bảng bậc — lệch là dấu hiệu MIC đổi biểu phí.
- **Hợp đồng** (danh sách cũ "Chứng nhận") hiện thêm phí MIC tính, phí thu hộ và nguồn phí; ngăn chi tiết
  hiện nguồn phí, lý do dự phòng và phí công thức khi khác số đã thu. **Bảng kê** như điều 4–5.

## Hệ quả

- Khách có thể thấy phí bảo hiểm lúc duyệt khác giá tạm tính lúc gửi (chỉ khi bảng bậc lệch MIC); số trên
  màn thanh toán là số đã chốt.
- Lượt duyệt chậm thêm tối đa 1,5 giây khi MIC treo; "Đặt ngay" chạy ngay sau lượt gửi nên lượt gửi cũng
  vậy.
- Chỉ máy chủ có IP được MIC whitelist hỏi được; dev dùng `mic_mock`.
- Sản phẩm bảo hiểm là dữ liệu do seed `system` sở hữu: môi trường chưa có dòng `insurance_products` phải
  chạy lại seed (docs/deployment.md §3.5) — API không có đường tạo sản phẩm.
- App native không đổi (contract khách không đổi).

## Cần xem lại khi

MIC ký hợp đồng đại lý (hoa hồng thật, biểu phí production); MIC công bố SLA hoặc giới hạn tần suất cho
`phi_vcx`; tỷ lệ dự phòng `timeout` cao kéo dài; cần hỏi MIC ngay ở báo giá công khai (khi đó phải có cache
theo xe + bậc); mở bảo hiểm cho xe máy, có tài xế hoặc dài hạn.
