# 03 — Product Gap Analysis

> Cập nhật: 06/10/2026
> Trạng thái: **Canonical — backlog sản phẩm theo hiện trạng source**
> Dựa trên ADR đến **0053** và đối chiếu code `apps/api/src/modules`, `apps/web/src/app`, `apps/web/src/features` ngày 06/10/2026. Định hướng: [`02_PRODUCT_VISION.md`](02_PRODUCT_VISION.md).
> Không phải cam kết ngày phát hành; thứ tự thực thi và gate nằm ở [`../completion-roadmap.md`](../completion-roadmap.md).

## 1. Kết luận hiện trạng

XePrime ở mức **functional alpha / web pilot-ready có kiểm soát**. So với 09/09, luồng tiền marketplace đã **đủ mã**: đặt xe duyệt-trước-thu-sau (ADR 0044), SePay đối soát cả tiền gói lẫn tiền giữ chỗ, ví điểm + rút tiền, hàng đợi tài chính của admin, mã khuyến mãi nền tảng, uy tín và xếp hạng, ba site/ba realm. Khoảng trống lớn nhất giờ **không còn là viết mã** mà là:

- Vượt **release gate pháp lý/thanh toán** trước khi giữ tiền thật (ADR 0028 release gate · ADR 0033).
- Chạy trọn luồng tiền trên staging, có đối tác bảo hiểm thật và ý kiến thuế.
- Đóng các lỗ vận hành còn lại cho admin (maker–checker, risk flags, dashboard funnel/tiền).
- Chứng minh hệ thống chịu được pilot thật: browser E2E, error tracking, uptime, product analytics, UAT.
- Căn lại mobile theo ADR 0051/0053.

## 2. Bản đồ đã có và còn thiếu

| Khu vực | Đã có trong source | Khoảng trống quan trọng |
| --- | --- | --- |
| Marketplace (`xeprime.vn`) | Tìm kiếm/lọc, trang chủ gợi ý theo tỉnh, chi tiết xe/shop, lịch bận, báo giá có breakdown phí/thuế/bảo hiểm, gửi yêu cầu, mã khuyến mãi, QR tiền giữ chỗ + đồng hồ, review, chat, sort mặc định `rank_score`, ba chỉ số uy tín | Trạng thái/chứng nhận bảo hiểm trên trang chuyến; nhãn vị trí tài trợ (chưa mở) |
| Khách (`xeprime.vn/account`) | Auth SĐT + mật khẩu/social theo realm (đăng ký xác minh OTP, quên mật khẩu bằng OTP — ADR 0060), hồ sơ, chuyến, huỷ chuyến, ví điểm, tài khoản ngân hàng, lịch sử thanh toán, hỗ trợ/tranh chấp gắn chuyến, đổi mật khẩu, xoá tài khoản, chuông thông báo | Năm trang còn placeholder (`AccountComingSoon`, không có link menu): `favorites`, `addresses`, `documents`, `notifications`, `settings` |
| Site partner — tuyến hoa hồng (Owner Lite) | Đăng ký `/register` → `/onboarding`, hồ sơ chủ xe, xe, lịch, yêu cầu, đơn, hộp thư, ví điểm, tài khoản ngân hàng, thuế, chứng từ, nâng cấp gói, hỗ trợ (menu `OWNER_LITE_NAV`) | Tự chuyển trạng thái chuyến theo lịch khi chủ xe không bàn giao (chưa có — đơn chỉ đổi trạng thái qua bàn giao, ADR 0047) |
| Site partner — tuyến gói (Manage) | Xe/Vehicle 360, lịch, yêu cầu (3 tab), đơn (5 trạng thái), bàn giao/quyết toán, khách, thu chi, công nợ, tài chính, hợp đồng, bảo trì, thành viên + **lời mời có token/hạn/nhận/từ chối**, chi nhánh (lọc theo màn — ADR 0052), tài xế, gói/hoá đơn VietQR, công tắc thu cọc, công tắc hiển thị xe (ADR 0048), dashboard số thật | Xuất PDF hợp đồng (§7); các lỗi web ở §7 |
| Platform admin (`admin.xeprime.vn`) | Dashboard, duyệt xe (ADR 0049), đối tác (chủ xe/gian hàng), tenant, xe, booking, khách, tài khoản, staff, gói, chính sách phí có phiên bản, giao dịch ngân hàng (khớp/bỏ qua), tiền: hold/quyết toán, hoàn tiền, rút tiền, đối soát ngày, bảo hiểm (retry/void), thuế (khai/nộp/export); hồ sơ người bán (verify/yêu cầu bổ sung/từ chối), support case, mã khuyến mãi, banner, catalog, địa điểm, audit, **phiên hỗ trợ gian hàng** (ADR 0050) | Maker–checker, risk flags, dashboard funnel/GMV, quản trị vị trí tài trợ, hàng đợi hồ sơ hết hạn, phiên bản điều khoản/consent (§3) |
| Billing | Ba bậc theo **tổng số xe** + kỳ hạn giá tuyệt đối, bậc `salesOnly` (ADR 0041); hoá đơn VietQR; SePay webhook (`XPG…`) kích hoạt idempotent, xử lý thiếu/thừa/trùng; vòng đời gói (`subscription-lifecycle`) | Cấu hình SePay thật + UAT (gate R2); chốt `PLAN_FEATURE_ENFORCEMENT` (`.env.example` để `warn`) khi bật hạ năng lực thật |
| Mobile | Hai Expo project mỏng: `customer` (XePrime, `vn.xeprime.customerapp`) và `manage` (XePrime Partner, `vn.xeprime.partnerapp`) + `shared` — **đã quyết** ở ADR 0051 điều 5 | Căn theo ADR 0053: app Partner hiện chỉ nhận tuyến gói, Owner Lite còn nằm trong app XePrime; dọn `BOOKING_STATUS.CONFIRMED` (ADR 0047); push chưa thử máy thật; release pipeline |
| Production | CI, Docker/CD, backup docs, health endpoint, structured log | Deploy proof, browser E2E (chưa có Playwright), error tracking (chưa có), uptime monitor, product analytics (chưa có), compliance/UAT |

## 3. Platform Admin — nên làm tiếp

### P0 — trước khi nhận tiền khách thật

#### A. Seller compliance

- Đã có: hồ sơ người bán (`seller-profile`) với verify/yêu cầu bổ sung/từ chối; tài khoản ngân hàng theo chủ ví; thuế. Tuyến hoa hồng chỉ có cổng duyệt XE (ADR 0036); xác minh gian hàng **đang tạm ngừng** (ADR 0049 điều 9) — thanh toán gói không mở trục xác minh (ADR 0040 điều 5).
- Còn thiếu: quyết định khi nào mở lại xác minh gian hàng (cần nơi duyệt riêng cho phiếu `tenant`); lưu phiên bản điều khoản/đồng ý; hàng đợi hồ sơ hết hạn hoặc cần bổ sung.

#### B. Money Operations

- Đã có: danh sách + chi tiết giao dịch ngân hàng (khớp tay/bỏ qua), hàng đợi hold cần quyết toán, hoàn tiền (đã trả/từ chối), lệnh rút (duyệt/đã chuyển/từ chối/đảo), đối soát ngày + nhập số dư ngân hàng, hàng đợi bảo hiểm, thuế. Tranh chấp (`dispute`) còn mở trên một đơn chặn quyết toán đơn đó. Sổ ví chỉ ghi thêm, sửa bằng dòng đảo.
- Còn thiếu: **maker–checker** cho khoản lớn hoặc thao tác đảo (người tạo ≠ người duyệt cuối — chưa có ràng buộc nào trong `platform-withdrawal.service.ts`); hiển thị tuổi lệnh/SLA rõ trên hàng đợi cần UAT.

#### C. Policy and pricing

- Đã có: `fee_policies` có phiên bản (`draft` → `active`), `effectiveFrom/effectiveTo`, phí dịch vụ, cọc (tỷ lệ/sàn/trần), thuế, bảo hiểm, cửa sổ thanh toán; giá gói theo bậc ở admin plans; đơn lưu snapshot.
- Còn thiếu: preview tác động trước khi kích hoạt; xác nhận lần hai với thay đổi ảnh hưởng tiền; đánh dấu rõ giá trị "giả thuyết" và policy production đã duyệt.

#### D. Support and disputes

- Đã có: support case (danh sách, chi tiết, tin nhắn, giao người, chuyển trạng thái, kết luận) ở cả khách, partner và admin; `dispute` bắt buộc gắn chuyến và giữ quyết toán.
- Còn thiếu: SLA theo case; mẫu thông báo khi tiền bị giữ/hoàn/yêu cầu bổ sung hồ sơ; gắn mọi lần reveal PII với case/lý do.

### P1 — trước controlled pilot mở rộng

- ~~Dashboard funnel~~ — **đã có (09/10/2026)**: phễu hiện trạng đăng ký → có xe → có xe trên chợ → có đơn → hoàn thành chuyến (`GET /platform/dashboard/overview`). Còn thiếu: phễu theo COHORT (đối tác đăng ký trong kỳ) để đo hiệu quả onboarding theo thời gian.
- Dashboard tiền: **đã có** GMV, phí dịch vụ ghi nhận (ròng), tiền gói đã thu — tháng này so cùng kỳ + xu hướng 30 ngày, doanh thu gác bằng `platform.money.manage`. Còn thiếu: thuế giữ hộ, bảo hiểm giữ hộ, nợ phải trả, ngân sách khuyến mãi đã dùng.
- Risk flags: cùng tài khoản ngân hàng/định danh cho nhiều hồ sơ, tỷ lệ huỷ/no-show cao, đổi thông tin nhận tiền sát lệnh rút.
- Quản trị vị trí tài trợ (nhãn, thời hạn, báo cáo tác động) — chỉ khi quyết định mở ưu tiên gói (ADR 0043 điều 6). Công thức `rank_score` đã chạy bằng job `listing-rank-refresh`.
- Mở rộng capability của phiên hỗ trợ (ADR 0050 — phần "Nằm ngoài Đợt 1") theo nhu cầu đo được.
- Export kế toán/đối soát ngoài thuế; áp dụng masking và audit.

### P2 — khi có volume

- Chi trả tự động qua đối tác được phép.
- Fraud scoring theo cụm tài khoản/thiết bị.
- Referral. (Khuyến mãi nền tảng **đã xong** — ADR 0046.)
- SLA workforce dashboard và phân ca support/finance.
- Data warehouse/BI nếu báo cáo bắt đầu làm chậm DB vận hành.

## 4. Manage — gian hàng tuyến gói

### Phần đang đủ cho pilot

- Quản lý xe, Vehicle 360, công tắc hiển thị trên chợ, lý do không lên chợ do server suy.
- Lịch, khoá lịch, giá ngày/lễ, giá dài hạn.
- Yêu cầu đặt xe (duyệt/"Đặt ngay"/từ chối/huỷ chuyến theo chặng), đơn 5 trạng thái, bàn giao/quyết toán/phụ phí.
- Khách hàng, thu chi, công nợ, báo cáo, hợp đồng, bảo trì.
- Chi nhánh (lọc theo từng màn), tài xế, thành viên + lời mời thật, phân quyền cố định.
- Dashboard: xe rảnh/đang thuê, doanh thu, cọc đang giữ, quá hạn, việc trong ngày.
- Gói: bảng giá ba bậc, mua qua VietQR, chờ đối soát, hoá đơn; feature gating.

### Phần cần hoàn thiện

1. Màn gói: giải thích rõ quyền lợi khi hết hạn/ân hạn và hành vi hạ bậc (gác thêm xe lên chợ khi vượt trần đã trả — ADR 0041 điều 4).
2. Thu cọc: gian hàng chỉ có **công tắc bật/tắt**, mức cọc do nền tảng đặt (ADR 0033 điều 7) — UI phải nói rõ tắt cọc thì đơn ra đời ngay lúc duyệt, không có QR.
3. Cả hai tuyến dùng chung hold/hoàn/ledger, snapshot thuế, bảo hiểm tại bàn giao — không xây hệ tài chính thứ hai.
4. Đóng các lỗi web ở §7.

## 5. Owner Lite — chủ xe tuyến hoa hồng ở site partner

Không clone source. Cùng cây URL với Manage; menu chọn theo tuyến hiệu lực (`navForZone` → `OWNER_LITE_NAV`); trang chỉ của tuyến gói chặn ở server bằng `@SubscriptionTrackOnly()` và tuyến hiệu lực giải ở `resolveEffectiveBilling` (ADR 0038 điều 1, 4 · ADR 0051 điều 3). Ví/tài khoản ngân hàng gác bằng `@ShopOwnerOnly()`, không bằng permission.

### Menu hiện hành

| Nhóm | Màn |
| --- | --- |
| Vận hành | Tổng quan, Xe, Lịch, Yêu cầu đặt xe, Đơn thuê, Hộp thư |
| Kinh doanh | Ví điểm, Tài khoản ngân hàng, Thuế, Gói (phễu nâng cấp) |
| Hồ sơ | Hồ sơ chủ xe |
| Hỗ trợ | Cẩm nang chủ xe, Hợp đồng & chứng từ, Bảo vệ dữ liệu, Hỗ trợ/tranh chấp |

### Không hiện cho tuyến hoa hồng

Sổ thu chi tổng hợp, công nợ, báo cáo quản trị, khách hàng, thành viên/phân quyền, chi nhánh, tài xế, trung tâm bảo trì nâng cao, cấu hình đội xe.

Không bắt buộc biên bản, ảnh tình trạng, odometer hay nhiên liệu/pin. Không khoá thao tác tối thiểu để hoàn thành chuyến hoặc rút tiền thuộc về chủ xe. **Còn mở:** cơ chế tự chuyển chuyến theo lịch khi chủ xe không bàn giao (ADR 0032 điều 6 cho phép, chưa có job nào làm).

## 6. Customer — khoảng trống để khép giao dịch

### Đã có

Breakdown báo giá (phí dịch vụ, cọc, bảo hiểm, phần trả khi nhận xe; thuế là dòng phía chủ xe), mã khuyến mãi, QR tiền giữ chỗ với đồng hồ và cảnh báo nhận xe sát giờ, huỷ chuyến, các chặng "chờ duyệt / đã được nhận · chờ thanh toán / đặt xe thành công / xe đã có khách khác", ví điểm + rút tiền, lịch sử thanh toán, hỗ trợ/tranh chấp gắn chuyến.

### P0

- Trang chi tiết bảo hiểm: nhà cung cấp, phạm vi, loại trừ, cách yêu cầu bồi thường; trạng thái + chứng nhận trên trang chuyến sau khi phát hành (chưa có ở `features/trips`). Phụ thuộc đối tác thật.
- UAT trọn luồng tiền trên staging: thiếu/thừa/hết hạn, hoàn theo snapshot, tiền về sau khi hold đã chết.

### P1

- Yêu thích, địa chỉ nhận xe, giấy tờ người thuê, tùy chọn thông báo, cài đặt — năm route đang là placeholder không có link menu; làm thật hoặc gỡ route.
- Đổi/xác minh lại email, SĐT; xác nhận API/retention end-to-end cho xoá tài khoản.

## 7. Lỗi web còn mở

Kiểm lại trên code ngày 06/10/2026 (chuyển từ `docs/mobile-finance-module-status.md` §7):

| # | Chỗ | Lỗi | Ghi chú |
| --- | --- | --- | --- |
| 1 | `apps/web/src/features/payments/schema.ts` | Viết thẳng chuỗi tiếng Việt ("Nhập số tiền", "Số tiền phải lớn hơn 0", "Chọn hình thức") — giao diện tiếng Anh báo lỗi tiếng Việt (ADR 0012) | Đổi sang schema nhận `t` như `receiptFormSchema`. `RecordRefundDialog` **đã** được i18n hoá |
| 2 | `features/settlement/components/SettlementCard.tsx:91` · `RecordRefundDialog.tsx:134` (+ `SurchargeDialog.tsx:343`) | So tiền bằng `Number()` (`Number(data.additionalDue) > 0`, `Number(settlement.surchargeTotal) > 0`) — ngược ADR 0007 | Dùng `isZeroMoney`/`isNegativeMoney` của `@/lib/money` |
| 3 | `apps/web/src/app/(manage)/manage/debts/page.tsx` | Không có `PermissionState`: thiếu `finance.view` mở thẳng URL vẫn dựng khung rồi mới ăn 403 | `finance/` và `receipts/` đã có |
| 4 | `features/finance/components/CategoryManagerModal.tsx` | Không có trạng thái LỖI — tải hỏng hiện như "chưa có danh mục" | Thêm nhánh lỗi + thử lại |
| 5 | `features/finance/components/ReceiptFormDrawer.tsx` | Đổi chiều tiền (`type`) không xoá `categoryId` đã chọn ⇒ gửi danh mục của chiều kia | App mobile clone đúng hành vi này — sửa cả hai bên cùng lúc |
| 6 | Hợp đồng (BKG-14) | Chưa có endpoint xuất/in PDF hợp đồng (`apps/api/src/modules/contracts` không có đường xuất) | Màn xem đã có ở web và app |

## 8. Những gì đang thừa hoặc nên hoãn

- Năm route placeholder ở `/account` (§6 P1): giữ ngoài menu cho tới khi có luồng thật.
- Custom role builder: bốn role tenant cố định đủ cho pilot.
- OCR nâng cao, e-signature, dark mode, command palette: chỉ làm khi có nhu cầu đo được.
- Ví có nạp/chuyển/thanh toán nội bộ: ngoài phạm vi (ADR 0033 điều 1).
- Chi trả tự động: hoãn đến khi luồng thủ công có volume và đã chọn đối tác.
- Ưu đãi chuyến đầu / chương trình acquisition: chỉ chạy dưới dạng **mã khuyến mãi nền tảng** có ngày hiệu lực và điều kiện "khách mới" (ADR 0046) — không thành chính sách phí mặc định (ADR 0028).

## 9. Release gate còn thiếu

| Gate | Điều kiện tối thiểu |
| --- | --- |
| Gói thuê bao | SePay cấu hình thật trên staging/production + UAT thiếu/thừa/sai mã (mã đã có) |
| Tiền khách | Ý kiến pháp lý/đối tác cho thu hộ/chi hộ; chạy trọn luồng giữ chỗ → đơn → hoàn/quyết toán → rút trên staging (ADR 0028 release gate · ADR 0033) |
| Bảo hiểm | Hợp đồng với PVI hoặc đối tác hợp pháp khác; hai policy, biểu phí, consent/opt-out, chứng nhận, bồi thường; chốt hành vi khi phát hành thất bại lúc bàn giao |
| Thuế | Tư vấn thuế xác nhận phân loại chủ thể/dịch vụ; thay số tham khảo đang cấu hình bằng policy production |
| Pilot | Production OTP/email/storage/chat, monitoring, kênh hỗ trợ, Terms/Privacy và UAT theo realm × thiết bị |
| Public launch | Browser E2E, restore drill, incident runbook, product analytics, không còn dead link quan trọng, mobile căn theo ADR 0053 |

## 10. Quy tắc chấp nhận xuyên suốt

- Mọi số tiền có đơn vị, chủ sở hữu, nguồn và trạng thái; tiền là chuỗi trên dây, không `Number()` (ADR 0007).
- Đơn lưu snapshot giá/phí/chính sách/mã khuyến mãi; đổi cấu hình không sửa lịch sử.
- Webhook/job chạy lại không cộng tiền hai lần — chặn bằng constraint DB.
- Tiền thuộc XePrime và tiền phải trả người khác đối chiếu tách biệt.
- Chức năng bị giới hạn phải chặn ở server; ẩn menu chỉ là UX. Realm, tuyến và quyền do server quyết.
- Giao dịch ngoài nền tảng được đánh dấu và không quảng bá với mức bảo vệ như on-platform.
