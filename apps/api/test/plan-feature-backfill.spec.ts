import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  MEMBERSHIP_STATUS,
  PLAN_FEATURE,
  RECEIPT_SOURCE,
  RECEIPT_STATUS,
  RECEIPT_TYPE,
  TENANT_ROLE,
} from '@xeprime/types';

/**
 * W3 LÔ 1 — vị từ BACKFILL của `tenants.used_features` (ADR 0027 điều 3).
 *
 * Vì sao spec này quan trọng hơn vẻ ngoài của nó: vị từ ở đây quyết định mỗi gian hàng **đang
 * chạy thật** rơi vào `read_only` hay `hidden` ở ngày bật cổng chặn. Sai một vị từ là lật ngược
 * trạng thái đó cho CẢ SÀN — và không ai phát hiện cho tới khi người dùng gọi hỗ trợ.
 *
 * Spec chạy **chính các câu `UPDATE` trong file migration**, không phải một bản chép lại: hai bản
 * SQL sẽ trôi khỏi nhau, và bản trôi mất là bản đang được kiểm.
 */
const MIGRATION_SQL = join(
  __dirname,
  '../../../prisma/migrations/20260830000000_tenant_used_features/migration.sql',
);

const prisma = createPrismaClient();
const RUN = newId().slice(-8).toLowerCase();

let dbAvailable = false;
let ownerId: string;
const tenantIds: string[] = [];

/** Các câu `UPDATE … used_features …` trích từ chính migration, giữ nguyên thứ tự. */
function backfillStatements(): string[] {
  const sql = readFileSync(MIGRATION_SQL, 'utf8');
  return sql
    .split(';')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((stmt) => stmt.toUpperCase().startsWith('UPDATE'));
}

async function mkTenant(tag: string): Promise<string> {
  const id = newId();
  await prisma.tenant.create({
    data: {
      id,
      code: `T-${id.slice(-8)}`,
      slug: `t-${id.toLowerCase().slice(-10)}`,
      name: `Backfill-${tag}-${RUN}`,
      status: 'active',
      ownerUserId: ownerId,
    },
  });
  tenantIds.push(id);
  // Mọi tenant thật đều có sẵn MỘT membership chủ shop + MỘT chi nhánh mặc định
  // (`registerShop` tạo) — đây chính là lý do ngưỡng phải là `> 1`, không phải EXISTS.
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId: id,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  await prisma.tenantBranch.create({
    data: {
      id: newId(),
      tenantId: id,
      code: `CN${id.slice(-4)}`,
      name: 'Chi nhánh mặc định',
      provinceCode: '79',
      isDefault: true,
    },
  });
  return id;
}

function mkReceipt(tenantId: string, source: string) {
  return prisma.receipt.create({
    data: {
      id: newId(),
      tenantId,
      type: RECEIPT_TYPE.INCOME,
      amount: 100_000,
      paymentMethod: 'cash',
      status: RECEIPT_STATUS.APPROVED,
      source,
      // CHECK `receipts_source_ref_check`: phiếu KHÔNG phải nhập tay bắt buộc có nguồn gốc —
      // chính ràng buộc đó là thứ khiến `source` đáng tin làm vị từ backfill.
      sourceRefId: source === RECEIPT_SOURCE.MANUAL ? null : newId(),
    },
  });
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  ownerId = newId();
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Backfill Owner', email: `bf-${RUN}@xeprime.test` },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.receipt.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.financeCategory.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/** Chạy đúng chuỗi backfill của migration, rồi đọc lại cờ của một tenant. */
async function runBackfill(tenantId: string): Promise<string[]> {
  for (const stmt of backfillStatements()) {
    await prisma.$executeRawUnsafe(stmt);
  }
  const row = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { usedFeatures: true },
  });
  return [...row.usedFeatures].sort();
}

describe('backfill used_features — vị từ quyết định read_only vs hidden', () => {
  maybe('trích được đúng 7 câu UPDATE từ migration (escrow_hold cố ý không backfill)', async () => {
    expect(backfillStatements()).toHaveLength(7);
  });

  maybe(
    '⚠️ tenant CHỈ có phiếu thu TỰ SINH không được đánh dấu finance — nếu không cả sàn thành read_only',
    async () => {
      const id = await mkTenant('auto-receipt');
      // Đúng ba nguồn mà `ReceiptsService.createApprovedWithinTx` sinh ra cho mọi tenant từng
      // nhận tiền của một đơn — không nguồn nào chứng minh họ có dùng SỔ thu chi.
      await mkReceipt(id, RECEIPT_SOURCE.PAYMENT);
      await mkReceipt(id, RECEIPT_SOURCE.DEPOSIT);
      await mkReceipt(id, RECEIPT_SOURCE.MAINTENANCE);

      expect(await runBackfill(id)).toEqual([]);
    },
  );

  maybe('⚠️ tenant MỚI TINH không được đánh dấu branches/members (registerShop tạo sẵn 1+1)', async () => {
    const id = await mkTenant('fresh');
    expect(await runBackfill(id)).toEqual([]);
  });

  maybe('phiếu thu NHẬP TAY ⇒ finance + debts (chiều ngược lại phải đúng)', async () => {
    const id = await mkTenant('manual-receipt');
    await mkReceipt(id, RECEIPT_SOURCE.MANUAL);

    expect(await runBackfill(id)).toEqual([PLAN_FEATURE.DEBTS, PLAN_FEATURE.FINANCE].sort());
  });

  maybe('hạng mục thu/chi RIÊNG của tenant cũng tính là đã dùng sổ', async () => {
    const id = await mkTenant('own-category');
    await prisma.financeCategory.create({
      data: { id: newId(), tenantId: id, type: 'expense', name: `Xăng dầu ${RUN}` },
    });

    expect(await runBackfill(id)).toEqual([PLAN_FEATURE.DEBTS, PLAN_FEATURE.FINANCE].sort());
  });

  maybe('người thứ HAI ⇒ members; chi nhánh thứ HAI ⇒ branches', async () => {
    const id = await mkTenant('grown');
    const staffId = newId();
    await prisma.user.create({
      data: { id: staffId, displayName: 'Staff', email: `bf-staff-${RUN}@xeprime.test` },
    });
    await prisma.tenantMembership.create({
      data: {
        id: newId(),
        tenantId: id,
        userId: staffId,
        roleKey: TENANT_ROLE.SHOP_STAFF,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    });
    await prisma.tenantBranch.create({
      data: {
        id: newId(),
        tenantId: id,
        /*
         * `CN2` + BỐN ký tự cuối, không phải ba.
         *
         * Chi nhánh mặc định ở `mkTenant` mang mã `CN` + bốn ký tự cuối. Với ba ký tự, hai mã
         * bằng nhau đúng khi ký tự thứ tư từ cuối của ULID là `2` — 1/32 lần chạy, và unique
         * `(tenant_id, code)` làm spec đỏ với một lỗi trông như ngẫu nhiên. Bốn ký tự làm hai
         * mã khác độ dài nên không bao giờ trùng, bất kể ULID sinh ra gì.
         */
        code: `CN2${id.slice(-4)}`,
        name: 'Chi nhánh 2',
        provinceCode: '79',
      },
    });

    expect(await runBackfill(id)).toEqual([PLAN_FEATURE.BRANCHES, PLAN_FEATURE.MEMBERS].sort());
    await prisma.user.deleteMany({ where: { id: staffId } });
  });

  maybe('chạy lại backfill là NO-OP (không nhân đôi cờ) — migration idempotent', async () => {
    const id = await mkTenant('idempotent');
    await mkReceipt(id, RECEIPT_SOURCE.MANUAL);

    const first = await runBackfill(id);
    const second = await runBackfill(id);
    expect(second).toEqual(first);
    expect(new Set(second).size).toBe(second.length);
  });
});
