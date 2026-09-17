-- ============================================================================
-- BỎ KHOẢNG ĐẶT TRƯỚC CỦA TỰ ĐỘNG NHẬN CHUYẾN (17/09/2026)
--
-- Trước migration này, một xe bật "Tối ưu nhận chuyến" vẫn chỉ tự nhận khi giờ nhận rơi vào
-- khoảng [min_lead, max_lead] — mặc định 6 giờ tới 1 tuần. Chủ xe thấy dòng "đang hoạt động"
-- rồi vẫn phải duyệt tay mọi chuyến đặt gấp hoặc đặt xa, và màn hình không nói vì sao.
--
-- Quyết định: BẬT là nhận. Không còn mốc thời gian nào ở giữa, nên hai cột biến mất thay vì ở
-- lại làm dữ liệu không ai đọc — một cột chết là một cái bẫy cho lần sửa sau.
--
-- Điều kiện tự nhận còn lại đều là ràng buộc THẬT, không phải tuỳ chọn: xe còn trống
-- (`vehicle_occupancies`, ADR 0006), giờ nhận/trả nằm trong khung giao nhận của xe, giá đã chốt,
-- thuê dài hạn luôn chốt lịch tay (ADR 0011).
--
-- Không mất mát gì phải sao lưu: hai cột chỉ là NGƯỠNG cấu hình, không phải dữ kiện của một
-- chuyến nào. Không đơn/yêu cầu nào tham chiếu tới chúng.
-- ============================================================================

-- CHECK phải đi trước: nó đọc cả hai cột.
ALTER TABLE "public"."vehicle_service_settings"
    DROP CONSTRAINT IF EXISTS "vehicle_service_settings_lead_check";

ALTER TABLE "public"."vehicle_service_settings"
    DROP COLUMN IF EXISTS "auto_accept_min_lead_minutes",
    DROP COLUMN IF EXISTS "auto_accept_max_lead_minutes";
