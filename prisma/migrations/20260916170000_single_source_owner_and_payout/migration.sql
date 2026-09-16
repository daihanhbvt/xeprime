-- ═══════════════════════════════════════════════════════════════════════════
-- MỘT NGUỒN SỰ THẬT CHO "CHỦ GIAN HÀNG" VÀ "TÀI KHOẢN NHẬN TIỀN" (16/09/2026)
--
-- Đợt gộp màn Cửa hàng bỏ hai bản sao đã sống song song với nguồn thật:
--
--  1. CHỦ GIAN HÀNG. Nguồn thật là `tenants.owner_user_id → users` — nơi email và số điện thoại
--     đã đi qua xác minh OTP, đổi được bằng luồng xác thực, và có cờ `email_verified`/
--     `phone_verified` để nói ra điều đó. Ba cột dưới đây là chữ gõ tay trên hồ sơ gian hàng:
--     không ai chứng minh, không ai đồng bộ, và chúng đứng ngay cạnh một tài khoản đã xác minh
--     nói khác đi. Reviewer duyệt danh tính thì đọc bản nào?
--
--       tenant_profiles.owner_full_name
--       tenant_profiles.owner_phone
--       tenant_profiles.owner_email
--
--     Hồ sơ duyệt KHÔNG mất dữ liệu: `TenantsService.submitForReview` chụp họ tên/email/SĐT của
--     user chủ vào `approval_tasks.snapshot` (jsonb) tại thời điểm gửi, giữ nguyên ba khoá
--     `ownerFullName`/`ownerPhone`/`ownerEmail` để phiếu CŨ và phiếu MỚI đọc bằng cùng một bảng
--     nhãn. Snapshot là bản đông cứng — đó mới là thứ reviewer phải đọc.
--
--  2. TÀI KHOẢN NHẬN TIỀN. Nguồn thật là `bank_accounts` (ADR 0023/0033): sổ nhiều tài khoản,
--     cờ mặc định, lưu trữ, dấu vết đổi. Mọi lệnh chi thật — `withdrawal_requests`,
--     `hold_settlement`, hoàn khoản giữ chỗ — đã đọc bảng đó từ đầu và CHƯA BAO GIỜ đọc bảy cột
--     dưới đây. Giữ chúng nghĩa là mời gian hàng điền một chỗ mà tiền không bao giờ chạy tới.
--
--       tenant_profiles.bank_name
--       tenant_profiles.bank_account_no
--       tenant_profiles.bank_account_name
--       tenant_profiles.qr_url
--       seller_profiles.bank_code
--       seller_profiles.bank_account_number
--       seller_profiles.bank_account_name
--
-- KHÔNG có bước chuyển dữ liệu: repo đang ở giai đoạn phát triển, dữ liệu dev của hồ sơ gian
-- hàng và hồ sơ người bán nhập lại được (seed `SEED_MODE=demo` dựng lại toàn bộ).
--
-- KHÔNG đụng tới tiền: `bookings`, `booking_holds`, `bank_transactions`, `wallet_entries`,
-- `withdrawal_requests`, `payments`, `subscription_invoices` không có cột nào ở đây.
--
-- `seller_profiles.bank_changed_at` GIỮ LẠI: nó là dấu MỐC THỜI GIAN (R4 dùng đặt cooldown
-- trước khi cho rút), không phải dữ liệu tài khoản. Từ nay mốc đó do luồng `bank_accounts` ghi.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "tenant_profiles"
  DROP COLUMN IF EXISTS "owner_full_name",
  DROP COLUMN IF EXISTS "owner_phone",
  DROP COLUMN IF EXISTS "owner_email",
  DROP COLUMN IF EXISTS "bank_name",
  DROP COLUMN IF EXISTS "bank_account_no",
  DROP COLUMN IF EXISTS "bank_account_name",
  DROP COLUMN IF EXISTS "qr_url";

ALTER TABLE "seller_profiles"
  DROP COLUMN IF EXISTS "bank_code",
  DROP COLUMN IF EXISTS "bank_account_number",
  DROP COLUMN IF EXISTS "bank_account_name";
