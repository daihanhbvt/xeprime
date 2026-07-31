-- ---------------------------------------------------------------------------
-- Index phục vụ endpoint ĐỌC audit log (Phase 7): feed toàn cục mới-nhất-trước
-- + lọc theo action. Các index cũ ([tenant_id, created_at], [actor_user_id,
-- created_at], [target_type, target_id]) không phủ hai query shape này.
-- ---------------------------------------------------------------------------
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
