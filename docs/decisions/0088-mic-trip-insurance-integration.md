# ADR 0088 — Bảo hiểm vật chất xe MIC cho chuyến thuê ô tô tự lái: bắt buộc với xe đủ điều kiện, phí theo bậc giá trị xe, ảnh xe dùng lại, bảng kê trả phí hãng

Ngày: 11/11/2026 · Trạng thái: **Accepted** (11/11/2026 — người dùng chốt bốn điểm mở trong phiên triển
khai: bắt buộc, nguồn phí, trả phí hãng, phạm vi bồi thường) · Ghi đè: [0064](0064-financial-flow-v2.md)
điều 10 **trong phạm vi bảo hiểm vật chất xe tính theo bậc** (tuỳ chọn → bắt buộc với xe đủ điều kiện;
biểu phí ngày → biểu phí bậc) · Giữ nguyên: [0032](0032-booking-deposit-insurance-and-owner-lite.md)
điều 4 (phát hành ở mốc bàn giao qua job idempotent, không HTTP trong transaction),
[0066](0066-hold-15-percent-dynamic-sla-and-handover-safeguards.md) điều 2 (huỷ hoàn 100% `IV`),
[0024](0024-billing-mode-from-plan-frozen-on-booking.md) (đóng băng giá), [0033](0033-money-ledger-and-deposit-allocation.md) điều 4 (tiền giữ
hộ tách theo cột) · Đặc tả BA: `SPEC-BUS-10` (Drive `07_MIC_Trip_Insurance_Integration`) · Bằng chứng:
sandbox MIC 10–11/11/2026 (`REPORT_INSURANCE_12 … FINAL v2.0`)

## Bối cảnh

ADR 0064 điều 10 cho thu `IV` (vật chất xe) và `IP` (tai nạn người) TUỲ CHỌN, biểu phí theo ngày, khi có
đối tác phát hành; hiện chỉ có adapter giả lập `mic_mock`. Sau hai đợt thử sandbox, IT MIC chốt luồng
chuẩn cho xe cho thuê tự lái:

1. Bộ **VCX ô tô theo chuyến** `/api/e/xel_chuyen/v1/{phi_vcx, gcn_vcx_validate, gcn_vcx}`, loại xe
   **`M1.11`**, mục đích `C`; API phí cần ngày + giờ bắt đầu/kết thúc.
2. Hợp đồng cần 5 ảnh xe, gửi qua `open-api/upload-file` (`refer = id_tras`). Gửi **trước** khi cấp ⇒
   hợp đồng ra tình trạng 4 (thành công) ngay. **Cùng một bộ 5 ảnh dùng được cho nhiều hợp đồng** của xe.
3. Gia hạn = hợp đồng mới cho phần kéo dài. API huỷ CHƯA có.

Đo được: phí theo **bậc thời lượng** × giá trị xe (xe 340 triệu: ≤2 ngày 44.200 · ≤5 ngày 112.200 ·
≤10 ngày 224.400 · ≤15 ngày 333.200 · ≤30 ngày 680.000 — đã gồm VAT), giờ lẻ làm tròn lên bậc, giờ bắt đầu
phải sau hiện tại, MIC không kiểm `payment_amount`. MIC chặn theo IP (chỉ IP máy chủ staging), và trả
NGUYÊN chuỗi Bearer token trong thân lỗi 401.

## Quyết định

### 1. Adapter thật `mic`
`INSURANCE_PARTNER` nhận thêm `mic` (`MicInsurancePartner` + `MicClient` ở `@xeprime/prisma`, worker và
API dùng chung một bản). Cấu hình `MIC_BASE_URL/USERNAME/PASSWORD/CLIENT_ID/CLIENT_SECRET/SANDBOX`; mật
khẩu và client secret CHỈ ở GitHub Environment (secret). `MIC_SANDBOX` mặc định `true` ⇒ số GCN mang
`TEST-` + cờ `is_test`; production phải khai `false`, API và worker từ chối boot nếu production trỏ sandbox.
Adapter chỉ bán `vehicle_trip` (`supportsKind`) — **`IP` không bán qua MIC đợt này**, cổng chào bán ẩn nó.
Migration `20261111100200` còn TẮT sản phẩm `IP` trong danh mục (để `mic_mock` ở dev/staging chào
đúng như production; admin bật lại ở màn Bảo hiểm khi MIC mở) và thay tên đối tác giữ chỗ của chính
sách phí bằng "Bảo hiểm Quân đội MIC".

### 2. Bắt buộc với xe đủ điều kiện (ghi đè 0064 điều 10 trong phạm vi này)
Sản phẩm `IV` mang `premium_basis = value_tier` thì là **bắt buộc**: mọi chuyến TỰ LÁI ≤ 30 ngày của ô tô
đủ điều kiện có dòng `IV`, khách không bỏ chọn được (giống mô hình Mioto). Xe chưa đủ điều kiện ⇒ không
có dòng `IV` nào (không rơi về biểu phí ngày). Điều kiện xe — một hàm thuần `insuranceEligibilityGaps`
cho API, worker và web: ô tô; có **giá trị xe** (`vehicles.insured_value`, 50 triệu–20 tỷ, bội 1 triệu);
đủ ảnh bắt buộc của thư viện xe; cà vẹt còn hiệu lực có số khung + tên chủ đăng ký; hãng, mẫu, năm SX,
số chỗ. Không có công tắc của chủ xe. Màn sửa ô tô chỉ có MỘT ô "Giá trị xe" (ⓘ: giá khi mua hoặc giá
kê khai khi mua bảo hiểm thân vỏ) — không ghi chú cơ chế bảo hiểm hay danh sách việc còn thiếu trên thẻ;
`GET /vehicles/:id/insurance-eligibility` vẫn trả `gaps` cho bề mặt nào cần. **Xe máy chưa có bảo hiểm**:
không có ô giá trị xe, không có dòng `IV` theo bậc.

### 3. Phí theo bảng bậc trong hệ thống
Biểu phí bậc `[{maxDays, percent}]` sống ở `insurance_products.premium_tiers_json` (admin sửa ở màn Bảo
hiểm; migration nạp bảng đo sandbox). Phí = `computeValueTierPremium(giá trị xe, % của bậc phủ thời lượng
pickup→return)`, đúng tới đồng (BigInt). Báo giá KHÔNG gọi MIC: `computeCustomerFees` nhận
`vehicleProtectionTier` (`undefined` = sản phẩm ngày, `null` = không bán kèm, giá trị = bắt buộc), chốt
ở `commitDecision`, đóng băng cùng bảng phí (ADR 0024); giá trị xe đã dùng chép sang
`booking_insurance_policies.insured_value`. Phí MIC tính lúc cấp ghi `partner_premium_amount` để đối soát;
lệch ⇒ vẫn cấp, XePrime chịu/hưởng phần lệch (MIC không kiểm `payment_amount`).

### 4. Ảnh dùng lại, không chụp mỗi chuyến
Worker gửi **nguyên các ảnh bắt buộc** của thư viện xe (thứ tự trước · trái · phải · sau · nội thất —
`insurancePhotoUrls`) qua `upload-file` TRƯỚC khi cấp. Gửi rồi thì ghi `photos_sent_at`, lần thử sau không
gửi lại. Bộ góc ảnh hiện tại khác bộ góc chéo trên trang chụp MIC — sandbox nhận; hậu kiểm production là
rủi ro mở (`SPEC-BUS-10` OI-01).

### 5. Cấp ở mốc giao xe
Giữ ADR 0032 điều 4: đơn `active` ⇒ worker chiếm → **tra cứu `id_tras` trước** (thử lại sau khi mất phản
hồi không cấp hợp đồng thứ hai) → gửi ảnh → validate → cấp → tra cứu `ttrang`. `id_tras` = `partnerRefFor`
(20 ký tự, sinh một lần, unique). Hiệu lực từ `max(mốc giao, hiện tại) + 5 phút` (làm tròn lên phút) tới
giờ trả. Địa chỉ bên mua: sổ khách → địa chỉ nhận xe → địa chỉ chi nhánh. MIC từ chối hồ sơ ⇒ lỗi vĩnh viễn
về hàng đợi admin; mạng/5xx ⇒ thử lại theo backoff có trần. Thân lỗi lưu chỉ gồm mã + câu báo.

### 6. Tiền: giữ hộ → phải trả → bảng kê tháng

> **Sửa bởi [ADR 0097](0097-insurance-premium-from-partner-at-approval.md) (17/11/2026):** "tổng phí" của
> bảng kê là phí MIC tính lúc cấp (`partner_premium_amount`), thiếu thì phí khách trả; % hoa hồng đại lý
> mặc định đọc từ sản phẩm.
Phí `IV` nằm trong khoản giữ chỗ (vế giữ hộ, ADR 0033 điều 4); hợp đồng `issued` ⇒ khoản phải trả hãng.
Mỗi tháng admin lập **bảng kê** (`insurance_premium_remittances`, writer `InsuranceRemittanceService`):
gom mọi hợp đồng `issued`/`claim` chưa kê, cấp trước hết tháng; phải trả = tổng phí − **hoa hồng đại lý**
(% admin nhập theo hợp đồng đại lý, mặc định 0). `draft` (xoá được, hợp đồng nhả về chưa kê) → `finalized`
(khoá số, xuất CSV gửi MIC) → `paid` (số tiền, ngày, mã giao dịch). Một tháng một bảng
(`UNIQUE (provider, period_month)`), một hợp đồng một bảng (FK đơn), CHECK canh phép trừ và bằng chứng
trả. Mọi thao tác ghi audit.

### 7. Huỷ, gia hạn, GCN, bồi thường
- Huỷ trước giao xe / no-show / hết hạn thanh toán: chưa có hợp đồng MIC ⇒ hoàn 100% `IV`, không gọi MIC
  (ADR 0066 điều 2). Quá giờ trả mà chưa cấp ⇒ lỗi `invalid_request`, admin xử lý.
- Gia hạn: thuê tự lái CHƯA có phụ lục gia hạn (chỉ dài hạn có, mà dài hạn > 30 ngày ngoài phạm vi MIC) —
  khi có tính năng gia hạn tự lái, mỗi phần kéo dài là một hợp đồng MIC mới (ADR sau).
- GCN PDF **không lưu** (mang dữ liệu cá nhân): API tải từ MIC mỗi lần bấm
  (`download-gcn-by-so-id`) qua ba endpoint có phạm vi — khách (`/trips/:id/…/pdf`), gian hàng
  (`/bookings/:id/…/pdf`), quản trị (`/platform/money/insurance/:id/certificate.pdf`).
- Bồi thường: chỉ hiện hotline hãng (`insurance_products.claim_hotline`) + GCN; không có hồ sơ bồi thường
  trong hệ thống ở đợt này.

## Hệ quả

- Ô tô tự lái đủ điều kiện luôn có `IV` trong tiền giữ chỗ; giá hiển thị cao hơn đúng bằng phí bậc.
- Chủ xe phải khai giá trị xe và cà vẹt để xe được bán kèm bảo hiểm.
- Máy dev không gọi được MIC (chặn IP) — dùng `mic_mock`; staging dùng `mic` + sandbox.
- App native (`apps/mobile`) đọc cùng contract nhưng CHƯA hiện dòng bắt buộc / nút tải GCN — việc của
  nhóm mobile (ADR 0031).
- Rủi ro mở: bộ góc ảnh và hậu kiểm production; biểu phí production; API huỷ; IP production phải được MIC
  whitelist trước khi bật.

## Cần xem lại khi

MIC từ chối bộ góc ảnh hiện tại; MIC công bố API huỷ hoặc API bồi thường; mở bảo hiểm cho xe máy, có tài
xế hoặc thuê dài hạn; có tính năng gia hạn chuyến tự lái; MIC đổi cách tính phí khỏi bậc thời lượng.
