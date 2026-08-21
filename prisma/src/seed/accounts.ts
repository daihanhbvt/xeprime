/**
 * Tài khoản đăng nhập của seed: đội ngũ NỀN TẢNG và KHÁCH THUÊ.
 *
 * Chủ gian hàng và nhân viên gian hàng KHÔNG ở đây — họ khai trong `fixtures.ts` cùng gian
 * hàng của mình, vì tài khoản đó chỉ có nghĩa khi đi kèm membership vào một tenant cụ thể.
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
 * Năm vai trò nền tảng đều có tài khoản riêng, không gộp vào một "admin" duy nhất: quyền của
 * `reviewer`, `support`, `finance_admin` hẹp hơn hẳn `platform_admin`, và cách duy nhất để biết
 * màn nào thiếu quyền là đăng nhập bằng đúng vai trò đó mà bấm thử.
 */
const PLATFORM_ACCOUNTS: ReadonlyArray<{
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
  {
    roleKey: PLATFORM_ROLE.PLATFORM_STAFF,
    email: 'staff@xeprime.test',
    displayName: 'Nhân viên nền tảng',
    phone: '0900000002',
  },
  {
    roleKey: PLATFORM_ROLE.REVIEWER,
    email: 'reviewer@xeprime.test',
    displayName: 'Chuyên viên duyệt hồ sơ',
    phone: '0900000003',
  },
  {
    roleKey: PLATFORM_ROLE.SUPPORT,
    email: 'support@xeprime.test',
    displayName: 'Hỗ trợ khách hàng',
    phone: '0900000004',
  },
  {
    roleKey: PLATFORM_ROLE.FINANCE_ADMIN,
    email: 'finance@xeprime.test',
    displayName: 'Kế toán nền tảng',
    phone: '0900000005',
  },
];

export interface PlatformAccounts {
  /** Người duyệt hồ sơ/xe trong dữ liệu demo — dùng làm `reviewedBy` của approval task. */
  reviewerUserId: string;
  adminUserId: string;
  byRole: Map<string, string>;
}

export async function seedPlatformAccounts(): Promise<PlatformAccounts> {
  const byRole = new Map<string, string>();

  for (const account of PLATFORM_ACCOUNTS) {
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

  log(`  tài khoản nền tảng: ${PLATFORM_ACCOUNTS.length} (đủ 5 vai trò)`);

  return {
    adminUserId: byRole.get(PLATFORM_ROLE.PLATFORM_ADMIN)!,
    reviewerUserId: byRole.get(PLATFORM_ROLE.REVIEWER)!,
    byRole,
  };
}

// ---------------------------------------------------------------------------
// Khách thuê
// ---------------------------------------------------------------------------

/**
 * Năm tài khoản khách, mỗi tài khoản một hoàn cảnh khác nhau — dữ liệu demo chỉ có ích khi
 * các màn "lịch sử thuê", "đánh giá của tôi", "chưa có chuyến nào" đều có người để mở ra xem.
 *
 * `phone` ở đây là SĐT của TÀI KHOẢN. Hồ sơ khách trong sổ của từng gian hàng
 * (`tenant_customers`) tra theo chính SĐT này, nên hai bên khớp nhau như dữ liệu thật.
 */
export const CUSTOMER_ACCOUNTS = [
  {
    key: 'an',
    email: 'khach.an@xeprime.test',
    displayName: 'Nguyễn Văn An',
    phone: '0901000001',
    note: 'Khách quen: nhiều chuyến đã hoàn tất ở gian hàng lớn, có đánh giá.',
  },
  {
    key: 'binh',
    email: 'khach.binh@xeprime.test',
    displayName: 'Trần Thị Bình',
    phone: '0901000002',
    note: 'Đang thuê dài hạn theo gói tháng.',
  },
  {
    key: 'cuong',
    email: 'khach.cuong@xeprime.test',
    displayName: 'Lê Hoàng Cường',
    phone: '0901000003',
    note: 'Thuê xe có tài xế đi liên tỉnh; còn nợ một phần tiền.',
  },
  {
    key: 'dung',
    email: 'khach.dung@xeprime.test',
    displayName: 'Phạm Thu Dung',
    phone: '0901000004',
    note: 'Tài khoản mới — chưa có chuyến nào, để thử màn trạng thái rỗng.',
  },
  {
    key: 'duc',
    email: 'khach.duc@xeprime.test',
    displayName: 'Võ Minh Đức',
    phone: '0901000005',
    note: 'Bị một gian hàng đưa vào danh sách chặn (chỉ ở gian hàng đó).',
  },
] as const;

export type CustomerKey = (typeof CUSTOMER_ACCOUNTS)[number]['key'];

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
