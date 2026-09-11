-- ═══════════════════════════════════════════════════════════════════════════
-- Huy hiệu: tín hiệu có SỐ HIỆU, không còn dựa vào mốc thời gian (11/09/2026)
--
-- `20260911170000_badge_projection` cho worker xoá tín hiệu bằng cách so `dirty_at` với mốc nó
-- đã đọc. Cách đó có một lỗ: `timestamptz(3)` chỉ mịn tới mili-giây, nên hai sự kiện rơi vào
-- CÙNG một mili-giây và nằm hai bên lượt `SELECT` của worker trông y hệt nhau — câu xoá khớp, và
-- sự kiện thứ hai biến mất. Hậu quả không phải một badge sai một lúc: nó là một badge ĐỨNG IM
-- cho tới sự kiện kế tiếp, vì không còn tín hiệu nào để chiếu lại.
--
-- `revision` là một số đếm TĂNG ĐƠN ĐIỆU theo từng người, do chính câu `INSERT … ON CONFLICT DO
-- UPDATE` tăng lên. Hai sự kiện luôn cho hai số khác nhau dù cùng mili-giây, và worker chỉ xoá
-- khi số hiệu còn đúng bản nó đã lấy.
--
-- `dirty_at` được GIỮ, nhưng đổi vai: nó không còn là token so sánh mà chỉ còn dùng để xếp thứ tự
-- (ai đợi lâu nhất chiếu trước) và để đo độ trễ hàng đợi cho health check.
--
-- Forward-only: migration 170000 đã áp ở DB dev, không sửa lịch sử.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "public"."user_badge_signals"
    ADD COLUMN "revision" BIGINT NOT NULL DEFAULT 1;
