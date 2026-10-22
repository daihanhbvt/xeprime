# ADR 0064 — Luồng tiền v2: phí sàn cố định, hoa hồng lũy tiến phía chủ xe, tiền giữ chỗ 30%, cửa sổ động

Ngày: 21/10/2026 · Trạng thái: **Accepted** — điều 5 (công thức), 7 (độ dài cửa sổ), 8 (chia 50/50) bị [0066](0066-hold-15-percent-dynamic-sla-and-handover-safeguards.md) ghi đè; điều 4 (một mức thuế 10%) bị [0068](0068-platform-tax-withholding-nd117-nd68.md) ghi đè; quy tắc bước 1.000đ ở điều 1, 3, 4 bị [0069](0069-money-rounding-exact-vnd.md) ghi đè · Ghi đè một phần: [0028](0028-marketplace-subscription-fees-and-custodied-funds.md) (dòng 10% ở điều 1; điều 5 được làm rõ), [0029](0029-per-vehicle-flat-pricing-and-customer-side-fees.md) (điều 1; dòng "phí dịch vụ 10%" của điều 2), [0032](0032-booking-deposit-insurance-and-owner-lite.md) (câu 10% ở điều 1; điều 2, 4, 5; gạch "code/config khác 2 giờ, 4 giờ…" ở mục Hệ quả), [0033](0033-money-ledger-and-deposit-allocation.md) (điều 3, 4 trong phạm vi dòng tiền thứ năm `H`), [0044](0044-approve-before-hold.md) (điều 3 — chỉ con số 120′ cố định), [0046](0046-platform-funded-promo-codes.md) (điều 2 công thức, điều 3 trần (4), CHECK ở điều 4) · Liên quan: 0006, 0018, 0022, 0024, 0038, 0045, 0058, [0065](0065-per-vehicle-type-shop-plans.md)

## Bối cảnh

Commit `a140472f` (20/10/2026) đưa "luồng tiền v2" vào code mà không có ADR: `computeCustomerFees`,
`computeTieredOwnerCommission`, `roundToThousand`, `resolveHoldAllocation` (`packages/types/src/fee-policy.ts`),
`holdWindowsFor` (`packages/types/src/holds.ts`) và migration `20261020170000_financial_flow_v2`
(chính sách phí v7, dòng tiền thứ năm trên `booking_holds`). Kết quả là code đúng với một mô hình mà
không tài liệu nào mô tả, còn CLAUDE.md và các ADR 0029/0032/0044/0046 vẫn mô tả mô hình cũ — ba nơi
nói ba điều khác nhau về cùng một đồng tiền.

Mô hình cũ có ba chỗ không còn đứng được:

1. **Phí dịch vụ 10% phía khách** (ADR 0029 điều 1, 0032 điều 1–2) làm xe tuyến hoa hồng đắt hơn
   ~10% trên chợ ở mọi độ dài chuyến. Với chuyến dài, con số đó vượt xa chi phí vận hành của nền tảng
   và đẩy khách ra khỏi sàn đúng ở những chuyến giá trị nhất.
2. **Cọc `D` tính theo tỉ lệ của giá thuê** không bảo đảm khoản online đủ trả mọi thứ không phải tiền
   của chủ xe: một chuyến xe máy rẻ có bảo hiểm sinh ra `D − T` âm.
3. **Cửa sổ thanh toán 120′ + huỷ miễn phí 4h cố định** không dùng được cho chuyến được nhận sát giờ:
   một chuyến nhận lúc 9h cho giờ nhận 11h có cửa sổ huỷ miễn phí dài hơn cả thời gian còn lại.

Chủ sản phẩm chốt mô hình v2 ngày 21/10/2026, kèm bốn quyết định đi theo (thuế, bảo hiểm, phí giao xe,
hiển thị). ADR này ghi lại chúng như yêu cầu hiện hành và chỉ rõ những chỗ code còn lệch.

## Quyết định

### 1. Sáu dòng tiền của một chuyến, mỗi dòng một chủ sở hữu

| Ký hiệu | Dòng | Ai trả | Ai hưởng | Đi qua XePrime? |
| --- | --- | --- | --- | --- |
| `B` | Tiền thuê — giá thuê SAU khuyến mãi trực tiếp của xe, **không gồm phí giao xe** | Khách | Chủ xe | Một phần (qua `D`) |
| `S` | Phí sàn (phí đặt xe) — cố định mỗi đơn | Khách | XePrime | Có |
| `H` | Hoa hồng lũy tiến — chỉ tuyến hoa hồng | Chủ xe (trừ vào tiền của họ) | XePrime | Có |
| `T` | Thuế khấu trừ/nộp thay | Chủ xe (trừ vào tiền của họ) | Ngân sách | Có |
| `IV` · `IP` | Bảo hiểm vật chất xe · tai nạn người — tuỳ chọn | Khách | Hãng bảo hiểm | Có (giữ hộ) |
| `G` | Phí giao nhận xe | Khách | Chủ xe | **Không** — trả tay lúc nhận xe (điều 9) |

Tổng khách trả `= B + S + IV + IP + G − P` (`P` là mã khuyến mãi nền tảng, điều 6). `H` và `T` không
bao giờ cộng vào tổng khách. Mọi số tiền XePrime tính ra là bội của 1.000đ qua `roundToThousand`
(`Math.round(n / 1000) × 1000`, nửa bước làm tròn lên) — bước giá bắt đầu từ chính số cấu hình
(CHECK `fee_policies_v2_amounts_thousand_step_check`).

### 2. `S` — phí sàn cố định mỗi đơn, theo loại xe, cả hai tuyến

`fee_policies.customer_platform_fee_{car,motorbike}`: **50.000đ ô tô · 30.000đ xe máy** (giá trị của
chính sách v7 — DỮ LIỆU admin sửa được, có phiên bản, không hồi tố). Áp như nhau cho đơn một ngày hay
ba mươi ngày, và như nhau ở tuyến hoa hồng lẫn tuyến gói. Admin đặt 0 cho một loại xe ⇒ không sinh
dòng 0đ.

`serviceFeePercent` thành cột chết (`@deprecated`): `computeCustomerFees` không đọc nó; nó chỉ sống
tới khi cột DB và form admin được gỡ.

### 3. `H` — hoa hồng lũy tiến theo NGÀY thuê, phía chủ xe, chỉ tuyến hoa hồng

Nấc là DỮ LIỆU ở `fee_policies.owner_commission_tiers` (`[{fromDay, percent}]`, `fromDay` tăng dần từ
1, nấc cuối kéo dài vô hạn). Bộ của chính sách v7:

| Ngày thuê | % giá thuê của ngày đó |
| --- | --- |
| 1 – 2 | 10% |
| 3 – 7 | 7% |
| 8 – 30 | 3% |
| 31+ | 0% |

- `H = roundToThousand(Σ giá ngày i × % nấc của ngày i)` — làm tròn MỘT lần trên tổng, không từng
  ngày. Giá ngày là giá SAU khuyến mãi trực tiếp; phí giao xe, bảo hiểm và `S` không vào mẫu số.
- **Tuyến gói: `H = 0`** và không sinh dòng "hoa hồng 0đ". Tuyến lấy từ `resolveEffectiveBilling`
  (ADR 0038 điều 1), đóng băng vào đơn (ADR 0024).
- Đơn dài hạn (ADR 0011) tính theo số ngày lịch của gói.

Đây là thay đổi về **người chịu**: ADR 0029 điều 1 đặt toàn bộ phí theo chuyến ở phía khách. Từ nay
phía khách chỉ còn `S` (nhỏ, cố định); phần tỉ lệ chuyển sang phía chủ xe và giảm dần theo độ dài
chuyến.

### 4. `T` — thuế 10% khấu trừ từ chủ xe; cơ sở tính KHÔNG gồm phí giao xe

- Chính sách v7 mang `taxEnabled = true`, `taxPercent = 10` (`VAT 5% + TNCN 5%`), áp như nhau ở **cả
  hai tuyến** — gói thuê bao bỏ hoa hồng, không bỏ thuế (ADR 0028 điều 4 giữ nguyên).
- **Cơ sở tính là `B`**: không gồm `G`, `S`, `IV`, `IP`. *Hiện trạng code:* cơ sở tính đang gồm phí
  giao xe — đó là lỗi đang sửa, không phải quy tắc.
- `T` trừ vào khoản XePrime phải trả chủ xe (`D − T`), không bao giờ cộng vào tổng khách
  (ADR 0032 điều 3 giữ nguyên). Thuế chỉ phát sinh khi chuyến bắt đầu; huỷ trước chuyến không có thuế.
- Con số 10% là **giả thuyết thị trường**, chưa qua tư vấn thuế — release gate ADR 0028 mục 2 vẫn
  đóng. Đổi tỷ lệ là phát hành phiên bản chính sách mới, không sửa bản đang chạy.

### 5. Tiền giữ chỗ (khoản online qua QR) — 30% tổng trước mã, có sàn

Với `grossTotal = B + S + IV + IP` (không gồm `G`):

```text
  floor        = S + H + IV + IP + T                            ← mọi thứ KHÔNG phải tiền chủ xe
  grossOnline  = min( grossTotal,
                      max( roundToThousand(depositPercent% × grossTotal),   ← 30% ở v7
                           depositMinAmount,
                           floor,
                           holdMinAmount ) )
  D            = grossOnline − S − H − IV − IP                  ← phần của chủ xe trong khoản online
  holdAmount   = grossOnline − P                                ← số in lên QR (điều 6)
  payAtPickup  = grossTotal − grossOnline   (+ G, điều 9)       ← khách trả TAY cho chủ xe
  ownerPayable = D − T                                          ← ghi có ví chủ xe khi chuyến xong
  ownerNet     = B − H − T                                      ← chủ xe nhận cho phần tiền thuê
```

- Sàn `floor` bảo đảm `D ≥ T`, tức ví chủ xe không bao giờ nhận một khoản âm (CHECK
  `fee_policies_deposit_covers_tax_check` gác phía cấu hình). Kẹp trần bằng `grossTotal` để một cấu hình
  sai không sinh `payAtPickup` âm.
- **Tuyến gói tắt công tắc thu cọc** (ADR 0033 điều 7): `grossOnline = min(grossTotal, max(S + IV + IP + T, holdMinAmount))`
  — XePrime vẫn phải cầm phần không phải của chủ xe, và không hơn. Tuyến hoa hồng luôn thu cọc.
- Báo giá tạm tính (`quoteIsEstimate`) hoặc dài hạn chưa chốt lịch ⇒ không thu online, không QR
  (ADR 0044 điều 4 giữ nguyên).
- `booking_holds` mang **năm** cột tiền: `deposit_amount`, `service_fee_amount`,
  `owner_commission_amount`, `vehicle_insurance_amount`, `personal_insurance_amount`; CHECK
  `booking_holds_money_lines_sum_check` viết lại thành `D + S + H + IV + IP − P = amount`. Tách quỹ
  vẫn đọc từ CỘT số tiền, không đọc `purpose` (ADR 0033 điều 4 giữ nguyên, nay với năm cột).
- Giao diện gọi khoản này là **"tiền giữ chỗ"** ở mọi bề mặt, không bao giờ "cọc" (ADR 0044 điều 9).

### 6. Mã khuyến mãi trừ SAU phép tính 30%, trần tài trợ `D + S + H`

Thứ tự: tính `grossOnline` trước (không mã), rồi mới trừ `P`. Mã không đổi `B`, `S`, `H`, `T`, `IV`,
`IP`, `D`, `payAtPickup`, `ownerPayable` (ADR 0046 điều 2 giữ nguyên tinh thần). Trần (4) của ADR 0046
điều 3 đổi từ `D + S` thành **`D + S + H`** — phần tài trợ được là mọi thứ trong khoản online trừ tiền
giữ hộ hãng bảo hiểm; CHECK `booking_holds_promo_within_sponsorable_check` đổi tương ứng. Trần (3)
`grossOnline − holdMinAmount` giữ nguyên. Nền tảng gánh `P` ở cả ba kết cục; dòng doanh thu nền tảng
âm được (ADR 0046 điều 4 giữ nguyên).

### 7. Cửa sổ thanh toán và huỷ miễn phí ĐỘNG theo `ΔT = pickupAt − acceptedAt`

Cả hai mốc vẫn tính XUÔI từ `acceptedAt` và kẹp bởi `pickupAt` (`holdWindowsFor`); thứ đổi là ĐỘ DÀI:

```text
  T_cancel = freeCancelHours (4h)                        nếu ΔT ≥ 24h
             min(4h, round(ΔT × 30%))                    nếu 2h ≤ ΔT < 24h
             0                                           nếu ΔT < 2h

  T_pay    = holdPaymentWindowMinutes (120′)             nếu ΔT ≥ 24h
             clamp(round(ΔT × 40%), 15′, 120′)           nếu ΔT < 24h
```

- Cửa sổ còn lại (sau khi kẹp bởi `pickupAt`) ngắn hơn `HOLD_MIN_USABLE_WINDOW_MINUTES` (15′) ⇒ lượt
  duyệt trả `HOLD_WINDOW_TOO_SHORT` (ADR 0044 điều 5 giữ nguyên).
- Khi `ΔT < 24h`, `T_pay` (40%) DÀI HƠN `T_cancel` (30%): khách trả ở cuối hạn đã qua mốc huỷ miễn
  phí. Đó là chủ đích — giao diện phải nói rõ mốc huỷ miễn phí TRƯỚC khi khách trả
  (`isFreeCancelWindowShort`). Câu "cảnh báo khi giờ nhận cách lúc đặt dưới 4 giờ" của ADR 0032 điều 5
  được thay bằng quy tắc này.
- **Giữ nguyên từ ADR 0044 điều 3:** không gia hạn; nhắc ở mốc còn 60′ và 15′ theo phần CÒN LẠI; hold
  có cửa sổ chưa bao giờ dài tới ngưỡng thì bỏ qua mốc đó.
- Hold sinh trước lần deploy v2 giữ nguyên `expires_at` / `free_cancel_until` đã hiển thị cho khách.

### 8. Huỷ và phân bổ — 50/50 trên `D + S + H`, bảo hiểm luôn hoàn

| Sự kiện | `D + S + H` | `IV + IP` | `T` |
| --- | --- | --- | --- |
| Chưa trả trong `T_pay` | — (hết hạn, nhả lịch) | — | — |
| Khách huỷ trong `T_cancel` | hoàn ví khách đúng số đã chuyển (trừ `P`) | hoàn ví khách | không |
| Khách huỷ sau `T_cancel`, trước bàn giao · no-show | **50% chủ xe / 50% XePrime** | **hoàn ví khách 100%** | không |
| Chủ xe/gian hàng huỷ | hoàn ví khách | hoàn ví khách | không, + ghi trách nhiệm (ADR 0045) |
| Chuyến hoàn thành | `D − T` → ví chủ xe · `S + H − P` → doanh thu XePrime | → phải trả hãng bảo hiểm khi `issued` | → sổ thuế |

- Phần chủ xe của phép chia là `⌊(D + S + H) / 2⌋` làm tròn XUỐNG tới 1.000đ; phần dư (trừ `P`) về
  XePrime. Quy tắc 50/50 và "no-show như huỷ muộn" của ADR 0033 điều 3 giữ nguyên; thứ đổi là `H`
  nằm trong phần chia — chuyến không diễn ra thì không có hoa hồng nào được "kiếm".
- Hoàn toàn bộ chỉ hoàn số khách ĐÃ CHUYỂN, trừ theo thứ tự cọc → hoa hồng → phí sàn, không bao giờ
  vào bảo hiểm (ADR 0046 điều 4).
- Tiền hoàn luôn vào ví TÀI KHOẢN KHÁCH (ADR 0053 điều 8).

### 9. Phí giao nhận `G` nằm NGOÀI tiền giữ chỗ

- Chủ xe chốt phí giao nhận đã thoả thuận SAU khi duyệt (Wave 9; ADR 0018 "không ghi phí tự động vào
  đơn" giữ nguyên). Khách trả TRỰC TIẾP cho chủ xe lúc nhận xe; XePrime không thu hộ, không đối soát.
- `G` không vào cơ sở 30%, không chịu `H`, không chịu `T`, không đủ điều kiện mã khuyến mãi.
- Báo giá cho khách hiện `G` là dòng "dự kiến, trả khi nhận xe" khi có ước lượng khoảng cách
  (`deliveryFeeFor`).
- Bảng bậc phí giao xe (`deliveryTiers`) có thêm dạng **theo km** `{ toKm, perKm }` — phí = `perKm` ×
  khoảng cách, làm tròn 1.000đ — bên cạnh dạng trọn gói `{ toKm, fee }`; hai dạng loại trừ nhau trong
  một bậc, dữ liệu cũ (chỉ có `fee`) đọc đúng không cần migration. Phép tính bậc vẫn ở đúng một nơi.

### 10. Bảo hiểm: tuỳ chọn, và chỉ có khi có ĐỐI TÁC đã cấu hình

- `IV` và `IP` **đều tuỳ chọn** (ghi đè "bảo hiểm xe/chuyến là bắt buộc" của ADR 0032 điều 4), khách
  tự tích, mặc định KHÔNG chọn. Biểu phí theo NGÀY theo loại xe ở `fee_policies` (v7: ô tô 50.000đ /
  20.000đ, xe máy 15.000đ / 5.000đ), có phiên bản.
- **Cổng ở server, hai lớp nối tiếp:** dòng chính sách bật (`vehicleProtectionEnabled` /
  `tripInsuranceEnabled`) VÀ `INSURANCE_PARTNER` khác `none`. Thiếu một trong hai ⇒ server không cộng
  `IV`/`IP` dù client gửi lựa chọn, và giao diện ẩn hẳn hai ô tích (không thay bằng dòng giải thích).
- **Production:** `INSURANCE_PARTNER = none` cho tới khi có hợp đồng và adapter đối tác thật ⇒ không
  ô tích, không thu đồng nào. `mic_mock` bị env schema từ chối ở production.
- **Dev/staging:** `MicMockInsurancePartner` phát hành GCN giả lập qua worker ở mốc bàn giao, mọi GCN
  mang nhãn **TEST** và không có hiệu lực bảo hiểm.
- Thời điểm phát hành giữ nguyên ADR 0032 điều 4: chỉ ở bàn giao/bắt đầu chuyến, job idempotent có
  retry, không gọi HTTP đối tác trong transaction DB; huỷ trước nhận xe hoàn 100% `IV + IP`.
- Admin có màn **danh mục sản phẩm MIC** (tên, phạm vi bảo vệ, mức khấu trừ, mức bồi thường tối đa,
  mẫu URL chứng nhận) và **hàng đợi chứng nhận** (tab Bảo hiểm ở `/admin/money`). Biểu phí ngày vẫn
  sống ở `fee_policies`, không ở danh mục — giá có phiên bản theo chính sách, sản phẩm là mô tả.
- Đối tác dự kiến đổi từ PVI (ADR 0028 điều 5) sang **MIC**; mọi điều kiện "sản phẩm thật" của ADR
  0028 điều 5 giữ nguyên và là đúng thứ cổng ở trên thi hành.

### 11. Báo giá công khai không lộ phía chủ xe

DTO và giao diện phía KHÁCH chỉ mang dòng của khách: `B`, `S`, `IV`, `IP`, `P`, `G` (dự kiến), tiền
giữ chỗ, phần trả khi nhận xe. **Không trả** `ownerCommissionAmount`, `ownerNetAmount`,
`ownerPayableAmount`, `platformRetainedAmount`, `taxAmount` ra endpoint công khai. Các dòng đó chỉ
hiện ở bề mặt đối tác (hộp duyệt yêu cầu, chi tiết đơn, ví điểm) và quản trị.

### 12. Snapshot và chuyển tiếp

- Toàn bộ breakdown + phiên bản chính sách đóng băng vào yêu cầu/hold/đơn lúc NHẬN chuyến (ADR 0024,
  0044 điều 2). Đơn tạo trước v7 giữ snapshot cũ (`H = 0`, `S` theo %); không tính lại.
- Chính sách v7 là bản SAO của bản đang hiệu lực, chỉ đổi phần v2 đổi — không `UPDATE` bản `active`.

### 13. Chi trả tài xế: HOÃN

Thù lao/công nợ tài xế trong Manage (khoán theo cuốc, chia %, lương) **không thuộc ADR này**: làm ở
một giai đoạn sau, chỉ cho tuyến gói, và cần ADR riêng (nó chạm sổ thu chi của gian hàng, không chạm
đường tiền qua XePrime). Tài xế là tài khoản liên kết theo ADR 0063.

## Quan hệ với ADR cũ — chính xác phần bị ghi đè

| ADR | Phần bị ghi đè | Phần giữ nguyên |
| --- | --- | --- |
| 0028 | Dòng "Phí dịch vụ XePrime/chuyến: Giả thuyết 10%" ở điều 1. Điều 5 được làm rõ bởi điều 10: hai lớp đều tuỳ chọn và do khách trả; đối tác dự kiến là MIC; cổng thi hành bằng `INSURANCE_PARTNER` | Điều 3, 4 (thuế không biến mất khi mua gói), các điều kiện "sản phẩm thật" của điều 5, điều 9, 10, release gate |
| 0029 | **Điều 1** (toàn bộ phí theo chuyến ở phía khách) và dòng "Phí dịch vụ XePrime 10% / 0%" ở bảng điều 2 | Nguyên tắc breakdown đầy đủ + snapshot; cổng riêng của thuế/bảo hiểm ở điều 2; điều 4 |
| 0032 | Câu "phí nền tảng 10% … cộng vào tổng tiền khách trả" ở điều 1; **điều 2** (công thức `D + S + IV + IP`, `S = 10% × B`, cửa sổ 2h/4h cố định — thay bằng điều 5 và 7); **điều 4** (bảo hiểm xe "bắt buộc" — nay tuỳ chọn); **điều 5** (phép chia `D + S` → `D + S + H`, cảnh báo "dưới 4 giờ" → điều 7); gạch "Existing code/config khác 2 giờ, 4 giờ hoặc cách tính hold phải được xem là implementation gap" ở mục Hệ quả | Điều 1 (hai tuyến loại trừ, trần 3 xe Owner Lite), điều 3 (thuế phía chủ xe, chỉ khi chuyến bắt đầu), thời điểm phát hành bảo hiểm ở điều 4, điều 6 phần còn hiệu lực |
| 0033 | Điều 3 (bảng định tuyến) và điều 4 (bốn cột tiền) **trong phạm vi dòng tiền thứ năm `H`**: hold nay có năm cột, `H` nằm trong phần chia 50/50 và về doanh thu XePrime khi chuyến xong | 50/50, no-show như huỷ muộn, bảo hiểm hoàn 100%, tách quỹ đọc từ cột tiền, điều 1, 2, 5, 6, 7 |
| 0044 | Điều 3 — **chỉ** con số 120′ cố định (nay `T_pay` động, 120′ là trần và là giá trị khi `ΔT ≥ 24h`) | Không gia hạn, hai mốc nhắc 60′/15′ theo phần còn lại, bỏ qua mốc khi cửa sổ ngắn hơn, cột claim riêng; điều 1, 2, 4–9 |
| 0046 | Công thức ở điều 2 (thêm `H`), trần (4) ở điều 3 `D + S` → `D + S + H`, CHECK `promo ≤ deposit + service_fee` ở điều 4 → `+ owner_commission` | Mọi điều còn lại |

## Hệ quả

- `packages/types`: `computeCustomerFees` là nguồn tính DUY NHẤT cho api, web, mobile, worker; sửa cơ
  sở thuế (bỏ `G`) ở đó. `FEE_SCHEDULE_DEFAULTS` chỉ là giá trị khởi tạo — đừng đọc lúc tính tiền.
- Form admin chính sách phí cần bản v2: hai ô `S`, bảng nấc `H`, `depositPercent`/sàn, biểu phí bảo
  hiểm theo ngày; gỡ ô `serviceFeePercent`.
- DTO báo giá công khai phải gỡ các trường phía chủ xe (điều 11) — đây là thay đổi contract, sửa CẢ
  HAI bản gọi API (web + `apps/mobile/shared/src/api`, ADR 0031).
- App native phải dựng lại phần báo giá/tiền giữ chỗ/đồng hồ theo v2 (đội mobile).
- Doanh thu XePrime của một đơn hoàn thành = `S + H − P` (đọc từ cột hold), không còn bằng `S`.

## Release gate — chưa được coi là đã vượt

Release gate ADR 0028 (thuế, bảo hiểm, thu hộ/chi hộ) giữ nguyên. Thuế 10% đang bật bằng số tham khảo;
bảo hiểm chỉ chạy trên staging bằng GCN TEST. Không điều nào ở trên mở được gate bằng mã.

## Cần xem lại khi nào

- Tư vấn thuế chốt phân loại/tỷ lệ khác 10%, hoặc chốt cơ sở tính khác (ví dụ gồm phí giao xe).
- Ký hợp đồng MIC (hoặc đối tác khác): thay adapter, xác nhận biểu phí ngày và nhãn GCN.
- Sau 100 chuyến trả tiền: đo tỉ lệ bỏ ở bước tiền giữ chỗ 30% và tỉ lệ hết hạn theo nhóm `ΔT`.
- Khi tỉ lệ khiếu nại huỷ muộn ở nhóm `2h ≤ ΔT < 24h` cao bất thường — dấu hiệu `T_pay > T_cancel`
  đang gây hiểu nhầm.
- Khi phí giao xe trả tay sinh tranh chấp đáng kể — lúc đó mới cân nhắc đưa `G` vào đường tiền.
- Khi nấc `H` làm chủ xe tuyến hoa hồng dồn sang chuyến ngắn hoặc lách ra ngoài sàn ở chuyến dài.
