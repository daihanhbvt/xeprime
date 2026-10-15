-- Thư chào mừng chủ xe tuyến hoa hồng đi qua CÙNG hàng đợi `email_outbox` (thử lại + chống trùng).
ALTER TABLE "email_outbox" DROP CONSTRAINT IF EXISTS "email_outbox_kind_check";
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_kind_check"
    CHECK ("kind" IN ('plan_guide', 'plan_guide_test', 'partner_welcome'));
