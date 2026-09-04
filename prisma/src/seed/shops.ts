/**
 * Năm gian hàng demo — bản khai KHAI BÁO, không có logic.
 *
 * Năm gian hàng khác nhau về QUY MÔ chứ không chỉ khác tên: 40 xe/4 chi nhánh, 10 xe/2 chi
 * nhánh, 3 xe, 1 xe, và một gian hàng chưa được duyệt. Đó là để mọi màn hình có ít nhất một
 * trường hợp thật để mở ra xem — danh sách dài phải phân trang, danh sách một dòng phải không
 * vỡ layout, và gian hàng chưa duyệt phải không rò xe nào ra marketplace.
 *
 * Chi tiết dựng dữ liệu nằm ở `shop-builder.ts`; file này chỉ mô tả "gian hàng đó là gì".
 */
import { BRANCH_STATUS, TENANT_STATUS, TENANT_ROLE } from '@xeprime/types';

export interface BranchSpec {
  code: string;
  name: string;
  /** Mã tỉnh chính thức — phải có trong danh mục `provinces` do migration nạp. */
  provinceCode: string;
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
  status: string;
  owner: { email: string; displayName: string; phone: string };
  staff: readonly StaffSpec[];
  profile: {
    bio: string;
    address: string;
    taxCode: string | null;
    businessLicenseNo: string | null;
    bank: { name: string; accountNo: string; accountName: string } | null;
    ownerFullName: string;
  };
  branches: readonly BranchSpec[];
  fleet: readonly FleetEntry[];
  /** Mã gói thuê bao đang dùng — null = chưa gán gói. */
  planCode: string | null;
  /** Số chỗ đã mua (ADR 0029 — gói giá phẳng theo chỗ): đặt ≥ đội xe để demo còn thêm xe được. */
  planSlots?: { car: number; motorbike: number };
  depth: ShopDepth;
  driverCount: number;
  customerCount: number;
  /** Cứ mỗi N xe thì để 1 xe chưa duyệt public. 0 = duyệt hết. */
  unapprovedEvery: number;
}

export const SHOP_SPECS: readonly ShopSpec[] = [
  // ── 1. Gian hàng lớn: 40 xe, 4 chi nhánh ở bốn thành phố lớn ─────────────
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
        'Đội xe hơn 40 chiếc từ hạng A tới 16 chỗ, có mặt ở TP.HCM, Hà Nội, Đà Nẵng và Cần Thơ. ' +
        'Nhận thuê tự lái, thuê kèm tài xế và thuê dài hạn theo tháng. Giao xe tận nơi nội thành.',
      address: '123 Nguyễn Văn Cừ, Quận 5, TP. Hồ Chí Minh',
      taxCode: '0316123456',
      businessLicenseNo: '41C8123456',
      bank: {
        name: 'Vietcombank',
        accountNo: '0071000123456',
        accountName: 'CONG TY TNHH XEPRIME SAI GON',
      },
      ownerFullName: 'Trần Quốc Bảo',
    },
    branches: [
      {
        code: 'CN01',
        name: 'Chi nhánh Quận 5',
        provinceCode: '79',
        address: '123 Nguyễn Văn Cừ, Quận 5, TP. Hồ Chí Minh',
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
        phone: '02439001234',
        latitude: 21.0313,
        longitude: 105.7873,
      },
      {
        code: 'CN03',
        name: 'Chi nhánh Hải Châu',
        provinceCode: '48',
        address: '215 Nguyễn Văn Linh, Hải Châu, Đà Nẵng',
        phone: '02363001234',
        latitude: 16.0605,
        longitude: 108.2145,
      },
      {
        code: 'CN04',
        name: 'Chi nhánh Ninh Kiều',
        provinceCode: '92',
        address: '45 đường 30/4, Ninh Kiều, Cần Thơ',
        phone: '02923001234',
        latitude: 10.0299,
        longitude: 105.77,
      },
    ],
    fleet: [
      { model: 'toyota-vios', count: 1 },
      { model: 'honda-city', count: 2 },
      { model: 'hyundai-accent', count: 2 },
      { model: 'kia-morning', count: 1 },
      { model: 'hyundai-i10', count: 1 },
      { model: 'vinfast-fadil', count: 1 },
      { model: 'kia-k3', count: 2 },
      { model: 'mazda-3', count: 1 },
      { model: 'toyota-camry', count: 2 },
      { model: 'mercedes-c200', count: 1 },
      { model: 'kia-seltos', count: 1 },
      { model: 'hyundai-creta', count: 1 },
      { model: 'mitsubishi-xforce', count: 1 },
      { model: 'toyota-corolla-cross-hev', count: 1 },
      { model: 'vinfast-vf5', count: 1 },
      { model: 'vinfast-vf8', count: 1 },
      { model: 'toyota-fortuner', count: 2 },
      { model: 'ford-everest', count: 1 },
      { model: 'hyundai-santafe', count: 1 },
      { model: 'mitsubishi-xpander', count: 2 },
      { model: 'toyota-innova', count: 2 },
      { model: 'toyota-veloz', count: 1 },
      { model: 'kia-carnival', count: 1 },
      { model: 'ford-ranger', count: 1 },
      { model: 'ford-transit', count: 1 },
      { model: 'hyundai-solati', count: 1 },
      { model: 'suzuki-blind-van', count: 1 },
      { model: 'suzuki-carry-pro', count: 1 },
      { model: 'honda-vision', count: 1 },
      { model: 'honda-airblade', count: 1 },
      { model: 'honda-sh', count: 1 },
      { model: 'yamaha-exciter', count: 1 },
      { model: 'vinfast-klara', count: 1 },
    ],
    planCode: 'per-vehicle',
    planSlots: { car: 35, motorbike: 5 },
    depth: 'full',
    driverCount: 4,
    customerCount: 12,
    unapprovedEvery: 9,
  },

  // ── 2. Gian hàng vừa: 10 xe, 2 chi nhánh ─────────────────────────────────
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
    staff: [
      {
        roleKey: TENANT_ROLE.SHOP_STAFF,
        email: 'staff.hanoi@xeprime.test',
        displayName: 'Hoàng Minh Quân',
        phone: '0903000011',
      },
    ],
    profile: {
      bio:
        'Cho thuê xe tự lái và thuê tháng tại Hà Nội, Hải Phòng. Xe đời mới, bảo dưỡng đúng hạn, ' +
        'thủ tục nhanh gọn trong 15 phút.',
      address: '12 Lê Văn Lương, Thanh Xuân, Hà Nội',
      taxCode: '0108987654',
      businessLicenseNo: '01C8987654',
      bank: {
        name: 'Techcombank',
        accountNo: '19033888888',
        accountName: 'CONG TY TNHH VIET CAR',
      },
      ownerFullName: 'Phạm Đức Việt',
    },
    branches: [
      {
        code: 'CN01',
        name: 'Chi nhánh Thanh Xuân',
        provinceCode: '01',
        address: '12 Lê Văn Lương, Thanh Xuân, Hà Nội',
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
        phone: '02258887777',
        latitude: 20.843,
        longitude: 106.672,
      },
    ],
    fleet: [
      { model: 'toyota-vios', count: 1 },
      { model: 'honda-city', count: 1 },
      { model: 'kia-morning', count: 1 },
      { model: 'kia-seltos', count: 1 },
      { model: 'hyundai-creta', count: 1 },
      { model: 'mitsubishi-xpander', count: 1 },
      { model: 'toyota-innova', count: 1 },
      { model: 'vinfast-vf5', count: 1 },
      { model: 'honda-vision', count: 1 },
      { model: 'honda-airblade', count: 1 },
    ],
    planCode: 'per-vehicle',
    planSlots: { car: 8, motorbike: 2 },
    depth: 'medium',
    driverCount: 2,
    customerCount: 6,
    unapprovedEvery: 7,
  },

  // ── 3. Gian hàng nhỏ: 3 xe ───────────────────────────────────────────────
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
      bio: 'Ba chiếc xe nhà, chủ tự giao nhận tại Đà Nẵng. Ưu tiên khách thuê theo ngày và cuối tuần.',
      address: '30 Nguyễn Chí Thanh, Hải Châu, Đà Nẵng',
      taxCode: null,
      businessLicenseNo: null,
      bank: {
        name: 'MB Bank',
        accountNo: '0904000001',
        accountName: 'NGO THANH HAI',
      },
      ownerFullName: 'Ngô Thanh Hải',
    },
    branches: [
      {
        code: 'CN01',
        name: 'Đà Nẵng',
        provinceCode: '48',
        address: '30 Nguyễn Chí Thanh, Hải Châu, Đà Nẵng',
        phone: '0904000001',
        latitude: 16.0715,
        longitude: 108.22,
        isDefault: true,
      },
    ],
    fleet: [
      { model: 'hyundai-i10', count: 1 },
      { model: 'mazda-3', count: 1 },
      { model: 'honda-sh', count: 1 },
    ],
    planCode: 'per-vehicle',
    planSlots: { car: 2, motorbike: 1 },
    depth: 'light',
    driverCount: 0,
    customerCount: 3,
    unapprovedEvery: 0,
  },

  // ── 4. Gian hàng một xe, hồ sơ CHƯA ĐẦY ĐỦ ───────────────────────────────
  {
    key: 'cantho',
    code: 'CT-SOLO',
    slug: 'xe-nha-can-tho',
    name: 'Xe Nhà Cần Thơ',
    tenantType: 'individual',
    status: TENANT_STATUS.ACTIVE,
    owner: {
      email: 'owner.cantho@xeprime.test',
      displayName: 'Huỳnh Văn Tài',
      phone: '0905000001',
    },
    staff: [],
    // Cố ý thiếu tài khoản ngân hàng và giấy phép: mọi màn "hồ sơ chưa đủ", mọi cảnh báo bổ
    // sung thông tin đều cần một gian hàng THẬT ở trạng thái đó để mở ra xem.
    profile: {
      bio: 'Xe gia đình cho thuê lúc rảnh. Liên hệ trước một ngày để sắp lịch.',
      address: 'Ninh Kiều, Cần Thơ',
      taxCode: null,
      businessLicenseNo: null,
      bank: null,
      ownerFullName: 'Huỳnh Văn Tài',
    },
    branches: [
      {
        code: 'CN01',
        name: 'Cần Thơ',
        provinceCode: '92',
        address: 'Ninh Kiều, Cần Thơ',
        phone: '0905000001',
        latitude: 10.034,
        longitude: 105.783,
        isDefault: true,
      },
    ],
    fleet: [{ model: 'toyota-vios', count: 1 }],
    planCode: 'free',
    depth: 'minimal',
    driverCount: 0,
    customerCount: 0,
    unapprovedEvery: 0,
  },

  // ── 5. Gian hàng CHƯA DUYỆT, chưa có xe ──────────────────────────────────
  {
    key: 'hue',
    code: 'HUE-NEW',
    slug: 'hue-rental-moi',
    name: 'Huế Rental',
    tenantType: 'individual',
    status: TENANT_STATUS.PENDING_REVIEW,
    owner: {
      email: 'owner.hue@xeprime.test',
      displayName: 'Nguyễn Thị Lan',
      phone: '0906000001',
    },
    staff: [],
    profile: {
      bio: 'Gian hàng mới mở tại Huế, đang chờ duyệt hồ sơ.',
      address: '5 Lê Lợi, TP. Huế',
      taxCode: null,
      businessLicenseNo: null,
      bank: null,
      ownerFullName: 'Nguyễn Thị Lan',
    },
    branches: [
      {
        code: 'CN01',
        name: 'Huế',
        provinceCode: '46',
        address: '5 Lê Lợi, TP. Huế',
        phone: '0906000001',
        latitude: 16.464,
        longitude: 107.593,
        isDefault: true,
        status: BRANCH_STATUS.ACTIVE,
      },
    ],
    fleet: [],
    // `free` chứ không phải null: từ ADR 0015 điều 9, `registerShop` gán gói mặc định NGAY lúc
    // mở gian hàng, nên "gian hàng không có gói" là trạng thái không còn tồn tại trong dữ liệu
    // thật. Giữ null ở đây là dựng một ca test cho một thế giới đã biến mất — và che mất việc
    // gian hàng chưa duyệt VẪN có gói (gói không phụ thuộc duyệt).
    planCode: 'free',
    depth: 'none',
    driverCount: 0,
    customerCount: 0,
    unapprovedEvery: 0,
  },
];

/** Tổng số xe một gian hàng sẽ có — dùng cho dòng tóm tắt cuối lần seed. */
export function fleetSize(spec: ShopSpec): number {
  return spec.fleet.reduce((sum, entry) => sum + entry.count, 0);
}
