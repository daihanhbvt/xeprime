# Tài khoản demo và QA

> Cập nhật: 14/10/2026 · Phạm vi: **dev và staging**. Không tồn tại ở production.
> Nguồn: `prisma/src/seed/shops.ts`, `prisma/src/seed/commission-owners.ts`,
> `prisma/src/seed/identities.ts` — sửa ở đó, không sửa tay trong database.

Bộ demo gọn: mỗi loại tài khoản khoảng **ba** bản. Đủ để mở mọi màn hình với dữ liệu thật và kiểm
các ranh giới quan trọng (ba site, hai tuyến chủ xe, bậc gói, trần Owner Lite), mà không chìm trong
dữ liệu mẫu.

Mỗi site là một không gian tài khoản riêng (ADR 0053): cùng email/SĐT ở site khác là tài khoản
KHÁC. Đăng nhập ở đúng site của tài khoản.

**Site khách và site partner đăng nhập bằng SỐ ĐIỆN THOẠI + mật khẩu** (ADR 0060) — gõ email ở hai
site này bị từ chối. Cột "SĐT đăng nhập" bên dưới là số dùng để vào; email ở cột "Tài khoản" chỉ còn
là tên gọi để tra. Site quản trị vẫn đăng nhập bằng email. Máy đã seed trước 14/10/2026 cần chạy
migration `20261014180000_normalize_user_phones` (`pnpm --filter @xeprime/prisma migrate:deploy`)
hoặc seed lại, không thì SĐT demo còn ở dạng cũ và không đăng nhập được.

## Dành cho designer và người mới

XePrime là chợ đăng và thuê **ô tô và xe máy** (tự lái hoặc có tài xế, ngắn hạn hoặc dài hạn) trên
MỘT marketplace, phục vụ hai tuyến người bán:

1. **Chủ xe cá nhân — tuyến hoa hồng:** tối đa 3 xe, không phí cố định, phí nền tảng theo chuyến,
   dùng bộ quản lý gọn Owner Lite.
2. **Gian hàng — tuyến gói:** trả gói theo số xe và kỳ hạn, 0% hoa hồng theo chuyến, dùng Full Manage
   (đội xe, lịch, đơn, khách hàng, thu chi, công nợ, bảo dưỡng, tài xế, nhân viên, chi nhánh).

Sản phẩm, persona và mô hình doanh thu: [`design/02_PRODUCT_VISION.md`](design/02_PRODUCT_VISION.md).
Ai vào site nào, menu gì: [`design/07_INFORMATION_ARCHITECTURE.md`](design/07_INFORMATION_ARCHITECTURE.md).
Nguyên tắc UX/UI: [`design/08_UX_GUIDELINES.md`](design/08_UX_GUIDELINES.md).

### Đường dẫn staging

| Site | Staging | Production | Dùng tài khoản |
| --- | --- | --- | --- |
| Khách — chợ xe, chuyến, tài khoản khách | <https://stg.xeprime.vn/> | `xeprime.vn` | dòng "Khách" (vd `khach.binh@` — đang thuê dài hạn) |
| Đối tác — Full Manage / Owner Lite, đăng ký hai tuyến | <https://partner-stg.xeprime.vn/> | `partner.xeprime.vn` | dòng "Đối tác" (vd `owner.saigon@` cho Full Manage, `chuxe.son@` cho Owner Lite) |
| Quản trị nền tảng | <https://admin-stg.xeprime.vn/> | `admin.xeprime.vn` | dòng "Quản trị" |

Nguồn hostname: [`deployment.md` §2.3](deployment.md). URL không có tiền tố `/manage` hay `/admin`;
đường dẫn cũ dạng `stg.xeprime.vn/manage…` chỉ còn chuyển tiếp.

**Mật khẩu staging không ghi ở đây** — hỏi người quản trị staging / lấy từ trình quản lý mật khẩu của
đội. Đó là giá trị `DEMO_PASSWORD` và `PLATFORM_ADMIN_PASSWORD` người vận hành gõ vào lúc chạy seed
demo (mục "Mật khẩu" bên dưới). Không gửi mật khẩu qua tài liệu, chat công khai hay ảnh chụp màn hình.

Staging dùng để tham khảo **hiện trạng** (cấu trúc, dữ liệu, cách vận hành), không phải giới hạn bắt
buộc của phương án thiết kế mới. Việc còn dở: [`completion-roadmap.md`](completion-roadmap.md) và
[`design/03_PRODUCT_GAP_ANALYSIS.md`](design/03_PRODUCT_GAP_ANALYSIS.md).

## Bảng tra

| Site | Tài khoản | SĐT đăng nhập | Là gì |
| --- | --- | --- | --- |
| Quản trị | `admin@xeprime.vn` (env `PLATFORM_ADMIN_EMAIL`) | — (đăng nhập bằng email) | `platform_admin` — có ở CẢ `SEED_MODE=system` |
| Quản trị | `reviewer@xeprime.test` | — (email) | duyệt hồ sơ gian hàng / xe |
| Quản trị | `finance@xeprime.test` | — (email) | đối soát tiền vào, duyệt rút tiền |
| Đối tác | `owner.saigon@xeprime.test` | `0902000001` | gian hàng **12 xe · 2 chi nhánh · bậc Chuyên nghiệp**, đủ dữ liệu vận hành (tài xế, giấy tờ, bảo dưỡng, bàn giao, thu chi, đánh giá); 1 xe nháp + 1 xe chờ duyệt |
| Đối tác | `manager.saigon@` · `staff.saigon@` · `ketoan.saigon@xeprime.test` | `0902000011` · `0902000012` · `0902000013` | nhân viên của gian hàng trên: quản lý · nhân viên · người xem |
| Đối tác | `owner.hanoi@xeprime.test` | `0903000001` | gian hàng **5 xe · 2 chi nhánh · bậc Nâng cao** |
| Đối tác | `owner.danang@xeprime.test` | `0904000001` | gian hàng **2 xe · 1 chi nhánh · bậc Cơ bản** |
| Đối tác | `chuxe.huong@xeprime.test` | `0913000002` | chủ xe cá nhân tuyến hoa hồng, **1 xe** |
| Đối tác | `chuxe.tuan@xeprime.test` | `0913000001` | chủ xe cá nhân tuyến hoa hồng, **2 xe** |
| Đối tác | `chuxe.son@xeprime.test` | `0913000004` | chủ xe cá nhân tuyến hoa hồng, **3 xe** = 2 ô tô + 1 xe máy (chạm trần Owner Lite); 1 xe nháp |
| Khách | `khach.an@xeprime.test` | `0901000001` | khách quen, nhiều chuyến đã xong, có đánh giá; **bằng lái B2 đã xác thực** |
| Khách | `khach.binh@xeprime.test` | `0901000002` | đang thuê dài hạn theo gói tháng; **bằng lái A1 + B2 đã xác thực** |
| Khách | `khach.cuong@xeprime.test` | `0901000003` | thuê có tài xế; bị gian hàng Sài Gòn đưa vào danh sách chặn (chỉ ở gian hàng đó); **chưa có bằng lái** — tài khoản để thử luồng nộp/xác thực bằng lái (ADR 0057) |
| Tài xế (khách) | `taixe.dung@xeprime.test` | `0921000001` | tài xế ĐÃ liên kết với gian hàng gói lớn nhất; có chuyến chờ nhận + đã nhận ở "Chuyến tôi lái" (ADR 0063) |
| Tài xế (khách) | `taixe.phuoc@xeprime.test` | `0921000002` | có LỜI MỜI đang chờ từ gian hàng gói lớn nhất — thử chấp nhận/từ chối |
| Tài xế (khách) | `taixe.tri@xeprime.test` | `0921000003` | tài xế liên kết với gian hàng gói thứ hai |
| Tài xế (khách) | `taixe.loc@xeprime.test` | `0921000004` | chưa liên kết ai — dùng để thử mời từ chủ xe cá nhân |

**Tài khoản song sinh** (cùng email + SĐT, khác site, mật khẩu như nhau ở seed — nên cùng một SĐT
đăng nhập được ở cả hai site, vào HAI tài khoản khác nhau):
`owner.saigon@` và `chuxe.son@` có thêm tài khoản **khách** — chủ xe đi thuê xe bằng tài khoản
khách và bị chặn đặt xe của chính mình; `khach.an@` có thêm tài khoản **đối tác** chưa có gian hàng
— ca "đăng ký đối tác xong ⇒ chọn tuyến".

## Mật khẩu

Mật khẩu **không nằm trong tài liệu này và không nằm trong repo**. Seed đọc từ biến môi trường:

| Biến | Dùng cho | Khi không khai |
| --- | --- | --- |
| `PLATFORM_ADMIN_PASSWORD` | `admin@xeprime.vn` | máy dev: mật khẩu mẫu (`prisma/src/seed/context.ts`) |
| `DEMO_PASSWORD` | mọi tài khoản demo còn lại | như trên |

Trên MỌI máy đã triển khai (`NODE_ENV=production`), seed **từ chối chạy** nếu các biến này còn là
mật khẩu mẫu.

## Dựng lại

```bash
# Máy dev — `APP_ENV=development` trong `.env` (seed demo từ chối chạy khi APP_ENV=production).
pnpm db:seed
# Kiểm bất biến realm + độ phủ tài khoản song sinh:
pnpm --filter @xeprime/prisma realm:check -- --expect-demo
```

Seed **idempotent**: chạy lại không thêm user, gian hàng, xe hay đơn nào. Seed KHÔNG xoá dữ liệu
demo của bộ seed cũ (27 gian hàng) — DB đã chạy bộ cũ thì dựng lại (`prisma migrate reset`, người
dùng tự gõ) để có đúng bộ gọn này.

Staging: [`deployment.md` §3.5](deployment.md), mục "Dữ liệu DEMO — chỉ trên staging" — `SEED_MODE=demo` chạy trong container `migrate`,
kèm `DEMO_PASSWORD` và `PLATFORM_ADMIN_PASSWORD` thật.

## Những phép kiểm các tài khoản này phục vụ

1. **Trần Owner Lite là TỔNG, không phải mỗi loại.** `chuxe.son` có 2 ô tô + 1 xe máy — đã chạm
   trần 3 xe. Tạo thêm MỘT chiếc bất kỳ loại nào phải bị từ chối (`PLAN_LIMIT_REACHED`).
2. **Trần bậc gói là TỔNG số xe (ADR 0041).** `owner.danang` (Cơ bản, trần 3) thêm được đúng 1 xe
   nữa; `owner.hanoi` (Nâng cao, trần 10) còn 5 chỗ; `owner.saigon` (Chuyên nghiệp) không giới hạn.
3. **Khu quản lý nâng cao chặn ở SERVER.** Chủ xe tuyến hoa hồng gọi một endpoint quản lý nâng cao
   phải nhận `403 SUBSCRIPTION_TRACK_ONLY`, không chỉ bị ẩn menu.
4. **Tự đặt xe bị chặn ở backend.** Tài khoản khách song sinh của `owner.saigon` đặt xe của chính
   gian hàng Sài Gòn phải bị từ chối — phép so SĐT đã xác minh giữa tài khoản khách và chủ/thành
   viên gian hàng (ADR 0053 điều 7).
5. **Hai tài khoản, hai ví.** Ví của chủ xe thuộc TENANT; tiền hoàn chuyến đi thuê vào ví của TÀI
   KHOẢN KHÁCH đã đặt — không bao giờ gộp.
