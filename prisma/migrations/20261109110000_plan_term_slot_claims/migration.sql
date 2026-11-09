-- ═══════════════════════════════════════════════════════════════════════════
-- Hai cột CLAIM mới của job vòng đời gói (ADR 0085 điều 5 + 7, 09/11/2026).
--
-- 1. `grace_final_reminded_at` — lời nhắc cuối "còn 1 ngày ân hạn" đã gửi.
-- 2. `slots_applied_at` — suất trên chợ đã được áp cho kỳ này khi nó BẮT ĐẦU. Kỳ hạ bậc
--    (`change_next`) nối sau kỳ cũ nên lựa chọn xe giữ lại trên hoá đơn chỉ áp được lúc kỳ mới bắt
--    đầu; lượt kích hoạt một kỳ bắt đầu NGAY đã áp trong cùng transaction và ghi cột này luôn.
--
-- BACKFILL `slots_applied_at` cho MỌI dòng đã có: không kỳ nào trước ADR 0085 mang lựa chọn xe, và
-- để NULL thì job quét lại toàn bộ lịch sử thuê bao ở lượt đầu tiên (ADR 0085 điều 5 — không áp hồi tố).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."tenant_subscriptions" ADD COLUMN "grace_final_reminded_at" TIMESTAMPTZ(3);
ALTER TABLE "public"."tenant_subscriptions" ADD COLUMN "slots_applied_at" TIMESTAMPTZ(3);

UPDATE "public"."tenant_subscriptions" SET "slots_applied_at" = "created_at";

-- Đường quét của job: kỳ gói đã bắt đầu mà chưa áp suất — tập rất nhỏ nhờ backfill + ghi ở kích hoạt.
CREATE INDEX "tenant_subscriptions_slots_pending_idx"
  ON "public"."tenant_subscriptions" ("starts_at")
  WHERE "slots_applied_at" IS NULL;
