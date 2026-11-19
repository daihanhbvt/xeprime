# ADR 0107 — Duyệt được chuyến sát giờ, khách trả được cả sau giờ nhận; tự nhận chuyến chỉ khi còn ≥ 60′

Ngày: 19/11/2026 · Trạng thái: **Accepted** (19/11/2026 — người dùng chốt: hạn trả tối thiểu 15′ kể từ lúc
duyệt, không tự nhận khi giờ nhận còn dưới 60′) · Ghi đè: [0066](0066-hold-15-percent-dynamic-sla-and-handover-safeguards.md) phần "`T_pay`
kẹp bởi `pickupAt`"; [0044](0044-approve-before-hold.md) điều 4 phần "chuyến sát giờ không phát QR
(`HOLD_WINDOW_TOO_SHORT`)" · Giữ: 0044 điều 2 (đơn chỉ ra đời khi đối soát đủ tiền), điều 3 (không gia hạn),
0066 công thức `clamp(30% × ΔT, 15′, 120′)`, 0072 (huỷ miễn phí đếm từ `paidAt`, kẹp bởi `pickupAt`)

## Bối cảnh

Người dùng báo hai lỗi ngày 19/11/2026:

1. Khách gửi yêu cầu lúc 10h50 cho giờ nhận 11h05. Yêu cầu hiện trong hàng chờ duyệt (hạn phản hồi tối
   thiểu 15′ tới 11h05), nhưng chủ xe bấm duyệt thì bị từ chối. Nguyên nhân: hạn thanh toán của khoản
   giữ chỗ = `min(acceptedAt + T_pay, pickupAt)`. Còn dưới 15′ tới giờ nhận thì cửa sổ ngắn hơn
   `HOLD_MIN_USABLE_WINDOW_MINUTES`, nên lượt duyệt ném `HOLD_WINDOW_TOO_SHORT`. Chuyến hiện ra để duyệt
   mà không duyệt nổi.
2. "Đặt ngay" (tự nhận chuyến) không có ngưỡng giờ riêng. Nó chỉ rơi về duyệt tay khi lượt tạo hold
   ném chính lỗi trên, tức là khi còn dưới khoảng 15′. Ngưỡng do một lỗi quyết, không phải một luật.

## Quyết định

### 1. Hạn thanh toán không còn kẹp bởi giờ nhận xe

- `holdWindowsFor` trả `expiresAt = acceptedAt + clamp(round(30% × ΔT), 15′, holdPaymentWindowMinutes)`,
  bỏ `min(…, pickupAt)`. Chuyến duyệt sát giờ hoặc đã qua giờ nhận ⇒ khách có **tối thiểu 15′** kể
  từ lúc duyệt. `ΔT` vẫn không âm, nên chuyến đã qua giờ nhận rơi vào sàn 15′.
- Lượt duyệt **không còn bị từ chối vì sát giờ**. Phép kiểm `HOLD_MIN_USABLE_WINDOW_MINUTES` ở
  `createForApprovedRequestWithinTx` ở lại, nhưng chỉ còn chặn chính sách phí có trần dưới 15′.
  `API_ERROR_CODE.HOLD_WINDOW_TOO_SHORT` giữ lại cho app đã phát hành.
- Tiền về đủ ⇒ đơn ra đời như mọi đơn (ADR 0044 điều 2), kể cả khi `pickupAt` đã qua. Xe giao trễ và
  chuyến chạy bình thường. Đơn đã qua giờ nhận mà chưa giao xe đi đúng đường "trễ giờ nhận" sẵn có
  (worker `handover-overdue`).
- Mốc **huỷ miễn phí** giữ nguyên ADR 0072: đếm từ `paidAt`, **vẫn kẹp bởi `pickupAt`**. Trả sau giờ
  nhận ⇒ không có cửa sổ huỷ miễn phí. Đó là hệ quả chấp nhận được: khách chọn một chuyến đã tới giờ.

### 2. Tự nhận chuyến chỉ khi giờ nhận còn ≥ 60′

- Hằng `AUTO_ACCEPT_MIN_LEAD_MINUTES = 60` (`@xeprime/types`). `evaluateAutoAccept` trả mã chặn mới
  `AUTO_ACCEPT_BLOCKER.PICKUP_TOO_SOON` khi `pickupAt − now < 60′`. Yêu cầu ở lại
  `pending_host_approval`, audit `booking_request.auto_accept_skipped` ghi lý do, chủ xe duyệt tay.
- Ngưỡng là hằng của nền tảng, không phải ô cấu hình của từng xe.

## Hệ quả

- Hold có thể còn "chờ tiền" sau giờ nhận xe, tối đa 15′ cộng phần tỉ lệ. Lịch xe đã bị chiếm từ lúc
  duyệt như cũ.
- App đã phát hành: `holdWindowsPreview.tooShort` gần như luôn `false`; nhãn mã chặn mới cần khoá chữ
  `Domain.autoAcceptBlocker.pickup_too_soon` (đã thêm cả vi và en).
- Test cần cập nhật: `packages/types` (`holds.test.ts`, `fee-scenarios.test.ts`), API
  (`booking-hold-lifecycle.spec.ts`, `vehicle-settings.spec.ts`, và spec nào khẳng định kẹp ở `pickupAt`).

## Cần xem lại khi

- Thấy nhiều hold trả sau giờ nhận rồi khách không tới (no-show) ⇒ cân nhắc trần "trả muộn tối đa X′ sau
  giờ nhận".
