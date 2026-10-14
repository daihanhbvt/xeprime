-- ═══════════════════════════════════════════════════════════════════════════
-- CHUẨN HOÁ `users.phone` VỀ DẠNG `84xxxxxxxxx` (14/10/2026, ADR 0060)
--
-- Từ ADR 0060, site khách và site partner đăng nhập CHỈ bằng số điện thoại + mật khẩu, và
-- `AuthService.loginWithPassword` tra `users.phone` bằng ĐÚNG dạng chuẩn `84xxxxxxxxx` — dạng mà
-- mọi đường ghi của app đều dùng (đăng ký, xác minh SĐT, đổi SĐT).
--
-- Seed demo trước bản này ghi SĐT ở dạng nội địa (`0902000001`), nên trên máy dev/staging đã seed
-- thì chủ xe, chủ gian hàng và nhân viên demo KHÔNG đăng nhập được bằng SĐT. Bản này đưa mọi hàng
-- dạng `0xxxxxxxxx` / `+84xxxxxxxxx` (kể cả có dấu cách/chấm/gạch) về `84xxxxxxxxx`. Seed đã sửa
-- để không ghi lại dạng cũ.
--
-- ───────────────────────────────────────────────────────────────────────────
-- KHÔNG ép khi đụng hàng
--
-- `users_realm_phone_key` là unique theo `(realm, phone)` CHÍNH XÁC từng ký tự, nên cùng một số có
-- thể đang nằm ở hai hàng của cùng realm dưới hai dạng (`0901…` và `84901…`). Hàng nào chuẩn hoá
-- xong sẽ trùng một hàng khác — đã có sẵn, hoặc cũng vừa được chuẩn hoá — thì ĐỂ NGUYÊN: gộp hai
-- tài khoản là quyết định của người vận hành, không phải của một migration. Hàng đó vẫn đăng nhập
-- được bằng Google/Facebook nếu đã nối, và hiện ra ở truy vấn kiểm tra cuối file.
--
-- ⚠️ CHẠY LẠI ĐƯỢC: hàng đã ở dạng chuẩn không khớp điều kiện nào.
-- ═══════════════════════════════════════════════════════════════════════════

WITH compacted AS (
    SELECT "id", "realm", "phone",
           regexp_replace("phone", '[[:space:].()-]', '', 'g') AS "compact"
    FROM "public"."users"
    WHERE "phone" IS NOT NULL
),
candidates AS (
    SELECT "id", "realm", "phone",
           CASE
               WHEN "compact" ~ '^\+84[0-9]{9}$' THEN '84' || substring("compact" FROM 4)
               WHEN "compact" ~ '^0[0-9]{9}$'    THEN '84' || substring("compact" FROM 2)
               WHEN "compact" ~ '^84[0-9]{9}$'   THEN "compact"
               ELSE NULL
           END AS "normalized"
    FROM compacted
)
UPDATE "public"."users" AS u
SET "phone" = c."normalized"
FROM candidates AS c
WHERE u."id" = c."id"
  AND c."normalized" IS NOT NULL
  AND c."normalized" <> c."phone"
  -- Đã có một hàng KHÁC mang dạng chuẩn của số này trong cùng realm.
  AND NOT EXISTS (
      SELECT 1 FROM "public"."users" AS o
      WHERE o."realm" = c."realm" AND o."phone" = c."normalized" AND o."id" <> c."id"
  )
  -- Hai hàng cùng chuẩn hoá về MỘT số trong cùng realm — không chọn bên nào.
  AND NOT EXISTS (
      SELECT 1 FROM candidates AS d
      WHERE d."realm" = c."realm" AND d."normalized" = c."normalized" AND d."id" <> c."id"
  );

-- Kiểm tra sau khi chạy (không đổi dữ liệu) — hàng còn lại là hàng đụng số, cần người xử lý:
--   SELECT "realm", "id", "phone" FROM "public"."users"
--   WHERE "phone" IS NOT NULL AND "phone" !~ '^84[0-9]{9}$' AND "deleted_at" IS NULL;
