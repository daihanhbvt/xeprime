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
import { MEMBERSHIP_STATUS, PLATFORM_ROLE, USER_STATUS } from '@xeprime/types';
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
import { CUSTOMER_ACCOUNTS, PLATFORM_ACCOUNTS, type CustomerKey } from './identities';

export interface PasswordUserInput {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
  phoneVerified?: boolean;
}

/**
 * Tạo/cập nhật user đăng nhập bằng email + mật khẩu (bcrypt). Idempotent theo email.
 *
 * Đặt cả `passwordHash` (đường `loginWithPassword` đọc field này) lẫn identity
 * `provider='password'` cho khớp `AuthService.register()` — seed phải dựng ra đúng hình thù
 * mà app tự dựng, nếu không nó sẽ che mất lỗi ở luồng đăng ký thật.
 */
export async function upsertPasswordUser(input: PasswordUserInput): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const userId = existing?.id ?? seedId(`user:${email}`);

  await prisma.$transaction(async (tx) => {
    const common = {
      passwordHash,
      displayName: input.displayName,
      status: USER_STATUS.ACTIVE,
      phone: input.phone ?? null,
      phoneVerifiedAt: input.phoneVerified ? new Date() : null,
    };
    if (existing) {
      await tx.user.update({ where: { id: userId }, data: common });
    } else {
      await tx.user.create({
        data: { id: userId, email, emailVerifiedAt: new Date(), ...common },
      });
    }
    await tx.userIdentity.upsert({
      where: { provider_providerUserId: { provider: 'password', providerUserId: email } },
      update: {},
      create: {
        id: seedId(`identity:password:${email}`),
        userId,
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

/**
 * Tài khoản `platform_admin` lấy email từ env nên phải ghép ở đây; bốn vai trò còn lại là dữ
 * liệu thuần, khai ở `identities.ts` để `cleanup-test-data.ts` dùng chung.
 */
const ALL_PLATFORM_ACCOUNTS: ReadonlyArray<{
  roleKey: string;
  email: string;
  displayName: string;
  phone: string;
}> = [
  {
    roleKey: PLATFORM_ROLE.PLATFORM_ADMIN,
    email: PLATFORM_ADMIN_EMAIL,
    displayName: 'Quản trị nền tảng',
    phone: '0900000001',
  },
  ...PLATFORM_ACCOUNTS,
];

export interface PlatformAccounts {
  /** Người duyệt hồ sơ/xe trong dữ liệu demo — dùng làm `reviewedBy` của approval task. */
  reviewerUserId: string;
  adminUserId: string;
  byRole: Map<string, string>;
}

export async function seedPlatformAccounts(): Promise<PlatformAccounts> {
  const byRole = new Map<string, string>();

  for (const account of ALL_PLATFORM_ACCOUNTS) {
    const password =
      account.roleKey === PLATFORM_ROLE.PLATFORM_ADMIN ? PLATFORM_ADMIN_PASSWORD : DEMO_PASSWORD;
    const userId = await upsertPasswordUser({
      email: account.email,
      password,
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
    byRole.set(account.roleKey, userId);
  }

  log(`  tài khoản nền tảng: ${ALL_PLATFORM_ACCOUNTS.length} (đủ 5 vai trò)`);

  return {
    adminUserId: byRole.get(PLATFORM_ROLE.PLATFORM_ADMIN)!,
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
