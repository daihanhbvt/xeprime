---
name: ui-text-style
description: Writing or editing ANY user-facing text in XePrime — i18n message JSON (packages/domain/messages), a string literal or JSX text in apps/web / apps/mobile / apps/api (toasts, labels, empty states, notification and email copy, placeholders like an empty-cell dash), or a date/time display. Load before writing that text so punctuation and date-time formatting follow the house rules: short hyphen only (never — or –), and the shared separator constants instead of hand-typed ones.
---

# Chữ trên giao diện: gạch ngắn, và ngăn cách bằng hằng số

Hai lỗi này đã phải dọn tay trên toàn bộ repo ngày 06/11/2026 (3.099 chỗ trong 720 file + toàn bộ bó message). Đừng để chúng mọc lại.

## 1. Chỉ dùng gạch NGẮN `-`

Dấu gạch dài `—` (em dash, U+2014) và `–` (en dash, U+2013) là thói quen của văn bản do AI viết, người Việt viết giao diện không dùng. Ở mọi chữ người dùng thấy, dùng `-` (U+002D).

| Sai | Đúng |
| --- | --- |
| `"Đang offline — một số thao tác tạm khoá"` | `"Đang offline - một số thao tác tạm khoá"` |
| `"Khách báo đã trả xe · {time} — tự hoàn thành {deadline}"` | `"... {time} - tự hoàn thành {deadline}"` |
| ô trống trong bảng: `'—'` | `'-'` |
| `<span>—</span>` | `<span>-</span>` |
| khoảng ngày `07/11 – 08/11` | `07/11 - 08/11` (hoặc `→` nếu màn đó đã dùng mũi tên) |

Áp cho: file JSON ở `packages/domain/messages/{vi,en}/`, chuỗi ký tự và chữ JSX trong `apps/web`, `apps/mobile/*`, `packages/domain/src`, và chữ do server soạn (`apps/api`, `apps/worker`: thông báo đẩy, email, `message` lỗi). Cả bản **tiếng Anh** cũng vậy.

Không áp cho comment/docblock trong code: đó không phải chữ người dùng thấy, đừng đi sửa hàng loạt.

**Chốt chặn tự động:** `pnpm --filter @xeprime/web i18n:check` báo đỏ khi một khoá message chứa `—` hoặc `–`. Chuỗi viết thẳng trong code chưa có lint chặn, nên tự soát trước khi xong việc:

```bash
# chỉ dòng không phải comment, có dấu gạch dài nằm trong chuỗi/JSX
grep -rnE "—|–" apps/web/src apps/mobile/shared/src apps/api/src --include=*.ts --include=*.tsx \
  | grep -vE "^\S+:[0-9]+:\s*(\*|//|/\*)"
```

## 2. Ngày và giờ: dùng `DATE_TIME_SEPARATOR`, không gõ tay

Giữa NGÀY và GIỜ của cùng một mốc là **hai dấu cách không ngắt**, lấy từ hằng số:

```ts
import { DATE_TIME_SEPARATOR } from '@xeprime/domain'; // '  '
```

- Không dùng ` · ` giữa ngày và giờ (`T7, 07/11 · 09:00` là SAI).
- Không gõ hai dấu cách thường `'  '`: HTML gộp chúng thành một, web chỉ còn một khoảng. NBSP còn giữ ngày và giờ trên cùng một dòng.
- Message ghép ngày + giờ nhận nó qua tham số `{sep}`: `"{date}{sep}{time}"`, `"Giao xe {date}{sep}{time}"`, và nơi gọi truyền `sep: DATE_TIME_SEPARATOR`.
- Ưu tiên dùng formatter có sẵn thay vì tự ghép: `fmt.dateTime`, `fmt.shortDateTime`, `fmt.rentalPoint`, `fmt.rentalPointCompact` (web `apps/web/src/i18n/app-format.ts`, app `apps/mobile/shared/src/i18n/app-format.ts`). Chúng đã truyền hằng số. **Sai:** `{fmt.dayMonth(x)} {fmt.time(x)}`. **Đúng:** `{fmt.rentalPointCompact(toAppTz(x))}`.
- Server (`apps/api`, `apps/worker`) soạn chữ có ngày giờ: `` `${t.format('HH:mm')}${DATE_TIME_SEPARATOR}${t.format('DD/MM')}` ``, không `format('HH:mm DD/MM')`.
- Ngoại lệ: chuỗi định dạng của Ô NHẬP ngày giờ (`DD/MM/YYYY HH:mm` trong `app-format.ts`) giữ một dấu cách thường, vì nó vừa hiển thị vừa phân tích chữ người dùng gõ.

## 3. Ngăn các mục KHÁC nhau trên một dòng: `LIST_SEPARATOR`

`mã · biển số`, `Tên · giờ`, `Tự lái · Thuê dài hạn` dùng `LIST_SEPARATOR` (`' · '`) từ `@xeprime/domain`, không gõ `' · '` tay. Trong message JSON, dấu ` · ` giữa hai mục khác nhau (vd `"{name} · {time}"`) là đúng, đừng nhầm với mục 2.

## Trước khi báo xong

1. Không còn `—` / `–` trong chữ mới viết (JSON lẫn code).
2. Mọi chỗ ghép ngày + giờ đi qua formatter hoặc `DATE_TIME_SEPARATOR`.
3. Chạy `pnpm --filter @xeprime/web i18n:check` nếu đã sửa message.

Liên quan: skill `i18n` (chữ mới phải có cả vi và en), skill `shared-code` (hằng số dùng chung sống ở `@xeprime/domain`).
