# Module Vehicle trên app native — đã làm gì, còn nợ gì

> Ngày viết: 03/09/2026 · Nhánh `feature/mobile-vehicle-module` (đã ff tới `551b392`)
> Kế hoạch gốc: `docs/plans/2026-09-03-mobile-vehicle-module.md` — đọc §7 để biết BẢY quyết định
> đã chốt và vì sao.
>
> Tài liệu này viết cho **người làm module tiếp theo**. Nó trả lời hai câu: *cái gì đã chạy được*
> và *chỗ nào còn hở, hở tới mức nào*.

---

## 1. Giao được gì

**11/13 mục.** VEH-08 bỏ (tracking đánh `Blocked`), VEH-13 hoãn (§5).

| VEH | Nội dung | Màn / file |
| --- | --- | --- |
| 01 | Danh sách xe của gian hàng | `features/vehicles/VehicleListScreen.tsx` · `components/VehicleCard.tsx` · `FleetSummaryBar` · `VehicleAlertChips` |
| 02 | Thêm xe — wizard 4 bước | `CreateVehicleScreen.tsx` · `components/VehicleFormSteps.tsx` · `VehicleWizardBar` · `VehicleCreateSuccess` |
| 03 | Hồ sơ 360 | `VehicleDetailScreen.tsx` · `components/VehicleAlertList.tsx` |
| 04 | Sửa xe — hub 6 mục | `VehicleEditHubScreen.tsx` · `VehicleEditFormScreen.tsx` |
| 05 | Giá & chính sách theo xe | `features/vehicle-pricing/` (screen · `PolicySections` · `schema.ts` · `form.ts`) |
| 06 | Ảnh xe (R2) | `src/lib/r2-image-upload.ts` · `components/VehicleImagePicker.tsx` |
| 07 | Giấy tờ xe | `features/vehicle-documents/` |
| 09 | Bảo dưỡng (xe + trung tâm đội xe) | `features/vehicle-maintenance/` (2 screen · `MaintenanceRecordSheet` · `MaintenanceAttachments`) |
| 10 | Số KM: ghi nhận · lịch sử · đính chính | khối trong `VehicleMaintenanceScreen` |
| 11 | Nguồn xe (4 biến thể) | `VehicleSourceScreen.tsx` · `source-mappers.ts` |
| 12 | Đăng lên chợ | `components/VehiclePublishCard.tsx` · `publication.ts` |

**Điểm nối hạ tầng đã dựng**

- `packages/api-client`: `features/vehicles` (từ 1 → 20 hàm), `features/branches`,
  `features/vehicle-documents`, `features/vehicle-maintenance`. `vehicleFiltersToParams` đã có
  `sort`.
- `apps/mobile/src/navigation/routes.ts`: namespace xe + `vehicleEditTab()`;
  `navigation/vehicle-edit-tab.ts` giữ sáu giá trị `?tab=` dùng chung với web.
- `manage-nav.ts`: `href` cho `vehicles` và `maintenance`, thêm trường `feature` (ADR 0027).
- `i18n/messages.ts`: thêm namespace `Vehicles` và `Branches` cho cả hai ngôn ngữ.
- Component dùng chung mới: `components/ui/NumberField.tsx`.
- Lối vào hồ sơ xe từ hộp thư yêu cầu thuê (`BookingRequestDetailScreen`).

**i18n**: +352 khoá vào `packages/domain/messages/{vi,en}/vehicles.json` (`pricing.*`,
`documents.*`, `maintenance.*`) — bản `vi` **chép nguyên văn từ component web**, bản `en` dịch
mới. Tổng gốc chung: 3607 khoá, parity vi↔en khớp.

**Kiểm tra lần cuối**: `typecheck` 0 · `lint` 0 · mobile test 246 pass/3 skip · `i18n:check` OK ·
web test 1802/1802 pass.

---

## 2. Chỗ CỐ Ý khác web (đã duyệt, đừng "sửa lại cho giống")

| Chỗ | App làm gì | Vì sao |
| --- | --- | --- |
| Sửa xe | **6 route**, không phải 6 tab | 390px không chứa nổi 6 tab chữ. Giá trị đoạn đường dẫn lấy từ `vehicle-edit-tab.ts` — cùng bộ chuỗi `?tab=` của web, nên liên kết sâu vẫn tới đúng chỗ. Kế hoạch §7.1 |
| Hồ sơ 360 | **Không có** khối tiền theo kỳ (`FinanceEntityPanel`) | Thuộc module Finance, chưa có bản native. Kế hoạch §7.5 |
| Hộp thư yêu cầu → hồ sơ xe | **Đẩy màn**, web mở overlay | Hành vi đi sâu chuẩn của stack khu quản lý; nút Lui trả về đúng hộp thư. Kế hoạch §7.6 |
| Giấy tờ | Không có khối OCR | VEH-08 `Blocked` — web chưa có bản tương đương để clone |

---

## 3. TECH DEBT — việc còn nợ

Xếp theo mức cản trở. Mục 3.1–3.2 là **thiếu tính năng**; 3.3–3.6 là **nợ chất lượng**.

### 3.1 VEH-13 — giá theo ngày (CHẶN bởi module Calendar)

Chưa dựng. Lối vào duy nhất trên web là **bấm một ô ngày** ở `/manage/calendar`
(`CalendarScheduler.tsx:350`), và app chưa có màn lịch (CAL-01).

Phần chuẩn bị đã xong, khi CAL-01 tới chỉ còn ~150 dòng:

- 24 khoá `Calendar.dailyPrice.*` đã có vi+en;
- `queryKeys.calendar.vehicleDailyPrices` đã có;
- `MonthGrid` · `BottomSheet` · `MoneyField` đã có;
- **còn thiếu**: 3 endpoint (`GET /vehicles/:id/daily-prices?from&to`, lưu, xoá) trong
  `packages/api-client`, và thêm namespace `Calendar` vào `apps/mobile/src/i18n/messages.ts`.

⚠️ **Đừng chế lối vào từ màn Giá & chính sách.** Web không có, và khi CAL-01 tới sẽ thành hai
lối vào cho một việc.

### 3.2 Bảo dưỡng — hai chỗ chưa nối

- **Đính kèm chứng từ ở màn TRUNG TÂM bảo dưỡng**: `MaintenanceAttachments` mới gắn trong
  `VehicleMaintenanceScreen` (theo từng xe). Bảng đội xe chưa có.
- **`PATCH /maintenance/records/:id/cost` không dùng** — web cũng không dùng (chi phí đi kèm
  create/update/complete). Ghi ở đây để người sau không tưởng là bỏ sót.

### 3.3 Chưa có test nào cho module này

Toàn bộ 246 test đang pass là test CŨ. Module Vehicle **không thêm test nào**. Ba chỗ đáng viết
trước tiên, vì chúng là luật nghiệp vụ chứ không phải trình bày:

1. `publication.ts` — điều kiện lên chợ theo dịch vụ xe đăng (đã là hàm thuần, dễ test).
2. `sensitive-changes.ts` — phải khớp `hasSensitiveChange` của backend; lệch là hộp xác nhận nói
   một đằng backend làm một nẻo.
3. `VehiclePricingScreen` — nhánh `source: 'shop' | 'vehicle'` và điều kiện `priceChanged` quyết
   định xe có bị đưa về chờ duyệt lại hay không (ADR 0008).

### 3.4 Thông báo lỗi của yup là tiếng Việt cứng

`@xeprime/validators` gắn cứng câu lỗi tiếng Việt ("Tên xe là bắt buộc"…). Người đang xem tiếng
Anh vẫn thấy tiếng Việt ở lỗi form. **Web y hệt** — đây là nợ chung của cả hai client, không
phải lỗi riêng của app. Sửa thì phải sửa ở package và đổi cả hai bên cùng lúc.

### 3.5 Ba khu web vẫn còn chuỗi thô

`VehiclePricingWorkspace`, `VehicleDocumentsWorkspace`, `VehicleMaintenanceWorkspace` +
`/manage/maintenance` của **web** vẫn hardcode tiếng Việt. App đã dùng `t()` với bộ khoá mới, và
bản `vi` chép nguyên văn từ chính các component đó — nên chuyển web sang sau này chỉ là **thay
chuỗi bằng `t()`**, không phải dịch lại. Quyết định §7.3.

### 3.6 Bẫy hạ tầng — `.expo/types/router.d.ts` sinh SAI

Khi có một Metro khác đang chạy (ví dụ cổng 8081 của phiên khác), nó tự cập nhật file này theo
kiểu **tăng dần** và ra danh sách route thiếu/sai. Triệu chứng: typecheck báo một route hợp lệ là
`Type '"/manage/vehicles/[id]/edit"' is not assignable`, hoặc sinh ra `.../edit/index` như một
đoạn tĩnh.

**Cách chữa**: `rm -rf apps/mobile/.expo/types` → khởi động Expo ở một cổng còn trống → đợi sinh
xong → **rồi mới** chạy typecheck. Đã ghi vào `apps/mobile/README.md` §10.

---

## 4. Ba luật của module này — người sau đừng phá

1. **Ba trạng thái tách bạch cho chỉ số/cảnh báo**: đang tải · gọi hỏng · xong-mà-rỗng. Không bao
   giờ dựng `0 cảnh báo` hay `0 km` giả — KM chưa có thì nói "Chưa có" (`Common.labels.emptyValue`).
2. **Message có thẻ rich (`<b>`, `<n>`) BẮT BUỘC đi qua `t.rich`.** Gọi `t()` trần thì use-intl
   không dựng nổi và **in ra nguyên khoá** trên màn hình. Đã dính đúng lỗi này ở
   `overview.odometer` và `source.confirmType.body`. Bốn khoá còn lại cần chú ý:
   `list.row.{bookings,income,profit,loss}`, `overview.plate`,
   `source.partnership.shopShare`.
3. **Payload từng màn sửa xe tách riêng** — `informationValuesToInput` không mang media,
   `mediaValuesToInput` không mang giá. Gộp lại là mất ảnh khi sửa biển số.

---

## 5. Việc kế tiếp nên làm theo thứ tự nào

1. **Làm mịn UI/UX màn danh sách xe và hồ sơ 360** — đã có phản hồi thực tế từ ảnh chụp màn hình
   ngày 03/09: thẻ xe quá cao (chip trạng thái xuống dòng, dòng chỉ số wrap), danh sách thông số
   kỹ thuật 17 dòng phần lớn rỗng, tiêu đề thẻ không nhất quán (`VehiclePublishCard` dùng chữ
   thường trong khi các thẻ khác viết hoa nhỏ).
2. Viết ba bộ test ở §3.3.
3. CAL-01 (module Calendar) → mở khoá VEH-13.
