# ADR 0079 — Lịch bảo dưỡng chỉ là một ngày nhắc, không giữ chỗ lịch xe

Ngày: 04/11/2026 · Trạng thái: **Accepted** (04/11/2026 — người dùng chốt khi làm lại mục "Bảo dưỡng
& số KM" của màn sửa xe) · Liên quan: [0006](0006-booking-concurrency.md) (bảng `vehicle_occupancies`),
[0050](0050-platform-tenant-support-context.md) (phiên hỗ trợ ghim lịch + KM),
[0078](0078-retire-handover-windows-and-per-km-delivery.md) (cùng khuôn "gỡ nhưng giữ hình dạng API
cho app cũ")

## Bối cảnh

Từ Wave 6, một phiếu bảo dưỡng có cặp `plannedStartAt` / `plannedEndAt`. Nhập đủ cặp thì
`MaintenanceService` giữ chỗ thật trên `vehicle_occupancies` (nguồn `maintenance`): khách không đặt
được xe trong khoảng đó, lịch xe hiện một thanh "Bảo dưỡng", lập lịch đè lên đơn thuê thì 409
`BOOKING_SCHEDULE_CONFLICT`.

Khi làm lại mục Bảo dưỡng theo design (sổ cái `docs/design/09_PARTNER_REDESIGN.md` §3.6), người dùng
yêu cầu chỉ giữ MỘT mốc ngày dự kiến, bỏ mốc kết thúc. Được hỏi một ngày thì lịch xe xử lý thế nào
(khoá cả ngày · chỉ nhắc · khoá vài giờ), người dùng chọn **chỉ là ngày nhắc, không khoá**.

## Quyết định

1. Phiếu bảo dưỡng mang **một ngày dự kiến** (`plannedStartAt`, web gửi 00:00 giờ Việt Nam của ngày
   chọn). Nó chỉ để nhắc và sắp xếp danh sách, **không giữ chỗ** trên `vehicle_occupancies`. Xe vẫn
   nhận đặt bình thường trong ngày đó. Muốn chặn ngày thì chủ xe khoá lịch xe (`blocked_range`, lý do
   "Sửa chữa đột xuất"), là đường đã có.
2. `MaintenanceService` không còn ghi `vehicle_occupancies`: bỏ giữ / dời / nhả chỗ, bỏ bước dịch lỗi
   trùng lịch, bỏ phụ thuộc `OccupancyService`. Lập lịch không còn trả `BOOKING_SCHEDULE_CONFLICT`.
3. `plannedEndAt` **không còn được ghi**:
   - API giữ trường đó cho app phát hành trước đó: lệnh ghi vẫn nhận (soát dạng ISO) rồi bỏ qua;
     response đánh dấu `deprecated`.
   - Server bỏ luật "đủ cặp / kết thúc sau bắt đầu".
4. Migration `20261104090000_maintenance_reminder_date_no_hold`:
   - xoá mọi occupancy nguồn `maintenance`, để xe nhận đặt lại được những ngày đó;
   - đặt `planned_end_at = NULL` cho phiếu còn mở (`scheduled` / `in_progress`);
   - phiếu đã đóng giữ nguyên mốc cũ làm lịch sử.
5. Giữ nguyên:
   - vòng đời phiếu (lên lịch → đang làm → hoàn tất / huỷ);
   - hoàn tất ghi KM và dời mốc thay nhớt trong một transaction;
   - chi phí sinh phiếu chi;
   - phiên hỗ trợ vẫn không đổi được ngày dự kiến và KM (ADR 0050).

## Hệ quả

- Web, mục Bảo dưỡng (màn sửa xe và tab của trang chi tiết xe dùng chung component):
  - hộp thêm/sửa chỉ còn ô "Ngày dự kiến";
  - lịch sắp tới hiện một ngày;
  - thùng rác là "Huỷ lịch": phiếu vào lịch sử với nhãn "Đã huỷ";
  - lịch sử bảo dưỡng mở trong hộp thoại "Xem lịch sử bảo dưỡng".
- Lịch xe không còn thanh "Bảo dưỡng" mới. Hộp `MaintenanceEventDialog` của lịch chỉ còn mở được từ
  dữ liệu cũ. Migration đã xoá các thanh đó nên thực tế không còn đường vào.
- **App mobile** (do dev khác làm, chưa đổi trong đợt này):
  - form phiếu còn hai ô bắt đầu / kết thúc và còn đòi đủ cặp; server nhận ngày bắt đầu, bỏ mốc
    kết thúc;
  - lời nhắc trùng lịch trên app không bao giờ hiện nữa;
  - cần đổi sang một ô ngày ở bản app kế tiếp.

## Cần xem lại khi

- Chủ xe cần bảo dưỡng tự khoá lịch: lúc đó thêm lựa chọn "khoá ngày này" tường minh, tạo occupancy
  nguồn `blocked_range` hoặc `maintenance` cho riêng ngày đó. Không âm thầm quay lại giữ chỗ mặc định.
- App mobile đã phát hành bản không còn gửi `plannedEndAt`: gỡ trường đó khỏi DTO.
