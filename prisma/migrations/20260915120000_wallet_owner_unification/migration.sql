-- ═══════════════════════════════════════════════════════════════════════════
-- VÍ HỢP NHẤT: chủ xe có MỘT ví, thuộc TENANT (15/09/2026)
--
-- Trước đợt này một chủ xe tuyến hoa hồng có HAI sổ không bao giờ gặp nhau:
--   • ví `user`   — tiền hoàn khi chính họ đi thuê xe
--   • ví `tenant` — khoản XePrime phải trả cho chuyến họ cho thuê
-- Hai số dư, hai danh sách tài khoản ngân hàng, hai hàng đợi rút tay cho cùng một con người.
--
-- Quyết định sản phẩm: ví thuộc TENANT từ lúc người đó trở thành chủ xe, và nó giữ nguyên khi họ
-- nâng lên gói — không tạo ví mới, không chuyển tiền lần thứ hai.
--
-- ───────────────────────────────────────────────────────────────────────────
-- BA NHÁNH, mỗi nhánh có ĐIỀU KIỆN TIỀN ĐỀ kiểm được, không nhánh nào dựa vào
-- "chắc unique sẽ cho qua":
--
--   (a) chỉ có ví user            → MỘT UPDATE đổi chủ. Dùng được vì `wallets.id` KHÔNG đổi,
--                                    nên mọi tham chiếu (dòng sổ, lệnh rút, `hold_refunds.
--                                    wallet_entry_id`) vẫn đúng mà không phải sửa gì.
--   (b) chỉ có ví tenant          → không làm gì.
--   (c) có CẢ HAI                 → gộp: chuyển dòng sổ + lệnh rút + `pending`, TÍNH LẠI
--                                    `balance_after`, rồi xoá vỏ rỗng dưới một guard.
--
-- Nhánh (c) KHÔNG sinh dòng ghi có giả để chuyển số dư. Nó chuyển chính dòng sổ và giữ nguyên
-- `id`/`kind`/`source_type`/`source_ref_id`/`amount`/`created_at` — nguồn gốc từng dòng còn
-- nguyên, và mọi tham chiếu theo `wallet_entries.id` vẫn trỏ đúng.
--
-- `balance_after` PHẢI tính lại vì nó là ảnh chụp số dư của ví CŨ tại thời điểm đó; để nguyên
-- thì chuỗi trong ví gộp không còn đơn điệu và phép đối chiếu lệch ví — đúng thứ mà cột đó sinh
-- ra để phát hiện — sẽ báo động giả mãi mãi. Đây là sửa một giá trị SUY RA, không phải viết lại
-- lịch sử: sự thật của sổ nằm ở `amount`.
--
-- ───────────────────────────────────────────────────────────────────────────
-- CHỨNG MINH TIỀN KHÔNG ĐỔI
-- Tổng nghĩa vụ = SUM(balance + pending_withdraw_amount) trên toàn hệ thống, đo bằng NUMERIC
-- trước và sau. Lệch một đồng ⇒ RAISE EXCEPTION ⇒ cả migration rollback.
-- Kiểm thêm: tổng theo TỪNG CHỦ MỚI, và SUM(amount) của dòng sổ từng ví phải khớp số dư.
--
-- ⚠️ Migration này CHẠY LẠI ĐƯỢC: sau lượt đầu, không user nào còn ví `user` kèm vai
-- `shop_owner`, nên vòng lặp không tìm thấy ứng viên nào và mọi phép kiểm vẫn đạt.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Khoá ngoại: Cascade → Restrict ──────────────────────────────────────
--
-- `wallets.owner_*` đang là ON DELETE CASCADE, và `wallet_entries`/`withdrawal_requests` cascade
-- tiếp từ `wallets`. Nghĩa là một `DELETE` cứng trên `tenants` hoặc `users` xoá sạch số dư, sổ
-- cái và lệnh rút mà không để lại vết nào — trên một SỔ CÔNG NỢ PHẢI TRẢ.
--
-- Chưa ai bấm đường đó (xoá tài khoản đi qua support case), nhưng `prisma/src/cleanup-test-data.ts`
-- gọi thẳng `deleteMany` trên cả hai bảng, và staging sẽ được dọn. Đổi TRƯỚC khi gộp ví, vì từ
-- sau bước 2 mọi số dư đều nằm sau khoá ngoại tenant.
--
-- `withdrawal_requests.requested_by_user_id` đã dùng NO ACTION từ đầu — nguyên tắc có sẵn, chỉ
-- chưa áp cho chuỗi ví.
ALTER TABLE "public"."wallets" DROP CONSTRAINT IF EXISTS "wallets_owner_user_fkey";
ALTER TABLE "public"."wallets"
    ADD CONSTRAINT "wallets_owner_user_fkey"
    FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."wallets" DROP CONSTRAINT IF EXISTS "wallets_owner_tenant_fkey";
ALTER TABLE "public"."wallets"
    ADD CONSTRAINT "wallets_owner_tenant_fkey"
    FOREIGN KEY ("owner_tenant_id") REFERENCES "public"."tenants"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 2. Gộp ví ──────────────────────────────────────────────────────────────
DO $$
DECLARE
    total_before   NUMERIC(18, 2);
    total_after    NUMERIC(18, 2);
    entries_before BIGINT;
    entries_after  BIGINT;
    cand           RECORD;
    tenant_wallet  RECORD;
    moved          INT := 0;
    reparented     INT := 0;
    merged         INT := 0;
    banks_moved    INT := 0;
    banks_archived INT := 0;
    bank_step      INT := 0;
    skew_before    BIGINT;
    skew_after     BIGINT;
BEGIN
    SELECT COALESCE(SUM("balance" + "pending_withdraw_amount"), 0) INTO total_before FROM "public"."wallets";
    SELECT COUNT(*) INTO entries_before FROM "public"."wallet_entries";
    /*
     * Đếm ví ĐANG lệch sổ trước khi làm gì.
     *
     * Bất biến đúng của mô hình là `SUM(wallet_entries.amount) = balance + pending_withdraw_amount`
     * (rút tiền khoá `balance` sang `pending` mà KHÔNG ghi dòng nào; dòng âm chỉ xuất hiện lúc
     * thật sự chi). Đo trước rồi so sau, thay vì đòi 0 tuyệt đối: một dòng lệch có sẵn từ trước
     * là việc phải điều tra riêng, và để nó chặn cả lần deploy này là đổi một lỗi cũ lấy một sự
     * cố mới.
     */
    SELECT COUNT(*) INTO skew_before FROM "public"."wallets" w
    LEFT JOIN (SELECT "wallet_id", SUM("amount") AS s FROM "public"."wallet_entries" GROUP BY 1) e
        ON e."wallet_id" = w."id"
    WHERE COALESCE(e.s, 0) <> w."balance" + w."pending_withdraw_amount";

    /*
     * Ứng viên: user đang là `shop_owner` HOẠT ĐỘNG và đang có ví `user`.
     *
     * Chọn membership CŨ NHẤT khi một người sở hữu nhiều tenant — cùng thứ tự với
     * `AuthService.me()` và `TenantScopeGuard` (`ORDER BY created_at ASC`). Chọn khác đi sẽ đặt
     * ví vào một tenant mà phiên của họ không bao giờ scope tới, và màn ví sẽ hiện số 0 trong
     * khi tiền nằm ở chỗ khác. `registerShop` chặn membership thứ hai, nên đây là đường của dữ
     * liệu do admin tạo.
     */
    FOR cand IN
        SELECT w."id" AS user_wallet_id,
               w."owner_user_id" AS user_id,
               w."balance" AS u_balance,
               w."pending_withdraw_amount" AS u_pending,
               w."status" AS u_status,
               (
                   SELECT m."tenant_id"
                   FROM "public"."tenant_memberships" m
                   JOIN "public"."tenants" t ON t."id" = m."tenant_id"
                   WHERE m."user_id" = w."owner_user_id"
                     AND m."status" = 'active'
                     AND m."role_key" = 'shop_owner'
                     AND t."deleted_at" IS NULL
                   ORDER BY m."created_at" ASC
                   LIMIT 1
               ) AS tenant_id
        FROM "public"."wallets" w
        WHERE w."owner_type" = 'user'
        ORDER BY w."id"
    LOOP
        CONTINUE WHEN cand.tenant_id IS NULL;   -- khách thuê thuần: ví ở lại với user (đúng)

        SELECT "id", "balance", "pending_withdraw_amount", "status"
        INTO tenant_wallet
        FROM "public"."wallets"
        WHERE "owner_tenant_id" = cand.tenant_id;

        IF NOT FOUND THEN
            -- ── (a) Tenant CHƯA có ví: đổi chủ bằng một câu lệnh ───────────
            --
            -- Một UPDATE duy nhất đặt cả ba cột, nên CHECK owner XOR (kiểm theo TỪNG CÂU LỆNH)
            -- không bao giờ thấy hàng ở trạng thái nửa vời. `id` không đổi ⇒ dòng sổ, lệnh rút
            -- và `hold_refunds.wallet_entry_id` không phải sửa gì.
            --
            -- `WHERE NOT EXISTS` lặp lại điều kiện tiền đề ngay trong câu lệnh: nếu một tiến
            -- trình khác vừa tạo ví tenant, câu này khớp 0 hàng và vòng lặp báo lỗi ở dưới thay
            -- vì đâm vào unique.
            UPDATE "public"."wallets"
            SET "owner_type"      = 'tenant',
                "owner_tenant_id" = cand.tenant_id,
                "owner_user_id"   = NULL,
                "updated_at"      = now()
            WHERE "id" = cand.user_wallet_id
              AND NOT EXISTS (
                  SELECT 1 FROM "public"."wallets" x WHERE x."owner_tenant_id" = cand.tenant_id
              );

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Ví % không đổi chủ được sang tenant % (ví tenant xuất hiện giữa chừng)',
                    cand.user_wallet_id, cand.tenant_id;
            END IF;
            reparented := reparented + 1;

        ELSE
            -- ── (c) Tenant ĐÃ có ví: gộp ──────────────────────────────────
            --
            -- Thứ tự cố ý: chuyển sổ trước, chuyển tiền sau, xoá vỏ cuối. Mỗi bước tự kiểm
            -- được, và nếu dừng giữa chừng thì transaction rollback toàn bộ.

            -- c1. Dòng sổ đổi ví. Giữ nguyên id ⇒ `reversal_of_entry_id` và
            --     `hold_refunds.wallet_entry_id` vẫn trỏ đúng. Khoá chống cộng đôi
            --     `(wallet, kind, source_type, source_ref)` không thể va: một hold sinh dòng ở
            --     ví khách với `kind = hold_refund` và ở ví chủ với `hold_release`/`hold_forfeit`,
            --     không bao giờ trùng `kind`.
            UPDATE "public"."wallet_entries"
            SET "wallet_id" = tenant_wallet.id
            WHERE "wallet_id" = cand.user_wallet_id;
            GET DIAGNOSTICS moved = ROW_COUNT;

            -- c2. Lệnh rút đổi ví — gồm cả `pending`/`approved` đang khoá tiền. Thông tin ngân
            --     hàng trên lệnh là SNAPSHOT và KHÔNG đụng tới: admin vẫn chuyển đúng tài khoản
            --     mà người dùng đã khai lúc tạo lệnh.
            UPDATE "public"."withdrawal_requests"
            SET "wallet_id" = tenant_wallet.id
            WHERE "wallet_id" = cand.user_wallet_id;

            -- c3. Tiền cộng sang. `pending` đi riêng khỏi `balance` vì hai cột trả lời hai câu
            --     khác nhau (khả dụng / đang khoá bởi lệnh rút) và tổng nghĩa vụ là tổng của cả
            --     hai. Ví đóng băng ở BẤT KỲ bên nào ⇒ ví gộp đóng băng: gộp không được phép trở
            --     thành một cách âm thầm mở lại đường ra mà admin đã khoá.
            UPDATE "public"."wallets"
            SET "balance"                 = "balance" + cand.u_balance,
                "pending_withdraw_amount" = "pending_withdraw_amount" + cand.u_pending,
                "status"                  = CASE
                                                WHEN "status" = 'frozen' OR cand.u_status = 'frozen'
                                                THEN 'frozen' ELSE "status"
                                            END,
                "updated_at"              = now()
            WHERE "id" = tenant_wallet.id;

            -- c3b. Rút cạn vỏ. Phải là một câu RIÊNG và phải chạy: thiếu nó thì tổng nghĩa vụ
            --      toàn hệ thống tăng đúng bằng số vừa cộng — tiền tự nhân đôi. Guard ở c4 bắt
            --      được việc quên, nhưng để nó bắt là đã sai rồi.
            UPDATE "public"."wallets"
            SET "balance" = 0, "pending_withdraw_amount" = 0, "updated_at" = now()
            WHERE "id" = cand.user_wallet_id;

            -- c4. Vỏ rỗng biến mất — CHỈ khi thật sự rỗng.
            --     Guard này là thứ ngăn `ON DELETE CASCADE` (vẫn còn ở `wallet_entries`,
            --     `withdrawal_requests`) xoá mất một dòng mà c1/c2 lỡ bỏ sót.
            DELETE FROM "public"."wallets" w
            WHERE w."id" = cand.user_wallet_id
              AND w."balance" = 0
              AND w."pending_withdraw_amount" = 0
              AND NOT EXISTS (SELECT 1 FROM "public"."wallet_entries" e WHERE e."wallet_id" = w."id")
              AND NOT EXISTS (SELECT 1 FROM "public"."withdrawal_requests" r WHERE r."wallet_id" = w."id");

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Ví user % chưa rỗng sau khi gộp sang %, không xoá',
                    cand.user_wallet_id, tenant_wallet.id;
            END IF;

            -- c5. `balance_after` tính lại theo thứ tự thời gian của ví ĐÍCH.
            --     Chỉ chạy cho ví vừa bị gộp vào, không quét toàn bảng.
            WITH ordered AS (
                SELECT "id",
                       SUM("amount") OVER (
                           ORDER BY "created_at", "id"
                           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                       ) AS running
                FROM "public"."wallet_entries"
                WHERE "wallet_id" = tenant_wallet.id
            )
            UPDATE "public"."wallet_entries" e
            SET "balance_after" = o.running
            FROM ordered o
            WHERE e."id" = o."id";

            merged := merged + 1;
            RAISE NOTICE 'gộp ví: user % (% dòng) → tenant %', cand.user_id, moved, cand.tenant_id;
        END IF;

        -- ── Tài khoản ngân hàng đi theo chủ ví ─────────────────────────────
        --
        -- Không chuyển thì chủ xe mở màn rút tiền và thấy ô chọn RỖNG, dù họ đã khai số tài
        -- khoản từ lâu — `resolveForPayout` chỉ nhận tài khoản cùng chủ với ví.
        --
        -- Trùng số (tenant đã có đúng tài khoản đó) ⇒ `archived` thay vì chuyển, vì partial
        -- unique `(chủ, bank_code, account_number) WHERE active` cấm hai bản giống hệt nhau.
        UPDATE "public"."bank_accounts" b
        SET "status" = 'archived', "updated_at" = now()
        WHERE b."owner_user_id" = cand.user_id
          AND b."owner_type" = 'user'
          AND b."status" = 'active'
          AND EXISTS (
              SELECT 1 FROM "public"."bank_accounts" t
              WHERE t."owner_tenant_id" = cand.tenant_id
                AND t."owner_type" = 'tenant'
                AND t."status" = 'active'
                AND t."bank_code" = b."bank_code"
                AND t."account_number" = b."account_number"
          );
        GET DIAGNOSTICS bank_step = ROW_COUNT;
        banks_archived := banks_archived + bank_step;

        -- `is_default` chỉ giữ khi tenant CHƯA có mặc định — partial unique cho đúng một.
        UPDATE "public"."bank_accounts" b
        SET "owner_type"      = 'tenant',
            "owner_tenant_id" = cand.tenant_id,
            "owner_user_id"   = NULL,
            "is_default"      = b."is_default" AND NOT EXISTS (
                SELECT 1 FROM "public"."bank_accounts" d
                WHERE d."owner_tenant_id" = cand.tenant_id
                  AND d."owner_type" = 'tenant'
                  AND d."is_default"
                  AND d."status" = 'active'
            ),
            "updated_at"      = now()
        WHERE b."owner_user_id" = cand.user_id
          AND b."owner_type" = 'user'
          AND b."status" = 'active';
        GET DIAGNOSTICS bank_step = ROW_COUNT;
        banks_moved := banks_moved + bank_step;
    END LOOP;

    -- ── 3. Đối soát ────────────────────────────────────────────────────────
    SELECT COALESCE(SUM("balance" + "pending_withdraw_amount"), 0) INTO total_after FROM "public"."wallets";
    SELECT COUNT(*) INTO entries_after FROM "public"."wallet_entries";

    IF total_after <> total_before THEN
        RAISE EXCEPTION 'TỔNG NGHĨA VỤ LỆCH: trước % — sau %. Rollback.', total_before, total_after;
    END IF;
    IF entries_after <> entries_before THEN
        RAISE EXCEPTION 'SỐ DÒNG SỔ LỆCH: trước % — sau %. Gộp ví không được tạo hay xoá dòng nào.',
            entries_before, entries_after;
    END IF;

    -- Số dư từng ví phải bằng tổng dòng sổ của chính nó cộng phần đang bị khoá bởi lệnh rút.
    -- So với mốc ĐO TRƯỚC: gộp ví không được làm sinh thêm ví lệch nào.
    SELECT COUNT(*) INTO skew_after FROM "public"."wallets" w
    LEFT JOIN (SELECT "wallet_id", SUM("amount") AS s FROM "public"."wallet_entries" GROUP BY 1) e
        ON e."wallet_id" = w."id"
    WHERE COALESCE(e.s, 0) <> w."balance" + w."pending_withdraw_amount";

    IF skew_after > skew_before THEN
        RAISE EXCEPTION 'GỘP VÍ LÀM LỆCH SỔ: % ví lệch trước, % sau. Rollback.', skew_before, skew_after;
    END IF;
    IF skew_before > 0 THEN
        RAISE WARNING 'CÓ SẴN % ví lệch sổ từ TRƯỚC migration — cần đối soát riêng, không do đợt này.',
            skew_before;
    END IF;

    -- Bất biến sản phẩm: chủ xe KHÔNG còn ví `user` nào.
    IF EXISTS (
        SELECT 1 FROM "public"."wallets" w
        JOIN "public"."tenant_memberships" m ON m."user_id" = w."owner_user_id"
        JOIN "public"."tenants" t ON t."id" = m."tenant_id"
        WHERE w."owner_type" = 'user'
          AND m."status" = 'active' AND m."role_key" = 'shop_owner' AND t."deleted_at" IS NULL
    ) THEN
        RAISE EXCEPTION 'Còn chủ xe mang ví user sau migration — bất biến "một người một ví" chưa đạt.';
    END IF;

    RAISE NOTICE 'ví hợp nhất: % đổi chủ, % gộp, % tài khoản NH chuyển, % lưu trữ. Tổng nghĩa vụ %đ (không đổi).',
        reparented, merged, banks_moved, banks_archived, total_after;
END $$;
