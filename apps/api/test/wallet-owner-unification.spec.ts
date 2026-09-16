import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BANK_ACCOUNT_STATUS,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
  WALLET_OWNER_TYPE,
  WITHDRAWAL_STATUS,
  resolveRefundWalletOwner,
} from '@xeprime/types';

import { WalletService } from '../src/modules/wallet/wallet.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * VÍ HỢP NHẤT — đường CHẠY THẬT (không phải migration dữ liệu cũ), trên PostgreSQL thật.
 *
 * Migration một lần được chứng minh bằng chính nó (đối soát tổng nghĩa vụ trước/sau, nằm trong
 * `20260915120000_wallet_owner_unification`). Spec này khoá đường mà sản phẩm đi MỖI NGÀY về
 * sau: một khách thuê đã có số dư trở thành chủ xe.
 *
 * Bất biến được kiểm:
 *
 *  I1  tổng nghĩa vụ (`balance + pending_withdraw_amount`) KHÔNG đổi qua phép đổi chủ
 *  I2  `wallets.id` KHÔNG đổi ⇒ dòng sổ, lệnh rút, `balance_after` không phải sửa gì
 *  I4  một chủ xe KHÔNG còn ví `user` nào
 *  I5  ghi có hai lần cùng nguồn ⇒ một dòng
 *  I6  hai lệnh rút song song ⇒ đúng một thắng
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const wallet = new WalletService(asService);

const RUN = newId().slice(-8).toLowerCase();
let dbAvailable = false;
const userIds: string[] = [];
const tenantIds: string[] = [];

async function mkUser(tag: string): Promise<string> {
  const id = newId();
  await prisma.user.create({
    data: { id, displayName: `Ví ${tag}`, email: `wou-${tag}-${RUN}@xeprime.test` },
  });
  userIds.push(id);
  return id;
}

async function mkTenant(tag: string, ownerUserId: string): Promise<string> {
  const id = newId();
  await prisma.tenant.create({
    data: {
      id,
      code: `WOU-${id.slice(-8)}`,
      slug: `wou-${id.toLowerCase().slice(-10)}`,
      name: `WouShop-${tag}-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId: id,
      userId: ownerUserId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  tenantIds.push(id);
  return id;
}

/** Tổng nghĩa vụ của một ví — KHẢ DỤNG + ĐANG KHOÁ, đúng định nghĩa ADR 0033 điều 6. */
async function obligationOf(walletId: string): Promise<string> {
  const w = await prisma.wallet.findUniqueOrThrow({
    where: { id: walletId },
    select: { balance: true, pendingWithdrawAmount: true },
  });
  return w.balance.add(w.pendingWithdrawAmount).toFixed(2);
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
  }
});

afterAll(async () => {
  if (dbAvailable) {
    const wallets = await prisma.wallet.findMany({
      where: {
        OR: [{ ownerUserId: { in: userIds } }, { ownerTenantId: { in: tenantIds } }],
      },
      select: { id: true },
    });
    const ids = wallets.map((w) => w.id);
    await prisma.walletEntry.deleteMany({ where: { walletId: { in: ids } } });
    await prisma.withdrawalRequest.deleteMany({ where: { walletId: { in: ids } } });
    await prisma.wallet.deleteMany({ where: { id: { in: ids } } });
    await prisma.bankAccount.deleteMany({
      where: { OR: [{ ownerUserId: { in: userIds } }, { ownerTenantId: { in: tenantIds } }] },
    });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('đổi chủ ví khi một khách thuê trở thành chủ xe', () => {
  maybe('I1 + I2: số dư, dòng sổ, id ví và lệnh rút đang chờ đều đi theo nguyên vẹn', async () => {
    const userId = await mkUser('adopt');

    // Khách thuê đã nhận hai khoản hoàn và đang có một lệnh rút chờ admin chuyển.
    await prisma.$transaction(async (tx) => {
      await wallet.creditWithinTx(tx, {
        owner: { type: WALLET_OWNER_TYPE.USER, userId },
        kind: WALLET_ENTRY_KIND.HOLD_REFUND,
        sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
        sourceRefId: newId(),
        amount: new Prisma.Decimal('120000'),
      });
      await wallet.creditWithinTx(tx, {
        owner: { type: WALLET_OWNER_TYPE.USER, userId },
        kind: WALLET_ENTRY_KIND.HOLD_REFUND,
        sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
        sourceRefId: newId(),
        amount: new Prisma.Decimal('80000'),
      });
    });
    const walletId = (await wallet.findWalletId({ type: WALLET_OWNER_TYPE.USER, userId }))!;
    expect(walletId).toBeTruthy();

    await prisma.$transaction(async (tx) => {
      await wallet.holdForWithdrawalWithinTx(tx, walletId, new Prisma.Decimal('50000'));
      await tx.withdrawalRequest.create({
        data: {
          id: newId(),
          code: `XPW${RUN}A1`,
          walletId,
          amount: new Prisma.Decimal('50000'),
          status: WITHDRAWAL_STATUS.PENDING,
          bankCode: 'VCB',
          bankAccountNumber: '1234567890',
          bankAccountName: 'KHACH THUE',
          requestedByUserId: userId,
        },
      });
    });
    await prisma.bankAccount.create({
      data: {
        id: newId(),
        ownerType: WALLET_OWNER_TYPE.USER,
        ownerUserId: userId,
        bankCode: 'VCB',
        accountNumber: '1234567890',
        accountName: 'KHACH THUE',
        isDefault: true,
        status: BANK_ACCOUNT_STATUS.ACTIVE,
      },
    });

    const before = await obligationOf(walletId);
    const entriesBefore = await prisma.walletEntry.count({ where: { walletId } });
    expect(before).toBe('200000.00'); // 150.000 khả dụng + 50.000 đang khoá

    // …rồi họ mở gian hàng.
    const tenantId = await mkTenant('adopt', userId);
    await prisma.$transaction((tx) => wallet.adoptUserWalletWithinTx(tx, userId, tenantId));

    // I2 — id ví KHÔNG đổi, nên không tham chiếu nào phải sửa.
    const after = await prisma.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { ownerType: true, ownerUserId: true, ownerTenantId: true },
    });
    expect(after.ownerType).toBe(WALLET_OWNER_TYPE.TENANT);
    expect(after.ownerTenantId).toBe(tenantId);
    expect(after.ownerUserId).toBeNull();

    // I1 — không một đồng nào đổi.
    expect(await obligationOf(walletId)).toBe(before);
    expect(await prisma.walletEntry.count({ where: { walletId } })).toBe(entriesBefore);

    // Lệnh rút đang chờ đi theo miễn phí, và SNAPSHOT ngân hàng không đổi: admin vẫn chuyển
    // đúng tài khoản cá nhân mà người dùng đã khai.
    const wr = await prisma.withdrawalRequest.findFirstOrThrow({
      where: { walletId },
      select: { status: true, bankAccountNumber: true },
    });
    expect(wr.status).toBe(WITHDRAWAL_STATUS.PENDING);
    expect(wr.bankAccountNumber).toBe('1234567890');

    // Tài khoản ngân hàng đi theo — nếu không, màn rút tiền hiện ô chọn RỖNG.
    const bank = await prisma.bankAccount.findFirstOrThrow({
      where: { ownerTenantId: tenantId },
      select: { ownerType: true, ownerUserId: true },
    });
    expect(bank.ownerType).toBe(WALLET_OWNER_TYPE.TENANT);
    expect(bank.ownerUserId).toBeNull();

    // I4 — không còn ví `user` nào cho người này.
    expect(await wallet.findWalletId({ type: WALLET_OWNER_TYPE.USER, userId })).toBeNull();
  });

  maybe('khách CHƯA có ví: mở gian hàng không tạo ví rỗng nào', async () => {
    const userId = await mkUser('empty');
    const tenantId = await mkTenant('empty', userId);
    await prisma.$transaction((tx) => wallet.adoptUserWalletWithinTx(tx, userId, tenantId));

    expect(await wallet.findWalletId({ type: WALLET_OWNER_TYPE.USER, userId })).toBeNull();
    expect(await wallet.findWalletId({ type: WALLET_OWNER_TYPE.TENANT, tenantId })).toBeNull();
  });

  /*
   * Tenant vừa tạo trong cùng transaction thì KHÔNG THỂ đã có ví. Gặp là lỗi lập trình (ai đó
   * gọi hàm này ngoài `registerShop`), và ném to hơn hẳn việc lặng lẽ để lại hai ví.
   */
  maybe('tenant ĐÃ có ví ⇒ ném, không tự gộp ở đường chạy thật', async () => {
    const userId = await mkUser('dup');
    const tenantId = await mkTenant('dup', userId);
    await prisma.$transaction((tx) =>
      wallet.creditWithinTx(tx, {
        owner: { type: WALLET_OWNER_TYPE.TENANT, tenantId },
        kind: WALLET_ENTRY_KIND.HOLD_RELEASE,
        sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
        sourceRefId: newId(),
        amount: new Prisma.Decimal('10000'),
      }),
    );

    await expect(
      prisma.$transaction((tx) => wallet.adoptUserWalletWithinTx(tx, userId, tenantId)),
    ).rejects.toThrow(/đã có ví/);
  });
});

describe('định tuyến khoản hoàn sau khi hợp nhất', () => {
  maybe('chủ xe đi thuê ⇒ tiền hoàn về ví TENANT, KHÔNG sinh ví user thứ hai', async () => {
    const userId = await mkUser('refund');
    const tenantId = await mkTenant('refund', userId);
    await prisma.$transaction((tx) => wallet.adoptUserWalletWithinTx(tx, userId, tenantId));

    // Đúng phép tra mà `HoldSettlementService.refundWalletOwner` dùng.
    const membership = await prisma.tenantMembership.findFirst({
      where: {
        userId,
        status: MEMBERSHIP_STATUS.ACTIVE,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        tenant: { deletedAt: null },
      },
      orderBy: { createdAt: 'asc' },
      select: { tenantId: true },
    });
    const owner = resolveRefundWalletOwner(userId, membership?.tenantId ?? null);
    expect(owner).toEqual({ type: 'tenant', tenantId });

    await prisma.$transaction((tx) =>
      wallet.creditWithinTx(tx, {
        owner: { type: WALLET_OWNER_TYPE.TENANT, tenantId },
        kind: WALLET_ENTRY_KIND.HOLD_REFUND,
        sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
        sourceRefId: newId(),
        amount: new Prisma.Decimal('70000'),
      }),
    );

    expect(await wallet.findWalletId({ type: WALLET_OWNER_TYPE.USER, userId })).toBeNull();
    const tenantWalletId = (await wallet.findWalletId({
      type: WALLET_OWNER_TYPE.TENANT,
      tenantId,
    }))!;
    expect(await obligationOf(tenantWalletId)).toBe('70000.00');
  });

  maybe('người CHỈ đi thuê ⇒ vẫn là ví user (không phải ai cũng có tenant)', async () => {
    const userId = await mkUser('renter');
    const owner = resolveRefundWalletOwner(userId, null);
    expect(owner).toEqual({ type: 'user', userId });
  });
});

describe('bất biến tiền vẫn giữ sau khi đổi chủ', () => {
  maybe('I5: ghi có hai lần cùng nguồn ⇒ một dòng, số dư không nhân đôi', async () => {
    const userId = await mkUser('idem');
    const tenantId = await mkTenant('idem', userId);
    await prisma.$transaction((tx) => wallet.adoptUserWalletWithinTx(tx, userId, tenantId));

    const sourceRefId = newId();
    const credit = () =>
      prisma.$transaction((tx) =>
        wallet.creditWithinTx(tx, {
          owner: { type: WALLET_OWNER_TYPE.TENANT, tenantId },
          kind: WALLET_ENTRY_KIND.HOLD_RELEASE,
          sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
          sourceRefId,
          amount: new Prisma.Decimal('90000'),
        }),
      );

    expect(await credit()).not.toBeNull();
    expect(await credit()).toBeNull(); // no-op, không phải lỗi

    const walletId = (await wallet.findWalletId({ type: WALLET_OWNER_TYPE.TENANT, tenantId }))!;
    expect(await obligationOf(walletId)).toBe('90000.00');
    expect(await prisma.walletEntry.count({ where: { walletId } })).toBe(1);
  });

  maybe('I6: hai lệnh rút song song bằng đúng số dư ⇒ ĐÚNG MỘT thắng', async () => {
    const userId = await mkUser('race');
    const tenantId = await mkTenant('race', userId);
    await prisma.$transaction((tx) => wallet.adoptUserWalletWithinTx(tx, userId, tenantId));
    await prisma.$transaction((tx) =>
      wallet.creditWithinTx(tx, {
        owner: { type: WALLET_OWNER_TYPE.TENANT, tenantId },
        kind: WALLET_ENTRY_KIND.HOLD_RELEASE,
        sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
        sourceRefId: newId(),
        amount: new Prisma.Decimal('100000'),
      }),
    );
    const walletId = (await wallet.findWalletId({ type: WALLET_OWNER_TYPE.TENANT, tenantId }))!;

    const claim = () =>
      prisma.$transaction((tx) =>
        wallet.holdForWithdrawalWithinTx(tx, walletId, new Prisma.Decimal('100000')),
      );
    const [a, b] = await Promise.all([claim(), claim()]);

    expect([a, b].filter(Boolean)).toHaveLength(1);
    // Tổng nghĩa vụ không đổi: tiền chỉ chuyển từ KHẢ DỤNG sang ĐANG KHOÁ.
    expect(await obligationOf(walletId)).toBe('100000.00');
    const w = await prisma.wallet.findUniqueOrThrow({
      where: { id: walletId },
      select: { balance: true, pendingWithdrawAmount: true },
    });
    expect(w.balance.toFixed(0)).toBe('0');
    expect(w.pendingWithdrawAmount.toFixed(0)).toBe('100000');
  });
});
