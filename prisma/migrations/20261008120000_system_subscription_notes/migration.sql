-- Dòng thuê bao do HỆ THỐNG tạo (created_by IS NULL) từng mang ghi chú tiếng Việt viết cứng, kèm
-- số hiệu ADR — chữ của người viết code, lọt ra lịch sử gói mà người vận hành đọc, và vẫn là
-- tiếng Việt trên giao diện tiếng Anh (ADR 0012). Từ 08/10/2026 dòng hệ thống không ghi chú chữ:
-- giao diện nói nguồn gốc kỳ bằng `origin` (`subscriptionOriginOf`) và tự dịch.
--
-- Chỉ chạm đúng các câu hệ thống đã từng ghi, và chỉ ở dòng không có người tạo — ghi chú admin
-- gõ tay (số chứng từ, lý do tặng…) giữ nguyên.
UPDATE "tenant_subscriptions"
SET "note" = NULL
WHERE "created_by" IS NULL
  AND "note" IN (
    'Gói mặc định khi mở gian hàng (ADR 0015 điều 9).',
    'Gói mặc định khi mở gian hàng',
    'Tự chuyển về tuyến hoa hồng khi gói hết hạn + ân hạn (job vòng đời — ADR 0020 điều 5).'
  );
