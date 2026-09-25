# ADR 0050 — Không gian hỗ trợ gian hàng: phiên có lý do và hạn, capability do server cấp, không giả danh

Ngày: 25/09/2026 · Trạng thái: Accepted · Mở rộng: 0002 (scope đọc từ DB mỗi request), 0027/0038
(ranh giới tuyến + cờ gói giữ nguyên trong phiên), 0040 (`package_pending` không mở bộ quản lý) ·
Liên quan: 0006, 0008, 0012, 0017, 0031 · Không ghi đè ADR nào

## Bối cảnh

Đội vận hành cần làm hộ chủ xe những việc nhỏ mà chủ xe hay vướng: cập nhật ảnh xe, sửa thông tin
xe, nhập phiếu bảo dưỡng. Hôm nay chỉ có hai cách, cả hai đều sai:

1. **Xin mật khẩu/OTP của chủ xe** — nhân sự nền tảng đăng nhập THÀNH chủ xe. Nhật ký ghi chủ xe đã
   làm, chủ xe thấy mọi thứ của họ (chuyến đi thuê, ví, mật khẩu), và không có hạn nào.
2. **Sửa thẳng DB** — không qua validator, không qua luật khoá căn cước xe (09/09/2026), không qua
   đồng bộ listing (ADR 0008), không audit.

`TenantScopeGuard` chỉ biết một đường vào scope: membership của chính người gọi. Cấp cho nhân sự
nền tảng một membership tạm là mở cho họ TOÀN BỘ quyền của vai đó, và mọi thao tác của họ trong
nhật ký là của "một thành viên gian hàng".

## Quyết định

1. **Phiên hỗ trợ (`tenant_support_contexts`) là thứ DUY NHẤT mở khu gian hàng cho nhân sự nền
   tảng.** Một phiên = người mở + `sid` của phiên đăng nhập đã mở nó + gian hàng + chế độ (`view` |
   `assist`) + lý do (10–500 ký tự) + hạn cứng **45 phút** (DB chặn > 2 giờ) + capability server cấp.
   Id phiên là ~130 bit ngẫu nhiên (không phải ULID — nó nằm trên URL). Không gia hạn: hết là mở phiên
   mới kèm lý do mới. Thoát (`POST …/revoke`) có hiệu lực ở request kế tiếp. Không bao giờ xoá phiên
   (audit trỏ về nó, `RESTRICT`).

2. **Không giả danh.** Không membership tạm, không đổi `req.user`, không phát cookie/token nào. Request
   trong phiên vẫn là request của nhân sự nền tảng; client gửi ID PHIÊN qua header
   `x-support-context` (không phải tenant id). `TenantScopeGuard` tra tenant từ bản ghi phiên sau khi
   kiểm: phiên tồn tại · đúng người · đúng phiên đăng nhập · chưa hết hạn/thoát · người mở còn
   membership nền tảng `active` và còn `platform.tenant_support.view`. Sai người/sai phiên/id lạ cùng
   MỘT mã `SUPPORT_CONTEXT_INVALID` (không lộ phiên có tồn tại hay không); hết hạn/thoát là
   `SUPPORT_CONTEXT_EXPIRED`.

3. **Default-deny theo endpoint.** Endpoint tenant-scoped phải TỰ khai `@SupportAction(capability)`
   mới nhận request trong phiên; không khai là `SUPPORT_ACTION_NOT_ALLOWED` trước khi chạm DB. Endpoint
   decorator chỉ được đọc ở cấp HANDLER (đặt ở class không mở gì). Route tenant-scoped mà cũng
   `@PlatformOnly` bị từ chối trong phiên. Ở route KHÔNG tenant-scoped header bị bỏ qua — và phải thế:
   chính `GET /platform/tenant-support/contexts/:id` được gọi từ trang phiên, kèm header. Thêm một
   endpoint vào không gian hỗ trợ là một dòng khai báo có chủ đích, không phải hệ quả của việc nó tình
   cờ tenant-scoped.

4. **Capability, không phải quyền nền tảng gộp vào quyền gian hàng.** Đợt 1 có ba capability GHI:
   `vehicle.info.edit` · `vehicle.media.manage` · `maintenance.manage`; capability ĐỌC tách theo
   miền ở Đợt 2A (điều 10 — `workspace.view` của Đợt 1 được thay bằng `vehicle.view` + `branch.view`
   trong migration `20260926090000_tenant_support_read_capabilities`). `SUPPORT_CAPABILITY` ở
   @xeprime/types; DB `CHECK` tập giá trị và cấm chế độ `view` mang capability ghi. Mỗi capability mở đúng một bộ quyền TENANT
   (`SUPPORT_CAPABILITY_PERMISSIONS`) để guard/hook hiện có chạy nguyên vẹn — bộ quyền này KHÔNG phải
   cổng; cổng là capability trên từng endpoint cộng danh sách TRƯỜNG của lệnh sửa xe:
   - `PATCH /vehicles/:id` suy capability từ TÊN trường (`SUPPORT_VEHICLE_FIELDS`); trường lạ (giá,
     giao nhận, mã xe, khuyến mãi…) là `SUPPORT_FIELD_NOT_ALLOWED` cho CẢ lệnh.
   - Trường "ghim" (`branchId`, `vehicleType`, `serviceTypes`, `operationStatus`) có mặt được chỉ khi
     GIỐNG HỆT bản đang lưu — server so trong transaction sau khi khoá xe, rồi BỎ chúng khỏi lệnh để
     chúng là no-op thật (giữ `serviceTypes` sẽ kéo theo xoá giá mồ côi — một lần ghi giá).
   - Ảnh MỚI phải là ĐÚNG một object ảnh xe của chính gian hàng (`isTenantVehicleImageUrl`: URL đã
     parse, cùng origin với `R2_PUBLIC_BASE_URL`, không `..`/`%`/dấu gạch ngược/query, đường dẫn khớp
     đúng dạng key `tenants/<id>/vehicles/<ULID>-<tên>`). Presign trong phiên ghi vào tiền tố của
     tenant CỦA PHIÊN; nơi ghi và nơi kiểm dùng chung `vehicleImageObjectPrefix`. Ảnh đang có của xe
     giữ, sắp, gỡ tự do.
   - Luật khoá căn cước xe đã duyệt và mọi validator hiện hành áp nguyên vẹn; phiên không đổi
     `publicStatus`, không bật công tắc chợ.

   Capability cấp lúc mở được lưu; MỖI request dùng GIAO của nó với bộ suy lại từ hiện trạng
   (`deriveSupportCapabilities`) — gian hàng ra khỏi danh sách trạng thái ĐƯỢC ghi (`active`, `draft`,
   `pending_review`, `needs_revision`; mọi trạng thái khác, kể cả trạng thái thêm sau này, là chỉ đọc)
   hay người mở mất `platform.tenant_support.assist` giữa chừng thì quyền ghi rơi NGAY, phiên còn xem
   được và băng phiên nói lý do.

5. **Bộ giao diện theo TUYẾN, suy ở server, mỗi request.** `package_pending` → `onboarding` (không
   capability nào; chỉ bản tóm tắt trạng thái đăng ký qua endpoint nền tảng). Tuyến gói còn hạn/ân hạn
   → `manage` (Full Manage: thông tin, ảnh, bảo dưỡng). Tuyến hoa hồng hoặc đã hết gói →
   `owner_lite` (thông tin, ảnh — Owner Lite không có bảo dưỡng). `SubscriptionTrackGuard` và
   `PlanFeatureGuard` chạy như với chính gian hàng: phiên KHÔNG vượt cổng gói, và `req.tenant.roleKey`
   trong phiên là `shop_viewer` nên không cổng chỉ-chủ (`@ShopOwnerOnly`) nào mở.

6. **Audit ở chính cửa ghi audit.** Trong phiên, `AuditService` GHI ĐÈ `actorScope = platform`,
   `actor_user_id` = người mở phiên, và gắn `support_context_id` + `support_capability` + IP/UA —
   bất kể service gọi nó đã khai gì (service bảo dưỡng viết `actorScope: 'tenant'` từ trước). Mở và
   thoát phiên ghi `tenant_support.open` / `tenant_support.revoke`. Sửa xe trong phiên ghi
   `vehicle.support.update` với before/after đúng các trường lệnh chạm tới. Mọi dòng audit của một
   mutation nằm trong CÙNG transaction với thay đổi. Lý do đọc qua FK về phiên. Chốt chặn: dòng audit
   trong phiên mang tenant KHÁC tenant của phiên làm hỏng cả transaction. Phiên cũng KHÔNG đánh dấu
   `tenants.used_features` — dấu đó chỉ được là hệ quả của việc chính gian hàng dùng tính năng.

7. **Giao diện dùng lại, không có bản admin.** Route `/manage/admin/tenant-support/[contextId]/…`
   (`ROUTES.MANAGE.ADMIN_TENANT_SUPPORT` — TÁCH khỏi `/manage/admin/support` là hàng đợi hỗ trợ/tranh
   chấp) dựng CHÍNH `VehicleEditPage`/`VehicleEditWorkspace` (Full Manage), `VehicleManageWorkspace` +
   `InformationSection`/`ImagesSection` (Owner Lite), `VehicleMaintenanceWorkspace` +
   `MaintenanceRecordDialog`. Không prop `isAdmin`: `usePermissions`/`useFeatureStates` đổi nguồn khi
   đứng trong phiên, `useWorkspace` mang bảng đường dẫn của phiên, và vài chỗ mà quyền tenant không
   phân biệt được (tab, mục menu, ô ghim, công tắc dịch vụ, sửa địa chỉ/chi nhánh, lịch + KM của phiếu,
   hoàn tất phiếu) đọc `useSupportSession()`. Dữ liệu gian hàng trong phiên nằm ở một QueryClient RIÊNG
   cho mỗi lần mount phiên (`key={contextId}`) — query key của feature không mang tenant, nên cache
   chung là rò. Gốc route dựng ở MỘT chỗ (`adminTenantSupportPath` + `tenantSupportContextIdFromPath`)
   để tách tên miền quản lý sau này chỉ đổi một bảng.

   **Header phiên.** `SupportSessionBoundary` (điều 12) ĐĂNG KÝ id phiên khi cây phiên COMMIT (layout effect —
   chạy trước mọi fetch của cây con; không đăng ký lúc render để một lượt render bỏ dở không để lại
   đăng ký mồ côi; chỉ trên trình duyệt — trạng thái module phía server dùng chung giữa mọi request
   SSR) và gỡ khi unmount; client HTTP dùng
   id đã đăng ký, chưa có thì suy từ URL, id sai dạng không bao giờ được gắn. Chỉ suy từ URL là SAI:
   khi điều hướng phía client, cây của phiên phát request lúc thanh địa chỉ còn là trang cũ (smoke
   test trên trình duyệt thật bắt được). **Bất biến của vỏ trang:** hook của vỏ (menu, huy hiệu, thanh
   trên) không được gọi endpoint có `@SupportAction` với nhân sự nền tảng — request của vỏ trong
   trang phiên mang header, và kết quả sẽ rơi vào cache CHÍNH. `useBranchScope` từng vi phạm điều này
   (và 403 `NO_TENANT_SCOPE` ở mọi trang admin); nay nó chỉ hỏi khi người dùng thật sự thuộc gian hàng.

8. **Quyền nền tảng — xem tách khỏi quản lý.**

   | Quyền | platform_admin | support | finance_admin |
   | --- | --- | --- | --- |
   | `platform.tenants.view` (danh sách + chi tiết gian hàng) | ✔ | ✔ | ✔ |
   | `platform.tenants.manage` (khoá/mở khoá) | ✔ | — | ✔ |
   | `platform.billing.manage` (lịch sử gói, gán/huỷ gói) | ✔ | — | ✔ |
   | `platform.tenant_support.view` (mở phiên xem) | ✔ | ✔ | — |
   | `platform.tenant_support.assist` (mở phiên hỗ trợ thao tác) | ✔ | ✔ | — |

   `PlatformTenantsController` giữ `manage` ở cấp class làm MẶC ĐỊNH (handler mới quên khai là đòi
   quyền mạnh nhất); hai handler GET ghi đè xuống `view` (`getAllAndOverride` lấy handler trước
   class, không gộp). Drawer chi tiết ẩn khoá/mở khoá khi thiếu `manage`, và `TenantPlanSection` chỉ
   đọc (gói hiện hành, không nút, không gọi lịch sử/bậc gói) khi thiếu `billing.manage`.

   **Đưa vào production bằng `migrate deploy`** — production KHÔNG chạy seed. Migration
   `20260925120000_tenant_support_permissions` chèn ba dòng `permissions` với id = `seedId('permission:
   <key>')` (cùng id seed sinh) và gán vào ba vai HỆ THỐNG theo bảng trên, `ON CONFLICT DO NOTHING`;
   không đụng vai tuỳ biến, không xoá quyền nào. Chạy seed hệ thống sau đó cho cùng trạng thái.

   ⚠️ Hệ quả có chủ đích cần quyết định: vai nền tảng TUỲ BIẾN đang có `platform.tenants.manage` nhưng
   chưa có `platform.tenants.view` sẽ mất danh sách/chi tiết gian hàng (và mục menu) sau migration —
   API khoá/mở khoá vẫn cho phép nhưng không có lối vào UI. Thêm `view` cho các vai đó là một câu
   SQL, nhưng là đụng vai tuỳ biến — việc lượt này được yêu cầu KHÔNG làm.

9. **Bảo dưỡng: phiên chỉ sửa NỘI DUNG phiếu.** Trường ghi được: `type`, `customTypeName`, `title`,
   `providerName`, `notes`, `expectedRowVersion`, và chứng từ qua luồng presign → xác minh object.
   `plannedStartAt`/`plannedEndAt`/`odometerKm`: tạo phiếu thì phải vắng/null; sửa phiếu thì có mặt
   được nếu GIỐNG HỆT bản đang lưu rồi bị bỏ khỏi lệnh — khác là từ chối cả lệnh, và nhánh
   dời/nhả/giữ chỗ lịch xe không bao giờ chạy trong phiên. Lập lịch bảo dưỡng là capability riêng của
   Đợt 2. `cost`/`receiptCode` là dữ liệu TÀI CHÍNH: phiên không có `vehicles.maintenance.view_cost`,
   response lược hẳn hai trường, và lệnh có chúng bị từ chối.

   Chứng từ phiếu (hoá đơn/biên lai) cũng là dữ liệu chi phí: phiên không có `view_files` và endpoint
   tải chứng từ không có `@SupportAction`. Phiên ĐÍNH THÊM được chứng từ, nhưng không GỠ: một
   `attachmentFileIds` thiếu file đang có bị từ chối.

   Luật chi phí áp cho MỌI người thiếu `view_cost`, không riêng phiên (`assertCostWritable`): GIÁ TRỊ
   có mặt là 403; `null` được coi như vắng mặt (người không thấy chi phí không thể có ý định xoá nó, và
   app native — bản riêng theo ADR 0031 — luôn gửi `cost: null`); vắng mặt là giữ nguyên bản đang lưu; form không dựng hai ô và không gửi chúng. Trước đây form
   luôn gửi `cost: null`, nên nhân viên gian hàng thiếu quyền tiền sửa ghi chú là xoá chi phí phiếu.

10. **Đợt 2A — đọc theo MIỀN, suy ở server.** Mười bốn capability đọc, mỗi cái mở đúng một nhóm
    endpoint GET (`@SupportAction` từng handler) và một bộ quyền tenant chỉ-đọc:

    | Capability | Mở | Full Manage | Owner Lite |
    | --- | --- | --- | --- |
    | `vehicle.view` | danh sách/thống kê/cảnh báo/hồ sơ 360 của xe | ✔ | ✔ |
    | `branch.view` | chi nhánh | ✔ | ✔ |
    | `calendar.view` | lịch xe, giá theo ngày, khoá lịch (đọc) | ✔ | ✔ |
    | `booking_request.view` | yêu cầu thuê | ✔ | ✔ |
    | `booking.view` | đơn thuê, chi tiết đơn | ✔ | ✔ |
    | `handover.view` | ngữ cảnh bàn giao, hàng đợi thiếu KM | ✔ | ✔ |
    | `tenant_profile.view` | hồ sơ gian hàng hiện hành | ✔ | ✔ |
    | `support_case.view` | case hỗ trợ/tranh chấp của gian hàng | ✔ | ✔ |
    | `customer.view_masked` | sổ khách (che liên hệ, lược địa chỉ + công nợ) | ✔ | — |
    | `rental_policy.view` | chính sách thuê, bảng giá xe | ✔ | — |
    | `subscription_status.view` | gói hiện hành + hoá đơn gói (đọc) | ✔ | — |
    | `driver.view` | tài xế (cờ `drivers`) | ✔ | — |
    | `member.view` | thành viên + lời mời (cờ `members`) | ✔ | — |
    | `maintenance.view` | bảng + hồ sơ bảo dưỡng, KHÔNG chi phí/chứng từ (cờ `maintenance`) | ✔ | — |

    `package_pending` không có capability nào. Capability gắn cờ gói chỉ có khi cờ còn HIỆN — phiên
    không mở màn mà chính gian hàng không thấy. Không đường nào mang `platform.customers.view_pii` vào
    phiên. Đợt 2A KHÔNG thêm mutation nào; ghi vẫn chỉ là ba capability của Đợt 1.

    Không mở trong phiên (endpoint không khai `@SupportAction`, trang không có route, mục menu bị
    bỏ): ví/rút tiền/tài khoản ngân hàng · sổ thu chi/công nợ · chi phí + chứng từ bảo dưỡng · hoàn
    tiền/thu tiền/cọc/quyết toán · KYC/CCCD · thuế · hồ sơ pháp lý · giấy tờ + ghi chú khách · ảnh bàn
    giao · chat · tài khoản & bảo mật · lịch sử đăng nhập · mua gói · màn duyệt của nền tảng · "Chuyến
    của tôi" (`/trips` đọc theo NGƯỜI ĐĂNG NHẬP, không theo gian hàng — chuyến phía chủ xe đi qua Yêu
    cầu thuê / Đơn thuê).

11. **Che PII ở CỬA RA, theo tên trường.** `SupportMaskInterceptor` (APP_INTERCEPTOR đăng ký sau cùng
    — lớp trong cùng) chạy trên MỌI response trong phiên: `*phone` → che SĐT, `*email` → che email,
    số định danh (`idNo`, `idNumber`, `licenseNo`, `documentNumber`, `taxCode`,
    `businessLicenseNo`, `bankAccountNo`…) → giữ 2 ký tự cuối; trong endpoint sổ khách còn lược
    `address`/`location` và `totalDebt`/`debtCustomers` về `null`. Shape giữ nguyên để trang dùng
    lại không phải biết gì. Che theo tên trường chứ không theo từng mapper vì endpoint thứ n+1 mở cho
    phiên mặc định đã được che. Giá trị có dạng JSON riêng (`Prisma.Decimal`, `Date`) là LÁ — đi vào
    nó biến tiền thành `{ s, e, d }` (smoke test bắt được). Ngoài phiên interceptor không làm gì.
    Sổ khách còn lược `riskReason` (lời bình rủi ro — cùng loại với ghi chú khách); nhãn
    `riskLevel` vẫn hiện.

    **Tìm kiếm không được là "oracle".** Che ở response vô nghĩa nếu `?q=` so `LIKE '%…%'` trên
    chính cột bị che: bốn số ẩn của SĐT dò ra trong vài chục lượt. Trong phiên, `piiSearch`
    (`common/support/support-search.ts`, đọc phiên từ AsyncLocalStorage) cho SĐT khớp chỉ khi gõ ĐỦ
    số (≥ 10 chữ số, so bằng trên mọi dạng lưu), email chỉ khớp nguyên văn, và số GPLX/giấy tờ
    không bao giờ là điều kiện tìm — ở sổ khách, đơn thuê, yêu cầu thuê, tài xế, thành viên. Tìm
    theo tên/mã đơn/biển số giữ nguyên; "khách đọc số cho tôi" vẫn chạy. Ngoài phiên không đổi.
    Endpoint danh sách mới mở cho phiên mà tìm trên cột PII phải đi qua `piiSearch`.

12. **Giao diện của phiên = giao diện của GIAN HÀNG.** Khung trang (sidebar, breadcrumb, menu dưới
    đáy) dựng cây menu của gian hàng qua `useManageNavTree()` — `SHOP_NAV` cho Full Manage, cây vận
    hành của Owner Lite (Xe · Lịch · Yêu cầu thuê · Đơn thuê · Yêu cầu hỗ trợ), không menu cho
    `package_pending`. Chỉ MỘT menu toàn cục; không `AccountShell`, không khu cá nhân của chủ xe. Băng
    phiên luôn hiện; thanh trên vẫn là người thao tác nền tảng.

    - **Route:** `/manage/admin/tenant-support/<id>/` + `dashboard` · `vehicles[/<xe>[/edit|/manage/…]]`
      · `maintenance` · `calendar` · `booking-requests` · `bookings[/awaiting-pickup|/<đơn>]` ·
      `customers[/<khách>]` · `shop` · `shop/branches` · `shop/policies` · `drivers` · `members` ·
      `support/cases`. Gốc phiên chuyển tới trang đầu của bộ giao diện (Tổng quan / Xe);
      `package_pending` chỉ có tóm tắt trạng thái đăng ký. F5 giữ phiên vì id nằm trên URL.
    - **Ánh xạ TẬP TRUNG:** `toTenantSupportRoute` (`constants/tenant-support-routes.ts`) là nơi DUY
      NHẤT biết route nào có trong phiên: `mapped` · `outside` (trang công khai, màn nền tảng — rời
      phiên có chủ đích) · `blocked` (khu bị ẩn, phiên KHÁC). Menu, breadcrumb, bảng đường dẫn của
      `useWorkspace` và `SupportNavigationScope` đều đi qua nó.
    - **Link trong card/bảng/dialog không thoát phiên:** `SupportNavigationScope` ghi đè
      `AppRouterContext` (thứ `useRouter()` đọc) cho cây con và chặn click `<a>` ở pha capture —
      `next/link` không điều hướng qua context nhưng bỏ qua click đã `preventDefault`. Import sâu
      `next/dist/shared/lib/app-router-context.shared-runtime` có chủ đích: Next đổi đường dẫn là
      typecheck đỏ ngay chỗ đó.
    - **Hai lớp:** `SupportSessionBoundary` ở `AppShell` (đăng ký header, suy quyền/cờ/bảng đường dẫn,
      hẹn giờ hết hạn — bọc cả menu) và `SupportDataScope` ở layout route phiên (băng + QueryClient
      RIÊNG + màn đang tải/đã kết thúc/không hợp lệ). Cả hai `key={contextId}`: hai tab hai phiên không
      trộn; phiên hết hạn đóng MỌI trang (không trang nào dựng khi lần đọc phiên gần nhất lỗi).
    - **Trang dùng lại:** thân trang Manage có logic được tách sang component của feature
      (`ManageVehiclesPage`, `CustomersPage`, `ShopPage`, `ShopPoliciesPage`, `DriversPage`,
      `MembersPage`, `MaintenanceBoardPage`, `BookingDetailPage`, `ShopSupportCasesPage`,
      `VehicleDetailPage`, `CalendarPage`); route của phiên là wrapper mỏng + `SupportRoute` (bộ
      giao diện + capability cần) quanh CHÍNH component đó — không import module route anh em
      (metadata/params của route đó không thuộc về phiên). Nút ghi tự ẩn vì quyền trong phiên là quyền suy từ capability; không prop
      `isAdmin`.
    - **Gian hàng hiện hành = gian hàng của phiên.** `useTenantScope()` đổi nguồn trong phiên như
      `usePermissions`/`useFeatureStates`: `SupportContextTenantDto` mang CÙNG hình dạng với
      `CurrentTenantSummaryDto` của `/auth/me` (slug, logo, % phí tuyến hoa hồng, số xe công khai,
      `roleKey = shop_viewer`). Khung trang đứng ngoài ranh giới nên thẻ người dùng vẫn là nhân sự.
    - **Bản kiểm kê ẩn — một chỗ.** Phần lớn khu tự ẩn nhờ quyền (suy từ capability) hoặc cờ gói:
      `finance` · `debts` · `contracts` · `escrow_hold` (`SUPPORT_HIDDEN_FEATURES`) luôn là
      `hidden` trong phiên, nên mọi chỗ gác bằng `useFeature` (lịch sử tiền, thu tiền, hợp đồng…)
      tự ẩn. Phần còn lại nằm ở bảng `SUPPORT_HIDDEN_AREA` (support-session) và component hỏi đúng
      một câu có tên `useSupportHides(AREA)` — không component nào tự đọc "đang trong phiên":
      hành động bị từ chối (ẩn hẳn thay vì mờ kèm "cần quyền …": chi nhánh, chính sách, nút Lưu +
      ô ảnh chỉ xem của hồ sơ cửa hàng), quyết toán, ghi chú + giấy tờ khách, nút/lời mời bàn giao,
      nhắn tin, mua gói (lời mời nâng cấp + khối chuyển khoản hoá đơn chờ), MST + số giấy phép
      (địa chỉ gian hàng vẫn hiện), cẩm nang/chứng từ mẫu Owner Lite, lên lịch/hoàn tất bảo dưỡng.
      Đợt 2B mở lại một khu là xoá một dòng ở bảng.
    - **Không link chết, không link sai nhãn.** `useAvailableHref()` cho màn dùng lại biết đích có
      mở trong phiên không, để không dựng link chắc chắn bị chặn (vd. "Sửa giá" ở hồ sơ 360). Link
      sót vẫn bị `SupportNavigationScope` chặn và NÓI ra ("Màn này không mở trong phiên…"); chuột
      phải không bao giờ điều hướng. Bảng `paths.*` giữ href thật cho đích không mở, thay vì đổi
      thành trang đầu (link "Tin nhắn" dẫn vào Tổng quan). Route tài khoản của chính nhân sự
      (`/manage/security`, chuyến đi thuê) là `outside`. SĐT đã che không dựng `tel:`/Zalo
      (`@xeprime/domain` `telHref`/`zaloHref` trả `null`).
    - **Case hỗ trợ:** mở case, trả lời, đổi trạng thái ở bề mặt gian hàng đòi `support.manage`
      (server vốn đã đòi) — `useCanWriteSupportCase`. Sửa này áp cho MỌI thành viên chỉ có
      `support.view`, không riêng phiên.

## Nằm ngoài Đợt 1 (bị chặn ở backend, ẩn ở giao diện)

Tạo/xoá xe · gửi duyệt · duyệt/từ chối · ẩn/bỏ ẩn xe (vẫn đi qua Platform Vehicles với quyền riêng) ·
công tắc lên chợ · giá & chính sách · lịch/khoá lịch · dịch vụ/giao nhận · thành viên/vai/quyền ·
gói/hoá đơn/onboarding · ví/rút tiền/tài khoản ngân hàng/KYC/thuế · chuyển trạng thái đơn · thu/hoàn
tiền/cọc · chat thay chủ xe · sửa KM · huỷ/xoá phiếu bảo dưỡng · hoàn tất phiếu · sửa chu kỳ bảo dưỡng ·
sửa chi phí phiếu đã hoàn tất.

Lập lịch bảo dưỡng (khung giờ giữ chỗ `vehicle_occupancies`) và ghi KM cũng nằm ngoài phiên.

## Hệ quả

- Mọi endpoint mới muốn dùng trong phiên phải khai `@SupportAction` VÀ có test từ chối cho phần còn
  lại; endpoint rộng như `PATCH /vehicles/:id` phải có luật trường ở backend.
- `AuditService` tự điền IP/UA của request cho MỌI dòng audit ghi trong một request HTTP — hành vi
  chung CÓ CHỦ ĐÍCH: giá trị nơi gọi truyền tường minh thắng giá trị tự suy; ngoài request HTTP (job,
  worker, seed) là null — store AsyncLocalStorage chỉ tồn tại trong `run()` của middleware, không có
  ngữ cảnh cũ nào để dùng lại; hai request xen nhau không rò sang nhau; `actorScope` chỉ bị ghi đè khi
  có phiên hỗ trợ. Test ở `tenant-support.spec.ts` ("AuditService tự điền IP/UA").
- Thêm capability mới là một migration (CHECK của `capabilities`).
- Trong phiên, menu là menu của GIAN HÀNG (điều 12); cây nền tảng (vd. lúc phiên đang tải) coi mọi
  trang trong phiên là mục "Gian hàng" (nơi phiên được mở), không phải "Tổng quan nền tảng".
- `apps/mobile` vẫn gác mục Gian hàng bằng `platform.tenants.manage` — chưa đổi (mobile do nhóm khác
  làm); vai support chưa thấy mục đó trên app.
- Allowlist thật được khoá bằng `tenant-support-allowlist.spec.ts`: quét mọi controller của
  `AppModule`, cấm `@SupportAction` cấp class và so tập handler được mở với danh sách Đợt 1 + 2A.
- Thêm một trang vào phiên là HAI khai báo: một dòng ở `SUPPORT_PAGES` (web) và `@SupportAction` ở
  endpoint nó gọi (api). Thiếu vế web là link bị chặn; thiếu vế api là trang 403.
- Trang Manage có logic được tách thân sang `features/<feature>/components/*Page.tsx`; route
  `/manage/...` và route của phiên đều là wrapper mỏng quanh CHÍNH thân đó.

## Điều kiện xem lại

- Đợt 2B (thêm việc GHI vào phiên): mỗi việc là một capability + endpoint khai báo + ADR bổ sung.
- Khi cần phiên cho nhiều người cùng gian hàng/gia hạn phiên/phê duyệt hai người cho chế độ assist.
- Khi tách khu quản lý sang tên miền riêng: đổi `adminTenantSupportPath` + `tenantSupportContextIdFromPath`.
