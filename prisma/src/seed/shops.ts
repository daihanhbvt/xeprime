/**
 * Gian hàng demo — bản khai KHAI BÁO, không có logic.
 *
 * Bộ demo gọn (05/10/2026): mỗi loại tài khoản khoảng BA bản, đủ để mở mọi màn hình với dữ liệu
 * thật mà không chìm trong dữ liệu mẫu.
 *
 * ## Gian hàng tuyến GÓI (3) — mỗi bậc gói một gian hàng (ADR 0041)
 *
 * | Gian hàng | Đội xe | Bậc | Ghi chú |
 * | --- | --- | --- | --- |
 * | `owner.saigon@` | 12 xe · 2 chi nhánh | Chuyên nghiệp | 3 nhân viên (quản lý · nhân viên · người xem), đủ dữ liệu vận hành |
 * | `owner.hanoi@` | 5 xe · 2 chi nhánh | Nâng cao | đơn, khách, thu chi |
 * | `owner.danang@` | 2 xe · 1 chi nhánh | Cơ bản | vài đơn |
 *
 * ## Chủ xe CÁ NHÂN tuyến hoa hồng (3) — khai ở `commission-owners.ts`
 *
 * 1 xe · 2 xe · 3 xe (trần Owner Lite là 3 xe TỔNG ô tô + xe máy — `OWNER_LITE_VEHICLE_LIMIT`).
 * Nối vào `SHOP_SPECS` ở cuối file.
 *
 * Chi tiết dựng dữ liệu nằm ở `shop.ts`; file này chỉ mô tả "gian hàng đó là gì".
 */
import {
  SELLER_ENTITY_TYPE,
  SHOP_PLAN_CODE,
  TENANT_STATUS,
  TENANT_ROLE,
  type SellerEntityType,
} from '@xeprime/types';
import { COMMISSION_OWNER_SPECS } from './commission-owners';
import { photo } from './context';

export interface BranchSpec {
  code: string;
  name: string;
  /** Mã tỉnh chính thức — phải có trong danh mục `provinces` do migration nạp. */
  provinceCode: string;
  /**
   * Mã xã/phường/đặc khu chính thức — phải THUỘC `provinceCode` ở trên, và FK tổ hợp
   * `(ward_code, province_code)` ở DB sẽ từ chối seed nếu sai. Mô hình hành chính hai cấp
   * (từ 01/07/2025): không có cấp huyện nào giữa hai mã này.
   */
  wardCode: string;
  /** Phần "số nhà, đường" — server ghép chuỗi hiển thị từ đây + tên xã + tên tỉnh. */
  addressLine: string;
  /**
   * Địa chỉ HIỂN THỊ đầy đủ. Giữ trong spec (thay vì để seed tự ghép) vì dữ liệu demo mô phỏng
   * cả những bản ghi có từ TRƯỚC danh mục cấp xã — và chúng viết theo địa danh cũ.
   */
  address: string;
  phone: string;
  /**
   * Toạ độ điểm giao xe đi — điểm xuất phát của mọi phép tính phí giao tận nơi (ADR 0018).
   *
   * Khai sẵn trong seed, KHÔNG geocode lúc chạy: seed phải tất định và chạy được offline. Đây là
   * vị trí XẤP XỈ của địa chỉ demo, đủ đúng để quãng đường ra con số hợp lý — không phải toạ độ
   * đo đạc, và cũng không cần chính xác hơn thế cho dữ liệu minh hoạ.
   */
  latitude: number;
  longitude: number;
  isDefault?: boolean;
  status?: string;
}

export interface StaffSpec {
  roleKey: string;
  email: string;
  displayName: string;
  phone: string;
}

/** Số chiếc của một dòng xe trong đội xe. */
export interface FleetEntry {
  model: string;
  count: number;
}

/**
 * Mức độ dựng dữ liệu vận hành quanh gian hàng.
 *
 * `full`    — đủ mọi thứ: tài xế, sổ khách, giấy tờ xe, bảo dưỡng, bàn giao, thu chi, đánh giá.
 * `medium`  — đơn, khách, thu chi, đánh giá; không giấy tờ/bảo dưỡng chi tiết.
 * `light`   — vài đơn và một đánh giá.
 * `minimal` — chỉ xe, không đơn. Dùng để thử màn "chưa có đơn nào".
 * `none`    — không có xe (gian hàng chưa duyệt).
 */
export type ShopDepth = 'full' | 'medium' | 'light' | 'minimal' | 'none';

export interface ShopSpec {
  key: string;
  code: string;
  slug: string;
  name: string;
  tenantType: 'individual' | 'business';
  /**
   * Trạng thái VẬN HÀNH (ADR 0036) — `active` hoặc `suspended`, không còn là máy trạng thái
   * duyệt hồ sơ. Gian hàng mới mở ra đã `active`.
   */
  status: string;
  /**
   * Hồ sơ XÁC MINH còn nằm trong hàng đợi duyệt (ADR 0036) — trục THỨ HAI, độc lập với `status`.
   *
   * Tách khỏi `status` vì từ ADR 0036 hai thứ này không còn suy ra được từ nhau: một gian hàng
   * đang bán bình thường vẫn có thể đang chờ xác minh để mua gói. Mặc định `false` = đã xác minh.
   */
  verificationPending?: boolean;
  /**
   * Chủ tài khoản. `avatarUrl` không phải trang trí ở tuyến HOA HỒNG: mặt tiền cá nhân lấy
   * avatar tài khoản làm ảnh đại diện khi không có logo (`storefrontAvatar`), nên thiếu nó là
   * mọi thẻ xe của người đó hiện một chữ cái.
   */
  owner: { email: string; displayName: string; phone: string; avatarUrl?: string };
  staff: readonly StaffSpec[];
  profile: {
    bio: string;
    address: string;
    /**
     * Ảnh bìa trang gian hàng công khai. Chỉ MẶT TIỀN GIAN HÀNG (tuyến gói) vẽ nó — chủ xe cá
     * nhân không có dải bìa — nên đặt giá trị cho một tenant tuyến hoa hồng là vô hại nhưng
     * cũng vô nghĩa.
     */
    coverUrl?: string;
    /** Mã số thuế KHÔNG ở đây (07/10/2026) — nó là `seller.taxId`, nguồn duy nhất. */
    businessLicenseNo: string | null;
    /** Tài khoản nhận tiền — seed vào `bank_accounts` (ADR 0033), KHÔNG vào hồ sơ gian hàng. */
    bank: { name: string; accountNo: string; accountName: string } | null;
  };
  /**
   * Hồ sơ NGƯỜI BÁN (`seller_profiles`) — nơi DUY NHẤT mang mã số thuế (07/10/2026): hợp đồng, màn
   * quản trị và báo cáo thuế đều đọc nó. Seed ở trạng thái NHÁP, đúng như một gian hàng vừa khai —
   * không dựng sẵn một hồ sơ "đã xác minh" để bỏ qua bước nền tảng duyệt. `null` = chưa khai: bản
   * nháp được tạo lười khi chủ gian hàng mở "Thông tin khai thuế".
   */
  seller: { entityType: SellerEntityType; legalName: string; taxId: string } | null;
  branches: readonly BranchSpec[];
  fleet: readonly FleetEntry[];
  /** Mã BẬC gói đang dùng (ADR 0041) — null = chưa gán gói. Trần xe/chi nhánh đi theo bậc. */
  planCode: string | null;
  depth: ShopDepth;
  driverCount: number;
  customerCount: number;
  /** Cứ mỗi N xe thì để 1 xe chưa duyệt public. 0 = duyệt hết. */
  unapprovedEvery: number;
}

/**
 * Ảnh bìa demo cho gian hàng tuyến gói.
 *
 * Dùng `photo()` (Unsplash ghim theo id) như mọi ảnh demo khác trong seed: chạy được mà không
 * phải commit file nhị phân, và cùng một id luôn cho cùng một ảnh nên dữ liệu demo lặp lại được
 * giữa các lần seed.
 *
 * Thay bằng ảnh bìa riêng: thả file vào `apps/web/public/demo/` rồi đổi giá trị ở đây thành
 * đường dẫn gốc (`'/demo/shop-cover.jpg'`). Bảng này tồn tại chính vì lẽ đó — đổi ảnh là sửa
 * một chỗ, không phải đi tìm từng gian hàng.
 */
const SHOP_COVER = {
  /** Dàn xe xếp hàng trong nhà để xe — hợp gian hàng có đội xe lớn. */
  fleet: photo('1449965408869-eaa3f722e40d'),
  /** Xe giữa phố — gian hàng đô thị. */
  city: photo('1502877338535-766e1452684a'),
  /** Xe trên đường dài — gian hàng thiên về thuê chuyến. */
  road: photo('1469854523086-cc02fe5d8800'),
} as const;

/** Ba gian hàng tuyến gói viết TAY — mỗi bậc gói một gian hàng. */
const HANDWRITTEN_SHOPS: readonly ShopSpec[] = [
  // ── 1. Gian hàng lớn: 12 xe, 2 chi nhánh — bậc Chuyên nghiệp ────────────
  {
    key: 'saigon',
    code: 'SG-PRIME',
    slug: 'xeprime-sai-gon',
    name: 'XePrime Sài Gòn',
    tenantType: 'business',
    status: TENANT_STATUS.ACTIVE,
    owner: {
      email: 'owner.saigon@xeprime.test',
      displayName: 'Trần Quốc Bảo',
      phone: '0902000001',
    },
    staff: [
      {
        roleKey: TENANT_ROLE.SHOP_MANAGER,
        email: 'manager.saigon@xeprime.test',
        displayName: 'Nguyễn Thị Hoa',
        phone: '0902000011',
      },
      {
        roleKey: TENANT_ROLE.SHOP_STAFF,
        email: 'staff.saigon@xeprime.test',
        displayName: 'Lê Văn Tú',
        phone: '0902000012',
      },
      {
        roleKey: TENANT_ROLE.SHOP_VIEWER,
        email: 'ketoan.saigon@xeprime.test',
        displayName: 'Đỗ Thị Mai',
        phone: '0902000013',
      },
    ],
    profile: {
      bio:
        'Đội xe 12 chiếc từ hạng A tới 7 chỗ, có mặt ở TP.HCM và Hà Nội. ' +
        'Nhận thuê tự lái, thuê kèm tài xế và thuê dài hạn theo tháng. Giao xe tận nơi nội thành.',
      address: '123 Nguyễn Văn Cừ, Quận 5, TP. Hồ Chí Minh',
      coverUrl: SHOP_COVER.fleet,
      businessLicenseNo: '41C8123456',
      bank: {
        name: 'Vietcombank',
        accountNo: '0071000123456',
        accountName: 'CONG TY TNHH XEPRIME SAI GON',
      },
    },
    seller: {
      entityType: SELLER_ENTITY_TYPE.COMPANY,
      legalName: 'Công ty TNHH XePrime Sài Gòn',
      taxId: '0316123456',
    },
    branches: [
      {
        code: 'CN01',
        name: 'Chi nhánh Quận 5',
        provinceCode: '79',
        address: '123 Nguyễn Văn Cừ, Quận 5, TP. Hồ Chí Minh',
        wardCode: '27301',
        addressLine: '123 Nguyễn Văn Cừ',
        phone: '02839001234',
        latitude: 10.7595,
        longitude: 106.682,
        isDefault: true,
      },
      {
        code: 'CN02',
        name: 'Chi nhánh Cầu Giấy',
        provinceCode: '01',
        address: '88 Trần Thái Tông, Cầu Giấy, Hà Nội',
        wardCode: '00166',
        addressLine: '88 Trần Thái Tông',
        phone: '02439001234',
        latitude: 21.0313,
        longitude: 105.7873,
      },
    ],
    fleet: [
      { model: 'toyota-vios', count: 1 },
      { model: 'honda-city', count: 1 },
      { model: 'hyundai-accent', count: 1 },
      { model: 'kia-k3', count: 1 },
      { model: 'toyota-camry', count: 1 },
      { model: 'mercedes-c200', count: 1 },
      { model: 'kia-seltos', count: 1 },
      { model: 'vinfast-vf8', count: 1 },
      { model: 'toyota-fortuner', count: 1 },
      { model: 'mitsubishi-xpander', count: 1 },
      { model: 'kia-carnival', count: 1 },
      { model: 'honda-sh', count: 1 },
    ],
    // 12 xe vượt trần 10 xe của bậc nâng cao ⇒ chỉ bậc không giới hạn chứa nổi (ADR 0041 điều 7).
    planCode: SHOP_PLAN_CODE.PRO,
    depth: 'full',
    driverCount: 2,
    customerCount: 8,
    unapprovedEvery: 6,
  },

  // ── 2. Gian hàng vừa: 5 xe, 2 chi nhánh — bậc Nâng cao ──────────────────
  {
    key: 'hanoi',
    code: 'HN-VIET',
    slug: 'viet-car-ha-noi',
    name: 'Việt Car Hà Nội',
    tenantType: 'business',
    status: TENANT_STATUS.ACTIVE,
    owner: {
      email: 'owner.hanoi@xeprime.test',
      displayName: 'Phạm Đức Việt',
      phone: '0903000001',
    },
    staff: [],
    profile: {
      bio:
        'Cho thuê xe tự lái và thuê tháng tại Hà Nội, Hải Phòng. Xe đời mới, bảo dưỡng đúng hạn, ' +
        'thủ tục nhanh gọn trong 15 phút.',
      address: '12 Lê Văn Lương, Thanh Xuân, Hà Nội',
      coverUrl: SHOP_COVER.city,
      businessLicenseNo: '01C8987654',
      bank: {
        name: 'Techcombank',
        accountNo: '19033888888',
        accountName: 'CONG TY TNHH VIET CAR',
      },
    },
    seller: {
      entityType: SELLER_ENTITY_TYPE.COMPANY,
      legalName: 'Công ty TNHH Việt Car',
      taxId: '0108987654',
    },
    branches: [
      {
        code: 'CN01',
        name: 'Chi nhánh Thanh Xuân',
        provinceCode: '01',
        address: '12 Lê Văn Lương, Thanh Xuân, Hà Nội',
        wardCode: '00367',
        addressLine: '12 Lê Văn Lương',
        phone: '02438887777',
        latitude: 21.0027,
        longitude: 105.802,
        isDefault: true,
      },
      {
        code: 'CN02',
        name: 'Chi nhánh Lê Chân',
        provinceCode: '31',
        address: '77 Tô Hiệu, Lê Chân, Hải Phòng',
        wardCode: '11383',
        addressLine: '77 Tô Hiệu',
        phone: '02258887777',
        latitude: 20.843,
        longitude: 106.672,
      },
    ],
    fleet: [
      { model: 'toyota-vios', count: 1 },
      { model: 'honda-city', count: 1 },
      { model: 'kia-seltos', count: 1 },
      { model: 'mitsubishi-xpander', count: 1 },
      { model: 'honda-vision', count: 1 },
    ],
    // 5 xe / 2 chi nhánh — vượt trần 3 xe của bậc cơ bản, nằm gọn trong bậc nâng cao (10 / 3).
    planCode: SHOP_PLAN_CODE.ADVANCED,
    depth: 'medium',
    driverCount: 1,
    customerCount: 5,
    unapprovedEvery: 0,
  },

  // ── 3. Gian hàng nhỏ: 2 xe — bậc Cơ bản ─────────────────────────────────
  {
    key: 'danang',
    code: 'DN-MINI',
    slug: 'da-nang-mini-rental',
    name: 'Đà Nẵng Mini Rental',
    tenantType: 'individual',
    status: TENANT_STATUS.ACTIVE,
    owner: {
      email: 'owner.danang@xeprime.test',
      displayName: 'Ngô Thanh Hải',
      phone: '0904000001',
    },
    staff: [],
    profile: {
      bio: 'Hai chiếc xe nhà, chủ tự giao nhận tại Đà Nẵng. Ưu tiên khách thuê theo ngày và cuối tuần.',
      address: '30 Nguyễn Chí Thanh, Hải Châu, Đà Nẵng',
      coverUrl: SHOP_COVER.road,
      businessLicenseNo: null,
      bank: {
        name: 'MB Bank',
        accountNo: '0904000001',
        accountName: 'NGO THANH HAI',
      },
    },
    seller: null,
    branches: [
      {
        code: 'CN01',
        name: 'Đà Nẵng',
        provinceCode: '48',
        address: '30 Nguyễn Chí Thanh, Hải Châu, Đà Nẵng',
        wardCode: '20242',
        addressLine: '30 Nguyễn Chí Thanh',
        phone: '0904000001',
        latitude: 16.0715,
        longitude: 108.22,
        isDefault: true,
      },
    ],
    fleet: [
      { model: 'hyundai-i10', count: 1 },
      { model: 'honda-sh', count: 1 },
    ],
    // 2 xe / 1 chi nhánh — trong trần bậc cơ bản (3 xe / 1 chi nhánh).
    planCode: SHOP_PLAN_CODE.BASIC,
    depth: 'light',
    driverCount: 0,
    customerCount: 3,
    unapprovedEvery: 0,
  },
];

/**
 * Mọi gian hàng của seed demo: ba gian hàng tuyến gói ở trên + ba chủ xe cá nhân tuyến hoa hồng.
 * Thứ tự chỉ có ý nghĩa với người đọc log: nhiều dữ liệu nhất trước.
 */
export const SHOP_SPECS: readonly ShopSpec[] = [...HANDWRITTEN_SHOPS, ...COMMISSION_OWNER_SPECS];

/**
 * Vị trí của một gian hàng trong bản khai.
 *
 * Dùng để chia BLOCK biển số: mỗi gian hàng lấy số trong một khoảng riêng nên hai chiếc xe của
 * hai chủ khác nhau không bao giờ mang cùng một biển (xem `buildPlate` ở `shop-fleet.ts`).
 */
export function shopOrdinal(spec: ShopSpec): number {
  const index = SHOP_SPECS.indexOf(spec);
  if (index < 0) {
    throw new Error(`Gian hàng "${spec.slug}" không nằm trong SHOP_SPECS — không chia được block.`);
  }
  return index;
}

/** Tổng số xe một gian hàng sẽ có — dùng cho dòng tóm tắt cuối lần seed. */
export function fleetSize(spec: ShopSpec): number {
  return spec.fleet.reduce((sum, entry) => sum + entry.count, 0);
}
