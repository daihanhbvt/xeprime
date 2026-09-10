# XePrime — Thông tin dự án và tài khoản Staging dành cho Designer

> Môi trường: **Staging**  
> Mục đích: giúp đội ngũ thiết kế trải nghiệm trực tiếp các khu vực và luồng hiện có của XePrime trước khi redesign.

## 1. Giới thiệu dự án

**Tên dự án:** XePrime

XePrime là nền tảng chợ đăng và thuê xe máy, ô tô. Mô hình marketplace có khoảng 70% điểm tương đồng với Mioto.vn, đồng thời được mở rộng thêm:

- Cho thuê cả ô tô và xe máy.
- Hỗ trợ người dùng tìm kiếm, xem xe và đặt chuyến.
- Cung cấp khu vực quản lý xe cơ bản cho chủ xe cá nhân.
- Cung cấp hệ thống Manage dành cho chủ gian hàng có nhiều xe, với các chức năng quản lý nâng cao như đội xe, booking, lịch xe, khách hàng, thu chi, công nợ, bảo dưỡng, tài xế, nhân viên và chi nhánh.

XePrime có hai hình thức đăng xe lên marketplace:

1. **Tuyến hoa hồng:** người dùng thông thường đăng xe và trả phí nền tảng theo từng chuyến đặt thành công.
2. **Tuyến gian hàng:** chủ gian hàng đăng ký gói tháng hoặc gói năm cố định, không bị tính phí nền tảng theo từng chuyến và được sử dụng hệ thống Manage nâng cao.

## 2. Đường dẫn và tài khoản Staging

Tất cả tài khoản bên dưới sử dụng chung mật khẩu staging:

**Mật khẩu:** `Abcd1234@`

| Khu vực | Đường dẫn | Tài khoản | Mục đích trải nghiệm |
| --- | --- | --- | --- |
| Trang chủ/User | [https://stg.xeprime.vn/](https://stg.xeprime.vn/) | `khach.binh@xeprime.test` | Tài khoản người dùng đã có chuyến đặt để xem marketplace, tài khoản và hành trình thuê xe |
| Trang Manage | [https://stg.xeprime.vn/manage](https://stg.xeprime.vn/manage) | `owner.danang@xeprime.test` | Tài khoản chủ gian hàng để trải nghiệm các chức năng quản lý và vận hành nâng cao |
| Trang Platform Admin | [https://stg.xeprime.vn/manage/admin](https://stg.xeprime.vn/manage/admin) | `admin@xeprime.vn` | Tài khoản quản trị nền tảng để xem các chức năng quản lý toàn hệ thống |

> Các tài khoản và mật khẩu trên chỉ dành cho môi trường staging, không sử dụng cho production hoặc mục đích khác.

## 3. Hiện trạng Staging

Staging đã gần hoàn thiện các **happy case** chính và có thể dùng để tham khảo cấu trúc, dữ liệu, màn hình cùng cách vận hành hiện tại. Một số phần vẫn chưa hoàn thiện đầy đủ:

- Luồng thanh toán, cọc đặt xe, hoàn tiền và phân bổ tiền.
- Luồng người dùng thông thường đăng xe theo tuyến hoa hồng; hiện tại luồng đăng xe đã hoàn thiện nhiều hơn cho tài khoản gian hàng.
- Khu vực Platform Admin vẫn còn thiếu một số chức năng và chưa phải cấu trúc quản trị cuối cùng.

Staging nên được xem là tài liệu tham chiếu cho **hiện trạng sản phẩm**, không phải giới hạn bắt buộc của phương án thiết kế mới.
