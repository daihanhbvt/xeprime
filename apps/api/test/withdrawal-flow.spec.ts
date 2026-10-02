import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
  WALLET_OWNER_TYPE,
  WITHDRAWAL_STATUS,
  WITHDRAWAL_TERMS,
} from '@xeprime/types';
import { BankAccountsService } from '../src/modules/bank-accounts/bank-accounts.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { WithdrawalService } from '../src/modules/wallet/withdrawal.service';
import { PlatformWithdrawalService } from '../src/modules/wallet/platform-withdrawal.service';
import type { NotificationService } from '../src/modules/notification/notification.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';

/**
 * Vòng đời một lệnh rút — ADR 0023 điều 3 và 7, ADR 0033.
 *
 * Câu hỏi duy nhất mà mọi ca ở đây trả lời: **ở mỗi chặng, tiền đang ở đâu?** Không nhánh nào
 * được để số dư biến mất hoặc xuất hiện thêm, kể cả nhánh hỏng.
 */
const prisma = createPrismaClient() as unknown as PrismaService;
const wallet = new WalletService(prisma);
const bankAccounts = new BankAccountsService(prisma);
const audit = new AuditService(prisma);
const withdrawals = new WithdrawalService(prisma, wallet, bankAccounts, audit);
/** Thông báo là tác dụng phụ — chỉ cần biết AI được báo, không cần đẩy push thật. */
const notifications = { emitToUser: jest.fn(), emitToTenantMembers: jest.fn() };
const platform = new PlatformWithdrawalService(
  prisma,
  wallet,
  audit,
  notifications as unknown as NotificationService,
);

let dbAvailable = false;
let userId: string;
let accountId: string;

const dec = (n: number) => new Prisma.Decimal(n);
const owner = () => ({ type: WALLET_OWNER_TYPE.USER, userId }) as const;

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
  await prisma.user.create({ data: { id: userId, displayName: 'Chủ ví', status: 'active' } });

  const account = await bankAccounts.create(owner(), {
    bankCode: 'VCB',
    accountNumber: '0011001234567',
    accountName: 'Nguyen Van A',
  });
  accountId = account.id;

  // Nạp sẵn số dư bằng một khoản hoàn — đúng đường tiền vào thật, không chèn thẳng vào cột.
  await prisma.$transaction((tx) =>
    wallet.creditWithinTx(tx, {
      owner: owner(),
      kind: WALLET_ENTRY_KIND.HOLD_REFUND,
      sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
      sourceRefId: newId(),
      amount: dec(500_000),
    }),
  );
});

afterAll(async () => {
  if (dbAvailable) {
    const w = await prisma.wallet.findFirst({ where: { ownerUserId: userId } });
    if (w) {
      await prisma.withdrawalRequest.deleteMany({ where: { walletId: w.id } });
      await prisma.walletEntry.deleteMany({ where: { walletId: w.id } });
      await prisma.wallet.delete({ where: { id: w.id } });
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

describe('Tạo yêu cầu rút', () => {
  maybe('dưới mức tối thiểu bị từ chối — nói rõ con số, không chỉ "không hợp lệ"', async () => {
    await expect(
      /* Suy từ HẰNG SỐ, không gõ một con số: hạ sàn rút thì ca này phải đi theo, không đỏ lên. */
      withdrawals.create(owner(), userId, {
        amount: String(WITHDRAWAL_TERMS.MIN_AMOUNT - 1),
        bankAccountId: accountId,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'WITHDRAWAL_BELOW_MINIMUM',
        details: { minAmount: String(WITHDRAWAL_TERMS.MIN_AMOUNT) },
      },
    });
  });

  /**
   * Đây là bề mặt thật: biết id một tài khoản của người khác không cho quyền chuyển tiền về đó.
   * Điều kiện chủ sở hữu nằm trong chính câu truy vấn tài khoản.
   */
  maybe('tài khoản nhận KHÔNG thuộc chủ ví ⇒ 404, không tạo lệnh nào', async () => {
    const strangerId = newId();
    await prisma.user.create({
      data: { id: strangerId, displayName: 'Người lạ', status: 'active' },
    });
    const theirs = await bankAccounts.create(
      { type: WALLET_OWNER_TYPE.USER, userId: strangerId },
      { bankCode: 'ACB', accountNumber: '9999888877', accountName: 'Nguoi La' },
    );

    await expect(
      withdrawals.create(owner(), userId, { amount: '100000', bankAccountId: theirs.id }),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });

    await prisma.bankAccount.deleteMany({ where: { ownerUserId: strangerId } });
    await prisma.user.delete({ where: { id: strangerId } });
  });

  maybe('tạo thành công: tiền KHOÁ khỏi khả dụng, tổng nghĩa vụ KHÔNG đổi', async () => {
    const created = await withdrawals.create(owner(), userId, {
      amount: '200000',
      bankAccountId: accountId,
    });
    expect(created.status).toBe(WITHDRAWAL_STATUS.PENDING);
    expect(created.code.startsWith('XPW')).toBe(true);
    // PII: số tài khoản không hiện đầy đủ ra bề mặt của chủ ví.
    expect(created.accountNumberMasked).not.toContain('0011');

    const s = await wallet.summaryFor(owner());
    expect(s.available).toBe('300000');
    expect(s.pending).toBe('200000');
    expect(s.total).toBe('500000');
  });

  maybe('rút VƯỢT số dư khả dụng bị từ chối — phần đang treo không dùng lại được', async () => {
    await expect(
      withdrawals.create(owner(), userId, { amount: '400000', bankAccountId: accountId }),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_BALANCE' } });
    expect((await wallet.summaryFor(owner())).available).toBe('300000');
  });

  /**
   * Hai người cùng bấm rút trên một ví (chủ gian hàng và nhân viên, hoặc hai tab). Điều kiện nằm
   * trong chính câu `UPDATE` nên database phân xử — đọc-rồi-ghi sẽ cho cả hai cùng qua.
   */
  maybe('hai lệnh rút SONG SONG: đúng MỘT cái thắng, số dư không âm', async () => {
    const results = await Promise.allSettled([
      withdrawals.create(owner(), userId, { amount: '300000', bankAccountId: accountId }),
      withdrawals.create(owner(), userId, { amount: '300000', bankAccountId: accountId }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const s = await wallet.summaryFor(owner());
    expect(s.available).toBe('0');
    expect(s.total).toBe('500000');
  });
});

describe('Huỷ yêu cầu rút', () => {
  maybe('chủ ví tự huỷ: tiền về lại khả dụng, KHÔNG sinh bút toán (tiền chưa rời ví)', async () => {
    const walletId = (await wallet.findWalletId(owner()))!;
    const before = await prisma.walletEntry.count({ where: { walletId } });
    const pendingOne = await prisma.withdrawalRequest.findFirstOrThrow({
      where: { walletId, status: WITHDRAWAL_STATUS.PENDING, amount: dec(300_000) },
    });

    await withdrawals.cancel(owner(), pendingOne.id, userId);

    const s = await wallet.summaryFor(owner());
    expect(s.available).toBe('300000');
    expect(s.total).toBe('500000');
    expect(await prisma.walletEntry.count({ where: { walletId } })).toBe(before);
  });

  maybe('huỷ LẦN HAI bị chặn — không có đường nhả khoá nhiều lần cho một lệnh', async () => {
    const walletId = (await wallet.findWalletId(owner()))!;
    const cancelled = await prisma.withdrawalRequest.findFirstOrThrow({
      where: { walletId, status: WITHDRAWAL_STATUS.CANCELLED },
    });
    await expect(withdrawals.cancel(owner(), cancelled.id, userId)).rejects.toMatchObject({
      response: { code: 'WITHDRAWAL_ALREADY_HANDLED' },
    });
    expect((await wallet.summaryFor(owner())).available).toBe('300000');
  });

  maybe('lệnh của người khác: không huỷ được dù biết id', async () => {
    const walletId = (await wallet.findWalletId(owner()))!;
    const mine = await prisma.withdrawalRequest.findFirstOrThrow({ where: { walletId } });
    const strangerId = newId();
    await prisma.user.create({
      data: { id: strangerId, displayName: 'Người lạ 2', status: 'active' },
    });

    await expect(
      withdrawals.cancel({ type: WALLET_OWNER_TYPE.USER, userId: strangerId }, mine.id, strangerId),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });

    await prisma.user.delete({ where: { id: strangerId } });
  });
});

/** Tạo → duyệt → đã chuyển, qua đúng các service của chủ ví và của admin. Trả bản ghi sau khi chi. */
async function paidWithdrawal(amount: number, bankReference: string) {
  const created = await withdrawals.create(owner(), userId, {
    amount: String(amount),
    bankAccountId: accountId,
  });
  await platform.approve(created.id, userId);
  const approved = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: created.id } });
  await platform.markPaid(created.id, userId, { bankReference, rowVersion: approved.rowVersion });
  return prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: created.id } });
}

/** Mọi bút toán của MỘT lệnh rút — dòng chi trỏ vào lệnh, dòng đảo trỏ vào dòng chi. */
async function entriesOf(withdrawalId: string) {
  const paid = await prisma.walletEntry.findMany({ where: { sourceRefId: withdrawalId } });
  const reversals = await prisma.walletEntry.findMany({
    where: { reversalOfEntryId: { in: paid.map((e) => e.id) } },
  });
  return [...paid, ...reversals];
}

describe('Đảo lệnh đã chuyển — chuyển hụt / sai tài khoản (ADR 0025 điều 7)', () => {
  maybe(
    'đảo: lệnh thành `reversed`, tiền về khả dụng, HAI bút toán đều còn, chủ ví được báo',
    async () => {
      const before = await wallet.summaryFor(owner());
      const paid = await paidWithdrawal(50_000, 'FT-PAID-1');
      expect((await wallet.summaryFor(owner())).total).toBe(String(Number(before.total) - 50_000));
      notifications.emitToUser.mockClear();

      await platform.reverse(paid.id, userId, {
        reason: 'Sai số tài khoản',
        rowVersion: paid.rowVersion,
      });

      const reversed = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: paid.id } });
      expect(reversed.status).toBe(WITHDRAWAL_STATUS.REVERSED);
      expect(reversed.reverseReason).toBe('Sai số tài khoản');
      expect(reversed.reversedAt).not.toBeNull();
      // Bằng chứng lần chi KHÔNG bị xoá — cả hai sự kiện đều là chuyện đã xảy ra.
      expect(reversed.bankReference).toBe('FT-PAID-1');
      expect(reversed.paidAt).not.toBeNull();

      const after = await wallet.summaryFor(owner());
      expect(after.available).toBe(before.available);
      expect(after.total).toBe(before.total);

      const kinds = (await entriesOf(paid.id)).map((e) => e.kind).sort();
      expect(kinds).toEqual(
        [WALLET_ENTRY_KIND.WITHDRAWAL, WALLET_ENTRY_KIND.WITHDRAWAL_REVERSAL].sort(),
      );

      // "Báo người dùng nhập lại" — đúng một thông báo, tới đúng chủ ví.
      expect(notifications.emitToUser).toHaveBeenCalledTimes(1);
      expect(notifications.emitToUser.mock.calls[0]![0]).toBe(userId);
    },
  );

  maybe('bấm đảo LẦN HAI: 409 WITHDRAWAL_ALREADY_HANDLED, không có bút toán thứ ba', async () => {
    const paid = await paidWithdrawal(30_000, 'FT-PAID-2');
    await platform.reverse(paid.id, userId, {
      reason: 'Ngân hàng trả về',
      rowVersion: paid.rowVersion,
    });
    const totalAfterFirst = (await wallet.summaryFor(owner())).total;

    // Bản ghi cũ trên màn hình (rowVersion cũ) lẫn bản mới đều bị chặn — lệnh không còn `paid`.
    const fresh = await prisma.withdrawalRequest.findUniqueOrThrow({ where: { id: paid.id } });
    for (const rowVersion of [paid.rowVersion, fresh.rowVersion]) {
      await expect(
        platform.reverse(paid.id, userId, { reason: 'Bấm lại', rowVersion }),
      ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.WITHDRAWAL_ALREADY_HANDLED } });
    }

    expect(await entriesOf(paid.id)).toHaveLength(2);
    expect((await wallet.summaryFor(owner())).total).toBe(totalAfterFirst);
  });

  maybe('hai admin đảo SONG SONG cùng một lệnh: đúng MỘT lần tiền về ví', async () => {
    const before = await wallet.summaryFor(owner());
    const paid = await paidWithdrawal(40_000, 'FT-PAID-3');

    const results = await Promise.allSettled([
      platform.reverse(paid.id, userId, { reason: 'Admin A: trả về', rowVersion: paid.rowVersion }),
      platform.reverse(paid.id, userId, { reason: 'Admin B: trả về', rowVersion: paid.rowVersion }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const lost = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(lost?.reason).toMatchObject({
      response: { code: API_ERROR_CODE.WITHDRAWAL_ALREADY_HANDLED },
    });
    // Một dòng chi + ĐÚNG một dòng đảo; số dư trở về đúng như trước khi rút.
    expect(await entriesOf(paid.id)).toHaveLength(2);
    const after = await wallet.summaryFor(owner());
    expect(after.available).toBe(before.available);
    expect(after.total).toBe(before.total);
  });

  maybe('lệnh CHƯA chi thì không có gì để đảo', async () => {
    const created = await withdrawals.create(owner(), userId, {
      amount: '20000',
      bankAccountId: accountId,
    });
    await platform.approve(created.id, userId);
    const approved = await prisma.withdrawalRequest.findUniqueOrThrow({
      where: { id: created.id },
    });

    await expect(
      platform.reverse(created.id, userId, { reason: 'Thử đảo', rowVersion: approved.rowVersion }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.WITHDRAWAL_ALREADY_HANDLED } });
    expect(await entriesOf(created.id)).toHaveLength(0);

    // Trả lại khoá để các ca sau đọc đúng số dư.
    await platform.reject(created.id, userId, { reason: 'Dọn ca thử' });
  });
});

describe('Đối chiếu — sổ phải giải thích được số dư ở mọi chặng', () => {
  maybe('Σ bút toán = khả dụng + đang treo', async () => {
    const walletId = (await wallet.findWalletId(owner()))!;
    const entries = await prisma.walletEntry.findMany({
      where: { walletId },
      select: { amount: true },
    });
    const sum = entries.reduce((t, e) => t.add(e.amount), new Prisma.Decimal(0));
    expect(sum.toFixed(0)).toBe((await wallet.summaryFor(owner())).total);
  });
});
