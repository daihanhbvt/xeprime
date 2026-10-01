# Audit module xe — Web (30/09/2026)

Phạm vi kiểm tra: Customer Web (chủ xe hưởng hoa hồng) và Manage Web (chủ gian hàng); không kiểm tra Mobile trong đợt này.

## Kết luận nhanh

- Không phát hiện endpoint hoặc mutation của xe bị thay đổi trong phần UI đang được review.
- Các route cũ `/manage/vehicles/:id/pricing` và `/manage/vehicles/:id/optimization` vẫn tồn tại dưới dạng redirect, nên bookmark/link cũ không thành 404.
- Các khối cũ trong `VehicleOperationsPanel` đã được tách thành `handover-time`, tối ưu nhận chuyến, phụ phí và điều khoản; đây là thay đổi trình bày, không phải bỏ nghiệp vụ.
- Phần cần giữ nguyên khi tiếp tục style: capability/permission, khóa trường sau duyệt, guard bỏ thay đổi chưa lưu, trạng thái dịch vụ tắt, và phân biệt Customer/Manage.

## Đối chiếu chức năng

| Nhóm                                        | Customer Web    | Manage Web      | Kết quả                                                    |
| ------------------------------------------- | --------------- | --------------- | ---------------------------------------------------------- |
| Thông tin xe, trạng thái, thông số nâng cao | Có              | Có              | Giữ nguyên form + validation                               |
| Ảnh, tiện ích, mô tả                        | Có              | Có              | Giữ nguyên upload/order và giới hạn                        |
| Giấy tờ xe                                  | Theo capability | Theo capability | Không hiển thị nếu thiếu quyền                             |
| Giá & chính sách                            | Có              | Có              | Dùng chung API pricing; quyền sửa vẫn từ `VEHICLE_UPDATE`  |
| Nguồn xe & tài chính                        | Không mặc định  | Theo capability | Không đưa nút thu/chi vào Customer nếu capability không có |
| Bảo dưỡng & số km                           | Theo capability | Theo capability | Không tự mở menu nếu gói/quyền không cho phép              |
| Tự lái / có tài xế                          | Theo dịch vụ xe | Theo dịch vụ xe | Dịch vụ tắt vẫn hiển thị trạng thái mờ và giải thích       |
| Khung giờ giao nhận                         | Có              | Có              | Thuộc cấu hình chung của xe, không nhân bản theo dịch vụ   |
| Route cũ pricing/optimization               | Redirect        | Redirect        | Bảo toàn deep-link/bookmark                                |

## Quy tắc không được thay đổi khi style

1. Không đổi route API, payload, schema, permission hoặc capability.
2. Không thêm nút Thu/Chi vào hồ sơ Customer chỉ vì dùng chung component với Manage; chỉ render theo capability tài chính.
3. Không cho sửa bốn trường định danh đã khóa sau duyệt (biển số, hộp số, nhiên liệu, năm sản xuất); backend vẫn là lớp quyết định cuối.
4. Không bỏ cảnh báo dịch vụ tắt, cảnh báo duyệt public, lỗi tải dữ liệu hoặc dialog bỏ thay đổi chưa lưu.
5. Tách component dùng chung chỉ ở lớp trình bày; dữ liệu và quyền vẫn lấy từ workspace hiện tại.

## Hướng chỉnh UI/UX

- Giữ hai bề mặt riêng, dùng chung token và navigation primitives.
- Detail ưu tiên tổng quan và hành động chính; không hiển thị thao tác tài chính ngoài capability.
- Edit dùng điều hướng nhóm rõ ràng, trạng thái active/disabled dễ phân biệt, form card có thứ bậc thị giác và action bar nhất quán.
- Add nhanh (Customer) và Add nâng cao (Manage) dùng chung field primitives nhưng giữ nguyên bước, validation và quyền riêng.

## Các block được phép tái cấu trúc

Đã thống nhất có thể chuyển vị trí một block nếu phạm vi nghiệp vụ vẫn rõ và đường dẫn cũ còn hoạt động:

- **Khung giờ giao nhận**: đặt trong nhóm Thông tin chung vì áp dụng cho toàn bộ xe.
- **Tự lái** và **Có tài xế**: tách thành hai nhóm dịch vụ riêng; mỗi nhóm giữ tối ưu nhận chuyến và điều khoản/phụ phí tương ứng.
- **Giá & chính sách**, **Nguồn xe & tài chính**, **Bảo dưỡng & KM**: nhóm kinh doanh/quản trị của Manage, chỉ xuất hiện theo capability.

Đây là thay đổi kiến trúc thông tin và trình bày; không được hiểu là đổi scope dữ liệu hoặc chuyển quyền giữa Account và Manage.
