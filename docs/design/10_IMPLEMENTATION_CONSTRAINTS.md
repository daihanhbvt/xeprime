# 10 — Implementation Constraints

> Ngày: 04/08/2026 · Chủ sở hữu: Product Director (viết cho người thiết kế)
> Mục đích: để một bản thiết kế **không** đề xuất thứ mà kiến trúc đã chốt là không làm. Đây không phải danh sách lý do từ chối — nó là bản đồ chi phí, để cùng một ý tưởng được diễn đạt theo cách rẻ hơn 10 lần.
> Nguồn: `CLAUDE.md` · `docs/decisions/` (ADR 0001–0010).

---

## 1. Hệ công nghệ đã chốt (không thay đổi)

| Lớp | Công nghệ | Hệ quả cho thiết kế |
| --- | --- | --- |
| Frontend | Next.js 16 App Router, React 19, TS strict | Server Component mặc định; mọi tương tác cần state phải nằm trong "đảo" client nhỏ |
| UI | **Ant Design 6** + CSS Modules + token `--xp-*` (ADR 0003) | Component nào AntD đã có thì dùng nguyên hình dạng của nó. Vẽ một select "đẹp hơn" = viết lại từ đầu |
| Style | CSS Modules + design token | **Cấm** styled-components, **cấm** inline style (ngoại lệ duy nhất: CSS custom property cho giá trị chỉ biết lúc chạy — vị trí thanh sự kiện trên lịch) |
| Icon | **Chỉ** `@ant-design/icons` | Không Lucide, không Font Awesome, không SVG lẻ. Cần icon không có trong bộ ⇒ chọn cái gần nhất hoặc đổi cách diễn đạt |
| Font | Be Vietnam Pro (+ Playfair chỉ ở hero) | Thêm font thứ ba = thêm tải trang cho mọi người dùng |
| Form | React Hook Form + Yup (`@xeprime/validators`) | Thông điệp lỗi viết trong schema dùng chung, không viết trong màn |
| State | Redux (UI) · TanStack Query (dữ liệu máy chủ) · **URL searchParams (lọc/phân trang)** — ADR 0004 | Mọi bộ lọc phải phản ánh được lên URL |
| Backend | NestJS modular monolith, Express | — |
| DB | PostgreSQL 16 + Prisma (ADR 0001) | — |
| Lịch | Tự dựng (`@tanstack/react-virtual` + `@dnd-kit`) | **Cấm** FullCalendar Premium, Bryntum, mọi thư viện lịch trả phí; **cấm** `react-big-calendar` cho màn lịch chính |

---

## 2. Ràng buộc nghiệp vụ không được thiết kế đè lên

| Ràng buộc | ADR | Ý nghĩa với thiết kế |
| --- | --- | --- |
| Chống trùng lịch bằng `EXCLUDE USING gist` ở DB | 0006 | `check-conflict` chỉ là **xem trước**. UI phải chịu được việc bước cuối bị từ chối. Không optimistic update cho lịch |
| `OccupancyService` là **writer duy nhất** của lịch xe | 0006 | Không thiết kế màn nào "sửa lịch trực tiếp" ngoài luồng đơn thuê |
| `ListingsService` là **writer duy nhất** của `public_listings` | 0008 | Không có nút "đăng lên sàn" đi tắt qua duyệt |
| Tenant scope lấy từ membership ở backend | CLAUDE §6 | **Không** có bộ chọn gian hàng phía client cho người dùng shop |
| Role/permission đọc từ DB mỗi request, không nhét vào JWT | 0002 | Không cache quyền ở client để "ẩn nhanh hơn" |
| Duyệt gian hàng/xe public đi qua `approval_tasks` | CLAUDE §6 | Không có công tắc "public" tức thì |
| Tiền là `Decimal` ở BE → **string** trong JSON | 0007 | Thiết kế không được giả định phép tính tiền ở client |
| Trạng thái là union trong `@xeprime/types` | 0005 | Mockup **không** được đặt tên trạng thái mới |
| Type FE sinh từ OpenAPI | 0007 | Thiết kế đòi trường mới ⇒ cần đổi DTO backend, không phải "FE tự thêm" |
| PII che mặc định, bỏ che ghi audit | Phase 7 | Không thiết kế bảng hiện SĐT đầy đủ sẵn |
| Chat: PostgreSQL là nguồn sự thật, Firestore là projection | 0009 | Không thiết kế tính năng chat phụ thuộc vào tính năng riêng của Firestore |

---

## 3. Bảng chi phí — cùng một mong muốn, hai cách diễn đạt

| Mong muốn | Cách **đắt** | Cách **rẻ** |
| --- | --- | --- |
| Danh sách đẹp hơn | Tự dựng bảng riêng cho từng màn | Dùng bảng dùng chung + biến thể cột |
| Lọc mạnh hơn | Panel lọc giữ state riêng trong component | Lọc ghi vào URL, backend lọc (`use-url-filters`) |
| Thấy nhiều dữ liệu hơn trên một màn | Tải hết rồi cắt ở client | Phân trang server + index DB |
| Chuyển cảnh mượt | Animation chuyển trang toàn cục | Skeleton đúng hình dạng nội dung |
| Thêm một trường vào màn | Backend thêm cột + migration | Kiểm tra trường đó đã có trong DTO chưa (thường là có) |
| Biểu tượng riêng cho từng trạng thái | Bộ icon mới | Chip màu + chữ từ `@xeprime/types` |
| Ảnh xe đẹp | Ép shop tự chỉnh ảnh | Kiểm tra tỉ lệ/kích thước ngay lúc upload + placeholder có thương hiệu |
| Trang tải nhanh hơn | Tối ưu sau khi xong | Giữ Server Component, đẩy `'use client'` xuống lá |

---

## 4. Cái bẫy đã trả giá: đừng phá render tĩnh của marketplace

Bài học từ đợt sửa auth 04/08, ghi lại vì nó sẽ tái diễn với bất kỳ tính năng "toàn cục" nào:

> Một provider bọc cả cây `(public)` mà gọi `useSearchParams` sẽ **kéo toàn bộ marketplace vào Suspense** và làm mất render tĩnh ⇒ mất SEO và mất tốc độ trang chủ.

Cách làm đúng đã áp dụng: `AuthModalProvider` **không** đọc search params; phần đọc URL tách thành leaf `AuthUrlSync` nằm trong Suspense riêng. Build xác nhận `/` vẫn là `○ (Static)`.

**Hệ quả cho thiết kế**: bất kỳ đề xuất nào kiểu "thanh trạng thái toàn trang", "banner cá nhân hoá trên mọi trang công khai", "giỏ so sánh nổi" đều phải hỏi trước: *nó có buộc trang chủ trở thành động không?* Nếu có, thiết kế lại thành đảo client nhỏ.

---

## 5. Hiệu năng — ngân sách là ràng buộc thiết kế

| Chỉ số | Ngưỡng | Cái gì phá nó |
| --- | --- | --- |
| LCP trang công khai | ≤ 2.5s (4G) | Ảnh hero quá nặng, font thứ ba, client component ở tầng layout |
| JS client cho route marketplace | ≤ 180KB gzip | Kéo cả AntD vào trang công khai, thư viện biểu đồ ở trang chủ |
| CLS | ≤ 0.1 | Ảnh không đặt tỉ lệ, nội dung chèn sau khi tải |
| Truy vấn danh sách | Có index tương ứng | Bộ lọc theo trường chưa index ⇒ phải thêm migration |

**Lọc/sắp xếp theo trường mới**: phải đi kèm index — không phải chuyện "làm sau". Xem migration `20260804100000_add_platform_monitoring_indexes` (kể cả index trigram cho ô tìm kiếm `ILIKE '%q%'`).

---

## 6. Việc gì cần migration database

Thiết kế đòi những thứ dưới đây ⇒ báo trước, vì chúng thuộc loại chậm và không thể lùi dễ:

| Đề xuất thiết kế | Cần gì |
| --- | --- |
| Chính sách huỷ/thế chấp chuẩn hoá (C-04) | Trường/bảng mới |
| Lưu xe yêu thích (C-05) | Bảng mới |
| Tìm theo bản đồ (C-07) | Toạ độ + index không gian |
| Bàn giao xe có bằng chứng (S-03) | Bảng handover + ảnh |
| ~~Thanh toán online (C-01)~~ **bỏ khỏi phạm vi 21/08/2026, [ADR 0013](../decisions/0013-no-online-payment-mvp.md)** | ~~Bảng giao dịch + trạng thái + webhook~~ |
| Nhiều chi nhánh (S-09) | Thay đổi mô hình quan hệ — **đắt nhất trong danh sách** |
| Ticket hỗ trợ (G-01) | Bảng mới |

Ngược lại, những thứ này **không** cần migration: đổi bố cục, đổi copy, gom/tách màn, thêm bộ lọc trên trường đã có, thêm cách sắp xếp trên trường đã index, dark theme, chuyển bảng thành thẻ ở mobile.

---

## 7. Bản địa hoá

Chỉ tiếng Việt. Không dựng hạ tầng i18n ở chặng này (`02` §8).
Nhưng: **không hardcode chuỗi nghiệp vụ trong component** (CLAUDE §5) — nhãn trạng thái/vai trò lấy từ `@xeprime/types`, văn bản tĩnh của một feature để trong `constants.ts` của feature đó. Đây vừa là kỷ luật code, vừa là con đường rẻ nếu sau này cần i18n.

Định dạng: VND · `Asia/Ho_Chi_Minh` · ngày `dd/mm/yyyy` · SĐT Việt Nam (lưu `84…`, hiển thị `09…` — `common/phone.ts`).

---

## 8. Trình duyệt & thiết bị

| Hỗ trợ | Không hỗ trợ |
| --- | --- |
| Chrome/Edge/Safari/Firefox 2 phiên bản gần nhất | IE, Chrome < 100 |
| iOS Safari 16+, Chrome Android 110+ | — |
| Rộng 360px trở lên | Dưới 360px |
| In: hợp đồng (print CSS `[data-print-root]`) | In các màn khác (chưa) |

---

## 9. Quy trình khi thiết kế cần cái mới

| Cần | Ai duyệt | Yêu cầu |
| --- | --- | --- |
| Token mới | Creative Director | Thêm vào **cả** `theme.ts` và `tokens.css` — `theme.test.ts` sẽ đỏ nếu lệch |
| Trạng thái nghiệp vụ mới | Product Director | Thêm vào `packages/types/src/status/` + nhãn + màu (ADR 0005) |
| Quyền mới | Product Director | Thêm vào `rbac.ts` + seed + guard backend |
| Thư viện mới | Product Director | Nêu rõ vấn đề, chi phí bundle, phương án không dùng thư viện |
| Trường dữ liệu mới | Product Director | Migration + DTO + regenerate contract |
| Màn hình mới trong nav | Product Director | Phải vượt được trần IA (`07` §9): thêm mục thì bỏ mục nào |

---

## 10. Danh sách cấm (trích CLAUDE.md §5, phần liên quan tới thiết kế)

- ❌ `styled-components` · inline style · bộ icon thứ hai
- ❌ Thư viện calendar trả phí · `react-big-calendar` cho lịch chính
- ❌ Hardcode role/status/permission/nhãn nghiệp vụ trong component
- ❌ String literal trần cho trạng thái (`'active'`) — luôn `BOOKING_STATUS.ACTIVE`
- ❌ Client tự quyết `approved_public`, `tenant.status`, hay lịch trống
- ❌ API nhạy cảm nhận `tenant_id` từ body/query
- ❌ Dùng `number` cho tiền
- ❌ Mặc định đưa khách thuê vào `/manage` hay form tạo gian hàng
- ❌ Đăng ký quản trị nền tảng công khai
- ❌ Coi "chưa có gian hàng" là lỗi

---

## 11. Trước khi giao thiết kế cho kỹ sư

- [ ] Mọi component có trong AntD đã dùng đúng hình dạng AntD
- [ ] Mọi màu/khoảng cách/bo góc ánh xạ được về một token `--xp-*`
- [ ] Icon đều có trong `@ant-design/icons`
- [ ] Trạng thái/vai trò khớp `@xeprime/types`
- [ ] Bộ lọc/phân trang có ghi rõ tham số URL
- [ ] Đánh dấu chỗ nào là Server Component, chỗ nào là đảo client
- [ ] Nêu rõ đề xuất nào cần migration (§6)
- [ ] Nêu rõ hành động nào cần quyền nào
- [ ] Không đề xuất nào phá render tĩnh của `/` (§4)

Liên quan: `01_BRAND_GUIDE.md` (token) · `08_UX_GUIDELINES.md` (mẫu) · `docs/decisions/`.
