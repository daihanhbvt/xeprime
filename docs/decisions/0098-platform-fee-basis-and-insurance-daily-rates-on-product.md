# ADR 0098 — Phí sàn tính theo chuyến hoặc theo ngày (từng loại xe); biểu phí bảo hiểm theo ngày chuyển về sản phẩm bảo hiểm

Ngày: 17/11/2026 · Trạng thái: **Accepted** (17/11/2026 — người dùng chốt) · Ghi đè:
[0064](0064-financial-flow-v2.md) điều 2 (`S` "cố định mỗi đơn"), điều 10 (biểu phí ngày và cổng
"dòng chính sách bật" ở `fee_policies`) · Giữ: mọi luật khác của 0064 (S là tiền của XePrime, khách trả,
cả hai tuyến, hoàn theo thứ tự cọc → hoa hồng → phí sàn; trần tài trợ mã `D + S + H`)

## Bối cảnh

1. Phí sàn `S` (ADR 0064 điều 2) là một số cố định mỗi đơn: thuê 1 ngày hay 30 ngày đều 50.000đ ô tô.
   Người dùng cần chọn được cách tính "× số ngày thuê" — và chọn riêng cho ô tô và xe máy.
2. Màn Chính sách phí có mục "Bảo hiểm" (phí ngày `IV`/`IP`, công tắc, tên đối tác) trùng với màn
   Admin › Bảo hiểm. Từ ADR 0088 sản phẩm vật chất xe của MIC tính theo BẬC giá trị xe, nên phí ngày
   `IV` ở chính sách phí không còn được dùng; phí ngày `IP` chỉ dùng khi bật sản phẩm tai nạn người.
   Hai chỗ cấu hình cho cùng một thứ làm admin không biết số nào đang chạy.

## Quyết định

### 1. Phí sàn: mỗi chuyến hoặc mỗi ngày, chọn theo loại xe

- `fee_policies.customer_platform_fee_basis_{car,motorbike}` ∈ `per_trip` · `per_day` (CHECK, mặc định
  `per_trip` — bản cũ không đổi tiền của ai). Có phiên bản và đóng băng vào đơn như mọi số của chính
  sách (`FeePolicyValues.customerPlatformFeeBasis`, `PLATFORM_FEE_BASIS`).
- `per_day`: `S = phí sàn × số ngày thuê` (`rentalDays` của `computeCustomerFees`) cho **mọi loại thuê,
  kể cả dài hạn** (người dùng chốt: thuê 6 tháng ≈ 182 ngày × 50.000đ = 9.100.000đ). Dòng `service_fee`
  mang `unitAmount × quantity` như dòng bảo hiểm theo ngày; giao diện khách tự hiện "× N ngày".
- Snapshot cũ không có trường ⇒ đọc là mỗi chuyến (`platformFeeBasisFor`).
- Mọi phép tính dựa trên `S` (tiền giữ chỗ, trần tài trợ mã, hoàn khi huỷ) đọc số tiền của DÒNG nên
  tự đúng — không có công thức thứ hai.

### 2. Biểu phí bảo hiểm theo ngày sống ở sản phẩm bảo hiểm

- `insurance_products.daily_amount_{car,motorbike}` (NULL = không áp dụng, CHECK ≥ 0, bội 1.000đ) cho
  sản phẩm `premium_basis = daily`. Sửa ở form sản phẩm của Admin › Bảo hiểm; áp cho báo giá từ lúc
  lưu, đơn đã có giữ số trong snapshot.
- Báo giá phủ phần bảo hiểm lên chính sách phí trước khi tính tiền
  (`InsuranceOfferService.feePolicyOverlay`, gọi trong `PricingService`): công tắc bán = sản phẩm đang
  bật VÀ đối tác phát hành được loại đó; biểu phí ngày = của sản phẩm (sản phẩm theo bậc ⇒ 0, phí đi
  qua báo giá bậc); tên đối tác = adapter đang chạy. Snapshot đóng băng mang đúng số đã phủ, nên mọi
  nơi đọc báo giá (web, app native, lượt duyệt, hold) không đổi.
- Các cột `*_daily_*`, `*_enabled`, `insurance_partner_name` của `fee_policies` thôi được đọc khi tính
  tiền mới; giữ để đọc lại phiên bản cũ. Form chính sách phí bỏ tab Bảo hiểm (các trường cũ đi qua
  nguyên trạng để bản nháp mới không làm mất số của phiên bản cũ).
- Migration `20261117190000_platform_fee_basis_insurance_daily_rates` chép phí ngày của chính sách
  đang áp dụng sang sản phẩm cùng loại (chỉ sản phẩm theo ngày), và **tắt** sản phẩm của loại mà chính
  sách đang tắt — giữ nguyên hành vi bán (trước: bán khi sản phẩm bật VÀ chính sách bật).

## Hệ quả

- Admin có MỘT chỗ quản lý bảo hiểm (Admin › Bảo hiểm) và MỘT chỗ quản lý phí sàn (Chính sách phí).
- Đổi phí ngày bảo hiểm không còn tạo phiên bản chính sách phí; lịch sử đổi nằm ở audit
  `insurance_product.update`, còn số của từng đơn nằm trong snapshot của đơn.
- Phí sàn theo ngày làm tiền giữ chỗ của chuyến dài tăng mạnh (phí sàn nằm trong khoản trả online).
- App native không cần đổi để tính đúng (server tính); bản hiển thị dòng phí "× N ngày" của app tuỳ
  bản app.

## Cần xem lại khi

Cần trần cho phí sàn theo ngày (vd tối đa N ngày hoặc trần tiền cho dài hạn); cần phiên bản hoá biểu
phí bảo hiểm ngày; mở thêm cách tính phí sàn (theo tháng, theo % tiền thuê).
