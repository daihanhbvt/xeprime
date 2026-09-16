/**
 * HAI MƯƠI chủ xe cá nhân TUYẾN HOA HỒNG — nhóm thứ ba của dữ liệu demo.
 *
 * ## Vì sao cần tới hai mươi tài khoản, trong khi đã có `qa.owner@`
 *
 * `qa.owner@xeprime.test` trả lời đúng MỘT câu hỏi: chiếc xe thứ 4 có bị trần Owner Lite chặn
 * không. Nó không trả lời được những câu hỏi chỉ hiện ra khi tuyến hoa hồng có ĐÔNG người:
 * chợ xe lọc theo tỉnh có ra kết quả ở ngoài bốn thành phố lớn không, thẻ xe của chủ cá nhân
 * (mặt tiền `personal`, avatar tài khoản thay logo, không có dấu tick) trông thế nào khi nằm
 * lẫn giữa xe của gian hàng gói, danh sách duyệt xe của nền tảng có gì để duyệt, và một chủ xe
 * một chiếc thì màn `/account` còn lại những gì.
 *
 * Hai mươi tài khoản, mỗi tài khoản 1–3 xe (`OWNER_LITE_VEHICLE_LIMIT`), rải trên 15 tỉnh.
 *
 * ## Vì sao file này SINH bản khai, còn `shops.ts` thì viết tay
 *
 * Năm gian hàng demo ở `shops.ts` khác nhau về LOẠI: quy mô, số chi nhánh, mức độ hoàn thiện hồ
 * sơ, tuyến thu phí. Mỗi cái là một ca riêng nên viết tay từng cái là đúng.
 *
 * Hai mươi chủ xe này khác nhau đúng ba thứ — con người, chỗ ở, và mấy chiếc xe. Chép hai mươi
 * lần cùng một khối `profile`/`branches`/`planCode` là hai mươi cơ hội để một cái lệch đi mà
 * không ai thấy (một cái quên `planCode`, một cái lỡ tay để `tenantType: 'business'`). Bảng
 * compact + một bộ dựng khiến những thứ PHẢI giống nhau thì giống nhau theo cấu trúc, và phần
 * khác nhau nằm gọn trên một dòng đọc được.
 *
 * Bản khai ra ngoài vẫn là `ShopSpec` như mọi gian hàng khác — `buildShop` không biết và không
 * cần biết nhóm này tồn tại.
 */
import {
  DEFAULT_COMMISSION_PLAN_CODE,
  OWNER_LITE_VEHICLE_LIMIT,
  TENANT_STATUS,
} from '@xeprime/types';
import { portrait } from './context';
import type { ShopDepth, ShopSpec } from './shops';

/**
 * Một chủ xe cá nhân, khai gọn. Những trường mà CẢ HAI MƯƠI người đều giống nhau (tuyến hoa
 * hồng, cá nhân, không nhân viên, không tài xế, một chi nhánh) không có mặt ở đây — chúng do
 * `toShopSpec` đặt, nên không khai sai được.
 */
interface OwnerInput {
  /** Đuôi email đăng nhập và tiền tố khoá `seedId`. Duy nhất, không đổi. */
  key: string;
  /** Họ tên đầy đủ — cũng là TÊN GIAN HÀNG: tuyến hoa hồng thì người và gian hàng là một. */
  name: string;
  phone: string;
  /**
   * Ảnh chân dung (Unsplash photo id). Đây KHÔNG phải trang trí: mặt tiền cá nhân lấy avatar
   * TÀI KHOẢN làm ảnh đại diện (`storefrontAvatar` trong `PublicListingsService`), nên chủ xe
   * không có avatar sẽ hiện một chữ cái trên mọi thẻ xe của mình.
   *
   * Ảnh mẫu lấy từ kho ảnh công cộng, không phải người Việt — chúng chỉ là chỗ giữ bố cục.
   */
  avatar: string;
  /** Mã tỉnh + mã xã CHÍNH THỨC; FK tổ hợp ở DB từ chối nếu xã không thuộc tỉnh. */
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  /** Phần "số nhà, đường" do người dùng gõ. */
  addressLine: string;
  /** Toạ độ XẤP XỈ của địa chỉ — khai sẵn, seed không geocode (ADR 0018). */
  latitude: number;
  longitude: number;
  bio: string;
  /** Tài khoản nhận tiền; `null` = chưa khai, để có tài khoản thật ở trạng thái đó. */
  bank: { name: string; accountNo: string } | null;
  /** Đội xe: 1–3 mẫu xe (`OWNER_LITE_VEHICLE_LIMIT`), mỗi mẫu một chiếc. */
  fleet: readonly string[];
  depth: ShopDepth;
  customerCount: number;
  /** Cứ N xe thì 1 chiếc chưa duyệt public. Mặc định 0 = duyệt hết. */
  unapprovedEvery?: number;
  /** Hồ sơ xác minh còn trong hàng đợi (ADR 0036) — vẫn bán xe được. */
  verificationPending?: boolean;
}

/**
 * Tên trên tài khoản ngân hàng: viết hoa, không dấu — đúng như ngân hàng in ra.
 *
 * Tự bỏ dấu tại chỗ thay vì mượn `normalizeProvinceAlias` của `@xeprime/types`: hàm đó là bộ
 * chuẩn hoá TÊN TỈNH, nó cắt tiền tố hành chính ở đầu chuỗi ("thành phố", "tỉnh", "tp") và
 * chuyển về chữ thường. Dùng nó cho tên người là mượn một hàm vì nó tình cờ làm được một nửa
 * việc — và cái nửa còn lại sẽ cắt nhầm tên ai đó vào một ngày nào đó.
 */
function bankAccountName(fullName: string): string {
  return fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (c) => (c === 'đ' ? 'd' : 'D'))
    .toUpperCase();
}

/** Bản khai gọn → `ShopSpec` đầy đủ. Mọi thứ chung của tuyến hoa hồng được đặt ở đây. */
function toShopSpec(input: OwnerInput, index: number): ShopSpec {
  if (input.fleet.length < 1 || input.fleet.length > OWNER_LITE_VEHICLE_LIMIT) {
    throw new Error(
      `Chủ xe "${input.key}" khai ${input.fleet.length} xe — tuyến hoa hồng chỉ được tối đa ` +
        `${OWNER_LITE_VEHICLE_LIMIT} xe (OWNER_LITE_VEHICLE_LIMIT). Seed sẽ dựng ra dữ liệu mà ` +
        'chính app từ chối tạo.',
    );
  }

  const address = `${input.addressLine}, ${input.wardName}, ${input.provinceName}`;

  return {
    key: `cx-${input.key}`,
    code: `CX-${String(index + 1).padStart(2, '0')}`,
    slug: `chu-xe-${input.key}`,
    name: input.name,
    tenantType: 'individual',
    status: TENANT_STATUS.ACTIVE,
    // Chỉ đặt khoá khi CÓ giá trị: `exactOptionalPropertyTypes` phân biệt "vắng mặt" với
    // "có mặt và bằng undefined", và `ShopSpec` khai `verificationPending?: boolean`.
    ...(input.verificationPending ? { verificationPending: true } : {}),
    owner: {
      email: `chuxe.${input.key}@xeprime.test`,
      displayName: input.name,
      phone: input.phone,
      avatarUrl: portrait(input.avatar),
    },
    staff: [],
    profile: {
      bio: input.bio,
      address,
      // KHÔNG có `coverUrl`: dải ảnh bìa là của mặt tiền GIAN HÀNG. Trang của chủ xe cá nhân
      // không vẽ nó, nên đặt giá trị ở đây chỉ là dữ liệu chết.
      taxCode: null,
      businessLicenseNo: null,
      bank: input.bank ? { ...input.bank, accountName: bankAccountName(input.name) } : null,
    },
    branches: [
      {
        code: 'CN01',
        // Chủ xe cá nhân không đặt tên chi nhánh — chỗ giao xe của họ là nơi họ ở.
        name: input.wardName,
        provinceCode: input.provinceCode,
        wardCode: input.wardCode,
        addressLine: input.addressLine,
        address,
        phone: input.phone,
        latitude: input.latitude,
        longitude: input.longitude,
        isDefault: true,
      },
    ],
    fleet: input.fleet.map((model) => ({ model, count: 1 })),
    planCode: DEFAULT_COMMISSION_PLAN_CODE,
    depth: input.depth,
    // Cá nhân thì không thuê tài xế — chuyến có tài xế là chính chủ cầm lái.
    driverCount: 0,
    customerCount: input.customerCount,
    unapprovedEvery: input.unapprovedEvery ?? 0,
  };
}

/**
 * Hai mươi người, 39 chiếc xe, 15 tỉnh.
 *
 * Bốn mức `depth` cố ý trộn lẫn: sáu người có hồ sơ đầy đủ (giấy tờ xe, bàn giao, thu chi),
 * sáu người mức vừa, năm người chỉ vài chuyến, và BA người chưa có chuyến nào — màn "chưa có
 * đơn nào" của tuyến hoa hồng cũng cần một tài khoản thật để mở ra xem, không kém gì màn đông
 * dữ liệu.
 */
const OWNERS: readonly OwnerInput[] = [
  {
    key: 'tuan',
    name: 'Nguyễn Minh Tuấn',
    phone: '0913000001',
    avatar: '1507003211169-0a1dd7228f2d',
    provinceCode: '01',
    provinceName: 'Hà Nội',
    wardCode: '00166',
    wardName: 'Phường Cầu Giấy',
    addressLine: '68 Trần Thái Tông',
    latitude: 21.0313,
    longitude: 105.7873,
    bio: 'Hai xe nhà cho thuê tự lái, mình giao nhận trong nội thành Hà Nội. Xe bảo dưỡng đúng hãng, giấy tờ đầy đủ.',
    bank: { name: 'Techcombank', accountNo: '19036140027' },
    fleet: ['toyota-vios', 'kia-morning'],
    depth: 'full',
    customerCount: 3,
  },
  {
    key: 'huong',
    name: 'Lê Thu Hương',
    phone: '0913000002',
    avatar: '1534528741775-53994a69daeb',
    provinceCode: '01',
    provinceName: 'Hà Nội',
    wardCode: '00367',
    wardName: 'Phường Thanh Xuân',
    addressLine: '24 ngõ 102 Khuất Duy Tiến',
    latitude: 20.9955,
    longitude: 105.8006,
    bio: 'Xe đi làm hằng ngày, cuối tuần rảnh nên cho thuê. Ưu tiên khách thuê 2–3 ngày, nhận xe tại nhà.',
    bank: { name: 'MB Bank', accountNo: '0913000002' },
    fleet: ['honda-city'],
    depth: 'light',
    customerCount: 1,
  },
  {
    key: 'khai',
    name: 'Trần Quang Khải',
    phone: '0913000003',
    avatar: '1568602471122-7832951cc4c5',
    provinceCode: '01',
    provinceName: 'Hà Nội',
    wardCode: '00070',
    wardName: 'Phường Hoàn Kiếm',
    addressLine: '18 Hàng Bồ',
    latitude: 21.0333,
    longitude: 105.85,
    bio: 'Một ô tô và một xe máy trong phố cổ. Khách đi trong ngày hoặc thuê xe máy dạo Hà Nội đều được.',
    bank: { name: 'VPBank', accountNo: '189234567' },
    fleet: ['mazda-3', 'honda-sh'],
    depth: 'medium',
    customerCount: 2,
  },
  {
    key: 'son',
    name: 'Phạm Thanh Sơn',
    phone: '0913000004',
    avatar: '1472099645785-5658abf4ff4e',
    provinceCode: '79',
    provinceName: 'Hồ Chí Minh',
    wardCode: '26743',
    wardName: 'Phường Bến Thành',
    addressLine: '35 Lê Thánh Tôn',
    latitude: 10.772,
    longitude: 106.698,
    bio: 'Ba xe khu trung tâm: một sedan, một xe điện và một xe máy. Giao xe tận nơi trong bán kính 10km.',
    bank: { name: 'Vietcombank', accountNo: '0071001234567' },
    fleet: ['hyundai-accent', 'vinfast-vf5', 'honda-vision'],
    depth: 'full',
    customerCount: 3,
    unapprovedEvery: 3,
  },
  {
    key: 'ngan',
    name: 'Võ Kim Ngân',
    phone: '0913000005',
    avatar: '1517841905240-472988babdf9',
    provinceCode: '79',
    provinceName: 'Hồ Chí Minh',
    wardCode: '26929',
    wardName: 'Phường Bình Thạnh',
    addressLine: '120 Điện Biên Phủ',
    latitude: 10.8039,
    longitude: 106.7091,
    bio: 'Mới đăng chiếc xe đầu tiên, đang chờ xác minh hồ sơ. Xe số tự động, hợp khách mới lái.',
    bank: null,
    fleet: ['kia-morning'],
    depth: 'minimal',
    customerCount: 0,
    verificationPending: true,
  },
  {
    key: 'long',
    name: 'Đỗ Hoàng Long',
    phone: '0913000006',
    avatar: '1531427186611-ecfd6d936c79',
    provinceCode: '79',
    provinceName: 'Hồ Chí Minh',
    wardCode: '26968',
    wardName: 'Phường Tân Sơn Nhất',
    addressLine: '27 Bạch Đằng',
    latitude: 10.8009,
    longitude: 106.66,
    bio: 'Hai xe 7 chỗ gần sân bay, nhận đưa đón sân bay và đi tỉnh. Có thể giao xe tại ga quốc nội.',
    bank: { name: 'ACB', accountNo: '2456789' },
    fleet: ['mitsubishi-xpander', 'toyota-veloz'],
    depth: 'medium',
    customerCount: 2,
  },
  {
    key: 'trung',
    name: 'Nguyễn Thành Trung',
    phone: '0913000007',
    avatar: '1492562080023-ab3db95bfbce',
    provinceCode: '48',
    provinceName: 'Đà Nẵng',
    wardCode: '20242',
    wardName: 'Phường Hải Châu',
    addressLine: '58 Lê Duẩn',
    latitude: 16.06,
    longitude: 108.22,
    bio: 'Ba xe ở trung tâm Đà Nẵng, khách du lịch thuê theo ngày là chính. Giao xe tại sân bay miễn phí.',
    bank: { name: 'BIDV', accountNo: '4210012345678' },
    fleet: ['hyundai-i10', 'toyota-vios', 'honda-airblade'],
    depth: 'full',
    customerCount: 3,
    unapprovedEvery: 3,
  },
  {
    key: 'khoa',
    name: 'Lê Anh Khoa',
    phone: '0913000008',
    avatar: '1527980965255-d3b416303d12',
    provinceCode: '48',
    provinceName: 'Đà Nẵng',
    wardCode: '20263',
    wardName: 'Phường Sơn Trà',
    addressLine: '112 Ngô Quyền',
    latitude: 16.078,
    longitude: 108.244,
    bio: 'Hai xe máy sát biển Mỹ Khê, giao xe tận khách sạn. Kèm mũ bảo hiểm và áo mưa.',
    bank: { name: 'MB Bank', accountNo: '0913000008' },
    fleet: ['honda-vision', 'yamaha-exciter'],
    depth: 'light',
    customerCount: 1,
  },
  {
    key: 'hung',
    name: 'Bùi Văn Hùng',
    phone: '0913000009',
    avatar: '1545167622-3a6ac756afa4',
    provinceCode: '31',
    provinceName: 'Hải Phòng',
    wardCode: '11329',
    wardName: 'Phường Ngô Quyền',
    addressLine: '45 Lạch Tray',
    latitude: 20.859,
    longitude: 106.693,
    bio: 'Xe nhà mới mua, cho thuê những ngày không dùng tới. Liên hệ trước một ngày để mình sắp xếp.',
    bank: { name: 'Agribank', accountNo: '1902123456789' },
    fleet: ['kia-k3'],
    depth: 'minimal',
    customerCount: 0,
  },
  {
    key: 'minh',
    name: 'Hoàng Nhật Minh',
    phone: '0913000010',
    avatar: '1600486913747-55e5470d6f40',
    provinceCode: '46',
    provinceName: 'Huế',
    wardCode: '19789',
    wardName: 'Phường Thuận Hóa',
    addressLine: '27 Nguyễn Huệ',
    latitude: 16.464,
    longitude: 107.593,
    bio: 'Một CUV gầm cao và một xe máy điện tại Huế. Xe hợp đi Lăng Cô, A Lưới, đường đèo không ngại.',
    bank: { name: 'Vietcombank', accountNo: '0161000987654' },
    fleet: ['hyundai-creta', 'vinfast-klara'],
    depth: 'medium',
    customerCount: 2,
  },
  {
    key: 'duyen',
    name: 'Trương Mỹ Duyên',
    phone: '0913000011',
    avatar: '1573497019940-1c28c88b4f3e',
    provinceCode: '92',
    provinceName: 'Cần Thơ',
    wardCode: '31135',
    wardName: 'Phường Ninh Kiều',
    addressLine: '68 Trần Văn Khéo',
    latitude: 10.034,
    longitude: 105.788,
    bio: 'Hai xe cỡ nhỏ ở Ninh Kiều, tiết kiệm xăng, hợp khách đi miền Tây. Nhận giao xe tại bến Ninh Kiều.',
    bank: { name: 'Sacombank', accountNo: '060123456789' },
    fleet: ['vinfast-fadil', 'kia-morning'],
    depth: 'medium',
    customerCount: 2,
  },
  {
    key: 'thinh',
    name: 'Đặng Phú Thịnh',
    phone: '0913000012',
    avatar: '1539571696357-5a69c17a67c6',
    provinceCode: '56',
    provinceName: 'Khánh Hòa',
    wardCode: '22366',
    wardName: 'Phường Nha Trang',
    addressLine: '82 Nguyễn Thiện Thuật',
    latitude: 12.245,
    longitude: 109.194,
    bio: 'Một ô tô gầm cao và hai xe máy ngay khu phố Tây Nha Trang. Thuê theo ngày hoặc theo tuần đều có giá.',
    bank: { name: 'Techcombank', accountNo: '19038812345' },
    fleet: ['kia-seltos', 'honda-vision', 'honda-sh'],
    depth: 'full',
    customerCount: 3,
    unapprovedEvery: 3,
  },
  {
    key: 'nhan',
    name: 'Ngô Ái Nhân',
    phone: '0913000013',
    avatar: '1524504388940-b1c1722653e1',
    provinceCode: '68',
    provinceName: 'Lâm Đồng',
    wardCode: '24781',
    wardName: 'Phường Xuân Hương - Đà Lạt',
    addressLine: '15 Nguyễn Chí Thanh',
    latitude: 11.942,
    longitude: 108.438,
    bio: 'Xe gầm cao ở Đà Lạt, quen đường đèo và mấy cung săn mây. Giao xe quanh chợ Đà Lạt.',
    bank: null,
    fleet: ['mitsubishi-xforce'],
    depth: 'light',
    customerCount: 1,
  },
  {
    key: 'phuc',
    name: 'Hồ Hữu Phúc',
    phone: '0913000014',
    avatar: '1528892952291-009c663ce843',
    provinceCode: '40',
    provinceName: 'Nghệ An',
    wardCode: '16690',
    wardName: 'Phường Trường Vinh',
    addressLine: '132 Nguyễn Văn Cừ',
    latitude: 18.67,
    longitude: 105.69,
    bio: 'Hai xe tại thành phố Vinh, một xe hybrid tiết kiệm xăng cho chặng dài. Nhận thuê theo tháng.',
    bank: { name: 'BIDV', accountNo: '4210099887766' },
    fleet: ['toyota-corolla-cross-hev', 'toyota-vios'],
    depth: 'medium',
    customerCount: 2,
  },
  {
    key: 'lam',
    name: 'Vũ Tùng Lâm',
    phone: '0913000015',
    avatar: '1595152452543-e5fc28ebc2b8',
    provinceCode: '38',
    provinceName: 'Thanh Hóa',
    wardCode: '14797',
    wardName: 'Phường Hạc Thành',
    addressLine: '24 Lê Hoàn',
    latitude: 19.807,
    longitude: 105.776,
    bio: 'Sedan 5 chỗ đời mới, hợp khách đi Sầm Sơn hoặc về quê dịp lễ. Thủ tục gọn, nhận xe trong 15 phút.',
    bank: { name: 'Agribank', accountNo: '3800205123456' },
    fleet: ['hyundai-accent'],
    depth: 'light',
    customerCount: 1,
  },
  {
    key: 'quyen',
    name: 'Mai Kiều Quyên',
    phone: '0913000016',
    avatar: '1580489944761-15a19d654956',
    provinceCode: '22',
    provinceName: 'Quảng Ninh',
    wardCode: '06673',
    wardName: 'Phường Bãi Cháy',
    addressLine: '9 Hạ Long',
    latitude: 20.956,
    longitude: 107.045,
    bio: 'Hai xe ở Bãi Cháy, một sedan hạng D cho khách cần xe sang đi công tác. Giao xe tại cảng tàu khách.',
    bank: { name: 'Vietcombank', accountNo: '0021000456789' },
    fleet: ['toyota-camry', 'honda-city'],
    depth: 'full',
    customerCount: 3,
  },
  {
    key: 'dat',
    name: 'Nguyễn Tiến Đạt',
    phone: '0913000017',
    avatar: '1519085360753-af0119f7cbe7',
    provinceCode: '66',
    provinceName: 'Đắk Lắk',
    wardCode: '24133',
    wardName: 'Phường Buôn Ma Thuột',
    addressLine: '56 Lê Duẩn',
    latitude: 12.68,
    longitude: 108.05,
    bio: 'Xe gầm cao và bán tải chạy đường rẫy, đường đất mùa mưa đều đi được. Hồ sơ đang chờ xác minh.',
    bank: null,
    fleet: ['toyota-fortuner', 'mitsubishi-triton'],
    depth: 'minimal',
    customerCount: 0,
    verificationPending: true,
  },
  {
    key: 'nghia',
    name: 'Lý Trọng Nghĩa',
    phone: '0913000018',
    avatar: '1521119989659-a83eee488004',
    provinceCode: '75',
    provinceName: 'Đồng Nai',
    wardCode: '26041',
    wardName: 'Phường Trấn Biên',
    addressLine: '210 Phạm Văn Thuận',
    latitude: 10.955,
    longitude: 106.842,
    bio: 'Ba xe ở Biên Hòa: một MPV 7 chỗ, một xe điện và một xe máy. Khách đi TP.HCM hoặc Vũng Tàu đều tiện.',
    bank: { name: 'Sacombank', accountNo: '070345678912' },
    fleet: ['toyota-innova', 'vinfast-vf5', 'yamaha-exciter'],
    depth: 'full',
    customerCount: 3,
    unapprovedEvery: 3,
  },
  {
    key: 'vy',
    name: 'Phan Thảo Vy',
    phone: '0913000019',
    avatar: '1607746882042-944635dfe10e',
    provinceCode: '24',
    provinceName: 'Bắc Ninh',
    wardCode: '09187',
    wardName: 'Phường Kinh Bắc',
    addressLine: '31 Ngô Gia Tự',
    latitude: 21.183,
    longitude: 106.076,
    bio: 'Một xe cỡ nhỏ và một xe máy điện, hợp khách đi làm khu công nghiệp thuê theo tuần.',
    bank: { name: 'MB Bank', accountNo: '0913000019' },
    fleet: ['kia-morning', 'vinfast-klara'],
    depth: 'light',
    customerCount: 1,
  },
  {
    key: 'tam',
    name: 'Huỳnh Minh Tâm',
    phone: '0913000020',
    avatar: '1463453091185-61582044d556',
    provinceCode: '91',
    provinceName: 'An Giang',
    wardCode: '30307',
    wardName: 'Phường Long Xuyên',
    addressLine: '17 Trần Hưng Đạo',
    latitude: 10.386,
    longitude: 105.435,
    bio: 'Một xe tải nhỏ chở hàng và một sedan chở khách tại Long Xuyên. Thuê ngày hoặc thuê tháng đều được.',
    bank: { name: 'Agribank', accountNo: '6800205998877' },
    fleet: ['suzuki-carry-pro', 'toyota-vios'],
    depth: 'medium',
    customerCount: 2,
  },
];

/** Bản khai `ShopSpec` của hai mươi chủ xe — `shops.ts` nối vào `SHOP_SPECS`. */
export const COMMISSION_OWNER_SPECS: readonly ShopSpec[] = OWNERS.map(toShopSpec);
