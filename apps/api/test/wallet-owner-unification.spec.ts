import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
  WALLET_OWNER_TYPE,
  WITHDRAWAL_STATUS,
  resolveRefundWalletOwner,
  type AccountRealm,
} from '@xeprime/types';

import { WalletService } from '../src/modules/wallet/wallet.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { releaseWalletObligations } from './helpers/wallet-cleanup';

/**
 * CHỦ VÍ theo không gian tài khoản (ADR 0053) — đường chạy thật, trên PostgreSQL thật.
 *
 * Trước ADR 0053, một khách thuê mở gian hàng thì ví người dùng của họ được "nhận về" tenant. Giờ
 * tài khoản khách và tài khoản đối tác là HAI tài khoản (cùng số điện thoại cũng vậy), nên không còn
 * phép đổi chủ nào: tiền của tài khoản khách ở ví người dùng của nó, tiền của gian hàng ở ví tenant,
 * và hai bên không bao giờ chạm nhau.
 *
 * Bất biến được kiểm:
 *
 *  R1  mở gian hàng ở site partner KHÔNG chạm ví của tài khoản khách cùng số
 *  R2  khoản hoàn luôn về ví của TÀI KHOẢN KHÁCH đã đặt — kể cả khi cùng số có gian hàng
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

let phoneSeq = 0;
/** SĐT riêng của suite — hai realm dùng CHUNG một số để mô phỏng một người hai tài khoản. */
function mkPhone(): string {
  phoneSeq += 1;
  return `8496${String(Date.now() % 1_000_000).padStart(6, '0')}${phoneSeq}`.slice(0, 11);
}

async function mkUser(
  tag: string,
  realm: AccountRealm,
  phone: string | null = null,
): Promise<string> {
  const id = newId();
  await prisma.user.create({
    data: { id, realm, phone, displayName: `Ví ${tag}`, email: `wou-${tag}-${RUN}@xeprime.test` },
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
    await releaseWalletObligations(prisma, { tenantIds, userIds });
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

describe('hai tài khoản cùng số điện thoại — hai ví tách biệt', () => {
  maybe('R1: mở gian hàng ở site partner không chạm ví của tài khoản khách cùng số', async () => {
    const phone = mkPhone();
    const customerId = await mkUser('khach', ACCOUNT_REALM.CUSTOMER, phone);

    // Tài khoản khách đã nhận hoàn và đang có một lệnh rút chờ admin chuyển.
    await prisma.$transaction((tx) =>
      wallet.creditWithinTx(tx, {
        owner: { type: WALLET_OWNER_TYPE.USER, userId: customerId },
        kind: WALLET_ENTRY_KIND.HOLD_REFUND,
        sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
        sourceRefId: newId(),
        amount: new Prisma.Decimal('200000'),
      }),
    );
    const customerWalletId = (await wallet.findWalletId({
      type: WALLET_OWNER_TYPE.USER,
      userId: customerId,
    }))!;
    await prisma.$transaction(async (tx) => {
      await wallet.holdForWithdrawalWithinTx(tx, customerWalletId, new Prisma.Decimal('50000'));
      await tx.withdrawalRequest.create({
        data: {
          id: newId(),
          code: `XPW${RUN}A1`,
          walletId: customerWalletId,
          amount: new Prisma.Decimal('50000'),
          status: WITHDRAWAL_STATUS.PENDING,
          bankCode: 'VCB',
          bankAccountNumber: '1234567890',
          bankAccountName: 'KHACH THUE',
          requestedByUserId: customerId,
        },
      });
    });
    const before = await obligationOf(customerWalletId);

    // Cùng người đăng ký site partner (tài khoản KHÁC) và mở gian hàng.
    const partnerId = await mkUser('chuxe', ACCOUNT_REALM.PARTNER, phone);
    const tenantId = await mkTenant('chuxe', partnerId);

    // Ví khách y nguyên — chủ, số dư, lệnh rút.
    const after = await prisma.wallet.findUniqueOrThrow({
      where: { id: customerWalletId },
      select: { ownerType: true, ownerUserId: true, ownerTenantId: true },
    });
    expect(after).toEqual({
      ownerType: WALLET_OWNER_TYPE.USER,
      ownerUserId: customerId,
      ownerTenantId: null,
    });
    expect(await obligationOf(customerWalletId)).toBe(before);

    // Gian hàng chưa có ví cho tới khoản đầu tiên của chính nó; tài khoản partner không có ví user.
    expect(await wallet.findWalletId({ type: WALLET_OWNER_TYPE.TENANT, tenantId })).toBeNull();
    expect(
      await wallet.findWalletId({ type: WALLET_OWNER_TYPE.USER, userId: partnerId }),
    ).toBeNull();
  });

  maybe('R2: khoản hoàn luôn về ví của tài khoản KHÁCH đã đặt', async () => {
    const phone = mkPhone();
    const customerId = await mkUser('hoan', ACCOUNT_REALM.CUSTOMER, phone);
    const partnerId = await mkUser('hoan-chuxe', ACCOUNT_REALM.PARTNER, phone);
    const tenantId = await mkTenant('hoan', partnerId);

    // Đúng hàm mà `HoldSettlementService.refundWalletOwner` dùng — không còn tham số tenant.
    expect(resolveRefundWalletOwner(customerId)).toEqual({ type: 'user', userId: customerId });

    await prisma.$transaction((tx) =>
      wallet.creditWithinTx(tx, {
        owner: { type: WALLET_OWNER_TYPE.USER, userId: customerId },
        kind: WALLET_ENTRY_KIND.HOLD_REFUND,
        sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
        sourceRefId: newId(),
        amount: new Prisma.Decimal('70000'),
      }),
    );

    const customerWalletId = (await wallet.findWalletId({
      type: WALLET_OWNER_TYPE.USER,
      userId: customerId,
    }))!;
    expect(await obligationOf(customerWalletId)).toBe('70000.00');
    // Gian hàng của cùng số không nhận đồng nào.
    expect(await wallet.findWalletId({ type: WALLET_OWNER_TYPE.TENANT, tenantId })).toBeNull();
  });
});

describe('bất biến tiền của ví gian hàng', () => {
  maybe('I5: ghi có hai lần cùng nguồn ⇒ một dòng, số dư không nhân đôi', async () => {
    const ownerId = await mkUser('idem', ACCOUNT_REALM.PARTNER);
    const tenantId = await mkTenant('idem', ownerId);

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
    const ownerId = await mkUser('race', ACCOUNT_REALM.PARTNER);
    const tenantId = await mkTenant('race', ownerId);
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
