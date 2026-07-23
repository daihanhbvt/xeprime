# XePrime - FE Base Stack và lựa chọn thư viện lịch thuê xe

Ngày cập nhật: 22/07/2026

Tài liệu này bổ sung cho kế hoạch build source mới Next.js + NestJS. Trọng tâm là phần frontend base source và màn lịch thuê xe dạng Google Calendar/resource timeline như UI hiện tại.

## 1. Kết luận nhanh

Màn lịch thuê xe của XePrime không phải calendar đơn giản. Đây là **resource timeline scheduler**:

- Hàng ngang là xe.
- Cột dọc là ngày/giờ.
- Event kéo dài nhiều ngày.
- Cần sticky cột xe bên trái.
- Cần horizontal scroll theo ngày.
- Cần vertical scroll nhiều xe.
- Cần mobile view riêng.
- Cần filter theo chi nhánh, loại xe, trạng thái xe, tháng.
- Cần thao tác tạo đơn, sửa đơn, khóa xe, bảo dưỡng, giao/nhận xe.

Khuyến nghị:

| Mục tiêu | Chọn |
| --- | --- |
| Không muốn dùng thư viện tính phí | Custom Scheduler dùng TanStack Virtual + dnd-kit |
| Muốn UI giống ảnh và tối ưu mobile | Custom Scheduler dùng TanStack Virtual + dnd-kit |
| Muốn tránh phụ thuộc calendar vendor | Custom Scheduler + abstraction `CalendarScheduler` |

Đề xuất cho XePrime:

1. **Base source nên thiết kế abstraction `CalendarScheduler` riêng**, không để business logic dính chặt vào thư viện.
2. **Không dùng FullCalendar Premium/Bryntum** vì có phí license production.
3. Build **custom timeline** bằng `@tanstack/react-virtual` + `@dnd-kit`.
4. Không nên dùng `react-big-calendar` cho màn này vì nó hợp calendar month/week/day hơn, không mạnh ở resource timeline hàng xe x cột ngày như UI hiện tại.

## 2. So sánh thư viện lịch

### 2.1 Custom Scheduler: TanStack Virtual + dnd-kit

Phù hợp nếu muốn làm giống UI hiện tại và kiểm soát sâu.

| Thành phần | Thư viện |
| --- | --- |
| Virtual rows xe | `@tanstack/react-virtual` |
| Virtual columns ngày/giờ | `@tanstack/react-virtual` hoặc custom horizontal math |
| Drag/drop event | `@dnd-kit/core`, `@dnd-kit/modifiers` |
| Date math | `dayjs` |
| Server state/cache | TanStack Query |
| UI controls | Ant Design |
| Mobile sheet/modal | AntD Drawer/Modal + custom CSS |

Ưu điểm:

- Không tốn license calendar.
- Làm đúng UI như ảnh.
- Tối ưu tốt với 1.000 xe nếu virtualized.
- Dễ làm mobile view riêng.
- Dễ gắn logic đặc thù: xe trống, công suất, trạng thái giao/nhận, khóa xe, bảo dưỡng.

Nhược điểm:

- Tốn thời gian hơn.
- Phải tự xử lý date grid, event collision, drag/drop, resize.
- Cần test kỹ.

Nên dùng khi:

- Đây là màn vận hành lõi.
- Muốn sản phẩm khác biệt và dùng lâu dài.
- Muốn tránh phí thư viện scheduler.

### 2.2 FullCalendar Premium/Bryntum

Không chọn cho XePrime ở giai đoạn này vì bạn không muốn dùng thư viện tính phí.

| Thư viện | Lý do không chọn |
| --- | --- |
| FullCalendar Premium Scheduler | Timeline/resource scheduler nằm ở gói premium/commercial cho production |
| Bryntum Scheduler | Scheduler mạnh nhưng license commercial, chi phí cao hơn nhu cầu MVP |

Vẫn có thể học cách tổ chức UX từ các thư viện này, nhưng không đưa vào base source.

### 2.3 React Big Calendar

Không khuyến nghị cho màn chính này.

Lý do:

- Hợp Google Calendar dạng tháng/tuần/ngày.
- Không tối ưu cho resource timeline nhiều xe x nhiều ngày.
- Muốn giống UI hiện tại sẽ phải custom nhiều, cuối cùng gần như tự viết.

## 3. Quyết định đề xuất cho XePrime

Build **custom resource timeline** ngay từ đầu.

| Việc | Cách làm |
| --- | --- |
| Grid xe x ngày | CSS grid + virtual rows |
| Sticky left vehicle column | CSS sticky |
| Sticky date header | CSS sticky |
| Horizontal date scroll | Scroll container |
| Vertical vehicle scroll | TanStack Virtual |
| Event bar | Absolute positioning theo start/end |
| Drag/drop | dnd-kit |
| Resize | custom handles + pointer events hoặc dnd-kit modifiers |
| Mobile | Timeline condensed + bottom sheet |

Khuyến nghị cuối:

**Nếu mục tiêu của bạn là dùng Claude Max để dựng source mới nghiêm túc và lên prod trong 2-3 tháng, nên chọn custom scheduler cho production**, nhưng làm theo thứ tự đơn giản trước:

1. Sprint đầu: custom timeline read-only + click tạo/sửa đơn.
2. Sprint sau: drag/drop.
3. Sprint sau nữa: resize, conflict preview, mobile polish.

## 4. Thiết kế component lịch mục tiêu

### 4.1 Cấu trúc component

```text
features/calendar/
  components/
    CalendarScheduler.tsx
    CalendarToolbar.tsx
    CalendarGrid.tsx
    CalendarHeader.tsx
    VehicleResourceColumn.tsx
    CalendarEventBar.tsx
    CalendarEventPopover.tsx
    CalendarMobileView.tsx
    CreateBookingDrawer.tsx
    BlockVehicleDrawer.tsx
  hooks/
    useCalendarRange.ts
    useCalendarFilters.ts
    useCalendarResources.ts
    useCalendarEvents.ts
    useCalendarDrag.ts
    useCalendarSelection.ts
  store/
    calendar.slice.ts
    calendar.saga.ts
    calendar.selectors.ts
  services/
    calendar.api.ts
    calendar.mapper.ts
  types/
    calendar.types.ts
  utils/
    calendar-position.util.ts
    calendar-date.util.ts
```

### 4.2 Data model frontend

```ts
export type CalendarResource = {
  id: string;
  vehicleId: string;
  name: string;
  plateNumber?: string;
  status: 'available' | 'renting' | 'maintenance' | 'inactive';
  vehicleType: 'car' | 'motorbike';
  branchId?: string;
};

export type CalendarEvent = {
  id: string;
  type: 'booking' | 'booking_request' | 'blocked' | 'maintenance';
  resourceId: string;
  bookingId?: string;
  bookingRequestId?: string;
  title: string;
  customerName?: string;
  startAt: string;
  endAt: string;
  status: string;
  colorToken: string;
};
```

### 4.3 Toolbar cần có

| Control | Chức năng |
| --- | --- |
| Search | Tìm xe/biển số/khách |
| Filter button | Mở filter nâng cao |
| Tạo đơn | Mở drawer tạo đơn |
| Hôm nay | Jump về hôm nay |
| Tháng 7/8/9 | Quick month |
| Tất cả xe | Filter vehicle type |
| Ô tô | Filter car |
| Xe máy | Filter motorbike |
| Chi nhánh | Global branch scope |
| Chat/notification buttons | Theo layout chung |

### 4.4 Event types

| Type | Màu gợi ý | Ý nghĩa |
| --- | --- | --- |
| `booking_reserved` | blue | Đã đặt trước |
| `booking_active` | green | Đang thuê |
| `booking_overdue` | red | Quá hạn |
| `booking_completed` | gray | Hoàn thành |
| `booking_request` | amber | Yêu cầu chờ duyệt |
| `blocked` | slate | Xe bị khóa |
| `maintenance` | purple | Bảo dưỡng |

### 4.5 Tương tác cần có

| Tương tác | Hành động |
| --- | --- |
| Click ô trống | Mở tạo đơn với xe/ngày prefill |
| Click event | Mở popover chi tiết |
| Double click event | Mở booking detail |
| Drag event sang ngày khác | Gọi API preview conflict, confirm, save |
| Resize event | Gọi API preview conflict, confirm, save |
| Click xe | Mở vehicle quick view |
| Mobile click event | Mở bottom sheet |

## 5. Store Next.js: Redux Toolkit + TanStack Query

Kết luận: **dùng Redux Toolkit + TanStack Query, chưa dùng Redux Saga ở MVP**.

Redux Toolkit và TanStack Query không trùng nhau nếu phân vai đúng:

- Redux Toolkit giữ state UI/client: sidebar, scope, filter, selected event.
- TanStack Query giữ server data/cache: list xe, list booking, event lịch, chi tiết đơn.
- Mutation của TanStack Query xử lý tạo/sửa/xóa/duyệt và invalidate/refetch data.
- React Hook Form giữ form state, không đưa form vào Redux.

### 5.1 Khuyến nghị store

| Loại state | Nên dùng |
| --- | --- |
| Auth/session client | Redux Toolkit |
| Current tenant/scope | Redux Toolkit |
| UI state global: sidebar, theme, modal global | Redux Toolkit |
| Calendar filters/range/selected event | Redux Toolkit |
| Server data list/cache | TanStack Query |
| Tạo/sửa/xóa/duyệt/check conflict | TanStack Query mutation |
| Form local | React Hook Form |
| URL filters public page | Next search params |

Không dùng Redux Saga ban đầu vì:

- Dự án cần tốc độ và dễ maintain.
- CRUD/admin/calendar booking dùng TanStack Query đã đủ.
- Saga dễ làm trùng trách nhiệm với TanStack Query nếu không kiểm soát chặt.

Sau này chỉ cân nhắc Redux Saga nếu có workflow rất phức tạp, ví dụ:

- Upload nhiều giấy tờ + verify + tạo xe + gửi duyệt + rollback lỗi.
- Checkout/thanh toán nhiều bước.
- Đồng bộ offline/queue action.
- Quy trình import/migrate cần điều phối nhiều bước trên client.

Khuyến nghị cân bằng cho MVP:

**Redux Toolkit + TanStack Query + React Hook Form**.

### 5.2 Store structure

```text
src/store/
  make-store.ts
  root-reducer.ts
  hooks.ts
  slices/
    auth.slice.ts
    app.slice.ts
    tenant.slice.ts
    calendar.slice.ts
    notification.slice.ts
src/providers/
  redux-provider.tsx
  query-provider.tsx
src/services/
  api-client.ts
  query-keys.ts
```

### 5.3 Next.js App Router lưu ý

Với Next.js App Router:

- Store nên tạo bằng `makeStore()` theo khuyến nghị Redux Toolkit.
- Provider Redux đặt trong Client Component.
- Chỉ dùng Redux trong Client Components.
- Không tạo global store singleton dùng chung giữa server requests.

## 6. FE base libraries cần thêm

### 6.1 Core

| Nhóm | Thư viện |
| --- | --- |
| Framework | `next`, `react`, `react-dom`, `typescript` |
| UI | `antd`, `@ant-design/icons`, `@ant-design/nextjs-registry` |
| Styling | `styled-components`, `babel-plugin-styled-components` hoặc Next compiler styled-components |
| Form | `react-hook-form` |
| Validation | `yup`, `@hookform/resolvers` |
| Client state | `@reduxjs/toolkit`, `react-redux` |
| Server cache | `@tanstack/react-query` |
| Date | `dayjs` |
| HTTP | `axios` hoặc fetch wrapper |
| Icons | `lucide-react` nếu muốn icon nhẹ, hoặc AntD icons |

### 6.2 Calendar/Scheduler

| Thư viện |
| --- |
| `@tanstack/react-virtual` |
| `@dnd-kit/core` |
| `@dnd-kit/modifiers` |
| `@dnd-kit/accessibility` nếu cần |

### 6.3 Data display và UX

| Nhu cầu | Thư viện |
| --- | --- |
| Table lớn | AntD Table, sau này có thể dùng TanStack Table |
| Virtual list | `@tanstack/react-virtual` |
| Command/search | `cmdk` optional |
| Toast | `sonner` hoặc AntD message/notification |
| Modal/drawer | AntD Modal/Drawer |
| Upload | AntD Upload + custom Firebase Storage adapter |
| Map | `leaflet`, `react-leaflet` |
| Image preview | AntD Image hoặc custom lightbox |

### 6.4 Dev quality

| Nhu cầu | Thư viện |
| --- | --- |
| Lint | `eslint`, `eslint-config-next` |
| Format | `prettier` |
| Test unit | `vitest` |
| Test React | `@testing-library/react`, `@testing-library/user-event` |
| E2E | `playwright` |
| Mock API | `msw` optional |
| Type check | TypeScript strict |

## 7. Base source folder cho web

```text
apps/web/src/
  app/
    (public)/
    (manage)/
    providers.tsx
    layout.tsx
  components/
    common/
    layout/
    form/
    data-display/
  features/
    auth/
    marketplace/
    shops/
    calendar/
    vehicles/
    booking-requests/
    bookings/
    customers/
    finance/
    chat/
    admin/
  store/
  services/
    api-client.ts
    firebase-client.ts
  constants/
    roles.ts
    permissions.ts
    statuses.ts
    routes.ts
  hooks/
    use-current-user.ts
    use-permissions.ts
    use-tenant-scope.ts
  styles/
    globals.css
    theme.ts
```

## 8. API cho màn lịch

### 8.1 Endpoints

| API | Mục tiêu |
| --- | --- |
| `GET /calendar/resources` | Lấy danh sách xe theo filter |
| `GET /calendar/events` | Lấy booking/block range theo date range |
| `POST /calendar/check-conflict` | Preview trùng lịch |
| `POST /bookings` | Tạo đơn từ ô lịch |
| `PATCH /bookings/:id/schedule` | Drag/resize đổi lịch |
| `POST /vehicles/:id/blocked-ranges` | Khóa xe |
| `DELETE /vehicles/:id/blocked-ranges/:rangeId` | Mở khóa |

### 8.2 Query params

| Param | Mô tả |
| --- | --- |
| `tenant_id` | Backend tự lấy từ scope, không nhận từ client tenant API |
| `branch_id` | Chi nhánh |
| `vehicle_type` | car/motorbike |
| `status` | Vehicle status |
| `q` | Search xe/biển số/khách |
| `start_at` | Range start |
| `end_at` | Range end |

## 9. Production notes cho màn lịch

| Vấn đề | Cách xử lý |
| --- | --- |
| 1.000 xe x 30 ngày quá nhiều DOM | Virtualize rows, hạn chế columns visible |
| Drag gây ghi sai lịch | API transaction check conflict |
| Mobile khó thao tác kéo thả | Mobile ưu tiên tap + drawer, chưa cần drag |
| Scroll lag | Fixed row height, memo event, CSS transform |
| Timezone | Lưu UTC, hiển thị Asia/Bangkok |
| Status màu rối | Dùng design tokens |
| Data stale | Invalidate query sau mutation |

## 10. Checklist khi dựng base source

| Checklist |
| --- |
| Có Redux Toolkit store bằng `makeStore()` |
| Có QueryClient provider |
| Có AntD registry cho Next App Router |
| Có theme tokens |
| Có constants role/status/permission |
| Có API client interceptor auth token |
| Có feature calendar folder |
| Có calendar component abstraction |
| Có calendar mock data/story/demo |
| Có test cho calendar date math |

## 11. Kết luận

Màn lịch là một trong các màn lõi nhất của XePrime. Nếu chọn sai thư viện, sau này rất dễ mắc kẹt.

Khuyến nghị thực tế:

1. **Dựng base source với Redux Toolkit + TanStack Query**.
2. **Thiết kế calendar abstraction ngay từ đầu**.
3. **Không dùng thư viện scheduler tính phí ở MVP**.
4. **Build custom scheduler bằng TanStack Virtual + dnd-kit**.
5. Mobile không nên ép giống desktop kéo thả; mobile nên dùng tap, bottom sheet, quick action.

## 12. Nguồn tham khảo

- dnd-kit: https://docs.dndkit.com/
- TanStack Virtual: https://tanstack.com/virtual/latest
- Redux Toolkit Next.js: https://redux-toolkit.js.org/usage/nextjs
- TanStack Query SSR: https://tanstack.com/query/latest/docs/framework/react/guides/ssr
- Ant Design Next.js: https://ant.design/docs/react/use-with-next/
