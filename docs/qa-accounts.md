# Tài khoản demo và QA

> Cập nhật: 05/10/2026 · Phạm vi: **dev và staging**. Không tồn tại ở production.
> Nguồn: `prisma/src/seed/shops.ts`, `prisma/src/seed/commission-owners.ts`,
> `prisma/src/seed/identities.ts` — sửa ở đó, không sửa tay trong database.

Bộ demo gọn: mỗi loại tài khoản khoảng **ba** bản. Đủ để mở mọi màn hình với dữ liệu thật và kiểm
các ranh giới quan trọng (ba site, hai tuyến chủ xe, bậc gói, trần Owner Lite), mà không chìm trong
dữ liệu mẫu.

Mỗi site là một không gian tài khoản riêng (ADR 0053): cùng email/SĐT ở site khác là tài khoản
KHÁC. Đăng nhập ở đúng site của tài khoản.

## Bảng tra

| Site | Tài khoản | Là gì |
| --- | --- | --- |
| Quản trị | `admin@xeprime.vn` (env `PLATFORM_ADMIN_EMAIL`) | `platform_admin` — có ở CẢ `SEED_MODE=system` |
| Quản trị | `reviewer@xeprime.test` | duyệt hồ sơ gian hàng / xe |
| Quản trị | `finance@xeprime.test` | đối soát tiền vào, duyệt rút tiền |
| Đối tác | `owner.saigon@xeprime.test` | gian hàng **12 xe · 2 chi nhánh · bậc Chuyên nghiệp**, đủ dữ liệu vận hành (tài xế, giấy tờ, bảo dưỡng, bàn giao, thu chi, đánh giá); 1 xe nháp + 1 xe chờ duyệt |
| Đối tác | `manager.saigon@` · `staff.saigon@` · `ketoan.saigon@xeprime.test` | nhân viên của gian hàng trên: quản lý · nhân viên · người xem |
| Đối tác | `owner.hanoi@xeprime.test` | gian hàng **5 xe · 2 chi nhánh · bậc Nâng cao** |
| Đối tác | `owner.danang@xeprime.test` | gian hàng **2 xe · 1 chi nhánh · bậc Cơ bản** |
| Đối tác | `chuxe.huong@xeprime.test` | chủ xe cá nhân tuyến hoa hồng, **1 xe** |
| Đối tác | `chuxe.tuan@xeprime.test` | chủ xe cá nhân tuyến hoa hồng, **2 xe** |
| Đối tác | `chuxe.son@xeprime.test` | chủ xe cá nhân tuyến hoa hồng, **3 xe** = 2 ô tô + 1 xe máy (chạm trần Owner Lite); 1 xe nháp |
| Khách | `khach.an@xeprime.test` | khách quen, nhiều chuyến đã xong, có đánh giá |
| Khách | `khach.binh@xeprime.test` | đang thuê dài hạn theo gói tháng |
| Khách | `khach.cuong@xeprime.test` | thuê có tài xế; bị gian hàng Sài Gòn đưa vào danh sách chặn (chỉ ở gian hàng đó) |

**Tài khoản song sinh** (cùng email + SĐT, khác site, mật khẩu như nhau ở seed):
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

Staging: [`deployment.md` §3.6](deployment.md) — `SEED_MODE=demo` chạy trong container `migrate`,
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
