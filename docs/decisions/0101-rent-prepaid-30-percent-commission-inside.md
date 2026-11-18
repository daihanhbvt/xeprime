# ADR 0101 - Tiền thuê trả trước 30% (hoa hồng nằm gọn bên trong) và nấc hoa hồng mặc định 10/7/5/3%

Ngày: 18/11/2026 · Trạng thái: **Accepted** (18/11/2026 - PO chốt) · Ghi đè:
[0066](0066-hold-15-percent-dynamic-sla-and-handover-safeguards.md) điều 1 (công thức tiền giữ chỗ
`S + H + IV + IP + 15% × B`, chính sách v8), [0064](0064-financial-flow-v2.md) điều 3 trong phạm vi
**con số mặc định** của nấc hoa hồng (10/7/3/0%) · Liên quan: 0024, 0033, 0046, 0068, 0069, 0091

## Bối cảnh

ADR 0066 tính tiền giữ chỗ bằng tổng các phần có chủ, trong đó phần cam kết giữ xe của chủ xe
`D = 15% × R` cộng THÊM trên hoa hồng `H`. Khách vì thế chuyển `15% × R + H + S + …`: con số trả trước
thay đổi theo số ngày thuê (vì `H` lũy tiến) và khó giải thích ở màn thanh toán. PO chốt lại hai quy tắc
của luồng tiền v2:

1. Khách trả trước một tỷ lệ CỐ ĐỊNH của tiền thuê, và hoa hồng của XePrime nằm gọn trong phần đó.
2. Nấc hoa hồng lũy tiến mặc định đổi để chuyến dài vẫn có hoa hồng.

## Quyết định

### 1. Tiền thuê trả trước `C = D + H = 30% × R`, hoa hồng nằm gọn bên trong

`R = B − G` là tiền thuê sau khuyến mãi trực tiếp của xe, không gồm phí giao xe `G`.

```text
  C_target      = max( roundVnd(depositPercent% × R), depositMinAmount )   ← 30% × R, sàn 0
  notOwnersMoney = S + H + IV + IP + X + T
  grossOnline   = min( B + S + IV + IP + X − G,
                       max( S + IV + IP + X + C_target,                   ← KHÔNG cộng H: H ở trong C
                            notOwnersMoney,                               ← D ≥ T và D ≥ 0 mọi cấu hình
                            holdMinAmount ) )
  D             = grossOnline − S − H − IV − IP − X                        ← = C_target − H ở đơn thường
  holdAmount    = grossOnline − P                                          ← mã vẫn trừ SAU (0046)
```

- `depositPercent` đổi NGHĨA lần hai: từ "% phần chủ xe `D` trên tiền thuê" (0066) thành **"% tiền thuê
  trả trước `C = D + H`"**. Tên cột/trường giữ nguyên (dữ liệu đi trên dây); nhãn quản trị đổi thành
  "Tiền thuê trả trước (% tiền thuê, đã gồm hoa hồng)".
- Mặc định `FEE_SCHEDULE_DEFAULTS.depositPercent = 30`, `depositMinAmount = 0`.
- Tuyến gói tắt công tắc thu cọc: giữ nguyên `max(notOwnersMoney, holdMinAmount)`.
- Phụ lục gia hạn (ADR 0077 điều 4, `S = H = 0`, không bảo hiểm): khoản online = `30% × R` của phụ lục.

Ở chính sách mặc định (30%, nấc cao nhất 10%, thuế cao nhất 7%) luôn có `C ≥ H + T`, nên với đơn thường:

| Con số | Giá trị |
| --- | --- |
| Khách quét QR (`onlineAmount`) | `30% × R + S + IV + IP + X − P` |
| Tiền thuê trả trước trong QR (`D + H`) | `30% × R` |
| Khách trả tay chủ xe lúc nhận xe (`payAtPickupAmount`) | `70% × R + G` |
| Phần thực của chủ xe trong hold (`D`) | `30% × R − H` (tuyến gói `H = 0` ⇒ `30% × R`) |
| Ví chủ xe khi chuyến xong (`ownerPayableAmount`) | `D − T = 30% × R − H − T` |
| Chủ xe thực nhận cho tiền thuê (`ownerNetAmount`) | `R − H − T` |

`ownerPayoutOf` không đổi công thức: `b = R − D − H = 70% × R`, `a − b = D − T`.

### 2. Kết cục của khoản giữ chỗ không đổi (ADR 0066 điều 2 giữ nguyên)

| Sự kiện | Khách | XePrime | Ví chủ xe | Thuế `T` |
| --- | --- | --- | --- | --- |
| Khách huỷ trong `T_cancel` · chủ xe huỷ | hoàn đúng số đã chuyển | 0 | 0 | không |
| Khách huỷ muộn · no-show (`split_late_cancel`) | `IV + X + IP` | `S + H − P` | **`D = 30% × R − H`** | không |
| Chuyến hoàn thành (`settled`) | - | `S + H − P` | `D − T` | `T` |

Chỉ độ lớn của `D` đổi (vì `C` lớn hơn và `H` nằm trong `C`); phép phân bổ `resolveHoldAllocation` giữ nguyên.

### 3. Nấc hoa hồng lũy tiến mặc định: 10% · 7% · 5% · 3%

| Ngày thuê | `fromDay` | % |
| --- | --- | --- |
| 1 - 2 | 1 | 10% |
| 3 - 7 | 3 | 7% |
| 8 - 30 | 8 | 5% |
| từ 31 | 31 | 3% |

Cơ chế không đổi: nấc là dữ liệu `fee_policies.owner_commission_tiers`, tính theo từng ngày bằng
`computeTieredOwnerCommission`, làm tròn tới đồng một lần trên tổng (ADR 0069). Admin vẫn sửa nấc ở
Chính sách phí; đây chỉ là mặc định khởi tạo (`FEE_SCHEDULE_DEFAULTS.ownerCommissionTiers`) và giá trị của
bản `active` mới.

### 4. Phiên bản chính sách phí mới

Migration `20261118100000_fee_policy_rent_prepaid_30_commission_inside` sao bản đang hiệu lực (mọi cột),
lưu trữ bản cũ và kích hoạt bản mới với `deposit_percent = 30`, `deposit_min_amount = 0`, nấc 10/7/5/3%.
Idempotent bằng id cố định. Không có bản `active` nào thì bỏ qua (form tạo mới đã lấy mặc định mới).

Yêu cầu đang chờ duyệt, hold và đơn đã tạo giữ snapshot cũ (ADR 0024): lượt duyệt tính theo bản đang
hiệu lực LÚC DUYỆT như mọi lần đổi chính sách.

## Hệ quả

- Khách trả trước nhiều hơn ở chuyến ngắn tuyến gói (15% → 30% tiền thuê) và nhìn thấy một tỷ lệ cố định;
  ở tuyến hoa hồng khoản QR tăng `15% × R − H` so với 0066.
- Chủ xe tuyến hoa hồng được đền nhiều hơn khi khách huỷ muộn (`30% × R − H` thay vì `15% × R`).
- Cổng kích hoạt `deposit_percent ≥ thuế cao nhất` (CHECK `fee_policies_deposit_covers_tax_check`) giữ
  nguyên. Nó không còn tự bảo đảm `D ≥ T` vì `H` cũng nằm trong `C`; sàn `notOwnersMoney` của phép tính
  bảo đảm điều đó ở mọi cấu hình, đổi lại tỷ lệ công bố có thể bị vượt nếu admin đặt `C < H + T`.
- Mã khuyến mãi: trần tài trợ vẫn là `D + S + H` (= `S + C`), không chạm `IV + IP + X`.

## Cần xem lại khi nào

- Admin muốn tỷ lệ trả trước khác nhau theo loại dịch vụ hay loại xe.
- Có chính sách mà `C < H + T` xảy ra thường xuyên (nấc hoa hồng hoặc thuế tăng) - cân nhắc thêm cổng
  kích hoạt `depositPercent ≥ nấc cao nhất + thuế cao nhất`.
