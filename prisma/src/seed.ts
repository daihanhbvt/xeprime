/**
 * Seed dữ liệu demo cho 3 scope: platform admin / shop owner / customer.
 *
 * Idempotent: chạy nhiều lần không nhân bản dữ liệu. Chạy lại sau khi sửa seed là thao
 * tác thường xuyên lúc dev, nên seed phải chịu được điều đó.
 *
 * Chạy: pnpm db:seed
 */
import {
  BODY_TYPE,
  BOOKING_STATUS,
  DEFAULT_PLATFORM_ROLE_PERMISSIONS,
  DEFAULT_TENANT_ROLE_PERMISSIONS,
  FINANCE_CATEGORY_TYPE,
  FUEL_TYPE,
  LISTING_STATUS,
  MEMBERSHIP_STATUS,
  OCCUPANCY_SOURCE_TYPE,
  PERMISSION_VALUES,
  PLATFORM_ROLE,
  PLATFORM_ROLE_LABEL,
  REVIEW_STATUS,
  SCOPE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_ROLE_LABEL,
  TENANT_STATUS,
  USER_STATUS,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  type Permission,
} from '@xeprime/types';
import bcrypt from 'bcryptjs';
import { ulid } from 'ulid';
import { createPrismaClient } from './index';

// Prisma 7: client cần driver adapter (ADR 0001). Chạy qua `dotenv -e ../.env` nên
// DATABASE_URL đã có trong env.
const prisma = createPrismaClient();

const BCRYPT_ROUNDS = 12;
// Tài khoản đăng nhập lấy từ env (mật khẩu KHÔNG hard-code trong seed). Có default cho dev local.
const PLATFORM_ADMIN_EMAIL = (process.env.PLATFORM_ADMIN_EMAIL ?? 'admin@xeprime.vn')
  .trim()
  .toLowerCase();
const PLATFORM_ADMIN_PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD ?? 'Abcd1234';
const DEMO_OWNER_PASSWORD = process.env.DEMO_OWNER_PASSWORD ?? 'Abcd1234';

/** Mốc thời gian cố định để seed cho ra lịch giống nhau mỗi lần chạy. */
const TODAY = new Date();
TODAY.setUTCHours(0, 0, 0, 0);

function daysFromToday(days: number, hourUtc = 3): Date {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

async function seedPermissions(): Promise<Map<Permission, string>> {
  const byKey = new Map<Permission, string>();

  for (const key of PERMISSION_VALUES) {
    const [module = 'core'] = key.split('.');
    const row = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: {
        id: ulid(),
        key,
        name: key,
        module: key.startsWith('platform.') ? 'platform' : module,
        scope: key.startsWith('platform.') ? SCOPE.PLATFORM : SCOPE.TENANT,
      },
      select: { id: true },
    });
    byKey.set(key, row.id);
  }

  console.log(`  permissions: ${byKey.size}`);
  return byKey;
}

async function seedSystemRole(
  scope: string,
  key: string,
  name: string,
  permissions: readonly Permission[],
  permissionIds: Map<Permission, string>,
): Promise<string> {
  const existing = await prisma.role.findFirst({
    where: { scope, key, tenantId: null },
    select: { id: true },
  });

  const roleId =
    existing?.id ??
    (
      await prisma.role.create({
        data: { id: ulid(), scope, key, name, isSystem: true, tenantId: null },
        select: { id: true },
      })
    ).id;

  // Ghi đè toàn bộ quyền của role hệ thống: seed là nguồn sự thật cho chúng, và xoá một
  // quyền khỏi DEFAULT_* phải thực sự thu hồi được.
  await prisma.rolePermission.deleteMany({ where: { roleId } });
  await prisma.rolePermission.createMany({
    data: permissions
      .map((p) => permissionIds.get(p))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId, permissionId })),
    skipDuplicates: true,
  });

  return roleId;
}

/**
 * Tạo/cập nhật user đăng nhập bằng email + mật khẩu (bcrypt). Idempotent theo email.
 *
 * Đặt cả `passwordHash` (loginWithPassword đọc field này) lẫn identity `provider='password'`
 * cho nhất quán với `AuthService.register()`. Nếu email đã tồn tại (VD owner tạo từ seed cũ
 * bằng provider 'mock') thì chỉ set thêm mật khẩu, giữ nguyên dữ liệu shop đã gắn.
 */
async function upsertPasswordUser(input: {
  email: string;
  password: string;
  displayName: string;
  phoneVerified: boolean;
}): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const userId = existing?.id ?? ulid();

  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, displayName: input.displayName, status: USER_STATUS.ACTIVE },
      });
    } else {
      await tx.user.create({
        data: {
          id: userId,
          email,
          emailVerifiedAt: new Date(),
          displayName: input.displayName,
          phoneVerifiedAt: input.phoneVerified ? new Date() : null,
          passwordHash,
          status: USER_STATUS.ACTIVE,
        },
      });
    }
    await tx.userIdentity.upsert({
      where: { provider_providerUserId: { provider: 'password', providerUserId: email } },
      update: {},
      create: {
        id: ulid(),
        userId,
        provider: 'password',
        providerUserId: email,
        providerEmail: email,
      },
    });
  });

  return userId;
}

/** URL ảnh Unsplash pinned theo photo id — demo card/gallery có ảnh thật, ổn định giữa các lần seed. */
const photo = (id: string): string =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=70`;

interface DemoVehicle {
  code: string;
  name: string;
  plate: string;
  type: string;
  seats: number;
  /** Key trong danh mục `vehicle_brand` (bảng `catalog_items`), KHÔNG phải tên hiển thị. */
  brand: string;
  model: string;
  /** Kiểu dáng thân xe — chỉ ô tô; xe máy để undefined. */
  body?: string;
  fuel: string;
  year: number;
  color: string;
  weekday: number;
  weekend: number;
  /** Giá thuê giờ — có = xe lên tiện ích "Thuê theo giờ". */
  hourly?: number;
  delivery?: boolean;
  noCollateral?: boolean;
  /** % giảm giá marketing. */
  discount?: number;
  features?: readonly string[];
  img?: string;
  gallery?: readonly string[];
  desc: string;
  approved: boolean;
}

// `approved: true` = mô phỏng xe đã qua duyệt public (luồng duyệt thật ở Phase 2) để
// Marketplace có dữ liệu lúc dev. Để lẫn vài xe draft cho giống thực tế. Dữ liệu phủ đủ các
// chiều của bộ lọc facet: kiểu dáng / hãng / số chỗ / nhiên liệu / tính năng / tiện ích.
const DEMO_VEHICLES: readonly DemoVehicle[] = [
  {
    code: 'XE-001',
    name: 'Toyota Vios 2022',
    plate: '51H-123.45',
    type: VEHICLE_TYPE.CAR,
    seats: 5,
    brand: 'toyota',
    model: 'Vios',
    body: BODY_TYPE.SEDAN,
    fuel: FUEL_TYPE.GASOLINE,
    year: 2022,
    color: 'Trắng',
    weekday: 650_000,
    weekend: 800_000,
    hourly: 90_000,
    delivery: true,
    discount: 10,
    features: ['bluetooth', 'backup_camera', 'usb', 'map', 'airbag'],
    img: photo('1550355291-bbee04a92027'),
    gallery: [photo('1502877338535-766e1452684a'), photo('1533473359331-0135ef1b58bf')],
    desc: 'Sedan quốc dân tiết kiệm xăng, phù hợp đi phố lẫn về quê. Xe bảo dưỡng định kỳ tại hãng.',
    approved: true,
  },
  {
    code: 'XE-002',
    name: 'Honda City 2021',
    plate: '51H-234.56',
    type: VEHICLE_TYPE.CAR,
    seats: 5,
    brand: 'honda',
    model: 'City',
    body: BODY_TYPE.SEDAN,
    fuel: FUEL_TYPE.GASOLINE,
    year: 2021,
    color: 'Đỏ',
    weekday: 700_000,
    weekend: 850_000,
    delivery: true,
    noCollateral: true,
    features: ['bluetooth', 'gps', 'reverse_sensor', 'screen', 'airbag'],
    img: photo('1549317661-bd32c8ce0db2'),
    gallery: [photo('1542362567-b07e54358753')],
    desc: 'Sedan lái đầm, cách âm tốt. Hỗ trợ giao xe tận nơi nội thành, thủ tục nhanh gọn.',
    approved: true,
  },
  {
    code: 'XE-003',
    name: 'Mazda3 2023',
    plate: '51H-987.65',
    type: VEHICLE_TYPE.CAR,
    seats: 5,
    brand: 'mazda',
    model: 'Mazda3',
    body: BODY_TYPE.SEDAN,
    fuel: FUEL_TYPE.GASOLINE,
    year: 2023,
    color: 'Xám',
    weekday: 800_000,
    weekend: 950_000,
    hourly: 110_000,
    features: ['bluetooth', 'camera_360', 'screen', 'airbag', 'etc'],
    img: photo('1542362567-b07e54358753'),
    gallery: [photo('1511919884226-fd3cad34687c')],
    desc: 'Thiết kế Kodo sang trọng, nội thất da, màn hình lớn. Xe gia đình giữ kỹ.',
    approved: true,
  },
  {
    code: 'XE-004',
    name: 'Kia Carnival 2022',
    plate: '51H-456.78',
    type: VEHICLE_TYPE.CAR,
    seats: 7,
    brand: 'kia',
    model: 'Carnival',
    body: BODY_TYPE.MPV,
    fuel: FUEL_TYPE.DIESEL,
    year: 2022,
    color: 'Đen',
    weekday: 1_600_000,
    weekend: 1_900_000,
    features: ['camera_360', 'sunroof', 'screen', 'child_seat', 'airbag'],
    img: photo('1519641471654-76ce0107ad1b'),
    desc: 'MPV 7 chỗ rộng rãi cho gia đình đông người, khoang hành lý lớn.',
    approved: false,
  },
  {
    code: 'XE-005',
    name: 'Ford Ranger 2021',
    plate: '51C-567.89',
    type: VEHICLE_TYPE.CAR,
    seats: 5,
    brand: 'ford',
    model: 'Ranger',
    body: BODY_TYPE.PICKUP,
    fuel: FUEL_TYPE.DIESEL,
    year: 2021,
    color: 'Xanh dương',
    weekday: 1_200_000,
    weekend: 1_400_000,
    delivery: true,
    features: ['dash_camera', 'gps', 'spare_tire', 'etc'],
    img: photo('1571068316344-75bc76f77890'),
    gallery: [photo('1533473359331-0135ef1b58bf')],
    desc: 'Bán tải mạnh mẽ, gầm cao, chở đồ thoải mái — hợp đi công trình, phượt xa.',
    approved: true,
  },
  {
    code: 'XE-006',
    name: 'VinFast Fadil 2022',
    plate: '51K-135.79',
    type: VEHICLE_TYPE.CAR,
    seats: 5,
    brand: 'vinfast',
    model: 'Fadil',
    body: BODY_TYPE.MINI,
    fuel: FUEL_TYPE.GASOLINE,
    year: 2022,
    color: 'Trắng',
    weekday: 480_000,
    weekend: 550_000,
    hourly: 70_000,
    noCollateral: true,
    discount: 15,
    features: ['bluetooth', 'usb', 'airbag'],
    img: photo('1502877338535-766e1452684a'),
    desc: 'Hatchback nhỏ gọn dễ lái, dễ đỗ trong phố. Giá mềm cho người mới lấy bằng.',
    approved: true,
  },
  {
    code: 'XE-007',
    name: 'Kia Morning 2021',
    plate: '51K-246.80',
    type: VEHICLE_TYPE.CAR,
    seats: 4,
    brand: 'kia',
    model: 'Morning',
    body: BODY_TYPE.MINI,
    fuel: FUEL_TYPE.GASOLINE,
    year: 2021,
    color: 'Vàng',
    weekday: 450_000,
    weekend: 520_000,
    delivery: true,
    features: ['usb', 'bluetooth'],
    img: photo('1533473359331-0135ef1b58bf'),
    desc: 'Xe nhỏ tiết kiệm, chạy phố cực linh hoạt. Phù hợp cặp đôi đi chơi cuối tuần.',
    approved: true,
  },
  {
    code: 'XE-008',
    name: 'Hyundai Grand i10 2023',
    plate: '51K-357.91',
    type: VEHICLE_TYPE.CAR,
    seats: 5,
    brand: 'hyundai',
    model: 'Grand i10',
    body: BODY_TYPE.MINI,
    fuel: FUEL_TYPE.GASOLINE,
    year: 2023,
    color: 'Bạc',
    weekday: 500_000,
    weekend: 580_000,
    hourly: 75_000,
    discount: 5,
    features: ['bluetooth', 'map', 'usb'],
    img: photo('1511919884226-fd3cad34687c'),
    desc: 'Đời mới, màn hình giải trí kết nối điện thoại, điều hoà mát sâu.',
    approved: true,
  },
  {
    code: 'XE-009',
    name: 'VinFast VF e34 2023',
    plate: '51K-468.02',
    type: VEHICLE_TYPE.CAR,
    seats: 5,
    brand: 'vinfast',
    model: 'VF e34',
    body: BODY_TYPE.CUV,
    fuel: FUEL_TYPE.ELECTRIC,
    year: 2023,
    color: 'Xanh rêu',
    weekday: 900_000,
    weekend: 1_050_000,
    delivery: true,
    noCollateral: true,
    features: ['screen', 'camera_360', 'gps', 'map', 'airbag'],
    img: photo('1617788138017-80ad40651399'),
    gallery: [photo('1502877338535-766e1452684a')],
    desc: 'CUV điện êm ru, không tốn xăng — thuê kèm hướng dẫn trạm sạc miễn phí.',
    approved: true,
  },
  {
    code: 'XE-010',
    name: 'Kia Seltos 2022',
    plate: '51K-579.13',
    type: VEHICLE_TYPE.CAR,
    seats: 5,
    brand: 'kia',
    model: 'Seltos',
    body: BODY_TYPE.CUV,
    fuel: FUEL_TYPE.GASOLINE,
    year: 2022,
    color: 'Cam',
    weekday: 850_000,
    weekend: 1_000_000,
    hourly: 120_000,
    features: ['sunroof', 'backup_camera', 'bluetooth', 'screen'],
    img: photo('1503376780353-7e6692767b70'),
    desc: 'CUV cỡ nhỏ trẻ trung, cửa sổ trời, ghế da thể thao.',
    approved: true,
  },
  {
    code: 'XE-011',
    name: 'Mazda CX-5 2023',
    plate: '51H-345.67',
    type: VEHICLE_TYPE.CAR,
    seats: 5,
    brand: 'mazda',
    model: 'CX-5',
    body: BODY_TYPE.SUV,
    fuel: FUEL_TYPE.GASOLINE,
    year: 2023,
    color: 'Đỏ mận',
    weekday: 1_100_000,
    weekend: 1_300_000,
    hourly: 150_000,
    features: ['camera_360', 'sunroof', 'etc', 'spare_tire', 'airbag', 'screen'],
    img: photo('1494976388531-d1058494cdd8'),
    gallery: [photo('1542362567-b07e54358753'), photo('1549317661-bd32c8ce0db2')],
    desc: 'SUV 5 chỗ rộng rãi, cách âm tốt, đầy đủ an toàn — hợp cả gia đình lẫn công tác.',
    approved: true,
  },
  {
    code: 'XE-012',
    name: 'Hyundai SantaFe 2022',
    plate: '51H-680.24',
    type: VEHICLE_TYPE.CAR,
    seats: 7,
    brand: 'hyundai',
    model: 'SantaFe',
    body: BODY_TYPE.SUV,
    fuel: FUEL_TYPE.DIESEL,
    year: 2022,
    color: 'Đen',
    weekday: 1_500_000,
    weekend: 1_750_000,
    delivery: true,
    features: ['camera_360', 'sunroof', 'etc', 'child_seat', 'airbag', 'screen'],
    img: photo('1568605117036-5fe5e7bab0b7'),
    desc: 'SUV 7 chỗ máy dầu mạnh mẽ, đi đường dài cực sướng.',
    approved: true,
  },
  {
    code: 'XE-013',
    name: 'Mitsubishi Xpander 2023',
    plate: '51H-791.35',
    type: VEHICLE_TYPE.CAR,
    seats: 7,
    brand: 'mitsubishi',
    model: 'Xpander',
    body: BODY_TYPE.MPV,
    fuel: FUEL_TYPE.GASOLINE,
    year: 2023,
    color: 'Trắng',
    weekday: 800_000,
    weekend: 950_000,
    delivery: true,
    discount: 10,
    features: ['backup_camera', 'bluetooth', 'usb', 'child_seat'],
    img: photo('1519641471654-76ce0107ad1b'),
    desc: 'MPV 7 chỗ bán chạy nhất phân khúc — rộng rãi, tiết kiệm xăng.',
    approved: true,
  },
  {
    code: 'XE-014',
    name: 'Ford Transit 2021',
    plate: '51B-802.46',
    type: VEHICLE_TYPE.CAR,
    seats: 16,
    brand: 'ford',
    model: 'Transit',
    body: BODY_TYPE.MINIBUS,
    fuel: FUEL_TYPE.DIESEL,
    year: 2021,
    color: 'Bạc',
    weekday: 1_800_000,
    weekend: 2_100_000,
    features: ['dash_camera', 'gps'],
    img: photo('1570125909232-eb263c188f7e'),
    desc: 'Xe 16 chỗ chuyên tour, đưa đón sân bay, đi lễ — tài xế thuê thêm theo yêu cầu.',
    approved: true,
  },
  {
    code: 'XM-001',
    name: 'Honda Vision 2023',
    plate: '59X1-111.22',
    type: VEHICLE_TYPE.MOTORBIKE,
    seats: 2,
    brand: 'honda',
    model: 'Vision',
    fuel: FUEL_TYPE.GASOLINE,
    year: 2023,
    color: 'Đỏ',
    weekday: 130_000,
    weekend: 160_000,
    hourly: 30_000,
    noCollateral: true,
    img: photo('1558981403-c5f9899a28bc'),
    desc: 'Tay ga quốc dân, nhẹ nhàng dễ chạy, cốp rộng — kèm 2 mũ bảo hiểm.',
    approved: true,
  },
  {
    code: 'XM-002',
    name: 'Yamaha Janus 2022',
    plate: '59X1-222.33',
    type: VEHICLE_TYPE.MOTORBIKE,
    seats: 2,
    brand: 'yamaha',
    model: 'Janus',
    fuel: FUEL_TYPE.GASOLINE,
    year: 2022,
    color: 'Xanh mint',
    weekday: 120_000,
    weekend: 150_000,
    desc: 'Tay ga nhỏ gọn cho bạn nữ, chạy phố tiết kiệm.',
    approved: false,
  },
  {
    code: 'XM-003',
    name: 'Honda SH 150i 2023',
    plate: '59X1-333.44',
    type: VEHICLE_TYPE.MOTORBIKE,
    seats: 2,
    brand: 'honda',
    model: 'SH 150i',
    fuel: FUEL_TYPE.GASOLINE,
    year: 2023,
    color: 'Đen mờ',
    weekday: 300_000,
    weekend: 350_000,
    hourly: 50_000,
    discount: 5,
    img: photo('1558981403-c5f9899a28bc'),
    desc: 'SH sang chảnh, khoá smartkey, phanh ABS — dành cho ai thích đẳng cấp.',
    approved: true,
  },
] as const;

/**
 * Review demo (khách đã hoàn thành chuyến) — nuôi sort "Gợi ý" (rating denormalize trên
 * public_listings) + rating gian hàng. Booking COMPLETED không giữ chỗ trên lịch (ADR 0006)
 * nên seed quá khứ thoải mái, không đụng exclusion constraint.
 */
const DEMO_REVIEWS = [
  {
    vehicleCode: 'XE-001',
    bookingCode: 'RV0001',
    from: -30,
    to: -28,
    rating: 5,
    comment: 'Xe sạch sẽ, chủ xe giao đúng giờ. Sẽ thuê lại!',
  },
  {
    vehicleCode: 'XE-001',
    bookingCode: 'RV0002',
    from: -20,
    to: -18,
    rating: 4,
    comment: 'Xe chạy êm, tốn xăng hơn mình nghĩ chút.',
  },
  {
    vehicleCode: 'XE-011',
    bookingCode: 'RV0003',
    from: -25,
    to: -21,
    rating: 5,
    comment: 'CX-5 quá ngon, đi Đà Lạt cả nhà thoải mái.',
  },
  {
    vehicleCode: 'XE-011',
    bookingCode: 'RV0004',
    from: -14,
    to: -12,
    rating: 5,
    comment: 'Nội thất mới, camera 360 tiện.',
  },
  {
    vehicleCode: 'XE-009',
    bookingCode: 'RV0005',
    from: -16,
    to: -15,
    rating: 5,
    comment: 'Lần đầu chạy xe điện, êm không tưởng.',
  },
  {
    vehicleCode: 'XE-006',
    bookingCode: 'RV0006',
    from: -10,
    to: -9,
    rating: 4,
    comment: 'Xe nhỏ dễ lái, được miễn cọc rất tiện.',
  },
  {
    vehicleCode: 'XM-003',
    bookingCode: 'RV0007',
    from: -7,
    to: -6,
    rating: 4,
    comment: 'SH mới, chạy bốc. Giá hơi cao nhưng đáng.',
  },
] as const;

/** Đơn demo: đủ để màn lịch có event ngắn, event dài và event vắt qua hôm nay. */
const DEMO_BOOKINGS = [
  {
    vehicleCode: 'XE-001',
    customer: 'Nguyễn Văn An',
    phone: '0901234567',
    from: -2,
    to: 1,
    status: BOOKING_STATUS.ACTIVE,
  },
  {
    vehicleCode: 'XE-002',
    customer: 'Trần Thị Bình',
    phone: '0912345678',
    from: 1,
    to: 4,
    status: BOOKING_STATUS.CONFIRMED,
  },
  {
    vehicleCode: 'XE-003',
    customer: 'Lê Minh Cường',
    phone: '0923456789',
    from: 3,
    to: 10,
    status: BOOKING_STATUS.RESERVED,
  },
  {
    vehicleCode: 'XE-004',
    customer: 'Phạm Thu Dung',
    phone: '0934567890',
    from: -8,
    to: -5,
    status: BOOKING_STATUS.COMPLETED,
  },
  {
    vehicleCode: 'XM-001',
    customer: 'Hoàng Văn Em',
    phone: '0945678901',
    from: 0,
    to: 2,
    status: BOOKING_STATUS.ACTIVE,
  },
  {
    vehicleCode: 'XM-003',
    customer: 'Vũ Thị Giang',
    phone: '0956789012',
    from: 5,
    to: 6,
    status: BOOKING_STATUS.RESERVED,
  },
] as const;

/** ADR 0006: trạng thái nào giữ chỗ trên lịch. */
const OCCUPYING: readonly string[] = [
  BOOKING_STATUS.RESERVED,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACTIVE,
];

/**
 * Mirror `ListingsService.syncFromVehicle` cho seed (ADR 0008). Xe approved_public & chưa xoá →
 * listing `active` (upsert theo vehicle_id); còn lại chỉ hạ status nếu đã có row (không tạo listing
 * ma). Trả true khi upsert active. Trong app, writer DUY NHẤT vẫn là ListingsService.
 */
async function syncSeedListing(vehicleId: string): Promise<boolean> {
  const v = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      tenantId: true,
      name: true,
      vehicleType: true,
      serviceType: true,
      brand: true,
      model: true,
      seatCount: true,
      fuelType: true,
      bodyType: true,
      mainImageUrl: true,
      weekdayPrice: true,
      weekendPrice: true,
      hourlyPrice: true,
      deliveryEnabled: true,
      noCollateral: true,
      discountPercent: true,
      publicStatus: true,
      deletedAt: true,
      tenant: { select: { slug: true, profile: { select: { provinceName: true } } } },
      features: { select: { featureKey: true } },
    },
  });
  if (!v) return false;

  const active = !v.deletedAt && v.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  if (!active) {
    const status = v.deletedAt ? LISTING_STATUS.ARCHIVED : LISTING_STATUS.HIDDEN;
    await prisma.publicListing.updateMany({ where: { vehicleId }, data: { status } });
    return false;
  }

  // Rating denormalize như ListingsService.refreshRating (review published, chưa xoá).
  const agg = await prisma.review.aggregate({
    where: { vehicleId, status: REVIEW_STATUS.PUBLISHED, deletedAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });

  const snapshot = {
    shopSlug: v.tenant.slug,
    title: v.name,
    status: LISTING_STATUS.ACTIVE,
    vehicleType: v.vehicleType,
    serviceType: v.serviceType,
    brand: v.brand,
    model: v.model,
    seatCount: v.seatCount,
    fuelType: v.fuelType,
    bodyType: v.bodyType,
    provinceName: v.tenant.profile?.provinceName ?? null,
    mainImageUrl: v.mainImageUrl,
    weekdayPrice: v.weekdayPrice,
    weekendPrice: v.weekendPrice,
    hourlyPrice: v.hourlyPrice,
    deliveryEnabled: v.deliveryEnabled,
    noCollateral: v.noCollateral,
    discountPercent: v.discountPercent,
    features: v.features.map((f) => f.featureKey).sort(),
    ratingAvg: agg._avg.rating != null ? agg._avg.rating.toFixed(2) : null,
    ratingCount: agg._count._all,
  };
  await prisma.publicListing.upsert({
    where: { vehicleId },
    create: { id: ulid(), tenantId: v.tenantId, vehicleId, ...snapshot },
    update: snapshot,
  });
  return true;
}

/** Danh mục thu/chi hệ thống (tenant_id null) — dùng chung mọi shop. Theo Vietrent legacy. */
const SYSTEM_FINANCE_CATEGORIES: ReadonlyArray<{ type: string; name: string }> = [
  ...[
    'Tiền thuê xe',
    'Tiền cọc',
    'Thanh toán đơn',
    'Phí quá giờ',
    'Phí đền bù va quẹt',
    'Phí phạt nguội',
    'Thu khác',
  ].map((name) => ({ type: FINANCE_CATEGORY_TYPE.INCOME, name })),
  ...[
    'Hoàn cọc',
    'Bảo dưỡng/Thay nhớt',
    'Sửa chữa sự cố',
    'Mua bảo hiểm',
    'Rửa xe',
    'Giao/nhận xe',
    'Đổ xăng',
    'Chi phí vận hành',
    'Chi phí marketing',
    'Chi phí văn phòng',
    'Chi khác',
  ].map((name) => ({ type: FINANCE_CATEGORY_TYPE.EXPENSE, name })),
];

async function seedFinanceCategories(): Promise<void> {
  let created = 0;
  for (const cat of SYSTEM_FINANCE_CATEGORIES) {
    const existing = await prisma.financeCategory.findFirst({
      where: { tenantId: null, type: cat.type, name: cat.name },
      select: { id: true },
    });
    if (!existing) {
      await prisma.financeCategory.create({
        data: { id: ulid(), tenantId: null, type: cat.type, name: cat.name, isSystem: true },
      });
      created++;
    }
  }
  const total = await prisma.financeCategory.count({ where: { tenantId: null, isSystem: true } });
  console.log(`  danh mục thu/chi hệ thống: ${total} (mới ${created})`);
}

async function main(): Promise<void> {
  console.log('Seeding XePrime...');

  const permissionIds = await seedPermissions();

  for (const roleKey of Object.values(TENANT_ROLE)) {
    await seedSystemRole(
      SCOPE.TENANT,
      roleKey,
      TENANT_ROLE_LABEL[roleKey],
      DEFAULT_TENANT_ROLE_PERMISSIONS[roleKey],
      permissionIds,
    );
  }
  for (const roleKey of Object.values(PLATFORM_ROLE)) {
    await seedSystemRole(
      SCOPE.PLATFORM,
      roleKey,
      PLATFORM_ROLE_LABEL[roleKey],
      DEFAULT_PLATFORM_ROLE_PERMISSIONS[roleKey],
      permissionIds,
    );
  }
  console.log('  roles hệ thống: xong');

  await seedFinanceCategories();

  // Dọn tài khoản demo mock cũ (không mật khẩu) — đã chuyển sang đăng nhập email/mật khẩu.
  // Giữ owner@xeprime.test và customer@xeprime.test (đều được đặt mật khẩu ngay dưới đây).
  await prisma.user.deleteMany({
    where: { email: { in: ['admin@xeprime.test'] } },
  });

  const adminUserId = await upsertPasswordUser({
    email: PLATFORM_ADMIN_EMAIL,
    password: PLATFORM_ADMIN_PASSWORD,
    displayName: 'Platform Admin',
    phoneVerified: true,
  });
  // Chủ shop demo: đăng nhập bằng email/mật khẩu, giữ nguyên gian hàng + xe + đơn demo.
  const ownerUserId = await upsertPasswordUser({
    email: 'owner@xeprime.test',
    password: DEMO_OWNER_PASSWORD,
    displayName: 'Chủ shop demo',
    phoneVerified: true,
  });
  // Khách demo: chủ nhân các review (nuôi sort "Gợi ý") + để thử luồng khách trên marketplace.
  const customerUserId = await upsertPasswordUser({
    email: 'customer@xeprime.test',
    password: DEMO_OWNER_PASSWORD,
    displayName: 'Nguyễn Văn Khách',
    phoneVerified: true,
  });
  console.log('  users: admin + shop owner + customer');

  await prisma.platformMembership.upsert({
    where: {
      userId_roleKey: { userId: adminUserId, roleKey: PLATFORM_ROLE.PLATFORM_ADMIN },
    },
    update: { status: MEMBERSHIP_STATUS.ACTIVE },
    create: {
      id: ulid(),
      userId: adminUserId,
      roleKey: PLATFORM_ROLE.PLATFORM_ADMIN,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'xeprime-demo' },
    update: {},
    create: {
      id: ulid(),
      code: 'DEMO-001',
      slug: 'xeprime-demo',
      name: 'Gian hàng Demo XePrime',
      tenantType: 'business',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId,
      phone: '0900000000',
      email: 'shop@xeprime.test',
    },
    select: { id: true },
  });

  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: ownerUserId } },
    update: { status: MEMBERSHIP_STATUS.ACTIVE },
    create: {
      id: ulid(),
      tenantId: tenant.id,
      userId: ownerUserId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
      joinedAt: new Date(),
    },
  });

  // Hồ sơ gian hàng: cần provinceName để listing có địa điểm (facet/điểm nổi bật đọc từ đây).
  // Chỉ bổ sung khi chưa có — không ghi đè dữ liệu chủ shop đã tự sửa trong app.
  const existingProfile = await prisma.tenantProfile.findUnique({
    where: { tenantId: tenant.id },
    select: { provinceName: true },
  });
  if (!existingProfile) {
    await prisma.tenantProfile.create({
      data: {
        tenantId: tenant.id,
        displayName: 'Gian hàng Demo XePrime',
        provinceName: 'TP. Hồ Chí Minh',
        bio: 'Gian hàng demo của XePrime — đủ loại xe từ mini tới 16 chỗ, giao xe tận nơi nội thành.',
        address: '123 Nguyễn Văn Cừ, Quận 5',
      },
    });
  } else if (!existingProfile.provinceName) {
    await prisma.tenantProfile.update({
      where: { tenantId: tenant.id },
      data: { provinceName: 'TP. Hồ Chí Minh' },
    });
  }
  console.log('  tenant active + membership owner + profile: xong');

  const vehicleIdByCode = new Map<string, string>();
  for (const v of DEMO_VEHICLES) {
    // Toàn bộ thuộc tính demo nằm ở CẢ create lẫn update: sửa DEMO_VEHICLES rồi re-seed là
    // dữ liệu refresh theo (idempotent nhưng không đóng băng ở lần seed đầu).
    const demoFields = {
      name: v.name,
      plateNumber: v.plate,
      vehicleType: v.type,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      brand: v.brand,
      model: v.model,
      manufactureYear: v.year,
      color: v.color,
      seatCount: v.seats,
      fuelType: v.fuel,
      bodyType: v.body ?? null,
      description: v.desc,
      mainImageUrl: v.img ?? null,
      weekdayPrice: v.weekday,
      weekendPrice: v.weekend,
      hourlyPrice: v.hourly ?? null,
      deliveryEnabled: v.delivery ?? false,
      noCollateral: v.noCollateral ?? false,
      discountPercent: v.discount ?? null,
      // Demo: `approved` mô phỏng kết quả duyệt public (luồng thật ở Phase 2 qua
      // ApprovalService). Xe draft vẫn để nguyên để test được luồng duyệt sau này.
      publicStatus: v.approved
        ? VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC
        : VEHICLE_PUBLIC_STATUS.DRAFT,
    };
    const row = await prisma.vehicle.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: v.code } },
      update: demoFields,
      create: {
        id: ulid(),
        tenantId: tenant.id,
        code: v.code,
        operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
        createdBy: ownerUserId,
        ...demoFields,
      },
      select: { id: true },
    });
    vehicleIdByCode.set(v.code, row.id);

    // Gallery + tính năng: replace-set như VehiclesService.replaceMedia — chạy lại không nhân bản.
    await prisma.vehicleImage.deleteMany({ where: { vehicleId: row.id } });
    if (v.gallery?.length) {
      await prisma.vehicleImage.createMany({
        data: v.gallery.map((imageUrl, index) => ({
          id: ulid(),
          vehicleId: row.id,
          tenantId: tenant.id,
          imageUrl,
          sortOrder: index,
        })),
      });
    }
    await prisma.vehicleFeature.deleteMany({ where: { vehicleId: row.id } });
    if (v.features?.length) {
      await prisma.vehicleFeature.createMany({
        data: v.features.map((featureKey) => ({ id: ulid(), vehicleId: row.id, featureKey })),
      });
    }
  }
  console.log(`  vehicles: ${vehicleIdByCode.size}`);

  // Review demo TRƯỚC khi sync listing để rating denormalize vào snapshot ngay lượt này.
  // Booking COMPLETED không giữ chỗ trên lịch (ADR 0006) nên seed quá khứ vô tư; review chốt
  // 1-1 với booking bằng unique booking_id → upsert theo bookingId là idempotent.
  let reviewCount = 0;
  for (const r of DEMO_REVIEWS) {
    const vehicleId = vehicleIdByCode.get(r.vehicleCode);
    if (!vehicleId) continue;

    const booking = await prisma.booking.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: r.bookingCode } },
      update: { status: BOOKING_STATUS.COMPLETED },
      create: {
        id: ulid(),
        tenantId: tenant.id,
        vehicleId,
        code: r.bookingCode,
        customerName: 'Nguyễn Văn Khách',
        customerPhone: '0987654321',
        status: BOOKING_STATUS.COMPLETED,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        pickupAt: daysFromToday(r.from, 3),
        returnAt: daysFromToday(r.to, 5),
        baseAmount: 0,
        totalAmount: 0,
        paidAmount: 0,
        createdBy: ownerUserId,
      },
      select: { id: true },
    });

    await prisma.review.upsert({
      where: { bookingId: booking.id },
      update: { rating: r.rating, comment: r.comment, status: REVIEW_STATUS.PUBLISHED },
      create: {
        id: ulid(),
        tenantId: tenant.id,
        vehicleId,
        bookingId: booking.id,
        customerId: customerUserId,
        rating: r.rating,
        comment: r.comment,
        status: REVIEW_STATUS.PUBLISHED,
      },
    });
    reviewCount += 1;
  }

  // Rating gian hàng — cùng quy tắc ReviewService.recomputeTenantRating.
  const tenantAgg = await prisma.review.aggregate({
    where: { tenantId: tenant.id, status: REVIEW_STATUS.PUBLISHED, deletedAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      ratingAvg: Math.round((tenantAgg._avg.rating ?? 0) * 100) / 100,
      ratingCount: tenantAgg._count._all,
    },
  });
  console.log(`  reviews: ${reviewCount}`);

  // Snapshot public_listings cho xe đã duyệt (ADR 0008). Trong app, ListingsService là writer
  // DUY NHẤT; ở seed dùng cùng logic (đọc xe+tenant+features+rating, suy status) để marketplace
  // có dữ liệu demo đầy đủ cho bộ lọc facet.
  let listingCount = 0;
  for (const vehicleId of vehicleIdByCode.values()) {
    if (await syncSeedListing(vehicleId)) listingCount += 1;
  }
  console.log(`  public_listings: ${listingCount}`);

  // Occupancy được tính lại từ TODAY mỗi lần seed. Nếu giữ occupancy từ lần seed NGÀY KHÁC,
  // ngày mới có thể chồng ngày cũ và đụng exclusion constraint (ADR 0006). Xoá sạch occupancy
  // demo của tenant rồi tạo lại → seed idempotent kể cả chạy khác ngày. Seed sở hữu dữ liệu
  // demo của tenant này; booking dùng upsert (không xoá) để không đụng FK.
  await prisma.vehicleOccupancy.deleteMany({ where: { tenantId: tenant.id } });

  let bookingCount = 0;
  for (const [i, b] of DEMO_BOOKINGS.entries()) {
    const vehicleId = vehicleIdByCode.get(b.vehicleCode);
    if (!vehicleId) continue;

    const code = `DH${String(i + 1).padStart(4, '0')}`;
    const pickupAt = daysFromToday(b.from, 3);
    const returnAt = daysFromToday(b.to, 5);
    const bookingId = ulid();
    const days = Math.max(1, b.to - b.from);
    const vehicle = DEMO_VEHICLES.find((v) => v.code === b.vehicleCode);
    const total = (vehicle?.weekday ?? 0) * days;
    const paidAmount = b.status === BOOKING_STATUS.COMPLETED ? total : 0;

    // Booking và occupancy phải cùng transaction — ADR 0006.
    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.upsert({
        where: { tenantId_code: { tenantId: tenant.id, code } },
        create: {
          id: bookingId,
          tenantId: tenant.id,
          vehicleId,
          code,
          customerName: b.customer,
          customerPhone: b.phone,
          status: b.status,
          serviceType: SERVICE_TYPE.SELF_DRIVE,
          pickupAt,
          returnAt,
          baseAmount: total,
          totalAmount: total,
          paidAmount,
          createdBy: ownerUserId,
        },
        update: {
          customerName: b.customer,
          customerPhone: b.phone,
          status: b.status,
          pickupAt,
          returnAt,
          baseAmount: total,
          totalAmount: total,
          paidAmount,
        },
        select: { id: true },
      });

      if (OCCUPYING.includes(b.status)) {
        await tx.vehicleOccupancy.create({
          data: {
            id: ulid(),
            tenantId: tenant.id,
            vehicleId,
            sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
            sourceId: booking.id,
            startAt: pickupAt,
            endAt: returnAt,
          },
        });
      }
    });
    bookingCount += 1;
  }
  console.log(`  bookings: ${bookingCount}`);

  // Một lịch bảo dưỡng, để màn lịch có event không phải booking và để chứng minh
  // exclusion constraint chặn được xung đột GIỮA các nguồn khác nhau.
  const maintenanceVehicleId = vehicleIdByCode.get('XE-005');
  if (maintenanceVehicleId) {
    const sourceId = ulid();
    const already = await prisma.vehicleOccupancy.findFirst({
      where: { vehicleId: maintenanceVehicleId, sourceType: OCCUPANCY_SOURCE_TYPE.MAINTENANCE },
      select: { id: true },
    });
    if (!already) {
      await prisma.vehicleOccupancy.create({
        data: {
          id: ulid(),
          tenantId: tenant.id,
          vehicleId: maintenanceVehicleId,
          sourceType: OCCUPANCY_SOURCE_TYPE.MAINTENANCE,
          sourceId,
          startAt: daysFromToday(2, 1),
          endAt: daysFromToday(4, 10),
        },
      });
      console.log('  maintenance block: 1');
    }
  }

  console.log('\nSeed xong. Đăng nhập bằng email + mật khẩu tại /login:');
  console.log(`  platform admin : ${PLATFORM_ADMIN_EMAIL} / ${PLATFORM_ADMIN_PASSWORD}`);
  console.log(`  shop owner     : owner@xeprime.test / ${DEMO_OWNER_PASSWORD}`);
  console.log(`  customer       : customer@xeprime.test / ${DEMO_OWNER_PASSWORD}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err: unknown) => {
    console.error('Seed thất bại:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
