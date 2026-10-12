/**
 * Seed dữ liệu XePrime.
 *
 * Hai chế độ, tách bằng `SEED_MODE`:
 *   • `system` — chỉ dữ liệu NỀN (quyền, role hệ thống, danh mục thu/chi, gói dịch vụ, banner,
 *                danh mục xe) + tài khoản `platform_admin`. Chạy được ở mọi môi trường, kể cả
 *                production. Tỉnh/xã không ở đây: migration nạp sẵn.
 *   • `demo`   — mặc định: thêm 3 gian hàng tuyến gói (12 / 5 / 2 xe — mỗi bậc một gian hàng),
 *                3 chủ xe cá nhân tuyến hoa hồng (1 / 2 / 3 xe), 3 khách, 3 nhân viên gian hàng,
 *                2 tài khoản nền tảng demo, kèm dữ liệu vận hành mẫu và tài khoản song sinh.
 *
 * Idempotent: chạy nhiều lần không nhân bản. Mọi bản ghi có khoá tự nhiên thì `upsert` theo
 * khoá đó; phần còn lại dùng ID TẤT ĐỊNH suy từ khoá nghiệp vụ (`seedId`), nên chạy lại là cập
 * nhật đúng bản ghi cũ chứ không đẻ bản mới và cũng không phải xoá sạch rồi tạo lại.
 *
 * Chi tiết từng phần: `src/seed/*.ts`. Chạy: `pnpm db:seed`.
 */
import { refreshListingRankScore } from './listing-rank';
import {
  seedCrossRealmTwins,
  seedCustomerAccounts,
  seedCustomerDriverLicences,
  seedPlatformAccounts,
  seedPlatformAdmin,
} from './seed/accounts';
import {
  PLATFORM_ADMIN_EMAIL,
  SEED_MODE,
  assertSeedTargetIsSafe,
  log,
  prisma,
} from './seed/context';
import { COMMISSION_OWNER_SPECS } from './seed/commission-owners';
import { CROSS_REALM_TWINS, CUSTOMER_ACCOUNTS, PLATFORM_ACCOUNTS } from './seed/identities';
import { buildShop } from './seed/shop';
import { SHOP_SPECS } from './seed/shops';
import { seedVehicleCatalog } from './seed/catalog-sync';
import { seedSystemData } from './seed/system';

/**
 * Gian hàng và tài khoản của SEED ĐỜI TRƯỚC (một gian hàng `xeprime-demo` duy nhất).
 *
 * Bộ seed hiện tại thay nó bằng năm gian hàng có quy mô khác nhau. Máy dev nào đã chạy seed cũ
 * sẽ còn nguyên dữ liệu đó nằm lẫn vào — nên seed tự dọn, thay vì để mỗi người tự xoá tay và
 * mỗi người xoá sót một kiểu.
 *
 * Chỉ chạy ở chế độ `demo`, mà chế độ đó đã bị `assertSeedTargetIsSafe` chặn ở production.
 */
const LEGACY_TENANT_SLUG = 'xeprime-demo';
const LEGACY_USER_EMAILS = ['owner@xeprime.test', 'customer@xeprime.test', 'admin@xeprime.test'];
/** Banner của seed cũ mang id cố định tự đặt; bộ mới sinh id từ `seedId` nên không đè lên được. */
const LEGACY_BANNER_IDS = [
  '01SEEDBANNER0000000000000A',
  '01SEEDBANNER0000000000000B',
  '01SEEDBANNER0000000000000C',
];

async function cleanupLegacySeedData(): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: LEGACY_TENANT_SLUG },
    select: { id: true },
  });
  if (tenant) {
    // Xoá gian hàng kéo theo xe/đơn/tin đăng/sổ sách của nó (FK cascade). Phải xoá TRƯỚC user
    // vì `tenants.owner_user_id` chặn xoá chủ sở hữu khi gian hàng còn.
    await prisma.tenant.delete({ where: { id: tenant.id } });
  }
  const removed = await prisma.user.deleteMany({ where: { email: { in: LEGACY_USER_EMAILS } } });
  const banners = await prisma.marketplaceBanner.deleteMany({
    where: { id: { in: LEGACY_BANNER_IDS } },
  });
  if (tenant || removed.count > 0 || banners.count > 0) {
    log(
      `  dọn dữ liệu seed đời cũ: ${tenant ? '1 gian hàng, ' : ''}` +
        `${removed.count} tài khoản, ${banners.count} banner`,
    );
  }
}

/** Nhãn hãng xe đọc từ `catalog_items` — tên xe dựng từ danh mục thật, không từ hằng số chép tay. */
async function loadBrandLabels(): Promise<Map<string, string>> {
  const rows = await prisma.catalogItem.findMany({
    where: { type: 'vehicle_brand' },
    select: { key: true, label: true },
  });
  if (rows.length === 0) {
    throw new Error(
      'Bảng `catalog_items` rỗng — migration baseline chưa chạy. Chạy `pnpm db:migrate` trước.',
    );
  }
  return new Map(rows.map((r) => [r.key, r.label]));
}

async function main(): Promise<void> {
  assertSeedTargetIsSafe();
  log(`Seeding XePrime (SEED_MODE=${SEED_MODE})...\n`);

  log('Dữ liệu nền:');
  const system = await seedSystemData();
  // Danh mục hãng/mẫu xe: dữ liệu nền như quyền và gói dịch vụ — chủ xe không đăng nổi một
  // chiếc xe nếu ô "Mẫu xe" rỗng.
  await seedVehicleCatalog();
  const adminUserId = await seedPlatformAdmin();

  if (SEED_MODE === 'system') {
    log('\nXong: dữ liệu nền đã sẵn sàng. Không đổ dữ liệu demo ở chế độ này.');
    return;
  }

  log('\nTài khoản:');
  await cleanupLegacySeedData();
  const platform = await seedPlatformAccounts(adminUserId);
  const customers = await seedCustomerAccounts();
  await seedCustomerDriverLicences(customers, adminUserId);

  log('\nGian hàng:');
  const brandLabels = await loadBrandLabels();
  const results = [];
  for (const spec of SHOP_SPECS) {
    results.push(
      await buildShop(spec, {
        platform,
        customers,
        financeCategoryIds: system.financeCategoryIds,
        planIds: system.planIds,
        brandLabels,
      }),
    );
  }

  /*
   * Xếp hạng lại chợ sau khi đã có đủ xe, đánh giá và chuyến.
   *
   * Seed ghi `public_listings` trực tiếp (không đi qua `ListingsService`) nên không xe nào có
   * điểm; bỏ bước này thì một database vừa seed xong sẽ hiện trang chủ theo đúng thứ tự ngẫu
   * nhiên của `created_at` và mọi thao tác kiểm thử xếp hạng đều nói dối.
   *
   * Đặt ở CUỐI có chủ đích: điểm đọc số chuyến đã hoàn thành và số đánh giá, hai thứ chỉ tồn
   * tại sau khi `buildShop` chạy xong.
   */
  // Sau gian hàng: song sinh là bản sao ở realm thứ hai của chủ shop/khách vừa tạo.
  log('\nTài khoản song sinh (ADR 0053):');
  await seedCrossRealmTwins();

  const ranked = await refreshListingRankScore(prisma);
  log(`
Xếp hạng chợ: ${ranked} tin đăng đã có điểm gợi ý`);

  const total = results.reduce(
    (acc, r) => ({
      vehicles: acc.vehicles + r.vehicles,
      listings: acc.listings + r.listings,
      bookings: acc.bookings + r.bookings,
      customers: acc.customers + r.customers,
      receipts: acc.receipts + r.receipts,
      reviews: acc.reviews + r.reviews,
    }),
    { vehicles: 0, listings: 0, bookings: 0, customers: 0, receipts: 0, reviews: 0 },
  );

  log(
    `\nTổng: ${SHOP_SPECS.length} gian hàng · ${total.vehicles} xe · ${total.listings} tin đăng · ` +
      `${total.bookings} đơn · ${total.customers} khách · ${total.receipts} phiếu thu chi · ` +
      `${total.reviews} đánh giá`,
  );

  // CỐ Ý không in mật khẩu: chúng đến từ env, và stdout đi thẳng vào log terminal/CI. Người
  // chạy seed là người đã đặt các biến đó.
  // Mỗi realm đăng nhập ở site của nó (ADR 0053) — cùng email ở site khác là tài khoản KHÁC.
  log(
    '\nĐăng nhập (mật khẩu: $PLATFORM_ADMIN_PASSWORD cho quản trị, $DEMO_PASSWORD cho phần còn lại):',
  );
  const short = (email: string) => email.replace('@xeprime.test', '@');
  const shops = SHOP_SPECS.filter((s) => !COMMISSION_OWNER_SPECS.includes(s));
  log('  ── site QUẢN TRỊ (admin) · /login');
  log(
    `  nền tảng   : ${PLATFORM_ADMIN_EMAIL} · ${PLATFORM_ACCOUNTS.map((a) => a.email).join(' · ')}`,
  );
  log('  ── site ĐỐI TÁC (partner) · /login');
  log(
    '  gian hàng  : ' +
      shops
        .map((s) => `${short(s.owner.email)} (${s.fleet.reduce((n, f) => n + f.count, 0)} xe)`)
        .join(' · '),
  );
  log(
    '  chủ xe cá nhân: ' +
      COMMISSION_OWNER_SPECS.map((s) => `${short(s.owner.email)} (${s.fleet.length} xe)`).join(
        ' · ',
      ),
  );
  log('  nhân viên  : ' + shops.flatMap((s) => s.staff.map((st) => short(st.email))).join(' · '));
  log('  ── site KHÁCH (xeprime.vn) · /login');
  log('  khách      : ' + CUSTOMER_ACCOUNTS.map((c) => short(c.email)).join(' · '));
  log(
    '  song sinh  : ' +
      CROSS_REALM_TWINS.map((t) => `${t.email.replace('@xeprime.test', '@')} (${t.realm})`).join(
        ' · ',
      ),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err: unknown) => {
    console.error('Seed thất bại:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
