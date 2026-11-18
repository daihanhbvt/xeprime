-- Chính sách phí: tiền thuê trả trước 30% (đã gồm hoa hồng) + nấc hoa hồng 10/7/5/3% — ADR 0101
-- (18/11/2026).
--
-- ADR 0101 ghi đè ADR 0066 điều 1 và ADR 0064 điều 3 (nấc mặc định):
--   • `deposit_percent` ĐỔI NGHĨA: từ "% PHẦN CHỦ XE `D` trên tiền thuê, cộng THÊM hoa hồng `H`"
--     thành "% TIỀN THUÊ TRẢ TRƯỚC `C = D + H` trên tiền thuê `R`" — hoa hồng nằm GỌN trong `C`.
--     Tiền giữ chỗ trước mã = min(B + S + IV + IP + X − G, max(S + IV + IP + X + C,
--     S + H + IV + IP + X + T, hold_min_amount)), với C = max(30% × R, deposit_min_amount).
--     Đơn thường: khách quét QR 30% R + S + IV + IP + X − P, trả tay chủ xe 70% R + G; ví chủ xe
--     nhận D − T = 30% R − H − T khi chuyến xong, trọn D = 30% R − H khi khách huỷ muộn.
--   • Nấc hoa hồng mặc định: ngày 1–2 10% · ngày 3–7 7% · ngày 8–30 5% · từ ngày 31 3%.
--
-- Đơn/hold/yêu cầu đã có giữ nguyên snapshot (ADR 0024) — migration chỉ thêm một PHIÊN BẢN mới.
-- Sao bản ĐANG HIỆU LỰC nguyên cột (không gõ cứng danh sách cột, không gõ cứng số phiên bản) rồi
-- chỉ đổi: deposit_percent 30 · deposit_min_amount 0 · owner_commission_tiers 10/7/5/3.
-- Mọi thứ khác (phí sàn + cách tính, thuế, sàn giữ chỗ, các cửa sổ, giới hạn đặt xe) giữ nguyên.
-- CHECK `fee_policies_deposit_covers_tax_check` (30 ≥ thuế tổng cao nhất 7) vẫn đúng.
--
-- Idempotent bằng id cố định: chạy lại không sinh thêm phiên bản.
DO $$
DECLARE
    cur          "public"."fee_policies"%ROWTYPE;
    next_version INT;
BEGIN
    IF EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "id" = '01FEEPOLICYRENTPREPAID30V1') THEN
        RETURN;
    END IF;

    SELECT * INTO cur FROM "public"."fee_policies" WHERE "status" = 'active';
    IF NOT FOUND THEN
        RAISE NOTICE 'fee_policy_rent_prepaid_30: không có chính sách phí nào đang hiệu lực — bỏ qua, admin tạo bản mới qua màn quản trị (mặc định đã là 30%% và 10/7/5/3%%)';
        RETURN;
    END IF;

    SELECT COALESCE(MAX("version"), 0) + 1 INTO next_version FROM "public"."fee_policies";

    UPDATE "public"."fee_policies"
       SET "status" = 'archived', "effective_to" = now(), "updated_at" = now()
     WHERE "id" = cur."id";

    cur."id"                     := '01FEEPOLICYRENTPREPAID30V1';
    cur."version"                := next_version;
    cur."status"                 := 'active';
    cur."name"                   := 'Trả trước 30% tiền thuê (đã gồm hoa hồng), hoa hồng 10/7/5/3%';
    cur."note"                   :=
        'Tiền thuê trả trước = 30% tiền thuê (không gồm phí giao xe), đã gồm hoa hồng của chủ xe. '
        || 'Tiền giữ chỗ = phí sàn + bảo hiểm + phí thu hộ bảo hiểm + 30% tiền thuê, nâng đủ hoa hồng '
        || 'và thuế, kẹp ≤ tổng khách trả trừ phí giao. Khách trả tay chủ xe 70% tiền thuê + phí giao. '
        || 'Hoa hồng lũy tiến: ngày 1-2 10%, ngày 3-7 7%, ngày 8-30 5%, từ ngày 31 3%. '
        || 'Các mục khác giữ nguyên bản trước.';
    cur."deposit_percent"        := 30;
    cur."deposit_min_amount"     := 0;
    cur."owner_commission_tiers" :=
        '[{"fromDay":1,"percent":10},{"fromDay":3,"percent":7},{"fromDay":8,"percent":5},{"fromDay":31,"percent":3}]'::jsonb;
    cur."effective_from"         := now();
    cur."effective_to"           := NULL;
    cur."activated_at"           := now();
    cur."activated_by"           := NULL;
    cur."created_by"             := NULL;
    cur."created_at"             := now();
    cur."updated_at"             := now();

    INSERT INTO "public"."fee_policies" SELECT cur.*;
END $$;
