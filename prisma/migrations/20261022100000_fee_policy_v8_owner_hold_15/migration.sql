-- Chính sách phí v8 — phần giữ chỗ của chủ xe 15% TIỀN THUÊ (ADR 0066, 22/10/2026).
--
-- ADR 0066 ghi đè ADR 0064 điều 5 và điều 8:
--   • `deposit_percent` ĐỔI NGHĨA: từ "% trên tổng khách trả (B + S + IV + IP)" thành "% trên
--     TIỀN THUÊ `B`" (sau khuyến mãi trực tiếp của xe, KHÔNG gồm phí giao xe `G`). Phần chủ xe
--     trong tiền giữ chỗ là `D = max(15% × B, deposit_min_amount)`, tiền giữ chỗ trước mã là
--     `min(B + S + IV + IP, max(S + H + IV + IP + D, S + H + IV + IP + T, hold_min_amount))`.
--   • Huỷ muộn / không đến: chủ xe nhận TRỌN `D`, XePrime giữ `S + H − P`, bảo hiểm hoàn 100%
--     (không còn chia đôi — cột/giá trị `split_late_cancel` giữ nguyên tên).
--   • Cửa sổ huỷ miễn phí khi đặt xa: 2 giờ (trần 120′ của cửa sổ động `holdWindowsFor`).
--
-- Sao bản ĐANG HIỆU LỰC (không gõ cứng số phiên bản) và chỉ đổi:
--   deposit_percent 15 · deposit_min_amount 0 · free_cancel_hours 2 ·
--   deposit_max_percent = GREATEST(cũ, 15).
-- Mọi thứ khác (phí sàn, nấc hoa hồng, thuế, bảo hiểm, sàn giữ chỗ, cửa sổ thanh toán) giữ nguyên.
-- CHECK `fee_policies_deposit_covers_tax_check` (15 ≥ thuế 10) vẫn bảo đảm `D ≥ T`.
--
-- Idempotent bằng id cố định: chạy lại không sinh v9.
DO $$
DECLARE
    cur          "public"."fee_policies"%ROWTYPE;
    next_version INT;
BEGIN
    IF EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "id" = '01FEEPOLICYOWNERHOLD15V208') THEN
        RETURN;
    END IF;

    SELECT * INTO cur FROM "public"."fee_policies" WHERE "status" = 'active';
    IF NOT FOUND THEN
        RAISE NOTICE 'fee_policy_v8: không có chính sách phí nào đang hiệu lực — bỏ qua v8, admin tạo bản mới qua màn quản trị';
        RETURN;
    END IF;

    SELECT COALESCE(MAX("version"), 0) + 1 INTO next_version FROM "public"."fee_policies";

    UPDATE "public"."fee_policies"
       SET "status" = 'archived', "effective_to" = now(), "updated_at" = now()
     WHERE "id" = cur."id";

    INSERT INTO "public"."fee_policies" (
        "id", "version", "status", "name", "note",
        "service_fee_percent", "hold_min_amount", "hold_payment_window_minutes", "free_cancel_hours",
        "deposit_percent", "deposit_min_amount", "deposit_max_percent",
        "tax_enabled", "tax_percent", "tax_label",
        "trip_insurance_enabled", "trip_insurance_percent",
        "vehicle_protection_enabled", "vehicle_protection_percent", "insurance_partner_name",
        "customer_platform_fee_car", "customer_platform_fee_motorbike", "owner_commission_tiers",
        "vehicle_protection_daily_car", "vehicle_protection_daily_motorbike",
        "trip_insurance_daily_car", "trip_insurance_daily_motorbike",
        "effective_from", "activated_at", "created_at", "updated_at"
    ) VALUES (
        '01FEEPOLICYOWNERHOLD15V208', next_version, 'active',
        'Giữ chỗ chủ xe 15% tiền thuê, huỷ muộn đền trọn cho chủ xe',
        'Phần chủ xe trong tiền giữ chỗ = 15% tiền thuê (không gồm phí giao xe), không sàn tiền. '
        || 'Tiền giữ chỗ = phí sàn + hoa hồng + bảo hiểm + phần chủ xe, nâng đủ thuế và sàn giữ chỗ, '
        || 'kẹp ≤ tổng khách trả trừ phí giao. Huỷ muộn hoặc không đến: chủ xe nhận trọn phần của '
        || 'mình, XePrime giữ phí sàn và hoa hồng, bảo hiểm hoàn khách. Huỷ miễn phí tối đa 2 giờ. '
        || 'Các mục khác giữ nguyên bản trước.',
        cur."service_fee_percent", cur."hold_min_amount", cur."hold_payment_window_minutes", 2,
        15, 0, GREATEST(cur."deposit_max_percent", 15),
        cur."tax_enabled", cur."tax_percent", cur."tax_label",
        cur."trip_insurance_enabled", cur."trip_insurance_percent",
        cur."vehicle_protection_enabled", cur."vehicle_protection_percent", cur."insurance_partner_name",
        cur."customer_platform_fee_car", cur."customer_platform_fee_motorbike", cur."owner_commission_tiers",
        cur."vehicle_protection_daily_car", cur."vehicle_protection_daily_motorbike",
        cur."trip_insurance_daily_car", cur."trip_insurance_daily_motorbike",
        now(), now(), now(), now()
    );
END $$;
