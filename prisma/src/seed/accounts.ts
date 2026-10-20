/**
 * Tài khoản đăng nhập của seed: đội ngũ NỀN TẢNG và KHÁCH THUÊ.
 *
 * Chủ gian hàng và nhân viên gian hàng KHÔNG ở đây — họ khai trong `shops.ts` cùng gian hàng
 * của mình, vì tài khoản đó chỉ có nghĩa khi đi kèm membership vào một tenant cụ thể.
 *
 * Bản khai danh tính (email/SĐT) nằm ở `identities.ts` — file này chỉ lo việc ghi xuống DB.
 *
 * Mật khẩu lấy từ env, không hard-code (xem `context.ts`); mọi tài khoản dùng cùng một mật khẩu
 * dev để đăng nhập thử cho nhanh.
 */
import {
  ACCOUNT_REALM,
  DRIVER_LICENCE_DECISION_SOURCE,
  DRIVER_LICENCE_KIND,
  DRIVER_LICENCE_STATUS,
  MEMBERSHIP_STATUS,
  PLATFORM_ROLE,
  USER_STATUS,
  normalizeVnPhone,
  type AccountRealm,
} from '@xeprime/types';
import bcrypt from 'bcrypt';
import {
  BCRYPT_ROUNDS,
  DEMO_PASSWORD,
  PLATFORM_ADMIN_EMAIL,
  PLATFORM_ADMIN_PASSWORD,
  dateOnlyFromToday,
  log,
  prisma,
  seedId,
} from './context';
import {
  CROSS_REALM_TWINS,
  CUSTOMER_ACCOUNTS,
  DRIVER_ACCOUNTS,
  PLATFORM_ACCOUNTS,
  type CustomerKey,
} from './identities';

export interface PasswordUserInput {
  /**
   * Không gian tài khoản (ADR 0053). BẮT BUỘC: cùng một email/SĐT là một tài khoản KHÁC ở mỗi
   * realm, nên seed không được đoán realm thay nơi gọi.
   */
  realm: AccountRealm;
  email: string;
  password: string;
  displayName: string;
  phone?: string;
  phoneVerified?: boolean;
  /**
   * Ảnh đại diện. Với chủ xe tuyến HOA HỒNG đây không phải trang trí: trang gian hàng cá nhân
   * và mọi thẻ xe của họ lấy chính avatar này làm ảnh đại diện khi không có logo
   * (`PublicListingsService.storefrontAvatar`).
   */
  avatarUrl?: string;
}

/**
 * Tạo/cập nhật user đăng nhập bằng email + mật khẩu (bcrypt). Idempotent theo (realm, email) — khoá
 * `seedId` mang realm nên cùng email ở hai realm là hai hàng tất định khác nhau.
 *
 * Đặt cả `passwordHash` (đường `loginWithPassword` đọc field này) lẫn identity
 * `provider='password'` cho khớp `AuthService.register()` — seed phải dựng ra đúng hình thù
 * mà app tự dựng, nếu không nó sẽ che mất lỗi ở luồng đăng ký thật.
 */
export async function upsertPasswordUser(input: PasswordUserInput): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const realm = input.realm;
  /*
   * SĐT lưu ở DẠNG CHUẨN `84xxxxxxxxx` — đúng dạng `AuthService.register` ghi và `loginWithPassword`
   * tra (ADR 0060: SĐT là định danh đăng nhập ở site khách/partner). Bản khai trong seed viết dạng
   * nội địa `09…` cho dễ đọc; ghi nguyên dạng đó thì tài khoản demo không đăng nhập được bằng SĐT.
   */
  const phone = input.phone ? normalizeVnPhone(input.phone) : null;
  const existing = await prisma.user.findUnique({
    where: { realm_email: { realm, email } },
    select: { id: true },
  });
  const userId = existing?.id ?? seedId(`user:${realm}:${email}`);

  await prisma.$transaction(async (tx) => {
    const common = {
      passwordHash,
      displayName: input.displayName,
      status: USER_STATUS.ACTIVE,
      phone,
      phoneVerifiedAt: input.phoneVerified ? new Date() : null,
      // Bản khai không có ảnh thì GIỮ ảnh đang có thay vì ghi null: người chạy seed có thể đã
      // tự đặt avatar cho một tài khoản demo, và seed chạy lại không nên xoá thứ đó.
      ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
    };
    if (existing) {
      await tx.user.update({ where: { id: userId }, data: common });
    } else {
      await tx.user.create({
        data: { id: userId, realm, email, emailVerifiedAt: new Date(), ...common },
      });
    }
    await tx.userIdentity.upsert({
      where: {
        realm_provider_providerUserId: { realm, provider: 'password', providerUserId: email },
      },
      update: {},
      create: {
        id: seedId(`identity:${realm}:password:${email}`),
        userId,
        realm,
        provider: 'password',
        providerUserId: email,
        providerEmail: email,
      },
    });
  });

  return userId;
}

// ---------------------------------------------------------------------------
// Đội ngũ nền tảng — mỗi vai trò một tài khoản
// ---------------------------------------------------------------------------

/** Một tài khoản nền tảng + membership của vai trò đó — dùng chung cho admin và tài khoản demo. */
async function upsertPlatformAccount(account: {
  roleKey: string;
  email: string;
  displayName: string;
  phone: string;
  password: string;
}): Promise<string> {
  const userId = await upsertPasswordUser({
    realm: ACCOUNT_REALM.PLATFORM,
    email: account.email,
    password: account.password,
    displayName: account.displayName,
    phone: account.phone,
    phoneVerified: true,
  });

  await prisma.platformMembership.upsert({
    where: { userId_roleKey: { userId, roleKey: account.roleKey } },
    update: { status: MEMBERSHIP_STATUS.ACTIVE },
    create: {
      id: seedId(`platform-membership:${account.email}`),
      userId,
      roleKey: account.roleKey,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  return userId;
}

/**
 * Tài khoản `platform_admin` — dữ liệu NỀN, chạy ở CẢ chế độ `system`: môi trường mới deploy phải
 * có một người đăng nhập được site quản trị để tạo những người còn lại. Email từ
 * `PLATFORM_ADMIN_EMAIL`, mật khẩu từ `PLATFORM_ADMIN_PASSWORD` (bắt buộc ở môi trường đã triển khai).
 */
export async function seedPlatformAdmin(): Promise<string> {
  const userId = await upsertPlatformAccount({
    roleKey: PLATFORM_ROLE.PLATFORM_ADMIN,
    email: PLATFORM_ADMIN_EMAIL,
    displayName: 'Quản trị nền tảng',
    phone: '0900000001',
    password: PLATFORM_ADMIN_PASSWORD,
  });
  log(`  tài khoản quản trị nền tảng: ${PLATFORM_ADMIN_EMAIL}`);
  return userId;
}

export interface PlatformAccounts {
  /** Người duyệt hồ sơ/xe trong dữ liệu demo — dùng làm `reviewedBy` của approval task. */
  reviewerUserId: string;
  adminUserId: string;
  byRole: Map<string, string>;
}

/** Tài khoản nền tảng của dữ liệu DEMO (ngoài admin) — xem `PLATFORM_ACCOUNTS`. */
export async function seedPlatformAccounts(adminUserId: string): Promise<PlatformAccounts> {
  const byRole = new Map<string, string>([[PLATFORM_ROLE.PLATFORM_ADMIN, adminUserId]]);
  for (const account of PLATFORM_ACCOUNTS) {
    byRole.set(
      account.roleKey,
      await upsertPlatformAccount({ ...account, password: DEMO_PASSWORD }),
    );
  }

  log(
    `  tài khoản nền tảng demo: ${PLATFORM_ACCOUNTS.length} (${PLATFORM_ACCOUNTS.map((a) => a.roleKey).join(' · ')})`,
  );

  return {
    adminUserId,
    reviewerUserId: byRole.get(PLATFORM_ROLE.REVIEWER)!,
    byRole,
  };
}

// ---------------------------------------------------------------------------
// Khách thuê
// ---------------------------------------------------------------------------

export type CustomerAccounts = Map<CustomerKey, { userId: string; name: string; phone: string }>;

export async function seedCustomerAccounts(): Promise<CustomerAccounts> {
  const accounts: CustomerAccounts = new Map();

  for (const customer of CUSTOMER_ACCOUNTS) {
    const userId = await upsertPasswordUser({
      realm: ACCOUNT_REALM.CUSTOMER,
      email: customer.email,
      password: DEMO_PASSWORD,
      displayName: customer.displayName,
      phone: customer.phone,
      phoneVerified: true,
    });
    accounts.set(customer.key, {
      userId,
      name: customer.displayName,
      phone: customer.phone,
    });
  }

  log(`  tài khoản khách: ${CUSTOMER_ACCOUNTS.length}`);
  return accounts;
}

/** Tài khoản KHÁCH của tài xế (ADR 0063) — theo vị trí trong `DRIVER_ACCOUNTS`. */
export type DriverAccounts = readonly { userId: string; name: string; phone: string }[];

export async function seedDriverAccounts(): Promise<DriverAccounts> {
  const out: { userId: string; name: string; phone: string }[] = [];
  for (const driver of DRIVER_ACCOUNTS) {
    const userId = await upsertPasswordUser({
      realm: ACCOUNT_REALM.CUSTOMER,
      email: driver.email,
      password: DEMO_PASSWORD,
      displayName: driver.displayName,
      phone: driver.phone,
      phoneVerified: true,
    });
    out.push({ userId, name: driver.displayName, phone: driver.phone });
  }
  log(`  tài khoản tài xế: ${DRIVER_ACCOUNTS.length}`);
  return out;
}

// ---------------------------------------------------------------------------
// Bằng lái của khách (ADR 0057)
// ---------------------------------------------------------------------------

/**
 * Bằng lái ĐÃ XÁC THỰC cho hai khách demo — cổng đặt xe tự lái chặn khách chưa có bằng, nên thiếu
 * bước này thì mọi tài khoản demo đều dừng ở bước "Xác thực bằng lái" khi thử đặt xe.
 *
 * `khach.cuong@` CỐ Ý không có bằng: anh ấy thuê xe CÓ TÀI XẾ (không cần bằng), và là tài khoản để
 * thử trọn luồng nộp ảnh → máy đọc → xác thực.
 *
 * Ghi thẳng một dòng `verified` (quyết định TAY bởi admin nền tảng, kèm lời nhắn "dữ liệu demo")
 * thay vì đi qua bộ đọc: seed không gọi nhà cung cấp OCR. Không có ảnh thật trên R2 cho các dòng
 * này — khung ảnh bằng ở trang Giấy tờ sẽ báo chưa tải được ảnh, đúng như một bằng chưa từng được chụp.
 */
const DEMO_LICENCES: ReadonlyArray<{
  customer: CustomerKey;
  number: string;
  classes: string[];
  coversMotorbike: boolean;
  issuedDaysAgo: number;
  expiresInDays: number;
}> = [
  {
    customer: 'an',
    number: '790100000001',
    classes: ['B2'],
    coversMotorbike: false,
    issuedDaysAgo: 1460,
    expiresInDays: 2190,
  },
  {
    customer: 'binh',
    number: '790100000002',
    classes: ['A1', 'B2'],
    coversMotorbike: true,
    issuedDaysAgo: 900,
    expiresInDays: 2700,
  },
];

export async function seedCustomerDriverLicences(
  customers: CustomerAccounts,
  adminUserId: string,
): Promise<void> {
  for (const spec of DEMO_LICENCES) {
    const customer = customers.get(spec.customer);
    if (!customer) continue;
    const id = seedId(`driver-licence:${spec.customer}`);
    const decidedAt = new Date(Date.now() - 30 * 86_400_000);
    const data = {
      userId: customer.userId,
      status: DRIVER_LICENCE_STATUS.VERIFIED,
      objectKey: `customers/${customer.userId}/driver-licences/${id}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      uploadedAt: decidedAt,
      kind: DRIVER_LICENCE_KIND.VN,
      licenceNumber: spec.number,
      fullName: customer.name.toUpperCase(),
      licenceClasses: spec.classes,
      issuedOn: dateOnlyFromToday(-spec.issuedDaysAgo),
      expiresOn: dateOnlyFromToday(spec.expiresInDays),
      noExpiry: false,
      issuingCountry: 'VN',
      coversCar: true,
      coversMotorbike: spec.coversMotorbike,
      decisionSource: DRIVER_LICENCE_DECISION_SOURCE.MANUAL,
      decidedBy: adminUserId,
      decidedAt,
      reviewNote: 'Dữ liệu demo',
      consentedAt: decidedAt,
    };
    // Bằng đang dùng là MỘT dòng `verified` mỗi tài khoản — chỉ tạo khi chưa có (QA có thể đã
    // tự nộp bằng khác cho tài khoản này; seed không được giẫm lên nó).
    const existingVerified = await prisma.customerDriverLicence.findFirst({
      where: { userId: customer.userId, status: DRIVER_LICENCE_STATUS.VERIFIED },
      select: { id: true },
    });
    if (existingVerified && existingVerified.id !== id) continue;
    await prisma.customerDriverLicence.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  }
  log(`  bằng lái demo: ${DEMO_LICENCES.length} (khach.cuong@ để trống — thử luồng nộp bằng)`);
}

// ---------------------------------------------------------------------------
// Tài khoản SONG SINH xuyên realm (ADR 0053)
// ---------------------------------------------------------------------------

/**
 * Cùng một người, cùng SĐT + email, nhưng là tài khoản KHÁC ở realm thứ hai — để đăng nhập thử
 * đúng điều ADR 0053 hứa: hai site, hai mật khẩu, hai phiên không dính nhau.
 *
 * Song sinh KHÔNG có đơn, không có membership: tài khoản khách của một chủ xe không được đặt xe
 * của chính gian hàng mình (ADR 0053 điều 7), và tài khoản partner của một khách chưa mở gian hàng
 * nào — đó chính là ca "chưa có gian hàng ⇒ /register" của site partner.
 */
export async function seedCrossRealmTwins(): Promise<number> {
  for (const twin of CROSS_REALM_TWINS) {
    await upsertPasswordUser({
      realm: twin.realm,
      email: twin.email,
      password: DEMO_PASSWORD,
      displayName: twin.displayName,
      phone: twin.phone,
      phoneVerified: true,
    });
  }
  log(`  tài khoản song sinh xuyên realm: ${CROSS_REALM_TWINS.length}`);
  return CROSS_REALM_TWINS.length;
}
