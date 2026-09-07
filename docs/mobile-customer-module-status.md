# Module Customer trên app native — đã làm gì, còn nợ gì

> Ngày viết: 07/09/2026 · Nhánh `feature/mobile-customer-module`
>
> Tài liệu này viết cho **người làm module tiếp theo**. Nó trả lời hai câu: *cái gì đã chạy được*
> và *chỗ nào còn hở, hở tới mức nào*. Trạng thái toàn app vẫn ở `docs/mobile-module-status.md`.

---

## 1. Giao được gì

**4/4 mục.** CUS-01, CUS-02, CUS-03 dựng mới; CUS-04 vốn được đánh `Done` nhưng chưa parity —
xem §4.

| CUS | Nội dung | Route | Màn / file |
| --- | --- | --- | --- |
| 01 | Sổ khách của gian hàng (danh sách + thống kê) | `/manage/customers` | `features/customers/CustomerListScreen.tsx` · `components/CustomerCard.tsx` · `CustomerSummaryBar.tsx` · `CustomerFormSheet.tsx` |
| 02 | Hồ sơ khách — tổng quan · lịch sử thuê · thu chi · ghi chú · giấy tờ | `/manage/customers/[id]` | `CustomerDetailScreen.tsx` · `components/CustomerBookingHistory.tsx` · `CustomerFinancePanel.tsx` · `CustomerNotesPanel.tsx` · `CustomerDocumentsPanel.tsx` |
| 03 | Đánh giá rủi ro / từ chối phục vụ | (trong CUS-02) | `components/CustomerRiskSheet.tsx` |
| 04 | Hồ sơ tài khoản của khách | `/account` | `features/account/AccountScreen.tsx` · `hooks/use-account.ts` |

Phụ thuộc tối thiểu dựng kèm để hai lối đi từ hồ sơ khách không thành nút chết:

| Màn | Route | Vì sao có mặt |
| --- | --- | --- |
| Sổ Thu-Chi **đã lọc sẵn** | `/manage/receipts` | Đích của "Xem trên sổ Thu-Chi" và "Xem tất cả N phiếu". **Chưa phải FIN-02 đầy đủ** — xem §5 |

---

## 2. Quyền — ai thấy gì

Bảng này là hợp đồng, không phải mô tả. `permission` chỉ ẩn/hiện; **guard backend mới là lớp chặn
thật** (CLAUDE.md mục 6), và cả hai lớp đều có test.

| Quyền | Mở ra cái gì | Thiếu thì sao |
| --- | --- | --- |
| `customers.view` | Cả sổ khách + hồ sơ | Màn thiếu quyền; **không** gọi API danh sách/chỉ số/hồ sơ |
| `customers.manage` | Thêm · sửa · lưu trữ/khôi phục · thêm/xoá ghi chú | Ẩn hành động; ghi chú thành chỉ đọc |
| `customers.manage_risk` | Đổi mức rủi ro | Ẩn hành động (backend trả 403) |
| `finance.view` | Ba ô tiền ở hồ sơ · cột tiền trên thẻ · khu Thu chi · nhóm `has_debt` · sắp xếp `total_value`/`debt` | Ẩn **hoàn toàn**, không hiện `0 ₫`. Server cũng trả `null` cho ba trường tiền |
| `bookings.view` | Khu Lịch sử thuê · hoạt động gần đây | Không gọi `/customers/:id/bookings`; nói rõ phần này bị ẩn |
| `bookings.create` | "Tạo đơn thuê" | Ẩn hành động |
| `customers.documents.manage` | Tải lên · đối chiếu · gỡ giấy tờ | Chỉ xem metadata |
| `customers.documents.view_files` | Ảnh thu nhỏ + "Mở tệp" | **Không phát request xin signed URL nào** |

---

## 3. Ba luật nghiệp vụ được khoá bằng test

1. **`watchlist` chỉ CẢNH BÁO.** Không chặn thao tác nào — nút "Tạo đơn thuê" vẫn bật.
2. **`blocked` chặn đơn/yêu cầu MỚI ở đúng gian hàng đó.** Nút tắt ở app, và
   `CustomersService.resolveWithinTx` ném 409 `CUSTOMER_BLOCKED` ở server — ẩn nút không phải lớp
   bảo vệ. Đơn và yêu cầu ĐANG CÓ giữ nguyên.
3. **Lý do bắt buộc khi khác `normal`**, tối đa 1000 ký tự, chỉ hiển thị nội bộ. Cùng luật ở ba
   lớp: `customerRiskSchema` (yup) · `UpdateCustomerRiskDto` (class-validator) · CHECK ở DB.

Thêm: **hồ sơ đã lưu trữ** thì đọc được mọi thứ nhưng không sửa, không thêm ghi chú, không tải
giấy tờ, không lập đơn mới.

---

## 4. CUS-04 — sửa lại một trạng thái "Done" sai

`docs/mobile-module-status.md` (03/09) ghi Customer 1/4 với lý do "đã có CUS-04". Code thật lúc
đó chỉ hiện avatar + tên từ `/auth/me`, đổi ngôn ngữ và đăng xuất — **thiếu toàn bộ phần hồ sơ**.

Đợt này bổ sung đúng những gì `AccountView` bên web có:

- truy vấn RIÊNG `GET /users/me` (khác `/auth/me`: có `phone` + `phoneVerified`);
- trạng thái đang tải / lỗi có nút thử lại;
- email + SĐT **chỉ đọc** kèm huy hiệu đã/chưa xác thực;
- chế độ chỉnh sửa đúng hai trường backend nhận (`displayName`, `avatarUrl`), huỷ thì trả lại dữ
  liệu gốc, validate bằng `accountProfileSchema` dùng chung;
- khối giải thích vì sao hai trường nhận diện bị khoá;
- lưu xong thì `setQueryData(account.profile)` **và** `invalidateQueries(auth.all)` — thiếu vế thứ
  hai thì tên/avatar ở header giữ giá trị cũ tới lần mở app sau.

Đổi ngôn ngữ và đăng xuất là chức năng của VỎ app native, giữ nguyên bên dưới các khối trên.

---

## 5. Còn nợ

| Nợ | Mức | Ghi chú |
| --- | --- | --- |
| **FIN-02 đầy đủ** | Trung bình | `/manage/receipts` hiện chỉ là danh sách đã lọc: chưa có thẻ tổng theo bộ lọc, chưa tạo/duyệt/huỷ phiếu, chưa có chi tiết phiếu, chưa quản lý danh mục. Cố ý **không** gắn vào menu quản lý để không tuyên bố FIN-02 xong. Mở FIN-02 thì mở rộng chính màn này, đừng dựng màn thứ hai |
| **Rebuild dev client** | Bắt buộc trước khi chạy thử | Thêm hai native module: `expo-document-picker` (chọn PDF) và `expo-clipboard` (chép SĐT/email). Chạy `pnpm --filter @xeprime/mobile android` (hoặc `ios`) — bản dev client cũ sẽ báo thiếu module |
| Biểu đồ xu hướng dựng bằng View | Thấp | Không kéo `react-native-svg` vào chỉ để vẽ hình chữ nhật. Đủ cho hai series cùng thang; muốn thêm đường lợi nhuận thì lúc đó mới cân nhắc SVG |
| `.expo/types` chưa sinh lại | Thấp | Typed routes chỉ được kiểm khi Expo đã chạy một lần — xem `apps/mobile/README.md` §10 |

---

## 6. Nợ kỹ thuật đã ĐÓNG trong đợt này

| Nợ | Đóng thế nào |
| --- | --- |
| Customer API chưa đóng gói ở `@xeprime/api-client` | `packages/api-client/src/features/customers/api.ts` — DTO lấy từ `components['schemas']`, một `customerFiltersToParams` cho cả hai client, `duplicateCustomerId` đọc `details` của 409 ở đúng một chỗ. Web giữ vỏ mỏng (`apps/web/src/features/customers/api.ts`) chỉ còn bước upload dùng `File`/`XMLHttpRequest` |
| Account API và Finance API chưa dùng chung | `features/account/api.ts` (`/users/me`) và `features/finance/api.ts` (`/receipts`, `/finance/summary`, `/finance/series`) ở cùng package |
| Yup schema Customer chỉ có ở web | Chuyển vào `@xeprime/validators` với message là MÃ; `useValidationResolver(schema, 'Customers.validation')` dịch. Web và app dùng chung một schema |
| Vị từ gate tài chính chép ở feature web | `relationshipValues` · `sortValues` · `isAllowedRelationship` · `isAllowedSort` chuyển vào `@xeprime/types`, ngay cạnh `TENANT_CUSTOMER_FINANCE_*` mà chúng đọc. `isPreviewableImage` vào `packages/types/src/upload.ts` |
| **Customer web còn 176 chuỗi tiếng Việt cứng** | Toàn bộ `apps/web/src/features/customers` + `app/(manage)/manage/customers` chuyển sang `t()`; namespace `Customers` mở rộng ở `packages/domain/messages/{vi,en}` và thêm vào bảng gom của app native. Nhãn enum đi qua `Domain`, lỗi API dịch từ MÃ |
| `DateField` nằm trong `features/vehicles` nhưng ba feature dùng | Chuyển sang `components/ui/DateField.tsx`; ba nơi gọi cập nhật import, hành vi không đổi |
| Không có ô nhập chữ ngoài React Hook Form | Thêm `components/ui/TextControl.tsx` — đối xứng với `SelectControl` đứng cạnh `SelectField` |
| Luồng tải file riêng tư chỉ nhận ẢNH | `uploadPrivateFileToR2` nhận mọi tệp và trả NGUYÊN vé presign (mỗi hồ sơ gọi id khác nhau); `uploadPrivateImageToR2` giờ chỉ là lớp mỏng gọi nó — cái bẫy `Content-Length` chỉ còn một bản |
| App native KHÔNG kiểm dung lượng/định dạng trước khi presign | `validateImageUpload` / `validateDocumentUpload` vào `@xeprime/types` (nhận `{type,size}` thay vì `File`, nên package dùng chung đọc được); `uploadPrivateFileToR2` gọi nó ngay sau khi đo số byte thật và ném `UploadRejectedError` mang MÃ lý do; `useUploadRejectionMessage` đổi mã thành chữ qua `Errors.upload.*`. Trước đó một bản scan PDF 30MB đi trọn vòng presign rồi mới bị DTO từ chối |
| Thẻ phiếu thu/chi bị chép hai bản | `features/finance/components/ReceiptCard.tsx` — dùng chung cho khu Thu chi của hồ sơ khách và sổ Thu-Chi |

---

## 7. Chỗ UI/UX khác web — và vì sao

Chỉ đổi **cách trình bày**, không đổi dữ liệu, hành động, quyền hay câu chữ.

| Web | App native | Vì sao |
| --- | --- | --- |
| Bảng 7 cột + phân trang | Thẻ + **phân trang** (`Pagination` ở chân màn), vẫn giữ `meta.total` ở đầu trang | Bảng 1040px không vừa 390dp. Giữ PHÂN TRANG chứ không cuộn vô hạn: sổ khách là bề mặt tra cứu, và `ManageListShell` chỉ thu khối đầu trang khi có `meta` — cuộn vô hạn làm bộ lọc dính cứng trên màn |
| `<Tabs>` 5 tab | Dải tab **cuộn ngang** | Năm nhãn tiếng Việt không vừa một hàng; bóp lại thì "Ghi chú nội bộ" bị cắt |
| 5 nút hành động trên header | Tấm trượt "Thao tác khác" | Năm nút có chữ không vừa 390dp, và bỏ bớt nút là mất chức năng |
| Modal / Popconfirm / Dropdown | `BottomSheet` · `AlertDialog` | Hình thái native cho cùng vai trò |
| Dải 4 thẻ KPI rời | **MỘT thẻ, chia ô bằng đường kẻ mảnh** (2×2) | Bốn ô `f={1}` một hàng ở 390dp còn ~84dp/ô và nhãn xuống ba dòng; bốn khối xám rời thì mỗi khối cao một kiểu và đọc ra như bốn mảnh vụn. Thẻ có kẻ chia thì ô ăn theo chiều cao hàng, mép luôn thẳng. Công nợ dùng dạng rút gọn (`12,5tr`) vì ô rộng ~160dp |
| Thẻ mobile web: danh tính · nhãn · 3 chỉ số | Y hệt, nhãn nằm ĐỐI DIỆN tên (chia cứng **6:4**, nhãn được 2 dòng) | `StatusBadge` không có bề rộng nội tại: tên khách dài bóp nó còn vài ký tự. 7:3 vẫn cắt "Từ chối phục vụ"; 6:4 + `lines={2}` thì viên nhãn cao thêm một dòng thay vì nói nửa câu |
| `<input type=file>` | Tấm trượt ba nguồn: máy ảnh · thư viện ảnh · tệp PDF | Native không có một ô chọn tệp vạn năng |
| Tooltip trên biểu đồ | Chạm một cột để hiện dòng chi tiết ngay dưới | Native không có hover |
| Ô lọc hiện trên trang | Ô lọc trong tấm trượt (`ManageListShell`) | Quy ước sẵn có của mọi màn danh sách trong khu quản lý |

---

## 8. Test đã bổ sung

| File | Khoá lại điều gì |
| --- | --- |
| `packages/api-client/src/features/customers/api.test.ts` | Serialize bộ lọc (một nguồn cho hai client) · gate tài chính của nhóm/sắp xếp · đọc `customerId` từ 409 |
| `packages/validators/src/customers.test.ts` | Ba schema dùng chung: bắt buộc tên/SĐT, SĐT sai định dạng bị chặn ở client, lý do bắt buộc khi khác `normal`, các trần độ dài khớp DTO |
| `apps/mobile/.../CustomerListScreen.test.tsx` | Ma trận quyền · ẩn hẳn tiền khi thiếu `finance.view` · rỗng-thật khác rỗng-do-lọc · điều hướng tới route chi tiết · `all` không xuống API |
| `apps/mobile/.../CustomerDetailScreen.test.tsx` | Ma trận quyền · `watchlist` không chặn · `blocked` chặn tạo đơn · hồ sơ lưu trữ chỉ đọc · "Tạo đơn thuê" đi tới luồng đơn đã có kèm prefill |
| `apps/mobile/.../AccountScreen.test.tsx` | CUS-04: nguồn `/users/me`, chế độ sửa, huỷ trả lại dữ liệu gốc, validate chặn ở client, lưu xong đồng bộ **cả hai** cache |
| `apps/mobile/.../CustomerDocumentsPanel.test.tsx` | **KHÔNG phát request signed URL khi thiếu `view_files`** · ảnh nạp sẵn thu nhỏ / PDF chỉ xin URL lúc bấm · ba mức quyền · hồ sơ lưu trữ chỉ đọc · lỗi ≠ rỗng |
| `apps/mobile/.../CustomerNotesPanel.test.tsx` | Thêm/xoá ghi chú (xoá có xác nhận) · chỉ-đọc khi thiếu `customers.manage` · hồ sơ lưu trữ · một lần invalidate cho CẢ nhánh sổ khách |

Tổng: **53 case** cho riêng Customer + Account trên app native, cộng 16 case schema ở
`@xeprime/validators` và 18 case ở `@xeprime/api-client`.
