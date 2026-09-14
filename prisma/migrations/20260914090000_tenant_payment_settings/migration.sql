-- ═══════════════════════════════════════════════════════════════════════════
-- Công tắc thu cọc của gian hàng — `tenant_payment_settings`
-- (14/09/2026 — Phase 6, ADR 0032 điều 2 · ADR 0027 điều 2 · ADR 0025 ràng buộc 4)
--
-- ## Vì sao một BẢNG chứ không phải một khoá trong `tenant_profiles.settings_json`
--
-- Cột này quyết định XePrime có nhận tiền của khách hay không. Một cấu hình như vậy phải có
-- kiểu, có mặc định do database bảo đảm, và có dấu vết ai đổi lúc nào — ba thứ mà một khoá
-- trong jsonb không có. Thêm nữa, `DepositPolicyService` đọc nó ở đường duyệt yêu cầu (nóng),
-- và đọc một khoá jsonb ở đó là mời một `->>` không index vào đường tiền.
--
-- ## Mặc định TẮT, và đó là mặc định an toàn
--
-- Gian hàng tuyến gói mới lên sàn KHÔNG tự nhiên bắt khách chuyển tiền cho một bên thứ ba. Bật
-- là một hành động có chủ ý của chủ gian hàng, sau khi họ đọc giải thích. Tuyến hoa hồng không
-- đọc bảng này chút nào — ở đó cọc là BẮT BUỘC theo ADR 0032 điều 2 và không công tắc nào tắt
-- được; `DepositPolicyService` trả `required = true` trước khi chạm tới bảng.
--
-- ## Không backfill
--
-- Vắng dòng = tắt. Chèn sẵn một dòng `false` cho mọi tenant chỉ tạo ra rác có cùng ý nghĩa với
-- việc không có dòng, và làm mất khả năng phân biệt "chưa ai từng mở màn này" với "đã mở và
-- chọn tắt" (`updated_by` NULL vs có giá trị).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE "public"."tenant_payment_settings" (
    "tenant_id"                  CHAR(26)     NOT NULL,
    -- Gian hàng có muốn XePrime thu cọc `D` hộ mình không. Chỉ có nghĩa ở tuyến GÓI.
    "deposit_collection_enabled" BOOLEAN      NOT NULL DEFAULT false,
    -- Ai bấm lần cuối. NULL = chưa ai từng lưu (dòng sinh ra bởi lần đọc đầu tiên thì không có
    -- — service không tự tạo dòng khi đọc, xem `DepositPolicyService`).
    "updated_by"                 CHAR(26),
    "created_at"                 TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
    -- KHÔNG có DEFAULT: Prisma quản `@updatedAt` ở tầng client, và một DEFAULT ở đây sẽ che mất
    -- một đường ghi thô nào đó quên cập nhật cột. Cùng khuôn với `bank_accounts`/`wallets`.
    "updated_at"                 TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenant_payment_settings_pkey" PRIMARY KEY ("tenant_id")
);

-- Xoá gian hàng thì cấu hình thu tiền của nó không còn nghĩa gì — CASCADE, không để dòng mồ côi.
ALTER TABLE "public"."tenant_payment_settings"
    ADD CONSTRAINT "tenant_payment_settings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- `updated_by` trỏ tới người thật; SET NULL chứ không CASCADE — nhân viên nghỉ việc và bị xoá
-- tài khoản không được phép xoá mất cấu hình thu tiền của gian hàng.
ALTER TABLE "public"."tenant_payment_settings"
    ADD CONSTRAINT "tenant_payment_settings_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
