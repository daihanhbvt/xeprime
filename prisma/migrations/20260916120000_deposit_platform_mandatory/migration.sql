-- ═══════════════════════════════════════════════════════════════════════════
-- CẢ SÀN THU CỌC — bật công tắc của MỌI gian hàng (16/09/2026)
--
-- Luật đang áp dụng nằm ở `DEPOSIT_COLLECTION_PLATFORM_MANDATORY` (packages/types): trong giai
-- đoạn này `DepositPolicyService` trả `required: true` cho mọi tuyến và mọi gói, nên về mặt
-- HÀNH VI migration này không đổi gì cả.
--
-- Vậy vì sao vẫn phải chạy nó: vì cái ngày hằng đó về `false`.
--
-- `deposit_collection_enabled` mặc định `false`, và `DepositPolicyService.toggleEnabledFor` đọc
-- "vắng dòng = tắt". Nếu không ghi gì ở đây thì đúng vào lúc mở lại công tắc, toàn bộ gian hàng
-- chưa từng bấm nút sẽ lặng lẽ NGỪNG thu cọc — một thay đổi về tiền của khách mà không ai ra
-- quyết định, không ai được báo, và chỉ lộ ra ở màn đối soát vài ngày sau. Ghi `true` ngay bây
-- giờ biến ngày đó thành một thao tác không có tác dụng phụ.
--
-- Hai chi tiết cố ý:
--
--   * `updated_by` để NULL — không có con người nào bấm nút này. Cột đó là dấu vết trách nhiệm
--     cá nhân (xem docblock của `updateSettings`), gán bừa một admin vào đó là làm hỏng chính
--     thứ nó tồn tại để trả lời.
--   * `ON CONFLICT … DO UPDATE` chứ không `DO NOTHING`: gian hàng đã từng TẮT công tắc cũng
--     phải về `true`, vì quyết định của giai đoạn này là cả sàn thu — không có ngoại lệ nào.
--     Giá trị cũ của họ vẫn đọc lại được ở `audit_logs`.
--
-- Idempotent: chạy lại chỉ ghi đè bằng đúng giá trị đang có.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO "public"."tenant_payment_settings" (
    "tenant_id", "deposit_collection_enabled", "updated_by", "created_at", "updated_at"
)
SELECT t."id", TRUE, NULL, now(), now()
  FROM "public"."tenants" t
    ON CONFLICT ("tenant_id") DO UPDATE
   SET "deposit_collection_enabled" = TRUE,
       "updated_at"                 = now();
