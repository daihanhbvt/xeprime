# App native — module Shop (SHP-01 → SHP-07)

> Ngày viết: 08/09/2026 · Nhánh `feature/mobile-module-finance`
> Nguồn đối chiếu: `apps/mobile/docs/Mobile Tracking.html` (dòng 68–76) và **code thật của
> `apps/web`** — web là bản chuẩn 100% về nghiệp vụ, quyền, validation và message.
>
> Trạng thái toàn app: `docs/mobile-module-status.md`. Chi tiết các module khác:
> `docs/mobile-vehicle-module-status.md`, `docs/mobile-customer-module-status.md`,
> `docs/mobile-finance-module-status.md`.

---

## 1. Trạng thái

| SHP | Nội dung | Route app | Trạng thái |
| --- | --- | --- | --- |
| 01 | Đăng ký gian hàng (onboarding chủ xe) | `/manage/onboarding` | ✅ |
| 02 | Hồ sơ gian hàng + gửi hồ sơ duyệt | `/manage/shop` | ✅ |
| 03 | Chi nhánh + **bộ chọn phạm vi chi nhánh toàn cổng** | `/manage/shop/branches` | ✅ |
| 04 | Chính sách thuê mặc định theo loại xe | `/manage/shop/policies` | ✅ |
| 05 | Nhân sự gian hàng (mời · đổi vai · gỡ) | `/manage/members` | ✅ |
| 06 | Tài xế của gian hàng | `/manage/drivers` | ✅ |
| 07 | Tổng quan gian hàng (dashboard chủ xe) | `/manage` | ✅ |
| 08 | Khu vực nhận xe (pickup areas) | — | ⛔ web CHƯA có bản để clone |
| 09 | Thùng rác (khôi phục dữ liệu đã xoá) | — | ⛔ web CHƯA có bản để clone |

SHP-08/09 nằm ngoài đợt này vì cột "Có tương đương web" của tracking là **Không** — không có
golden master để clone, và dựng trước web là tự đặt ra nghiệp vụ.

---

## 2. Ở đâu

```
apps/mobile/
├── app/manage/onboarding.tsx                  SHP-01 — STACK ngoài, không phải mục menu
├── app/manage/(tabs)/shop/index.tsx           SHP-02  → /manage/shop
├── app/manage/(tabs)/shop/branches.tsx        SHP-03  → /manage/shop/branches
├── app/manage/(tabs)/shop/policies.tsx        SHP-04  → /manage/shop/policies
├── app/manage/(tabs)/members.tsx              SHP-05
├── app/manage/(tabs)/drivers.tsx              SHP-06
└── src/features/
    ├── shop/            api · hooks/use-shop · status-notice · ShopOnboardingScreen ·
    │                    ShopProfileScreen · components/{ShopStatusBanner,ShopProfileChecklist}
    ├── branches/        api · branch-scope.slice · hooks/{use-branches,use-branch-scope} ·
    │                    BranchListScreen · components/{BranchCard,BranchFormSheet,BranchScopePill}
    ├── rental-policies/ api · schema · form · hooks/use-shop-policy · ShopPolicyScreen ·
    │                    components/{PolicySections,LongTermPriceHint}
    ├── members/         api · hooks/use-members · MemberListScreen ·
    │                    components/{MemberCard,MemberRoleSheet,InviteMemberSheet,PendingInvitesPanel}
    ├── drivers/         api · hooks/use-drivers · DriverListScreen ·
    │                    components/{DriverCard,DriverFormSheet}
    ├── dashboard/       api · hooks/use-dashboard · ShopDashboardScreen ·
    │                    components/{DashboardPanel,BookingMiniList,ReceiptMiniList,ShopOnboardingCard}
    └── locations/       api · hooks/use-provinces
```

`(tabs)/shop/` KHÔNG có `_layout.tsx` — ba màn của nó là ba **screen phẳng** của chính bộ tab
(`shop/index`, `shop/branches`, `shop/policies`), không phải một navigator lồng. Nhờ vậy đi từ
Chi nhánh sang Chính sách là ĐỔI mục, không chồng thêm một nấc lui; URL vẫn trùng web 1-1.

---

## 3. Khác biệt UI/UX so với web (KHÔNG khác nghiệp vụ)

| Web | App | Vì sao |
| --- | --- | --- |
| Bảng `DataTable` | `FlatList` + thẻ | Bảng 6–7 cột không đọc được ở 360dp |
| Modal / Drawer | `BottomSheet` | Hình thái native đã dùng cho toàn bộ app |
| Tooltip trên nút bị khoá | DÒNG LÝ DO dưới hàng nút | Cảm ứng không có hover; nút mờ không giải thích là ngõ cụt |
| `Tabs` loại xe (SHP-04) | Dải `Chip` | Hai lựa chọn ngắn, chip là hình đã dùng khắp app |
| `Select` đổi vai trò trong ô bảng | `BottomSheet` chọn vai | Hàng thẻ không có chỗ cho một ô chọn |
| Popover "Hướng dẫn" (SHP-01) | Khối `Callout` bốn bước đọc thẳng | Nút trợ giúp trên mobile gần như không ai bấm |
| Thanh tiêu đề DÍNH mang nút Lưu | **Thanh đáy** mọc ra khi form có thay đổi (SHP-02) | Đỉnh màn là chỗ xa ngón cái nhất; còn nút nằm cuối form thì sửa một ô ở khối đầu phải cuộn qua bốn khối mới lưu được. Thanh đáy cũng thay luôn nhãn "Chưa lưu" — sự xuất hiện của nó đã là câu đó |
| `StickyFormActions` (Hoàn tác + Lưu, nhãn đầy đủ) | **Thanh đáy** hai nút CÓ HÌNH, nhãn ngắn — `Hoàn tác` (`Common.actions.undo`) + `Lưu chính sách`; Hoàn tác chỉ mọc ra khi form bẩn (SHP-04) | Bốn khối chính sách là một màn cuộn rất dài; nút nằm cuối form thì sửa mức cọc ở khối 1 phải cuộn hết mới lưu được. "Hoàn tác thay đổi" của web viết cho thanh rộng — hai nhãn dài cạnh nhau ở 360dp là cả hai cùng xuống dòng |
| Bảng bậc phí giao nhận / mốc ưu đãi (grid 4 cột) | Mỗi bậc là một THẺ trắng có vạch tông ở mép trái, viên số dẫn đầu, các ô xếp dọc (SHP-04) | Bốn cột ở 390dp còn ~80pt mỗi cột. Thẻ trắng + viền chứ không nền xám: một dãy mảng xám lồng trong thẻ trắng làm chính ô nhập bên trong mất độ nổi |
| Logo và ảnh bìa là hai ô ảnh giữa form | Khối danh tính đầu màn: bìa tràn viền + logo tròn đè lên, chạm vào để đổi (SHP-02) | Ba thứ khách nhìn thấy (bìa, logo, tên) phải đứng cạnh nhau đúng như trang gian hàng công khai dựng, nếu không chủ shop sửa mà không bao giờ thấy kết quả. Tên đọc `useWatch` nên gõ tới đâu khối trên đổi tới đó |
| `EmbedMap` (iframe Google Maps) | Nút **Mở bản đồ** → ứng dụng bản đồ của máy | Cùng một việc (nhìn cái ghim); bản đồ hệ điều hành còn cho zoom/chỉ đường thật, và không cần key Embed API vốn chỉ có trong bundle Next |

---

## 4. Bộ chọn phạm vi chi nhánh (SHP-03, phần toàn cổng)

`BranchScopePill` nằm ở DÒNG PHỤ của `ManageHeader` (khe `context` của `AppHeader`), tức **mọi
màn gốc của khu quản lý**. Điều kiện hiện:

| Tình huống | Hành vi |
| --- | --- |
| Thiếu `branches.view` | KHÔNG gọi API, KHÔNG render |
| 0 chi nhánh | Không render |
| 1 chi nhánh | Hiện `Tên · Tỉnh` làm ngữ cảnh, không dựng dropdown chết |
| ≥2 chi nhánh | Tấm trượt: "Tất cả chi nhánh" + từng chi nhánh, chi nhánh mặc định có nhãn |
| Chi nhánh đang chọn bị ngừng/xoá | Tự quay về "Tất cả" — chỉ dọn KHI ĐÃ có dữ liệu, không dọn lúc đang tải |
| Kết thúc phiên | `SessionBoundary` dispatch `branchScopeReset()` |

`branchId` được ghép vào **đúng những màn có nghĩa theo chi nhánh**, cùng bộ mà web ghép:

- đội xe (`useInfiniteVehicles`, `useVehiclesPage`),
- đơn thuê (`useBookingsPage`),
- yêu cầu thuê (`useBookingRequestsPage`),
- huy hiệu "chờ duyệt" trên menu (`useManageNavBadges`) — cùng scope với hộp thư, nếu không thì
  huy hiệu báo 5 trong khi danh sách mở ra có 2.

**KHÔNG** ghép vào Tổng quan, Tài chính, Sổ khách: web cũng không, và hai endpoint sau không có
ngữ nghĩa chi nhánh.

---

## 5. Ma trận quyền và gói

Hai trục ĐỘC LẬP, kiểm nối tiếp (ADR 0027 điều 2) — không suy trục này từ trục kia.

| Màn | Quyền xem | Quyền ghi | Cờ gói |
| --- | --- | --- | --- |
| Hồ sơ gian hàng | `tenant.view` | `tenant.update` · `tenant.submit_review` | — |
| Chi nhánh | `branches.view` | `branches.manage` | `branches` — chỉ chặn **mở thêm** và đổi vòng đời; đọc/sửa chi nhánh đang có thuộc bộ cơ bản |
| Chính sách thuê | `tenant.view` | `tenant.update` | — |
| Nhân sự | `members.view` | `members.invite` · `members.update_role` · `members.remove` | `members` |
| Tài xế | `drivers.view` | `drivers.manage` | `drivers` |
| Tổng quan — thẻ tiền | `finance.view` | — | `finance` (`read_only` vẫn HIỆN) |

Bốn tình huống được nói bằng **bốn câu khác nhau**, không gộp: thiếu quyền · gian hàng chưa
active · hồ sơ đang chờ duyệt (backend từ chối ghi) · gói hết hạn.

---

## 6. Ba luật nhân sự (SHP-05) phải giữ

1. **Không có "thêm thành viên".** `POST /members` đã bị gỡ ở backend — đường duy nhất là gửi
   LỜI MỜI và chờ chính người đó bấm đồng ý.
2. **Không tự nâng quyền:** chủ gian hàng không đổi vai/gỡ được từ màn này, và không ai đổi vai
   hay gỡ chính mình. Ẩn nút chỉ là trải nghiệm — `MembersService` từ chối cả ba.
3. **Đổi vai/gỡ member làm mới `/auth/me`**: thao tác có thể đụng CHÍNH người đang đăng nhập, và
   quyền của họ đọc từ đó. Mất quyền giữa phiên thì `ScopeGuard` đưa về khu khách — **không**
   đăng xuất, vì tài khoản khách vẫn nguyên vẹn.

---

## 7. Nợ đã đóng trong đợt này

| Nợ | Đóng thế nào |
| --- | --- |
| SHP-07 tồn tại nhưng chưa parity dashboard web | `ShopDashboardScreen` — KPI, ba mini-list đơn, khối sổ quỹ, thẻ ba bước, dải trạng thái; mỗi khối có loading/rỗng/lỗi RIÊNG |
| SHP-04 chặn điểm nối "đặt lại theo chính sách gian hàng" của VEH-05 | Có màn chính sách thật; `useSaveShopPolicy` invalidate nhánh `vehicles` |
| Chưa có Branch Scope Selector | `BranchScopePill` trong `ManageHeader` + `branch-scope.slice` |
| `branchesApi` chỉ phục vụ Vehicle | Thêm `create/update/detail/action` + `BranchFilters` + `branchFiltersToParams` |
| `driversApi` chỉ phục vụ assign-driver | Thêm `list/create/update/remove` + `DriverFilters` |
| Shop/Members/Policy/Dashboard API chưa gom vào `@xeprime/api-client` | Thêm `tenantsApi`, `membersApi`, `inviteAnswersApi`, `shopPoliciesApi`, `locationsApi`, `uploadsApi` |
| Schema dùng chung nằm sai package | `inviteMemberSchema` + `driverFormSchema` → `@xeprime/validators`; `MEMBERSHIP_STATUS_META` → `@xeprime/types` |
| Chính sách thuê nằm trong feature Xe | Dời `schema`/`form`/`PolicySections`/`LongTermPriceHint`/`useShopPolicy` sang `features/rental-policies` (gương web) |
| Ô ảnh gắn cứng endpoint presign của xe | `VehicleImagePicker` → `components/ui/ImageUploadField` với prop `presign`; chuỗi chọn/chụp ảnh dời sang `Common.image` |
| Menu Shop còn item chưa có `href` | Năm mục đã có `href` + cờ gói đúng |
| `ShopEntryCard` chưa dẫn tới onboarding | Tài khoản chưa có gian hàng thấy thẻ "Đăng ký trở thành chủ xe" → `/manage/onboarding` |
| Ô nhập không có tên khả truy cập | `TextField`/`NumberField`/`MoneyField`/`Button` gắn `accessibilityLabel` |
| `PolicySections` + `VehiclePricingWorkspace` **bên web** còn chuỗi thô | Chuyển sang CHÍNH bộ khoá app đang dùng (`Vehicles.pricing.*`, `Common.*`) — một câu một bản dịch cho cả hai client. Nhãn chế độ bảo đảm/loại tài sản đọc từ `Domain` thay vì `*_META` tiếng Việt cứng của `@xeprime/types` |
| `deliverySummaryText` tự dựng `Intl.NumberFormat('vi-VN')` | Nhận `{ money, free, quote }` từ ngoài; dòng preview giao nhận nay in tiền bằng đúng bộ định dạng của phần còn lại app |
| `deliverySummaryText` chép ở web, app KHÔNG có (mất luôn dòng preview) | Dời vào `@xeprime/domain/rental-policy.ts`; `apps/web/.../form.ts` còn lại re-export. Hai client mô tả cùng một cấu hình bằng đúng một câu |
| App đặt **bán kính tối đa TRƯỚC** bảng bậc, ngược web; thiếu `tierOk`, thiếu preview, menu gói không loại gói đã dùng, mốc mới `minMonths: null` | `PolicySections` bám đúng thứ tự và đúng luật của web: bậc → bán kính → preview; `optionsFor(index)` lọc gói trùng, nút Thêm tắt khi hết gói, mốc mới điền sẵn gói chưa dùng. Thêm `numbered` (màn gian hàng đánh số 1–4, VEH-05 tắt) |
| Hộp "bỏ thay đổi chưa lưu?" KHÔNG được vẽ ở VEH-05 và tab Nguồn xe | Hai màn gọi `useLeaveGuard` và nối `leave.guard` vào nút Lui + dải tab, nhưng thiếu `<AlertDialog open={leave.open}>` — bấm Lui là không có phản ứng nào. Bổ sung hộp thoại, dùng chung `Vehicles.edit.discard.*` với `VehicleEditFormScreen` |
| `inherited.emptyBody` bị nguy cơ tách làm hai khoá (web có liên kết, app không) | Một khoá duy nhất bọc `<policies>`; web `t.rich` → `<Link>`, app `t.rich` → `<Text>` đậm |
| "KHÁCH SẼ THẤY TRÊN SÀN" viết hoa nằm trong mã | Chữ về dạng câu trong message, phần viết hoa chuyển sang `text-transform` ở CSS Module |
| `policyFormSchema` chép NGUYÊN VĂN ở web và app (hai file giống nhau đến từng dòng) | Dời vào `@xeprime/validators`; hai `schema.ts` cũ còn lại làm re-export shim nên mọi import sẵn có không đổi |
| Câu lỗi yup của chính sách là tiếng Việt cứng | Chuyển sang MÃ, tra `Vehicles.pricing.validation.*`; bốn câu nhắc lại số người dùng vừa gõ đi kèm tham số `mã::{json}` — `useValidationResolver` (CẢ hai client) tách và ghép vào bản dịch |

---

## 8. Còn nợ

| Nợ | Mức | Ghi chú |
| --- | --- | --- |
| `MEMBERSHIP_STATUS_META` bị lặp ở `apps/web/src/features/members/constants.ts` | Nhỏ | Bản chuẩn đã ở `@xeprime/types`; web trỏ về đó được nhưng đó là sửa LOGIC web, ngoài phạm vi đợt này |
| Trang gian hàng công khai (MKT-05) | Chặn bởi module khác | Nút "Xem gian hàng" VẪN hiện (gian hàng `active`) và báo "đang phát triển" — đúng quy ước `ManageDrawer`, không ẩn đi |
| Màn Hỗ trợ (SYS-05) | Chặn bởi module khác | Nút "Liên hệ hỗ trợ" ở trạng thái `suspended`/`expired` VẪN hiện và báo "đang phát triển" |
| `useLeaveGuard` KHÔNG bắt nút back CỨNG của Android (và vuốt-lui iOS) | Nhỏ — đã cân nhắc và cố ý hoãn 09/09/2026 | Guard chỉ nằm trên `AppHeader.onBack` và dải `VehicleEditTabs`; back cứng/vuốt-lui pop thẳng stack nên hộp "bỏ thay đổi chưa lưu?" không kịp hỏi. Trên Android đó lại là lối rời màn CHÍNH, nên phần lớn lần thoát vẫn mất form đã gõ. Hậu quả xấu nhất là gõ lại — không hỏng dữ liệu, không sai tiền. Vá được bằng `BackHandler` + `useFocusEffect` (expo-router export sẵn) đặt NGAY TRONG `useLeaveGuard`, ~15 dòng một file, cả 3 màn dùng chung được vá cùng lúc, KHÔNG cần thêm `@react-navigation/native`. Vuốt-lui iOS phải khoá `gestureEnabled` khi form bẩn — khoá mà không giải thích thì khó chịu hơn, nên để riêng |
| `toGeoPoint` chỉ có ở `apps/web/src/lib/map-embed.ts` | Nhỏ | Phép KIỂM đã dùng chung (`isValidGeoPoint` của `@xeprime/domain`, cả hai client gọi cùng một hàm). Còn lại bốn dòng GHÉP hai giá trị rời `latitude`/`longitude` thành điểm: web có helper, app làm tay trong `BranchLocation`. Đưa `toGeoPoint` xuống `@xeprime/domain` là hết, nhưng đó là sửa file web ngoài phạm vi i18n |
