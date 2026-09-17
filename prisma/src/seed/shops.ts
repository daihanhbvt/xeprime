/**
 * Gian hàng demo — bản khai KHAI BÁO, không có logic.
 *
 * Hai NHÓM, và chúng phục vụ hai mục đích khác nhau:
 *
 * ## Nhóm DEMO (5 gian hàng)
 *
 * Khác nhau về QUY MÔ chứ không chỉ khác tên: 40 xe/4 chi nhánh, 10 xe/2 chi nhánh, 3 xe, 1
 * xe, và một gian hàng chưa xác minh. Để mọi màn hình có ít nhất một trường hợp thật để mở ra
 * xem — danh sách dài phải phân trang, danh sách một dòng phải không vỡ layout, gian hàng chưa
 * duyệt phải không rò xe nào ra chợ. Chúng có đơn, sổ khách, thu chi, đánh giá.
 *
 * ## Nhóm QA (2 gian hàng, tiền tố `qa-`)
 *
 * HAI tài khoản chuẩn để kiểm chứng RANH GIỚI HAI TUYẾN (ADR 0038), không phải để xem giao
 * diện đông dữ liệu:
 *
 * | Tài khoản | Tuyến | Đội xe | Khu làm việc |
 * | --- | --- | --- | --- |
 * | `qa.owner@xeprime.test` | hoa hồng (`free`) | đúng 3 xe (2 ô tô + 1 xe máy) | `/account` — Owner Lite |
 * | `qa.shop@xeprime.test` | gói (`per-vehicle`) | đúng 10 xe (8 ô tô + 2 xe máy) | `/manage` |
 *
 * Cả hai ở `depth: minimal` — **có xe, không có đơn**. Đó là cả điểm: một tài khoản QA lẫn 30
 * đơn demo thì mọi phép đếm trên màn hình đều phải trừ đi phần demo trước khi tin được, và
 * câu hỏi cần trả lời ở đây là 'chiếc xe thứ 4 có bị từ chối không', không phải 'sổ đơn trông
 * thế nào'. Hai gian hàng demo sâu ở trên vẫn còn nguyên cho câu hỏi kia.
 *
 * ## Nhóm CHỦ XE CÁ NHÂN (20 tài khoản, tuyến hoa hồng)
 *
 * Khai ở `commission-owners.ts` và nối vào `SHOP_SPECS` ở cuối file này. Mỗi người 1–3 xe, rải
 * trên 15 tỉnh — để chợ xe có mật độ thật ngoài bốn thành phố lớn, và để mặt tiền CÁ NHÂN
 * (avatar tài khoản thay logo, không dấu tick) có đủ mẫu để nhìn. Xem file đó để biết vì sao
 * nhóm này sinh từ bảng compact thay vì viết tay như hai nhóm trên.
 *
 * Đội xe QA cố ý TRỘN ô tô với xe máy: trần Owner Lite là 3 xe TỔNG
 * (`OWNER_LITE_VEHICLE_LIMIT`), không phải 3 mỗi loại, và một fixture toàn ô tô sẽ pass cả hai
 * cách hiểu. Tương tự, gian hàng QA mua đúng 8 chỗ ô tô + 2 chỗ xe máy chứ không mua một gói
 * 'không giới hạn' — số chỗ đã mua CHÍNH LÀ hạn mức (ADR 0015 điều 1), và một trần vô hạn
 * không kiểm chứng được gì.
 *
 * Chi tiết dựng dữ liệu nằm ở `shop.ts`; file này chỉ mô tả "gian hàng đó là gì".
 */
import {
  BRANCH_STATUS,
  DEFAULT_COMMISSION_PLAN_CODE,
  SHOP_PLAN_CODE,
  TENANT_STATUS,
  TENANT_ROLE,
} from '@xeprime/types';
import { COMMISSION_OWNER_SPECS } from './commission-owners';
import { photo, portrait } from './context';

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
    taxCode: string | null;
    businessLicenseNo: string | null;
    /** Tài khoản nhận tiền — seed vào `bank_accounts` (ADR 0033), KHÔNG vào hồ sơ gian hàng. */
    bank: { name: string; accountNo: string; accountName: string } | null;
  };
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

/**
 * Bảy gian hàng viết TAY — năm gian hàng demo và hai tài khoản QA hai tuyến.
 *
 * Nhóm thứ ba (20 chủ xe cá nhân tuyến hoa hồng) sinh từ bản khai compact ở
 * `commission-owners.ts` và được nối vào `SHOP_SPECS` ở cuối file.
 */
const HANDWRITTEN_SHOPS: readonly ShopSpec[] = [
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
      coverUrl: SHOP_COVER.fleet,
      taxCode: '0316123456',
      businessLicenseNo: '41C8123456',
      bank: {
        name: 'Vietcombank',
        accountNo: '0071000123456',
        accountName: 'CONG TY TNHH XEPRIME SAI GON',
      },
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
      {
        code: 'CN03',
        name: 'Chi nhánh Hải Châu',
        provinceCode: '48',
        address: '215 Nguyễn Văn Linh, Hải Châu, Đà Nẵng',
        wardCode: '20242',
        addressLine: '215 Nguyễn Văn Linh',
        phone: '02363001234',
        latitude: 16.0605,
        longitude: 108.2145,
      },
      {
        code: 'CN04',
        name: 'Chi nhánh Ninh Kiều',
        provinceCode: '92',
        address: '45 đường 30/4, Ninh Kiều, Cần Thơ',
        wardCode: '31135',
        addressLine: '45 đường 30/4',
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
    // 40 xe + 4 chi nhánh: chỉ bậc không giới hạn chứa nổi (ADR 0041 điều 7).
    planCode: SHOP_PLAN_CODE.PRO,
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
      coverUrl: SHOP_COVER.city,
      taxCode: '0108987654',
      businessLicenseNo: '01C8987654',
      bank: {
        name: 'Techcombank',
        accountNo: '19033888888',
        accountName: 'CONG TY TNHH VIET CAR',
      },
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
      { model: 'kia-morning', count: 1 },
      { model: 'kia-seltos', count: 1 },
      { model: 'hyundai-creta', count: 1 },
      { model: 'mitsubishi-xpander', count: 1 },
      { model: 'toyota-innova', count: 1 },
      { model: 'vinfast-vf5', count: 1 },
      { model: 'honda-vision', count: 1 },
      { model: 'honda-airblade', count: 1 },
    ],
    // 10 xe / 2 chi nhánh — vừa khít bậc nâng cao (10 xe / 3 chi nhánh).
    planCode: SHOP_PLAN_CODE.ADVANCED,
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
      coverUrl: SHOP_COVER.road,
      taxCode: null,
      businessLicenseNo: null,
      bank: {
        name: 'MB Bank',
        accountNo: '0904000001',
        accountName: 'NGO THANH HAI',
      },
    },
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
      { model: 'mazda-3', count: 1 },
      { model: 'honda-sh', count: 1 },
    ],
    // 3 xe / 1 chi nhánh — vừa khít bậc cơ bản.
    planCode: SHOP_PLAN_CODE.BASIC,
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
      avatarUrl: portrait('1500648767791-00dcc994a43e'),
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
    },
    branches: [
      {
        code: 'CN01',
        name: 'Cần Thơ',
        provinceCode: '92',
        address: 'Ninh Kiều, Cần Thơ',
        wardCode: '31135',
        addressLine: '',
        phone: '0905000001',
        latitude: 10.034,
        longitude: 105.783,
        isDefault: true,
      },
    ],
    fleet: [{ model: 'toyota-vios', count: 1 }],
    planCode: DEFAULT_COMMISSION_PLAN_CODE,
    depth: 'minimal',
    driverCount: 0,
    customerCount: 0,
    unapprovedEvery: 0,
  },

  /*
   * ── 5. Gian hàng mới mở, CHƯA XÁC MINH, chưa có xe ────────────────────────
   *
   * ADR 0036: gian hàng mở ra là ĐANG HOẠT ĐỘNG ngay — họ đăng xe được luôn, chỉ chưa có xe nào.
   * Cái còn nằm trong hàng đợi duyệt là hồ sơ XÁC MINH (điều kiện để mua gói), nên màn duyệt của
   * nền tảng vẫn có một phiếu gian hàng thật để demo.
   */
  {
    key: 'hue',
    code: 'HUE-NEW',
    slug: 'hue-rental-moi',
    name: 'Huế Rental',
    tenantType: 'individual',
    status: TENANT_STATUS.ACTIVE,
    verificationPending: true,
    owner: {
      email: 'owner.hue@xeprime.test',
      displayName: 'Nguyễn Thị Lan',
      phone: '0906000001',
      avatarUrl: portrait('1494790108377-be9c29b29330'),
    },
    staff: [],
    profile: {
      bio: 'Gian hàng mới mở tại Huế, hồ sơ đang chờ xác minh.',
      address: '5 Lê Lợi, TP. Huế',
      taxCode: null,
      businessLicenseNo: null,
      bank: null,
    },
    branches: [
      {
        code: 'CN01',
        name: 'Huế',
        provinceCode: '46',
        address: '5 Lê Lợi, TP. Huế',
        wardCode: '19789',
        addressLine: '5 Lê Lợi',
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
    planCode: DEFAULT_COMMISSION_PLAN_CODE,
    depth: 'none',
    driverCount: 0,
    customerCount: 0,
    unapprovedEvery: 0,
  },
  /*
   * ── QA 1. Chủ xe cá nhân, TUYẾN HOA HỒNG, đúng 3 xe ──────────────────────
   *
   * Fixture RIÊNG thay vì sửa một gian hàng demo có sẵn. Cần-Thơ là tuyến hoa hồng nhưng chỉ
   * có 1 xe (không chạm được trần), còn Đà-Nẵng có đúng 3 xe nhưng đang ở tuyến GÓI và đã có
   * đơn + phiếu thu chi — kéo nó về hoa hồng để lấy con số 3 là đổi tuyến của một tenant đã có
   * tiền chạy qua, tức là làm hỏng chính thứ dữ liệu demo đó tồn tại để kiểm.
   *
   * 2 ô tô + 1 xe máy = chạm đúng trần. Chiếc thứ 4 (loại nào cũng vậy) phải bị
   * `PLAN_LIMIT_REACHED` từ chối.
   */
  {
    key: 'qaOwner',
    code: 'QA-OWNER',
    slug: 'qa-chu-xe-hoa-hong',
    name: 'QA · Chủ xe cá nhân',
    tenantType: 'individual',
    status: TENANT_STATUS.ACTIVE,
    owner: {
      email: 'qa.owner@xeprime.test',
      displayName: 'QA Chủ xe cá nhân',
      phone: '0908000001',
      avatarUrl: portrait('1506794778202-cad84cf45f1d'),
    },
    staff: [],
    profile: {
      bio: 'Tài khoản kiểm thử: chủ xe cá nhân tuyến hoa hồng, đúng 3 xe, làm việc ở khu tài khoản.',
      address: 'Cầu Giấy, Hà Nội',
      taxCode: null,
      businessLicenseNo: null,
      bank: null,
    },
    branches: [
      {
        code: 'CN01',
        name: 'Hà Nội',
        provinceCode: '01',
        address: 'Cầu Giấy, Hà Nội',
        wardCode: '00166',
        addressLine: '',
        phone: '0908000001',
        latitude: 21.0333,
        longitude: 105.79,
        isDefault: true,
      },
    ],
    fleet: [
      { model: 'toyota-vios', count: 1 },
      { model: 'kia-morning', count: 1 },
      { model: 'honda-vision', count: 1 },
    ],
    planCode: DEFAULT_COMMISSION_PLAN_CODE,
    depth: 'minimal',
    driverCount: 0,
    customerCount: 0,
    unapprovedEvery: 0,
  },

  /*
   * ── QA 2. Gian hàng TUYẾN GÓI, đúng 10 xe / 10 chỗ ───────────────────────
   *
   * Bậc NÂNG CAO có trần đúng 10 xe (ADR 0041 điều 1) — KHÔNG phải một gói 'không giới hạn'.
   * Fixture này vì thế kiểm được cả hai chiều: 10 xe hiện có đều hợp lệ, và chiếc thứ 11 bị từ
   * chối. Trần là TỔNG hai loại, nên chiếc thứ 11 bị chặn dù nó là ô tô hay xe máy.
   */
  {
    key: 'qaShop',
    code: 'QA-SHOP',
    slug: 'qa-gian-hang-goi',
    name: 'QA · Gian hàng gói',
    tenantType: 'business',
    status: TENANT_STATUS.ACTIVE,
    owner: {
      email: 'qa.shop@xeprime.test',
      displayName: 'QA Chủ gian hàng',
      phone: '0908000002',
    },
    staff: [],
    profile: {
      bio: 'Tài khoản kiểm thử: gian hàng thuê bao theo chỗ, đúng 10 xe, làm việc ở cổng quản lý.',
      address: 'Quận 1, TP. Hồ Chí Minh',
      coverUrl: SHOP_COVER.fleet,
      taxCode: '0316999888',
      businessLicenseNo: '41C8999888',
      bank: {
        name: 'Vietcombank',
        accountNo: '0071000999888',
        accountName: 'CONG TY TNHH QA GIAN HANG',
      },
    },
    branches: [
      {
        code: 'CN01',
        name: 'Quận 1',
        provinceCode: '79',
        address: 'Quận 1, TP. Hồ Chí Minh',
        wardCode: '26740',
        addressLine: '12 Nguyễn Huệ',
        phone: '0908000002',
        latitude: 10.7743,
        longitude: 106.7038,
        isDefault: true,
      },
    ],
    fleet: [
      { model: 'toyota-vios', count: 1 },
      { model: 'honda-city', count: 1 },
      { model: 'hyundai-accent', count: 1 },
      { model: 'kia-morning', count: 1 },
      { model: 'kia-seltos', count: 1 },
      { model: 'hyundai-creta', count: 1 },
      { model: 'mitsubishi-xpander', count: 1 },
      { model: 'toyota-innova', count: 1 },
      { model: 'honda-vision', count: 1 },
      { model: 'honda-airblade', count: 1 },
    ],
    planCode: SHOP_PLAN_CODE.ADVANCED,
    depth: 'minimal',
    driverCount: 0,
    customerCount: 0,
    unapprovedEvery: 0,
  },
];

/**
 * Mọi gian hàng của seed demo: bảy bản viết tay ở trên + hai mươi chủ xe cá nhân tuyến hoa hồng.
 *
 * Thứ tự có ý nghĩa với người đọc log chứ không với dữ liệu: gian hàng lớn trước, tài khoản QA
 * giữa, đám chủ xe cá nhân sau — đọc từ trên xuống là đi từ "nhiều dữ liệu nhất" tới "ít nhất".
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
