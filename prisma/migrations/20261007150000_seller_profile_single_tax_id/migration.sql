-- ═══════════════════════════════════════════════════════════════════════════
-- MÃ SỐ THUẾ: MỘT NGUỒN LÀ `seller_profiles.tax_id` (07/10/2026)
--
-- Trước migration này gian hàng có HAI ô mã số thuế ở hai bảng:
--
--   tenant_profiles.tax_code   — ô "Mã số thuế" ở section "Địa chỉ & pháp lý" của trang Cửa hàng.
--                                Chỉ hợp đồng đọc nó.
--   seller_profiles.tax_id     — hồ sơ người bán. Thuế khấu trừ của MỖI chuyến gắn vào hồ sơ này
--                                (`tax_withholdings.seller_profile_id`) và báo cáo thuế của nền
--                                tảng lấy MST + loại chủ thể từ đây.
--
-- Từ 16/09 gian hàng tuyến gói không còn màn nào khai bảng thứ hai, nên một doanh nghiệp đã gõ MST
-- ở trang Cửa hàng vẫn hiện trong báo cáo thuế với MST trống. Nay web khai MST ở section "Thông tin
-- khai thuế" (hồ sơ người bán) ở CẢ hai tuyến, hợp đồng và màn quản trị đọc `seller_profiles`, và
-- cột `tax_code` bị gỡ. API vẫn nhận/trả `taxCode` trên hồ sơ gian hàng cho client cũ (app native),
-- nhưng ghi/đọc thẳng `seller_profiles.tax_id` — xem `TenantsService.updateProfile`.
--
-- Viết TAY: chỉ các lệnh dưới, không kéo theo drift của `prisma migrate diff` (xem header baseline
-- `20260821000000_init`). `id` sinh bằng `gen_random_uuid()` cắt 26 ký tự — cùng cách và cùng lý do
-- với `20260830120000_backfill_default_plan`: hàng dữ liệu một lần, không phải đường ghi lúc chạy.
--
-- MST chuẩn hoá đúng như `SellerProfileService.save`: bỏ mọi khoảng trắng.
-- ═══════════════════════════════════════════════════════════════════════════

-- 0. Không mất dữ liệu trong im lặng: `tax_id` là varchar(30), `tax_code` là varchar(50). Một giá
--    trị dài hơn 30 ký tự (sau khi bỏ khoảng trắng) không thể là MST hợp lệ — nhưng cắt ngắn nó là
--    tạo ra một MST SAI. Dừng lại để người vận hành sửa tay trước, thay vì đoán.
DO $$
DECLARE
    too_long integer;
BEGIN
    SELECT count(*) INTO too_long
      FROM "tenant_profiles"
     WHERE length(regexp_replace(coalesce("tax_code", ''), '\s+', '', 'g')) > 30;
    IF too_long > 0 THEN
        RAISE EXCEPTION
            'tenant_profiles.tax_code: % hàng dài hơn 30 ký tự sau khi bỏ khoảng trắng — sửa tay rồi chạy lại migration',
            too_long;
    END IF;
END $$;

-- 1. Gian hàng có MST nhưng CHƯA có hồ sơ người bán → tạo bản nháp mang MST đó.
--    Loại chủ thể theo TUYẾN ĐĂNG KÝ (`onboarding_state`), không theo `tenant_type`: chủ xe tuyến hoa
--    hồng là cá nhân; gian hàng đi cửa gói (đã/đang trả tiền) có MST thì ít nhất là hộ kinh doanh.
--    Bản nháp — chủ gian hàng thấy và sửa được ở "Thông tin khai thuế".
INSERT INTO "seller_profiles" ("id", "tenant_id", "entity_type", "tax_id", "status", "created_at", "updated_at")
SELECT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 26)),
       tp."tenant_id",
       CASE WHEN t."onboarding_state" = 'commission' THEN 'individual' ELSE 'household_business' END,
       regexp_replace(tp."tax_code", '\s+', '', 'g'),
       'draft',
       now(),
       now()
  FROM "tenant_profiles" tp
  JOIN "tenants" t ON t."id" = tp."tenant_id"
 WHERE btrim(coalesce(tp."tax_code", '')) <> ''
   AND NOT EXISTS (SELECT 1 FROM "seller_profiles" sp WHERE sp."tenant_id" = tp."tenant_id");

-- 2. Đã có hồ sơ người bán mà CHƯA có MST → điền MST từ hồ sơ gian hàng.
--    Chỉ hồ sơ còn SỬA ĐƯỢC (`SELLER_PROFILE_EDITABLE`): hồ sơ đang chờ/đã xác minh là thứ nền tảng
--    đã (hoặc đang) đối chiếu, migration không được đổi nó sau lưng reviewer.
--    Hồ sơ đã có MST thì GIỮ NGUYÊN — đó là bản khai cho thuế, thắng bản ở hồ sơ gian hàng.
--    Bản nháp CHƯA AI CHẠM (tạo lười với loại mặc định `individual`, không tên/MST/CCCD) của một gian
--    hàng đi cửa gói được nâng loại lên `household_business` — nếu không, MST vừa điền nằm sau một
--    loại chủ thể mà form không hiện ô MST.
UPDATE "seller_profiles" sp
   SET "tax_id" = regexp_replace(tp."tax_code", '\s+', '', 'g'),
       "entity_type" = CASE
           WHEN sp."entity_type" = 'individual'
            AND t."onboarding_state" <> 'commission'
            AND btrim(coalesce(sp."legal_name", '')) = ''
            AND btrim(coalesce(sp."id_number", '')) = ''
           THEN 'household_business'
           ELSE sp."entity_type"
       END,
       "updated_at" = now()
  FROM "tenant_profiles" tp
  JOIN "tenants" t ON t."id" = tp."tenant_id"
 WHERE tp."tenant_id" = sp."tenant_id"
   AND btrim(coalesce(tp."tax_code", '')) <> ''
   AND btrim(coalesce(sp."tax_id", '')) = ''
   AND sp."status" IN ('draft', 'changes_requested', 'rejected');

-- 3. Gỡ bản sao.
ALTER TABLE "tenant_profiles" DROP COLUMN "tax_code";
