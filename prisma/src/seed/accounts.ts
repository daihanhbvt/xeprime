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
  MEMBERSHIP_STATUS,
  PLATFORM_ROLE,
  USER_STATUS,
  type AccountRealm,
} from '@xeprime/types';
import bcrypt from 'bcryptjs';
import {
  BCRYPT_ROUNDS,
  DEMO_PASSWORD,
  PLATFORM_ADMIN_EMAIL,
  PLATFORM_ADMIN_PASSWORD,
  log,
  prisma,
  seedId,
} from './context';
import {
  CROSS_REALM_TWINS,
  CUSTOMER_ACCOUNTS,
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
      phone: input.phone ?? null,
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
