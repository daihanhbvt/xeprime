-- ═══════════════════════════════════════════════════════════════════════════
-- Ô từ khoá ở trang /search: tìm xe theo tên xe / hãng / model và theo TÊN CÔNG KHAI của chủ
-- xe (cá nhân) hoặc gian hàng.
--
-- Ô này từng bị gỡ (17/08) vì `ILIKE '%…%'` trần không ra xe khi khách gõ không dấu ("nguyen"
-- ≠ "Nguyễn") hay tách chữ–số ("vf 8" ≠ "VF8"). Migration này đưa về một dạng GẤP SẴN ở DB:
--
--   1. `xeprime_search_fold(text)`     — bản SINH ĐÔI của `foldSearchText()` ở @xeprime/domain
--                                         (packages/domain/src/search-text.ts). Bảng translate
--                                         dưới đây SINH TỪ bảng TS (`searchFoldTranslateTable`);
--                                         `apps/api/test/marketplace-keyword-search.spec.ts` chạy
--                                         cả hai trên cùng bộ mẫu.
--   2. `xeprime_search_document(text…)` — chuỗi để so: các từ đã gấp, kèm dạng VIẾT LIỀN của
--                                         từng cặp/bộ ba từ kề nhau ("sai gon" → "saigon"), mở
--                                         đầu bằng một dấu cách để phép khớp ĐẦU TỪ là
--                                         `LIKE '% <từ>%'` cho cả từ đầu tiên.
--   3. Ba cột dẫn xuất — `public_listings.search_text`, `tenants.search_name`,
--      `users.search_name` — do TRIGGER ghi. Ứng dụng không bao giờ ghi chúng: tên gian hàng và
--      tên tài khoản có hàng chục đường sửa, một trigger là nơi duy nhất không thể bị quên.
--   4. Index GIN trigram cho cả ba — `LIKE '% vf%'` dùng được trigram đầu từ.
--
-- Vì sao không dùng `unaccent`: nó STABLE (không index được trực tiếp), phụ thuộc file từ điển
-- trên máy chủ, và không có bản TS tương ứng để gấp từ khoá phía ứng dụng.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Gấp chuỗi ───────────────────────────────────────────────────────────
-- Thứ tự: NFC → translate (chữ hoa ASCII + chữ có dấu → chữ thường không dấu, KHÔNG qua
-- `lower()` vì nó phụ thuộc ctype) → tách chữ↔số → mọi ký tự ngoài [a-z0-9] thành dấu cách.
-- `COLLATE "C"` để khoảng [a-z] là khoảng MÃ KÝ TỰ, không phải thứ tự sắp xếp của locale.
CREATE FUNCTION "xeprime_search_fold"(raw text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          translate(
            normalize(raw, NFC),
            'ABCDEFGHIJKLMNOPQRSTUVWXYZàÀáÁảẢãÃạẠăĂằẰắẮẳẲẵẴặẶâÂầẦấẤẩẨẫẪậẬèÈéÉẻẺẽẼẹẸêÊềỀếẾểỂễỄệỆìÌíÍỉỈĩĨịỊòÒóÓỏỎõÕọỌôÔồỒốỐổỔỗỖộỘơƠờỜớỚởỞỡỠợỢùÙúÚủỦũŨụỤưƯừỪứỨửỬữỮựỰỳỲýÝỷỶỹỸỵỴđĐ',
            'abcdefghijklmnopqrstuvwxyzaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaeeeeeeeeeeeeeeeeeeeeeeiiiiiiiiiioooooooooooooooooooooooooooooooooouuuuuuuuuuuuuuuuuuuuuuyyyyyyyyyydd'
          ) COLLATE "C",
          '([a-z])([0-9])', '\1 \2', 'g'),
        '([0-9])([a-z])', '\1 \2', 'g'),
      '[^a-z0-9]+', ' ', 'g')
  )
$$;

-- ── 2. Chuỗi để so ─────────────────────────────────────────────────────────
-- "Sài Gòn Car" → " sai gon car saigon goncar saigoncar" — từ đơn, rồi cặp kề nhau, rồi bộ ba
-- kề nhau. Khách gõ "saigon", "hanoi", "hochiminh" vẫn ra "Sài Gòn", "Hà Nội", "Hồ Chí Minh".
--
-- Nhận NHIỀU phần (tên xe, hãng, model): cặp/bộ ba chỉ ghép TRONG một phần — ghép qua ranh giới
-- hai trường chỉ đẻ ra chữ vô nghĩa ("2019toyota"). Mỗi chữ chỉ giữ một lần: tên xe thường đã
-- chứa sẵn hãng và model.
CREATE FUNCTION "xeprime_search_document"(VARIADIC parts text[]) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  WITH w AS (
    SELECT p.pi, t.word, t.ord
    FROM unnest(parts) WITH ORDINALITY AS p(part, pi)
    CROSS JOIN LATERAL unnest(string_to_array("xeprime_search_fold"(coalesce(p.part, '')), ' '))
      WITH ORDINALITY AS t(word, ord)
    WHERE t.word <> ''
  ),
  terms AS (
    SELECT word AS term, 1 AS grp, pi, ord FROM w
    UNION ALL
    SELECT a.word || b.word, 2, a.pi, a.ord
    FROM w a JOIN w b ON b.pi = a.pi AND b.ord = a.ord + 1
    UNION ALL
    SELECT a.word || b.word || c.word, 3, a.pi, a.ord
    FROM w a
    JOIN w b ON b.pi = a.pi AND b.ord = a.ord + 1
    JOIN w c ON c.pi = a.pi AND c.ord = a.ord + 2
  ),
  firsts AS (
    SELECT DISTINCT ON (term) term, grp, pi, ord FROM terms ORDER BY term, grp, pi, ord
  )
  SELECT coalesce(' ' || string_agg(term, ' ' ORDER BY grp, pi, ord), '') FROM firsts
$$;

-- ── 3. Cột dẫn xuất + trigger ──────────────────────────────────────────────
ALTER TABLE "public_listings" ADD COLUMN "search_text" TEXT NOT NULL DEFAULT '';
ALTER TABLE "tenants" ADD COLUMN "search_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN "search_name" TEXT NOT NULL DEFAULT '';

-- Cột dẫn xuất có trong `UPDATE OF`: ai ghi thẳng vào nó cũng bị tính đè lại — nguồn sự thật
-- duy nhất là cột gốc.
CREATE FUNCTION "xeprime_public_listings_search_text"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."search_text" := "xeprime_search_document"(NEW."title", NEW."brand", NEW."model");
  RETURN NEW;
END $$;

CREATE TRIGGER "public_listings_search_text"
  BEFORE INSERT OR UPDATE OF "title", "brand", "model", "search_text" ON "public_listings"
  FOR EACH ROW EXECUTE FUNCTION "xeprime_public_listings_search_text"();

CREATE FUNCTION "xeprime_tenants_search_name"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."search_name" := "xeprime_search_document"(NEW."name");
  RETURN NEW;
END $$;

CREATE TRIGGER "tenants_search_name"
  BEFORE INSERT OR UPDATE OF "name", "search_name" ON "tenants"
  FOR EACH ROW EXECUTE FUNCTION "xeprime_tenants_search_name"();

CREATE FUNCTION "xeprime_users_search_name"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."search_name" := "xeprime_search_document"(NEW."display_name");
  RETURN NEW;
END $$;

CREATE TRIGGER "users_search_name"
  BEFORE INSERT OR UPDATE OF "display_name", "search_name" ON "users"
  FOR EACH ROW EXECUTE FUNCTION "xeprime_users_search_name"();

-- Nạp cho dữ liệu sẵn có — chính phép tính của trigger, không qua một đường thứ hai.
UPDATE "public_listings"
  SET "search_text" = "xeprime_search_document"("title", "brand", "model");
UPDATE "tenants" SET "search_name" = "xeprime_search_document"("name");
UPDATE "users" SET "search_name" = "xeprime_search_document"("display_name");

-- ── 4. Index ───────────────────────────────────────────────────────────────
CREATE INDEX "public_listings_search_text_trgm_idx"
  ON "public_listings" USING GIN ("search_text" gin_trgm_ops);
CREATE INDEX "tenants_search_name_trgm_idx" ON "tenants" USING GIN ("search_name" gin_trgm_ops);
CREATE INDEX "users_search_name_trgm_idx" ON "users" USING GIN ("search_name" gin_trgm_ops);
