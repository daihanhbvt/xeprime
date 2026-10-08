-- Trang Nhật ký hệ thống tìm theo ULID: `id = X OR target_id = X OR tenant_id = X OR
-- actor_user_id = X`. Ba cột còn lại đã có chỉ mục mở đầu bằng chính nó; `target_id` chỉ nằm ở
-- vị trí thứ hai của `(target_type, target_id)`, nên thiếu nó là cả phép OR rơi về quét toàn bảng
-- (cả câu đếm lẫn câu lấy trang).
CREATE INDEX "audit_logs_target_id_idx" ON "public"."audit_logs" ("target_id");
