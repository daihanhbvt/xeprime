# ADR 0104 - Mốc mở giao xe, khách báo "chưa nhận được xe" từ lúc giao, nền tảng gỡ lượt giao xe sai

Ngày: 18/11/2026 · Trạng thái: **Accepted** (18/11/2026 - người dùng chốt mục 1, 2, 4 sau khi thấy trên
staging một chuyến thành "Đang thuê" từ 18/11 trong khi giờ nhận là 23/11) · Ghi đè: [0095](0095-trip-verdict-for-pickup-dispute.md)
mục "Không làm" trong phạm vi "kết luận cho tranh chấp trên đơn đang chạy" · Bổ sung:
[0066](0066-hold-15-percent-dynamic-sla-and-handover-safeguards.md) điều 5, [0081](0081-trip-reminders-and-customer-handover-word.md),
[0045](0045-host-cancellation-and-reputation.md) điều 1

## Bối cảnh

Chủ xe bấm "Đã giao xe" được bất cứ lúc nào khi đơn đang chờ giao. Bấm sớm (kể cả nhiều ngày trước giờ
nhận) là đơn sang `active` ngay: thuế ghi nghĩa vụ, bảo hiểm tới hạn phát hành. Khách lại chỉ báo được
"Chưa nhận được xe" trong `[pickupAt, pickupAt + 120′]`, nên một lượt giao xe bấm nhầm treo nhiều ngày mà
khách không phản bác được. Khi khách đã báo, CSKH cũng không gỡ được: ADR 0095 cố ý không cho kết luận
chuyến trên đơn `active`, vì đơn đang chạy không huỷ được (ADR 0045 điều 1).

## Quyết định

1. **Giao xe chỉ mở từ `pickupAt − 60′`** (`pickupHandoverOpensAt`, cùng mốc với nút "Đã nhận xe" của khách
   ở ADR 0081). `POST /bookings/:id/handovers/pickup/confirm` trước mốc đó ⇒ 409 `HANDOVER_PICKUP_NOT_OPEN`
   kèm `details.opensAt`. Màn đơn của chủ xe nói giờ mở ngay ở cú bấm. Muốn giao sớm hơn thì đổi giờ nhận
   với khách trước. Kết luận "xe đã giao" của nền tảng không bị chặn: nó xác minh một việc đã xảy ra.
2. **Khách báo "Chưa nhận được xe" từ lúc chủ xe giao xe** nếu lúc đó sớm hơn giờ nhận:
   `notReceivedWindowOpensAt(pickupAt, actualPickupAt)` = mốc sớm hơn trong hai mốc, đóng ở
   `pickupAt + 120′` như cũ. DTO chuyến thêm `notReceivedReportFrom`; web mở nút theo mốc này.
3. **Nền tảng gỡ được lượt giao xe sai.** Case `dispute` là lời báo "Chưa nhận được xe" của khách (dấu
   `reason = trip_not_received` trên audit mở case, `isTripNotReceivedReport`) mở thêm kết luận chuyến cho
   đơn `active`. Bốn kết luận như ADR 0095:

   | Kết luận | Trên đơn `active` |
   | --- | --- |
   | `handed_over` | Lượt giao là thật: giữ chuyến đang thuê, chỉ khép case |
   | `customer_no_show` · `host_not_delivered` · `platform_cancelled` | GỠ lượt giao xe rồi đi tiếp như đơn chưa giao (ADR 0095) |

   Gỡ lượt giao xe chạy trong CÙNG transaction với kết luận, theo thứ tự: đảo mọi nghĩa vụ thuế còn sống
   của chuyến (`TaxService.reverseLiveForBookingWithinTx`; dòng đã nộp ⇒ từ chối cả lượt), huỷ mọi biên bản
   còn sống của đơn (giữ `confirmed_at`/`confirmed_by` làm lịch sử, gỡ liên kết số KM), đưa đơn về
   `reserved` và xoá `actual_pickup_at` (`BookingsService.revertPickupWithinTx`, không thêm cạnh vào bảng
   chuyển trạng thái chung), rồi chuyển trạng thái như thường. Lượt huỷ ghi chặng "trước nhận xe", phía
   chịu trách nhiệm do server suy theo kết luận như ADR 0095. Tranh chấp KHÁC giữa chuyến vẫn không có kết
   luận nào: ADR 0045 điều 1 giữ nguyên.
4. **GCN bảo hiểm đã phát hành vẫn hoàn khách.** Kết luận huỷ hoàn tiền bảo hiểm cho khách theo luật huỷ
   hiện hành (ADR 0066 điều 2). GCN đã phát hành (hoặc đang phát hành) không bị huỷ ở MIC vì chưa có API huỷ,
   nên vẫn nằm trong bảng kê trả hãng: khoản đó lấy từ quỹ phí XePrime đang giữ (người dùng chốt
   18/11/2026). Bản xem trước của kết luận trả `insuranceIssued`, và hộp kết luận nhắc người trực báo bộ
   phận bảo hiểm.

## Không làm

- Nút "Hoàn tác giao xe" tự phục vụ cho chủ xe (đề xuất mục 3): để sau. Với điều 1 và điều 3, lượt giao
  nhầm hoặc không xảy ra được nữa, hoặc CSKH gỡ được.
- Tự huỷ chuyến theo lời khách, hay cho chủ xe tự huỷ đơn đang thuê: trách nhiệm và tiền do nền tảng quyết
  sau khi xác minh.

## Hệ quả

- `packages/types`: `pickupHandoverOpensAt`, `notReceivedWindowOpensAt`, tham số `handedOverAt` của
  `notReceivedWindowPhase`, `tripVerdictsFor(..., { tripNotReceived })`, `tripVerdictRevertsPickup`,
  mã lỗi `HANDOVER_PICKUP_NOT_OPEN`.
- `@xeprime/prisma`: `isTripNotReceivedReport`.
- DTO: `HandoverContextDto.pickupConfirmOpensAt`, `CustomerTripDetailDto.notReceivedReportFrom`,
  `TripVerdictPreviewDto.revertsHandover` + `insuranceIssued`.
- `BookingsService.assertNoShowAllowed` đọc biên bản giao xe theo `status = confirmed`, không theo
  `confirmed_at`: biên bản bị gỡ giữ mốc đó làm lịch sử.
- **App (`apps/mobile/shared`) chưa theo**: nút "Chưa nhận được xe" trên app vẫn tự tính cửa sổ từ
  `pickupAt`, nên khi chủ xe giao sớm thì nút trên app mở muộn hơn web. Server đã nhận lời báo sớm; app cần
  đọc `notReceivedReportFrom` ở đợt mobile kế tiếp (ADR 0031). App Partner cần đọc
  `pickupConfirmOpensAt` để nói giờ mở; tới lúc đó nó nhận 409 `HANDOVER_PICKUP_NOT_OPEN` khi bấm sớm.
- Test: `trip-verdict.spec.ts` (bốn kết luận trên đơn đang thuê, gỡ biên bản, giữ chuyến),
  `handover-anti-freeze.spec.ts` (mốc mở giao xe, khách báo sớm từ lúc giao).

## Cần xem lại khi

- Có API huỷ GCN với MIC: kết luận huỷ gọi huỷ thật và loại GCN khỏi bảng kê.
- Tỉ lệ kết luận gỡ lượt giao xe cao ở một gian hàng: dấu hiệu bấm giao xe cho xong việc, cân nhắc đưa
  vào chỉ số uy tín hoặc bắt ảnh lúc giao.
