-- ADR 0091 điều 4 (sửa 25/11/2026): đặt trước tối đa 15 → 30 ngày.
--
-- Migration trước (`20261125110000_booking_advance_default_30`) chỉ đổi DEFAULT của cột; server đọc số
-- của bản chính sách ĐANG HIỆU LỰC, nên số mới chỉ có tác dụng khi có một phiên bản mới. Theo cùng
-- khuôn của các lần đổi chính sách trước (vd. `20261118100000_fee_policy_rent_prepaid_30_commission_inside`):
-- sao chép bản đang hiệu lực, lưu trữ nó, kích hoạt bản sao với `max_advance_booking_days = 30`. Mọi
-- số khác giữ nguyên.
--
-- Idempotent bằng id cố định: chạy lại (hay đã chạy tay trên staging trước khi deploy) không sinh
-- thêm phiên bản. Bản đang hiệu lực đã là 30 thì cũng không tạo bản mới.
DO $$
DECLARE
    cur          "public"."fee_policies"%ROWTYPE;
    next_version INT;
BEGIN
    IF EXISTS (SELECT 1 FROM "public"."fee_policies" WHERE "id" = '01FEEPOLICYADVANCE30DAYS11') THEN
        RETURN;
    END IF;

    SELECT * INTO cur FROM "public"."fee_policies" WHERE "status" = 'active';
    IF NOT FOUND THEN
        RAISE NOTICE 'fee_policy_advance_booking_30: không có chính sách phí nào đang hiệu lực — bỏ qua, admin tạo bản mới qua màn quản trị (mặc định đã là 30 ngày)';
        RETURN;
    END IF;
    IF cur."max_advance_booking_days" = 30 THEN
        RETURN;
    END IF;

    SELECT COALESCE(MAX("version"), 0) + 1 INTO next_version FROM "public"."fee_policies";

    UPDATE "public"."fee_policies"
       SET "status" = 'archived', "effective_to" = now(), "updated_at" = now()
     WHERE "id" = cur."id";

    cur."id"                       := '01FEEPOLICYADVANCE30DAYS11';
    cur."version"                  := next_version;
    cur."status"                   := 'active';
    cur."name"                     := 'Đặt trước tối đa 30 ngày';
    cur."note"                     :=
        'Giờ nhận xe không quá 30 ngày kể từ lúc khách gửi yêu cầu (tự lái và có tài xế; trước là 15 ngày). '
        || 'Các mục khác giữ nguyên bản trước.';
    cur."max_advance_booking_days" := 30;
    cur."effective_from"           := now();
    cur."effective_to"             := NULL;
    cur."activated_at"             := now();
    cur."activated_by"             := NULL;
    cur."created_by"               := NULL;
    cur."created_at"               := now();
    cur."updated_at"               := now();

    INSERT INTO "public"."fee_policies" SELECT cur.*;
END $$;
