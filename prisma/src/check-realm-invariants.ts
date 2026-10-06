/**
 * Kiểm BẤT BIẾN của ba không gian tài khoản (ADR 0053) trên một database thật.
 *
 * Chỉ ĐỌC. Ba nhóm kiểm:
 *   1. Đối tượng DB — unique theo realm, FK tổ hợp, trigger, partial index có thật trong catalog
 *      (`migrate` thoát 0 không chứng minh được chúng tồn tại).
 *   2. Dữ liệu — không hàng nào trộn vai: thành viên/chủ gian hàng là partner, đội ngũ nền tảng là
 *      platform, mọi vai "khách" (đơn, giữ chỗ, hoàn tiền, ví người dùng…) là customer; không ai
 *      thuộc hai gian hàng; phiên native khớp realm của app; không chuyến nào chủ xe tự đặt.
 *   3. Độ phủ demo (`--expect-demo`) — có đủ tài khoản SONG SINH cùng SĐT ở hai realm để kiểm tay.
 *
 * Chạy: `pnpm --filter @xeprime/prisma realm:check` (thêm `-- --expect-demo` sau một seed demo).
 * Thoát 1 nếu có vi phạm; in tối đa 5 hàng mẫu mỗi vi phạm, KHÔNG in liên hệ đầy đủ.
 */
import {
  ACCOUNT_REALM,
  BOOKING_REQUEST_STATUS,
  MEMBERSHIP_STATUS,
  MOBILE_CLIENT_APP,
  SHOP_ONBOARDING_STATE,
  WALLET_OWNER_TYPE,
} from '@xeprime/types';
import { createPrismaClient } from './index';

const prisma = createPrismaClient();
const EXPECT_DEMO = process.argv.includes('--expect-demo');

interface Check {
  name: string;
  /** Câu SQL trả về các hàng VI PHẠM (rỗng = đạt). Cột `ref` là mã định danh để lần lại. */
  sql: string;
}

const P = ACCOUNT_REALM.PARTNER;
const C = ACCOUNT_REALM.CUSTOMER;
const PL = ACCOUNT_REALM.PLATFORM;
const ACTIVE = MEMBERSHIP_STATUS.ACTIVE;

/** Các đối tượng mà migration `account_realms` phải để lại — tên khớp đúng migration. */
const REQUIRED_CONSTRAINTS = [
  'users_realm_email_key',
  'users_realm_phone_key',
  'users_id_realm_key',
  'user_identities_user_realm_fkey',
  'user_identities_realm_provider_key',
];
const REQUIRED_TRIGGERS = [
  'users_realm_immutable',
  'tenant_memberships_user_realm_check',
  'tenants_owner_realm_check',
  'platform_memberships_user_realm_check',
];
const REQUIRED_INDEXES = ['tenant_memberships_one_active_per_user'];

/** Migration dựng ba realm — mốc phân biệt dữ liệu cũ (trộn vai được phép) với dữ liệu mới. */
const REALM_MIGRATION = '20261002120000_account_realms';

/** Bảng có cột `customer_user_id` — mọi hàng phải trỏ vào tài khoản realm khách. */
const CUSTOMER_ROLE_TABLES = [
  'booking_requests',
  'booking_holds',
  'hold_refunds',
  'promo_redemptions',
  'conversations',
  'tenant_customers',
];

function list(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(', ');
}

const SCHEMA_CHECKS: Check[] = [
  {
    name: 'Constraint/unique theo realm có trong catalog',
    sql: `SELECT name AS ref FROM unnest(ARRAY[${list(REQUIRED_CONSTRAINTS)}]) AS name
          WHERE NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname = name)
            AND NOT EXISTS (SELECT 1 FROM pg_class i WHERE i.relname = name AND i.relkind = 'i')`,
  },
  {
    name: 'Trigger realm có trong catalog',
    sql: `SELECT name AS ref FROM unnest(ARRAY[${list(REQUIRED_TRIGGERS)}]) AS name
          WHERE NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgname = name AND NOT t.tgisinternal)`,
  },
  {
    name: 'Partial index "một gian hàng mỗi người" có trong catalog',
    sql: `SELECT name AS ref FROM unnest(ARRAY[${list(REQUIRED_INDEXES)}]) AS name
          WHERE NOT EXISTS (SELECT 1 FROM pg_indexes x WHERE x.indexname = name)`,
  },
  {
    name: 'Unique email/SĐT TOÀN CỤC cũ đã gỡ',
    sql: `SELECT conname AS ref FROM pg_constraint WHERE conname IN ('users_email_key', 'users_phone_key')
          UNION ALL
          SELECT indexname FROM pg_indexes WHERE indexname IN ('users_email_key', 'users_phone_key')`,
  },
];

const DATA_CHECKS: Check[] = [
  {
    name: 'users.realm thuộc tập ba realm',
    sql: `SELECT id AS ref FROM users WHERE realm NOT IN (${list([C, P, PL])})`,
  },
  {
    name: 'Thành viên gian hàng là tài khoản partner',
    sql: `SELECT m.id AS ref FROM tenant_memberships m JOIN users u ON u.id = m.user_id
          WHERE u.realm <> '${P}'`,
  },
  {
    name: 'Chủ gian hàng là tài khoản partner',
    sql: `SELECT t.id AS ref FROM tenants t JOIN users u ON u.id = t.owner_user_id
          WHERE u.realm <> '${P}'`,
  },
  {
    name: 'Thành viên nền tảng là tài khoản platform',
    sql: `SELECT m.id AS ref FROM platform_memberships m JOIN users u ON u.id = m.user_id
          WHERE u.realm <> '${PL}'`,
  },
  {
    name: 'Không ai ở hai gian hàng cùng lúc',
    sql: `SELECT user_id AS ref FROM tenant_memberships WHERE status = '${ACTIVE}'
          GROUP BY user_id HAVING count(*) > 1`,
  },
  {
    name: 'Danh tính đăng nhập cùng realm với tài khoản',
    sql: `SELECT i.id AS ref FROM user_identities i JOIN users u ON u.id = i.user_id
          WHERE i.realm <> u.realm`,
  },
  ...CUSTOMER_ROLE_TABLES.map((table) => ({
    name: `${table}.customer_user_id là tài khoản khách`,
    sql: `SELECT x.id AS ref FROM ${table} x JOIN users u ON u.id = x.customer_user_id
          WHERE u.realm <> '${C}'`,
  })),
  {
    name: 'Ví người dùng chỉ thuộc tài khoản khách (chủ xe dùng ví gian hàng)',
    sql: `SELECT w.id AS ref FROM wallets w JOIN users u ON u.id = w.owner_user_id
          WHERE w.owner_type = '${WALLET_OWNER_TYPE.USER}' AND u.realm <> '${C}'`,
  },
  {
    name: 'Tài khoản ngân hàng cá nhân chỉ thuộc tài khoản khách',
    sql: `SELECT b.id AS ref FROM bank_accounts b JOIN users u ON u.id = b.owner_user_id
          WHERE b.owner_type = '${WALLET_OWNER_TYPE.USER}' AND u.realm <> '${C}'`,
  },
  {
    // Phiên đã thu hồi là phiên chết — migration tách realm thu hồi (không xoá) phiên lệch app.
    name: 'Phiên native còn sống khớp realm của app (Partner ↔ partner, XePrime ↔ customer)',
    sql: `SELECT s.id AS ref FROM native_auth_sessions s JOIN users u ON u.id = s.user_id
          WHERE s.revoked_at IS NULL AND u.realm <> CASE WHEN s.client_app = '${MOBILE_CLIENT_APP.PARTNER}'
                                THEN '${P}' ELSE '${C}' END`,
  },
  {
    // Chỉ đơn tạo SAU khi có realm: trước đó cùng một tài khoản được làm cả hai vai và luật chặn tự
    // đặt chưa tồn tại — migration tách những đơn cũ đó sang tài khoản khách song sinh cùng SĐT.
    name: 'Không chuyến nào chủ xe/nhân viên tự đặt bằng cùng SĐT (từ khi có realm)',
    sql: `SELECT r.id AS ref FROM booking_requests r
          JOIN users cu ON cu.id = r.customer_user_id
          JOIN tenant_memberships m ON m.tenant_id = r.tenant_id AND m.status = '${ACTIVE}'
          JOIN users mu ON mu.id = m.user_id
          WHERE r.status = '${BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING}'
            AND cu.phone IS NOT NULL AND cu.phone = mu.phone
            AND r.created_at > COALESCE((SELECT max(finished_at) FROM _prisma_migrations
                                         WHERE migration_name = '${REALM_MIGRATION}'
                                           AND rolled_back_at IS NULL),
                                        '-infinity')`,
  },
];

/** Độ phủ của dữ liệu demo — mỗi ca phải có ÍT NHẤT một hàng (ngược với các kiểm trên). */
const DEMO_COVERAGE: Check[] = [
  {
    name: 'Chủ gian hàng TUYẾN GÓI có tài khoản khách cùng SĐT',
    sql: `SELECT o.id AS ref FROM tenants t JOIN users o ON o.id = t.owner_user_id
          JOIN users c ON c.phone = o.phone AND c.realm = '${C}'
          WHERE t.onboarding_state = '${SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE}'`,
  },
  {
    name: 'Chủ xe TUYẾN HOA HỒNG có tài khoản khách cùng SĐT',
    sql: `SELECT o.id AS ref FROM tenants t JOIN users o ON o.id = t.owner_user_id
          JOIN users c ON c.phone = o.phone AND c.realm = '${C}'
          WHERE t.onboarding_state = '${SHOP_ONBOARDING_STATE.COMMISSION}'`,
  },
  {
    name: 'Khách có tài khoản partner cùng SĐT',
    sql: `SELECT c.id AS ref FROM users c JOIN users p ON p.phone = c.phone AND p.realm = '${P}'
          WHERE c.realm = '${C}'`,
  },
];

async function rows(sql: string): Promise<string[]> {
  const result = await prisma.$queryRawUnsafe<{ ref: string }[]>(sql);
  return result.map((r) => r.ref);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Thiếu DATABASE_URL.');
  console.log(`Kiểm bất biến realm trên database "${new URL(url).pathname.slice(1)}"\n`);

  let failures = 0;
  for (const check of [...SCHEMA_CHECKS, ...DATA_CHECKS]) {
    const bad = await rows(check.sql);
    if (bad.length === 0) {
      console.log(`  ✓ ${check.name}`);
    } else {
      failures += 1;
      console.log(`  ✗ ${check.name} — ${bad.length} vi phạm: ${bad.slice(0, 5).join(', ')}`);
    }
  }

  console.log(`\nĐộ phủ demo${EXPECT_DEMO ? '' : ' (chỉ báo — thêm --expect-demo để bắt buộc)'}:`);
  for (const check of DEMO_COVERAGE) {
    const found = await rows(check.sql);
    if (found.length > 0) {
      console.log(`  ✓ ${check.name} (${found.length})`);
    } else {
      if (EXPECT_DEMO) failures += 1;
      console.log(`  ${EXPECT_DEMO ? '✗' : '·'} ${check.name} — không có`);
    }
  }

  console.log(failures === 0 ? '\nĐẠT.' : `\nTRƯỢT: ${failures} mục.`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((err: unknown) => {
    console.error('Kiểm bất biến thất bại:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
