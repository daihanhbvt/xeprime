# Báo cáo rà soát luồng cho thuê xe end-to-end

Ngày: 20/08/2026 · Phạm vi: khách gửi yêu cầu → chủ xe duyệt → giao xe → nhận xe → tiền.
**Đây là báo cáo phân tích, chưa code gì.**

## Cách tôi kiểm

Đi ngược từ mã nguồn chứ không từ tài liệu: `packages/types/src/status/*` (máy trạng thái),
`apps/api/src/modules/{booking-requests,bookings,customer-trips,notification,finance}`,
`apps/web/src/features/{booking-requests,bookings,handovers,settlement,trips,dashboard}`, và đối
chiếu với [`docs/design/14_SIMPLIFIED_HANDOVER_AND_RETURN.md`](../design/14_SIMPLIFIED_HANDOVER_AND_RETURN.md)
(bản thân tài liệu đó ghi rõ: *"không khẳng định code hiện tại đã làm theo"*).

---

## 1. Bản đồ luồng — thực tế đang chạy

| # | Chặng | Ai làm | Màn hình | Trạng thái |
| --- | --- | --- | --- | --- |
| 1 | Gửi yêu cầu thuê | Khách | `/listings/:id` → overlay 2 bước | ✅ Đủ (vừa rút gọn) |
| 2 | Duyệt / từ chối | Gian hàng | `/manage/booking-requests` | ✅ Đủ · duyệt → sinh `bookings` trạng thái `reserved` |
| 3 | Trước giao xe | Gian hàng | `/manage/bookings/:id` — hợp đồng, thu tiền, thu cọc | ✅ Đủ |
| 4 | **Giao xe** | Gian hàng | Nút `Xác nhận đã giao xe` → `ConfirmHandoverDialog` | ⚠️ Chạy được, **thiếu ảnh** |
| 5 | Đang thuê | — | Khách xem `/trips/:id`; shop xem lịch/dashboard | ✅ Đủ |
| 6 | **Nhận xe trả** | Gian hàng | Nút `Xác nhận đã nhận xe` → cùng dialog | ⚠️ Chạy được, **thiếu ảnh** |
| 7 | Phát sinh + hoàn cọc | Gian hàng | `SettlementCard` + `SurchargeDialog` | ✅ Đủ |
| 8 | Công nợ / sổ thu-chi | Gian hàng | `/manage/debts`, `/manage/receipts`, `/manage/finance` | ✅ Đủ |
| 9 | Đánh giá | Khách | `/trips/:id` | ✅ Đủ |

Máy trạng thái chặt và đúng: `BOOKING_STATUS_TRANSITIONS` chốt ở backend, trạng thái đơn **chỉ**
đổi như hệ quả của một lần xác nhận bàn giao thật (Wave 10) — không có nút "đổi trạng thái" tuỳ ý.
Chống trùng lịch bằng `EXCLUDE USING gist` (ADR 0006). Tiền có một công thức duy nhất
(`common/booking-money.ts`). **Phần xương sống này lành mạnh.**

---

## 2. Trả lời trực tiếp: có chức năng chụp ảnh khi giao/nhận không?

**Có code, nhưng người dùng KHÔNG bấm tới được.** Đây là phát hiện nặng nhất của đợt rà soát.

Đã dựng đầy đủ và vẫn còn nguyên trong repo:

- Backend 4 endpoint: `POST :type/photos/presign` · `POST :type/photos` · `DELETE :type/photos/:slot`
  · `GET :type/photos/:fileId/download` ([booking-handovers.controller.ts](../../apps/api/src/modules/bookings/handovers/booking-handovers.controller.ts))
- Kiểu dữ liệu: 5 slot cố định (Trước/Sau/Trái/Phải/Đồng hồ Odo), tối thiểu 2 góc đối diện, trần 12 ảnh
  ([status/handover.ts](../../packages/types/src/status/handover.ts))
- Client API: `presignHandoverPhoto`, `attachHandoverPhoto`, … ([features/handovers/api.ts](../../apps/web/src/features/handovers/api.ts))
- Component UI: [`HandoverPhotoGrid.tsx`](../../apps/web/src/features/handovers/components/HandoverPhotoGrid.tsx) (293 dòng, có upload/xoá/xem)

Nhưng chuỗi mount bị đứt:

```
HandoverPhotoGrid  ←  HandoverDialog  ←  HandoverPanel  ←  (KHÔNG AI)
                                                            └ chỉ handover-panel.test.tsx
```

`HandoverPanel` có **0 nơi dựng trong sản phẩm** — grep toàn `apps/web/src` chỉ ra chính nó và file
test 893 dòng của nó. Màn thật là [`BookingActionBar.tsx:165`](../../apps/web/src/features/bookings/components/BookingActionBar.tsx#L165)
dựng `ConfirmHandoverDialog`, và dialog đó **không nhận** hai prop `onOpenCondition` / `onOpenSurcharge`
mà chính nó đã khai sẵn để mở khối ảnh.

Hệ quả thực tế: chủ xe giao/nhận xe chỉ ghi được **giờ + số Odo + tình trạng (radio) + ghi chú**.
Không có một tấm ảnh nào làm bằng chứng. Khi tranh chấp trầy xước hay trừ cọc, hai bên **không có
gì để đối chiếu** — đúng vấn đề mà cả bộ slot 5 góc kia sinh ra để giải quyết.

> Đây không phải "chưa làm", mà là **đã làm rồi để rơi mất đường vào**. Chi phí nối lại nhỏ hơn
> nhiều so với ấn tượng ban đầu.

---

## 3. Các lỗ hổng khác, xếp theo mức nặng

### 🔴 P0-A — Yêu cầu thuê có thể treo vĩnh viễn, khách không thoát ra được

Ba sự thật cộng lại thành một cái bẫy:

1. **Khách không huỷ được.** `BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER` tồn tại và được *đọc*
   (bộ lọc tab "Đã huỷ" ở `/trips`), nhưng **không endpoint nào ghi giá trị đó**.
   `customer-trips.controller.ts` chỉ có 2 route `GET`.
2. **Không có hạn phản hồi.** Bảng `booking_requests` không có cột `expires_at`/`respond_by`.
3. **`EXPIRED` không ai ghi.** Cũng chỉ được đọc trong bộ lọc; không có worker/cron nào đặt nó
   (`apps/worker` chỉ có `outbox-pump` + `retention`).

⇒ Gian hàng im lặng thì yêu cầu nằm ở `Chờ xác nhận` **mãi mãi**. Khách chỉ còn cách gọi điện hoặc
chat. Với sản phẩm marketplace, đây là lỗ hổng trải nghiệm nghiêm trọng hơn cả thiếu ảnh.

### 🔴 P0-B — Khách chỉ biết tin nếu tự mở web

`NOTIFICATION_CHANNEL` **chỉ có `in_app`**. Không SMS, không email, không push. Luồng thông báo cho
khách thực tế chỉ có 3 mốc: yêu cầu được duyệt/từ chối, chuyến bắt đầu, chuyến hoàn thành — và tất
cả nằm trong chuông của website.

Khách thuê xe không mở web app hằng ngày. "Chủ xe đã duyệt, 10h sáng mai nhận xe ở 12 Nguyễn Văn
Linh" mà không có SMS thì gần như chắc chắn khách không thấy. Cũng không có nhắc lịch trước giờ
nhận/trả cho cả hai phía.

### 🟠 P1-A — Dashboard gian hàng thiếu đúng nửa công việc

[`DashboardView.tsx`](../../apps/web/src/features/dashboard/components/DashboardView.tsx) có
`Quá hạn / Trả hôm nay` và `Trả xe trong 3 ngày tới`, nhưng **không có panel "Giao xe hôm nay"** —
hook chỉ query `status: 'active'` theo `returnAt`. Việc giao xe (đơn `reserved`/`confirmed` có
`pickupAt` hôm nay) không hiện ở đâu trên trang chủ vận hành; muốn biết phải mở lịch.

Thêm nữa, 2 thẻ số bị hardcode rỗng vĩnh viễn: `<StatCard label="Doanh thu" value="—" />` và
`<StatCard label="Tiền cọc đang giữ" value="—" />` — trong khi `/manage/finance` đã có đủ số thật.

### 🟠 P1-B — Khách không thấy bằng chứng bàn giao

`/trips/:id` hiện thời gian bàn giao thực tế, nhưng **không hiện số Odo, không hiện ảnh, không hiện
ghi chú hiện trạng**. Khi shop trừ cọc vì hư hại, khách không xem được căn cứ ở đâu trong app.
Ba nút duy nhất ở màn chuyến là Chat · Gọi · Đánh giá.

Ghi chú: kể cả khi nối lại chức năng ảnh ở mục 2, vẫn cần quyết định riêng "khách có được xem ảnh
không" — hiện `HANDOVER_FILE_VIEW` là quyền của tenant, chưa có đường đọc cho khách.

### 🟡 P2-A — Nợ kỹ thuật Wave 7 còn nằm lại, gây hiểu nhầm "đã có tính năng"

`HandoverPanel` (315) + `HandoverDialog` (699) + `HandoverPhotoGrid` (293) + `handover-panel.test.tsx`
(893) = **~2.200 dòng code chết** vẫn build, vẫn chạy test, vẫn xanh — nên nhìn vào repo thì tưởng
tính năng đang chạy. Đây chính là lý do câu hỏi "có chụp ảnh chưa" không có câu trả lời hiển nhiên.

Kèm theo: `FUEL_LEVEL`, `FUEL_LEVEL_LABEL`, `fuelLevelDropQuarters` vẫn còn trong
`packages/types` và vẫn được `HandoverPanel` import, trong khi Wave 10 §8 đã **bỏ hẳn nhiên liệu**
khỏi bàn giao.

### 🟡 P2-B — Vài chỗ nhỏ

- Ngưỡng "KM nghi ngờ" cố ý không có mặc định (đúng), nhưng **không có màn nào để gian hàng khai**
  `handoverSuspiciousKmPerDay` — nên tính năng cảnh báo Odo bất thường thực tế luôn tắt.
- `/manage/pickup-areas` vẫn là stub (`comingSoon`) — liên quan trực tiếp tới giao xe tận nơi.
- Không có cổng thanh toán: mọi khoản thu/hoàn cọc là **ghi nhận thủ công**. Đây là quyết định sản
  phẩm đã chốt (design 14 §5), không phải lỗi — nhưng cần nói rõ với khách trên giao diện.

---

## 4. Đánh giá tổng thể

**Đã hoàn thiện — làm tốt:**
máy trạng thái + chống trùng lịch ở tầng DB · một công thức tiền duy nhất cho cả đơn/sổ/công nợ ·
quyết toán cọc và phụ phí đủ đường đi · sổ thu-chi hai chiều · phân quyền + audit đến từng thao tác ·
luồng khách gửi yêu cầu (vừa rút còn 2 bước).

**Chưa "dễ dùng, thân thiện" ở ba điểm, theo đúng thứ tự tôi khuyến nghị xử lý:**

| Ưu tiên | Việc | Vì sao trước |
| --- | --- | --- |
| 1 | **Nối lại ảnh bàn giao** vào `ConfirmHandoverDialog` (mở `Ghi nhận hiện trạng` từ vùng nâng cao) | Backend + component đã xong ⇒ rẻ nhất, giá trị cao nhất (bằng chứng tranh chấp) |
| 2 | **Cho khách huỷ yêu cầu** + hạn phản hồi cho gian hàng | Đóng cái bẫy "treo vĩnh viễn"; cần 1 endpoint + 1 nút + 1 cột |
| 3 | **Kênh ngoài app** (tối thiểu SMS lúc duyệt + nhắc trước giờ nhận) | Không có thì mọi thông báo còn lại gần như vô hiệu |
| 4 | Panel "Giao xe hôm nay" + 2 thẻ số đang `—` trên dashboard | Rẻ, sửa đúng chỗ vận hành nhìn mỗi ngày |
| 5 | Cho khách xem Odo/ảnh/ghi chú bàn giao ở `/trips/:id` | Đi sau (1), dùng lại dữ liệu của (1) |
| 6 | Dọn ~2.200 dòng code chết Wave 7 + gỡ `FUEL_*` | Làm cùng (1), tránh để hai luồng bàn giao mâu thuẫn tồn tại song song |

Mục 1, 4, 6 gần như thuần FE và có thể làm gọn trong một đợt. Mục 2 và 3 cần quyết định sản phẩm
của bạn trước (hạn phản hồi bao lâu? huỷ trong bao lâu thì không mất phí? dùng nhà cung cấp SMS
nào?), nên tôi để nguyên dạng câu hỏi chứ chưa đề xuất con số.

---

## 5. Việc chưa làm rõ, cần bạn quyết

1. **Ảnh bàn giao là bắt buộc hay tuỳ chọn?** Design 14 §2 nói tuỳ chọn (để không chặn happy path),
   nhưng `HANDOVER_REQUIRED_SLOTS` trong code lại khai 2 góc bắt buộc. Hai nguồn đang mâu thuẫn.
2. **Khách được huỷ tới lúc nào** và có ràng buộc phí không?
3. **Hạn phản hồi của gian hàng** — bao lâu thì yêu cầu tự hết hạn?
4. **Khách có được xem ảnh bàn giao không?** (minh bạch ↔ riêng tư của gian hàng)
