# XePrime — Completion Roadmap

> Cập nhật: 07/09/2026
> Trạng thái: **Canonical — tiến độ và thứ tự thực hiện**
> Tầm nhìn: [`design/02_PRODUCT_VISION.md`](design/02_PRODUCT_VISION.md)
> Khoảng trống chi tiết: [`design/03_PRODUCT_GAP_ANALYSIS.md`](design/03_PRODUCT_GAP_ANALYSIS.md)
> Bảng theo dõi tương tác và prompt Claude Code: [`roadmap.html`](roadmap.html) — UI hỗ trợ, Markdown này vẫn là nguồn canonical.

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
| Slot subscription W1–W3 | Đã có trong code                             | Gói/slot, subscription UI/invoice, feature guard                                                                                                                         |
| SePay subscription W4   | Đã có trên feature branch; chưa vượt Gate R2 | Có VietQR, webhook, bank matching, xử lý thiếu/thừa/trùng và admin match tay; còn cần merge, cấu hình môi trường thật và UAT gate                                        |
| Marketplace money       | Chưa có                                      | Hold/payment/refund/owner balance/withdrawal/reconciliation chưa thành module thật                                                                                       |
| Basic-owner experience  | Chưa tách hoàn chỉnh                         | Capability có nền móng; cần Owner Lite UX và luồng tiền                                                                                                                  |
| Mobile customer         | Một phần                                     | Auth + discovery + gửi yêu cầu thuê + chuyến của tôi + đánh giá; thiếu payment, chat và push                                                                             |
| Mobile manage           | Một phần                                     | Hộp thư yêu cầu, đơn thuê, biên bản giao/nhận, quyết toán, thu tiền — xem ghi chú ở R6                                                                                   |
| Production readiness    | Chưa đạt                                     | Chưa có đủ E2E, monitoring, legal/compliance gate và bằng chứng vận hành thật                                                                                            |

Không dùng phần trăm hoàn thành tổng dự án: một màn hình đơn giản và một luồng giữ tiền không có cùng trọng số. Mỗi release chỉ được coi là xong khi vượt gate tương ứng.

## 2. Định hướng hiện hành đến ngày 07/09/2026

1. XePrime là một marketplace đăng/thuê xe và bán phần mềm quản lý cho thuê xe.
2. Một chủ xe có hai lựa chọn:
   - **Basic owner:** không trả thuê bao; booking on-platform áp dụng phí dịch vụ XePrime ở **phía khách thuê**; dùng Owner Lite.
   - **Gian hàng thuê bao:** trả theo số xe/kỳ hạn; 0% phí dịch vụ XePrime cộng vào giá khách trong thời gian gói hiệu lực; dùng đầy đủ Manage.
3. Giá pilot của gói gian hàng: **100.000đ/ô tô/tháng** và **40.000đ/xe máy/tháng**, tối thiểu 3 tháng. Đây là policy pilot; admin phải cấu hình được theo loại xe và ngày hiệu lực.
4. Định hướng bảo hiểm là hợp tác với **PVI**: bảo vệ xe là bắt buộc và do chủ xe chịu/được khấu trừ vào khoản phải trả; bảo hiểm chuyến đi được chọn sẵn nhưng là tùy chọn, chỉ tính cho người thuê khi họ giữ lựa chọn. Chỉ bật sau khi có thỏa thuận, sản phẩm và biểu phí thật.
5. Basic owner bắt buộc có khoản giữ chỗ với booking đủ điều kiện.
6. Tiền còn lại có thể trả trực tiếp chủ xe; phương án nền tảng thu hộ toàn bộ chỉ mở khi đã đủ legal/payment/operations gate.
7. Số tiền chờ trả chủ xe là sổ công nợ nội bộ, không phải ví điện tử đa dụng.
8. Gian hàng có thể nhận liên hệ/giao dịch trực tiếp; UI phải nói rõ giới hạn bảo vệ của XePrime ngoài nền tảng.
9. Gói có thể tăng ưu tiên hiển thị trong nhóm kết quả phù hợp, không mua quyền đứng trên một kết quả kém chất lượng.

Với tuyến Basic, tổng giá khách thấy gồm giá thuê do chủ xe đặt và các dòng phụ phí chuyến hợp lệ. Pilot khởi đầu chỉ bật **phí dịch vụ XePrime 10%** theo policy; khoản này không bị khấu trừ khỏi tiền thuê của chủ xe. Thuế và bảo hiểm chỉ được bật bằng số thực sau khi vượt gate tương ứng. `commissionPercent` trong code cũ phải được hiểu là tỷ lệ phí dịch vụ cộng vào giá khách, không phải tỷ lệ trừ vào owner earning.

Chi tiết và quan hệ ghi đè ADR cũ: [ADR 0028](decisions/0028-marketplace-subscription-fees-and-custodied-funds.md) và [ADR 0029](decisions/0029-per-vehicle-flat-pricing-and-customer-side-fees.md). Trong phạm vi người trả phí dịch vụ và giá gói phẳng theo chỗ xe, ADR 0029 mới hơn được ưu tiên.

## 3. Lộ trình hiện hành

### R0 — Đồng bộ định hướng và tài liệu

Trạng thái: **Đã thực hiện đợt đầu ngày 03/09/2026; roadmap/prompt được đồng bộ tiếp với ADR 0029 ngày 07/09/2026**.

- Dọn tài liệu lịch sử không còn là nguồn sống.
- Viết lại Product Vision, Gap Analysis, Information Architecture và roadmap.
- Ghi ADR 0028 và ADR 0029 để thay đổi business model, giá gói và phía trả phí có dấu vết.
- Đánh dấu ADR cũ bị ghi đè toàn phần hoặc một phần.

Các lựa chọn sản phẩm hiện hành được ghi tại mục 5; giá production, cấu trúc thuế và điều khoản bảo hiểm vẫn phải vượt các gate tương ứng. Khi Product Vision, Gap Analysis, CLAUDE.md hoặc tài liệu kế hoạch cũ chưa kịp đồng bộ, ADR Accepted mới nhất thắng trong đúng phạm vi ghi đè.

### R1 — Stabilize nhánh hiện tại và đóng pilot UX

Mục tiêu: có một bản web đáng tin để demo/pilot mà chưa nhận tiền khách thật.

Trạng thái: **Đang đóng gate**. Code hiện tại đã bổ sung dashboard dùng dữ liệu thật, invitation token, legal pages/consent và email delivery; chưa được tuyên bố hoàn thành R1 cho tới khi production integration, security review và UAT có bằng chứng.

- Review và chạy lại test/typecheck/build toàn workspace sau thay đổi slot billing/i18n.
- Hoàn thiện dashboard shop: doanh thu, tiền giữ/cọc và việc cần làm bằng dữ liệu thật.
- Ẩn dead links và menu placeholder chưa có luồng.
- Đổi “mời thành viên” thành đúng hành vi hoặc làm invitation thật.
- Hoàn thiện Terms, Privacy, quy chế marketplace, chính sách hủy và kênh support.
- Cắm production OTP/email/R2/chat; thêm error tracking, uptime monitoring và product events.
- Rà CSRF, PII reveal, rate limit và audit của hành động nhạy cảm.
- UAT happy path theo role × desktop/mobile web.

**Gate R1:** 3–5 shop có thể chạy booking request → giao → trả → quyết toán mà không cần sửa dữ liệu trực tiếp.

### R2 — Thu tiền gói thuê bao

Mục tiêu: nguồn doanh thu đơn giản nhất hoạt động trước.

Trạng thái: **Đã có lát cắt W4 trên nhánh `feature/web-subscription-payments`, chưa vượt Gate R2**. Việc tiếp theo là review/merge, cấu hình SePay-ngân hàng thật, kiểm chứng migration và chạy UAT; không xây lại webhook hoặc bank matching nếu audit xác nhận chúng đã đúng.

- Review và hoàn thiện lát cắt SePay/VietQR cho subscription invoice đã có trên feature branch.
- Đối soát idempotent: đúng/thiếu/thừa/sai mã/trùng webhook.
- Tự kích hoạt/gia hạn chỉ khi tiền đã về.
- Admin xem invoice và giao dịch chưa khớp; có đường xử lý thủ công kèm audit.
- Grace/read-only/downgrade rõ ràng; không khóa mất dữ liệu cũ.
- Trang so sánh Basic Owner và Gian hàng.
- Áp dụng giá phẳng theo từng chỗ xe: 100.000đ/ô tô/tháng và 40.000đ/xe máy/tháng, bán các kỳ hạn 3/6/12 tháng; `basePriceMonthly = 0`, không chỗ gồm sẵn và không overage chéo loại xe; đo conversion, utilization và chi phí phục vụ trước khi chốt giá production.

**Gate R2:** một shop tự mua/gia hạn gói và hệ thống đối soát đúng mà admin không sửa database.

### R3 — Marketplace transaction cho Basic Owner

Mục tiêu: cộng phí dịch vụ theo chuyến vào giá khách một cách minh bạch, hoàn tất Owner Lite và vẫn giới hạn lượng tiền XePrime giữ.

- Owner Lite navigation và dashboard.
- Xác minh người bán, loại chủ thể, thông tin thuế và tài khoản nhận tiền.
- Versioned fee policy và booking snapshot, phân biệt phí dịch vụ XePrime, thuế thật, bảo vệ xe và bảo hiểm chuyến đi.
- Quote breakdown minh bạch cho khách và net earning preview cho chủ xe; phí dịch vụ XePrime 10% của tuyến Basic nằm phía khách, không trừ khỏi tiền thuê chủ xe; tuyến gói là 0%.
- Khoản giữ chỗ bắt buộc, expiry, cancellation và refund.
- Tích hợp bảo vệ xe bắt buộc cho chủ xe và bảo hiểm chuyến đi tùy chọn cho người thuê với PVI nếu hoàn tất hợp đồng/sản phẩm; lựa chọn của khách phải được lưu vào booking snapshot.
- Phân bổ riêng phí dịch vụ, thuế, bảo hiểm thật và khoản phải trả chủ xe; mỗi dòng có người hưởng/chịu, trạng thái và quy tắc hoàn rõ ràng.
- Support case/dispute gắn booking.
- Admin money operations và daily reconciliation tối thiểu.

Ở release đầu, ưu tiên **khách trả phần còn lại trực tiếp cho chủ xe**. XePrime chỉ thu khoản giữ chỗ và các dòng được policy phân bổ vào khoản đó; ADR 0029 không đồng nghĩa XePrime phải thu toàn bộ tiền thuê. Cách này giảm tiền phải giữ hộ nhưng vẫn cho XePrime kiểm chứng marketplace và phí dịch vụ phía khách.

**Gate R3:** tiền vào–hoàn–giữ của mọi case UAT khớp sổ; không có bút toán mồ côi hoặc cộng đôi.

### R4 — Thu hộ đầy đủ và Số dư chủ xe

Mục tiêu: cho khách trả phần còn lại trên nền tảng và chủ xe rút tiền.

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

- Booking, hold/payment, trips, chat và push.
- Deep links/App Links, environment profiles, iOS build và CI release.
- Crash/error reporting và analytics đồng nhất web/mobile.
- Duy trì và sửa lỗi cho lát cắt Mobile Manage hiện có: inbox yêu cầu, booking, giao/nhận, quyết toán và thu tiền.
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
| 3   | Mức gói và kỳ hạn?                                               | Giá phẳng 100.000đ/chỗ ô tô/tháng, 40.000đ/chỗ xe máy/tháng, tối thiểu 3 tháng; không phí nền/chỗ gồm sẵn/overage chéo; admin cấu hình động và đo trước khi chốt giá production                                      |
| 4   | Bảo hiểm nào, ai cung cấp, ai trả?                               | Dự kiến PVI; bảo vệ xe bắt buộc do chủ xe chịu/khấu trừ, bảo hiểm chuyến đi mặc định được chọn và chỉ do người thuê trả khi giữ lựa chọn; chỉ thu khi hợp đồng, policy, biểu phí và luồng cấp chứng nhận đã sẵn sàng |
| 5   | Thuế cho thuê xe được phân loại và nộp thay thế nào?             | Thuê tư vấn thuế; không hard-code con số tham khảo; admin cấu hình policy động theo loại chủ thể/giao dịch và ngày hiệu lực                                                                                          |
| 6   | Giao dịch ngoài nền tảng được hưởng hỗ trợ tới đâu?              | Chỉ hỗ trợ thông tin/listing; không cam kết tiền/hoàn cho phần giao dịch không ghi nhận                                                                                                                              |

## 6. Nợ chất lượng cần theo dõi

- Kết quả test ghi trong tài liệu trước đây đã cũ so với code hiện tại; cần tạo baseline mới theo branch/commit và môi trường chạy.
- Con số i18n audit khoảng 1.797 chuỗi là snapshot ngày 03/09; phải chạy lại trước khi dùng để lập kế hoạch.
- Chưa có browser/mobile E2E đủ cho giao dịch tiền.
- Chưa có bằng chứng trong repo về một lần triển khai production hoàn chỉnh và restore drill thành công.
- Chưa có external monitoring/error tracking/product analytics đủ cho pilot.
- Cloudflare R2 object storage chưa có chính sách backup/versioning hoàn chỉnh.
- Product Vision, Gap Analysis, CLAUDE.md, mobile README và kế hoạch mobile ngày 27/08 còn các câu mô tả trước ADR 0029 hoặc trước khi mobile booking được merge; ADR Accepted mới nhất và roadmap này được ưu tiên cho tới khi các tài liệu đó được đồng bộ.
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
