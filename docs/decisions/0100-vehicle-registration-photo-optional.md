# ADR 0100 - Ảnh cà vẹt khi thêm xe là TUỲ CHỌN; ba ô cà vẹt vẫn bắt buộc

Ngày: 18/11/2026 · Trạng thái: **Accepted** (18/11/2026 - người dùng chốt khi rà `develop` trước lúc lên
staging: giữ hành vi của đợt "Thêm xe mới" theo Figma) · Ghi đè: [0099](0099-vehicle-registration-for-all-vehicle-types.md)
điều 2 trong phạm vi "ảnh vẫn bắt buộc" · Liên quan: [0089](0089-vehicle-registration-at-car-create.md),
[0088](0088-mic-trip-insurance-integration.md) điều 2 (điều kiện xe bán bảo hiểm MIC)

## Bối cảnh

ADR 0099 (17/11/2026) bắt buộc cà vẹt khi thêm MỌI xe, và ghi rằng ảnh mặt trước vẫn bắt buộc, còn nhập tay
chỉ để sửa hoặc bổ sung kết quả máy đọc. Ngày 18/11/2026, đợt làm lại màn "Thêm xe mới" (Figma
`24352:70390`, cả wizard nâng cao `/vehicles/new` lẫn luồng đăng nhanh `/vehicles/register`) đổi ảnh thành
tuỳ chọn: có ảnh thì máy điền nhanh, không có thì chủ xe tự gõ. Lúc rà `develop` trước khi lên staging,
đoạn đổi này lệch với ADR 0099 và làm đỏ test. Người dùng chốt giữ hành vi mới.

## Quyết định

1. **Ảnh cà vẹt là tuỳ chọn** ở cả hai luồng thêm xe trên web. Thiếu ảnh không chặn bước 1, không chặn lưu
   nháp và không chặn gửi duyệt.
2. **Ba ô vẫn bắt buộc**: tên chủ xe, số khung, số máy, cùng luật định dạng như trước
   (`checkRegistration`). Có ảnh thì máy đọc chỉ điền ô còn TRỐNG; ô chủ xe đã gõ không bao giờ bị ghi đè
   (`mergeTypedFields`).
3. **Đang tải hoặc đang đọc ảnh thì vẫn chặn** (`photoNotReady`). Gửi lúc đó sẽ làm mất tấm ảnh người dùng
   vừa chọn.
4. **Server**: `registration.uploadId` thành tuỳ chọn ở `POST /vehicles`. Không có ảnh thì giấy tờ
   `registration` vẫn được tạo với các trường đã nhập, nhưng không có tệp hay phiên bản tệp. Có ảnh thì
   vẫn khoá dòng tải lên và gắn tệp như ADR 0089. Server vẫn chưa bắt buộc cả khối `registration`
   (điều 4 của ADR 0099 giữ nguyên).
5. **Điều kiện bán bảo hiểm MIC không đổi**: `insuranceEligibilityGaps` chỉ soát số khung + tên chủ xe.
   Vì vậy một xe chỉ có số gõ tay vẫn đủ điều kiện về mặt cà vẹt. Người dùng chấp nhận điều này khi chốt.
   Nếu sau này MIC đòi ảnh giấy đăng ký làm bằng chứng, cổng phải thêm điều kiện "giấy tờ có tệp" bằng
   một ADR mới, không âm thầm đổi ở client.

## Hệ quả

- Chủ xe không có cà vẹt bên mình vẫn thêm được xe, chỉ cần gõ ba ô.
- Tab Giấy tờ của xe có thể có giấy `registration` không kèm ảnh. Chủ xe tải ảnh bổ sung ở đó như mọi
  giấy tờ khác.
- **App Partner (`apps/mobile/shared/src/features/vehicles/registration-capture.ts`) vẫn bắt buộc ảnh.**
  Hai bản không tự đồng bộ (ADR 0031). App cần sửa theo ADR này ở đợt mobile kế tiếp; server đã nhận cả
  hai cách.
- Test: `registration-capture.test.ts`, `create-vehicle-page.test.tsx`, `quick-vehicle-wizard.test.tsx`
  khoá "không ảnh + đủ ba ô ⇒ lưu được, payload không có `uploadId`".

## Cần xem lại khi

MIC hoặc luật sư yêu cầu bằng chứng ảnh giấy đăng ký cho hợp đồng VCX, hoặc kiểm duyệt xe phát hiện tỉ lệ
số khung gõ sai đáng kể.
