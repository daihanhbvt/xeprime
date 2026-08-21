/**
 * Seed dữ liệu XePrime.
 *
 * Hai chế độ, tách bằng `SEED_MODE`:
 *   • `system` — chỉ dữ liệu NỀN (quyền, role hệ thống, danh mục thu/chi, gói dịch vụ, banner).
 *                Chạy được ở mọi môi trường, kể cả production.
 *   • `demo`   — mặc định: thêm 5 gian hàng, 15 tài khoản và toàn bộ dữ liệu vận hành mẫu.
 *
 * Idempotent: chạy nhiều lần không nhân bản. Mọi bản ghi có khoá tự nhiên thì `upsert` theo
 * khoá đó; phần còn lại dùng ID TẤT ĐỊNH suy từ khoá nghiệp vụ (`seedId`), nên chạy lại là cập
 * nhật đúng bản ghi cũ chứ không đẻ bản mới và cũng không phải xoá sạch rồi tạo lại.
 *
 * Chi tiết từng phần: `src/seed/*.ts`. Chạy: `pnpm db:seed`.
 */
import { seedCustomerAccounts, seedPlatformAccounts } from './seed/accounts';
import {
  PLATFORM_ADMIN_EMAIL,
  SEED_MODE,
  assertSeedTargetIsSafe,
  log,
  prisma,
} from './seed/context';
import { buildShop } from './seed/shop';
import { SHOP_SPECS } from './seed/shops';
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

  if (SEED_MODE === 'system') {
    log('\nXong: dữ liệu nền đã sẵn sàng. Không đổ dữ liệu demo ở chế độ này.');
    return;
  }

  log('\nTài khoản:');
  await cleanupLegacySeedData();
  const platform = await seedPlatformAccounts();
  const customers = await seedCustomerAccounts();

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
  log('\nĐăng nhập tại /login (mật khẩu: $PLATFORM_ADMIN_PASSWORD / $DEMO_PASSWORD):');
  log(`  nền tảng   : ${PLATFORM_ADMIN_EMAIL} · staff@ · reviewer@ · support@ · finance@xeprime.test`);
  log('  chủ shop   : owner.saigon@ · owner.hanoi@ · owner.danang@ · owner.cantho@ · owner.hue@xeprime.test');
  log('  nhân viên  : manager.saigon@ · staff.saigon@ · ketoan.saigon@ · staff.hanoi@xeprime.test');
  log('  khách      : khach.an@ · khach.binh@ · khach.cuong@ · khach.dung@ · khach.duc@xeprime.test');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err: unknown) => {
    console.error('Seed thất bại:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
