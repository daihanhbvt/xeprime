# ADR 0106 — Biểu phí bảo hiểm vật chất xe theo NĂM SẢN XUẤT, đồng bộ từ hãng (khoá khi đồng bộ được), hợp đồng không dài hơn bậc khách đã trả

Ngày: 18/11/2026 · Trạng thái: **Accepted** (18/11/2026 — người dùng giao quyết định: "Quyết định và làm
cho mình"; sửa cùng ngày theo yêu cầu người dùng: không tự hỏi MIC hằng ngày, xem "Lượt hỏi MIC") · Ghi đè: [0088](0088-mic-trip-insurance-integration.md) điều 3 (một bảng bậc cho mọi xe, admin
sửa tay); [0097](0097-insurance-premium-from-partner-at-approval.md) điều 6 (biểu phí sửa tay ở tab Biểu
phí & sản phẩm) · Giữ: 0088 điều 3 (báo giá công khai KHÔNG gọi MIC), 0097 điều 1–2 (lượt duyệt hỏi MIC phí
từng hợp đồng, chậm/lỗi thì công thức)

## Bối cảnh

Đo trên sandbox MIC ngày 18/11/2026 (bộ `xel_chuyen`, loại xe `M1.11`, từ VPS staging):

- Phí vẫn là **giá trị xe × % của bậc thời lượng** (≤2 · ≤5 · ≤10 · ≤15 · ≤30 ngày), tỷ lệ thuận với giá
  trị xe; số chỗ 2–9 không đổi phí (trên 9 chỗ MIC từ chối).
- Nhưng **% của mỗi bậc đổi theo năm sản xuất**. Xe 455 triệu, bậc ≤2 ngày: 2024–2026 = 0,011% ·
  2021–2023 = 0,012% · 2018–2020 = 0,013% · 2012/2015 = 0,014%.
- Bảng bậc mặc định của ADR 0088 đo trên MỘT xe Vios 2019, nên chỉ đúng nhóm 2018–2020. Hệ quả thấy trên
  staging: xe 2024, trang xe báo 59.150 (công thức) nhưng lượt duyệt hỏi MIC ra 50.050 — khách thấy hai
  số khác nhau giữa trang xe và màn thanh toán.
- MIC tính phí theo thời lượng **hợp đồng** (từ lúc giao xe tới giờ trả), còn khách trả theo bậc của
  **lịch hẹn**. Đơn DHRX0MDN (staging) giao xe sớm 5 ngày ⇒ hợp đồng gần 6 ngày ⇒ bậc 10 ngày: khách trả
  50.050, MIC thu 254.800. Ngoài đời chỉ cần giao sớm 30 phút với chuyến tròn 48 giờ là nhảy sang bậc 5
  ngày (gấp ~2,5 lần), XePrime chịu phần chênh mà không ai biết.
- MIC không có API trả cả biểu phí — chỉ có `phi_vcx` tính phí cho một chuyến.

## Quyết định

### 1. Biểu phí đồng bộ từ hãng, theo nhóm năm sản xuất

- `insurance_products.premium_year_bands_json` giữ các NHÓM NĂM: `[{yearFrom, yearTo, percents[]}]`,
  `percents[i]` ứng với bậc thứ i của `premium_tiers_json` (mốc ngày chung). `yearTo = null` = mọi năm
  mới hơn (xe đời mới hơn lần đồng bộ vẫn có giá); `yearFrom = null` = mọi năm cũ hơn. Năm không thuộc
  nhóm nào ⇒ hãng không bán cho đời xe đó ⇒ không có dòng `IV`.
- `premium_tiers_json` vẫn là biểu phí chung (mốc ngày + % của nhóm mới nhất) — dùng khi chưa có nhóm năm.
- `InsurancePremiumSyncService` dựng lại biểu phí từ `phi_vcx` (`derivePremiumSchedule`, hàm thuần), xe mẫu
  1 tỷ, 5 chỗ, mọi lượt hỏi theo NGÀY TRÒN; suy % = phí × 100 ÷ 1 tỷ, 4 chữ số lẻ:
  1. đời xe mới nhất hãng bán: hỏi phí 1 ngày từ năm nay + 1 lùi dần;
  2. mốc bậc: KIỂM mốc đang lưu (ngày đầu và ngày cuối mỗi bậc phải cùng phí, sang bậc kế phải tăng) —
     không khớp mới dò cả 1..30 ngày;
  3. mỗi năm sản xuất chỉ hỏi bậc dài nhất để chia nhóm năm; gặp đời đầu tiên hãng từ chối thì dừng (hãng
     giới hạn tuổi xe, đời cũ hơn cũng không bán — nhóm cũ nhất đóng lại ở đó);
  4. mỗi nhóm hỏi đủ mọi bậc ở HAI năm biên; hai biên khớp ⇒ cả nhóm một bộ % (phí không giảm khi xe cũ đi,
     năm ở giữa nằm giữa hai biên); lệch ⇒ hỏi đủ từng năm của nhóm đó;
  5. MỘT ô hỏng vì mạng/hết giờ hay số bất thường (phí giảm khi chuyến dài hơn, % không tăng theo bậc) ⇒
     cả lượt hỏng — biểu phí nửa vời không thay biểu phí đang chạy.
  Khoảng 50-65 lượt hỏi (hỏi hết mọi năm × mọi bậc là ~166), 4 lượt song song, chặn cả lượt ở 2 phút.
- CHỈ chạy khi admin bấm "Đồng bộ từ MIC ngay" (`POST /platform/insurance/premium-sync`,
  `platform.insurance.manage`, throttle 2/phút) — KHÔNG có vòng tự chạy (xem "Lượt hỏi MIC"). Chỉ chạy với
  adapter THẬT (`INSURANCE_PARTNER=mic`): giả lập trả lại đúng công thức đang cấu hình, "đồng bộ" với nó
  chỉ khoá biểu phí của dev mà không học được gì ⇒ `not_supported`.
- Ghi qua `InsuranceProductsService.applyPremiumSync` (writer duy nhất của `insurance_products`), có audit
  (`insurance_product.premium_sync` / `…_failed`).

### 2. Đồng bộ được thì KHOÁ; hỏng hay hãng báo khác thì MỞ cho sửa tay

- `premium_sync_status`: `synced` ⇒ biểu phí khoá — `PATCH` sản phẩm đổi biểu phí/nhóm năm/cách tính trả
  409 `INSURANCE_PREMIUM_SYNCED_LOCKED` (gửi lại đúng số đang có không tính là sửa). `failed` ⇒ giữ biểu phí
  của lần đồng bộ được gần nhất, admin sửa tay % từng nhóm năm (hoặc gộp thành một biểu phí cho mọi năm);
  lần đồng bộ được kế tiếp ghi đè. `NULL` = chưa từng đồng bộ, sửa tay như trước.
- `drifted` — PHÁT HIỆN HÃNG ĐỔI GIÁ KHÔNG TỐN LƯỢT HỎI: lượt duyệt đơn vốn đã hỏi MIC phí của đúng hợp
  đồng (ADR 0097). MIC trả số lệch phí tính theo biểu phí quá 0,5% VÀ quá 1.000đ (`premiumDrifted` — ngưỡng
  để lệch làm tròn của % 4 chữ số lẻ không báo động giả; đổi nhóm năm ~8% hay đổi bậc luôn vượt) ⇒
  `InsuranceProductsService.markPremiumDrift` đánh dấu `drifted` kèm lý do (đời xe, bậc, hai số tiền), audit
  hệ thống `insurance_product.premium_drift`. Chỉ ghi khi đang `synced` hoặc `NULL` (điều kiện nằm trong
  lệnh ghi — hai lượt duyệt cùng lúc chỉ một lượt ghi); đã `failed`/`drifted` thì giữ lý do đầu. Biểu phí
  KHÔNG tự đổi: admin thấy thẻ "Lệch với MIC" và bấm đồng bộ lại (hoặc sửa tay). Đơn đang duyệt vẫn dùng
  đúng số MIC (ADR 0097). Ghi lỗi thì chỉ log — lượt duyệt không bao giờ hỏng vì việc này.
- Cột kèm: `premium_synced_at` (lần đồng bộ được gần nhất), `premium_sync_status_at` (lúc trạng thái hiện
  tại được ghi), `premium_sync_error` (lý do, chỉ khi `failed`/`drifted`). CHECK: trạng thái thuộc tập; có
  trạng thái ⇔ có `premium_sync_status_at`; lý do chỉ đi cùng `failed`/`drifted`; `synced` phải có
  `premium_synced_at`; nhóm năm chỉ với `value_tier` và là mảng (migration
  `20261118120000_insurance_premium_year_bands`).

### 3. Mọi đường tính phí chọn % theo năm sản xuất của xe

`insurancePremiumTiersForYear(tiers, bands, manufactureYear)` (`@xeprime/types`) là phép chọn duy nhất;
`InsuranceEligibilityService.tierQuoteFor` (báo giá công khai, xem trước mã, lượt duyệt, giữ chỗ) đi qua
nó. Màn quản trị (tab Xe, Đối chiếu với MIC, Tính thử, Biểu phí MIC theo năm sản xuất) cũng vậy. Báo giá
công khai vẫn KHÔNG gọi MIC (ADR 0088 điều 3): biểu phí đồng bộ cho đúng số MIC tới từng đồng; lượt duyệt
vẫn hỏi MIC phí của đúng hợp đồng (ADR 0097) để chặn trường hợp MIC đổi giá trong ngày.

### 4. Hợp đồng không bao giờ dài hơn bậc khách đã trả

- Lượt chuyển đơn sang `active` (giao xe) gọi `InsuranceService.assertHandoverKeepsTierWithinTx` TRƯỚC lệnh
  ghi: hợp đồng `vehicle_trip` theo bậc còn `reserved` mà `max(mốc giao, bây giờ) + 5 phút → giờ trả` dài hơn
  bậc của lịch hẹn quá `EARLY_HANDOVER_GRACE_MS` ⇒ 409 `INSURANCE_EARLY_HANDOVER`, `details` mang
  `earliestAt` và `retryAfterSeconds` (web nói "giao được sau … nữa"). Khoảng cho phép = CHÍNH cửa sổ giao
  xe của [ADR 0104](0104-pickup-handover-window-and-platform-revert.md) (`pickupAt − 60′`,
  `CUSTOMER_PICKUP_CONFIRM_LEAD_MINUTES`): trong cửa sổ đó giao được và hợp đồng tự vừa bậc; ngoài cửa sổ
  thì nút giao xe đã bị ADR 0104 chặn, phép chặn này là chốt sau cho mọi đường chuyển đơn sang `active`.
  Chỉ với hãng thật (`MicInsurancePartner`) — giả lập không tính phí theo thời lượng.
- Lượt cấp hợp đồng (`coverageWindow`) kẹp hiệu lực: bắt đầu không sớm hơn `giờ trả − thời lượng bậc` —
  giao sớm trong khoảng cho phép thì hiệu lực bắt đầu muộn lại tối đa 60 phút cho vừa bậc. Hai phép dùng
  chung `earliestHandoverKeepingTier`.

## Hệ quả

- Giá bảo hiểm ở trang xe, lượt duyệt và hợp đồng MIC khớp nhau cho mọi đời xe (khi biểu phí đã đồng bộ).
- Admin không gõ tay biểu phí khi MIC trả lời được — một nguồn sự thật là hãng.
- Xe cũ hơn đời hãng bán sẽ không có dòng `IV` (trước đây vẫn được chào theo bảng chung rồi cấp hỏng).
- Không thêm luật giao xe mới cho người dùng (cửa sổ vẫn là ADR 0104). Chuyến dài đúng bằng trần một bậc
  (vd. 09:00 → 09:00 hai ngày) mà giao sớm thì tối đa 60 phút đầu chưa có hiệu lực bảo hiểm — đổi lại
  XePrime không phải trả hãng phí của bậc kế tiếp.
- **Lượt hỏi MIC** (người dùng không chấp nhận ~170 lượt/ngày của bản đầu — vòng tự chạy mỗi ngày, hỏng
  thì mỗi giờ, đã gỡ): ngày thường KHÔNG thêm lượt nào ngoài một lượt mỗi lần duyệt đơn (ADR 0097, có từ
  trước). Admin bấm đồng bộ: ~50-65 lượt. Nút "Đối chiếu với MIC" ở thẻ Tính thử: 5 lượt (một lượt mỗi
  bậc). Màn "Biểu phí MIC theo năm sản xuất" (hỏi mọi năm × mọi bậc, 75-100 lượt mỗi lần bấm,
  `POST /platform/insurance/premium-table`) đã gỡ — thẻ "Biểu phí đang áp dụng" hiện đúng bảng đó sau khi
  đồng bộ.
- Đánh đổi: MIC đổi giá mà chưa có đơn nào được duyệt thì hệ thống chưa biết; giá ở trang xe lệch tới lượt
  duyệt đầu tiên (lượt đó vẫn tính đúng số MIC) rồi tới khi admin đồng bộ lại.
- App native không đổi contract khách; câu lỗi `INSURANCE_EARLY_HANDOVER` có ở bó message dùng chung.

## Cần xem lại khi

MIC gửi văn bản biểu phí production (đối chiếu với nhóm năm đồng bộ); MIC đổi thành phí theo ngày hoặc có
API trả cả biểu phí; MIC đặt giới hạn tần suất cho `phi_vcx`; trang xe lệch giá MIC kéo dài vì ít đơn được duyệt (khi đó cân
nhắc một lượt kiểm nhỏ định kỳ, vài lượt mỗi tuần); phí bắt đầu phụ thuộc thêm yếu tố khác (hãng,
dòng xe, số chỗ); cửa sổ giao xe của ADR 0104 đổi; cần bảo hiểm phủ cả phần giao sớm (khi đó thu thêm phần chênh của khách, không để XePrime chịu).
