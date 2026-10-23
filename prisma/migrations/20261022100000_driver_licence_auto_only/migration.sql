-- ADR 0066 — bằng lái khách chỉ còn TỰ QUYẾT, gỡ hàng đợi duyệt tay của ADR 0057.
--
--   • Thêm lý do từ chối `reader_unavailable` (bộ đọc lỗi/tắt — khách nộp lại).
--   • Đóng mọi lượt còn `pending_review` thành `rejected` + `reader_unavailable`: không còn ai
--     duyệt chúng, để nguyên là khách kẹt vĩnh viễn ở "chờ xem xét". Khách nộp lại thì bộ đọc
--     quyết theo luật mới. Bằng `verified` hiện có KHÔNG bị chạm.
--   • DB từ chối `pending_review` từ nay; partial unique "đang dở" bỏ giá trị đó.

ALTER TABLE "customer_driver_licences" DROP CONSTRAINT "customer_driver_licences_rejection_reason_check";
ALTER TABLE "customer_driver_licences" ADD CONSTRAINT "customer_driver_licences_rejection_reason_check" CHECK (
    "rejection_reason" IS NULL OR "rejection_reason" IN (
        'not_a_licence', 'back_side', 'unreadable', 'missing_fields', 'expired', 'no_drivable_class',
        'reader_unavailable', 'other'
    )
);

UPDATE "customer_driver_licences"
SET "status" = 'rejected',
    "rejection_reason" = 'reader_unavailable',
    "decision_source" = 'auto',
    "decided_at" = now(),
    "updated_at" = now()
WHERE "status" = 'pending_review';

ALTER TABLE "customer_driver_licences" DROP CONSTRAINT "customer_driver_licences_status_check";
ALTER TABLE "customer_driver_licences" ADD CONSTRAINT "customer_driver_licences_status_check" CHECK (
    "status" IN ('uploading', 'processing', 'verified', 'rejected', 'superseded', 'cancelled')
);

DROP INDEX "customer_driver_licences_one_in_flight_key";
CREATE UNIQUE INDEX "customer_driver_licences_one_in_flight_key"
    ON "customer_driver_licences"("user_id")
    WHERE "status" IN ('uploading', 'processing');
