# Kế hoạch: Module Vehicle cho app native (VEH-01 → VEH-13)

> Ngày viết: 03/09/2026 · Trạng thái: **KẾ HOẠCH — CHƯA CODE. Bảy điểm mở đã CHỐT (§7).**
> Nhánh: `feature/mobile-vehicle-module`, tách từ `feature/mobile-booking-rental` (không tách từ
> `origin/develop`: khu quản lý — `ManageListShell` · `manage-nav` · `ScopeGuard` — mới chỉ có ở
> nhánh booking; `git branch -r --contains HEAD` ngày 03/09 xác nhận).
> Phạm vi: `apps/mobile` + `packages/api-client` + `packages/domain/messages`.
>
> Toàn bộ tài liệu này là **kết quả rà soát thật** trên `apps/web/src/features/vehicles/` (39
> component + 13 hook + 9 file logic), `apps/web/src/features/{vehicle-documents,
> vehicle-maintenance,rental-policies,calendar}`, `apps/api/src/modules/vehicles/*` và
> `packages/{types,validators,api-client,domain}` ngày 03/09/2026 — không phải giả định. Mọi
> đường dẫn, tên endpoint, tên khoá i18n dưới đây đều đã mở file ra đối chiếu.

---

## 0. Nguyên tắc bao trùm

**`apps/mobile` là bản CLONE NATIVE của `apps/web`.** Lấy 100% từ web: câu chữ, luật nghiệp vụ,
điều kiện hiện/ẩn, thứ tự trường, phép tính, endpoint, quyền gác từng hành động.

| Phải giống web tuyệt đối | Được làm khác |
| --- | --- |
| Điều kiện của mỗi hành động, quyền gác nó | Bảng → thẻ · modal → bottom sheet · tab → màn riêng |
| Payload từng tab (`informationValuesToInput` ≠ `mediaValuesToInput`) | Cách chia bước, cách gom khối |
| Checklist điều kiện lên chợ (`publication.ts`) | Vị trí nút, thanh dính đáy |
| So sánh thay đổi nhạy cảm (`sensitive-changes.ts`) | Cách trình bày hộp xác nhận |
| Schema yup (`@xeprime/validators`), mã lỗi | Cách trình bày lỗi |

**Ba phát hiện quyết định hình dạng của kế hoạch này:**

1. **Luật nghiệp vụ đã là hàm thuần dùng chung — đừng viết lại.** `publication.ts`,
   `sensitive-changes.ts`, `pricing.ts`, `mappers.ts`, `source-mappers.ts` của web đều
   framework-free (chỉ import `@xeprime/types` + `@xeprime/validators`). Mọi schema form đã nằm
   ở `@xeprime/validators`: `vehicleFormSchema`, `vehicleSourceFormSchema`,
   `vehicleDocumentFormSchema`, `maintenanceProfileFormSchema`, `odometerCorrectionFormSchema`,
   `maintenanceRecordFields`. **Viết lại bất kỳ thứ nào là lỗi review.**

2. **`Vehicles` namespace ĐÃ CÓ 500 khoá vi+en** ở `packages/domain/messages/{vi,en}/vehicles.json`
   — phủ trọn list · form · wizard · publish · overview · edit · source. Đây là chữ web đang
   dùng; dùng lại nguyên si.

3. **BA khu vực web CHƯA i18n hoá** (còn chuỗi tiếng Việt thô trong component):
   `VehiclePricingWorkspace` (VEH-05), `VehicleDocumentsWorkspace` (VEH-07),
   `VehicleMaintenanceWorkspace` + `/manage/maintenance` (VEH-09/10). Đây là nguồn khoá i18n
   mới duy nhất của module — cách xử lý đã chốt ở **§7.3**.

Đọc trước khi code: `CLAUDE.md` mục 3/5/6 · skill `mobile-feature` `i18n` `shared-code`
`verify-changes` · `apps/mobile/README.md` §2 §7 §8 · ADR `0005` `0006` `0007` `0008` `0011`
`0012` `0017` `0027`.

---

## 1. Bảng đối chiếu từng VEH-xx

| VEH | File web nguồn (đường dẫn thật) | Màn/route mobile sẽ dựng | Độ khó + phụ thuộc |
| --- | --- | --- | --- |
| **VEH-01** Danh sách xe | `app/(manage)/manage/vehicles/page.tsx` · `features/vehicles/components/{VehicleCardGrid,VehicleListRow,VehicleManagementCard,VehicleFilters,FleetSummaryBar,VehicleStatusChips}.tsx` · `hooks/{use-vehicles,use-vehicle-filters,use-vehicle-options,use-vehicle-row-actions,use-vehicle-card-stats,use-vehicle-alerts,use-fleet-summary}.ts` · `api.ts` `constants.ts` `calendar-link.ts` | `app/manage/(tabs)/vehicles.tsx` → `features/vehicles/VehicleListScreen.tsx` + `components/VehicleCard.tsx` | **Trung bình.** Khuôn `ManageListShell` có sẵn. Phụ thuộc: `vehicleFiltersToParams` thiếu `sort` + 3 endpoint phụ (`stats`, `alerts`, `fleet-summary`) ở `packages/api-client` |
| **VEH-02** Thêm xe | `app/(manage)/manage/vehicles/new/page.tsx` · `components/{VehicleForm,VehicleWizard,VehicleFormSections,CreateVehiclePricingStep,VehicleReviewStep,VehicleCreateSuccess}.tsx` · `mappers.ts` · `@xeprime/validators` `vehicleFormSchema` | `app/manage/vehicles/new.tsx` → `features/vehicles/CreateVehicleScreen.tsx` + `components/form/{BasicStep,SpecsBlock,PricingStep,MediaStep,ReviewStep,CreateSuccess}.tsx` | **Cao.** Form lớn nhất module (4 bước, ~45 trường). Phụ thuộc: VEH-06 (ảnh) · catalog picker (hãng/kiểu dáng/nhiên liệu/tiện ích) · `GET /branches` · `GET /shop/rental-policies` |
| **VEH-03** Hồ sơ xe 360 | `app/(manage)/manage/vehicles/[id]/page.tsx` · `components/{VehicleDetailContent,Vehicle360Overview,VehicleAlerts,VehicleCompleteness}.tsx` | `app/manage/vehicles/[id]/index.tsx` → `features/vehicles/VehicleDetailScreen.tsx` + `components/{VehicleAlertList,VehicleQuickCards,VehicleSpecsCard,VehicleSourceCard,VehicleMediaCard,VehicleActivityCard}.tsx` | **Cao.** 956 dòng web = 12 khối. Phụ thuộc: `GET /vehicles/:id/summary`, `GET /vehicles/:id/source`. `FinanceEntityPanel` **ngoài phạm vi** (§7.5). Kèm lối vào từ hộp thư yêu cầu (§7.6) |
| **VEH-04** Sửa xe 6 tab | `app/(manage)/manage/vehicles/[id]/edit/page.tsx` · `components/VehicleEditWorkspace.tsx` · `mappers.ts` `sensitive-changes.ts` · `constants/routes.ts` `VEHICLE_EDIT_TAB` | **Hub + 6 route con** (chốt §7.1): `app/manage/vehicles/[id]/edit/index.tsx` liệt kê 6 mục, cộng `edit/{information,media,source,documents,maintenance}.tsx`; mục "Giá & chính sách" trỏ thẳng route VEH-05 | **Cao.** Guard dirty gắn vào nút Lui của TỪNG màn con + hộp xác nhận thay đổi nhạy cảm phải giữ nguyên logic web |
| **VEH-05** Giá & chính sách theo xe | `app/(manage)/manage/vehicles/[id]/pricing/page.tsx` · `features/rental-policies/components/{VehiclePricingWorkspace,PolicySections,LongTermPriceHint,PolicyInfoTip}.tsx` · `rental-policies/{api,form,schema,types}.ts` · `hooks/use-vehicle-pricing.ts` | `app/manage/vehicles/[id]/pricing.tsx` → `features/vehicle-pricing/VehiclePricingScreen.tsx` | **Rất cao.** 700 + 634 dòng web, **chưa i18n**. Kế thừa ↔ ghi đè, 3 khối giá theo dịch vụ, cọc/giao nhận/quá giờ/ưu đãi theo THÁNG (ADR 0011) |
| **VEH-06** Thư viện ảnh xe | `components/VehicleFormSections.tsx` → `ImagesSection` · `components/form/{ImageUploadField,ImageGalleryField}.tsx` · `services/upload.ts` (`presignVehicleImage`, `uploadToR2`, `validateImageFile`) · `apps/api/.../storage.controller.ts` `POST /uploads/vehicle-images/presign` | `features/vehicles/components/VehicleImagePicker.tsx` (dùng ở VEH-02 bước 3 và VEH-04 tab Media) + `src/lib/r2-image-upload.ts` | **Trung bình-cao.** Bẫy `Content-Length` đã ký (README §9 · skill §3B): phải dùng `blob.size` của ảnh **đã nén**, không phải kích thước `ImagePicker` báo |
| **VEH-07** Giấy tờ xe | `features/vehicle-documents/components/VehicleDocumentsWorkspace.tsx` (974 dòng) · `vehicle-documents/{api,hooks,types}.ts` · `@xeprime/validators` `vehicleDocumentFormSchema` | `app/manage/vehicles/[id]/edit/documents.tsx` → `features/vehicle-documents/VehicleDocumentsScreen.tsx` + `{DocumentMetadataSheet,DocumentHistorySheet}.tsx` | **Cao.** 4 mức quyền lồng nhau · phiên bản file · tải xuống qua signed URL ngắn hạn · **chưa i18n**. Khối OCR = VEH-08 ⇒ **KHÔNG dựng** |
| **VEH-08** OCR giấy tờ | — (Tracking: `Blocked`, "Có tương đương web = FALSE") | ⛔ **BỎ QUA** | Không dựng. `OcrReviewDialog` và nút "OCR" của web **không** clone sang |
| **VEH-09** Bảo dưỡng | `app/(manage)/manage/maintenance/page.tsx` · `vehicle-maintenance/components/{MaintenanceBoardTabs,MaintenanceBoardTable,MaintenanceBoardDialogs,VehicleMaintenanceWorkspace,VehicleMaintenanceCard,MaintenanceRecordDialog}.tsx` · `vehicle-maintenance/{api,hooks,schema,types}.ts` | `app/manage/(tabs)/maintenance.tsx` → `features/vehicle-maintenance/MaintenanceBoardScreen.tsx` · và `edit/maintenance.tsx` → `VehicleMaintenanceScreen.tsx` | **Cao.** Hai màn khác nhau dùng chung một feature. Máy trạng thái phiếu (`start`/`complete`/`cancel` kèm `expectedRowVersion`) · **chưa i18n** |
| **VEH-10** Số km | `VehicleMaintenanceWorkspace` khối "Chỉ số Kilometer" · `components/{OdometerCorrectionDialog,OdometerHistoryDialog}.tsx` · `@xeprime/validators` `odometerCorrectionFormSchema` | Khối trong `VehicleMaintenanceScreen` + `components/{OdometerCorrectionSheet,OdometerHistorySheet}.tsx`. **Mobile đã có một phần**: `features/handovers/{MissingOdometerScreen,components/ResolveOdometerSheet,hooks/useResolveHandoverOdometer}` — mở rộng, KHÔNG làm lại | **Trung bình.** Đi liền VEH-09 |
| **VEH-11** Nguồn xe | `components/VehicleSourceWorkspace.tsx` (797 dòng) · `source-mappers.ts` · `hooks/use-vehicle-source.ts` · `@xeprime/validators` `vehicleSourceFormSchema` | `app/manage/vehicles/[id]/edit/source.tsx` → `features/vehicles/VehicleSourceScreen.tsx` | **Cao.** 4 biến thể form (owned/financed/rented/partnership) + tệp hợp đồng RIÊNG TƯ (presign → PUT → complete → download). **Đã i18n** (`Vehicles.source.*`) |
| **VEH-12** Đăng lên chợ | `components/VehiclePublicReviewPanel.tsx` · `publication.ts` · `hooks/{use-publication-labels,use-vehicle-mutations}.ts` | Khối `VehiclePublishCard` trong `VehicleDetailScreen` — **làm ở P1** cùng VEH-03 (chốt §7.4) | **Thấp.** Một checklist + một nút. ADR 0008: chỉ gọi `POST /vehicles/:id/submit-public`, client KHÔNG tự đặt `approved_public` |
| **VEH-13** Giá theo ngày | `features/calendar/components/DailyPriceDialog.tsx` · `calendar/api.ts` `fetchVehicleDailyPrices` · `hooks/use-calendar-mutations.ts` | ⏸ **HOÃN sang module Calendar** (chốt §7.2) | Lối vào duy nhất trên web là ô lịch của `/manage/calendar`; app chưa có màn lịch (CAL-01). Không chế lối đi mà web không có |

---

## 2. Luồng dữ liệu

### 2.1 Endpoint — backend đã đủ, không phải viết mới cái nào

Cột "api-client" = trạng thái ở `packages/api-client/src/features/vehicles/api.ts` hôm nay.
Module đó hiện **chỉ có `vehiclesApi.list`** (dựng cho `VehiclePickerSheet` của BKG-06).

| VEH | Method + path | Quyền backend | api-client |
| --- | --- | --- | --- |
| 01 | `GET /vehicles` | `vehicles.view` | ✅ có — **thiếu tham số `sort`** |
| 01 | `GET /vehicles/stats?ids=` | `vehicles.view` | ➕ thêm |
| 01, 03 | `GET /vehicles/alerts?ids=` | `vehicles.view` | ➕ thêm |
| 01 | `GET /vehicles/fleet-summary` | `vehicles.view` | ➕ thêm |
| 02 | `POST /vehicles` | `vehicles.create` | ➕ thêm |
| 03 | `GET /vehicles/:id` | `vehicles.view` | ➕ thêm |
| 03 | `GET /vehicles/:id/summary` | `vehicles.view` | ➕ thêm |
| 03 | `DELETE /vehicles/:id` | `vehicles.delete` | ➕ thêm |
| 04, 06 | `PATCH /vehicles/:id` | `vehicles.update` | ➕ thêm |
| 05 | `GET /vehicles/:id/pricing` | `vehicles.view` | ➕ thêm |
| 05 | `PUT /vehicles/:id/pricing` | `vehicles.update` | ➕ thêm |
| 02, 05 | `GET /shop/rental-policies?vehicleType=` | `vehicles.view` | ➕ thêm |
| 06 | `POST /uploads/vehicle-images/presign` | `vehicles.update` | ➕ thêm |
| 07 | `GET /vehicles/:id/documents` | `vehicles.documents.view` | ➕ thêm |
| 07 | `GET /vehicles/:id/documents/:docId` | `vehicles.documents.view_details` | ➕ thêm |
| 07 | `GET /vehicles/:id/documents/:docId/versions` | `vehicles.documents.view_files` | ➕ thêm |
| 07 | `POST /vehicles/:id/documents` · `PATCH …/:docId` · `POST …/:docId/archive` | `vehicles.documents.manage` | ➕ thêm |
| 07 | `POST …/versions/presign` · `POST …/versions` | `vehicles.documents.manage` | ➕ thêm |
| 07 | `GET …/versions/:versionId/download` | `vehicles.documents.view_files` | ➕ thêm |
| 09 | `GET`/`PUT /vehicles/:id/maintenance/profile` | `…maintenance.view` / `.manage` | ➕ thêm |
| 09 | `GET …/maintenance/records` · `POST` · `PUT :recordId` | `…maintenance.view` / `.manage` | ➕ thêm |
| 09 | `POST …/records/:id/{start,complete,cancel}` | `vehicles.maintenance.manage` | ➕ thêm |
| 09 | `POST …/records/:id/attachments[/presign]` · `GET …/download` | `.manage` / `.view_files` | ➕ thêm |
| 09 | `GET /maintenance` · `GET /maintenance/summary` | `vehicles.maintenance.view` | ➕ thêm |
| 10 | `GET …/maintenance/odometer/history` | `vehicles.maintenance.view` | ➕ thêm |
| 10 | `POST …/maintenance/odometer/correction` | `vehicles.odometer.correct` | ➕ thêm |
| 11 | `GET`/`PUT /vehicles/:id/source` | `finance.view` / `+ vehicles.update` | ➕ thêm |
| 11 | `POST …/source/contracts/presign` · `POST …/:fileId/complete` · `GET …/download` | `finance.view` (+`vehicles.update` để ghi) | ➕ thêm |
| 12 | `POST /vehicles/:id/submit-public` | `vehicles.submit_public` | ➕ thêm |
| 13 | `GET /vehicles/:id/daily-prices?from&to` · lưu · xoá | `calendar.*` (kiểm lại khi làm) | ➕ thêm |

> **`PATCH /vehicles/:id/maintenance/records/:recordId/cost` tồn tại ở backend nhưng web KHÔNG
> gọi** — `MaintenanceRecordDialog` gửi `cost` kèm create/update/complete. App clone web:
> **không dùng endpoint đó.**

### 2.2 Query key — đã đầy đủ, KHÔNG thêm khoá mới

`packages/api-client/src/query-keys.ts` đã có:
`queryKeys.vehicles.{all,list,infinite,detail,stats,alerts,alertsAll,fleetSummary,summary,pricing,
source,documents,document,documentVersions,maintenance,maintenanceProfile,maintenanceRecords,
odometerHistory}` · `queryKeys.maintenance.{all,board,summary,missingReturnKm}` ·
`queryKeys.calendar.vehicleDailyPrices` · `queryKeys.rentalPolicies.shop`.

Mobile đọc qua `apps/mobile/src/queries/query-keys.ts` (đã re-export sẵn).

Quy ước khoá theo lô id (`stats`, `alerts`): key ôm **danh sách id đã sắp xếp** của TRANG hiện
tại — đổi trang/đổi lọc là một cache entry khác, quay lại trang cũ thì dùng lại cache.

### 2.3 Mutation → invalidate nhánh nào

Chép nguyên bảng của web; sai một dòng là một màn hình kể chuyện cũ.

| Mutation | Invalidate |
| --- | --- |
| `createVehicle` | `vehicles.all` |
| `updateVehicle(id)` | `setQueryData(vehicles.detail(id))` + `vehicles.all` |
| `deleteVehicle` | `vehicles.all` |
| `submitVehiclePublic(id)` | `setQueryData(vehicles.detail(id))` + `vehicles.all` |
| `saveVehiclePricing(id)` | `setQueryData(vehicles.pricing(id))` + `vehicles.all` + `rentalPolicies.all` |
| `saveVehicleSource(id)` | `setQueryData(vehicles.source(id))` + `vehicles.all` |
| Mọi mutation **giấy tờ** | `vehicles.documents(id)` + `vehicles.alertsAll()` + `vehicles.summary(id)` |
| Mọi mutation **bảo dưỡng / KM** | `vehicles.maintenance(id)` + `maintenance.all` + `vehicles.all` + `vehicles.summary(id)` + **`calendar.all`** (phiếu bảo dưỡng chiếm/nhả chỗ trên `vehicle_occupancies` — ADR 0006) |
| Mutation ở miền khác (bàn giao) | `useInvalidateVehicleSurfaces()` — cổng chung, port nguyên từ `hooks/use-vehicle-alerts.ts` |

### 2.4 Hai luật tách query mà web cố ý áp — phải giữ

1. **`stats` và `alerts` gọi RIÊNG sau danh sách**, không gộp vào `GET /vehicles`: tổng hợp
   thu/chi chậm hơn truy vấn xe, gộp là bắt cả trang chờ theo phần chậm nhất. Chúng hỏng thì thẻ
   xe vẫn dùng được, chỉ mất phần số.
2. **Ba trạng thái tách bạch cho cảnh báo/chỉ số**: đang tải (skeleton) · gọi hỏng (nói thẳng
   "không tải được") · xong-mà-rỗng (thật sự không có việc). **Không bao giờ hiện "0 cảnh báo"
   giả hay "0 km" khi chưa có số** — web dùng `list.card.alertsUnavailable`,
   `list.card.statsUnavailable`, `list.card.odometerUnknown`, `Common.labels.emptyValue` đúng cho
   ba ca này.

---

## 3. Khoá i18n

### 3.1 Đã có sẵn từ web — **ưu tiên tuyệt đối, dùng lại nguyên si**

`packages/domain/messages/{vi,en}/vehicles.json` — **500 khoá**, phủ:

| Nhóm khoá | Phục vụ | VEH |
| --- | --- | --- |
| `list.*` (page · filters · sort · statusChips · summary · grid · card · row · actions) — ~60 | Danh sách xe | 01 |
| `form.*` (wizard · basic · specs · advanced · prices · policies · media · pricingStep · review · success · warnings · status · source) — ~175 | Wizard thêm xe | 02 |
| `overview.*` (profile · todo · schedules · performance · pricing · links · documents · specs · source · media · activity) — ~80 | Hồ sơ 360 | 03 |
| `alerts.*` · `completeness.*` — 8 | Việc cần làm, dấu ● | 01, 03 |
| `publish.*` (requirements · status · panel · sensitive) — ~40 | Checklist lên chợ + hộp xác nhận nhạy cảm | 04, 12 |
| `edit.*` (tabs · cards · discard · sensitive · advanced · pricingTab · branchInactive) — ~22 | Workspace sửa xe | 04 |
| `source.*` (banner · cardHint · confirmType · contract · owned · financed · rented · partnership) — ~90 | Nguồn xe | 11 |
| `detail.*` — 13 | Trạng thái quyền/lỗi/không tìm thấy | 03 |

Dùng chung thêm — **không tạo bản sao**: `Common.*` (actions · labels · units · filters) ·
`Domain.*` (mọi enum: `vehicleType` `vehicleOperationStatus` `vehiclePublicStatus`
`vehicleSourceType` `vehicleFeature` `vehicleAlertSeverity` `vehicleAlertShort` `bodyType`
`fuelType` `transmissionType` `vehicleDocumentType` `vehicleDocumentPresentation`
`maintenanceType` `maintenanceStatus` `maintenanceDueStatus` `maintenanceBoardFilter`
`odometerSource` `odometerCorrectionReason` `vehicleFinanceInterestMethod` `policySource`
`collateralMode` `collateralAssetType`) · `Errors.*` · `ManageCommon.*` ·
`Navigation.manage.{vehicleList,maintenance}`.

`Calendar.dailyPrice.*` — **24 khoá đã có**, đủ trọn cho VEH-13.

### 3.2 Phải thêm mới — chỉ ở ba khu web còn chuỗi thô

Text `vi` **chép nguyên văn từ component web**, không viết lại; bản `en` dịch mới.

| Khối khoá mới | Nguồn chép | VEH | Ước lượng |
| --- | --- | --- | --- |
| `Vehicles.pricing.*` — nguồn chính sách (kế thừa/ghi đè) · 3 khối giá theo dịch vụ · cọc & thế chấp · giao nhận theo bậc · quá giờ · ưu đãi theo tháng · preview giá sàn · xác nhận đặt lại | `rental-policies/components/{VehiclePricingWorkspace,PolicySections,LongTermPriceHint,PolicyInfoTip}.tsx` | 05 | ~85 |
| `Vehicles.documents.*` — danh mục · hàng giấy tờ · sheet metadata · lịch sử phiên bản · lưu trữ · tải lên/tải xuống · 4 trạng thái quyền | `vehicle-documents/components/VehicleDocumentsWorkspace.tsx` (**trừ khối OCR** — VEH-08 bỏ) | 07 | ~60 |
| `Vehicles.maintenance.*` — khối Odo · theo dõi thay nhớt · lịch sắp tới · lịch sử · phiếu bảo dưỡng · đính chính KM · lịch sử KM · trung tâm bảo dưỡng (tab/lọc/sắp xếp/bảng) | `vehicle-maintenance/components/*` + `app/(manage)/manage/maintenance/page.tsx` | 09, 10 | ~95 |

**Không** tạo namespace mới. **Không** chép chữ sang `mobile-shell` — namespace đó là VỎ app
(màn lỗi cấp app, not-found, điều hướng gốc), không phải "mọi chữ của mobile".

### 3.3 Bảng gom mobile

`apps/mobile/src/i18n/messages.ts` hiện gom 16 namespace, **chưa có `Vehicles`**. Thêm cho **cả
`vi` và `en`**: `Vehicles` (đợt P1) và `Calendar` (đợt P3, chỉ khi làm VEH-13). Chạy
`pnpm --filter @xeprime/web i18n:check` sau mỗi lần chạm.

---

## 4. Tái sử dụng vs viết mới

### 4.1 Tái sử dụng — không được dựng lại

| Thứ | Ở đâu | Dùng cho |
| --- | --- | --- |
| Toàn bộ type DTO | `@xeprime/types` `api.generated.ts` (`VehicleListItemDto` `VehicleDetailDto` `Vehicle360SummaryDto` `VehicleAlertsDto` `VehicleStatsDto` `FleetSummaryDto` `VehicleSourceDto` `VehiclePricingDto` `VehicleDocument*Dto` `Maintenance*Dto` `OdometerReadingDto`…) | mọi VEH |
| 6 schema form | `@xeprime/validators` (§0 điểm 1) | 02, 04, 07, 09, 10, 11 |
| Query key | `@xeprime/api-client` `query-keys.ts` | mọi VEH |
| HTTP client + Bearer + refresh | `apps/mobile/src/lib/api-client.ts` (side-effect import trong `features/*/api.ts`) | mọi VEH |
| Vỏ màn danh sách | `features/shell/{ManageListShell,ManageStateScroll,ManageFilterSheet,ManageHeader}` | 01, 09 |
| Ẩn/hiện theo cuộn · phân trang | `hooks/use-collapse-on-scroll` · `queries/{use-clamped-page,keep-page-data}` | 01, 09 |
| Tìm kiếm debounce | `hooks/use-debounced-value` | 01, 09 |
| UI kit | `components/ui/`: `Card` `DataRow` `StatusBadge` `Chip` `Skeleton` `BottomSheet` `AlertDialog` `Button` `IconButton` `SelectControl`/`SelectField` `MoneyField` `TextField` `DatePickerSheet` `MonthGrid` `Pagination` `DetailArrow` `InlineAction` `RadioOption` `StepSlider` `RangeSlider` `SearchInput` `FormSection` `Field`/`FieldBox` | mọi VEH |
| Trạng thái màn | `components/state/{ScreenMessage,ScreenError,ScreenLoading}` | mọi VEH |
| Khuôn màn danh sách | `features/bookings/BookingListScreen.tsx` (đọc làm mẫu) | 01, 09 |
| Khuôn màn chi tiết | `features/bookings/BookingDetailScreen.tsx` (AppHeader → Screen → Card/DataRow → footer dính đáy) | 03, 04, 05 |
| Ảnh danh mục | `features/catalog/{brand-art,body-type-art}.ts` + `components/CatalogCardPicker` | 02 |
| KM biên bản (một phần VEH-10) | `features/handovers/{MissingOdometerScreen,components/ResolveOdometerSheet,hooks/useResolveHandoverOdometer}` | 10 |
| Định dạng | `i18n/use-app-format` — `money` `moneyCompact` `pricePerDay/Hour/Month` `km` `kmNumber` `count` `date` `dateTime` `dateKey` `serviceTypes` `packageLabel` (đủ, không thiếu hàm nào) | mọi VEH |
| Nhãn enum | `i18n/domain.ts` `useDomainLabel()` | mọi VEH |
| Lỗi API theo MÃ | `i18n/use-error-message.ts` · `ScreenError` | mọi VEH |
| Token | `theme/{tokens,layout,motion,elevation}` | mọi VEH |
| Nén + tải ảnh lên R2 (bài học `Content-Length`) | `features/handovers/photo-upload.ts` — **đọc trước khi viết `r2-image-upload.ts`** | 06 |

### 4.2 Viết mới — mỗi dòng kèm lý do KHÔNG dùng được thứ sẵn có

| Viết mới | Vì sao không dùng được cái sẵn có |
| --- | --- |
| `packages/api-client/src/features/vehicles/api.ts` — mở rộng từ 1 lên ~20 hàm | Module hiện chỉ có `list` cho bộ chọn xe; docblock của nó nói thẳng "app native chưa phục vụ" hồ sơ 360 — đây chính là lúc mở. **Thêm vào file này, không viết fetch riêng ở mobile** |
| `packages/api-client/src/features/vehicle-documents/api.ts` · `.../vehicle-maintenance/api.ts` | Hai miền khác `vehicles` về controller, quyền và query key; nhét chung một file 35+ hàm là một khối không ai đọc nổi. Cùng cách `bookings`/`handovers`/`settlement` đã tách |
| `apps/mobile/src/features/vehicles/components/VehicleCard.tsx` | Web có HAI hình thái (`VehicleManagementCard` desktop 5 cột · `VehicleListRow` ≤640px). Native chỉ cần một, và cả hai đều là DOM (`<article>` `<dl>` `RowActions` `StatusTag`). **Dữ liệu và ba trạng thái cảnh báo/chỉ số clone y nguyên từ `VehicleListRow`** |
| `apps/mobile/src/features/vehicles/components/form/*` (5 file bước) | `VehicleFormSections.tsx` là AntD `Row`/`Col`/`Radio.Group`/`Checkbox.Group` + `Form.Item`, không có bản native. Nhưng **thứ tự trường, nhãn, điều kiện hiện/ẩn (`offersLongTerm`, `offersWithDriver`, `isCar`), hai cảnh báo (`VehicleTypePolicyWarning`, `ServicePriceRemovalWarning`) và `VEHICLE_SECTIONS.fields` để validate riêng bước đang mở** phải chép nguyên |
| `apps/mobile/src/lib/r2-image-upload.ts` | `services/upload.ts` của web dùng `File`/`XMLHttpRequest` — không tồn tại trên native. `photo-upload.ts` của handover thì gắn cứng vào `handoversApi.presignPhoto`. Cần một lớp mỏng: chọn/chụp → nén → đo `blob.size` → presign → PUT |
| `apps/mobile/src/features/vehicles/components/VehicleWizardBar.tsx` | AntD `Steps` không có bản native; Tamagui không có widget bước |
| `apps/mobile/src/navigation/routes.ts` → namespace `vehicles` | `ROUTES.manage` chưa có route xe nào. Bắt buộc theo skill §2b — cấm chuỗi đường dẫn trần trong component |
| Các `BottomSheet` thay `ResponsiveDialog` (metadata giấy tờ · lịch sử phiên bản · phiếu bảo dưỡng · đính chính KM · lịch sử KM · giá theo ngày · xác nhận thay đổi nhạy cảm) | `ResponsiveDialog` là AntD `Modal`. `BottomSheet` của mobile đã mang sẵn `KeyboardAvoidingView` — bắt buộc cho form nằm trong modal (skill §4) |
| `publication.ts` `sensitive-changes.ts` `pricing.ts` `mappers.ts` `source-mappers.ts` | **CHÉP FILE** sang `apps/mobile/src/features/vehicles/`, không viết lại logic. Đúng luật "clone from web by default" của skill §0; chưa đẩy lên `packages/domain` khi mới một client dùng tới bản native |

---

## 5. Chia đợt

Mỗi chặng: code → chạy đủ 4 lệnh kiểm tra → báo cáo → **chờ duyệt** trước khi đi tiếp.
**Bốn chặng**, vì P1 chia đôi (chốt §7.7).

### Chặng P1a — hạ tầng + danh sách xe (VEH-01)

1. **Hạ tầng** (không màn nào chạy nếu thiếu):
   - `packages/api-client` — phần đọc của `vehicles`: `list` (**thêm tham số `sort`**), `stats`,
     `alerts`, `fleetSummary`, `detail`, `summary`; phần ghi: `create`, `update`, `delete`,
     `submitPublic`;
   - `apps/mobile/src/i18n/messages.ts` — thêm namespace `Vehicles` cho **cả vi và en**;
   - `navigation/routes.ts` — namespace `vehicles`;
   - `features/shell/manage-nav.ts` — `href` cho mục `vehicles`;
   - `app/manage/(tabs)/_layout.tsx` — `<Tabs.Screen name="vehicles" />`;
   - chép `publication.ts` `pricing.ts` `mappers.ts` `sensitive-changes.ts` sang
     `apps/mobile/src/features/vehicles/`.
2. **VEH-01** `VehicleListScreen` — `ManageListShell` + `Animated.FlatList` + `VehicleCard`;
   lọc (loại xe · dịch vụ · vận hành · công khai · sắp xếp) trong `ManageFilterSheet`, tìm kiếm
   debounce 350 ms, dải chỉ số đội xe, phân trang server-side, đủ 4 trạng thái màn (rỗng phân
   biệt "đang lọc" ↔ "chưa có xe nào"), ba trạng thái riêng cho `stats`/`alerts` (§2.4).

**Xong P1a = mở app → vào khu quản lý → thấy và lọc được đội xe.** Đây là điểm dừng để soi
khuôn thẻ xe và cách gọi `stats`/`alerts` trước khi hai màn còn lại đi theo.

### Chặng P1b — hồ sơ xe + đăng lên chợ + thêm xe (VEH-03, 12, 02)

1. **VEH-03** `VehicleDetailScreen` — thẻ hồ sơ (ảnh · định danh · KM + nguồn KM · hai trục
   trạng thái · banner duyệt) → việc cần làm · lịch thuê sắp tới · hiệu suất → giá & chính sách ·
   giấy tờ (chỉ ĐẾM theo cảnh báo, không PII) · thông số · nguồn xe · thư viện ảnh → hoạt động
   gần đây → footer dính đáy (Sửa · Xem lịch) + menu ⋮ Xoá kèm `AlertDialog`.
   **Không** dựng `FinanceEntityPanel` (§7.5).
2. **VEH-12** — `VehiclePublishCard` trong chính màn trên: checklist từ
   `applicablePublishRequirements`, nút gửi duyệt khoá khi còn điều kiện thiếu, nhãn
   "Gửi duyệt" ↔ "Gửi duyệt lại" theo `VEHICLE_PUBLIC_STATUS_SUBMITTABLE`.
3. **Lối vào từ hộp thư yêu cầu** (§7.6) — khối "Xe" ở `BookingRequestDetailScreen` thành vùng
   chạm dẫn sang `ROUTES.manage.vehicleDetail(id)`. Đây là **file duy nhất của module Booking**
   mà module này chạm tới.
4. **VEH-02** `CreateVehicleScreen` — 4 bước (Cơ bản → Giá → Ảnh → Xác nhận), validate **riêng
   bước đang mở** theo `VEHICLE_SECTIONS.fields`, hai hành động cuối ("Lưu nháp" ·
   "Lưu & Gửi duyệt" = `POST /vehicles` rồi `POST /vehicles/:id/submit-public`; bước hai hỏng thì
   xe VẪN đã tạo — thông báo phải nói đúng điều đó), màn thành công + checklist.
   Kéo theo phần tối thiểu của VEH-06 (ảnh đại diện + thư viện).

### Chặng P2 — sửa xe, ảnh, giá (VEH-04, 06, 05)

1. **VEH-04** — hub `edit/index.tsx` (6 mục) + màn `information` và `media`; guard dirty gắn vào
   nút Lui của từng màn con; hộp xác nhận thay đổi nhạy cảm (`sensitiveChanges`) khi xe đang
   `approved_public`. Bốn mục còn lại của hub dẫn tới màn của P2/P3.
2. **VEH-06** — `r2-image-upload.ts` hoàn chỉnh (chụp/chọn · nén · presign · PUT · gỡ · đổi ảnh
   đại diện · tối đa 20 ảnh), dùng chung cho VEH-02 và tab Media.
3. **VEH-05** — `VehiclePricingScreen`: kế thừa ↔ ghi đè, 3 khối giá theo dịch vụ xe đăng, cọc/
   thế chấp, giao nhận theo bậc, quá giờ, ưu đãi theo THÁNG LỊCH (ADR 0011 — không nhân
   `số tháng × 30`), preview giá sàn, xác nhận "đặt lại theo chính sách gian hàng".
   Kèm ~85 khoá i18n mới.

### Chặng P3 — nguồn xe, bảo dưỡng, KM, giấy tờ (VEH-11, 09, 10, 07)

1. **VEH-11** — `VehicleSourceScreen` (4 biến thể + tệp hợp đồng riêng tư). Chữ đã có sẵn.
2. **VEH-09 + VEH-10** — `VehicleMaintenanceScreen` (mục trong hub sửa xe) rồi
   `MaintenanceBoardScreen` (mục menu `/manage/maintenance`, `ManageListShell` + tab nhóm việc);
   khối KM + đính chính + lịch sử, nối vào phần đã có ở `features/handovers`. Kèm ~95 khoá mới.
3. **VEH-07** — `VehicleDocumentsScreen` (**không** khối OCR). Kèm ~60 khoá mới.

**VEH-08 bỏ · VEH-13 hoãn sang module Calendar** ⇒ module này giao **11/13 mục**.

---

## 6. Điểm nối hạ tầng

| Mảnh | Việc phải làm |
| --- | --- |
| `apps/mobile/src/navigation/routes.ts` | Thêm namespace `vehicles` trong `ROUTES.manage`: `vehicles()` `vehicleNew()` `vehicleDetail(id)` `vehicleEdit(id)` `vehicleEditTab(id, tab)` `vehiclePricing(id)` `maintenance()`. Giá trị `tab` lấy từ hằng dùng chung, **không** chuỗi trần |
| `apps/mobile/src/features/shell/manage-nav.ts` | Gắn `href` cho hai mục đang trống: `vehicles` (`manage.vehicleList`, `PERMISSION.VEHICLE_VIEW`) và `maintenance` (`manage.maintenance`, `PERMISSION.VEHICLE_MAINTENANCE_VIEW`). Cây menu là gương của `apps/web/src/constants/nav.ts` — không đổi khoá, thứ bậc hay quyền |
| `apps/mobile/app/manage/(tabs)/_layout.tsx` | Khai **tường minh** `<Tabs.Screen name="vehicles" />` (P1) và `<Tabs.Screen name="maintenance" />` (P3) — thiếu là mất icon, tiêu đề thành tên file |
| Route file mới | `(tabs)/vehicles.tsx` (P1a) · `vehicles/new.tsx` · `vehicles/[id]/index.tsx` (P1b) · `vehicles/[id]/edit/index.tsx` + `edit/{information,media}.tsx` · `vehicles/[id]/pricing.tsx` (P2) · `(tabs)/maintenance.tsx` · `edit/{source,documents,maintenance}.tsx` (P3). **Màn đi sâu nằm NGOÀI `(tabs)`** — lý do ở docblock `app/manage/_layout.tsx` |
| `apps/mobile/src/features/booking-requests/BookingRequestDetailScreen.tsx` | **File duy nhất của module Booking bị chạm** (§7.6): khối "Xe" thành vùng chạm dẫn sang `ROUTES.manage.vehicleDetail(id)`. Không đổi dữ liệu, không đổi quyền, không đổi chữ |
| `apps/mobile/src/i18n/messages.ts` | Thêm `Vehicles` cho **cả hai** ngôn ngữ ở P1a, rồi `i18n:check`. `Calendar` **không** thêm (VEH-13 hoãn) |
| `packages/api-client/src/features/{vehicles,vehicle-documents,vehicle-maintenance}/api.ts` + `index.ts` | Bổ sung endpoint (§2.1) + export. Chạm `packages/*` ⇒ **phải chạy thêm `pnpm --filter @xeprime/web test`** |
| `packages/domain/messages/{vi,en}/vehicles.json` | Thêm 3 khối khoá mới (§3.2), `vi` chép nguyên văn từ web |
| `usePermissions()` + `PERMISSION.*` | Chỉ để ẩn/hiện. Guard backend là lớp chặn thật (CLAUDE.md mục 6) |
| `use-manage-nav-badges.ts` | **Không đụng** — web chỉ gắn huy hiệu ở `bookingRequestsPending` và `chatUnread`; xe không có huy hiệu |
| `ScopeGuard` | Đã bọc ở `app/manage/_layout.tsx` — **không** kiểm tra tenant lại trong từng màn |
| `apps/mobile/README.md` §8 §10 · `docs/CODEMAP.md` | Cập nhật khi thêm component vào `components/ui/` hoặc thêm module `features/*` — trong CÙNG commit (skill §7) |

---

## 7. Quyết định đã chốt (03/09/2026) + rủi ro còn lại

Bảy điểm mở của bản nháp đã được trả lời. Từ đây chúng là **hợp đồng** — muốn lệch thì dừng,
giải thích, xin duyệt lại.

### 7.1 VEH-04 — **Hub + 6 route con** ✅

`app/manage/vehicles/[id]/edit/index.tsx` liệt kê 6 mục bằng đúng nhãn `Vehicles.edit.tabs.*` đã
có; mỗi mục mở một màn riêng, mỗi màn một form và một nút Lưu. Mục "Giá & chính sách" trỏ thẳng
`vehicles/[id]/pricing.tsx` (route VEH-05), không nhân bản màn.

Hệ quả phải làm đúng:
- Guard "bỏ thay đổi" gắn vào **nút Lui của từng màn con**, không phải hộp thoại đổi tab như web;
- `?tab=` của web ánh xạ sang `ROUTES.manage.vehicleEditTab(id, tab)` — giá trị `tab` lấy từ hằng
  dùng chung, để deep link/push notification hai nền tảng vẫn trỏ cùng chỗ;
- Payload từng màn giữ nguyên web: `informationValuesToInput` ≠ `mediaValuesToInput` (không màn
  nào ghi đè dữ liệu của màn khác).

### 7.2 VEH-13 — **hoãn sang module Calendar** ✅

Không dựng trong module này. Lối vào duy nhất trên web là ô ngày của `/manage/calendar`; chế thêm
một lối đi mới sẽ vi phạm nguyên tắc "không tự nghĩ". `Calendar.dailyPrice.*` (24 khoá) và
`queryKeys.calendar.vehicleDailyPrices` đã sẵn sàng cho lúc CAL-01 tới — không thêm namespace
`Calendar` vào bảng gom mobile ở đợt này.

### 7.3 i18n — **chỉ thêm khoá, KHÔNG sửa `apps/web`** ✅

Thêm ~240 khoá vào `packages/domain/messages/{vi,en}/vehicles.json`: `vi` **chép nguyên văn** từ
component web, `en` dịch mới. Không chạm component web — ngoài phạm vi VEH-01→13 của
`apps/mobile`, và sẽ kéo theo loạt test web đang khớp chuỗi tiếng Việt.

**Nợ ghi lại:** ba khu `VehiclePricingWorkspace` · `VehicleDocumentsWorkspace` ·
`VehicleMaintenanceWorkspace` + `/manage/maintenance` của web vẫn còn chuỗi thô. Sau này chuyển
chúng chỉ là thay chuỗi bằng `t()` với đúng bộ khoá này — không phải dịch lại.

### 7.4 VEH-12 — **kéo về P1b** ✅

Làm ngay khi `VehicleDetailScreen` còn đang mở (~80 dòng, dùng `publication.ts` vừa chép sang).
Màn hồ sơ 360 ra mắt đầy đủ ở P1, không phải mở lại file ở đợt sau.

### 7.5 `FinanceEntityPanel` — **bỏ khỏi phạm vi** ✅

Không dựng, và **không để lại chỗ trống nào nhắc tới nó**. Nó thuộc module Finance, gác
`finance.view`, chưa có bản native. Đây là khối duy nhất của Hồ sơ 360 web mà app chưa có — sẽ
ghi rõ trong báo cáo cuối P1b.

### 7.6 Lối mở hồ sơ xe từ hộp thư yêu cầu — **nối luôn ở P1b** ✅

Khối "Xe" ở `BookingRequestDetailScreen` thành vùng chạm dẫn sang
`ROUTES.manage.vehicleDetail(id)`.

Khác web ở **vỏ, không ở nghĩa**: web mở overlay (`VehicleDetailDialog`) để không rời hộp thư;
native đẩy một màn và nút Lui trả về đúng chỗ cũ — đó là hành vi đi sâu chuẩn của stack (xem
docblock `app/manage/_layout.tsx`), và cũng là lý do màn chi tiết nằm NGOÀI `(tabs)`.

Đây là **file duy nhất của module Booking** mà module Vehicle chạm tới. Thân `VehicleDetailScreen`
vẫn viết sao cho tách được, đúng cách web tách `VehicleDetailContent`.

### 7.7 Nhịp làm — **P1 chia hai chặng** ✅

`P1a` (hạ tầng + VEH-01) → báo cáo → chờ duyệt → `P1b` (VEH-03 + VEH-12 + lối vào + VEH-02) →
`P2` → `P3`. Bốn điểm dừng thay vì ba: khuôn thẻ xe và cách gọi `stats`/`alerts` được soi trước
khi hai màn còn lại đi theo.

---

### Bốn rủi ro còn lại — ghi nhận, không chặn

1. **`vehicleFiltersToParams` ở `packages/api-client` thiếu `sort`.** Web gửi
   `sort=newest|name_asc|code_asc|price_asc|price_desc`. Sẽ thêm ở P1a — chạm `packages/*` nên
   **mọi chặng đều phải chạy thêm `pnpm --filter @xeprime/web test`**.
2. **Thông báo lỗi yup trong `@xeprime/validators` là tiếng Việt cứng** ("Tên xe là bắt buộc"…).
   Người đang xem tiếng Anh sẽ thấy tiếng Việt ở lỗi form. **Web đang y hệt** — app clone đúng
   hiện trạng, không tự sửa. Nợ chung của cả hai client.
3. **ADR 0027 (bậc năng lực theo gói) — sửa lại 03/09 sau khi rà kỹ.** Bản nháp ghi "web chỉ gác
   bằng permission"; **sai**. Web gác ở tầng ĐIỀU HƯỚNG: `apps/web/src/constants/nav.ts:179` đặt
   `feature: PLAN_FEATURE.MAINTENANCE` cho mục Bảo dưỡng (cùng cách `FINANCE`/`DEBTS`/`BRANCHES`/
   `DRIVERS`/`MEMBERS` được gác). Bản thân `VehicleMaintenanceWorkspace` thì chỉ kiểm permission.

   ⇒ **VEH-09 (P3) phải mang theo cờ này**: `manage-nav.ts` của app là gương của `nav.ts`, nên
   mục `maintenance` cần trường `feature` và cùng ba trạng thái `enabled`/`read_only`/`hidden`
   (ADR 0027 điều 3: hết hạn gói KHÔNG được làm mất quyền XEM sổ của chính mình).
   Danh sách xe (VEH-01) · hồ sơ 360 (VEH-03) · giấy tờ (VEH-07) · nguồn xe (VEH-11) **không**
   mang cờ nào ở web — giữ nguyên, không tự thêm.
4. **`PATCH /vehicles/:id/maintenance/records/:recordId/cost`** có ở backend nhưng web không gọi
   (chi phí đi kèm create/update/complete). App **không** dùng endpoint đó.
