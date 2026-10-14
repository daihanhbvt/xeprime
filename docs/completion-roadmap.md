# XePrime — Completion Roadmap

> Cập nhật: 14/10/2026 (ADR 0060 — đăng nhập SĐT, đặt xe cần tài khoản) · 06/10/2026 (dọn tài liệu · trạng thái staging thật · tiến độ ADR 0043–0053)
> Trạng thái: **Canonical — tiến độ và thứ tự thực hiện**
> Tầm nhìn: [`design/02_PRODUCT_VISION.md`](design/02_PRODUCT_VISION.md)
> Khoảng trống chi tiết: [`design/03_PRODUCT_GAP_ANALYSIS.md`](design/03_PRODUCT_GAP_ANALYSIS.md)

## 1. Dự án đang ở giai đoạn nào

**Functional alpha / web pilot-ready có kiểm soát.**

XePrime đã vượt prototype: web có thể mô phỏng phần lớn vòng đời cho thuê. Dự án chưa đủ điều kiện public launch vì luồng tiền marketplace, vận hành admin tài chính, hỗ trợ/tranh chấp, monitoring và kiểm chứng production chưa khép kín.

Trạng thái dưới đây phân biệt rõ **đã có trong source/feature branch** với **đã vượt release gate**. Một tính năng chưa được coi là vận hành xong chỉ vì đã có màn hình, endpoint hoặc test riêng lẻ.

| Mảng                    | Trạng thái                                   | Ghi chú                                                                                                                                                                  |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core architecture       | Đã có                                        | Monorepo, tenant scope, RBAC, audit, PostgreSQL constraints, OpenAPI contract                                                                                            |
| Marketplace web         | Có thể pilot                                 | Search/listing/shop/quote/request/trips/review/chat                                                                                                                      |
| Shop management web     | Khá đầy đủ; R1 đang đóng gate                | Xe, lịch, booking, giao nhận, khách, tài chính, maintenance, members/branches/drivers; dashboard thật, invitation và legal/email flow đã được bổ sung trên code hiện tại |
| Platform admin core     | Đã có                                        | Approval, tenants, vehicles, bookings, customers, staff, plans, content, audit                                                                                           |
| Gói thuê bao W1–W3      | Đã có trong code                             | Gói theo bậc số xe (ADR 0041), subscription UI/invoice, feature guard                                                                                                                         |
| SePay subscription W4   | **Đã merge vào `develop` và lên staging**; chưa vượt Gate R2 | Có VietQR, webhook, bank matching, xử lý thiếu/thừa/trùng và admin match tay; còn cần cấu hình môi trường thật và UAT gate                                              |
| Cổng MoMo · VNPAY (ADR 0058) | **Đủ mã, chưa merge (09/10/2026), mặc định TẮT; chưa vượt gate nào** | Phương thức bổ sung cho hoá đơn gói và tiền giữ chỗ: sổ `payment_gateway_orders` + nhật ký kết quả, IPN có chữ ký, truy vấn phía server, bộ quét định kỳ, hàng đợi người xử lý (hỏi lại · đóng · ghi nhận tay). CHƯA CÓ: bộ khoá sandbox thật + UAT staging (third-party-keys §8c.4), hợp đồng merchant, quyết định phí cổng/hoàn tiền/đối soát (ADR 0058 Q1–Q8). Cả hai luồng bị mã chặn ở production cho tới khi ADR 0058 Accepted; app native chưa có lối này |
| Marketplace money       | **Đủ mã, đã lên staging; chưa vượt gate nào** | Mọi mảnh của luồng tiền ADR 0032/0033/0044 đã có mã + test và đã được deploy lên staging (mục 8.1). CHƯA CÓ: một lượt UAT tiền có bằng chứng trên staging, đối tác bảo hiểm thật, ý kiến thuế, ý kiến pháp lý thu hộ. Bảo hiểm và thuế đang BẬT bằng **số tham khảo thị trường** theo chỉ đạo 14/09 — xem mục 5 quyết định 4 và 5 |
| Basic-owner experience  | **Đã tách ở code (ADR 0038 · 0053); chưa vượt gate** | Ranh giới hai tuyến chặn ở server (ADR 0038 điều 1, 3, 4, 5). Theo ADR 0053: **ví theo TÀI KHOẢN** (tài khoản khách có ví riêng, ví gian hàng thuộc tenant; tiền hoàn chuyến đi thuê luôn về ví tài khoản khách qua `resolveRefundWalletOwner`), **tài khoản đối tác/quản trị không đặt xe** (đặt xe chỉ ở realm `customer`), **chặn tự đặt xe** bằng phép so SĐT ĐÃ XÁC MINH giữa tài khoản khách và chủ/thành viên gian hàng ở backend (`CANNOT_BOOK_OWN_VEHICLE`). CHƯA CÓ: smoke test có bằng chứng cho bốn nhóm người dùng trên staging |
| Khuyến mãi nền tảng     | **Đã có mã (ADR 0046); chưa vượt gate R3**    | Mã do XePrime tài trợ: admin phát hành, khách áp ở web + app, dòng tiền khép kín qua hold/đơn/hoàn. CHƯA CÓ: một chiến dịch chạy thật và một lần đối soát ngân sách tài trợ trên staging |
| Xếp hạng chợ xe (ADR 0043) | **Đã có mã, đã lên staging (22/09)**     | `rank_score` denormalize trên listing (`prisma/src/listing-rank.ts`) + job ngày `apps/worker/src/jobs/listing-rank-refresh.ts` + `GET /public/listings/recommended` (bậc địa lý, trần 2 xe/gian hàng). CHƯA CÓ: đo tác động lên conversion ở pilot |
| Huỷ của chủ xe + uy tín gian hàng (ADR 0045) | **Đã có mã, đã lên staging (22–23/09)** | `modules/cancellations/` (writer duy nhất `booking_cancellations`, `responsible_party` do server suy) · `modules/host-metrics/` (ba chỉ số, cửa sổ 90 ngày, ngưỡng `HOST_METRIC_MIN_SAMPLES` = 1 từ 23/09) · hai vế uy tín/khám phá trong `rank_score`. Test: `host-cancellation.spec.ts` · `host-metrics.spec.ts` · `listing-rank-coldstart.spec.ts`. Chưa có chế tài nào — cố ý (ADR 0045) |
| Rút gọn trạng thái đơn (ADR 0047) | **Xong, đã lên staging (23/09)**         | `booking.status` còn 5 giá trị + CHECK ở DB (migration `20260923150000_booking_status_simplification`); hộp thư yêu cầu 3 tab; "Chờ giao xe" bỏ ô lọc/cột trạng thái. Test `booking-status-transition.spec.ts` |
| Công tắc hiển thị của chủ xe (ADR 0048) | **Xong, đã lên staging (23/09)**   | `vehicles.marketplace_enabled` + `PATCH /vehicles/:id/marketplace-visibility` (compare-and-set) + `resolveMarketplaceVisibility`; công tắc ở đầu hồ sơ xe web. Test `vehicle-marketplace-visibility.spec.ts` |
| Màn kiểm duyệt xe (ADR 0049) | **Xong ở web + API, đã lên staging (24/09)** | Chỉ phiếu XE, duyệt trên ảnh chụp v2, checklist thủ công là cổng backend, khoá dòng phiếu. Hoãn có chủ đích: nút gửi xác minh gian hàng còn trên app (đội mobile) và nhãn hai hành động audit mới ở màn nhật ký |
| Không gian hỗ trợ gian hàng (ADR 0050) | **Đợt 1 + 2A + 2B đã có mã, đã lên staging (25–28/09)** | `modules/tenant-support/` + `@SupportAction` default-deny + audit ép phía nền tảng; ghi hẹp theo capability + lý do riêng (Đợt 2B). Còn mở: thông báo cho chủ xe khi phiên hỗ trợ tạo nháp/đổi dữ liệu (ADR 0050, hệ quả) |
| Lọc chi nhánh theo màn + phân quyền theo chi nhánh (ADR 0052) | **Xong ở web + API, đã lên staging (01/10)** | 10 màn lọc theo `?branchId=`, `resolveBranchScope()`, `meta.unassignedCount` ở sổ thu chi; `tenant_memberships.branch_scope` + `membership_branches`. Test `branch-filter.spec.ts` · `branch-scope-coverage.spec.ts` |
| Ba site web + ba realm tài khoản (ADR 0051 · 0053) | **Web + API + DB đã merge `develop` (PR #150, 05/10) và lên staging (PR #152, 06/10)** | Chi tiết và phần còn lại ở T7 (mục 8.4) |
| Mobile — app XePrime (khách) | Gần đủ luồng khách; chưa vượt gate R6   | Mobile là HAI Expo app + `apps/mobile/shared` (ADR 0051 điều 5): `apps/mobile/customer` (XePrime) và `apps/mobile/manage` (XePrime Partner). App khách có: auth + discovery + gửi yêu cầu thuê + chuyến của tôi + **tiền giữ chỗ bằng VietQR sau khi được duyệt** (`shared/src/features/trips/components/TripHoldPanel.tsx`, ADR 0044) + mã khuyến mãi + tiền của các chuyến + ví điểm/tài khoản nhận tiền + đánh giá + chat + thông báo in-app (COM-01→04) + thông báo đẩy (COM-07). Push đủ hai đầu nhưng **chưa thử trên máy thật** (thiếu credential Firebase + khoá APNs). Còn thiếu: E2E luồng tiền trên native, deep links/App Links, iOS build và CI release; gỡ Owner Lite khỏi app khách theo ADR 0053 đang ở nhánh mobile riêng, chưa merge |
| Mobile — app XePrime Partner | Một phần                                | Hộp thư yêu cầu, đơn thuê, biên bản giao/nhận, quyết toán, thu tiền, lịch, xe, gói thuê bao, ví gian hàng — xem R6 và `docs/mobile-module-status.md`. Backend đã mở app Partner cho MỌI tài khoản đối tác (cả tuyến hoa hồng, ADR 0053); phần app tương ứng làm ở nhánh mobile riêng |
| Production readiness    | Chưa đạt                                     | Chưa có đủ E2E, monitoring, legal/compliance gate và bằng chứng vận hành thật                                                                                            |

Không dùng phần trăm hoàn thành tổng dự án: một màn hình đơn giản và một luồng giữ tiền không có cùng trọng số. Mỗi release chỉ được coi là xong khi vượt gate tương ứng.

## 2. Định hướng hiện hành (chốt 07/09/2026, sửa theo ADR 0032 và ADR 0041)

1. XePrime là một marketplace đăng/thuê xe và bán phần mềm quản lý cho thuê xe.
2. Một chủ xe có hai lựa chọn:
   - **Basic owner:** không trả thuê bao; booking on-platform áp dụng phí dịch vụ XePrime ở **phía khách thuê**; dùng Owner Lite.
   - **Gian hàng thuê bao:** trả theo số xe/kỳ hạn; 0% phí dịch vụ XePrime cộng vào giá khách trong thời gian gói hiệu lực; dùng đầy đủ Manage.
3. Gói gian hàng bán theo **BA BẬC trần SỐ XE** (tổng ô tô + xe máy, không chia theo loại) và kỳ hạn 1/3/6/12 tháng — ADR 0041: **Cơ bản** 3 xe / 1 chi nhánh (100.000đ · 250.000đ · 450.000đ · 800.000đ), **Nâng cao** 10 xe / 3 chi nhánh (250.000đ · 650.000đ · 1.200.000đ · 2.000.000đ), **Chuyên nghiệp** không giới hạn, bán bằng tư vấn. Giá mỗi kỳ là con số tuyệt đối admin cấu hình ở `limits.termPrices`; giá theo chỗ ô tô/xe máy của ADR 0029 điều 3 đã bị ghi đè. Đây vẫn là giá pilot, chưa phải giá production.
4. Định hướng bảo hiểm là hợp tác với **PVI**. Theo ADR 0032 điều 2, **khách** trả cả `IV` (bảo hiểm xe/chuyến, bắt buộc) lẫn `IP` (bảo hiểm tai nạn người, tùy chọn) trong khoản thanh toán online; chủ xe không chịu và không bị khấu trừ khoản này. Bảo hiểm chỉ phát hành ở mốc bàn giao (ADR 0032 điều 4). Thu tiền khách thật chỉ khi đã có thỏa thuận, sản phẩm và biểu phí thật (gate L2).
5. Basic owner bắt buộc có khoản giữ chỗ với booking đủ điều kiện.
6. Tiền còn lại có thể trả trực tiếp chủ xe; phương án nền tảng thu hộ toàn bộ chỉ mở khi đã đủ legal/payment/operations gate.
7. Số tiền chờ trả chủ xe là sổ công nợ nội bộ, không phải ví điện tử đa dụng.
8. Gian hàng có thể nhận liên hệ/giao dịch trực tiếp; UI phải nói rõ giới hạn bảo vệ của XePrime ngoài nền tảng.
9. Gói có thể tăng ưu tiên hiển thị trong nhóm kết quả phù hợp, không mua quyền đứng trên một kết quả kém chất lượng.

Với tuyến Basic, tổng giá khách thấy gồm giá thuê do chủ xe đặt và các dòng phụ phí chuyến hợp lệ. Pilot khởi đầu chỉ bật **phí dịch vụ XePrime 10%** theo policy; khoản này không bị khấu trừ khỏi tiền thuê của chủ xe. Thuế và bảo hiểm chỉ được bật bằng số thực sau khi vượt gate tương ứng. `commissionPercent` trong code cũ phải được hiểu là tỷ lệ phí dịch vụ cộng vào giá khách, không phải tỷ lệ trừ vào owner earning.

Chi tiết và quan hệ ghi đè ADR cũ: [ADR 0028](decisions/0028-marketplace-subscription-fees-and-custodied-funds.md), [ADR 0029](decisions/0029-per-vehicle-flat-pricing-and-customer-side-fees.md) và [ADR 0041](decisions/0041-plan-tiers-by-vehicle-count.md). Trong phạm vi NGƯỜI trả phí dịch vụ, ADR 0029 (điều 1–2) được ưu tiên; trong phạm vi CÁCH ĐÓNG GÓI và ĐỊNH GIÁ tuyến gói, ADR 0041 ghi đè giá theo chỗ của ADR 0029 điều 3.

## 3. Lộ trình hiện hành

### R0 — Đồng bộ định hướng và tài liệu

Trạng thái: **Đã thực hiện đợt đầu ngày 03/09/2026; roadmap/prompt được đồng bộ tiếp với ADR 0029 ngày 07/09/2026**.

- Dọn tài liệu lịch sử không còn là nguồn sống.
- Viết lại Product Vision, Gap Analysis, Information Architecture và roadmap.
- Ghi ADR 0028 và ADR 0029 để thay đổi business model, giá gói và phía trả phí có dấu vết.
- Đánh dấu ADR cũ bị ghi đè toàn phần hoặc một phần.
- **06/10/2026 — đợt dọn thứ hai:** gỡ `roadmap.html`, `docs/plans/`, các design doc 04/05/06/09/10/11/12, runbook backfill ví (cảnh báo còn hiệu lực chuyển vào mục 6) và tài liệu migration badge mobile (hai việc còn mở chuyển vào mục 6). Roadmap này là nơi DUY NHẤT theo dõi tiến độ.

Các lựa chọn sản phẩm hiện hành được ghi tại mục 5; giá production, cấu trúc thuế và điều khoản bảo hiểm vẫn phải vượt các gate tương ứng. Khi Product Vision, Gap Analysis, CLAUDE.md hoặc tài liệu kế hoạch cũ chưa kịp đồng bộ, ADR Accepted mới nhất thắng trong đúng phạm vi ghi đè.

### R1 — Stabilize nhánh hiện tại và đóng pilot UX

Mục tiêu: có một bản web đáng tin để demo/pilot mà chưa nhận tiền khách thật.

Trạng thái: **Đang đóng gate**. Code hiện tại đã bổ sung dashboard dùng dữ liệu thật, invitation token, legal pages/consent và email delivery; chưa được tuyên bố hoàn thành R1 cho tới khi production integration, security review và UAT có bằng chứng.

- Review và chạy lại test/typecheck/build toàn workspace sau thay đổi slot billing/i18n.
- ~~Hoàn thiện dashboard shop: doanh thu, tiền giữ/cọc và việc cần làm bằng dữ liệu thật.~~ Xong 09/10/2026: Tổng quan ba bề mặt (gian hàng gói · chủ xe cá nhân · nền tảng) — việc cần làm + câu trả lời đầu trang, lịch giao/nhận 7 ngày, KPI tháng so cùng kỳ (tỉ lệ lấp đầy), uy tín, gói, ví; API `GET /dashboard/overview` + `GET /platform/dashboard/overview`. Còn chờ: UAT trên dữ liệu pilot.
- Ẩn dead links và menu placeholder chưa có luồng.
- Đổi “mời thành viên” thành đúng hành vi hoặc làm invitation thật.
- **14/10/2026 — ADR 0060:** site khách/partner đăng nhập bằng SĐT + mật khẩu (email bị server từ
  chối) hoặc Google/Facebook; đăng ký xác minh OTP ngay; OTP thôi là cách đăng nhập (route cũ 410);
  quên mật khẩu bằng OTP; cổng xác minh SĐT cho tài khoản social/cũ; gửi yêu cầu thuê cần tài khoản
  khách, bản nháp giữ qua lượt đăng nhập và không tự gửi; mời thành viên bằng SĐT + liên kết cho chủ
  gian hàng tự gửi; chuẩn hoá `users.phone`. Còn chờ: app native cập nhật theo mục Hệ quả của ADR,
  UAT, và năm câu hỏi mở (tài khoản chỉ có email, gộp tài khoản khi `PHONE_TAKEN`, thu hồi phiên khi
  đặt lại mật khẩu, SMS cho lời mời, vai trò tuỳ biến).
- Hoàn thiện Terms, Privacy, quy chế marketplace, chính sách hủy và kênh support.
- Cắm production OTP/email/R2/chat; thêm error tracking, uptime monitoring và product events.
- Rà CSRF, PII reveal, rate limit và audit của hành động nhạy cảm.
- UAT happy path theo role × desktop/mobile web.
- ~~Địa chỉ còn là ô chữ tự do, không lọc được và đã lệch mô hình hành chính hai cấp.~~
  **Xong 14/09/2026 (ADR 0035).** Bảng `wards` (3.321 đơn vị, nạp bằng migration từ danh mục
  QĐ 19/2025/QĐ-TTg), `AddressService` là nơi duy nhất kiểm danh mục + ghép chuỗi hiển thị +
  chốt toạ độ, FK tổ hợp `(ward_code, province_code)` giữ luật "xã thuộc tỉnh" ở DB, và ô nhập
  địa chỉ dùng chung cho web + app native (chọn tỉnh → chọn xã có tìm → gõ số nhà có gợi ý →
  xác nhận ghim). **Việc còn lại là VẬN HÀNH, không phải code:** mọi chi nhánh đang mang cờ
  "cần cập nhật địa chỉ" và phải được chủ shop mở ra xác nhận — migration KHÔNG đoán mã xã cho
  dữ liệu cũ (ADR 0035 điều 7).

**Gate R1:** 3–5 shop có thể chạy booking request → giao → trả → quyết toán mà không cần sửa dữ liệu trực tiếp.

### R2 — Thu tiền gói thuê bao

Mục tiêu: nguồn doanh thu đơn giản nhất hoạt động trước.

Trạng thái: **Lát cắt W4 đã merge vào `develop`, chưa vượt Gate R2**. Việc tiếp theo là cấu hình SePay-ngân hàng thật, kiểm chứng migration và chạy UAT; **không xây lại webhook hoặc bank matching** — chúng đã chạy và có test (`apps/api/test/sepay-webhook.spec.ts`).

- Review và hoàn thiện lát cắt SePay/VietQR cho subscription invoice đã có trên feature branch.
- Đối soát idempotent: đúng/thiếu/thừa/sai mã/trùng webhook.
- Tự kích hoạt/gia hạn chỉ khi tiền đã về.
- Admin xem invoice và giao dịch chưa khớp; có đường xử lý thủ công kèm audit.
- Grace/read-only/downgrade rõ ràng; không khóa mất dữ liệu cũ.
- Trang so sánh Basic Owner và Gian hàng.
- Bán BA BẬC gian hàng theo trần số xe và kỳ hạn (ADR 0041): Cơ bản 3 xe / 1 chi nhánh (100k · 250k · 450k · 800k cho 1/3/6/12 tháng), Nâng cao 10 xe / 3 chi nhánh, Chuyên nghiệp không giới hạn và bán bằng tư vấn. Giá là con số tuyệt đối của từng kỳ hạn; % tiết kiệm chỉ là phép so sánh hiển thị. Đo conversion theo bậc và tỉ lệ chạm trần trước khi chốt giá production.
- **Phễu đăng ký gian hàng trả phí — xong 16/09/2026 (ADR 0040).** Hai cửa vào tách hẳn: ý định lưu ở `tenants.onboarding_state`, onboarding hai bước (khai gian hàng → chọn gói + QR) phục hồi được sau F5, thanh toán mở Manage trong cùng transaction với webhook. Cổng "xác minh pháp nhân mới được mua gói" của ADR 0036 đã bỏ — nó đứng chắn ở đúng chỗ nền tảng đang muốn thu tiền.

**Gate R2:** một shop tự mua/gia hạn gói và hệ thống đối soát đúng mà admin không sửa database.

### R3 — Marketplace transaction cho Basic Owner

Mục tiêu: cộng phí dịch vụ theo chuyến vào giá khách một cách minh bạch, hoàn tất Owner Lite và vẫn giới hạn lượng tiền XePrime giữ.

Trạng thái: **mã đã đủ và đã lên staging, chưa vượt Gate R3.** Cập nhật 14/09/2026 sau khi khép năm
mảnh cuối của luồng tiền. Bảng dưới là trạng thái THẬT đọc từ source, không phải từ kế hoạch:

| Mảnh | Đã có ở đâu | Bằng chứng |
| --- | --- | --- |
| Công tắc thu cọc của gian hàng (tuyến hoa hồng BẬT + KHOÁ, tuyến gói theo cờ `ESCROW_HOLD`) · `deposit_collection_mode` đóng băng vào booking | `modules/deposit-policy/` · `booking_requests` duyệt tay VÀ tự nhận đều tính phí trước `commitDecision` | `deposit-policy.spec.ts` |
| Thứ tự **duyệt → thu tiền giữ chỗ → đơn thuê** (ADR 0044); yêu cầu trùng khung giờ đóng bằng `slot_taken` | `booking-requests.service.ts` (`commitDecision` · `approveWithHold` · `closeSupersededRequests`) · `apps/worker/src/jobs/booking-hold-expiry.ts` | `booking-hold-lifecycle.spec.ts` · `booking-request-deadline.spec.ts` · `vehicle-auto-accept.spec.ts` |
| Bảo hiểm `IV`/`IP` — vòng đời 7 trạng thái, phát hành ở mốc bàn giao qua job có retry, adapter mặc định KHÔNG tạo chứng nhận giả | `modules/insurance/` · `apps/worker/src/jobs/insurance-issue.ts` | `insurance-lifecycle.spec.ts` |
| Thuế `T` — sổ append-only, chỉ phát sinh khi chuyến BẮT ĐẦU, đảo bằng dòng âm, kỳ theo giờ VN | `modules/tax/` · `bookings.service.ts` khi `→ active` | `tax-withholding.spec.ts` · `packages/types/src/tax.test.ts` |
| Đối chiếu BA CHIỀU (nền tảng ↔ giữ hộ ↔ số dư ngân hàng cuối ngày) · phân bổ đóng băng vào 5 cột `settled_*` · phát hiện lệch sổ ví | `modules/holds/booking-holds.service.ts` · `hold-settlement.service.ts` | `reconciliation-three-way.spec.ts` |
| "Tiền của các chuyến đã thuê" cho khách — đọc `payments`, KHÔNG phải màn ví | `modules/payments/account-payments.*` · web `features/account-payments/` | `account-payments.spec.ts` |
| **Mã khuyến mãi do NỀN TẢNG tài trợ** (23/09/2026) — giảm số khách trả mà không bớt tiền gian hàng; lượt dùng GIỮ → CHỐT → NHẢ với trần gác ở DB; ba cửa kiểm và snapshot điều kiện | `modules/promo-codes/` · `prisma/src/promo-redemption.ts` · `packages/types/src/promo-code.ts` · web `features/promo-codes/` + màn quản trị `app/(admin)/admin/promo-codes/` (site `admin.xeprime.vn`, URL `/promo-codes`) · native `apps/mobile/shared/src/features/promo-codes/` + `apps/mobile/shared/src/api/promo-codes/` | `promo-code-lifecycle.spec.ts` (36 test) · `packages/types/src/promo-code.test.ts` (46 test) · `PriceBreakdown.promo.test.tsx` · `PromoCodeField.test.tsx` |

Bằng chứng test ngày 14/09/2026: **5 suite / 64 test xanh** trên PostgreSQL thật với `REQUIRE_DB=1`
(thiếu DB là cả run đỏ, nên không có test nào bị bỏ qua lặng lẽ) · `packages/types` 207 test ·
`openapi-contract` 19 test · `i18n:check` 46 namespace × 2 ngôn ngữ / 6.414 khoá · `migrate diff`
**không có drift** trên các bảng của luồng tiền.

Cái này KHÔNG phải bằng chứng vượt gate: tất cả đều là máy dev. Xem mục 8 để biết còn thiếu gì.

- Owner Lite navigation và dashboard. (Dashboard xong 09/10/2026 — `OwnerDashboardView`: việc cần làm, lịch giao nhận, thu nhập + số dư từ sổ ví, xe của bạn, uy tín; KHÔNG báo cáo theo kỳ — ADR 0027 điều 1.)
- Xác minh người bán, loại chủ thể, thông tin thuế và tài khoản nhận tiền.
- Versioned fee policy và booking snapshot, phân biệt phí dịch vụ XePrime, thuế thật, bảo vệ xe và bảo hiểm chuyến đi.
- Quote breakdown minh bạch cho khách và net earning preview cho chủ xe; phí dịch vụ XePrime 10% của tuyến Basic nằm phía khách, không trừ khỏi tiền thuê chủ xe; tuyến gói là 0%.
- Khoản giữ chỗ bắt buộc, expiry, cancellation và refund — thu SAU khi chuyến được nhận, cửa sổ 120 phút với hai mốc nhắc và không gia hạn (ADR 0044).
- Mã khuyến mãi do nền tảng tài trợ (ADR 0046): giảm khoản khách chuyển online, gian hàng nhận đủ; `settled_platform_amount` nay là con số NET và **âm được** khi khoản tài trợ lớn hơn phí dịch vụ của chuyến — mọi báo cáo doanh thu nền tảng phải đọc nó như vậy.
- Tích hợp bảo vệ xe bắt buộc cho chủ xe và bảo hiểm chuyến đi tùy chọn cho người thuê với PVI nếu hoàn tất hợp đồng/sản phẩm; lựa chọn của khách phải được lưu vào booking snapshot.
- Phân bổ riêng phí dịch vụ, thuế, bảo hiểm thật và khoản phải trả chủ xe; mỗi dòng có người hưởng/chịu, trạng thái và quy tắc hoàn rõ ràng.
- Support case/dispute gắn booking.
- Admin money operations và daily reconciliation tối thiểu.

Ở release đầu, ưu tiên **khách trả phần còn lại trực tiếp cho chủ xe**. XePrime chỉ thu khoản giữ chỗ và các dòng được policy phân bổ vào khoản đó; ADR 0029 không đồng nghĩa XePrime phải thu toàn bộ tiền thuê. Cách này giảm tiền phải giữ hộ nhưng vẫn cho XePrime kiểm chứng marketplace và phí dịch vụ phía khách.

> ⚠️ **Cập nhật 10/09/2026 theo ADR 0032/0033.** Ba câu ở trên đã đổi nội hàm:
> khoản khách trả online là `D + S + IV + IP` (cọc là **một phần giá thuê**, không phải phí thêm),
> nên **cả hai tuyến** đều sinh khoản XePrime phải trả chủ xe (`D − T`). Hệ quả: **ví/sổ công nợ và
> rút tiền không còn là việc của R4** — chúng là điều kiện để R3 chạy được. Bảo hiểm do **khách**
> trả (không phải chủ xe) và chỉ phát hành ở mốc bàn giao; thuế do chủ xe chịu, khấu trừ khỏi khoản
> phải trả. Quyết định gốc: [ADR 0032](decisions/0032-booking-deposit-insurance-and-owner-lite.md)
> và [ADR 0033](decisions/0033-money-ledger-and-deposit-allocation.md).

**Gate R3:** tiền vào–hoàn–giữ của mọi case UAT khớp sổ; không có bút toán mồ côi hoặc cộng đôi
(điểm dễ vỡ đã biết của phần "không cộng đôi": xem cảnh báo backfill ví ở mục 6).

### R4 — Thu hộ đầy đủ (phần còn lại của tiền thuê)

Mục tiêu: cho khách trả **phần `B − D` còn lại** trên nền tảng, thay vì trả trực tiếp chủ xe.

> ⚠️ **Cập nhật 10/09/2026.** Sổ công nợ, số dư chủ xe và rút tiền đã **chuyển xuống R3** (xem ghi
> chú ở R3): với ADR 0032, mỗi chuyến hoàn thành đều sinh khoản phải trả chủ xe, nên không có ví
> thì tiền cọc vào rồi mắc kẹt. R4 nay chỉ còn phần **thu hộ toàn bộ tiền thuê**.

Chỉ bắt đầu sau khi có:

- Ý kiến pháp lý về mô hình thu hộ/chi hộ và nghĩa vụ giấy phép/đối tác.
- Thỏa thuận với ngân hàng hoặc đơn vị thanh toán phù hợp.
- Quy trình thuế và đối tác bảo hiểm thật.
- Finance admin, maker–checker, dispute và reconciliation từ R3.

Phạm vi:

- Thu toàn bộ tiền chuyến tùy lựa chọn.
- Sổ cái append-only, owner balance và withdrawal request.
- Admin chuyển thủ công, mục tiêu xử lý dưới 10 phút khi có người trực; cam kết không quá 2 ngày làm việc.
- Reversal, failed payout, thay đổi tài khoản ngân hàng có cooldown/xác minh lại.
- Báo cáo tách tiền XePrime với tiền phải trả người khác.

**Gate R4:** số dư ngân hàng khớp ledger hằng ngày và không có yêu cầu rút quá SLA trong pilot.

### R5 — Controlled marketplace pilot

Mục tiêu: kiểm chứng cung, cầu và economics.

- 5–10 đối tác, gồm chủ xe cơ bản và gian hàng.
- 50–100 xe thật ở một khu vực đủ tập trung.
- Theo dõi funnel, tỷ lệ hủy/no-show, dispute, thời gian payout và chi phí support.
- Theo dõi tác động của tổng giá khách trả đến conversion, khả năng cạnh tranh của xe Basic so với xe gói và owner earning thực nhận.
- A/B hoặc cohort test giá gói, phí dịch vụ và ưu tiên hiển thị; không thay đổi booking đang chạy.
- Diễn tập restore database, incident và hoàn tiền.

**Gate R5:** có booking thật lặp lại, reconciliation ổn định, support xử lý được ngoại lệ và unit economics không âm sau chi phí thanh toán/hỗ trợ/khuyến mại.

### R6 — Mobile customer completion và public launch

Mục tiêu: app native phục vụ trọn luồng người thuê, đồng thời duy trì ổn định lát cắt quản lý đã có.

- ~~Booking, hold/payment và trips.~~ **Đã có trên app XePrime**: gửi yêu cầu, tiền giữ chỗ VietQR sau khi được duyệt (`TripHoldPanel`, ADR 0044), mã khuyến mãi, chuyến của tôi. Còn lại: E2E luồng tiền trên native (T1). *Chat, thông báo in-app và thông báo đẩy xong 10/09/2026 (COM-01→04 + COM-07) — chi tiết ở `mobile-module-status.md` §2.9 và [`push-notifications.md`](push-notifications.md). Còn lại: một lượt kiểm push trên máy thật, và màn cài đặt bật/tắt từng loại thông báo.*
- Deep links/App Links, environment profiles, iOS build và CI release.
- Crash/error reporting và analytics đồng nhất web/mobile.
- Duy trì và sửa lỗi cho lát cắt app XePrime Partner hiện có: inbox yêu cầu, booking, giao/nhận, quyết toán và thu tiền.
- Hoàn tất phía app của ADR 0053 (nhánh mobile riêng): app Partner nhận chủ xe tuyến hoa hồng, gỡ Owner Lite khỏi app XePrime.
- Chưa mở rộng thành Full Manage parity trên native; xe, tài chính nâng cao, thành viên, chi nhánh, báo cáo và cấu hình sâu vẫn ưu tiên responsive web cho tới sau controlled pilot.

## 4. Thứ tự ưu tiên Admin/Manage

| Ưu tiên | Platform Admin                                                                      | Manage/Owner                                                              |
| ------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| P0      | Seller verification, bank reconciliation, fee policy, refund/dispute, support case  | Dashboard thật, Owner Lite, quote/net earning, payment evidence           |
| P1      | Withdrawal queue, daily fund reconciliation, tax/insurance reporting, maker–checker | Owner balance/rút tiền, subscription purchase, invitation thật            |
| P2      | Risk scoring, promotion/ranking ops, accounting export                              | Tối ưu advanced reports, automation                                       |
| Hoãn    | Auto payout, BI lớn, custom workflow builder                                        | Mở rộng Full Manage parity trên native, custom roles, OCR/e-sign nâng cao |

Backlog/acceptance criteria đầy đủ: [`design/03_PRODUCT_GAP_ANALYSIS.md`](design/03_PRODUCT_GAP_ANALYSIS.md).

## 5. Sáu quyết định sản phẩm hiện hành

| #   | Quyết định                                                       | Phương án đã chốt / gate còn lại                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Basic owner trả phần còn lại trực tiếp hay qua XePrime mặc định? | Trực tiếp trong R3; thu hộ tùy chọn ở R4                                                                                                                                                                             |
| 2   | Ai trả phí dịch vụ XePrime theo chuyến?                          | Khách thuê trả qua phụ phí cộng vào báo giá ở tuyến Basic; không khấu trừ phí này khỏi tiền thuê của chủ xe. Pilot bắt đầu 10%; tuyến gói 0%                                                                         |
| 3   | Mức gói và kỳ hạn?                                               | Ba bậc theo trần SỐ XE (3 / 10 / không giới hạn), bán kỳ 1/3/6/12 tháng với giá tuyệt đối từng kỳ (ADR 0041); bậc không giới hạn bán bằng tư vấn. Admin cấu hình động và đo trước khi chốt giá production            |
| 4   | Bảo hiểm nào, ai cung cấp, ai trả?                               | Dự kiến PVI; **khách** trả `IV` + `IP` (ADR 0032 điều 2 ghi đè câu "chủ xe chịu" ở đây); phát hành ở mốc bàn giao. **ĐÃ BẬT 14/09/2026 bằng số tham khảo thị trường theo chỉ đạo** — xem ghi chú rủi ro dưới bảng |
| 5   | Thuế cho thuê xe được phân loại và nộp thay thế nào?             | Thuế do **chủ xe** chịu, khấu trừ khỏi khoản phải trả, không cộng vào tổng khách. **ĐÃ BẬT 14/09/2026 ở 10% (5% VAT + 5% TNCN) bằng số tham khảo thị trường theo chỉ đạo**, chưa có tư vấn thuế — xem ghi chú rủi ro dưới bảng |
| 6   | Giao dịch ngoài nền tảng được hưởng hỗ trợ tới đâu?              | Chỉ hỗ trợ thông tin/listing; không cam kết tiền/hoàn cho phần giao dịch không ghi nhận                                                                                                                              |

> ⚠️ **Rủi ro đã được chấp nhận có chủ đích (quyết định 14/09/2026).** Hai dòng 4 và 5 trước đây
> nói "chỉ bật khi có hợp đồng/tư vấn". Chủ dự án đã chỉ đạo bật cả hai ngay bằng số tham khảo thị
> trường để luồng tiền chạy trọn vẹn được trên máy dev, và fee policy v4 hiện hành mang
> `tax_percent = 10`, `tax_label = 'VAT 5% + TNCN 5%'`, `vehicle_protection 2%`, `trip_insurance 1%`.
> Ghi lại đúng ba điều này để không ai đọc con số ở trên như một kết luận pháp lý:
>
> 1. **Các con số là giả thuyết thị trường, chưa qua tư vấn thuế và chưa có hợp đồng bảo hiểm.**
>    Chúng là tham số cấu hình được (`fee_policies`, versioned), không phải hằng số trong mã —
>    đổi chúng là archive bản cũ + insert bản mới, đơn đã tạo KHÔNG bị tính lại (ADR 0024).
> 2. **Không thu tiền bảo hiểm thật khi chưa có đối tác.** Adapter mặc định
>    (`noop-insurance.partner.ts`) từ chối phát hành và CHECK ở DB cấm đánh dấu `issued` mà thiếu
>    số chứng nhận — nên phần `IV`/`IP` đã thu nằm trong quỹ giữ hộ dưới dạng `insurer_payable`
>    chứ không biến thành doanh thu của ai. Bật thu tiền khách thật trước khi có partner là vi
>    phạm ADR 0028, không phải một lựa chọn vận hành.
> 3. **Hai gate ở mục 8 vẫn còn nguyên** — bật cờ trong mã không vượt được chúng.

## 6. Nợ chất lượng cần theo dõi

- Kết quả test ghi trong tài liệu trước đây đã cũ so với code hiện tại; cần tạo baseline mới theo branch/commit và môi trường chạy.
- i18n audit: **1.077 chuỗi trong 24 khu vực** (đo lại 14/09/2026; con số 1.797 của 03/09 đã cũ). Luôn chạy lại trước khi dùng để lập kế hoạch.
- Chưa có browser/mobile E2E đủ cho giao dịch tiền.
- ⚠️ **Không chạy tay lại bước 2c của migration `20260911190000_refund_to_wallet`** — bước đó
  (cộng số dư) không idempotent; chạy lại là nhân đôi số dư ví của khách. Phát hiện lệch sổ ví đã
  có trong code: `walletDrift` ở `apps/api/src/modules/holds/booking-holds.service.ts`, hiện thành
  khối "Lệch sổ ví" ở `apps/web/src/features/platform-money/components/LedgerPanel.tsx`. Cùng
  migration đó nối dữ liệu bằng chuỗi `note` — mọi đối chiếu về sau dùng khoá cấu trúc
  `(wallet_id, kind, source_type, source_ref_id)` và số dư trước–sau.
- **Lệch tên index giữa `schema.prisma` và DB** ở `wallet_entries`, `withdrawal_requests`,
  `bank_accounts`, `vehicle_catalog_models`: `migrate diff` sinh 7 lệnh `ALTER INDEX … RENAME`.
  Chỉ là tên (không mất dữ liệu, không mất ràng buộc) nhưng nó làm `migrate dev` đẻ migration rác
  và làm mọi lần đọc drift phải bỏ qua tiếng ồn. Sửa bằng `map:` trên `@@index`/`@unique` của các
  model đó. Ngoài ra `vehicle_catalog_models.brand_catalog_type` có trong DB mà chưa có trong
  schema. Phần FK tổ hợp `(id, tenant_id)` trong cùng bản diff là drift ĐÃ BIẾT và có chủ đích
  (header của migration baseline đã cảnh báo — Prisma không mô tả được chúng).
- Chưa có bằng chứng trong repo về một lần triển khai production hoàn chỉnh và restore drill thành công.
- Chưa có external monitoring/error tracking/product analytics đủ cho pilot.
- Cloudflare R2 object storage chưa có chính sách backup/versioning hoàn chỉnh.
- Toàn bộ chi nhánh đang chờ chủ shop xác nhận lại địa chỉ theo danh mục hành chính hai cấp
  (ADR 0035 điều 7). Đây là nợ DỮ LIỆU có chủ đích — không backfill tự động — nên cần một đợt
  nhắc chủ động và một chỉ số theo dõi tỉ lệ còn cờ `needs_location_review`.
- **Tài liệu chưa đồng bộ (rà 06/10/2026, sau đợt dọn `docs/plans/`, `roadmap.html` và các design doc 04/05/06/09/10/11/12).** Các `docs/mobile-*-status.md` (đội mobile sở hữu) còn trỏ đường dẫn cũ `apps/mobile/src/...` — đọc thành `apps/mobile/shared/src/...`, và route `apps/mobile/app/...` nay nằm ở `apps/mobile/customer/app/` hoặc `apps/mobile/manage/app/` (ghi chú ở đầu `apps/mobile/README.md`); `mobile-module-status.md` vẫn ghi Payment "không làm — ADR 0013" trong khi app khách đã có tiền giữ chỗ VietQR.
- **Hai endpoint đếm chưa đọc cũ còn sống**: `GET /conversations/unread-count` và `GET /conversations/unread-summary`. Web và app mobile hiện hành đều đọc `GET /me/badges` (ADR 0034); hai endpoint kia chỉ còn vì bản app đã phát hành. Gỡ khi các bản app cũ hết lưu hành.
- **Firebase trên mobile: Firebase JS SDK hay `@react-native-firebase/*`** — chưa quyết, thuộc đội mobile. Hiện app dùng cả hai: `firebase` (JS SDK) cho phiên + listener Firestore (chat, huy hiệu) và `@react-native-firebase/messaging` cho push.
- **BKG-14 — xuất PDF hợp đồng**: chưa có endpoint; web in bằng `window.print`, app chỉ xem được hợp đồng.
- `PATCH /vehicles/:id/maintenance/records/:recordId/cost` (sửa chi phí phiếu bảo dưỡng đã hoàn tất) có ở API nhưng **chưa có client nào gọi** — web và app đều chưa có nút.
- ~~Một số DatePicker còn nợ xử lý timezone thống nhất.~~ **Xong 03/09/2026.** Hai chiều quy
  đổi đi qua `packages/domain/src/datetime.ts`: `toAppTz` (mốc UTC từ API → giờ hiển thị) và
  `appWallClockToInstant`/`appWallClockToIso` (giờ người dùng chọn trên ô → mốc UTC gửi lên),
  cộng `appWallClockToCalendarDate`/`calendarDateToAppWallClock` cho biên `react-day-picker`.
  Đã dọn ~20 chỗ `.toISOString()` trên giá trị picker (đơn thuê, khoá lịch, bảo dưỡng, banner,
  bàn giao, hoàn tiền, duyệt dài hạn, tìm kiếm marketplace) và một lỗi date-only ở hạn GPLX.
  ESLint chặn `import dayjs` trực tiếp trong mã sản phẩm (`packages/config/eslint/datetime.mjs`),
  và `ci.yml` chạy thêm một lượt `TZ=UTC` nên dòng ghim `TZ: Asia/Ho_Chi_Minh` không còn che
  được lỗi nào.

## 7. Chỉ số pilot

| Nhóm         | Chỉ số                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Activation   | Thời gian đăng ký → xe active; đăng ký → booking đầu                                                                          |
| Demand       | Search → listing → booking; số ngày-xe hoàn thành/tháng                                                                       |
| Supply       | Xe active/tuần; thời gian phản hồi; tỷ lệ chấp nhận                                                                           |
| Quality      | Tỷ lệ hủy, no-show, dispute, refund                                                                                           |
| Monetization | Conversion lên gói, gia hạn, doanh thu phí dịch vụ/booking, chênh lệch conversion theo tổng giá khách và mode Basic/Gian hàng |
| Operations   | Tỷ lệ auto-match, chênh lệch quỹ, withdrawal quá SLA, ticket quá SLA                                                          |

Không mở thêm feature lớn nếu chưa đo được ít nhất funnel activation, booking completion và money reconciliation của release đang chạy.

## 8. Gate còn lại của TOÀN dự án (rà 14/09/2026; mục 8.1 và T4/T7 cập nhật 06/10/2026)

Mục này trả lời một câu: *còn đúng những gì giữa hiện tại và một lần phát hành thật?* Nó gom
các gate đang chặn, xếp theo thứ tự phải mở, và nói rõ **ai mở được** — vì phần lớn không phải
việc của mã nguồn.

### 8.1 Gate HẠ TẦNG

**Staging ĐÃ chạy.** Nhánh `staging` nhận merge đều đặn từ 27/08/2026, và workflow
`.github/workflows/deploy.yml` (build ở GitHub Actions → GHCR → VPS `pull` → migrate) đã deploy
staging thành công **34 lần** (lần đầu 27/08, PR #33; gần nhất 25/09, 28/09, 02/10 PR #147 và
06/10 PR #152 — bản mang ba site + realm tài khoản). 4 lần thất bại (27/08, 07/09, 14/09, 02/10)
đều được lần sau thay thế. Bước kiểm "Thiếu giá trị bắt buộc" của lần 06/10 đã qua, nghĩa là
GitHub Environment `staging` đã khai `PARTNER_DOMAIN`, `ADMIN_DOMAIN`, `REALM_PROXY_SECRET`.
Đọc lại bằng `gh run list --workflow deploy.yml` và `git log origin/staging`.

**Production CHƯA có.** `origin/main` chỉ nhận một lần merge (PR #31, 27/08/2026) và lần deploy
production duy nhất đó thất bại; từ đó chưa có run production nào.

| # | Gate | Chặn ai | Ai mở |
| --- | --- | --- | --- |
| H1 | ~~Chưa có môi trường staging~~ **Đã có, CD chạy từ 27/08/2026** (xem trên). Còn lại: các gate có chữ "UAT"/"bằng chứng vận hành" phải được chạy và ghi bằng chứng TRÊN staging — CD xanh chỉ chứng minh bản build lên được, không chứng minh luồng nghiệp vụ đúng | R1, R2, R3, R5 | Kỹ thuật + người UAT |
| H2 | **Chưa có môi trường production**: VPS production, GitHub Environment `production`, DNS và redirect URI OAuth của ba site production; lần deploy `main` duy nhất (27/08) thất bại | Phát hành thật | Chủ dự án (mua hạ tầng) → kỹ thuật |
| H3 | **Chưa có diễn tập restore.** `backup-and-restore.md` có quy trình, chưa có lần chạy nào có bằng chứng (bảng thời gian khôi phục ở §6 của tài liệu đó vẫn "chưa đo") | R5 | Kỹ thuật — làm được ngay trên staging |
| H4 | **Chưa có error tracking / uptime / product analytics** ngoài repo | R1, R5 | Kỹ thuật + tài khoản dịch vụ |

Hệ quả cần nói thẳng: staging đã chạy nhưng **chưa gate nào từ R1 đến R5 có bằng chứng UAT ghi
lại**; các bằng chứng test liệt kê trong tài liệu này (ví dụ ở R3) là máy dev hoặc CI.

### 8.2 Gate PHÁP LÝ · BẢO HIỂM · THUẾ — không mở được bằng mã

| # | Gate | Chặn | Ai mở |
| --- | --- | --- | --- |
| L1 | **Ý kiến pháp lý về thu hộ/chi hộ**: XePrime giữ `D + S + IV + IP` của người khác và trả lại qua sổ công nợ. Cần biết mô hình này đòi giấy phép/đối tác gì | R3 (đang giữ tiền thật) và R4 | Luật sư |
| L2 | **Hợp đồng đối tác bảo hiểm + sản phẩm + biểu phí + luồng cấp chứng nhận thật** (dự kiến PVI). Hiện adapter mặc định từ chối phát hành — đúng thiết kế, nhưng nghĩa là `IV`/`IP` thu vào mà chưa ai bảo hiểm gì | Bật thu `IV`/`IP` với khách THẬT | Chủ dự án + PVI |
| L3 | **Tư vấn thuế**: phân loại (VAT/TNCN), ai là người khai, kỳ, hoá đơn. Con số 10% hiện tại là giả thuyết thị trường | Bật khấu trừ thuế với chủ xe THẬT | Đơn vị tư vấn thuế |
| L4 | **Thoả thuận ngân hàng/đơn vị thanh toán** cho chiều chi (rút tiền) | R4 | Chủ dự án |
| L5 | **Điều khoản người dùng cho ba dòng tiền mới** — cọc, bảo hiểm, thuế — trong Terms/quy chế marketplace | R3 | Chủ dự án + luật sư |

### 8.3 Gate VẬN HÀNH — cần người, không cần mã

| # | Gate | Ghi chú |
| --- | --- | --- |
| O1 | **Người trực đối chiếu hằng ngày** nhập số dư ngân hàng cuối ngày và xử lý lệch. Màn Tài chính nền tảng (`admin.xeprime.vn/money`, mã ở `apps/web/src/app/(admin)/admin/money/`) đã có; chưa có người và chưa có SLA | Thiếu người thì phần "khớp sổ hằng ngày" của Gate R3/R4 không có ai chứng minh |
| O2 | **Support case cho bảo hiểm phát hành lỗi** — theo quyết định 14/09, phát hành lỗi KHÔNG chặn chuyến mà mở support case. Cần người nhận case và quy trình xử lý | Nếu không, case chỉ nằm đó |
| O3 | **Maker–checker cho chi tiền** (rút tiền, hoàn tiền tay) | R4 |
| O4 | **Đợt nhắc chủ shop xác nhận lại địa chỉ** theo danh mục hành chính hai cấp (ADR 0035 điều 7) | Mọi chi nhánh đang mang cờ `needs_location_review` |

### 8.4 Gate KỸ THUẬT còn lại

| # | Gate | Ghi chú |
| --- | --- | --- |
| T1 | **E2E cho giao dịch tiền** (browser + native). Hiện chỉ có unit/integration trên DB thật | Gate R3/R5 |
| T2 | **Kiểm push trên máy thật** (thiếu credential Firebase + khoá APNs) | Gate R6 |
| T3 | **Owner Lite UX chưa tách hoàn chỉnh** cho tuyến Basic | Gate R3 |
| T4 | ~~Mobile chưa có luồng tiền~~ **App XePrime đã có tiền giữ chỗ VietQR** (`TripHoldPanel`, duyệt trước thu sau — ADR 0044), mã khuyến mãi, tiền của các chuyến và ví điểm. Còn lại: E2E luồng tiền trên native (nằm trong T1) | Gate R6 |
| T5 | **i18n audit: 1.077 chuỗi thô trong 24 khu vực** (đo 14/09/2026, khu nặng nhất là platform dashboard/ops; các màn của luồng tiền đã i18n hoá xong) | Không chặn gate nào, nhưng chặn bản tiếng Anh dùng được |
| T6 | Dọn lệch tên index + `brand_catalog_type` ở mục 6 | Nhỏ, nhưng để lâu sẽ đẻ migration rác |
| T7 | **Ba site web + ba không gian tài khoản — ADR 0051 · ADR 0053** (cập nhật 06/10/2026). **Web + API + DB: đã merge vào `develop` (PR #150, 05/10/2026) và lên staging (PR #152, deploy thành công 06/10/2026).** Đã có: realm `customer`/`partner`/`platform` ở DB (unique theo realm, trigger bất biến, FK `(user_id, realm)`, kiểm bất biến `realm:check`) · RealmGuard + realm của request (header proxy kèm `REALM_PROXY_SECRET` / `client_app` native) · cookie host-only theo realm · OAuth web theo site · một tài khoản một gian hàng · chặn tự đặt xe cùng SĐT · tra cứu xuyên realm + nhân sự nền tảng là tài khoản mới · web ba khu (`zones/`, `proxy.ts` path/host, `AppShell` partner theo tuyến B1, `AdminShell`, Owner Lite sang site partner, 307 URL cũ) · Caddy ba site + `/api` cùng origin · workflow deploy. **Còn lại:** (a) staging: GitHub Environment đã khai `PARTNER_DOMAIN`/`ADMIN_DOMAIN`/`REALM_PROXY_SECRET` (bước kiểm biến bắt buộc của lần deploy 06/10 đã qua, không còn cảnh báo `SESSION_COOKIE_DOMAIN`); còn phải xác nhận bằng tay DNS `partner-stg`/`admin-stg` và redirect URI OAuth của từng site, rồi smoke test đăng nhập ba site. Production: làm lại toàn bộ khi có H2; (b) mobile theo ADR 0053 — backend ĐÃ sẵn (app Partner nhận mọi tài khoản đối tác và đăng ký được, push theo realm người nhận); phía app (nhận chủ xe tuyến hoa hồng ở app Partner, gỡ Owner Lite khỏi app XePrime) làm ở nhánh mobile riêng; (c) pha 4 "tenant đang làm việc" của ADR 0051 vẫn chưa mở (một tài khoản một gian hàng — ADR 0053) | Migration `20261002120000_account_realms` tự tách dữ liệu trộn vai cũ (dev, staging) sang tài khoản song sinh — không dừng deploy, không xoá dòng nào; đã chạy trên staging ở lần deploy 06/10. DB dev đã chạy bản migration cũ phải dựng lại (`migrate reset` rồi seed). Production chờ H2 |

### 8.5 Điều KHÔNG được kết luận từ tài liệu này

Luồng tiền **chưa hoàn thành**. Mã đã đủ, có test và đã được deploy lên staging; đó là điều kiện
cần, không phải điều kiện đủ. Ba câu không được nói ra trước khi các gate trên có bằng chứng:

- ❌ "Luồng tiền thật đã xong" — chưa có lượt UAT tiền có bằng chứng trên staging, chưa có L1.
- ❌ "Đã có bảo hiểm" — chưa có L2; adapter mặc định cố ý không phát hành.
- ❌ "Thuế đã đúng" — chưa có L3; 10% là số tham khảo thị trường.
