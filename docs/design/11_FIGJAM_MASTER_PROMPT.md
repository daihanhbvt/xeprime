# 11 — Prompt tổng cho FigJam: sitemap và user flow XePrime

> Cập nhật: 09/09/2026  
> Cách dùng: đính kèm workbook `XePrime_Design_Handoff_2026-09-09.xlsx` và các ảnh tham chiếu nếu công cụ cho phép, sau đó dán nguyên khối prompt bên dưới vào FigJam AI.  
> Mục tiêu: tạo tài liệu kiến trúc trải nghiệm để Product/Design/Engineering cùng review; **không phải** vẽ UI high-fidelity.

```text
Hãy tạo một FigJam board hoàn chỉnh bằng tiếng Việt cho sản phẩm XePrime. Đây là chợ đăng và thuê ô tô/xe máy, đồng thời có hệ thống quản lý hoạt động cho thuê. Board phải giúp product, UX/UI designer và engineering hiểu toàn bộ dự án trước khi redesign.

KHÔNG vẽ mockup high-fidelity. Hãy vẽ sitemap, role map, service blueprint và user flow bằng frame, section, card, swimlane, connector và decision diamond. Không tự phát minh màn hình, phí hoặc quy tắc ngoài nội dung bên dưới. Nếu một điểm chưa chốt, gắn nhãn “OPEN DECISION”, không tự chọn thay.

====================
1. QUY ƯỚC TOÀN BOARD
====================

Tạo frame đầu tiên tên “00 — Legend & cách đọc” và dùng quy ước nhất quán:

- Màu actor/lane:
  - Khách chưa đăng nhập: xám.
  - Người thuê/Customer: xanh dương.
  - Chủ xe tuyến hoa hồng/Owner Lite: cam XePrime.
  - Chủ gian hàng tuyến gói: tím.
  - Nhân viên gian hàng: xanh teal.
  - Platform Admin/Staff: đỏ.
  - Hệ thống tự động: vàng.
  - Đối tác ngoài như QR Pay/ngân hàng/bảo hiểm: xanh lá.
- Hình chữ nhật: màn hình/page.
- Hình chữ nhật bo góc: hành động hoặc system job.
- Hình thoi: quyết định/nhánh.
- Pill: trạng thái nghiệp vụ.
- Connector liền: luồng hiện có hoặc đã quyết định.
- Connector nét đứt: gap/future/open decision.
- Viền xanh lá + nhãn “EXISTING”: đã có route/feature trong source.
- Viền cam + nhãn “REDESIGN”: đã có nhưng cần thiết kế lại/hợp nhất.
- Viền đỏ + nhãn “GAP”: chưa đủ hoặc lệch nghiệp vụ.
- Viền tím + nhãn “SHARED”: phải dùng lại component/API/domain hiện có, không clone.
- Sticky đỏ nhạt: rủi ro tiền/pháp lý/PII.
- Mỗi node màn hình có ID duy nhất dạng PUB-xx, AUTH-xx, USR-xx, OWN-xx, MNG-xx, ADM-xx, MOB-xx.
- Mỗi flow có ID dạng FL-xx và liên kết tới các node màn hình liên quan.
- Ở góc mỗi frame đặt mini legend: Existing / Redesign / Gap / Open decision.
- Bố cục board từ trái sang phải theo hành trình; các sitemap nằm phía trên, flow nằm phía dưới.

====================
2. BỐI CẢNH VÀ NGUYÊN TẮC SẢN PHẨM
====================

Tạo frame “01 — Product ecosystem”:

XePrime có một marketplace chung, một hồ sơ xe, một lịch và một booking engine. Có bốn bề mặt chính:

1) Public Marketplace.
2) User Portal tại /account, dùng cho người thuê và Owner Lite.
3) Manage tại /manage, chỉ dành cho gian hàng tuyến gói và nhân viên được cấp quyền.
4) Platform Admin tại /manage/admin.

Mobile app hiện có cả customer và một nhánh Manage khá rộng trong source; đây là hiện trạng cần review chiến lược, không được mặc định là yêu cầu mở rộng tiếp.

Nguyên tắc:

- Không clone source giữa Owner Lite và Manage; dùng lại component, API, vehicle, calendar, booking, money primitives theo capability.
- Một người vẫn có thể vừa thuê xe vừa là chủ xe/gian hàng.
- Một tài khoản kinh doanh chỉ thuộc một tuyến: chủ xe hoa hồng hoặc gian hàng, không đồng thời cả hai.
- Tài xế là bản ghi nội bộ để phân công, không có account và không có app.
- Booking lưu snapshot giá, phí, thuế, bảo hiểm, policy và business mode lúc tạo; thay đổi sau không sửa lịch sử.
- Mọi thao tác admin ảnh hưởng tiền, PII, quyền hoặc trạng thái phải có audit.
- UI tiền không optimistic update; phải chờ server xác nhận.
- Web responsive là bề mặt chính cho Owner/Manage/Admin.

====================
3. ROLE VÀ QUYỀN
====================

Tạo frame “02 — Actor, role & access map” với sơ đồ phân cấp và bảng truy cập:

- Khách chưa đăng nhập: xem marketplace, search, listing, shop, legal/support; khi đặt xe phải đăng nhập/xác minh.
- Customer đã đăng nhập: profile, trips, chat, booking, cancel/refund, support, đổi mật khẩu, xóa tài khoản; có thể chọn “Trở thành chủ xe”.
- Chủ xe tuyến hoa hồng/Owner Lite:
  - Không trả phí/gói cố định.
  - Tối đa 3 xe; đăng xe thứ 4 thì đề nghị nâng cấp gian hàng.
  - Dùng /account để quản lý cơ bản.
  - Phí nền tảng 10% theo chuyến được cộng vào phía khách.
  - Nếu bật dịch vụ có tài xế, chủ xe mặc định là tài xế.
- Chủ gian hàng tuyến gói:
  - Trả thuê bao; 0% phí nền tảng theo chuyến.
  - Dùng đầy đủ /manage.
  - Có thể công khai liên hệ để trao đổi trước booking.
- Role gian hàng hiện có: shop_owner, shop_manager, shop_staff, shop_viewer.
- Platform role hiện có: platform_admin, platform_staff, reviewer, support, finance_admin.
- Platform admin có thể mở Manage của bất kỳ gian hàng nào với toàn quyền tương đương shop_owner; luôn hiện banner “Bạn đang quản lý gian hàng: {Tên gian hàng}”; mọi thao tác có audit.
- Driver record: không login, không membership, chỉ được gian hàng tạo/chọn/đổi khi phân công chuyến.

Thể hiện rõ: business mode quyết định tuyến kinh doanh; tenant role/permission quyết định ai trong gian hàng được thao tác; hai khái niệm không thay thế nhau.

====================
4. GLOBAL SITEMAP VÀ SITEMAP THEO SURFACE
====================

Tạo frame “03 — Global sitemap” nối Public → Auth → User Portal → Owner Lite → Manage → Admin → Mobile. Sau đó tạo các frame chi tiết sau.

Frame “04 — Public & Customer sitemap”:

- PUB-01 Trang chủ /.
- PUB-02 Tìm kiếm/lọc /search.
- PUB-03 Chi tiết xe /listings/[id].
- PUB-04 Trang gian hàng /shops/[slug].
- PUB-05 Support /support.
- PUB-06 Legal index /legal và legal detail /legal/[doc].
- PUB-07 Landing đăng xe /list-your-vehicle.
- PUB-08 Wizard đăng xe /list-your-vehicle/register.
- AUTH-01 Login /login.
- AUTH-02 Register /register.
- AUTH-03 Forgot password /forgot-password.
- AUTH-04 Reset password /reset-password.
- USR-01 Chuyến của tôi /trips.
- USR-02 Chi tiết chuyến /trips/[id].
- USR-03 Chat /chat.
- USR-04 Invite member /invites/[token].

Trong flow đặt xe, bổ sung node GAP cho checkout/QR Pay nếu chưa có page route riêng; không tự ép nó thành route mới nếu có thể là step/modal trong listing/request.

Frame “05 — User Portal & Owner Lite sitemap”:

Menu customer không kinh doanh:

- USR-10 Tài khoản của tôi /account.
- USR-11 Trở thành chủ xe, đi tới màn chọn tuyến; không nhảy thẳng vào đăng ký gian hàng.
- USR-12 Chuyến của tôi /trips nhưng giữ account left navigation.
- USR-13 Đổi mật khẩu /account/change-password.
- USR-14 Yêu cầu xóa tài khoản /account/delete-account.
- USR-15 Đăng xuất.

Menu Owner Lite/chủ xe và chủ gian hàng trong vùng user:

- OWN-01 Danh sách xe /account/vehicles.
- OWN-02 Chi tiết xe /account/vehicles/[id].
- OWN-03 Lịch xe /account/calendar, SHARED với chức năng /manage/calendar.
- OWN-04 Cẩm nang cho thuê /account/host-guide.
- OWN-05 Chuyến của tôi /trips, giữ account left navigation.
- OWN-06 Thông tin khai thuế /account/tax.
- OWN-07 Hợp đồng & chứng từ /account/contracts-documents.
- OWN-08 Chính sách bảo vệ dữ liệu /account/data-protection.
- OWN-09 Tài khoản /account.
- OWN-10 Đổi mật khẩu /account/change-password.
- OWN-11 Xóa tài khoản /account/delete-account.
- OWN-12 Support /account/support.
- OWN-13 Đăng xuất.
- OWN-14 Link “Vào quản lý gian hàng” chỉ hiện cho chủ/nhân viên gian hàng có quyền.

Quản lý từng xe trong Owner Lite:

- OWN-V01 Thông tin xe /account/vehicles/[id]/manage/information.
- OWN-V02 Hình ảnh /images.
- OWN-V03 Giấy tờ /documents.
- OWN-V04 Lịch sử chuyến riêng xe /trip-history.
- OWN-V05 Giá tự lái /self-drive/pricing.
- OWN-V06 Tối ưu nhận chuyến /self-drive/optimization.
- OWN-V07 Giao xe tận nơi /self-drive/delivery.
- OWN-V08 Thời gian giao nhận + thời gian chết /self-drive/handover-time.
- OWN-V09 Thủ tục tự lái /self-drive/terms.
- OWN-V10 Giá có tài xế /with-driver/pricing.
- OWN-V11 Tối ưu chuyến có tài xế /with-driver/optimization.
- OWN-V12 Phụ phí tài xế /with-driver/surcharges.
- OWN-V13 Thủ tục có tài xế /with-driver/terms.

Ẩn hoặc đánh dấu Placeholder cho /account/addresses, /favorites, /documents, /notifications, /payments, /settings nếu chưa có flow production thật.

Frame “06 — Manage sitemap — shop only”:

Nhóm Tổng quan:
- MNG-01 Dashboard /manage.
- MNG-02 Onboarding /manage/onboarding.

Nhóm Vận hành:
- MNG-10 Đội xe /manage/vehicles.
- MNG-11 Thêm xe /manage/vehicles/new.
- MNG-12 Vehicle 360 /manage/vehicles/[id].
- MNG-13 Sửa xe /manage/vehicles/[id]/edit.
- MNG-14 Pricing /manage/vehicles/[id]/pricing.
- MNG-15 Bảo trì /manage/maintenance.
- MNG-16 Lịch /manage/calendar.
- MNG-17 Yêu cầu đặt xe /manage/booking-requests.
- MNG-18 Booking /manage/bookings.
- MNG-19 Chi tiết booking /manage/bookings/[id].
- MNG-20 Khách hàng /manage/customers.
- MNG-21 Chi tiết khách /manage/customers/[id].

Nhóm Kinh doanh:
- MNG-30 Chat /manage/chat.
- MNG-31 Tổng quan tài chính /manage/finance.
- MNG-32 Thu chi /manage/receipts.
- MNG-33 Công nợ /manage/debts.
- MNG-34 Hợp đồng /manage/contracts/[id].

Nhóm Gian hàng & cấu hình:
- MNG-40 Hồ sơ gian hàng /manage/shop.
- MNG-41 Chi nhánh /manage/shop/branches.
- MNG-42 Chính sách thuê /manage/shop/policies.
- MNG-43 Seller profile /manage/shop/seller-profile.
- MNG-44 Gói thuê bao /manage/subscription.
- MNG-45 Tài xế /manage/drivers.
- MNG-46 Thành viên /manage/members.

Nhóm Hỗ trợ:
- MNG-50 Help /manage/support.
- MNG-51 Cases /manage/support/cases.

Nhấn mạnh các công cụ nâng cao chỉ Manage có: chi nhánh, nhân viên/permission, driver assignment, bảo trì, biên bản/ảnh giao nhận tùy chọn, finance/receipts/debts/reporting, hợp đồng vận hành, cấu hình gian hàng.

Frame “07 — Platform Admin sitemap: hiện tại và IA mục tiêu”:

Vẽ hai cột “Current routes” và “Target grouped IA”, nối node để thấy việc sắp xếp lại chứ không tạo lại tính năng.

Current routes:
- /manage/admin dashboard/approvals.
- /manage/admin/tenants.
- /vehicles, /bookings, /customers, /staff, /plans.
- /bank-transactions, /marketplace-banners, /catalog, /locations, /audit.
- /sellers, /fee-policies, /money, /support.

Target grouped IA:
- Tổng quan: funnel, GMV, doanh thu, nợ phải trả, SLA.
- Người bán & nội dung: approvals, chủ xe/gian hàng, xe/listing, KYC/tax/bank.
- Giao dịch: booking, QR payment/hold, refund, dispute.
- Tài chính: plan/invoice, bank transaction, số dư, withdrawal, reconciliation.
- Marketplace: banner, catalog, location, ranking/sponsored policy.
- Vận hành: support, platform staff, audit, fee/policy configuration.
- Context switch: Admin → chọn gian hàng → Manage với banner và audit.

Frame “08 — Mobile sitemap & parity review”:

Customer hiện có:
- Tabs Explore, Trips, Chat, Account.
- Search, listing detail/request, shop detail, trip detail, chat detail.
- Login/register/forgot/reset/set-password/OAuth callback.

Manage hiện có trong source:
- Tabs/dashboard, requests, bookings, vehicles, customers, finance, receipts, debts, maintenance, members, drivers, branches, shop, policies, more.
- Booking detail/new/payments/settlement/handover/handover photos.
- Vehicle new/detail/pricing/edit info/media/source/documents/maintenance.
- Contract detail và onboarding.

Gắn nhãn OPEN DECISION lớn: “Giữ Manage native và đồng bộ web, hay thu gọn app về customer-first?”. Không thiết kế mở rộng mobile Manage cho tới khi quyết định được chốt.

====================
5. USER FLOW CHÍNH
====================

Tạo frame “09 — FL-01 Trở thành chủ xe”:

Customer bấm “Trở thành chủ xe” → màn so sánh hai lựa chọn:

A. Tuyến hoa hồng:
- 0đ phí cố định.
- Tối đa 3 xe.
- Phí nền tảng 10% mỗi chuyến được cộng vào tổng phía khách.
- Owner Lite trong /account.
- Đăng xe đầu tiên → duyệt hồ sơ/xe → listing active.

B. Gian hàng tuyến gói:
- Trả thuê bao.
- 0% phí nền tảng theo chuyến.
- Có Manage nâng cao.
- Onboarding gian hàng → chọn gói/QR Pay gói → activation → vào Manage → đăng xe.

Decision: user đã là một tuyến thì không thể đồng thời chọn tuyến còn lại. Chủ xe có thể nâng cấp sang gian hàng; không có luồng hạ cấp đã chốt.

Tạo frame “10 — FL-02 Đăng xe & duyệt listing”:

Entry từ /list-your-vehicle hoặc Danh sách xe → chọn loại phương tiện ô tô/xe máy → nhập biển số → chọn hãng/model từ catalog Việt Nam → nhập thông tin phù hợp loại xe → mô tả/tiện nghi → cấu hình cho thuê → upload tối thiểu 4 ảnh → submit review → reviewer duyệt/yêu cầu bổ sung/từ chối → listing active.

Phân nhánh theo loại xe:
- Ô tô: số chỗ, transmission (số sàn/tự động/CVT/DCT nếu catalog hỗ trợ), nhiên liệu xăng/dầu/hybrid/điện, mức tiêu thụ L/100km hoặc phạm vi km/lần sạc.
- Xe máy: loại xe số/tay ga/côn tay/điện, dung tích động cơ hoặc công suất pin, fuel/electric, mức tiêu thụ hoặc phạm vi; không hiện số chỗ kiểu ô tô và không hiện dịch vụ có tài xế.
- Điện: không hỏi L/100km; hỏi phạm vi khi đầy pin và thông tin sạc phù hợp.
- Hãng/model là select phụ thuộc loại xe và hãng, có trạng thái model khác/đề nghị bổ sung catalog; không bắt nhập tự do làm luồng chính.
- Identity đã duyệt như biển số/VIN/đăng ký xe bị khóa theo policy; thay đổi đi qua support/admin, không âm thầm sửa.

Tạo frame “11 — FL-03 Khám phá & chọn xe”:

Home/Search → chọn địa điểm/thời gian → loại ô tô/xe máy → tự lái/có tài xế → ngắn hạn/dài hạn → nhận tại chủ xe/giao tận nơi → filter/sort/map → listing detail → kiểm tra lịch/giá/chính sách/review/owner-or-shop → quote → login/phone verification nếu cần → booking request.

Thể hiện service variants:
- Tự lái: ô tô hoặc xe máy.
- Có tài xế: chỉ ô tô; owner commission mặc định tự lái, shop gán driver record.
- Thuê dài hạn: đặt trực tiếp, không phải request báo giá.
- Pickup tại địa chỉ chủ xe/chi nhánh hoặc giao tận nơi; khoảng cách giao chỉ là ước lượng cho đến khi xác nhận.

Tạo frame “12 — FL-04 Booking approval, QR Pay & contact unlock” theo swimlane Customer / Owner-or-Shop / XePrime / QR Pay:

Customer gửi request → kiểm tra concurrency/lịch → chủ xe duyệt HOẶC auto-accept nếu bật tối ưu nhận chuyến → ghi acceptedAt và coi là “đặt xe thành công” → bắt đầu đồng thời timer thanh toán 2 giờ và timer hủy miễn phí 4 giờ → tạo trạng thái chờ QR Pay → giữ lịch → countdown 60 phút lần 1 → nếu chưa trả, tự gia hạn countdown 60 phút lần 2 → nếu vẫn chưa trả, auto-cancel + mở lịch + báo hai bên.

Nếu QR Pay thành công:
- Auto-match payment idempotently.
- Booking chuyển sang paid/confirmed; thời điểm này không khởi động lại timer hủy miễn phí 4 giờ.
- Mở contact ở tuyến hoa hồng theo working rule sau QR Pay; gắn OPEN DECISION vì cần product confirm cuối.
- Gian hàng có thể đã public contact, nhưng booking vẫn phải qua QR Pay.
- Schedule notifications và chuẩn bị chuyến.

Nếu underpaid/overpaid/unmatched/webhook trùng:
- Không xác nhận sai.
- Đưa vào queue đối soát/admin.
- Không cộng ledger hai lần.

Tạo frame “13 — FL-05 Checkout & money breakdown”:

Ký hiệu:
- B = giá thuê gốc do chủ xe đặt.
- D = cọc đặt chuyến, là một phần của B.
- S = phí nền tảng phía khách; tuyến hoa hồng 10% × B, gian hàng 0.
- IV = khoản bảo hiểm xe/chuyến bắt buộc phía khách.
- IP = bảo hiểm tai nạn con người tùy chọn phía khách.
- T = thuế phía chủ xe/gian hàng; working example 7% × B.

Hiển thị ba tổng riêng:
- Tổng giá khách phải trả = B + S + IV + IP.
- QR Pay ngay = D + S + IV + IP.
- Trả trực tiếp khi nhận xe = B − D.

Chủ xe/gian hàng nhận ròng = B − T. XePrime phải trả từ cọc = D − T. Cọc D tối thiểu phải đủ bao phủ T.

Ví dụ VF5 một ngày:
- B 700.000đ.
- S 70.000đ.
- IV minh họa 130.000đ.
- IP 0đ.
- Tổng khách thấy 900.000đ.
- Nếu D 20% = 140.000đ: QR Pay ngay 340.000đ; trả trực tiếp khi nhận 560.000đ.
- T 7% = 49.000đ; tổng chủ xe nhận 651.000đ; khoản XePrime phải trả từ cọc 91.000đ.
- Gắn note: 130.000đ và 7% chỉ là working example, không phải biểu phí/rate production.

Tạo frame “14 — FL-06 Insurance lifecycle at handover” theo swimlane Customer / Owner-or-Shop / XePrime / Insurance Partner:

QR Pay thành công → IV/IP ở trạng thái reserved/not_issued, chưa mua bảo hiểm → trước giờ nhận xe có thể hủy và hoàn toàn bộ IV/IP → đến mốc bàn giao hoặc bắt đầu chuyến → XePrime gọi đối tác idempotently → issuing → issued + certificate hoặc failed.

- Owner Lite: không bắt buộc biên bản; nếu chủ xe không điều chỉnh, mốc bắt đầu theo lịch có thể trigger phát hành.
- Shop: handover confirmed hoặc scheduled start trigger theo cấu hình; shop có thể dùng biên bản/ảnh/odo/fuel/battery.
- Khi issued: certificate xem được trong trip detail.
- OPEN DECISION: insurance issuance failed tại thời điểm giao xe → block/retry/change vehicle?
- Sau khi chuyến đã bắt đầu, hủy/void/claim là flow riêng chưa chốt; không áp dụng công thức hủy trước chuyến.

Tạo frame “15 — FL-07 Trip operations: Owner Lite vs Shop” thành hai lane song song:

Owner Lite:
- Booking confirmed → chuẩn bị xe → đến giờ hệ thống có thể auto-start/handover → chủ xe sửa nếu thực tế thay đổi → hết giờ auto-return/end → hoàn thành.
- Không bắt buộc biên bản, ảnh tình trạng, odometer, fuel/battery hoặc xác nhận hai phía.
- Tài sản bảo đảm, tiền thuê còn lại, trả muộn, vượt km, nhiên liệu/pin và hư hỏng do chủ xe tự làm việc với khách; XePrime chỉ hỗ trợ khiếu nại.

Shop:
- Booking confirmed → phân công branch/driver → checklist → optional handover report/photos/odo/fuel/battery → active → optional return inspection → surcharge/receipt/debt/tracking → completed/settled.
- Các khoản ngoài nền tảng có thể được ghi để quản trị nhưng XePrime không mặc định thu hộ.

Tạo frame “16 — FL-08 Cancellation & refund before trip”:

Nhánh A: chưa trả sau 2 giờ → auto-cancel, hoàn lịch, không có tiền.

Nhánh B: customer hủy trong 4 giờ từ acceptedAt (owner duyệt/auto-accept) → nếu đã trả thì refund D + S + IV + IP = 100% online payment → không thuế → không phát hành bảo hiểm.

Nhánh C: customer hủy sau acceptedAt + 4 giờ nhưng trước handover/start → refund 100% IV + IP → pool D + S → 50% cho owner/shop balance + 50% XePrime → không thuế → không phát hành bảo hiểm.

Nhánh D: owner/shop hủy trước chuyến → customer refund D + S + IV + IP → không phạt/bồi thường owner ở giai đoạn hiện tại → track cancellation frequency cho admin về sau.

Nhánh E: pickup − acceptedAt < 4 giờ → trước thanh toán phải cảnh báo rõ việc hủy có thể mất tiền.

Không dùng câu “trừ bảo hiểm đã phát hành” trong hủy trước chuyến, vì bảo hiểm chỉ được mua tại handover/start.

Tạo frame “17 — FL-09 Tax, balance & withdrawal”:

Booking confirmed → chưa tính thuế → handover/start → phát hành bảo hiểm + ghi nhận T → ledger append-only → khoản owner/shop phải nhận chuyển từ pending sang available theo policy → owner/user thêm tài khoản ngân hàng → gửi withdrawal request → finance admin review → chuyển khoản thủ công → mark paid/rejected → audit/reconciliation.

Tên UX: “Số dư XePrime” hoặc “Khoản XePrime phải trả”, không gọi là điểm và không mô tả như ví điện tử. Không cho nạp/chuyển giữa user/dùng để mua dịch vụ. Mọi sửa sai bằng reversal, không xóa bút toán.

Tạo frame “18 — FL-10 Nâng cấp Owner Lite → Shop”:

Owner xem so sánh → chọn nâng cấp → onboarding shop → chọn gói → QR Pay subscription → auto/manual reconciliation → activation → mở Manage → giữ xe và dữ liệu → booking trước thời điểm upgrade giữ commission/tax/fee snapshot cũ → booking mới dùng shop mode, S=0.

Đánh dấu OPEN DECISION: downgrade, grace period, plan limits vehicle/member/branch.

Tạo frame “19 — FL-11 Admin operations & enter Manage”:

Admin dashboard → chọn seller/shop → xem KYC/tax/bank/vehicle/listing/booking/money/support → action theo role → nếu cần thao tác thay shop, bấm “Vào Manage” → context switch → banner tên shop → thao tác như owner → audit actor admin + impersonated tenant context → thoát context về Admin.

Nhánh role:
- reviewer: approval/vehicle/seller.
- support: booking/customer PII theo case/support.
- finance_admin: money/bank/reconciliation/withdrawal.
- platform_admin: toàn quyền.
- PII masked by default; reveal phải có lý do và audit.

====================
6. PERMISSION, STATE VÀ TRACEABILITY
====================

Tạo frame “20 — Permission matrix”:

Hàng: dashboard, vehicle, vehicle documents, maintenance, booking requests, bookings, calendar, handover, customers, drivers, branches, members, finance, receipts, debts, contracts, shop profile/policies, subscription, support, admin seller/approval, admin money, admin staff/audit.

Cột: customer, commission_owner, shop_owner, shop_manager, shop_staff, shop_viewer, platform_admin, platform_staff, reviewer, support, finance_admin.

Dùng ký hiệu View / Create / Update / Approve / Export / No access. Ghi chú server permission là nguồn bảo vệ; ẩn menu chỉ là UX.

Tạo frame “21 — State machines”:

Vẽ riêng nhưng liên kết:
- Booking request: draft/submitted → pending owner → approved/rejected/expired/cancelled.
- Payment hold: pending → underpaid/paid/expired/cancelled/refunded.
- Booking/trip: reserved/waiting payment → confirmed → active → completed; hoặc cancelled/no-show.
- Handover shop: draft → ready → confirmed/cancelled; Owner Lite có thể bỏ qua UI và auto theo lịch.
- Insurance: reserved/not_issued → issuing → issued/failed → claim/voided nếu có.
- Withdrawal: pending → approved → paid hoặc rejected/cancelled.

Không coi tên trên là enum bắt buộc; gắn note “Map với shared status/API hiện có trước khi implement”.

Tạo frame “22 — System/domain traceability”:

Nối các nhóm UX tới backend/domain hiện có:
- Auth/account → auth, users, phone-verification.
- Marketplace → public-listings, pricing, geo, locations, reviews.
- Vehicle/register/manage → vehicles, catalog, vehicle-settings, vehicle-documents, storage.
- Calendar → calendar, holds, holidays, pricing.
- Booking/trips → booking-requests, bookings, customer-trips, handovers.
- Money → payments, sepay, finance, billing, fee-policies.
- Shop operations → tenants, branches, members, drivers, customers, rental-policies, contracts, maintenance.
- Communication/support → chat, notification, support.
- Admin/governance → platform-admin, audit, banners, catalog, fee-policies.

Gắn note: API/domain có nhiều primitive sẵn; redesign phải ưu tiên reuse và chỉ thêm API/schema khi gap đã được chứng minh.

====================
7. EDGE CASE, GAP VÀ OPEN DECISION
====================

Tạo frame “23 — Edge cases & implementation gaps” với ba cột P0/P1/P2.

P0:
- Code/config hiện có thể đang giữ payment 24 giờ, trong khi product chốt tối đa 2 giờ (2 × 60 phút).
- Logic free-cancel hiện có thể dựa trên pickup minus 4 hours, trong khi product chốt acceptedAt + 4 giờ; booking sát giờ cần warning.
- Existing hold/commission semantics có thể chưa tách D, S, IV, IP và T.
- Insurance cần tách money reserved khỏi policy issued; refund trước trip phải luôn hoàn IV/IP.
- Concurrency: xe không được double-book khi nhiều request/hold.
- QR duplicate webhook, underpaid, overpaid, unmatched, refund failed.
- Tax/insurance/fee policy phải versioned và snapshot.
- Account deletion phải xử lý booking, retention, ledger và legal hold; không hard-delete lịch sử tài chính.

P1:
- Contact unlock tuyến hoa hồng cần chốt cuối; working rule là sau QR Pay.
- Insurance issuance failed at handover.
- No-show, early return, extension và cancellation sau trip start.
- Downgrade shop → commission owner.
- Shop plan production price, vehicle/member/branch limits và grace period.
- Admin warning/tracking owner cancellations.
- Ranking/sponsored labels và marketplace fairness.
- Mobile Manage product strategy.

P2:
- Automated bank payout, fraud scoring, promotion/referral, advanced BI.

Tạo thêm checklist trạng thái UI bắt buộc cho mọi màn:
- Loading/skeleton.
- Success with data.
- Empty có CTA hợp lý.
- Validation/business error.
- Network/server error có retry.
- Forbidden/feature unavailable giải thích quyền/capability.
- Disabled/pending async state.
- Partial/stale data nếu phụ thuộc provider.

====================
8. RÀNG BUỘC DESIGN HANDOFF
====================

Tạo frame cuối “24 — Handoff checklist”:

- Ngôn ngữ vi/en; VND; timezone Asia/Ho_Chi_Minh; ngày dd/mm/yyyy.
- Web desktop + responsive từ 360px; WCAG 2.1 AA; touch target tối thiểu 44px.
- Font Be Vietnam Pro; Playfair Display chỉ dùng hero marketing nếu cần.
- Hệ thống hiện dùng Ant Design 6, CSS Modules và design tokens; icon dùng @ant-design/icons.
- Table/list filter phải phản ánh vào URL và xử lý server-side khi dữ liệu lớn.
- Không hiển thị raw enum/status; dùng nhãn thống nhất.
- Public page cần SEO/SSR phù hợp; dashboard giữ thông tin dày nhưng hierarchy rõ.
- PII masked mặc định; money/status/calendar không optimistic.
- Không đặt stub hoặc màn “coming soon” vào navigation chính.
- Mỗi node/flow phải có Owner (Customer/Owner/Shop/Admin/System), Current status và Source/Route để traceability.

KẾT QUẢ CUỐI:

Board phải có đủ 25 frame từ 00 đến 24, auto-layout rõ ràng, connector không chồng chéo, có mục lục ở góc trên trái và các link điều hướng tới từng frame. Mỗi frame có một sticky “Câu hỏi cần review” tối đa 3 câu. Ở cuối board tạo bảng tóm tắt gồm: Existing có thể reuse, Existing cần redesign, Gap phải xây, Open decision và Legal/payment release gate.
```

## Lưu ý khi FigJam AI cắt bớt nội dung

Nếu FigJam AI không tạo đủ 25 frame trong một lượt, không yêu cầu nó “vẽ lại tất cả”. Dùng prompt nối tiếp: “Tiếp tục từ frame XX đến frame YY, giữ nguyên legend, ID, màu, route và connector của board hiện tại; không thay đổi các frame đã có.”
