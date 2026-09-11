import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import { WALLET_ENTRY_KIND, WALLET_ENTRY_SOURCE, WALLET_OWNER_TYPE } from '@xeprime/types';
import { WalletService } from '../src/modules/wallet/wallet.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Sổ công nợ phải trả — ADR 0033, giữ nguyên tắc append-only của ADR 0023 điều 4–6.
 *
 * Mọi khẳng định ở đây đều về TIỀN THẬT của người dùng, nên chúng kiểm cả nhánh đúng lẫn nhánh
 * chạy-lại: worker khởi động lại, webhook gửi lại, admin bấm hai lần — ba tình huống bình
 * thường, và cả ba phải ra cùng một số dư.
 */
const prisma = createPrismaClient() as unknown as PrismaService;
const wallet = new WalletService(prisma);

let dbAvailable = false;
let userId: string;
let holdId: string;

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
  holdId = newId();
  await prisma.user.create({ data: { id: userId, displayName: 'Khách ví', status: 'active' } });
});

afterAll(async () => {
  if (dbAvailable) {
    const w = await prisma.wallet.findFirst({ where: { ownerUserId: userId } });
    if (w) {
      await prisma.walletEntry.deleteMany({ where: { walletId: w.id } });
      await prisma.wallet.delete({ where: { id: w.id } });
    }
    await prisma.user.delete({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Ghi có — idempotent theo nguồn', () => {
  maybe('ghi có lần đầu: số dư tăng và sổ có đúng một dòng', async () => {
    const result = await prisma.$transaction((tx) =>
      wallet.creditWithinTx(tx, {
        owner: owner(),
        kind: WALLET_ENTRY_KIND.HOLD_REFUND,
        sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
        sourceRefId: holdId,
        amount: dec(210_000),
        holdId,
      }),
    );
    expect(result).not.toBeNull();
    const summary = await wallet.summaryFor(owner());
    expect(summary.available).toBe('210000');
    expect(summary.total).toBe('210000');
  });

  /**
   * Đây là ca quan trọng nhất của cả file: worker chạy lại hoặc webhook gửi lại KHÔNG được cộng
   * tiền lần hai. Bảo đảm nằm ở unique trong database, không ở một phép kiểm trước đó.
   */
  maybe('ghi có LẠI cùng nguồn: no-op, số dư KHÔNG cộng hai lần', async () => {
    const again = await prisma.$transaction((tx) =>
      wallet.creditWithinTx(tx, {
        owner: owner(),
        kind: WALLET_ENTRY_KIND.HOLD_REFUND,
        sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
        sourceRefId: holdId,
        amount: dec(210_000),
        holdId,
      }),
    );
    expect(again).toBeNull();
    expect((await wallet.summaryFor(owner())).available).toBe('210000');
  });

  /**
   * Cùng một hold sinh hai dòng HỢP LỆ khác loại — hoàn theo kết cục, và hoàn phần chuyển thừa.
   * Khoá ba cột của ADR 0023 điều 5 sẽ chặn nhầm dòng thứ hai; ADR 0033 điều 6 thêm `kind` đúng
   * vì ca này.
   */
  maybe('cùng hold nhưng KHÁC loại (chuyển thừa) vẫn ghi được — khoá có `kind` là vì ca này', async () => {
    const overpay = await prisma.$transaction((tx) =>
      wallet.creditWithinTx(tx, {
        owner: owner(),
        kind: WALLET_ENTRY_KIND.HOLD_OVERPAY,
        sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
        sourceRefId: holdId,
        amount: dec(30_000),
        holdId,
      }),
    );
    expect(overpay).not.toBeNull();
    expect((await wallet.summaryFor(owner())).available).toBe('240000');
  });

  maybe('ghi có số 0 hoặc âm bị từ chối — một bút toán không nói gì chỉ làm sổ dài thêm', async () => {
    await expect(
      prisma.$transaction((tx) =>
        wallet.creditWithinTx(tx, {
          owner: owner(),
          kind: WALLET_ENTRY_KIND.ADJUSTMENT,
          sourceType: WALLET_ENTRY_SOURCE.MANUAL,
          sourceRefId: newId(),
          amount: dec(0),
        }),
      ),
    ).rejects.toThrow();
  });
});

describe('Rút tiền — khoá tiền bằng MỘT câu lệnh có điều kiện', () => {
  maybe('khoá thành công: chuyển từ khả dụng sang đang treo, TỔNG không đổi', async () => {
    const walletId = (await wallet.findWalletId(owner()))!;
    const ok = await prisma.$transaction((tx) =>
      wallet.holdForWithdrawalWithinTx(tx, walletId, dec(100_000)),
    );
    expect(ok).toBe(true);

    const summary = await wallet.summaryFor(owner());
    expect(summary.available).toBe('140000');
    expect(summary.pending).toBe('100000');
    // Nghĩa vụ của nền tảng không đổi khi tiền mới chỉ bị treo.
    expect(summary.total).toBe('240000');
  });

  maybe('rút VƯỢT số dư khả dụng bị từ chối — phần đang treo không dùng lại được', async () => {
    const walletId = (await wallet.findWalletId(owner()))!;
    const ok = await prisma.$transaction((tx) =>
      wallet.holdForWithdrawalWithinTx(tx, walletId, dec(200_000)),
    );
    expect(ok).toBe(false);
    expect((await wallet.summaryFor(owner())).available).toBe('140000');
  });

  /**
   * Hai người bấm rút cùng lúc trên cùng một ví. Đọc-rồi-ghi sẽ cho cả hai cùng qua; điều kiện
   * nằm trong chính câu `UPDATE` thì database phân xử.
   */
  maybe('hai lệnh rút SONG SONG cùng số tiền: đúng MỘT cái thắng', async () => {
    const walletId = (await wallet.findWalletId(owner()))!;
    const [a, b] = await Promise.all([
      prisma.$transaction((tx) => wallet.holdForWithdrawalWithinTx(tx, walletId, dec(140_000))),
      prisma.$transaction((tx) => wallet.holdForWithdrawalWithinTx(tx, walletId, dec(140_000))),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect((await wallet.summaryFor(owner())).available).toBe('0');
  });

  maybe('từ chối lệnh rút: tiền về lại khả dụng, KHÔNG sinh bút toán (tiền chưa rời ví)', async () => {
    const walletId = (await wallet.findWalletId(owner()))!;
    const before = await prisma.walletEntry.count({ where: { walletId } });

    await prisma.$transaction((tx) =>
      wallet.releaseWithdrawalHoldWithinTx(tx, walletId, dec(140_000)),
    );

    const summary = await wallet.summaryFor(owner());
    expect(summary.available).toBe('140000');
    expect(summary.pending).toBe('100000');
    expect(await prisma.walletEntry.count({ where: { walletId } })).toBe(before);
  });

  maybe('đã chuyển tiền: sinh bút toán ÂM và xoá khoản treo', async () => {
    const walletId = (await wallet.findWalletId(owner()))!;
    const withdrawalId = newId();
    await prisma.$transaction((tx) =>
      wallet.recordWithdrawalPaidWithinTx(tx, {
        walletId,
        withdrawalId,
        amount: dec(100_000),
        actorUserId: userId,
      }),
    );

    const summary = await wallet.summaryFor(owner());
    expect(summary.available).toBe('140000');
    expect(summary.pending).toBe('0');
    // Tổng nghĩa vụ GIẢM đúng số đã chi — đây là điểm duy nhất nó giảm.
    expect(summary.total).toBe('140000');

    const entry = await prisma.walletEntry.findFirstOrThrow({
      where: { walletId, sourceRefId: withdrawalId },
    });
    expect(entry.amount.toFixed(0)).toBe('-100000');
  });
});

describe('Sửa sai — bằng dòng ĐẢO, không bao giờ sửa dòng cũ', () => {
  maybe('chuyển hụt: đảo bút toán chi ⇒ tiền về ví, cả hai dòng cùng nằm trên sổ', async () => {
    const walletId = (await wallet.findWalletId(owner()))!;
    const paid = await prisma.walletEntry.findFirstOrThrow({
      where: { walletId, kind: WALLET_ENTRY_KIND.WITHDRAWAL },
    });

    await prisma.$transaction((tx) =>
      wallet.reverseWithinTx(tx, paid.id, { reason: 'Sai số tài khoản', actorUserId: userId }),
    );

    expect((await wallet.summaryFor(owner())).available).toBe('240000');

    // Dòng gốc KHÔNG bị sửa — người đọc sổ thấy cả hai sự kiện.
    const stillThere = await prisma.walletEntry.findUniqueOrThrow({ where: { id: paid.id } });
    expect(stillThere.amount.toFixed(0)).toBe('-100000');

    const reversal = await prisma.walletEntry.findFirstOrThrow({
      where: { reversalOfEntryId: paid.id },
    });
    expect(reversal.kind).toBe(WALLET_ENTRY_KIND.WITHDRAWAL_REVERSAL);
    expect(reversal.amount.toFixed(0)).toBe('100000');
  });

  maybe('đảo LẦN HAI cùng một dòng bị chặn — không có đường cộng tiền bằng cách đảo mãi', async () => {
    const walletId = (await wallet.findWalletId(owner()))!;
    const paid = await prisma.walletEntry.findFirstOrThrow({
      where: { walletId, kind: WALLET_ENTRY_KIND.WITHDRAWAL },
    });
    await expect(
      prisma.$transaction((tx) =>
        wallet.reverseWithinTx(tx, paid.id, { reason: 'lặp', actorUserId: userId }),
      ),
    ).rejects.toMatchObject({ response: { code: 'CONFLICT' } });
  });
});

describe('Đối chiếu — sổ phải giải thích được số dư', () => {
  maybe('Σ bút toán = khả dụng + đang treo', async () => {
    const walletId = (await wallet.findWalletId(owner()))!;
    const entries = await prisma.walletEntry.findMany({
      where: { walletId },
      select: { amount: true },
    });
    const sum = entries.reduce((t, e) => t.add(e.amount), new Prisma.Decimal(0));

    const summary = await wallet.summaryFor(owner());
    expect(sum.toFixed(0)).toBe(summary.total);
  });
});
