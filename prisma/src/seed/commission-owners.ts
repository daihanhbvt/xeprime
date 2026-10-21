/**
 * Chủ xe cá nhân TUYẾN HOA HỒNG của dữ liệu demo — ba người: 1 xe, 2 xe, 3 xe.
 *
 * File này SINH bản khai từ một bảng compact thay vì viết tay như `shops.ts`: các chủ xe cá nhân chỉ
 * khác nhau ở con người, chỗ ở và mấy chiếc xe — những thứ PHẢI giống nhau (`planCodes`,
 * `tenantType`, một chi nhánh là chỗ ở) thì giống nhau theo cấu trúc, và thêm một người là thêm
 * một dòng. Bản khai ra ngoài vẫn là `ShopSpec` như mọi gian hàng khác.
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
      businessLicenseNo: null,
      bank: input.bank ? { ...input.bank, accountName: bankAccountName(input.name) } : null,
    },
    // Chủ xe cá nhân chưa khai thuế — bản nháp tạo lười khi họ mở "Thông tin khai thuế".
    seller: null,
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
    planCodes: [DEFAULT_COMMISSION_PLAN_CODE],
    depth: input.depth,
    // Cá nhân thì không thuê tài xế — chuyến có tài xế là chính chủ cầm lái.
    driverCount: 0,
    customerCount: input.customerCount,
    unapprovedEvery: input.unapprovedEvery ?? 0,
  };
}

/**
 * Ba chủ xe cá nhân: 1 xe, 2 xe, 3 xe — đủ để thấy mặt tiền cá nhân, chuyến của chủ xe hoa hồng và
 * trần 3 xe của Owner Lite (người 3 xe trộn 2 ô tô + 1 xe máy: trần tính TỔNG, không theo loại).
 */
const OWNERS: readonly OwnerInput[] = [
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
];

/** Bản khai `ShopSpec` của ba chủ xe cá nhân — `shops.ts` nối vào `SHOP_SPECS`. */
export const COMMISSION_OWNER_SPECS: readonly ShopSpec[] = OWNERS.map(toShopSpec);
