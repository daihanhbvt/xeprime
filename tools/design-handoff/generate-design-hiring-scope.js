/*
 * XePrime design hiring scope. Run with: node tools/design-handoff/generate-design-hiring-scope.js
 * The workbook is a discussion inventory, not a statement that every route is live on staging.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'docs/design/XePrime_2_phuong_an_thue_design_v3_2026-09-14.xlsx');
const pnpmDir = path.join(root, 'node_modules/.pnpm');
const archiverPackage = fs.readdirSync(pnpmDir).find((name) => name.startsWith('archiver@7.'));
if (!archiverPackage) throw new Error('archiver is not available in the installed workspace dependencies');
const archiver = require(path.join(pnpmDir, archiverPackage, 'node_modules/archiver'));

function walk(dir, targetName) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, targetName));
    else if (targetName === '.tsx' ? entry.name.endsWith('.tsx') : entry.name === targetName) files.push(full);
  }
  return files;
}

function routeFromFile(file, appDir) {
  const segments = path.relative(appDir, path.dirname(file)).split(path.sep)
    .filter((segment) => !/^\(.+\)$/.test(segment));
  return '/' + segments.join('/');
}
function mobileRouteFromFile(file, appDir) {
  const segments = path.relative(appDir, file).split(path.sep)
    .filter((segment) => !/^\(.+\)$/.test(segment));
  segments[segments.length - 1] = segments.at(-1).replace(/\.tsx$/, '');
  if (segments.at(-1) === 'index') segments.pop();
  return '/' + segments.join('/');
}

const webRoutes = walk(path.join(root, 'apps/web/src/app'), 'page.tsx')
  .map((file) => routeFromFile(file, path.join(root, 'apps/web/src/app'))).sort();
const mobileRoutes = walk(path.join(root, 'apps/mobile/app'), '.tsx')
  .filter((file) => !['+not-found.tsx', '_layout.tsx'].includes(path.basename(file)))
  .map((file) => mobileRouteFromFile(file, path.join(root, 'apps/mobile/app'))).sort();

const labels = {
  '/': 'Trang chủ / Khám phá',
  '/search': 'Tìm kiếm và lọc xe',
  '/listings/[id]': 'Chi tiết xe và báo giá',
  '/listings/[id]/request': 'Gửi yêu cầu thuê xe',
  '/shops/[slug]': 'Trang gian hàng công khai',
  '/list-your-vehicle': 'Giới thiệu đăng xe',
  '/list-your-vehicle/register': 'Đăng xe / chọn tuyến chủ xe',
  '/trips': 'Danh sách chuyến của tôi',
  '/trips/[id]': 'Chi tiết chuyến / trạng thái',
  '/chat': 'Danh sách hội thoại',
  '/chat/[id]': 'Chi tiết hội thoại',
  '/support': 'Trung tâm hỗ trợ',
  '/legal': 'Danh sách điều khoản và chính sách',
  '/legal/[doc]': 'Chi tiết điều khoản / chính sách',
  '/invites/[token]': 'Nhận lời mời vào gian hàng',
  '/login': 'Đăng nhập',
  '/register': 'Đăng ký tài khoản',
  '/forgot-password': 'Quên mật khẩu',
  '/reset-password': 'Đặt lại mật khẩu',
  '/set-password': 'Tạo mật khẩu',
  '/auth/callback': 'Hoàn tất đăng nhập liên kết',
  '/account': 'Tổng quan tài khoản',
  '/account/addresses': 'Địa chỉ của tôi',
  '/account/balance': 'Ví điểm / số dư phải trả',
  '/account/bank-accounts': 'Tài khoản ngân hàng',
  '/account/calendar': 'Lịch xe chủ xe',
  '/account/change-password': 'Đổi mật khẩu',
  '/account/contracts-documents': 'Hợp đồng và chứng từ',
  '/account/data-protection': 'Bảo vệ dữ liệu',
  '/account/delete-account': 'Xóa tài khoản',
  '/account/documents': 'Tài liệu cá nhân',
  '/account/earnings': 'Thu nhập theo chuyến',
  '/account/favorites': 'Xe yêu thích',
  '/account/host-guide': 'Cẩm nang chủ xe',
  '/account/messages': 'Tin nhắn chủ xe',
  '/account/notifications': 'Thông báo',
  '/account/payments': 'Lịch sử thanh toán',
  '/account/registration': 'Đăng ký chủ xe',
  '/account/settings': 'Cài đặt tài khoản',
  '/account/subscription': 'So sánh / nâng cấp gian hàng',
  '/account/support': 'Yêu cầu hỗ trợ',
  '/account/tax': 'Thông tin thuế chủ xe',
  '/account/vehicles': 'Danh sách xe của tôi',
  '/account/vehicles/[id]': 'Chi tiết xe của tôi',
  '/account/vehicles/[id]/manage': 'Trung tâm quản lý một xe',
  '/account/vehicles/[id]/manage/documents': 'Giấy tờ xe',
  '/account/vehicles/[id]/manage/images': 'Ảnh xe',
  '/account/vehicles/[id]/manage/information': 'Thông tin xe',
  '/account/vehicles/[id]/manage/self-drive/delivery': 'Giao xe tận nơi',
  '/account/vehicles/[id]/manage/self-drive/handover-time': 'Giờ giao nhận xe tự lái',
  '/account/vehicles/[id]/manage/self-drive/optimization': 'Tối ưu nhận chuyến tự lái',
  '/account/vehicles/[id]/manage/self-drive/pricing': 'Giá xe tự lái',
  '/account/vehicles/[id]/manage/self-drive/terms': 'Điều kiện thuê tự lái',
  '/account/vehicles/[id]/manage/trip-history': 'Lịch sử chuyến theo xe',
  '/account/vehicles/[id]/manage/with-driver/optimization': 'Tối ưu chuyến có tài xế',
  '/account/vehicles/[id]/manage/with-driver/pricing': 'Giá xe có tài xế',
  '/account/vehicles/[id]/manage/with-driver/surcharges': 'Phụ phí xe có tài xế',
  '/account/vehicles/[id]/manage/with-driver/terms': 'Điều kiện thuê có tài xế',
  '/manage': 'Tổng quan gian hàng',
  '/manage/login': 'Đăng nhập khu quản lý',
  '/manage/onboarding': 'Thiết lập gian hàng ban đầu',
  '/manage/vehicles': 'Danh sách đội xe',
  '/manage/vehicles/new': 'Thêm xe',
  '/manage/vehicles/[id]': 'Hồ sơ xe 360',
  '/manage/vehicles/[id]/edit': 'Chỉnh sửa xe',
  '/manage/vehicles/[id]/pricing': 'Bảng giá xe',
  '/manage/calendar': 'Lịch đội xe',
  '/manage/booking-requests': 'Hộp thư yêu cầu thuê',
  '/manage/bookings': 'Danh sách đơn thuê',
  '/manage/bookings/[id]': 'Chi tiết đơn / giao nhận / quyết toán',
  '/manage/customers': 'Danh sách khách hàng',
  '/manage/customers/[id]': 'Hồ sơ khách hàng 360',
  '/manage/maintenance': 'Bảo dưỡng xe',
  '/manage/chat': 'Tin nhắn gian hàng',
  '/manage/contracts/[id]': 'Hợp đồng chuyến',
  '/manage/drivers': 'Tài xế',
  '/manage/members': 'Thành viên và quyền',
  '/manage/shop': 'Hồ sơ gian hàng',
  '/manage/shop/branches': 'Chi nhánh',
  '/manage/shop/policies': 'Chính sách cho thuê',
  '/manage/shop/seller-profile': 'Hồ sơ người bán',
  '/manage/shop/payment-settings': 'Cấu hình thu cọc',
  '/manage/finance': 'Tài chính gian hàng',
  '/manage/receipts': 'Sổ thu chi',
  '/manage/debts': 'Công nợ',
  '/manage/balance': 'Số dư và yêu cầu rút',
  '/manage/subscription': 'Gói thuê bao / thanh toán',
  '/manage/support': 'Hỗ trợ gian hàng',
  '/manage/support/cases': 'Danh sách vụ việc',
  '/manage/admin': 'Tổng quan Platform Admin',
  '/manage/admin/audit': 'Nhật ký thao tác',
  '/manage/admin/bank-transactions': 'Giao dịch ngân hàng / khớp tiền',
  '/manage/admin/bookings': 'Đơn thuê toàn sàn',
  '/manage/admin/catalog': 'Danh mục xe',
  '/manage/admin/customers': 'Người dùng toàn sàn',
  '/manage/admin/fee-policies': 'Chính sách phí / cọc / thuế',
  '/manage/admin/locations': 'Địa điểm',
  '/manage/admin/marketplace-banners': 'Banner marketplace',
  '/manage/admin/money': 'Tiền giữ hộ / hoàn / rút / đối soát',
  '/manage/admin/plans': 'Gói dịch vụ',
  '/manage/admin/sellers': 'Người bán / xác minh',
  '/manage/admin/staff': 'Nhân sự nền tảng',
  '/manage/admin/support': 'Hỗ trợ / tranh chấp',
  '/manage/admin/tenants': 'Gian hàng toàn sàn',
  '/manage/admin/vehicles': 'Kiểm duyệt xe / listing',
  '/manage/onboarding': 'Thiết lập gian hàng',
  '/manage/vehicles/[id]/edit/source': 'Nguồn xe',
  '/manage/vehicles/[id]/edit/media': 'Ảnh xe',
  '/manage/vehicles/[id]/edit/maintenance': 'Bảo dưỡng theo xe',
  '/manage/vehicles/[id]/edit/information': 'Thông tin xe',
  '/manage/vehicles/[id]/edit/documents': 'Giấy tờ xe',
  '/manage/bookings/new': 'Tạo đơn thuê',
  '/manage/bookings/[id]/settlement': 'Quyết toán đơn thuê',
  '/manage/bookings/[id]/payments': 'Thu tiền đơn thuê',
  '/manage/bookings/[id]/handover-photos': 'Ảnh giao nhận',
  '/manage/bookings/[id]/handover/[type]': 'Biên bản giao / nhận',
  '/manage/contracts/[id]': 'Hợp đồng chuyến',
  '/manage/vehicles/[id]/pricing': 'Giá xe gian hàng',
  '/manage/customers/[id]': 'Hồ sơ khách hàng',
  '/manage/vehicles/new': 'Thêm xe gian hàng',
  '/manage/receipts': 'Sổ thu chi gian hàng',
  '/manage/finance': 'Tổng quan tài chính',
  '/manage/debts': 'Công nợ gian hàng',
  '/manage/shop/branches': 'Chi nhánh gian hàng',
  '/manage/shop/policies': 'Chính sách thuê gian hàng',
  '/manage/vehicles': 'Danh sách xe gian hàng',
  '/manage/bookings': 'Danh sách đơn gian hàng',
  '/manage/booking-requests': 'Hộp thư yêu cầu gian hàng',
  '/manage/calendar': 'Lịch gian hàng',
  '/manage/customers': 'Danh sách khách hàng gian hàng',
  '/manage/drivers': 'Tài xế gian hàng',
  '/manage/members': 'Nhân viên gian hàng',
  '/manage/maintenance': 'Trung tâm bảo dưỡng',
  '/manage/support': 'Hỗ trợ gian hàng',
  '/manage/chat': 'Chat gian hàng',
  '/manage/shop': 'Hồ sơ gian hàng',
  '/manage/requests': 'Yêu cầu thuê gian hàng',
  '/manage/more': 'Danh mục quản lý',
  '/manage/index': 'Tổng quan gian hàng',
  '/explore': 'Khám phá xe',
};

const modules = [
  ['M00', 'Nền tảng thiết kế', 'Trong PA 50%', 1, 'Sitemap, token, component và mẫu màn hình dùng chung'],
  ['M01', 'Khám phá & đặt xe', 'Trong PA 50%', 2, 'Trang chủ, tìm kiếm, chi tiết xe, báo giá, yêu cầu thuê'],
  ['M02', 'Thanh toán & chuyến khách', 'Trong PA 50%', 3, 'Cọc QR, trạng thái tiền, chuyến, hủy/hoàn, chat/hỗ trợ'],
  ['M03', 'Owner Lite', 'Trong PA 50%', 4, 'Đăng xe, lịch, yêu cầu/chuyến, thu nhập và rút tiền'],
  ['M06', 'Admin giao dịch & tiền', 'Trong PA 50%', 5, 'Kiểm duyệt, giao dịch ngân hàng, hoàn/rút, đối soát, tranh chấp'],
  ['M04', 'Manage vận hành', 'Trong PA 50%', 6, 'Dashboard, đội xe, lịch, booking, giao nhận, khách'],
  ['M05', 'Manage kinh doanh', 'Trong PA 50%', 7, 'Gói, thu chi, công nợ, số dư, cấu hình gian hàng'],
  ['M09', 'Tài khoản & pháp lý', 'Trong PA 50%', 8, 'Auth, hồ sơ, cài đặt, thông báo và pháp lý'],
  ['M07', 'Admin cấu hình & nội dung', 'Chỉ PA toàn bộ', 9, 'Catalog, banner, địa điểm, kế hoạch, nhân sự, audit'],
  ['M08', 'Manage trên app', 'Chỉ PA toàn bộ', 10, 'Các màn Manage native đang có; quyết định giữ phạm vi'],
];
const moduleById = Object.fromEntries(modules.map((module) => [module[0], module]));

function templateFor(route) {
  if (/calendar/.test(route)) return 'Lịch';
  if (/chat|messages/.test(route)) return 'Hội thoại';
  if (/balance|earnings|payments|money|finance|receipts|debts|bank-transactions|subscription/.test(route)) return 'Tiền / số liệu';
  if (/\[id\]|\[slug\]|\[doc\]|\[token\]/.test(route)) return 'Chi tiết';
  if (/new|register|edit|settings|policies|pricing|information|terms|profile|login|password/.test(route)) return 'Biểu mẫu';
  if (/^\/$|\/explore$|\/manage$|\/account$|\/admin$/.test(route)) return 'Tổng quan';
  if (/legal|guide/.test(route)) return 'Nội dung';
  return 'Danh sách';
}

function webModule(route) {
  if (route.startsWith('/manage/admin/')) {
    return /money|bank-transactions|fee-policies|bookings|support|sellers|vehicles/.test(route) ? 'M06' : 'M07';
  }
  if (route === '/manage/admin') return 'M07';
  if (route.startsWith('/manage/')) {
    return /finance|receipts|debts|balance|subscription|shop|members/.test(route) ? 'M05' : 'M04';
  }
  if (route === '/manage') return 'M04';
  if (route.startsWith('/account/vehicles') || /\/account\/(calendar|earnings|balance|bank-accounts|tax|registration|subscription|host-guide|contracts-documents|messages)/.test(route)
      || route.startsWith('/list-your-vehicle')) return 'M03';
  if (route === '/' || /\/(search|listings|shops)(\/|$)/.test(route)) return 'M01';
  if (/^\/(trips|chat|support)(\/|$)/.test(route) || /\/account\/(payments|support)/.test(route)) return 'M02';
  return 'M09';
}

function mobileModule(route) {
  if (route === '/manage' || route.startsWith('/manage/')) return 'M08';
  if (route === '/explore' || /^\/(search|listings|shops)(\/|$)/.test(route)) return 'M01';
  if (/^\/(trips|chat)(\/|$)/.test(route)) return 'M02';
  return 'M09';
}

function focusFor(route, moduleId) {
  if (route === '/listings/[id]' || route === '/listings/[id]/request') return 'Ảnh xe, lịch trống, giá cuối, điều kiện thuê và CTA đặt xe';
  if (route === '/search') return 'Địa điểm, ngày giờ, loại xe, bộ lọc, kết quả và không có xe phù hợp';
  if (route === '/trips/[id]') return 'Timeline chuyến, thanh toán, hủy/hoàn, liên hệ và hỗ trợ';
  if (route === '/manage/admin/money') return 'Các tab giữ hộ, hoàn tiền, rút tiền, đối soát và trường hợp sai lệch';
  if (route === '/manage/admin/bank-transactions') return 'Khớp giao dịch, thiếu/thừa tiền, giao dịch chưa nhận diện';
  if (route === '/manage/bookings/[id]') return 'Trạng thái booking, bàn giao/trả xe, tiền và việc cần làm';
  if (route === '/manage/booking-requests') return 'Duyệt/từ chối yêu cầu, thời hạn phản hồi và cảnh báo trùng lịch';
  if (route === '/account/earnings' || route === '/account/balance') return 'Thu nhập theo chuyến, số khả dụng/đang rút và yêu cầu rút';
  if (route === '/manage/shop/payment-settings') return 'Công tắc thu cọc theo tuyến/gói, giải thích khi bị khóa';
  if (moduleId === 'M03') return 'Luồng chủ xe cá nhân 1–3 xe: thao tác chính, trạng thái, nâng cấp khi cần';
  if (moduleId === 'M01') return 'Tìm đúng xe, thông tin tin cậy, báo giá rõ và hành động đặt xe';
  if (moduleId === 'M02') return 'Trạng thái chuyến/thanh toán, hủy hoàn, liên hệ và trợ giúp đúng ngữ cảnh';
  if (moduleId === 'M04') return 'Tác vụ vận hành: thông tin cần nhìn trước, hành động chính, lỗi và thiếu quyền';
  if (moduleId === 'M05') return 'Giá trị và quyền theo gói; số tiền, kỳ hạn, lịch sử, trạng thái đọc được';
  if (moduleId === 'M06') return 'Hàng đợi xử lý, bằng chứng, quyền nhân sự và dấu vết thao tác';
  if (moduleId === 'M07') return 'Cấu hình/danh sách có lọc, phân trang, trạng thái và xác nhận thao tác';
  if (moduleId === 'M08') return 'Bố cục native, thao tác một tay, trạng thái mạng và quyền gian hàng';
  if (moduleId === 'M09') return 'Điều hướng, nội dung tiếng Việt/Anh, lỗi, trạng thái và quyền truy cập';
  return 'Khám phá, so sánh xe, thông tin tin cậy và hành động kế tiếp';
}

function actorFor(moduleId) {
  return {
    M00: 'Toàn sản phẩm',
    M01: 'Khách / chưa đăng nhập', M02: 'Khách thuê', M03: 'Chủ xe cơ bản',
    M04: 'Chủ / nhân viên gian hàng', M05: 'Chủ / quản lý gian hàng',
    M06: 'Admin / tài chính / hỗ trợ', M07: 'Platform Admin',
    M08: 'Chủ / nhân viên gian hàng', M09: 'Mọi tài khoản',
  }[moduleId];
}

function titleFor(route) {
  if (labels[route]) return labels[route];
  const segment = route.split('/').filter(Boolean).at(-1) || 'index';
  return segment.replace(/\[|\]/g, '').replace(/-/g, ' ');
}

let idCounter = 0;
function screen(surface, route, moduleId, presence = 'Có route trong source', custom = {}) {
  idCounter += 1;
  return {
    id: `S${String(idCounter).padStart(3, '0')}`,
    surface, actor: actorFor(moduleId), moduleId, module: moduleById[moduleId][1],
    title: custom.title || titleFor(route), route, focus: custom.focus || focusFor(route, moduleId),
    presence, template: custom.template || templateFor(route), priority: custom.priority ||
      (['M01', 'M02', 'M03', 'M06'].includes(moduleId) ? 'P0' : ['M04', 'M05', 'M09'].includes(moduleId) ? 'P1' : 'P2'),
    source: custom.source || '',
  };
}

const all = [];
const shared = [
  ['Sitemap và vai trò', 'Chốt điều hướng web/app, Owner Lite, Manage, Admin', 'Sơ đồ'],
  ['Design system', 'Giữ/chốt nhận diện, token màu/chữ/khoảng cách và component dùng chung', 'Bộ component'],
  ['Mẫu màn hình', 'Danh sách, chi tiết, form, dashboard, lịch, hội thoại và tiền', 'Bộ mẫu'],
  ['Trạng thái dùng chung', 'Loading, rỗng, lỗi, không quyền, đang xử lý, thành công, disabled có lý do', 'Trạng thái'],
  ['Responsive và native', 'Kích thước desktop/mobile web, vùng chạm, safe area, bàn phím và bottom sheet', 'Quy tắc'],
  ['Bàn giao kỹ thuật', 'Figma source, component variants, prototype, ghi chú nghiệp vụ và QA sau code', 'Bàn giao'],
];
for (const [title, focus, template] of shared) {
  all.push(screen('Dùng chung', 'Không có route', 'M00', 'Hạng mục dùng chung', { title, focus, template, priority: 'P0' }));
}
for (const route of webRoutes) all.push(screen('Web', route, webModule(route)));
for (const route of mobileRoutes) all.push(screen('App native', route, mobileModule(route)));

const embeddedFlows = [
  ['M01', 'Báo giá cuối / checkout', 'Trong /listings/[id] và yêu cầu thuê', 'Tổng chuyến, trả ngay, trả khi nhận; cọc, phí dịch vụ, bảo hiểm tách dòng', 'Tiền / biểu mẫu'],
  ['M01', 'Đăng nhập / xác minh khi đặt xe', 'Trong checkout + /login native', 'Khách chưa đăng nhập hoặc chưa xác minh vẫn trở lại đúng bước đặt xe', 'Auth / trạng thái'],
  ['M01', 'Biến thể loại chuyến', 'Trong tìm kiếm / chi tiết / yêu cầu thuê', 'Ô tô/xe máy, tự lái/có tài xế, dài hạn, giao tận nơi; chỉ hiện lựa chọn hợp lệ', 'Biến thể'],
  ['M02', 'Chờ thanh toán QR', 'Trong chi tiết chuyến / hold', 'QR, 2 chặng 60 phút, thiếu/thừa tiền, hết hạn và khớp chậm', 'Tiền / trạng thái'],
  ['M02', 'Hủy chuyến và số tiền hoàn', 'Trong /trips/[id]', 'Mốc hủy miễn phí, hủy muộn, người hủy và breakdown hoàn tiền', 'Tiền / xác nhận'],
  ['M02', 'Bảo hiểm: chờ cấp / đã cấp / lỗi', 'Trong chi tiết chuyến', 'Tách phí đã giữ với chứng nhận đã phát hành; hỗ trợ khi cấp lỗi', 'Trạng thái'],
  ['M02', 'Thanh toán/hold trên app', 'Chưa có route native riêng', 'Hoàn thiện luồng QR, trạng thái thanh toán và trở về chuyến trên app', 'Tiền / native'],
  ['M03', 'Owner Lite: duyệt yêu cầu', 'Trong /account và các luồng booking', 'Nhận/từ chối, thông báo, lịch và tiền thực nhận theo từng chuyến', 'Danh sách / chi tiết'],
  ['M03', 'Đăng xe và phản hồi kiểm duyệt', 'Trong /account/vehicles và /list-your-vehicle/register', 'Các bước đăng xe, nộp hồ sơ, bị yêu cầu bổ sung và xe được duyệt', 'Luồng / trạng thái'],
  ['M04', 'Giao nhận và phụ phí chuyến', 'Trong /manage/bookings/[id]', 'Chuyển trạng thái, biên bản/ảnh nếu dùng, phụ phí và quyết toán', 'Luồng / chi tiết'],
  ['M05', 'Mua/gia hạn gói gian hàng', 'Trong /manage/subscription', 'So sánh gói, VietQR, chờ đối soát, kích hoạt, hết hạn/read-only', 'Tiền / trạng thái'],
  ['M06', 'Admin: rút tiền và hoàn tiền', 'Tab trong /manage/admin/money', 'Hàng đợi, bằng chứng, duyệt/từ chối, đối soát, audit', 'Tiền / hàng đợi'],
  ['M06', 'Admin: đối soát 3 chiều', 'Tab trong /manage/admin/money', 'Số ngân hàng, tiền nền tảng, tiền giữ hộ, chênh lệch và cảnh báo', 'Tiền / bảng'],
  ['M06', 'Admin: ngoại lệ bảo hiểm / thuế', 'Trong /manage/admin/money và /manage/admin/support', 'Case phát hành lỗi, trạng thái chứng nhận, bằng chứng và người xử lý', 'Hàng đợi / chi tiết'],
  ['M08', 'Đổi khu Customer / Manage trên app', 'Trong app shell', 'Điểm vào/ra khu quản lý, mất quyền giữa phiên và ngữ cảnh gian hàng', 'Điều hướng native'],
  ['M09', 'Cài đặt thông báo app', 'Chưa có route native riêng', 'Bật/tắt loại thông báo; trạng thái quyền hệ điều hành', 'Biểu mẫu / native'],
];
for (const [moduleId, title, route, focus, template] of embeddedFlows) {
  const presence = route.startsWith('Chưa') ? 'Roadmap: còn thiếu' : 'Luồng trong màn có sẵn';
  all.push(screen(route.includes('app') || route.includes('native') ? 'App native' : 'Web + App', route, moduleId, presence,
    { title, focus, template, priority: 'P0' }));
}

const selectedWebRoutes = new Set([
  '/', '/search', '/listings/[id]', '/shops/[slug]', '/trips', '/trips/[id]', '/chat',
  '/account', '/account/registration', '/account/vehicles', '/account/vehicles/[id]',
  '/account/vehicles/[id]/manage', '/account/vehicles/[id]/manage/information',
  '/account/vehicles/[id]/manage/images', '/account/vehicles/[id]/manage/self-drive/pricing',
  '/account/calendar', '/account/earnings', '/account/balance', '/account/bank-accounts',
  '/account/payments', '/account/support', '/account/subscription', '/list-your-vehicle', '/list-your-vehicle/register',
  '/account/vehicles/[id]/manage/documents', '/account/vehicles/[id]/manage/trip-history', '/support',
  '/manage', '/manage/booking-requests', '/manage/bookings', '/manage/bookings/[id]',
  '/manage/calendar', '/manage/vehicles', '/manage/maintenance', '/manage/finance', '/manage/subscription',
  '/manage/admin/money', '/manage/admin/bank-transactions', '/manage/admin/fee-policies',
  '/manage/admin/support', '/manage/admin/sellers', '/manage/admin/vehicles',
  '/manage/vehicles/new', '/manage/vehicles/[id]', '/manage/vehicles/[id]/pricing',
  '/manage/customers', '/manage/customers/[id]', '/manage/receipts', '/manage/debts',
  '/manage/balance', '/manage/shop', '/manage/shop/payment-settings', '/manage/shop/policies',
  '/manage/members', '/manage/support/cases', '/manage/admin/bookings',
]);
const selectedMobileRoutes = new Set([
  '/explore', '/search', '/listings/[id]', '/listings/[id]/request', '/shops/[slug]',
  '/trips', '/trips/[id]', '/chat', '/chat/[id]', '/account', '/login', '/register',
]);

const partial = all.filter((row) => row.moduleId === 'M00' ||
  (row.surface === 'Web' && selectedWebRoutes.has(row.route)) ||
  (row.surface === 'App native' && selectedMobileRoutes.has(row.route)) ||
  ((row.presence === 'Luồng trong màn có sẵn' || row.presence === 'Roadmap: còn thiếu')
    && row.moduleId !== 'M08' && row.title !== 'Cài đặt thông báo app'));
partial.sort((a, b) => moduleById[a.moduleId][3] - moduleById[b.moduleId][3] || a.id.localeCompare(b.id));

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function colName(index) {
  let name = '';
  for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
function cell(value, address, style = 0) {
  if (typeof value === 'number') return `<c r="${address}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${address}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}
function sheetXml(rows, widths, { filters = true, freeze = 1, freezeCols = 0, validations = [] } = {}) {
  const maxCol = colName(rows[0].length - 1);
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
  xml += `<dimension ref="A1:${maxCol}${rows.length}"/><sheetViews><sheetView workbookViewId="0">`;
  if (freeze || freezeCols) {
    const activePane = freeze && freezeCols ? 'bottomRight' : freezeCols ? 'topRight' : 'bottomLeft';
    xml += `<pane ${freezeCols ? `xSplit="${freezeCols}" ` : ''}${freeze ? `ySplit="${freeze}" ` : ''}topLeftCell="${colName(freezeCols)}${freeze + 1}" activePane="${activePane}" state="frozen"/>`;
  }
  xml += '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/>';
  xml += '<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>';
  xml += '<sheetData>';
  rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    xml += `<row r="${rowNumber}" ht="${rowIndex === 0 ? 32 : 34}" customHeight="1">`;
    row.forEach((value, index) => {
      const isEditable = rowIndex > 0 && /^(Quyết định|Ghi chú|Link Figma|Người phụ trách|Ngày chốt|Trạng thái trao đổi|Luồng \/ trang liên kết|Đề xuất cải tiến|Chức năng thiếu \/ cần sửa|Mốc bàn giao|Bắt đầu dự kiến|Bàn giao dự kiến|Mốc duyệt)$/.test(rows[0][index]);
      xml += cell(value, `${colName(index)}${rowNumber}`, rowIndex === 0 ? 1 : isEditable ? 3 : rowIndex % 2 ? 0 : 2);
    });
    xml += '</row>';
  });
  xml += '</sheetData>';
  if (filters) xml += `<autoFilter ref="A1:${maxCol}${rows.length}"/>`;
  if (validations.length) {
    xml += `<dataValidations count="${validations.length}">`;
    for (const validation of validations) {
      xml += `<dataValidation type="list" allowBlank="1" showInputMessage="1" sqref="${validation.column}2:${validation.column}${rows.length}"><formula1>"${esc(validation.options.join(','))}"</formula1></dataValidation>`;
    }
    xml += '</dataValidations>';
  }
  xml += '<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>';
  xml += '</worksheet>';
  return xml;
}

const discussionColumns = ['Quyết định', 'Trạng thái trao đổi', 'Người phụ trách', 'Ngày chốt', 'Link Figma', 'Ghi chú',
  'Luồng / trang liên kết', 'Đề xuất cải tiến', 'Chức năng thiếu / cần sửa', 'Mốc bàn giao'];
const inventoryHeaders = ['ID', 'Bề mặt', 'Vai trò', 'Mã module', 'Module', 'Màn hình / chức năng', 'Route tham chiếu',
  'Việc designer cần làm', 'Hiện trạng nguồn', 'Mẫu màn', 'Ưu tiên', ...discussionColumns];
const inventoryRows = [inventoryHeaders, ...all.map((row) => [row.id, row.surface, row.actor, row.moduleId, row.module,
  row.title, row.route, row.focus, row.presence, row.template, row.priority, '', 'Chưa trao đổi', '', '', '', '', '', '', '', ''])];
const partialHeaders = ['Thứ tự', 'Đợt', ...inventoryHeaders];
const partialRows = [partialHeaders, ...partial.map((row) => [moduleById[row.moduleId][3], moduleById[row.moduleId][2],
  row.id, row.surface, row.actor, row.moduleId, row.module, row.title, row.route, row.focus, row.presence,
  row.template, row.priority, '', 'Chưa trao đổi', '', '', '', '', '', '', '', ''])];
const moduleRows = [['Thứ tự', 'Đợt đề xuất', 'Mã module', 'Module', 'Phạm vi', 'Số dòng trong PA1', 'Số dòng trong PA2',
  'Đầu ra để nghiệm thu', 'Quyết định', 'Trạng thái trao đổi', 'Người phụ trách', 'Ngày chốt', 'Ghi chú',
  'Bắt đầu dự kiến', 'Bàn giao dự kiến', 'Mốc duyệt']];
for (const [id, name, wave, order, scope] of modules) {
  moduleRows.push([order, wave, id, name, scope, all.filter((row) => row.moduleId === id).length,
    partial.filter((row) => row.moduleId === id).length,
    'Flow + Figma mẫu màn + trạng thái + responsive/native + bàn giao', '', 'Chưa trao đổi', '', '', '', '', '', '']);
}

const guideRows = [
  ['Mục', 'Nội dung'],
  ['Mục đích', 'Hai phương án để thảo luận với designer: thuê toàn bộ hoặc khoảng 50% màn/module chính. KHÔNG có giá hoặc dự toán giờ.'],
  ['PA1_Toan_bo', `Toàn bộ route trong source hiện tại: ${webRoutes.length} web + ${mobileRoutes.length} app, thêm hạng mục dùng chung và luồng nằm trong màn/chưa có route.`],
  ['PA2_50pct', `${partial.length}/${all.length} dòng được chọn theo tác động nghiệp vụ, xấp xỉ 50% danh sách. Thứ tự module và mốc 15 ngày là đề xuất mở để designer phản hồi.`],
  ['Module_uu_tien', 'Tổng hợp thứ tự, phạm vi và số dòng từng module trong hai phương án.'],
  ['Cau_hoi_chot', 'Câu hỏi cần chốt về phạm vi, thời hạn, luồng thao tác, liên kết trang, ý tưởng, nghiệm thu và thay đổi staging.'],
  ['Luong_thao_tac', 'Luồng đề xuất theo vai trò, gồm điểm vào, các bước, kết quả và nhánh lỗi. Đây là đề bài để designer kiểm tra trên staging, không phải xác nhận mọi link đã chạy.'],
  ['Lien_ket_trang', 'Các nút/đường chuyển màn cần có trong prototype; cột hiện trạng staging để trống cho designer kiểm chứng.'],
  ['Y_tuong_UX', 'Đề xuất cụ thể để designer đánh giá, nhận/chỉnh/bỏ; tính năng mới cần được PO và kỹ thuật chốt trước khi thêm vào phạm vi.'],
  ['Tien_do_15_ngay', 'Hai lịch gợi ý cho phương án toàn bộ và 50%. Mốc 15 ngày là mục tiêu thương lượng, designer điền cam kết và điều kiện bàn giao.'],
  ['Mốc 15 ngày', 'Mục tiêu để trao đổi cho cả hai phương án. Thứ tự gợi ý: audit/system → khách đặt xe/thanh toán → Owner Lite → Admin tiền/Manage → review/bàn giao. Designer điền lịch cam kết cụ thể theo module.'],
  ['PA1 trong 15 ngày', 'Nếu chọn toàn bộ, chốt rõ mức chi tiết: một bộ mẫu/component áp dụng cho mọi route, các flow quan trọng có prototype riêng, và danh sách ngoại lệ phải vẽ riêng.'],
  ['Hiện trạng nguồn', '“Có route trong source” không bảo đảm màn đã chạy trên staging. Cần designer/PO kiểm tra phiên bản staging tại ngày kickoff.'],
  ['Quyết định', 'Điền Thuê / Để sau / Loại bỏ cho từng dòng. Để trống nếu chưa chốt. Các cột liên kết luồng, ý tưởng và chức năng thiếu cũng để điền khi trao đổi.'],
  ['Trạng thái trao đổi', 'Điền Chưa trao đổi / Cần làm rõ / Đã chốt / Đã bàn giao.'],
  ['Nguồn tham chiếu', 'docs/completion-roadmap.md; docs/design/02_PRODUCT_VISION.md; 07_INFORMATION_ARCHITECTURE.md; 09_PRODUCT_FLOWS_AND_BUSINESS_RULES.md.'],
  ['Cập nhật staging', 'Ghi ngày/commit staging dùng làm mốc, ghi thay đổi mới ở cột Ghi chú; đổi scope phải được PO chốt.'],
  ['Tài khoản demo', 'Xem docs/design/12_DESIGNER_STAGING_ACCESS.md; không chép mật khẩu vào workbook.'],
  ['Lưu ý nội dung', 'Các con số thuế/bảo hiểm trong tài liệu cũ có thể lệch policy mới; designer chỉ mô tả theo policy đã được PO duyệt.'],
  ['Cách hiểu 50%', '88/176 là một nửa số dòng kiểm kê, không phải phép đo chính xác một nửa công sức; các màn hình tiền và lịch có độ phức tạp khác nhau.'],
];

const discussionRows = [
  ['Chủ đề', 'Cần chốt với designer', 'Phương án toàn bộ', 'Phương án ~50%', 'Designer đề xuất', 'Bạn quyết định', 'Bắt đầu', 'Bàn giao', 'Ghi chú'],
  ['Phạm vi', 'Chốt phương án và danh sách dòng được thuê/để sau/loại bỏ', `${all.length} dòng; mọi module`, `${partial.length} dòng; ưu tiên luồng chính`, '', '', '', '', ''],
  ['Thời hạn', 'Ngày bắt đầu, ngày bàn giao từng đợt, ngày bàn giao cuối', 'Mục tiêu thảo luận: 15 ngày', 'Mục tiêu thảo luận: 15 ngày', '', '', '', '', ''],
  ['Cách tính thời hạn', '15 ngày lịch hay 15 ngày làm việc; ngày nào dành cho bạn/dev phản hồi?', 'Cần chốt trước khi cam kết', 'Cần chốt trước khi cam kết', '', '', '', '', ''],
  ['Mức chi tiết', 'Mỗi route có frame riêng hay áp dụng mẫu màn chung; màn ngoại lệ nào cần vẽ riêng?', 'Mọi route có mapping tới Figma', 'Màn/luồng được thuê có frame và trạng thái rõ', '', '', '', '', ''],
  ['Luồng thao tác', 'Điểm bắt đầu/kết thúc, bước, nhánh lỗi và hành động kế tiếp của mỗi vai trò', 'Bao phủ mọi module', 'Ưu tiên khách đặt xe, thanh toán/chuyến, Owner Lite', '', '', '', '', ''],
  ['Liên kết trang', 'Prototype nhấp được qua các trang, quay lại đúng ngữ cảnh, không có nút chết', 'Luồng chính mọi bề mặt', 'Luồng chính trong danh sách 50%', '', '', '', '', ''],
  ['Chức năng', 'Đề xuất sửa/chốt thao tác chưa khép kín; phân biệt UX với tính năng mới cần dev', 'Ghi cho mọi module', 'Ghi cho module được thuê', '', '', '', '', ''],
  ['Ý tưởng cải tiến', 'Designer đề xuất thứ tự thông tin, giảm bước, cách giải thích tiền và tăng tin cậy', 'Danh sách ý tưởng có mức ưu tiên', 'Ý tưởng cho các luồng chính', '', '', '', '', ''],
  ['Trạng thái màn', 'Có dữ liệu, rỗng, loading, lỗi, thiếu quyền, hết hạn, thanh toán thiếu/thừa, thao tác thành công', 'Áp dụng toàn bộ', 'Áp dụng màn được thuê', '', '', '', '', ''],
  ['Web và app', 'Desktop, mobile web, app native; màn nào dùng chung ý tưởng, màn nào cần cách tương tác khác', 'Web + toàn bộ app', 'Theo màn đã chọn trong PA2', '', '', '', '', ''],
  ['Nội dung', 'Tên nút, thông báo lỗi, số tiền, thời gian, tiếng Việt/Anh; ai duyệt nội dung nghiệp vụ?', 'Có hướng dẫn nội dung', 'Có hướng dẫn cho luồng chính', '', '', '', '', ''],
  ['Hệ thiết kế', 'Giữ hay đổi logo/màu/font/token/component; quyền chỉnh Figma gốc', 'Bộ dùng chung toàn sản phẩm', 'Bộ nền đủ mở rộng sau', '', '', '', '', ''],
  ['Bản staging', 'Chốt ngày/commit tham chiếu và tài khoản theo vai trò; cách ghi thay đổi mới', 'Một baseline + changelog', 'Một baseline + changelog', '', '', '', '', ''],
  ['Phản hồi & sửa', 'Ai duyệt nghiệp vụ, ai duyệt kỹ thuật, lịch review và số vòng sửa', 'Theo mốc module', 'Theo mốc module', '', '', '', '', ''],
  ['Bàn giao dev', 'Figma source, component/variant, prototype, kích thước, tương tác, trạng thái và ghi chú', 'Mỗi module có bàn giao', 'Mỗi module được thuê có bàn giao', '', '', '', '', ''],
  ['QA sau code', 'Designer so sánh UI đã triển khai với Figma và ghi lỗi cần sửa', 'Có vòng nghiệm thu', 'Có vòng nghiệm thu', '', '', '', '', ''],
  ['Quyền sở hữu', 'File Figma, asset và quyền sử dụng sau khi kết thúc hợp tác', 'Bàn giao cho XePrime', 'Bàn giao cho XePrime', '', '', '', '', ''],
];

const flowSpecs = [
  ['F01', 'Khách', 'Khám phá và chọn xe', 'Web /; App /explore', '/search → /listings/[id] → báo giá', 'Chọn được xe, ngày giờ và tổng giá', 'Không có xe, thiếu lịch, giá tạm tính', 'Giữ bộ lọc khi quay lại; cho so sánh tổng giá', 'Có'],
  ['F02', 'Khách', 'Đặt xe và xác thực', 'Chi tiết xe', 'Báo giá → yêu cầu thuê → đăng nhập/xác minh nếu cần → gửi yêu cầu', 'Yêu cầu được ghi nhận', 'Lỗi form, hết phiên, lịch vừa bị đặt', 'Quay lại đúng bước và dữ liệu đã nhập', 'Có'],
  ['F03', 'Khách + chủ xe', 'Duyệt yêu cầu và giữ lịch', 'Yêu cầu đã gửi', 'Chủ xe/gian hàng duyệt hoặc tự nhận → phân nhánh có/không cọc theo policy', 'Yêu cầu được chấp nhận hoặc từ chối', 'Từ chối, trùng lịch, hết thời hạn xử lý', 'Mỗi bên thấy việc cần làm tiếp theo', 'Có'],
  ['F04', 'Khách', 'Thanh toán QR / cọc khi policy yêu cầu', 'Chi tiết chuyến sau duyệt', 'Bảng tiền → QR → chờ khớp → xác nhận', 'Khách biết đã thanh toán hay cần xử lý', 'Thiếu/thừa tiền, sai mã, khớp chậm, hết 2 giờ', 'Hai chặng 60 phút; tổng tiền và nguồn nhận từng khoản rõ', 'Có'],
  ['F05', 'Khách', 'Theo dõi chuyến', '/trips hoặc App /trips', 'Danh sách → chi tiết → liên hệ → nhận xe → trả xe → đánh giá', 'Hoàn thành chuyến', 'Đổi giờ, không đến, sự cố, chưa được mở liên hệ', 'Timeline một dòng với CTA phù hợp trạng thái', 'Có'],
  ['F06', 'Khách', 'Hủy và hoàn tiền', 'Chi tiết chuyến', 'Xem chính sách → xem trước số hoàn → xác nhận → theo dõi hoàn', 'Biết đã hủy và tiền sẽ về đâu', 'Hủy miễn phí/muộn, lỗi hoàn, chưa thanh toán', 'Hiển thị mốc thời gian và breakdown từ server', 'Có'],
  ['F07', 'Khách', 'Hỗ trợ / tranh chấp theo chuyến', 'Chi tiết chuyến', 'Mở hỗ trợ → chọn vấn đề → gửi bằng chứng → theo dõi case', 'Có trạng thái và đầu mối xử lý', 'Không thể tải bằng chứng, case trùng', 'Gắn case với booking, tránh form hỗ trợ chung mất ngữ cảnh', 'Có'],
  ['F08', 'Chủ xe cơ bản', 'Đăng ký chủ xe và đăng xe', '/account hoặc /list-your-vehicle', 'Chọn tuyến → hồ sơ chủ xe → thông tin/ảnh/giấy tờ xe → gửi duyệt', 'Biết bước còn thiếu và trạng thái duyệt', 'Bị yêu cầu bổ sung, thiếu ảnh, xe vượt giới hạn', 'Checklist ngắn cho cá nhân 1–3 xe', 'Có'],
  ['F09', 'Chủ xe cơ bản', 'Xử lý yêu cầu/chuyến', '/account', 'Thông báo/yêu cầu → duyệt → xem lịch/chuyến → giao nhận tối thiểu', 'Chuyến chạy và kết thúc đúng trạng thái', 'Trùng lịch, quá hạn phản hồi, khách hủy', 'Một vùng Việc cần làm, không bắt buộc quy trình đội xe', 'Có'],
  ['F10', 'Chủ xe cơ bản', 'Thu nhập và rút tiền', '/account/earnings', 'Xem tiền từng chuyến → số dư → thêm ngân hàng → yêu cầu rút → xem trạng thái', 'Biết số khả dụng, đang rút, đã chi', 'Thiếu tài khoản, yêu cầu bị từ chối', 'Không gộp tiền cọc, phí dịch vụ và số phải trả', 'Có'],
  ['F11', 'Gian hàng', 'Mua/gia hạn gói', '/manage/subscription', 'So sánh gói → VietQR → chờ khớp → kích hoạt/gia hạn', 'Biết gói và ngày hiệu lực', 'Thiếu/thừa tiền, hết gói, quyền chỉ đọc', 'Tách quyết định mua gói khỏi tác vụ vận hành hằng ngày', 'Có'],
  ['F12', 'Gian hàng', 'Vận hành đội xe và booking', '/manage', 'Dashboard → yêu cầu → lịch → chi tiết đơn → giao/trả → quyết toán', 'Nhân viên biết việc tiếp theo và trách nhiệm', 'Trùng lịch, thiếu quyền, giao nhận lệch thực tế', 'Dùng thông tin quan trọng ở đầu màn; giữ ngữ cảnh xe/đơn', 'Có'],
  ['F13', 'Gian hàng', 'Theo dõi tài chính', '/manage/finance', 'Tổng quan → thu chi/công nợ → số dư/gói', 'Đọc được nguồn và trạng thái từng khoản', 'Số liệu rỗng, điều chỉnh, giao dịch ngoài nền tảng', 'Phân biệt sổ vận hành gian hàng với tiền XePrime giữ', 'Có'],
  ['F14', 'Platform Admin', 'Duyệt người bán/xe', '/manage/admin', 'Hàng đợi → hồ sơ/bằng chứng → duyệt hoặc yêu cầu bổ sung → audit', 'Người bán/xe có kết quả rõ', 'Thiếu hồ sơ, lý do từ chối, quyền reviewer', 'Một hàng đợi theo việc cần xử lý, hiển thị lý do', 'Có'],
  ['F15', 'Finance Admin', 'Khớp tiền và đối soát', '/manage/admin/bank-transactions', 'Giao dịch → gợi ý khớp → xem tiền giữ hộ → đối soát ngày', 'Lệch tiền được phát hiện và giao người xử lý', 'Sai mã, thiếu/thừa/trùng, lệch số dư', 'Ưu tiên ngoại lệ và bằng chứng, tránh giấu số chưa khớp', 'Có'],
  ['F16', 'Finance Admin', 'Hoàn/rút tiền', '/manage/admin/money', 'Hàng đợi → kiểm bằng chứng → duyệt/từ chối → cập nhật trạng thái chi', 'Người dùng biết kết quả và thời hạn', 'Lỗi chuyển tay, thao tác lại, thiếu quyền', 'Tách rõ số khả dụng/đang rút/đã trả', 'Có'],
  ['F17', 'Support', 'Xử lý tranh chấp/ngoại lệ bảo hiểm', '/manage/admin/support', 'Case → booking/tiền/chứng nhận → liên hệ → xử lý → đóng', 'Case có trạng thái, chủ xử lý và dấu vết', 'Bảo hiểm phát hành lỗi, thiếu bằng chứng', 'Một trang case nối các dữ liệu liên quan', 'Có'],
  ['F18', 'Mọi tài khoản', 'Tài khoản và pháp lý', '/account', 'Hồ sơ → bảo mật/thông báo/chính sách → quay lại tác vụ', 'Người dùng hiểu quyền và cài đặt', 'Lỗi xác minh, thiếu quyền, xóa tài khoản', 'Nhóm theo nhu cầu, không để menu placeholder', 'Chỉ toàn bộ'],
  ['F19', 'Platform Admin', 'Cấu hình marketplace', '/manage/admin', 'Danh mục/banner/địa điểm/gói → xem trước → lưu → audit', 'Cấu hình có hiệu lực kiểm soát được', 'Sai dữ liệu, thiếu quyền, phiên bản cũ', 'Có preview và lý do thay đổi', 'Chỉ toàn bộ'],
  ['F20', 'Gian hàng trên app', 'Đổi khu Customer/Manage', 'App /account', 'Đổi khu → dashboard Manage → tác vụ → quay lại khu khách', 'Không lẫn tài khoản/gian hàng', 'Mất quyền giữa phiên, app offline', 'Điểm vào rõ và giữ ngữ cảnh', 'Chỉ toàn bộ'],
  ['F21', 'Khách + gian hàng', 'Gian hàng tắt thu cọc', 'Yêu cầu được gian hàng duyệt', 'Bỏ bước QR giữ chỗ → xem booking → gian hàng liên hệ thỏa thuận cọc trực tiếp', 'Hai bên hiểu XePrime không thu/đối soát khoản cọc ngoài hệ thống', 'Gian hàng đổi công tắc sau khi booking đã tạo', 'Nêu rõ tiền nào thuộc giao dịch ngoài nền tảng và policy của booking đã chốt', 'Có'],
];
const flowRows = [['ID', 'Vai trò', 'Luồng thao tác', 'Điểm vào', 'Các bước / trang liên kết cần thiết kế', 'Kết quả cần đạt',
  'Nhánh lỗi/ngoại lệ', 'Đề xuất UX ban đầu', 'Áp dụng PA 50%', 'Designer chỉnh / bổ sung', 'Quyết định PO', 'Link Figma', 'Mốc bàn giao'],
  ...flowSpecs.map((row) => [...row, '', '', '', ''])];

const linkSpecs = [
  ['Web', 'M01', '/', 'Tìm xe', '/search', 'Có'],
  ['Web', 'M01', '/search', 'Chọn xe', '/listings/[id]', 'Có'],
  ['Web', 'M01', '/listings/[id]', 'Xem gian hàng', '/shops/[slug]', 'Có'],
  ['Web', 'M01', '/listings/[id]', 'Yêu cầu thuê', 'Checkout trong chi tiết xe', 'Có'],
  ['Web', 'M01', 'Checkout trong chi tiết xe', 'Cần đăng nhập', 'Auth rồi quay lại checkout', 'Có'],
  ['Web', 'M02', 'Yêu cầu đã gửi', 'Theo dõi kết quả', '/trips/[id]', 'Có'],
  ['Web', 'M02', '/trips/[id]', 'Thanh toán ngay', 'QR / chờ khớp trong chi tiết chuyến', 'Có'],
  ['Web', 'M02', 'Yêu cầu được gian hàng duyệt', 'Policy không thu cọc', '/trips/[id] không qua QR giữ chỗ', 'Có'],
  ['Web', 'M02', '/trips/[id]', 'Hủy chuyến', 'Xem trước hoàn / xác nhận hủy', 'Có'],
  ['Web', 'M02', '/trips/[id]', 'Liên hệ', '/chat', 'Có'],
  ['Web', 'M02', '/trips/[id]', 'Yêu cầu hỗ trợ', '/account/support', 'Có'],
  ['Web', 'M02', '/trips/[id]', 'Xem thanh toán', '/account/payments', 'Có'],
  ['App native', 'M01', '/explore', 'Tìm xe', '/search', 'Có'],
  ['App native', 'M01', '/search', 'Chọn xe', '/listings/[id]', 'Có'],
  ['App native', 'M01', '/listings/[id]', 'Gửi yêu cầu', '/listings/[id]/request', 'Có'],
  ['App native', 'M01', '/listings/[id]/request', 'Cần đăng nhập', '/login rồi quay lại yêu cầu', 'Có'],
  ['App native', 'M02', '/listings/[id]/request', 'Đã gửi', '/trips/[id]', 'Có'],
  ['App native', 'M02', '/trips/[id]', 'Trả cọc', 'QR/hold native cần hoàn thiện', 'Có'],
  ['App native', 'M02', '/trips/[id]', 'Nhắn tin', '/chat/[id]', 'Có'],
  ['Web', 'M03', '/list-your-vehicle', 'Bắt đầu đăng xe', '/list-your-vehicle/register', 'Có'],
  ['Web', 'M03', '/account', 'Đăng ký chủ xe', '/account/registration', 'Có'],
  ['Web', 'M03', '/account/registration', 'Quản lý xe', '/account/vehicles', 'Có'],
  ['Web', 'M03', '/account/vehicles', 'Mở xe', '/account/vehicles/[id]/manage', 'Có'],
  ['Web', 'M03', '/account/vehicles/[id]/manage', 'Sửa ảnh/thông tin/giá', 'Các tab cấu hình xe', 'Có'],
  ['Web', 'M03', '/account', 'Xem tiền của tôi', '/account/earnings', 'Có'],
  ['Web', 'M03', '/account/earnings', 'Xem số dư', '/account/balance', 'Có'],
  ['Web', 'M03', '/account/balance', 'Thêm tài khoản nhận tiền', '/account/bank-accounts', 'Có'],
  ['Web', 'M04', '/manage', 'Xử lý yêu cầu', '/manage/booking-requests', 'Có'],
  ['Web', 'M04', '/manage/booking-requests', 'Mở đơn', '/manage/bookings/[id]', 'Có'],
  ['Web', 'M04', '/manage/bookings/[id]', 'Xem lịch xe', '/manage/calendar', 'Có'],
  ['Web', 'M04', '/manage/vehicles', 'Mở hồ sơ xe', '/manage/vehicles/[id]', 'Có'],
  ['Web', 'M04', '/manage/bookings/[id]', 'Xem khách', '/manage/customers/[id]', 'Có'],
  ['Web', 'M05', '/manage', 'Xem tài chính', '/manage/finance', 'Có'],
  ['Web', 'M05', '/manage/finance', 'Xem thu chi', '/manage/receipts', 'Có'],
  ['Web', 'M05', '/manage/finance', 'Xem số dư', '/manage/balance', 'Có'],
  ['Web', 'M05', '/manage/shop', 'Cấu hình cọc', '/manage/shop/payment-settings', 'Có'],
  ['Web', 'M05', '/manage', 'Xem/mua gói', '/manage/subscription', 'Có'],
  ['Web', 'M06', '/manage/admin', 'Duyệt người bán', '/manage/admin/sellers', 'Có'],
  ['Web', 'M06', '/manage/admin', 'Duyệt xe', '/manage/admin/vehicles', 'Có'],
  ['Web', 'M06', '/manage/admin/bank-transactions', 'Xem đối soát', '/manage/admin/money', 'Có'],
  ['Web', 'M06', '/manage/admin/money', 'Mở case cần xử lý', '/manage/admin/support', 'Có'],
  ['Web', 'M07', '/manage/admin', 'Cấu hình danh mục/banner', '/manage/admin/catalog; /manage/admin/marketplace-banners', 'Chỉ toàn bộ'],
  ['App native', 'M08', '/account', 'Vào khu quản lý', '/manage', 'Chỉ toàn bộ'],
];
const linkRows = [['ID', 'Bề mặt', 'Module', 'Từ màn / route', 'Nút / sự kiện', 'Đến màn / route đề xuất', 'Áp dụng PA 50%',
  'Hiện trạng trên staging', 'Designer đề xuất sửa', 'Quyết định PO', 'Link Figma'],
  ...linkSpecs.map((row, index) => [`L${String(index + 1).padStart(2, '0')}`, ...row, '', '', '', ''])];

const ideaSpecs = [
  ['Khách / checkout', 'Khó biết mình trả bao nhiêu ngay và còn bao nhiêu lúc nhận xe', 'Một bảng tiền 3 dòng nổi bật: tổng chuyến, trả QR ngay, trả trực tiếp khi nhận', 'Giảm hiểu nhầm giá', 'Có'],
  ['Khách / kết quả tìm', 'Quay lại từ chi tiết dễ mất bộ lọc', 'Giữ địa điểm, thời gian, loại xe và vị trí cuộn khi quay lại', 'So sánh xe nhanh hơn', 'Có'],
  ['Khách / ảnh xe', 'Ảnh thiếu chuẩn làm giảm tin cậy', 'Quy chuẩn ảnh/placeholder và tín hiệu hồ sơ xe đã kiểm tra', 'Tăng độ tin cậy', 'Có'],
  ['Khách / cọc QR', 'Chờ khớp tiền dễ tưởng đã mất đơn', 'Trạng thái thanh toán có mốc thời gian, số tiền còn thiếu và hành động tiếp theo', 'Giảm hỗ trợ thủ công', 'Có'],
  ['Khách / gian hàng tắt cọc', 'Khách dễ tưởng XePrime bảo vệ khoản cọc trả trực tiếp', 'Màn booking nói rõ gian hàng sẽ liên hệ thỏa thuận và XePrime không thu/đối soát khoản đó', 'Giảm hiểu nhầm về trách nhiệm', 'Có'],
  ['Khách / hủy', 'Không biết số tiền hoàn trước khi xác nhận', 'Màn xem trước tiền hoàn theo snapshot server, ghi rõ mốc hủy', 'Quyết định có thông tin', 'Có'],
  ['Khách / chuyến', 'Nhiều trạng thái nhưng thiếu hướng dẫn việc kế tiếp', 'Timeline với một CTA chính theo trạng thái và ngữ cảnh liên hệ', 'Giảm bước tìm kiếm', 'Có'],
  ['Chủ xe cơ bản', 'Một chủ 1–3 xe không cần menu dày như gian hàng', 'Tổng quan Việc hôm nay: yêu cầu, chuyến, tiền sắp nhận', 'Xử lý chuyến nhanh', 'Có'],
  ['Chủ xe / đăng xe', 'Bị trả hồ sơ nhưng không rõ sửa ở đâu', 'Checklist thiếu mục nào, mở đúng bước để sửa và gửi lại', 'Tăng xe được duyệt', 'Có'],
  ['Gian hàng / booking', 'Đơn, lịch, xe và khách nằm ở nhiều trang', 'Các liên kết theo ngữ cảnh từ đơn tới lịch/xe/khách, giữ bộ lọc', 'Giảm thao tác vận hành', 'Có'],
  ['Gian hàng / tài chính', 'Dễ nhầm sổ thu chi với số XePrime phải trả', 'Hai nhãn và bảng số liệu tách nguồn tiền, trạng thái rõ', 'Giảm sai lệch nhận thức', 'Có'],
  ['Admin / tiền', 'Ngoại lệ khó ưu tiên xử lý', 'Hàng đợi theo mức khẩn, lý do lệch, bằng chứng và người phụ trách', 'Rút ngắn thời gian xử lý', 'Có'],
  ['Admin / duyệt', 'Thiếu lý do từ chối/bổ sung gây qua lại', 'Mẫu lý do rõ, checklist hồ sơ và liên kết quay lại đúng case', 'Giảm vòng duyệt', 'Có'],
  ['Toàn sản phẩm', 'Nút/link có thể dẫn tới màn chưa hoàn thiện', 'Kiểm kê mọi CTA, link đích và trạng thái thiếu quyền/hết gói', 'Không có nút chết', 'Có'],
  ['Toàn sản phẩm', 'Web và app có thể khác thuật ngữ', 'Bảng từ vựng trạng thái/tiền dùng chung vi-en', 'Trải nghiệm nhất quán', 'Có'],
  ['App Manage', 'Scope rộng nhưng nhu cầu di động khác web', 'Chỉ giữ tác vụ cần làm ngoài hiện trường, tránh port mọi bảng lớn', 'App dùng được trên điện thoại', 'Chỉ toàn bộ'],
];
const ideaRows = [['ID', 'Nơi áp dụng', 'Vấn đề cần kiểm chứng', 'Ý tưởng để designer đánh giá', 'Mục tiêu', 'Áp dụng PA 50%',
  'Cần đổi chức năng? Designer/dev đánh giá', 'Nhận / chỉnh / bỏ', 'Designer bổ sung', 'Quyết định PO', 'Link Figma'],
  ...ideaSpecs.map((row, index) => [`I${String(index + 1).padStart(2, '0')}`, ...row, '', '', '', '', ''])];

const timelineSpecs = [
  ['Toàn bộ', 'Ngày 1', 'Chốt staging baseline, vai trò, inventory và phạm vi từng route', 'Inventory + danh sách điểm chưa rõ'],
  ['Toàn bộ', 'Ngày 2', 'Sitemap, token, bộ mẫu/component và ngôn ngữ thiết kế', 'Foundations được duyệt'],
  ['Toàn bộ', 'Ngày 3–5', 'Marketplace, yêu cầu thuê, thanh toán và chuyến web/app', 'Flow + màn đại diện + trạng thái'],
  ['Toàn bộ', 'Ngày 6–7', 'Owner Lite: đăng xe, lịch/chuyến, thu nhập', 'Flow + màn đại diện'],
  ['Toàn bộ', 'Ngày 8–10', 'Manage: xe, lịch, booking, khách, tài chính, gói', 'Mẫu màn và ngoại lệ quan trọng'],
  ['Toàn bộ', 'Ngày 11–12', 'Admin: duyệt, tiền, hỗ trợ, cấu hình', 'Mẫu bảng/hàng đợi và flow'],
  ['Toàn bộ', 'Ngày 13', 'Account/pháp lý và native Manage bằng component/mẫu đã chốt', 'Mapping route → Figma; ngoại lệ được vẽ'],
  ['Toàn bộ', 'Ngày 14', 'Prototype nối trang, rà link/nút, trạng thái và responsive', 'Prototype đi hết luồng'],
  ['Toàn bộ', 'Ngày 15', 'Duyệt cuối, bàn giao dev, danh sách điểm mở', 'Figma source + handoff'],
  ['~50% chính', 'Ngày 1', 'Chốt staging baseline và đúng 88 dòng được thuê', 'Phạm vi đã duyệt'],
  ['~50% chính', 'Ngày 2', 'Sitemap tối giản, component/token dùng chung', 'Foundations đủ mở rộng'],
  ['~50% chính', 'Ngày 3–5', 'Khách tìm xe, báo giá và yêu cầu thuê trên web/app', 'Prototype chọn và đặt xe'],
  ['~50% chính', 'Ngày 6–8', 'QR/cọc, chuyến, hủy/hoàn, chat/hỗ trợ', 'Các trạng thái tiền và chuyến'],
  ['~50% chính', 'Ngày 9–10', 'Owner Lite: đăng xe, duyệt yêu cầu, lịch và tiền', 'Flow chủ xe từ đầu đến cuối'],
  ['~50% chính', 'Ngày 11–12', 'Admin tiền/duyệt; ngoại lệ khớp tiền và hỗ trợ', 'Hàng đợi + chi tiết xử lý'],
  ['~50% chính', 'Ngày 13', 'Manage core: dashboard, yêu cầu, đơn, xe, tài chính/gói', 'Mẫu màn vận hành chính'],
  ['~50% chính', 'Ngày 14', 'Nối trang, kiểm CTA, lỗi/rỗng/thiếu quyền, bản mobile web', 'Prototype và danh sách thiếu'],
  ['~50% chính', 'Ngày 15', 'Duyệt cuối và bàn giao dev', 'Figma source + handoff'],
];
const timelineRows = [['Phương án', 'Mốc gợi ý', 'Việc cần hoàn thành', 'Đầu ra để duyệt', 'Designer đề xuất điều chỉnh',
  'Ngày bắt đầu cam kết', 'Ngày bàn giao cam kết', 'Người duyệt', 'Trạng thái', 'Ghi chú'],
  ...timelineSpecs.map((row) => [...row, '', '', '', '', 'Chưa trao đổi', ''])];

const sheets = [
  ['00_Huong_dan', guideRows, [24, 116], { filters: false }],
  ['01_PA1_Toan_bo', inventoryRows, [9, 15, 25, 12, 26, 34, 48, 72, 25, 19, 10, 14, 20, 19, 14, 32, 48, 38, 45, 40, 22], {
    freezeCols: 6,
    validations: [{ column: 'L', options: ['Thuê', 'Để sau', 'Loại bỏ'] }, { column: 'M', options: ['Chưa trao đổi', 'Cần làm rõ', 'Đã chốt', 'Đã bàn giao'] }],
  }],
  ['02_PA2_50pct', partialRows, [10, 18, 9, 15, 25, 12, 26, 34, 48, 72, 25, 19, 10, 14, 20, 19, 14, 32, 48, 38, 45, 40, 22], {
    freezeCols: 8,
    validations: [{ column: 'N', options: ['Thuê', 'Để sau', 'Loại bỏ'] }, { column: 'O', options: ['Chưa trao đổi', 'Cần làm rõ', 'Đã chốt', 'Đã bàn giao'] }],
  }],
  ['03_Module_uu_tien', moduleRows, [10, 18, 12, 28, 72, 20, 20, 70, 14, 20, 19, 14, 48, 20, 20, 24], {
    freezeCols: 4,
    validations: [{ column: 'I', options: ['Thuê', 'Để sau', 'Loại bỏ'] }, { column: 'J', options: ['Chưa trao đổi', 'Cần làm rõ', 'Đã chốt', 'Đã bàn giao'] }],
  }],
  ['04_Cau_hoi_chot', discussionRows, [24, 90, 58, 58, 55, 55, 19, 19, 55], { freezeCols: 2 }],
  ['05_Luong_thao_tac', flowRows, [10, 23, 37, 34, 80, 49, 54, 64, 18, 48, 35, 33, 20], { freezeCols: 3 }],
  ['06_Lien_ket_trang', linkRows, [10, 16, 12, 46, 31, 58, 18, 32, 48, 35, 32], { freezeCols: 3 }],
  ['07_Y_tuong_UX', ideaRows, [10, 28, 61, 75, 38, 18, 40, 20, 48, 32, 32], { freezeCols: 2 }],
  ['08_Tien_do_15_ngay', timelineRows, [20, 18, 85, 55, 60, 24, 24, 24, 22, 50], { freezeCols: 2,
    validations: [{ column: 'I', options: ['Chưa trao đổi', 'Cần làm rõ', 'Đã chốt', 'Đã bàn giao'] }] }],
];

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2A2318"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF7F1DE"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(([name], i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

async function main() {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const stream = fs.createWriteStream(output);
  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('warning', (error) => { throw error; });
  archive.on('error', (error) => { throw error; });
  archive.pipe(stream);
  archive.append(contentTypes, { name: '[Content_Types].xml' });
  archive.append(rootRels, { name: '_rels/.rels' });
  archive.append(workbookXml, { name: 'xl/workbook.xml' });
  archive.append(workbookRels, { name: 'xl/_rels/workbook.xml.rels' });
  archive.append(styles, { name: 'xl/styles.xml' });
  sheets.forEach(([name, rows, widths, options], i) => archive.append(sheetXml(rows, widths, options), { name: `xl/worksheets/sheet${i + 1}.xml` }));
  await archive.finalize();
  await new Promise((resolve, reject) => { stream.on('close', resolve); stream.on('error', reject); });
  console.log(JSON.stringify({ output, webRoutes: webRoutes.length, mobileRoutes: mobileRoutes.length,
    allRows: all.length, partialRows: partial.length, modules: modules.length }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
