param(
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

$scriptDirectory = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    Join-Path (Get-Location).Path 'tools\design-handoff'
} else {
    $PSScriptRoot
}
$repoRoot = (Resolve-Path (Join-Path $scriptDirectory '..\..')).Path
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $repoRoot 'docs\design\XePrime_Design_Handoff_2026-09-09.xlsx'
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$readme = @(
    @('Mục', 'Nội dung'),
    @('Tên bộ tài liệu', 'XePrime Design Handoff — toàn bộ Public, User, Owner Lite, Manage, Admin và Mobile'),
    @('Ngày kiểm kê', '09/09/2026'),
    @('Mục tiêu', 'Giúp Product/UX/UI/Engineering cùng hiểu hiện trạng source, IA mục tiêu, luồng nghiệp vụ và gap trước khi redesign.'),
    @('Cách đọc', 'Đọc 01_Roles → 02_Sitemap → 03_Screen_Inventory → 04_User_Flows → 07_Money_Rules. Các sheet sau dùng để kiểm tra chi tiết.'),
    @('EXISTING', 'Đã có route/feature trong source; vẫn có thể cần redesign.'),
    @('SHARED', 'Phải dùng lại component/domain/API hiện có; không clone logic.'),
    @('REDESIGN', 'Đã có một phần nhưng IA/copy/flow cần hợp nhất hoặc sửa.'),
    @('GAP', 'Thiếu hoặc chưa khép kín end-to-end.'),
    @('PLACEHOLDER', 'Route có nhưng không nên nằm trong navigation production khi chưa có flow thật.'),
    @('OPEN', 'Chưa có quyết định sản phẩm/pháp lý cuối.'),
    @('Nguồn canonical', 'docs/design/02_PRODUCT_VISION.md; 03_PRODUCT_GAP_ANALYSIS.md; 07_INFORMATION_ARCHITECTURE.md; 09_PRODUCT_FLOWS_AND_BUSINESS_RULES.md; ADR 0032.'),
    @('Prompt FigJam', 'docs/design/11_FIGJAM_MASTER_PROMPT.md'),
    @('Lưu ý bảo hiểm', 'QR Pay chỉ thu/giữ phí dự kiến. Chỉ mua/phát hành bảo hiểm tại bàn giao/bắt đầu chuyến. Mọi hủy trước mốc đó hoàn 100% phí bảo hiểm.'),
    @('Lưu ý tiền', 'Số dư XePrime là sổ công nợ nội bộ, không phải ví điện tử. Phần tiền thuê còn lại trả trực tiếp chủ xe/gian hàng.'),
    @('Lưu ý thiết kế', 'Không biến route hiện có thành yêu cầu phải giữ. Designer cần ưu tiên mục tiêu người dùng, nhưng phải trace được tới source/API để tận dụng phần đã có.')
)

$roles = @(
    @('Actor/Role', 'Có account?', 'Business mode', 'Surface chính', 'Mục tiêu', 'Ràng buộc/Quyền chính'),
    @('Khách chưa đăng nhập', 'Không', 'None', 'Public web/mobile', 'Khám phá xe, giá, shop, pháp lý', 'Không booking hoàn chỉnh; chuyển login/xác minh khi cần'),
    @('Customer', 'Có', 'Renter', 'Public + /account + /trips', 'Đặt xe, QR Pay, theo dõi/hủy chuyến, chat, support', 'Chỉ dữ liệu và chuyến của mình'),
    @('Commission owner', 'Có', 'commission_owner', '/account Owner Lite', 'Cho thuê và quản lý cơ bản 1–3 xe', '0đ fixed; tối đa 3 xe; không vào Manage; phí nền tảng 10% cộng phía khách'),
    @('Subscription shop owner', 'Có', 'subscription_shop', '/account + /manage', 'Vận hành gian hàng chuyên nghiệp', 'Trả gói; 0% phí nền tảng/chuyến; toàn quyền tenant'),
    @('Shop manager', 'Có', 'subscription_shop', '/manage', 'Điều phối vận hành', 'Quyền rộng theo permission; không sở hữu subscription/ownership'),
    @('Shop staff', 'Có', 'subscription_shop', '/manage', 'Xử lý công việc hằng ngày', 'Không duyệt tiền/rủi ro/PII nhạy cảm nếu thiếu quyền'),
    @('Shop viewer', 'Có', 'subscription_shop', '/manage', 'Theo dõi read-only', 'Không tạo/sửa/duyệt'),
    @('Driver record', 'Không', 'Shop resource', 'Không có app', 'Được gán vào chuyến có tài xế', 'Chỉ là dữ liệu tên/liên hệ/bằng lái/lịch; commission owner là tài xế mặc định'),
    @('platform_admin', 'Có', 'Platform', '/manage/admin + context Manage', 'Toàn quyền nền tảng', 'Có thể vào Manage của shop; banner context; audit mọi mutation'),
    @('platform_staff', 'Có', 'Platform', '/manage/admin', 'Vận hành theo scope', 'Least privilege'),
    @('reviewer', 'Có', 'Platform', '/manage/admin approvals', 'Duyệt seller/xe/listing', 'Không mặc định có quyền money'),
    @('support', 'Có', 'Platform', '/manage/admin support', 'Xử lý booking/customer/case', 'PII masked; reveal theo case và audit'),
    @('finance_admin', 'Có', 'Platform', '/manage/admin money', 'QR transaction, refund, balance, withdrawal, reconciliation', 'Maker-checker khi cần; bút toán append-only')
)

$sitemap = @(
    @('ID', 'Surface', 'Parent', 'Màn/nhóm', 'Route', 'Actor', 'Status'),
    @('PUB-01', 'Public Web', 'Root', 'Trang chủ', '/', 'All', 'EXISTING'),
    @('PUB-02', 'Public Web', 'Marketplace', 'Tìm kiếm/lọc', '/search', 'All', 'EXISTING'),
    @('PUB-03', 'Public Web', 'Marketplace', 'Chi tiết xe', '/listings/[id]', 'All', 'EXISTING'),
    @('PUB-04', 'Public Web', 'Marketplace', 'Trang gian hàng', '/shops/[slug]', 'All', 'EXISTING'),
    @('PUB-05', 'Public Web', 'Help', 'Hỗ trợ', '/support', 'All', 'EXISTING'),
    @('PUB-06', 'Public Web', 'Legal', 'Danh sách/chính sách pháp lý', '/legal; /legal/[doc]', 'All', 'EXISTING'),
    @('PUB-07', 'Public Web', 'Supply', 'Landing đăng xe', '/list-your-vehicle', 'All', 'REDESIGN'),
    @('PUB-08', 'Public Web', 'Supply', 'Wizard đăng xe', '/list-your-vehicle/register', 'Authenticated', 'REDESIGN'),
    @('AUTH-01', 'Public Web', 'Auth', 'Đăng nhập', '/login', 'Guest', 'EXISTING'),
    @('AUTH-02', 'Public Web', 'Auth', 'Đăng ký', '/register', 'Guest', 'EXISTING'),
    @('AUTH-03', 'Public Web', 'Auth', 'Quên mật khẩu', '/forgot-password', 'Guest', 'EXISTING'),
    @('AUTH-04', 'Public Web', 'Auth', 'Đặt lại mật khẩu', '/reset-password', 'Guest', 'EXISTING'),
    @('USR-01', 'Customer Web', 'Trips', 'Chuyến của tôi', '/trips', 'Customer/owner/shop', 'EXISTING'),
    @('USR-02', 'Customer Web', 'Trips', 'Chi tiết chuyến', '/trips/[id]', 'Customer/owner/shop', 'EXISTING'),
    @('USR-03', 'Customer Web', 'Communication', 'Chat', '/chat', 'Authenticated', 'EXISTING'),
    @('USR-04', 'Customer Web', 'Organization', 'Nhận lời mời', '/invites/[token]', 'Invited user', 'EXISTING'),
    @('USR-10', 'User Portal', 'Account', 'Tài khoản của tôi', '/account', 'Authenticated', 'EXISTING'),
    @('USR-11', 'User Portal', 'Account', 'Đổi mật khẩu', '/account/change-password', 'Authenticated', 'EXISTING'),
    @('USR-12', 'User Portal', 'Account', 'Yêu cầu xóa tài khoản', '/account/delete-account', 'Authenticated', 'REDESIGN'),
    @('USR-13', 'User Portal', 'Account', 'Hỗ trợ', '/account/support', 'Authenticated', 'EXISTING'),
    @('USR-14', 'User Portal', 'Become owner', 'Chọn tuyến hoa hồng/gian hàng', 'Chưa có route chốt', 'Customer', 'GAP'),
    @('USR-P1', 'User Portal', 'Placeholder', 'Địa chỉ', '/account/addresses', 'Customer', 'PLACEHOLDER'),
    @('USR-P2', 'User Portal', 'Placeholder', 'Yêu thích', '/account/favorites', 'Customer', 'PLACEHOLDER'),
    @('USR-P3', 'User Portal', 'Placeholder', 'Tài liệu', '/account/documents', 'Customer', 'PLACEHOLDER'),
    @('USR-P4', 'User Portal', 'Placeholder', 'Thông báo', '/account/notifications', 'Customer', 'PLACEHOLDER'),
    @('USR-P5', 'User Portal', 'Placeholder', 'Thanh toán', '/account/payments', 'Customer', 'PLACEHOLDER'),
    @('USR-P6', 'User Portal', 'Placeholder', 'Cài đặt', '/account/settings', 'Customer', 'PLACEHOLDER'),
    @('OWN-01', 'Owner Lite', 'Vehicles', 'Danh sách xe', '/account/vehicles', 'Commission owner/shop', 'EXISTING'),
    @('OWN-02', 'Owner Lite', 'Vehicles', 'Chi tiết xe', '/account/vehicles/[id]', 'Commission owner/shop', 'EXISTING'),
    @('OWN-03', 'Owner Lite', 'Calendar', 'Lịch xe', '/account/calendar', 'Commission owner/shop', 'SHARED'),
    @('OWN-04', 'Owner Lite', 'Guide', 'Cẩm nang cho thuê', '/account/host-guide', 'Commission owner/shop', 'EXISTING'),
    @('OWN-05', 'Owner Lite', 'Tax', 'Thông tin khai thuế', '/account/tax', 'Commission owner/shop', 'EXISTING'),
    @('OWN-06', 'Owner Lite', 'Documents', 'Hợp đồng & chứng từ', '/account/contracts-documents', 'Commission owner/shop', 'EXISTING'),
    @('OWN-07', 'Owner Lite', 'Privacy', 'Bảo vệ dữ liệu', '/account/data-protection', 'Commission owner/shop', 'EXISTING'),
    @('OWN-V01', 'Owner Vehicle', 'General', 'Thông tin xe', '/account/vehicles/[id]/manage/information', 'Owner', 'EXISTING'),
    @('OWN-V02', 'Owner Vehicle', 'General', 'Hình ảnh', '/account/vehicles/[id]/manage/images', 'Owner', 'EXISTING'),
    @('OWN-V03', 'Owner Vehicle', 'General', 'Giấy tờ xe', '/account/vehicles/[id]/manage/documents', 'Owner', 'EXISTING'),
    @('OWN-V04', 'Owner Vehicle', 'General', 'Lịch sử chuyến', '/account/vehicles/[id]/manage/trip-history', 'Owner', 'EXISTING'),
    @('OWN-V05', 'Owner Vehicle', 'Self-drive', 'Giá', '/account/vehicles/[id]/manage/self-drive/pricing', 'Owner', 'EXISTING'),
    @('OWN-V06', 'Owner Vehicle', 'Self-drive', 'Tối ưu nhận chuyến', '/account/vehicles/[id]/manage/self-drive/optimization', 'Owner', 'EXISTING'),
    @('OWN-V07', 'Owner Vehicle', 'Self-drive', 'Giao xe tận nơi', '/account/vehicles/[id]/manage/self-drive/delivery', 'Owner', 'EXISTING'),
    @('OWN-V08', 'Owner Vehicle', 'Self-drive', 'Thời gian giao nhận/dead time', '/account/vehicles/[id]/manage/self-drive/handover-time', 'Owner', 'EXISTING'),
    @('OWN-V09', 'Owner Vehicle', 'Self-drive', 'Thủ tục cho thuê', '/account/vehicles/[id]/manage/self-drive/terms', 'Owner', 'EXISTING'),
    @('OWN-V10', 'Owner Vehicle', 'With-driver', 'Giá có tài xế', '/account/vehicles/[id]/manage/with-driver/pricing', 'Car owner', 'EXISTING'),
    @('OWN-V11', 'Owner Vehicle', 'With-driver', 'Tối ưu chuyến có tài xế', '/account/vehicles/[id]/manage/with-driver/optimization', 'Car owner', 'EXISTING'),
    @('OWN-V12', 'Owner Vehicle', 'With-driver', 'Phụ phí tài xế', '/account/vehicles/[id]/manage/with-driver/surcharges', 'Car owner', 'EXISTING'),
    @('OWN-V13', 'Owner Vehicle', 'With-driver', 'Thủ tục có tài xế', '/account/vehicles/[id]/manage/with-driver/terms', 'Car owner', 'EXISTING'),
    @('MNG-01', 'Manage', 'Overview', 'Dashboard', '/manage', 'Shop roles', 'EXISTING'),
    @('MNG-02', 'Manage', 'Overview', 'Onboarding', '/manage/onboarding', 'Shop owner', 'EXISTING'),
    @('MNG-10', 'Manage', 'Operations', 'Đội xe', '/manage/vehicles', 'Shop roles', 'EXISTING'),
    @('MNG-11', 'Manage', 'Operations', 'Thêm xe', '/manage/vehicles/new', 'Authorized shop role', 'EXISTING'),
    @('MNG-12', 'Manage', 'Operations', 'Vehicle 360', '/manage/vehicles/[id]', 'Shop roles', 'EXISTING'),
    @('MNG-13', 'Manage', 'Operations', 'Sửa xe', '/manage/vehicles/[id]/edit', 'Authorized shop role', 'EXISTING'),
    @('MNG-14', 'Manage', 'Operations', 'Pricing xe', '/manage/vehicles/[id]/pricing', 'Authorized shop role', 'EXISTING'),
    @('MNG-15', 'Manage', 'Operations', 'Bảo trì', '/manage/maintenance', 'Shop roles', 'EXISTING'),
    @('MNG-16', 'Manage', 'Operations', 'Lịch', '/manage/calendar', 'Shop roles', 'EXISTING'),
    @('MNG-17', 'Manage', 'Operations', 'Yêu cầu đặt xe', '/manage/booking-requests', 'Shop roles', 'EXISTING'),
    @('MNG-18', 'Manage', 'Operations', 'Booking', '/manage/bookings; /manage/bookings/[id]', 'Shop roles', 'EXISTING'),
    @('MNG-19', 'Manage', 'Operations', 'Khách hàng', '/manage/customers; /manage/customers/[id]', 'Shop roles', 'EXISTING'),
    @('MNG-30', 'Manage', 'Business', 'Chat', '/manage/chat', 'Shop roles', 'EXISTING'),
    @('MNG-31', 'Manage', 'Business', 'Tài chính', '/manage/finance', 'Finance-capable roles', 'EXISTING'),
    @('MNG-32', 'Manage', 'Business', 'Thu chi', '/manage/receipts', 'Finance-capable roles', 'EXISTING'),
    @('MNG-33', 'Manage', 'Business', 'Công nợ', '/manage/debts', 'Finance-capable roles', 'EXISTING'),
    @('MNG-34', 'Manage', 'Business', 'Hợp đồng', '/manage/contracts/[id]', 'Shop roles', 'EXISTING'),
    @('MNG-40', 'Manage', 'Storefront', 'Hồ sơ gian hàng', '/manage/shop', 'Shop roles', 'EXISTING'),
    @('MNG-41', 'Manage', 'Organization', 'Chi nhánh', '/manage/shop/branches', 'Authorized roles', 'EXISTING'),
    @('MNG-42', 'Manage', 'Settings', 'Chính sách thuê', '/manage/shop/policies', 'Authorized roles', 'EXISTING'),
    @('MNG-43', 'Manage', 'Storefront', 'Seller profile', '/manage/shop/seller-profile', 'Authorized roles', 'EXISTING'),
    @('MNG-44', 'Manage', 'Settings', 'Gói thuê bao', '/manage/subscription', 'Shop owner', 'EXISTING'),
    @('MNG-45', 'Manage', 'Organization', 'Tài xế', '/manage/drivers', 'Shop roles', 'EXISTING'),
    @('MNG-46', 'Manage', 'Organization', 'Thành viên', '/manage/members', 'Authorized roles', 'EXISTING'),
    @('MNG-50', 'Manage', 'Support', 'Trợ giúp/cases', '/manage/support; /manage/support/cases', 'Shop roles', 'EXISTING'),
    @('ADM-01', 'Admin', 'Overview', 'Dashboard/approvals', '/manage/admin', 'Platform roles', 'EXISTING'),
    @('ADM-02', 'Admin', 'Seller', 'Tenants', '/manage/admin/tenants', 'Platform roles', 'EXISTING'),
    @('ADM-03', 'Admin', 'Seller', 'Xe/listing', '/manage/admin/vehicles', 'Platform roles', 'EXISTING'),
    @('ADM-04', 'Admin', 'Transaction', 'Bookings', '/manage/admin/bookings', 'Platform roles', 'EXISTING'),
    @('ADM-05', 'Admin', 'Transaction', 'Customers', '/manage/admin/customers', 'Platform roles', 'EXISTING'),
    @('ADM-06', 'Admin', 'People', 'Platform staff', '/manage/admin/staff', 'Platform admin', 'EXISTING'),
    @('ADM-07', 'Admin', 'Billing', 'Plans', '/manage/admin/plans', 'Platform/finance admin', 'EXISTING'),
    @('ADM-08', 'Admin', 'Money', 'Bank transactions', '/manage/admin/bank-transactions', 'Finance roles', 'EXISTING'),
    @('ADM-09', 'Admin', 'Marketplace', 'Banners', '/manage/admin/marketplace-banners', 'Platform roles', 'EXISTING'),
    @('ADM-10', 'Admin', 'Marketplace', 'Catalog', '/manage/admin/catalog', 'Platform roles', 'EXISTING'),
    @('ADM-11', 'Admin', 'Marketplace', 'Locations', '/manage/admin/locations', 'Platform roles', 'EXISTING'),
    @('ADM-12', 'Admin', 'Control', 'Audit', '/manage/admin/audit', 'Platform admin', 'EXISTING'),
    @('ADM-13', 'Admin', 'Seller', 'Seller profiles', '/manage/admin/sellers', 'Platform roles', 'EXISTING'),
    @('ADM-14', 'Admin', 'Policy', 'Fee policies', '/manage/admin/fee-policies', 'Platform/finance admin', 'EXISTING'),
    @('ADM-15', 'Admin', 'Money', 'Money operations', '/manage/admin/money', 'Finance roles', 'EXISTING'),
    @('ADM-16', 'Admin', 'Operations', 'Support', '/manage/admin/support', 'Support/platform roles', 'EXISTING'),
    @('ADM-17', 'Admin', 'Context', 'Vào Manage của shop', 'Target action từ seller/tenant', 'platform_admin', 'GAP'),
    @('MOB-01', 'Mobile Customer', 'Tabs', 'Explore/Trips/Chat/Account', '/(tabs)/*', 'Customer', 'EXISTING'),
    @('MOB-02', 'Mobile Customer', 'Marketplace', 'Search/listing/request/shop', '/search; /listings/*; /shops/*', 'Customer', 'EXISTING'),
    @('MOB-03', 'Mobile Customer', 'Trips/Chat', 'Trip/chat detail', '/trips/[id]; /chat/[id]', 'Customer', 'EXISTING'),
    @('MOB-10', 'Mobile Manage', 'Tabs', 'Dashboard/requests/bookings/vehicles/customers', '/manage/(tabs)/*', 'Shop roles', 'EXISTING'),
    @('MOB-11', 'Mobile Manage', 'Business', 'Finance/receipts/debts', '/manage/(tabs)/finance|receipts|debts', 'Shop roles', 'EXISTING'),
    @('MOB-12', 'Mobile Manage', 'Operations', 'Booking/handover/settlement', '/manage/bookings/*', 'Shop roles', 'EXISTING'),
    @('MOB-13', 'Mobile Manage', 'Fleet', 'Vehicle detail/edit/pricing/docs/maintenance', '/manage/vehicles/*', 'Shop roles', 'EXISTING'),
    @('MOB-14', 'Mobile Manage', 'Organization', 'Members/drivers/branches/shop/policies', '/manage/(tabs)/*', 'Shop roles', 'EXISTING'),
    @('MOB-15', 'Mobile', 'Strategy', 'Customer-only hay giữ Manage native', 'N/A', 'Product', 'OPEN')
)

$screens = @(
    @('Screen ID', 'Tên trải nghiệm', 'Actor', 'Mục đích chính', 'Primary action', 'Current status', 'Redesign note', 'Source/Reuse'),
    @('PUB-01', 'Home/Khám phá', 'All', 'Khởi đầu tìm xe hoặc đăng xe', 'Tìm xe', 'EXISTING', 'Làm rõ ô tô/xe máy, self/driver, long-term', 'marketplace'),
    @('PUB-02', 'Search results', 'All', 'So sánh xe theo thời gian/địa điểm', 'Chọn listing', 'EXISTING', 'URL filters; list/map; total-price transparency', 'marketplace + geo + calendar'),
    @('PUB-03', 'Listing detail', 'All', 'Đánh giá xe/owner/shop/giá/chính sách', 'Yêu cầu đặt xe', 'EXISTING', 'Hiện final total và pickup modes; contact rule theo business mode', 'public-listings + pricing'),
    @('USR-14', 'Chọn mô hình chủ xe', 'Customer', 'Phân biệt hoa hồng với gian hàng', 'Chọn tuyến', 'GAP', 'Hai card có cost/limit/tools rõ; không điều hướng thẳng shop signup', 'auth + tenant/onboarding'),
    @('PUB-08', 'Wizard đăng xe', 'Owner/shop', 'Tạo vehicle/listing đủ duyệt', 'Submit review', 'REDESIGN', 'Form type-aware ô tô/xe máy/điện; catalog brand/model; 3 bước', 'vehicle form + catalog + uploads'),
    @('OWN-01', 'Danh sách xe Owner Lite', 'Owner', 'Theo dõi 1–3 xe', 'Quản lý xe/Thêm xe', 'EXISTING', 'Dùng common card; xe thứ 4 mở upgrade prompt', 'vehicle-manage + vehicles'),
    @('OWN-03', 'Lịch Owner Lite', 'Owner', 'Biết lịch thuê/bảo dưỡng/khóa', 'Mở/sửa lịch', 'SHARED', 'Dùng hoàn toàn calendar Manage, giữ shell User', 'calendar'),
    @('OWN-V01', 'Thông tin xe', 'Owner', 'Cập nhật dữ liệu vận hành được phép', 'Lưu thay đổi', 'EXISTING', 'Identity approved locked; map address; energy-specific fields', 'vehicle-manage + catalog + geo'),
    @('OWN-V02', 'Ảnh xe', 'Owner', 'Đủ góc ảnh tin cậy', 'Upload/sắp xếp', 'EXISTING', 'Reuse upload/gallery; min 4; roles front/rear/sides/interior', 'storage + vehicle images'),
    @('OWN-V03', 'Giấy tờ xe', 'Owner', 'Nộp/kiểm tra hồ sơ', 'Upload', 'EXISTING', 'Status duyệt/hết hạn; identity changes via support', 'vehicle-documents'),
    @('OWN-V04', 'Lịch sử chuyến xe', 'Owner', 'Xem lịch sử riêng vehicle', 'Lọc/xem trip', 'EXISTING', 'Không clone trip cards/domain', 'trips/bookings'),
    @('OWN-V05..09', 'Cấu hình tự lái', 'Owner', 'Giá/auto accept/delivery/time/terms', 'Lưu cấu hình', 'EXISTING', 'Nhóm ngắn, progressive disclosure, dead time 1–2h+', 'vehicle-settings + pricing'),
    @('OWN-V10..13', 'Cấu hình có tài xế', 'Car owner/shop', 'Giá/optimization/surcharge/terms', 'Lưu cấu hình', 'EXISTING', 'Không hiện cho xe máy; bỏ tiện ích bổ sung', 'vehicle-settings + drivers'),
    @('USR-01', 'Chuyến của tôi', 'Customer/owner/shop', 'Theo dõi current/history', 'Xem chi tiết', 'EXISTING', 'Khi vào từ /account phải giữ left nav', 'customer-trips'),
    @('CHECKOUT', 'Booking checkout', 'Customer', 'Biết tổng/QR now/later và policy', 'Thanh toán QR', 'GAP', 'Tách B,D,S,IV,IP; cảnh báo booking sát giờ', 'pricing + holds + payments'),
    @('PAYWAIT', 'Chờ thanh toán', 'Customer', 'Hoàn tất QR trong hold window', 'Quét QR/Thử lại', 'GAP', 'Hai countdown 60m; under/over/unmatched states', 'holds + sepay + payments'),
    @('INSURANCE', 'Trạng thái bảo hiểm', 'Customer/owner/shop', 'Biết reserved/issued/certificate', 'Xem chứng nhận', 'GAP', 'Chưa mua khi booking; issue tại start; refund all pre-start', 'insurance provider integration'),
    @('BALANCE', 'Số dư & rút tiền', 'Owner/shop', 'Biết pending/available/withdrawn', 'Yêu cầu rút', 'GAP', 'Không gọi ví/điểm; thêm bank account; admin transfer manual', 'finance + payments + admin money'),
    @('MNG-01', 'Manage dashboard', 'Shop roles', 'Việc cần làm/KPI/cảnh báo', 'Đi tới task', 'REDESIGN', 'KPI thật; role-aware; không placeholder', 'dashboard'),
    @('MNG-10..16', 'Fleet & calendar', 'Shop roles', 'Vận hành đội xe', 'Manage vehicle/calendar', 'EXISTING', 'Reuse Owner primitives nhưng cho bulk/advanced', 'vehicles + maintenance + calendar'),
    @('MNG-17..21', 'Booking & customers', 'Shop roles', 'Xử lý request/chuyến/khách', 'Approve/operate', 'EXISTING', 'Service blueprint; driver/branch; conditional evidence', 'booking-requests + bookings + customers'),
    @('MNG-31..34', 'Finance/receipts/debts/contracts', 'Finance-capable shop roles', 'Theo dõi kinh doanh', 'Record/reconcile/export', 'EXISTING', 'Phân biệt money on-platform và tracking off-platform', 'finance + contracts'),
    @('MNG-40..46', 'Shop setup & organization', 'Owner/authorized roles', 'Profile/policy/plan/branch/driver/member', 'Configure', 'EXISTING', 'Role/capability clarity; driver no account', 'tenants + members + drivers + billing'),
    @('ADM-01..16', 'Platform Admin', 'Platform roles', 'Duyệt/vận hành/tiền/support', 'Resolve queue', 'REDESIGN', 'Nhóm IA theo task; PII/audit/maker-checker', 'platform-admin + feature modules'),
    @('ADM-17', 'Admin enter shop Manage', 'platform_admin', 'Thao tác thay shop có ngữ cảnh', 'Enter/Exit context', 'GAP', 'Banner shop; actor admin + tenant context in audit', 'rbac + tenants + audit'),
    @('MOB-01..14', 'Mobile customer + Manage', 'Customer/shop', 'Mobile access', 'Theo task', 'EXISTING', 'Phải quyết định scope; không tự mở rộng Manage native', 'Expo routes + mobile feature APIs')
)

$flows = @(
    @('Flow ID', 'Tên flow', 'Actors', 'Entry', 'Happy path tóm tắt', 'Decision/Exception', 'Exit', 'Priority'),
    @('FL-01', 'Trở thành chủ xe', 'Customer/System', '/account hoặc landing', 'Chọn commission owner hoặc subscription shop → onboarding tương ứng', 'Không được đồng thời hai tuyến; xe thứ 4 gợi ý upgrade', 'Owner Lite hoặc Manage', 'P0'),
    @('FL-02', 'Đăng xe & duyệt listing', 'Owner/Shop/Reviewer', 'List vehicle', 'Chọn type → catalog brand/model → info → rental config → ≥4 ảnh → submit → review → active', 'Car/motorcycle/electric field rules; locked identity; request changes', 'Listing active', 'P0'),
    @('FL-03', 'Khám phá & chọn xe', 'Guest/Customer', 'Home/Search', 'Location/time → vehicle/service/pickup filters → listing → quote', 'No availability; invalid delivery; auth/phone required', 'Booking request', 'P0'),
    @('FL-04', 'Duyệt request & QR Pay', 'Customer/Owner/Shop/System/QR', 'Booking request', 'Owner approve hoặc auto-accept → acceptedAt/start timer → hold → QR Pay → auto-match → paid/confirmed', 'Payment 2 × 60m và free-cancel 4h cùng bắt đầu tại acceptedAt; duplicate webhook', 'Paid/confirmed booking', 'P0'),
    @('FL-05', 'Checkout breakdown', 'Customer/System', 'Approved request', 'Hiện total/now/later + policy → consent → QR', 'Shop S=0; commission S=10%; D phải ≥ T', 'Payment pending/paid', 'P0'),
    @('FL-06', 'Bảo hiểm tại bàn giao', 'System/Owner/Shop/Insurer', 'Confirmed booking', 'IV/IP reserved → handover/start → idempotent issuance → certificate', 'Pre-start cancel refund all; provider failed at handover OPEN', 'Issued/failed', 'P0'),
    @('FL-07A', 'Trip Owner Lite', 'Owner/Customer/System', 'Confirmed booking', 'Scheduled start → auto/owner adjustment → scheduled end → complete', 'Không bắt buộc evidence/customer confirm; owner handles remainder/issues', 'Completed', 'P0'),
    @('FL-07B', 'Trip Shop advanced', 'Shop staff/Driver/Customer', 'Confirmed booking', 'Assign branch/driver → optional handover/evidence → active → optional return/charges → settle', 'Tools optional; XePrime không thu hộ extra charges', 'Completed/settled', 'P1'),
    @('FL-08A', 'Hủy miễn phí', 'Customer/System', 'Cancel ≤ acceptedAt+4h', 'Nếu đã trả: refund D+S+IV+IP', 'QR paid không restart timer; pickup sát giờ phải warning', 'Cancelled/refunded', 'P0'),
    @('FL-08B', 'Hủy muộn trước chuyến', 'Customer/System/Admin', 'Cancel > acceptedAt+4h, pre-start', 'Refund IV+IP → split D+S 50/50 owner/shop vs XePrime', 'Refund failure/manual reconciliation; no tax', 'Cancelled/allocated', 'P0'),
    @('FL-08C', 'Owner/shop hủy', 'Owner/Shop/System', 'Pre-start booking', 'Cancel → refund D+S+IV+IP → reopen calendar → notify', 'No penalty now; track frequency later', 'Cancelled/refunded', 'P0'),
    @('FL-09', 'Thuế, số dư, rút tiền', 'System/Owner/Shop/Finance admin', 'Trip start', 'Apply T → ledger pending/available → withdrawal → manual bank transfer → paid', 'Rejected/retry/reversal/reconciliation; no tax if cancelled', 'Paid/recorded', 'P0'),
    @('FL-10', 'Upgrade Owner → Shop', 'Owner/System/Finance admin', 'Upgrade CTA', 'Compare → onboarding → subscription QR → activate → Manage', 'Old booking keeps snapshot; downgrade OPEN', 'Subscription shop', 'P1'),
    @('FL-11', 'Admin vào Manage', 'platform_admin/System', 'Admin seller/tenant', 'Select shop → enter context → banner → act as owner → audit → exit', 'Prevent wrong-tenant mutation; PII/money audit', 'Back to Admin', 'P1'),
    @('FL-12', 'Thuê dài hạn', 'Customer/Owner/Shop', 'Listing', 'Choose package/month duration → direct quote → request → approve → QR', 'Mileage/extension/early return OPEN', 'Confirmed long-term booking', 'P1')
)

$permissions = @(
    @('Module/Capability', 'Customer', 'Commission owner', 'Shop owner', 'Manager', 'Staff', 'Viewer', 'Platform admin', 'Reviewer', 'Support', 'Finance admin'),
    @('Public marketplace', 'V', 'V', 'V', 'V', 'V', 'V', 'V', 'V', 'V', 'V'),
    @('Own profile/trips', 'VCU', 'VCU', 'VCU', 'VCU', 'VCU', 'VCU', 'A', '-', 'Case V', '-'),
    @('Owner Lite vehicles', '-', 'VCU own ≤3', 'VCU own', '-', '-', '-', 'A', 'Review V', 'Case V', '-'),
    @('Shop fleet', '-', '-', 'VCUDA', 'VCU', 'VCU', 'V', 'A/context', 'V/Approve', 'Case V', 'V'),
    @('Vehicle documents', '-', 'VCU own', 'VCUDA', 'VCU', 'VCU', 'V', 'A', 'Approve', 'Case V', '-'),
    @('Maintenance', '-', '-', 'VCUDA', 'VCU', 'VCU', 'V', 'A/context', 'V', '-', 'V'),
    @('Booking requests', 'Create/cancel own', 'Approve own', 'A tenant', 'VCUA', 'VCU', 'V', 'A', 'V', 'Case V/U', 'V'),
    @('Bookings/trips', 'V/cancel own', 'VU own', 'A tenant', 'VCUA', 'VCU', 'V', 'A', 'V', 'Case V/U', 'V'),
    @('Calendar', 'Availability V', 'VU own', 'VCUDA', 'VCU', 'VCU', 'V', 'A/context', 'V', 'Case V', 'V'),
    @('Advanced handover', 'Trip V', 'Not required', 'VCUDA', 'VCU', 'VCU', 'V', 'A/context', '-', 'Case V', 'V'),
    @('Customers/PII', 'Own only', 'Booking contact', 'VCUDA', 'VCU', 'VCU masked', 'V masked', 'A audited', '-', 'Case reveal', '-'),
    @('Drivers', '-', 'Owner = driver', 'VCUDA records', 'VCU records', 'VCU records', 'V', 'A/context', '-', 'Case V', '-'),
    @('Branches', '-', '-', 'VCUDA', 'VCU', 'V', 'V', 'A/context', '-', '-', '-'),
    @('Members/RBAC', '-', '-', 'VCUDA', 'Limited U', '-', 'V', 'A/context', '-', '-', '-'),
    @('Finance/receipts/debts', 'Own payment V', 'Own balance V', 'VCUDA', 'VCU', 'Limited VC', 'V', 'A', '-', 'Case V', 'A'),
    @('Withdrawal', '-', 'Create own', 'Create own', 'V', '-', 'V', 'A', '-', 'Case V', 'Approve/pay'),
    @('Subscription', '-', 'Upgrade only', 'VCU/pay', 'V', '-', 'V', 'A', '-', '-', 'A'),
    @('Support cases', 'Create/V own', 'Create/V own', 'VCU tenant', 'VCU', 'VCU', 'V', 'A', '-', 'A', 'Money cases'),
    @('Platform approvals', '-', '-', '-', '-', '-', '-', 'A', 'Approve', 'Case V', '-'),
    @('Platform money/policy', '-', '-', '-', '-', '-', '-', 'A', '-', 'Case V', 'A'),
    @('Audit/staff', '-', '-', '-', '-', '-', '-', 'A', 'Limited V', 'Limited V', 'Limited V')
)

$bookingStates = @(
    @('Object', 'Current/Target state', 'Trigger', 'Actor', 'Next state(s)', 'UX requirement'),
    @('BookingRequest', 'draft/submitted', 'Customer gửi yêu cầu', 'Customer', 'pending_host_approval/approved/rejected', 'Giữ quote snapshot và availability check'),
    @('BookingRequest', 'pending_host_approval', 'Request hợp lệ', 'Owner/Shop/System', 'approved/rejected/expired/cancelled', 'Hiện SLA và auto-accept nếu bật'),
    @('PaymentHold', 'pending', 'Request approved/auto-accepted; record acceptedAt', 'System', 'underpaid/paid/expired/cancelled', 'Payment 60m+60m; free-cancel deadline = acceptedAt+4h'),
    @('PaymentHold', 'underpaid', 'QR amount thiếu', 'System/Admin', 'paid/expired/refunded', 'Không confirm booking; hướng dẫn trả tiếp/đối soát'),
    @('PaymentHold', 'paid', 'QR auto-match', 'System', 'booking confirmed', 'Idempotent; không cộng tiền hai lần'),
    @('PaymentHold', 'expired', 'Hết tổng 2h', 'System', 'booking cancelled', 'Mở lịch và báo hai bên'),
    @('Booking', 'confirmed', 'Hold paid', 'System', 'active/cancelled/no_show', 'Contact/insurance reservation/scheduled notices'),
    @('Insurance', 'reserved_not_issued', 'QR paid', 'System', 'issuing/refunded', 'Chưa có certificate; pre-start cancel refund all'),
    @('Insurance', 'issuing', 'Handover/start', 'System/Insurer', 'issued/failed', 'Retry idempotent; prevent duplicate policy'),
    @('Insurance', 'issued', 'Provider success', 'Insurer', 'claim/voided/closed', 'Certificate visible; post-start policy applies'),
    @('Booking', 'active', 'Handover/start or schedule', 'Owner/Shop/System', 'completed/cancelled/disputed', 'Tax recognized; insurance issued'),
    @('Handover', 'draft/ready', 'Shop prepares handover', 'Shop staff', 'confirmed/cancelled', 'Optional for shop; not required Owner Lite'),
    @('Booking', 'completed', 'Return/end confirmed or scheduled', 'Owner/Shop/System', 'settled/reviewed', 'Invite review; finalize operational records'),
    @('Booking', 'cancelled', 'Customer/owner/system cancel', 'Various', 'refund/allocated/closed', 'Show actor, reason, refund breakdown'),
    @('Withdrawal', 'pending', 'Owner/shop requests', 'Owner/Shop', 'approved/rejected/cancelled', 'Show amount/bank/SLA'),
    @('Withdrawal', 'approved', 'Finance review', 'Finance admin', 'paid/rejected', 'Manual bank transfer and maker-checker if needed'),
    @('Withdrawal', 'paid', 'Admin confirms transfer', 'Finance admin', 'closed', 'Receipt/reference + audit')
)

$moneyRules = @(
    @('Rule ID', 'Chủ đề', 'Công thức/Quyết định', 'Ai trả', 'Khi ghi nhận', 'Khi hủy trước chuyến', 'Status'),
    @('MR-01', 'Giá thuê gốc', 'B = giá chủ xe/gian hàng đặt', 'Customer', 'Snapshot khi booking', 'D chịu cancellation policy; remainder chưa trả', 'DECIDED'),
    @('MR-02', 'Cọc đặt chuyến', 'D là một phần của B; working default 20%', 'Customer qua QR Pay', 'Request approved → hold paid', 'Free: refund 100%; late: D vào pool 50/50', 'DECIDED'),
    @('MR-03', 'Phí nền tảng commission', 'S = 10% × B', 'Customer trả thêm', 'QR Pay; revenue theo policy', 'Free: refund 100%; late: S vào pool 50/50', 'DECIDED'),
    @('MR-04', 'Phí nền tảng shop', 'S = 0 khi gói hiệu lực', 'Không ai', 'Booking snapshot', 'Không có S', 'DECIDED'),
    @('MR-05', 'Bảo hiểm xe/chuyến', 'IV theo biểu phí đối tác; bắt buộc', 'Customer trả thêm', 'Reserve at QR; buy/issue at handover/start', 'Refund 100% cho mọi pre-start cancel', 'DECIDED'),
    @('MR-06', 'Bảo hiểm thân thể', 'IP theo biểu phí; tùy chọn', 'Customer nếu chọn', 'Reserve at QR; buy/issue at handover/start', 'Refund 100% cho mọi pre-start cancel', 'DECIDED'),
    @('MR-07', 'Thuế', 'T = tax rate × taxable base; working example 7% × B', 'Khấu trừ phía owner/shop', 'Chỉ khi trip starts', 'Không tính thuế', 'WORKING RATE'),
    @('MR-08', 'QR Pay ngay', 'D + S + IV + IP', 'Customer', 'Sau approval, trong tối đa 2h', 'Theo MR-02/03/05/06', 'DECIDED'),
    @('MR-09', 'Trả trực tiếp khi nhận', 'B − D', 'Customer → owner/shop', 'Tại nhận xe', 'Chưa phát sinh trước trip', 'DECIDED'),
    @('MR-10', 'Owner/shop net', 'B − T', 'Customer/platform portions', 'Trip start + direct payment', 'Không áp dụng nếu canceled', 'DECIDED'),
    @('MR-11', 'Platform payout from deposit', 'D − T', 'XePrime → balance owner/shop', 'Sau trip start theo policy', 'Free/owner cancel: refund; late customer cancel: 50% pool', 'DECIDED'),
    @('MR-12', 'Hủy miễn phí', 'Refund = D + S + IV + IP', 'XePrime → customer', 'Trong 4h từ acceptedAt; QR paid không restart', '100% online paid', 'DECIDED'),
    @('MR-13', 'Hủy muộn pre-start', 'Refund IV+IP; 50%×(D+S) owner/shop; 50%×(D+S) XePrime', 'Allocated from online money', 'Sau acceptedAt+4h, trước start', 'No tax; insurance not issued', 'DECIDED'),
    @('MR-14', 'Owner/shop cancel pre-start', 'Refund = D + S + IV + IP', 'XePrime → customer', 'Before start', 'Owner no monetary penalty now', 'DECIDED'),
    @('MR-15', 'Số dư', 'Internal payable ledger, not e-wallet/points', 'XePrime owes owner/shop/user', 'Append-only entries', 'Reversal, never delete', 'DECIDED'),
    @('MR-16', 'Withdrawal', 'User request; admin bank transfer manual', 'XePrime → bank account', 'After finance approval', 'Rejected/cancelled stays audited', 'DECIDED'),
    @('EX-01', 'VF5 example', 'B 700k; S 70k; IV 130k; total 900k; D 140k; QR 340k; later 560k; T 49k; owner net 651k', 'Customer/owner', 'Illustration only', 'Apply above rules', 'EXAMPLE')
)

$vehicleMatrix = @(
    @('Dimension', 'Ô tô xăng/dầu/hybrid', 'Ô tô điện', 'Xe máy xăng', 'Xe máy điện', 'Design rule'),
    @('Brand/model', 'Dependent select từ catalog VN', 'Dependent select từ catalog VN', 'Dependent select từ catalog VN', 'Dependent select từ catalog VN', 'Không dùng free text làm primary path; có request model khác'),
    @('Core classification', 'Car/body type', 'Car/body type', 'Xe số/tay ga/côn tay', 'Scooter/motorcycle electric type', 'Fields đổi theo vehicle type'),
    @('Seats', 'Hiện số chỗ', 'Hiện số chỗ', 'Không dùng field kiểu ô tô', 'Không dùng field kiểu ô tô', 'Không để stale value khi đổi type'),
    @('Transmission', 'Manual/Automatic/CVT/DCT theo catalog', 'Automatic/single-speed phù hợp catalog', 'Số/tay ga/côn tay', 'Automatic/single-speed', 'Options phụ thuộc loại/model'),
    @('Energy', 'Xăng/dầu/hybrid', 'Điện', 'Xăng', 'Điện', 'Không trộn unit'),
    @('Efficiency', 'L/100km', 'Km/lần sạc đầy; charging info', 'L/100km hoặc km/lít theo policy', 'Km/lần sạc đầy; battery/charging', 'Ẩn L/100km cho EV'),
    @('With driver', 'Có thể bật', 'Có thể bật', 'Không hỗ trợ', 'Không hỗ trợ', 'Ẩn toàn nhóm, không chỉ disable'),
    @('Self drive', 'Có', 'Có', 'Có', 'Có', 'Terms phù hợp loại xe'),
    @('Long term', 'Đặt trực tiếp', 'Đặt trực tiếp', 'Đặt trực tiếp nếu listing hỗ trợ', 'Đặt trực tiếp nếu listing hỗ trợ', 'Không chuyển mặc định thành quote request'),
    @('Pickup', 'Owner/shop address hoặc delivery', 'Owner/shop address hoặc delivery', 'Owner/shop address hoặc delivery', 'Owner/shop address hoặc delivery', 'Delivery distance là estimate'),
    @('Amenities', 'Car-specific catalog', 'Car + EV-specific', 'Motorcycle-specific', 'Motorcycle + EV-specific', 'Không hiện camera 360/seat count cho xe máy nếu không phù hợp'),
    @('Images', '≥4; front/rear/sides/interior', '≥4; front/rear/sides/interior', '≥4; front/rear/sides/details', '≥4; front/rear/sides/battery/charger if needed', 'Reuse upload/gallery/validation'),
    @('Documents', 'Registration/inspection/other policy docs', 'Same + EV data if required', 'Registration/policy docs', 'Registration + battery docs if required', 'Status/expiry/review visible'),
    @('Approved identity', 'Plate/VIN/registration locked', 'Plate/VIN/registration locked', 'Plate/frame/engine identity locked as policy', 'Plate/frame/battery identity as policy', 'Change via support/admin, not silent edit')
)

$uiStates = @(
    @('State', 'Áp dụng', 'Yêu cầu thiết kế', 'Ví dụ XePrime'),
    @('Loading', 'Mọi page/query', 'Skeleton phù hợp layout; tránh layout shift; không fake data', 'Search cards, calendar, money table'),
    @('Success with data', 'List/detail/form', 'Hierarchy + primary action rõ; status labels shared', 'Vehicle list, bookings'),
    @('Empty', 'List/calendar/finance', 'Giải thích + CTA theo role; không blame user', 'Chưa có xe → Đăng xe; chưa có trip'),
    @('Validation error', 'Form/checkout', 'Inline near field + summary nếu dài; giữ dữ liệu', 'Plate/model/unit mismatch'),
    @('Business error', 'Booking/money', 'Giải thích rule và next action', 'Xe vừa hết lịch; D không đủ cover T'),
    @('Network/server error', 'Mọi async', 'Retry; preserve context; correlation/support path khi cần', 'QR status fetch failed'),
    @('Forbidden', 'Manage/Admin/capability', 'Nêu thiếu permission/capability và ai xử lý', 'Staff không được duyệt withdrawal'),
    @('Feature unavailable', 'Plan/business mode', 'So sánh/upgrade CTA, không 403 mơ hồ', 'Commission owner mở finance advanced'),
    @('Pending async', 'Approval/payment/insurance', 'Timeline/status/ETA; disable duplicate submit', 'Waiting vehicle review; issuing insurance'),
    @('Partial/stale', 'External provider/map/payment', 'Timestamp + refresh/fallback; không xác nhận quá mức', 'Bank transaction not matched'),
    @('Destructive confirmation', 'Cancel/delete/reversal', 'Hiện hậu quả và breakdown server-calculated', 'Cancel late splits D+S'),
    @('PII masked', 'Customer/admin/shop', 'Mask default; reveal reason + audit', 'Phone/ID/bank account'),
    @('Responsive', 'Web 360px+', 'Touch ≥44px; table → cards/scroll; giữ task priority', 'Manage booking and account nav'),
    @('Accessibility', 'All', 'WCAG 2.1 AA; keyboard/focus/error association; color not sole signal', 'Status chips + icons/text')
)

$traceability = @(
    @('Domain/Experience', 'Web route/feature', 'Mobile', 'API module(s)', 'Data/model examples', 'Reuse/Gap'),
    @('Auth & account', '/login; /register; /account; auth services', 'Auth routes + account tab', 'auth; users; phone-verification; email', 'User; identity; reset/session/token', 'Reuse; deletion retention needs E2E'),
    @('Marketplace', '/; /search; /listings; /shops', 'Explore/search/listing/shop', 'public-listings; pricing; geo; locations; review', 'PublicListing; GeoRouteCache; Review', 'Reuse; redesign final price/service variants'),
    @('Vehicle registration', '/list-your-vehicle/register; manage vehicle new', 'manage vehicles/new', 'vehicles; catalog; storage; vehicle-documents', 'Vehicle; VehicleImage; CatalogItem; VehicleCatalogModel', 'Reuse; type-aware catalog-driven UI'),
    @('Owner vehicle settings', '/account/vehicles/[id]/manage/*', 'Manage vehicle edit variants', 'vehicles; vehicle-settings; pricing; geo', 'VehicleOperationSetting; ServiceSetting; HandoverWindow', 'Existing; keep Owner Lite simple'),
    @('Calendar & availability', '/account/calendar; /manage/calendar', 'Manage calendar via routes/features', 'calendar; holds; holidays; pricing', 'VehicleOccupancy; Block; DailyPrice; BookingHold', 'SHARED; 2h rule gap'),
    @('Requests & bookings', '/manage/booking-requests; /bookings; /trips', 'request/booking/trip routes', 'booking-requests; bookings; customer-trips', 'BookingRequest; Booking', 'Reuse; state/rules alignment needed'),
    @('Handover', 'Booking detail/contextual', 'handover + photos routes', 'handovers', 'VehicleHandover; HandoverPhoto', 'Shop optional; do not require for Owner Lite'),
    @('Payments/QR/refunds', 'Admin bank/money; checkout gap', 'booking payments/settlement', 'payments; sepay; holds; finance; fee-policies', 'Payment; BankTransaction; BookingHold; HoldRefund; Settlement', 'P0 gap: D/S/IV/IP/T lines and timers'),
    @('Insurance', 'Trip/checkout gap', 'Trip/payment gap', 'New provider integration + bookings/payments', 'Need reservation/policy/certificate states', 'P0 gap; issue at handover only'),
    @('Finance & balance', '/manage/finance; receipts; debts; admin money', 'finance/receipts/debts', 'finance; payments; billing; platform-admin', 'Receipt; FinanceCategory; Payment; settlement', 'Existing primitives; withdrawal/balance UX gap'),
    @('Shop organization', '/manage/shop; branches; members; drivers', 'Manage shop/member/driver/branch', 'tenants; branches; members; drivers; rental-policies', 'Tenant; Membership; Branch; Driver; RentalPolicy', 'Reuse; driver has no account'),
    @('Subscription', '/manage/subscription; admin plans', 'Onboarding/shop', 'billing; sepay', 'Plan; Subscription; Invoice', 'Reuse; production plan rules open'),
    @('Chat/notification', '/chat; /manage/chat', 'Chat routes', 'chat; notification; firebase', 'Conversation; Message; Outbox; Notification', 'Reuse; contact unlock rule open'),
    @('Support/disputes', '/support; /account/support; manage/admin support', 'Account/more patterns', 'support; audit', 'SupportCase; SupportEvent; AuditLog', 'Existing base; case-linked money/PII needs refinement'),
    @('Admin/governance', '/manage/admin/*', 'No platform admin mobile scope', 'platform-admin; audit; banners; catalog; fee-policies', 'ApprovalTask; AuditLog; Banner; FeePolicy', 'Regroup IA; enter Manage gap')
)

$openDecisions = @(
    @('ID', 'Vấn đề', 'Working rule/Options', 'Owner', 'Design impact', 'Priority'),
    @('OD-01', 'Mở contact tuyến hoa hồng lúc nào?', 'Working: chỉ sau QR Pay thành công', 'Product', 'Listing, booking timeline, chat/phone visibility', 'P0'),
    @('OD-02', 'Countdown giờ thứ hai tự động hay user bấm gia hạn?', 'Working: tự động chuyển sang 60 phút thứ hai', 'Product', 'Payment waiting screen/notification copy', 'P0'),
    @('OD-03', 'Thuế chính xác theo loại chủ thể/dịch vụ?', '7% chỉ là working example; cần legal/tax policy', 'Legal/Finance', 'Owner earnings, tax form, checkout explanation', 'P0'),
    @('OD-04', 'Dòng phí nào thuộc taxable base?', 'B là base hiện tại; danh sách phụ phí cần chốt', 'Legal/Finance', 'Money breakdown/reporting', 'P0'),
    @('OD-05', 'Phát hành bảo hiểm lỗi tại handover?', 'Block vs retry vs đổi xe', 'Product/Insurance', 'Critical error/recovery service blueprint', 'P0'),
    @('OD-06', 'No-show/early return/extension/post-start cancel?', 'Chưa chốt; không dùng policy pre-start', 'Product/Legal', 'Trip detail and settlement states', 'P1'),
    @('OD-07', 'Downgrade shop → commission owner?', 'Chưa chốt', 'Product/Billing', 'Subscription expiry and access/read-only'),
    @('OD-08', 'Giá/limit/grace gói shop production?', 'Pilot values không phải production', 'Product/Finance', 'Pricing comparison and expired plan'),
    @('OD-09', 'Giữ Mobile Manage hay customer-first?', 'Source đã có Manage native; cần strategic decision', 'Product', 'Mobile sitemap and design workload'),
    @('OD-10', 'Tracking owner cancellations và enforcement?', 'No monetary penalty now; tracking later', 'Operations/Product', 'Warnings/admin risk flags'),
    @('OD-11', 'Insurance partner/product/price/claim?', 'Chỉ hiển thị insurance khi hợp đồng hợp pháp đủ điều kiện', 'Legal/Insurance', 'Consent, certificate, claims and release gate'),
    @('OD-12', 'Identity fields motorcycle/electric?', 'Policy lock cần mapping cụ thể theo giấy tờ VN', 'Operations/Legal', 'Vehicle form/support flow')
)

$implementationGaps = @(
    @('Gap ID', 'Source hiện tại/Quan sát', 'Product target', 'Ảnh hưởng', 'Khuyến nghị handoff', 'Priority'),
    @('IG-01', 'packages/types/src/holds.ts và FeePolicyForm đang mặc định 24 × 60 phút', 'Tối đa 2h = 60m + 60m', 'Calendar, payment, notification, expiry jobs', 'Thiết kế target 2h; engineering map constant/job', 'P0'),
    @('IG-02', 'API test hiện xác nhận freeCancelUntil = pickupAt − 4h', 'freeCancelUntil = acceptedAt + 4h; booking sát giờ warning', 'Refund copy/calculation/status', 'Server calculator là nguồn; không hard-code UI', 'P0'),
    @('IG-03', 'Hold/commission semantics cũ chưa tách tiền', 'Tách D, S, IV, IP, T và owner/beneficiary', 'Checkout/ledger/refund/reconciliation', 'Money-line table + commercial snapshot', 'P0'),
    @('IG-04', 'Insurance chưa có lifecycle reserved vs issued', 'Thu phí dự kiến at QR; issue at handover/start', 'Refund/certificate/provider retry', 'Design states + provider failure branch', 'P0'),
    @('IG-05', 'Tài liệu cũ cho shop nhận cọc trực tiếp/full collection', 'Cọc QR bắt buộc; remainder direct only', 'Booking variants and finance scope', 'Xóa nhánh cũ khỏi target IA', 'P0'),
    @('IG-06', 'Owner Lite từng bị mô tả có evidence/handover bắt buộc', 'Owner Lite auto schedule, evidence not required', 'Complexity and navigation', 'Chỉ shop thấy advanced handover', 'P0'),
    @('IG-07', 'Become owner có thể đi thẳng shop registration', 'Bắt buộc chọn commission vs subscription', 'Acquisition/business mode integrity', 'New comparison/decision step', 'P0'),
    @('IG-08', 'Account route có nhiều placeholder', 'Không có stub trong production nav', 'Navigation trust', 'Hide until real flow', 'P1'),
    @('IG-09', 'Admin route đã rộng nhưng nav/ops còn phẳng', 'Task-grouped admin + context Manage', 'Admin efficiency/risk', 'Regroup IA; add context banner/audit', 'P1'),
    @('IG-10', 'Mobile docs nói customer-only nhưng source có Manage', 'Product must decide scope', 'Duplicate design/engineering effort', 'Separate current vs target; freeze expansion', 'P1'),
    @('IG-11', 'Tài xế có thể bị hiểu là user role', 'Driver record only; no login/app', 'Auth/IA/forms', 'Show CRUD/assignment, not account onboarding', 'P1'),
    @('IG-12', 'Vehicle form generic dễ lẫn car/motorcycle/EV', 'Type-aware dependent fields and VN catalog selects', 'Data quality/conversion', 'Vehicle matrix drives conditional UI', 'P0'),
    @('IG-13', 'FREE_TRIP_ALLOWANCE = 2 vẫn còn trong packages/types và worker lifecycle', 'Commission owner không có free trips', 'Fee calculation/marketing', 'Treat old allowance as implementation gap/campaign only', 'P0')
)

$sheets = @(
    @{ Name = '00_Readme'; Rows = $readme; Widths = @(24, 110) },
    @{ Name = '01_Roles'; Rows = $roles; Widths = @(26, 12, 22, 28, 48, 70) },
    @{ Name = '02_Sitemap'; Rows = $sitemap; Widths = @(12, 20, 18, 42, 55, 28, 18) },
    @{ Name = '03_Screen_Inventory'; Rows = $screens; Widths = @(16, 34, 25, 48, 28, 18, 70, 38) },
    @{ Name = '04_User_Flows'; Rows = $flows; Widths = @(12, 32, 35, 30, 85, 70, 32, 12) },
    @{ Name = '05_Permissions'; Rows = $permissions; Widths = @(34, 20, 22, 18, 18, 18, 16, 22, 18, 18, 20) },
    @{ Name = '06_Booking_States'; Rows = $bookingStates; Widths = @(20, 25, 35, 24, 34, 70) },
    @{ Name = '07_Money_Rules'; Rows = $moneyRules; Widths = @(12, 28, 75, 26, 38, 65, 18) },
    @{ Name = '08_Vehicle_Matrix'; Rows = $vehicleMatrix; Widths = @(25, 38, 38, 38, 38, 65) },
    @{ Name = '09_UI_States'; Rows = $uiStates; Widths = @(24, 28, 78, 45) },
    @{ Name = '10_Traceability'; Rows = $traceability; Widths = @(30, 48, 38, 52, 52, 60) },
    @{ Name = '11_Open_Decisions'; Rows = $openDecisions; Widths = @(12, 48, 70, 24, 55, 12) },
    @{ Name = '12_Implementation_Gaps'; Rows = $implementationGaps; Widths = @(12, 65, 65, 50, 58, 12) }
)

function Release-ComObject {
    param([object]$Object)
    if ($null -ne $Object -and [System.Runtime.InteropServices.Marshal]::IsComObject($Object)) {
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($Object)
    }
}

function Add-WorksheetData {
    param(
        [object]$Workbook,
        [object]$Worksheet,
        [string]$Name,
        [object[]]$Rows,
        [int[]]$Widths
    )

    $Worksheet.Name = $Name
    $rowCount = $Rows.Count
    $columnCount = $Rows[0].Count
    $matrix = New-Object 'object[,]' $rowCount, $columnCount
    for ($row = 0; $row -lt $rowCount; $row++) {
        for ($column = 0; $column -lt $columnCount; $column++) {
            $matrix[$row, $column] = [string]$Rows[$row][$column]
        }
    }

    $start = $Worksheet.Cells.Item(1, 1)
    $end = $Worksheet.Cells.Item($rowCount, $columnCount)
    $range = $Worksheet.Range($start, $end)
    $range.Value2 = $matrix
    $range.Font.Name = 'Aptos'
    $range.Font.Size = 10
    $range.VerticalAlignment = -4160
    $range.WrapText = $true
    $range.Borders.Color = 0xE7E0D8
    $range.Borders.Weight = 2

    $header = $Worksheet.Range($Worksheet.Cells.Item(1, 1), $Worksheet.Cells.Item(1, $columnCount))
    $header.Interior.Color = 0x0077D9
    $header.Font.Color = 0xFFFFFF
    $header.Font.Bold = $true
    $header.RowHeight = 30
    $header.HorizontalAlignment = -4108

    for ($column = 1; $column -le $columnCount; $column++) {
        $width = if ($column -le $Widths.Count) { $Widths[$column - 1] } else { 24 }
        $Worksheet.Columns.Item($column).ColumnWidth = [Math]::Min($width, 110)
    }

    if ($rowCount -gt 1) {
        $Worksheet.Range($Worksheet.Cells.Item(2, 1), $Worksheet.Cells.Item($rowCount, $columnCount)).RowHeight = 42
        $range.AutoFilter() | Out-Null
    }

    $Worksheet.Activate() | Out-Null
    $Worksheet.Application.ActiveWindow.SplitRow = 1
    $Worksheet.Application.ActiveWindow.FreezePanes = $true
    $Worksheet.Application.ActiveWindow.Zoom = 85

    $statusColors = @{
        'EXISTING' = 0xD9EAD3
        'SHARED' = 0xEADCF8
        'REDESIGN' = 0xDDEBF7
        'GAP' = 0xF4CCCC
        'PLACEHOLDER' = 0xE7E6E6
        'OPEN' = 0xFFF2CC
        'DECIDED' = 0xD9EAD3
        'WORKING RATE' = 0xFFF2CC
        'EXAMPLE' = 0xDDEBF7
        'P0' = 0xF4CCCC
        'P1' = 0xFCE5CD
        'P2' = 0xFFF2CC
    }
    for ($row = 2; $row -le $rowCount; $row++) {
        for ($column = 1; $column -le $columnCount; $column++) {
            $cell = $Worksheet.Cells.Item($row, $column)
            $value = [string]$cell.Value2
            if ($statusColors.ContainsKey($value)) {
                $cell.Interior.Color = $statusColors[$value]
                $cell.Font.Bold = $true
            }
        }
    }

    Release-ComObject $header
    Release-ComObject $range
    Release-ComObject $end
    Release-ComObject $start
}

$excel = $null
$workbook = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.ScreenUpdating = $false
    $workbook = $excel.Workbooks.Add()

    while ($workbook.Worksheets.Count -lt $sheets.Count) {
        [void]$workbook.Worksheets.Add([System.Type]::Missing, $workbook.Worksheets.Item($workbook.Worksheets.Count))
    }
    while ($workbook.Worksheets.Count -gt $sheets.Count) {
        $workbook.Worksheets.Item($workbook.Worksheets.Count).Delete()
    }

    for ($index = 0; $index -lt $sheets.Count; $index++) {
        $sheetDefinition = $sheets[$index]
        $worksheet = $workbook.Worksheets.Item($index + 1)
        Add-WorksheetData -Workbook $workbook -Worksheet $worksheet -Name $sheetDefinition.Name -Rows $sheetDefinition.Rows -Widths $sheetDefinition.Widths
        Release-ComObject $worksheet
    }

    $readmeSheet = $workbook.Worksheets.Item(1)
    $readmeSheet.Activate() | Out-Null
    Release-ComObject $readmeSheet

    try {
        $workbook.BuiltinDocumentProperties.Item('Title').Value = 'XePrime Design Handoff'
        $workbook.BuiltinDocumentProperties.Item('Subject').Value = 'Sitemap, screen inventory, user flows, permissions, money and product gaps'
        $workbook.BuiltinDocumentProperties.Item('Author').Value = 'XePrime Product & Engineering'
        $workbook.BuiltinDocumentProperties.Item('Comments').Value = 'Generated from repository state and product decisions dated 09/09/2026.'
    } catch {
        # Some unattended Excel sessions do not expose BuiltinDocumentProperties.
    }
    $workbook.SaveAs($OutputPath, 51)
}
finally {
    if ($null -ne $workbook) {
        $workbook.Close($false)
        Release-ComObject $workbook
    }
    if ($null -ne $excel) {
        $excel.Quit()
        Release-ComObject $excel
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Write-Output $OutputPath
