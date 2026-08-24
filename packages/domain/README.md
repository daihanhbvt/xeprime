# `@xeprime/domain`

Luật nghiệp vụ **thuần**, dùng chung cho `apps/web` và `apps/mobile` sau này.

Điều kiện để một thứ được vào đây: **nó không biết mình đang chạy ở đâu.** Không React, không Ant
Design, không CSS, không `next/*`, không `File`/`XMLHttpRequest`, không đọc `process.env`.

## Nội dung

| Module           | Vai                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `money.ts`       | Cộng/trừ/so sánh tiền **trên chuỗi**, không qua `number` (ADR 0007). Format, dạng rút gọn (`12,7tr`), và đọc tiền bằng chữ |
| `datetime.ts`    | Múi giờ `Asia/Ho_Chi_Minh`, mẫu tham số URL, đếm thời lượng thuê. Chỗ **duy nhất** extend dayjs                            |
| `rental-busy.ts` | Lịch bận của xe: ngày bận trọn / bận một phần, và khoảng thuê có đụng không                                                |
| `long-term.ts`   | Phân loại nguyện vọng nhận xe của khách thuê dài hạn (ADR 0011)                                                            |

## Vì sao gom lại

Mấy phép tính này là **luật**, không phải tiện ích:

- `rental-busy.ts` quyết định một khoảng thuê có khả thi không, và nó dùng cùng quy ước nửa mở `[)`
  với exclusion constraint ở tầng DB (ADR 0006) — nên lời cảnh báo trên màn khớp với thứ server sẽ
  từ chối. Hai client viết hai bản là hai câu trả lời khác nhau cho cùng một chiếc xe.
- `long-term.ts` là "một hàm duy nhất" theo đúng chữ trong ADR 0011.
- `money.ts` là lý do tiền không bao giờ đi qua `number`. Một bản sao ở app native là một dịp để ai
  đó viết `Number(value)` cho nhanh.

## Ngôn ngữ

Module ở đây trả **con số và phân loại**, không trả câu chữ. `rentalDurationParts()` trả
`{ days: 2, hours: 4 }`, không trả `"2 ngày 4 giờ"` — dựng câu là việc của bó message (ICU lo số
nhiều), và nó khác nhau giữa hai ngôn ngữ.

`dayjs.locale(...)` **không** được gọi ở đâu trong package này: nó đổi trạng thái toàn tiến trình
và sẽ rò ngôn ngữ giữa các request render song song trên server (ADR 0012).

## Cái KHÔNG tách vào đây

Ghi ra để không ai làm nhầm (`docs/mobile-readiness-audit.md` §14.3):

| Không tách                                                      | Lý do                                                                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/hooks/use-url-filters.ts` + 7 hook `*-filters.ts` | ADR 0004: filter sống ở URL. Mobile không có URL — nó cần **bản khác cùng interface**, không phải bản dùng chung |
| `uploadToR2` (`apps/web/src/services/upload.ts`)                | Dùng `File` + `XMLHttpRequest`. Chỉ phần gọi presign là dùng chung được                                          |
| `apps/api/src/common/booking-money.ts`                          | `Prisma.Decimal` + `Prisma.sql`. Server phải là nơi **duy nhất** tính tiền có thẩm quyền                         |
| React component, CSS Module, `packages/ui`                      | RN không dùng được                                                                                               |

## Bó message dùng chung — TOÀN BỘ

`messages/{vi,en}/` chứa **cả 21 namespace** (2.172 khoá × 2 ngôn ngữ). Quyết định 24/08/2026:
web và app native dùng chung toàn bộ bó message — một khoá chỉ có một bản dịch, hai client không
bao giờ nói khác nhau về cùng một khái niệm.

Nạp từ đâu:

```ts
import vehicles from '@xeprime/domain/messages/vi/vehicles.json';
```

Web gom qua `apps/web/messages/<locale>/index.ts` (import tĩnh để bundler tách chunk theo ngôn
ngữ); mobile sẽ có bảng gom riêng trỏ vào cùng các file JSON này.

Hai điều cần biết khi dùng từ mobile:

- **Một số khoá là chữ của bề mặt web** — `aria-label` cho DOM, tiêu đề wizard đánh số theo luồng
  desktop ("1. Thông tin cơ bản của xe"), "Mở trang đầy đủ". Mobile đơn giản là KHÔNG dùng những
  khoá đó; màn hình mobile cần câu riêng thì thêm namespace mới (ví dụ `mobile-nav`) chứ không
  sửa câu của web.
- **Lưới bảo vệ**: `pnpm --filter @xeprime/web i18n:check` đối chiếu parity vi↔en trên gốc này,
  và CHẶN file JSON mọc lại ở `apps/web/messages/` (bản sao lạc không ai nạp).

Thêm namespace = 5 chỗ: `apps/web/src/i18n/namespaces.ts` · JSON vi + en ở đây · khai báo ở hai
file `apps/web/messages/<locale>/index.ts`.
