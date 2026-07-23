# ADR 0001 — Database engine: PostgreSQL 16 thay cho MySQL 8

Ngày: 22/07/2026 · Trạng thái: Accepted

## Bối cảnh

`xeprime_database_design.md` chốt MySQL 8. Checklist "cần chốt trước khi viết schema" của chính tài liệu đó (mục 27) liệt kê 10 câu hỏi nhưng **không có câu nào về việc chọn engine** — tức là MySQL được mặc định chứ chưa từng được cân nhắc.

Nghiệp vụ lõi của XePrime là **đặt lịch thuê xe theo khoảng thời gian**. Ràng buộc đúng-sai quan trọng nhất của cả sản phẩm là: một xe không được có 2 khoảng thuê chồng nhau.

Thời điểm ra quyết định: repo `Xeprime/` có 0 commit, chưa có `schema.prisma`, chưa có dữ liệu. Chi phí đổi = 0.

## Quyết định

Dùng **PostgreSQL 16**. Ghi đè phần "MySQL 8" trong `xeprime_database_design.md` và các tài liệu khác.

## Lý do

1. **Chống trùng lịch ở tầng DB.** PostgreSQL có `tstzrange` + `EXCLUDE USING gist`, biến double-booking thành *bất khả thi về mặt cấu trúc* — không phụ thuộc việc mọi endpoint có nhớ lock đúng hay không. MySQL 8 không có cơ chế tương đương; mọi đường ghi lịch phải tự lock bi quan, và chỉ cần một chỗ quên là thủng. Chi tiết ở [ADR 0006](0006-booking-concurrency.md).
2. **`jsonb`.** Schema dùng cột JSON ở ~15 chỗ (`snapshot_json`, `settings_json`, `before_json`/`after_json` của audit, `raw_json`…). `jsonb` của PG index và query được; JSON của MySQL yếu hơn đáng kể.
3. **Partial index.** Marketplace chỉ query `public_listings` có `status = 'active'`. PG cho `CREATE INDEX ... WHERE status = 'active'` → index nhỏ hơn nhiều. MySQL không hỗ trợ.
4. **Full-text tiếng Việt.** `pg_trgm` + `unaccent` xử lý tìm kiếm không dấu ("xe may" khớp "xe máy") tốt hơn full-text MySQL, và đủ dùng lâu trước khi cần Elasticsearch.
5. Prisma hỗ trợ hai engine ngang nhau — không có chi phí ORM.

## Hệ quả

Thay đổi so với `xeprime_database_design.md`:

| Tài liệu ghi | Dùng thực tế | Ghi chú |
| --- | --- | --- |
| `char(26)` | `String @id @db.Char(26)` | Không đổi, ULID giữ nguyên |
| `datetime` | `DateTime @db.Timestamptz(3)` | **Có timezone**. Xem [ADR 0005](0005-status-enums.md) phần time |
| `json` | `Json @db.JsonB` | Mặc định Prisma trên PG đã là `jsonb` |
| `decimal(14,2)` | `Decimal @db.Decimal(14,2)` | Không đổi |
| `boolean` | `Boolean` | PG có kiểu native, không phải `tinyint(1)` |
| `text` | `String @db.Text` | Không đổi |
| "không dùng MySQL enum" | vẫn là `String` | Lý do giữ String: xem [ADR 0005](0005-status-enums.md) |

Việc phải làm:

- `docker-compose.yml` dùng image `postgres:16-alpine`, không phải `mysql:8`.
- Migration đầu tiên bật extension: `CREATE EXTENSION IF NOT EXISTS btree_gist;` và `pg_trgm`, `unaccent` (Prisma khai báo qua `previewFeatures = ["postgresqlExtensions"]` + `extensions = [btree_gist, pg_trgm, unaccent]`).
- Script migrate Firestore ở Phase 8 viết cho PG.
- Ghi chú vận hành: `pg_dump` thay `mysqldump` trong production checklist.

## Đã cân nhắc và loại

**Giữ MySQL 8** — bám tài liệu, không phải sửa docs. Loại vì đổi lại là phải tự implement chống trùng lịch bằng row lock bi quan ở mọi đường ghi, mà đây đúng là loại bug đắt nhất: phát hiện muộn, mất tiền thật của shop, và không tái hiện được trong test tuần tự.
