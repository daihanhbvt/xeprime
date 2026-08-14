/**
 * Dọn DẤU VẾT của test tự động (jest) còn sót trong database.
 *
 * Vì sao cần: `apps/api/test/*.spec.ts` chạy trên PostgreSQL THẬT (ADR 0006 — exclusion
 * constraint không mock được). Mỗi spec tự dọn ở `afterAll`, nhưng một lần chạy bị ngắt giữa
 * chừng (Ctrl+C, máy sleep, spec ném lỗi trước afterAll) sẽ để lại bản ghi mồ côi lẫn vào
 * database dev.
 *
 * Ba nguyên tắc của script này:
 *   1. MẶC ĐỊNH LÀ DRY-RUN. Muốn xoá thật phải truyền `--execute`.
 *   2. Chỉ nhận diện bằng DẤU HIỆU XÁC ĐỊNH do chính spec sinh ra (email `<prefix>-<ULID>@
 *      xeprime.test`, slug gian hàng `t-xxxxxxxx`), KHÔNG đoán theo tên/ngày tạo. Dữ liệu QA
 *      thủ công và dữ liệu demo của seed KHÔNG khớp các dấu hiệu này và không bao giờ bị đụng.
 *   3. Từ chối chạy ở production và ở database trông giống production.
 *
 * Chạy:
 *   pnpm db:cleanup-test          # đếm, không xoá
 *   pnpm db:cleanup-test --execute
 */
import { createPrismaClient } from './index';

const prisma = createPrismaClient();

const EXECUTE = process.argv.includes('--execute');

/**
 * Tài khoản/gian hàng của SEED — danh sách loại trừ tuyệt đối.
 * Chúng cũng dùng tên miền `@xeprime.test` nên phải nêu đích danh, không thể lọc theo tên miền.
 */
const SEED_EMAILS = ['owner@xeprime.test', 'customer@xeprime.test', 'admin@xeprime.test'];
const SEED_TENANT_SLUGS = ['xeprime-demo'];

/**
 * Email do spec sinh: `<tiền tố chữ>-<ULID hoặc tag>@xeprime.test` (vd `own-01K…@xeprime.test`).
 * Người thật không đặt email dạng này; và phần `-` bắt buộc loại luôn `owner@xeprime.test`.
 */
const TEST_EMAIL_RE = /^[a-z]{1,12}-[0-9a-zA-Z]{6,32}(-[0-9a-zA-Z]{1,32})?@xeprime\.test$/;

/** Slug gian hàng do spec sinh: `t-xxxxxxxx` / `test-xxxxxxxx` (8–10 ký tự cuối của ULID). */
const TEST_TENANT_SLUG_RE = /^(t|test)-[0-9a-z]{6,12}$/;

/**
 * Từ chối chạy ở nơi không được phép. Kiểm cả NODE_ENV lẫn chính chuỗi kết nối: một `.env` bị
 * copy nhầm sẽ có NODE_ENV=development mà DATABASE_URL trỏ vào máy chủ thật.
 */
function assertSafeTarget(): { host: string; database: string } {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NODE_ENV=production — script này không bao giờ chạy ở production.');
  }

  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('Thiếu DATABASE_URL.');

  const url = new URL(raw);
  const host = url.hostname;
  const database = url.pathname.replace(/^\//, '');

  const localHosts = ['localhost', '127.0.0.1', '::1', 'db', 'postgres'];
  const looksLocal = localHosts.includes(host);
  const looksTestDb = /_(test|rc_fresh|rc_clone)$/.test(database);
  if (!looksLocal && !looksTestDb) {
    throw new Error(
      `DATABASE_URL trỏ tới host không phải máy local (${host}) và tên database không kết thúc ` +
        `bằng _test. Từ chối chạy.`,
    );
  }
  if (/prod/i.test(host) || /prod/i.test(database)) {
    throw new Error(`Host/tên database chứa "prod" (${host}/${database}). Từ chối chạy.`);
  }

  return { host, database };
}

async function main(): Promise<void> {
  const target = assertSafeTarget();
  console.log(`Đối tượng: ${target.database} @ ${target.host}`);
  console.log(EXECUTE ? 'Chế độ: XOÁ THẬT (--execute)\n' : 'Chế độ: DRY-RUN (không xoá gì)\n');

  // Lọc ở tầng ứng dụng bằng regex thay vì LIKE ở SQL: dấu hiệu là HÌNH DẠNG chuỗi, và một
  // `LIKE '%@xeprime.test'` sẽ quét trúng cả tài khoản demo của seed.
  const candidateUsers = (
    await prisma.user.findMany({
      where: { email: { endsWith: '@xeprime.test' } },
      select: { id: true, email: true },
    })
  ).filter(
    (u) => u.email !== null && !SEED_EMAILS.includes(u.email) && TEST_EMAIL_RE.test(u.email),
  );

  const candidateTenants = (
    await prisma.tenant.findMany({ select: { id: true, slug: true } })
  ).filter((t) => !SEED_TENANT_SLUGS.includes(t.slug) && TEST_TENANT_SLUG_RE.test(t.slug));

  const userIds = candidateUsers.map((u) => u.id);
  const tenantIds = candidateTenants.map((t) => t.id);

  // Ảnh hưởng dây chuyền: đếm TRƯỚC để người chạy biết mình sắp xoá bao nhiêu, kể cả các bảng
  // bị cascade kéo theo (FK `onDelete: Cascade` từ tenants/users).
  const [vehicles, bookings, memberships, listings, audits] = await Promise.all([
    tenantIds.length ? prisma.vehicle.count({ where: { tenantId: { in: tenantIds } } }) : 0,
    tenantIds.length ? prisma.booking.count({ where: { tenantId: { in: tenantIds } } }) : 0,
    tenantIds.length
      ? prisma.tenantMembership.count({ where: { tenantId: { in: tenantIds } } })
      : 0,
    tenantIds.length ? prisma.publicListing.count({ where: { tenantId: { in: tenantIds } } }) : 0,
    tenantIds.length ? prisma.auditLog.count({ where: { tenantId: { in: tenantIds } } }) : 0,
  ]);

  console.log('Bản ghi khớp dấu hiệu test tự động:');
  console.log(`  users               : ${userIds.length}`);
  console.log(`  tenants             : ${tenantIds.length}`);
  console.log('Kéo theo (cascade từ tenants ở trên):');
  console.log(`  vehicles            : ${vehicles}`);
  console.log(`  bookings            : ${bookings}`);
  console.log(`  tenant_memberships  : ${memberships}`);
  console.log(`  public_listings     : ${listings}`);
  console.log(`  audit_logs          : ${audits}`);

  if (userIds.length === 0 && tenantIds.length === 0) {
    console.log('\nKhông có gì để dọn.');
    return;
  }

  if (!EXECUTE) {
    console.log('\nDRY-RUN: chưa xoá gì. Thêm `--execute` để thực hiện.');
    return;
  }

  // Một transaction: hoặc dọn sạch, hoặc không đụng gì. Xoá tenant trước để cascade gỡ hết dữ
  // liệu phụ thuộc, rồi mới tới user (user có thể là chủ tenant).
  const result = await prisma.$transaction(async (tx) => {
    const tenantsDeleted = tenantIds.length
      ? (await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } })).count
      : 0;
    const usersDeleted = userIds.length
      ? (await tx.user.deleteMany({ where: { id: { in: userIds } } })).count
      : 0;
    return { tenantsDeleted, usersDeleted };
  });

  console.log(`\nĐã xoá: tenants=${result.tenantsDeleted}, users=${result.usersDeleted}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err: unknown) => {
    console.error('Cleanup thất bại:', err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
