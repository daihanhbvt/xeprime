# Tài khoản QA hai tuyến chủ xe

> Cập nhật: 15/09/2026 · Phạm vi: **dev và staging**. Không tồn tại ở production.
> Nguồn: `prisma/src/seed/shops.ts` (nhóm QA) — sửa ở đó, không sửa tay trong database.

Hai tài khoản này tồn tại để kiểm chứng **ranh giới hai tuyến chủ xe** của
[ADR 0038](decisions/0038-owner-track-split-and-unified-wallet.md): ai vào `/account`, ai vào
`/manage`, ai đặt xe được, và hạn mức xe của mỗi tuyến là bao nhiêu.

Chúng **tách hẳn** khỏi năm gian hàng demo (40 xe / 10 xe / 3 xe / 1 xe / chưa xác minh). Năm gian
hàng kia có đơn, sổ khách, thu chi và đánh giá — hữu ích để xem giao diện đông dữ liệu, nhưng vô
dụng khi câu hỏi là *"chiếc xe thứ 4 có bị từ chối không"*: mọi phép đếm trên màn hình đều phải
trừ đi phần demo trước khi tin được. Hai tài khoản QA cố ý **có xe, không có đơn**.

Cùng lẽ đó, chúng cũng tách khỏi **20 chủ xe cá nhân tuyến hoa hồng** (`chuxe.*@xeprime.test`,
khai ở `prisma/src/seed/commission-owners.ts`): hai mươi tài khoản kia có đơn, đánh giá và số xe
khác nhau — chúng phục vụ câu hỏi "chợ xe và mặt tiền cá nhân trông thế nào khi đông người",
không phải câu hỏi về HẠN MỨC ở trang này.

## Bảng tra

| | Chủ xe cá nhân | Chủ gian hàng |
| --- | --- | --- |
| **Email đăng nhập** | `qa.owner@xeprime.test` | `qa.shop@xeprime.test` |
| **Số điện thoại** | `0908000001` | `0908000002` |
| **Gian hàng** | QA · Chủ xe cá nhân (`qa-chu-xe-hoa-hong`) | QA · Gian hàng gói (`qa-gian-hang-goi`) |
| **Vai** | `shop_owner` | `shop_owner` |
| **Tuyến** (`billingMode`) | `commission` | `package` |
| **Gói** | `free` — “Tuyến hoa hồng mặc định” | `per-vehicle` — “Gian hàng theo chỗ xe” |
| **Kỳ thuê bao** | 12 tháng, 0đ (dòng kỹ thuật, tự nối) | 3 tháng, trả theo chỗ |
| **Chỗ đã mua** | — (tuyến này không bán chỗ) | **8 ô tô + 2 xe máy** |
| **Đội xe** | **3 xe** = 2 ô tô + 1 xe máy | **10 xe** = 8 ô tô + 2 xe máy |
| **Xe trên chợ** | 3 (duyệt hết) | 10 (duyệt hết) |
| **Ví** | 1 ví, thuộc TENANT, số dư 0, không bút toán | 1 ví, thuộc TENANT, số dư 0, không bút toán |
| **Khu làm việc** | `/account` — Owner Lite | `/manage` — bộ quản lý đầy đủ |
| **Nhãn tài khoản** | “Chủ xe cá nhân · Hoa hồng 10%” | “Chủ gian hàng · Gói Gian hàng theo chỗ xe” |
| **Cờ tính năng bật** | 0 / 8 | 8 / 8 |
| **Đặt thuê xe của người khác** | ✅ được (ADR 0032 điều 1) | ❌ `SHOP_ACCOUNT_CANNOT_BOOK` |
| **Xe tiếp theo** | ❌ `PLAN_LIMIT_REACHED`, trần **3 xe TỔNG** | ❌ `PLAN_LIMIT_REACHED`, trần **theo LOẠI** (8 / 2) |

## Mật khẩu

Mật khẩu **không nằm trong tài liệu này và không nằm trong repo**. Seed đọc từ biến môi trường:

| Biến | Dùng cho | Khi không khai |
| --- | --- | --- |
| `DEMO_PASSWORD` | cả hai tài khoản QA, và mọi tài khoản demo khác | rơi về mật khẩu mẫu chỉ dùng được ở máy dev (`prisma/src/seed/context.ts`) |
| `PLATFORM_ADMIN_PASSWORD` | `admin@xeprime.vn` | như trên |

Trên MỌI máy đã triển khai (staging cũng như production, cả hai chạy `NODE_ENV=production`), seed
**từ chối chạy** nếu hai biến này còn là mật khẩu mẫu — mật khẩu in sẵn trong repo trên một máy
công khai là một lối vào, không phải một tiện ích.

## Dựng lại

```bash
# Máy dev. `APP_ENV` mặc định là `production` (chốt chặt), nên seed demo phải nói rõ môi trường.
APP_ENV=development pnpm --filter @xeprime/prisma seed
```

Seed **idempotent**: chạy lần thứ hai, thứ ba không thêm một user, tenant, xe, ví, thuê bao hay
bút toán nào. Nó cũng **hội tụ**: nếu dòng thuê bao trong database lệch bản khai (ví dụ còn trỏ
tới một bậc gói đã gỡ), seed sửa lại đúng — và xoá mọi dòng thuê bao lạc của gian hàng demo, vì
bất biến “MỘT dòng hiệu lực tại một thời điểm” là thứ `resolveEffectiveBilling` dựa vào.

Staging: xem [`deployment.md` §3.6](deployment.md) — `SEED_MODE=demo` chạy trong container
`migrate`, kèm `DEMO_PASSWORD` và `PLATFORM_ADMIN_PASSWORD` thật.

## Những phép kiểm mà hai tài khoản này phục vụ

1. **Trần Owner Lite là TỔNG, không phải mỗi loại.** `qa.owner` có 2 ô tô + 1 xe máy — đã chạm
   trần. Tạo thêm MỘT chiếc bất kỳ loại nào phải bị từ chối. Một fixture 3 ô tô sẽ pass cả cách
   hiểu sai (“3 mỗi loại”), nên đội xe cố ý trộn hai loại.
2. **Hạn mức tuyến gói là SỐ CHỖ ĐÃ MUA, theo loại.** `qa.shop` mua đúng 8 + 2 chứ không mua một
   gói “không giới hạn” — một trần vô hạn không kiểm chứng được gì. Chiếc ô tô thứ 9 và chiếc xe
   máy thứ 3 đều phải bị từ chối, với `details` nêu đúng loại.
3. **Cổng `/manage` chặn ở SERVER.** `qa.owner` gọi một endpoint quản lý nâng cao phải nhận
   `403 SUBSCRIPTION_TRACK_ONLY`, không phải chỉ bị ẩn menu.
4. **Cổng đặt xe nằm SAU cửa OTP.** Đăng xuất rồi đặt bằng OTP với **cùng số điện thoại**
   `0908000002` vẫn phải bị `SHOP_ACCOUNT_CANNOT_BOOK` — `users.phone` là unique nên OTP tìm lại
   đúng tài khoản gian hàng. Thông điệp phải nói rõ **“số điện thoại KHÁC”**.
5. **Một người một ví.** Mỗi tenant QA có đúng một hàng `wallets`, `owner_type = tenant`. Không
   tài khoản nào có ví thứ hai thuộc `user`.
6. **Nhãn tài khoản đọc số THẬT.** “Hoa hồng 10%” lấy từ `fee_policies.service_fee_percent` bản
   `active`, không phải hằng trong mã và không phải ảnh chụp % trên dòng thuê bao — hai số đó
   không có ràng buộc nào giữ cho khớp nhau.

## Các tài khoản demo khác

Vẫn còn nguyên và vẫn cần cho những câu hỏi khác (phân trang danh sách dài, nhiều chi nhánh, gian
hàng chưa xác minh, màn trạng thái rỗng):

| Email | Gian hàng | Quy mô | Tuyến |
| --- | --- | --- | --- |
| `owner.saigon@xeprime.test` | XePrime Sài Gòn | 40 xe · 4 chi nhánh · 79 đơn | gói |
| `owner.hanoi@xeprime.test` | Việt Car Hà Nội | 10 xe · 2 chi nhánh · 21 đơn | gói |
| `owner.danang@xeprime.test` | Đà Nẵng Mini Rental | 3 xe · 7 đơn | gói |
| `owner.cantho@xeprime.test` | Xe Nhà Cần Thơ | 1 xe · 0 đơn · hồ sơ thiếu | hoa hồng |
| `owner.hue@xeprime.test` | Huế Rental | 0 xe · **chưa xác minh** | hoa hồng |

⚠️ Đừng dùng `owner.danang@` làm “fixture 3 xe tuyến hoa hồng”: nó đúng 3 xe nhưng ở **tuyến gói**
và đã có đơn lẫn phiếu thu chi. Kéo nó về hoa hồng để lấy con số 3 là đổi tuyến của một tenant đã
có tiền chạy qua — hỏng đúng thứ dữ liệu demo đó tồn tại để kiểm.
