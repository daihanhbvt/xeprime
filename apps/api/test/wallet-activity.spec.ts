import type { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  WALLET_ACTIVITY_SOURCE,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
  WALLET_OWNER_TYPE,
  WITHDRAWAL_STATUS,
  taxPeriodKeyVn,
} from '@xeprime/types';
import { BankAccountsService } from '../src/modules/bank-accounts/bank-accounts.service';
import { WalletReadService } from '../src/modules/wallet/wallet-read.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { WithdrawalService } from '../src/modules/wallet/withdrawal.service';
import { PlatformWithdrawalService } from '../src/modules/wallet/platform-withdrawal.service';
import type { NotificationService } from '../src/modules/notification/notification.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';

/**
 * "Biến động số dư" — `WalletReadService.activity` (trang Quản lý ví, 04/11/2026).
 *
 * Lời hứa của danh sách gộp: mỗi khoản tiền hiện ĐÚNG MỘT lần. Lệnh rút là dòng của chính nó,
 * nên bút toán chi/đảo của nó không được hiện lại; lệnh đang chờ (chưa có bút toán nào) vẫn phải
 * có mặt, kèm việc chủ ví làm được với nó.
 */
const prisma = createPrismaClient() as unknown as PrismaService;
const wallet = new WalletService(prisma);
const read = new WalletReadService(prisma, wallet);
const bankAccounts = new BankAccountsService(prisma);
const audit = new AuditService(prisma);
const withdrawals = new WithdrawalService(prisma, wallet, bankAccounts, audit);
const notifications = { emitToUser: jest.fn(), emitToTenantMembers: jest.fn() };
/** Ngưỡng hai người của lệnh rút — spec đặt tường minh để không phụ thuộc .env. */
const DUAL_CONTROL_MIN = 10_000_000;
const dualControlConfig = { getOrThrow: () => DUAL_CONTROL_MIN };
const platform = new PlatformWithdrawalService(
  prisma,
  wallet,
  audit,
  notifications as unknown as NotificationService,
  dualControlConfig as unknown as ConfigService,
);

let dbAvailable = false;
let userId: string;
let accountId: string;

const owner = () => ({ type: WALLET_OWNER_TYPE.USER, userId }) as const;
const thisPeriod = () => taxPeriodKeyVn(new Date());

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  userId = newId();
  await prisma.user.create({
    data: { realm: ACCOUNT_REALM.CUSTOMER, id: userId, displayName: 'Chủ ví', status: 'active' },
  });
  const account = await bankAccounts.create(owner(), {
    bankCode: 'VCB',
    accountNumber: '0011001234567',
    accountName: 'Nguyen Van A',
  });
  accountId = account.id;

  await prisma.$transaction((tx) =>
    wallet.creditWithinTx(tx, {
      owner: owner(),
      kind: WALLET_ENTRY_KIND.HOLD_REFUND,
      sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
      sourceRefId: newId(),
      amount: new Prisma.Decimal(500_000),
    }),
  );
});

afterAll(async () => {
  if (dbAvailable) {
    const w = await prisma.wallet.findFirst({ where: { ownerUserId: userId } });
    if (w) {
      await prisma.$transaction([
        prisma.withdrawalRequest.deleteMany({ where: { walletId: w.id } }),
        prisma.walletEntry.deleteMany({ where: { walletId: w.id } }),
        prisma.wallet.delete({ where: { id: w.id } }),
      ]);
    }
    await prisma.bankAccount.deleteMany({ where: { ownerUserId: userId } });
    await prisma.user.delete({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Biến động số dư', () => {
  maybe('chưa có ví ⇒ trang rỗng của kỳ, không phải 404', async () => {
    const page = await read.activity({ type: WALLET_OWNER_TYPE.USER, userId: newId() }, {});
    expect(page).toMatchObject({ items: [], total: 0, page: 1, period: thisPeriod() });
  });

  maybe('lệnh rút đang chờ là MỘT dòng: số âm, số tài khoản đã che, huỷ được', async () => {
    const created = await withdrawals.create(owner(), userId, {
      amount: '100000',
      bankAccountId: accountId,
    });

    const page = await read.activity(owner(), { period: thisPeriod() });
    expect(page.total).toBe(2);
    const row = page.items.find((item) => item.id === created.id);
    expect(row).toMatchObject({
      source: WALLET_ACTIVITY_SOURCE.WITHDRAWAL,
      code: created.code,
      amount: '-100000',
      // Lệnh rút không ghi bút toán nào lúc tạo — không có "số dư sau" để kể.
      balanceAfter: null,
      cancellable: true,
      withdrawal: { status: WITHDRAWAL_STATUS.PENDING, bankCode: 'VCB' },
    });
    expect(row?.withdrawal?.accountNumberMasked).not.toContain('0011001234567');

    const credit = page.items.find((item) => item.source === WALLET_ACTIVITY_SOURCE.ENTRY);
    expect(credit).toMatchObject({
      kind: WALLET_ENTRY_KIND.HOLD_REFUND,
      amount: '500000',
      balanceAfter: '500000',
      cancellable: false,
      withdrawal: null,
    });

    await withdrawals.cancel(owner(), created.id, userId);
  });

  maybe('lệnh đã chuyển KHÔNG kéo theo dòng bút toán chi thứ hai', async () => {
    const created = await withdrawals.create(owner(), userId, {
      amount: '50000',
      bankAccountId: accountId,
    });
    await platform.approve(created.id, userId);
    const approved = await prisma.withdrawalRequest.findUniqueOrThrow({
      where: { id: created.id },
    });
    await platform.markPaid(created.id, userId, {
      bankReference: 'FT-ACTIVITY-1',
      rowVersion: approved.rowVersion,
    });

    const page = await read.activity(owner(), { period: thisPeriod() });
    // Khoản vào + lệnh đã huỷ ở ca trước + lệnh vừa chi — bút toán `withdrawal` không lặp lại.
    expect(page.total).toBe(3);
    expect(page.items.some((item) => item.kind === WALLET_ENTRY_KIND.WITHDRAWAL)).toBe(false);
    expect(page.items.find((item) => item.id === created.id)).toMatchObject({
      cancellable: false,
      withdrawal: { status: WITHDRAWAL_STATUS.PAID },
    });
    // Mới nhất trước.
    expect(page.items[0]?.id).toBe(created.id);
  });

  maybe('phân trang và lọc kỳ chạy trong DB', async () => {
    const first = await read.activity(owner(), { period: thisPeriod(), limit: 1 });
    expect(first).toMatchObject({ total: 3, limit: 1, hasNext: true });
    expect(first.items).toHaveLength(1);

    const other = await read.activity(owner(), { period: '2020-01' });
    expect(other).toMatchObject({ total: 0, items: [], period: '2020-01' });
  });
});
