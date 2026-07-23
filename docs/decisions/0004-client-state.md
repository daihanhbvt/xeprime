# ADR 0004 — Giữ Redux Toolkit, đẩy filter ra URL searchParams

Ngày: 22/07/2026 · Trạng thái: Accepted

## Bối cảnh

Tài liệu chốt Redux Toolkit cho UI/client state. Sau khi trừ đi:

- server data → TanStack Query
- form state → React Hook Form
- URL state → Next.js `searchParams`

thì phần còn lại cho Redux khá mỏng: sidebar mở/đóng, tenant scope hiện tại, event lịch đang chọn.

Đã cân nhắc bỏ Redux để đổi sang Zustand (ít boilerplate hơn nhiều), nhưng **quyết định giữ Redux Toolkit** — bám tài liệu, team quen, devtools tốt, và onboard người mới không phải giải thích lựa chọn lạ.

## Quyết định

Giữ Redux Toolkit, nhưng phân vai chặt để nó không phình:

| Loại state | Chỗ đúng | Ghi chú |
| --- | --- | --- |
| Server data (list xe, event lịch, booking, chi tiết đơn) | TanStack Query | Không bao giờ copy vào Redux |
| Form đang nhập | React Hook Form | Không đưa vào Redux |
| **Filter lịch, filter marketplace, phân trang, tab đang mở** | **URL `searchParams`** | ⚠️ Khác tài liệu — xem lý do dưới |
| Tenant/branch scope hiện tại | Redux | |
| Sidebar, theme, modal global | Redux | |
| Event lịch đang chọn | Redux hoặc local state của màn | Ưu tiên local nếu không ai ngoài màn đó cần |

## Vì sao filter phải ở URL, không ở Redux

`xeprime_fe_base_stack_calendar.md` xếp "calendar filters/range/selected event" vào Redux. Đây là chỗ duy nhất ghi đè tài liệu, vì để ở Redux thì:

- Không gửi link được cho đồng nghiệp ("xem giúp lịch xe máy chi nhánh Q1 tháng 8").
- Nút Back của trình duyệt không hoàn tác filter — người dùng bấm Back tưởng quay lại filter cũ thì bị văng ra khỏi trang.
- F5 mất sạch filter.
- Không SSR được trang có filter.

Ba hành vi đầu là thứ người dùng app quản lý mong đợi mặc định. Đưa vào URL là được cả bốn, và không tốn dòng code nào so với viết slice.

## Hệ quả

- `makeStore()` theo khuyến nghị Redux Toolkit cho App Router; Provider nằm trong Client Component; **không** tạo singleton store dùng chung giữa các server request.
- Slice tối thiểu: `app` (sidebar/theme), `scope` (tenant/branch/platform), `auth` (thông tin user client-side, không phải nguồn quyền — quyền luôn từ API).
- Quy tắc review: **thêm slice mới phải nêu lý do vì sao state đó không thuộc TanStack Query / RHF / URL.**
- Hook `useCalendarFilters()` bọc `useSearchParams` + `useRouter().replace()`, để component không phải tự parse query string.
