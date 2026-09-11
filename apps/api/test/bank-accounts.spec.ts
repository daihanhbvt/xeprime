import { createPrismaClient, newId } from '@xeprime/prisma';
import { BANK_ACCOUNT_STATUS, WALLET_OWNER_TYPE } from '@xeprime/types';
import { BankAccountsService } from '../src/modules/bank-accounts/bank-accounts.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Sổ tài khoản ngân hàng NHẬN TIỀN — ADR 0033 (Phase 3).
 *
 * Ba điều được khẳng định ở đây đều là chống lỗi TIỀN, không phải dọn dẹp hình thức: một tài
 * khoản thuộc đúng một chủ, không trùng số trong danh sách đang dùng, và luôn có đúng một tài
 * khoản mặc định. Cái thứ ba là thứ trả lời câu "chuyển vào đâu" khi admin bấm chi.
 *
 * Mọi bảo đảm nằm ở RÀNG BUỘC DATABASE (partial unique, CHECK owner XOR); spec này kiểm rằng
 * service đi qua chúng đúng cách, không phải kiểm rằng service tự nhớ luật.
 */
const prisma = createPrismaClient() as unknown as PrismaService;
const accounts = new BankAccountsService(prisma);

let dbAvailable = false;
let userId: string;
let otherUserId: string;

const ACCOUNT = { bankCode: 'vcb', accountNumber: '0011 0012 34567', accountName: 'Nguyen Van A' };

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
  otherUserId = newId();
  await prisma.user.createMany({
    data: [
      { id: userId, displayName: 'Khách A', status: 'active' },
      { id: otherUserId, displayName: 'Khách B', status: 'active' },
    ],
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.bankAccount.deleteMany({ where: { ownerUserId: { in: [userId, otherUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const owner = () => ({ type: WALLET_OWNER_TYPE.USER, userId }) as const;

describe('Thêm tài khoản nhận tiền', () => {
  maybe('tài khoản ĐẦU TIÊN tự thành mặc định — không bắt bấm thêm một nút cho cái duy nhất', async () => {
    const created = await accounts.create(owner(), ACCOUNT);
    expect(created.isDefault).toBe(true);
    expect(created.status).toBe(BANK_ACCOUNT_STATUS.ACTIVE);
  });

  maybe('số tài khoản được CHUẨN HOÁ: bỏ khoảng trắng dán từ app ngân hàng', async () => {
    const row = await prisma.bankAccount.findFirstOrThrow({ where: { ownerUserId: userId } });
    expect(row.accountNumber).toBe('001100123 4567'.replace(/\s+/g, ''));
    expect(row.bankCode).toBe('VCB');
  });

  maybe('số tài khoản KHÔNG hiện đầy đủ ra màn hình — chỉ đủ để nhận ra của mình', async () => {
    const [row] = await accounts.list(owner());
    expect(row!.accountNumberMasked).not.toContain('0011');
    expect(row!.accountNumberMasked.endsWith('4567')).toBe(true);
  });

  maybe('trùng số tài khoản trong danh sách đang dùng ⇒ 409, không đẻ dòng thứ hai', async () => {
    await expect(accounts.create(owner(), ACCOUNT)).rejects.toMatchObject({
      response: { code: 'BANK_ACCOUNT_DUPLICATE' },
    });
    const count = await prisma.bankAccount.count({
      where: { ownerUserId: userId, status: BANK_ACCOUNT_STATUS.ACTIVE },
    });
    expect(count).toBe(1);
  });
});

describe('Tài khoản mặc định — đúng MỘT, luôn có một', () => {
  maybe('thêm cái thứ hai và đặt mặc định ⇒ cái cũ tự thôi mặc định', async () => {
    const second = await accounts.create(owner(), {
      bankCode: 'ACB',
      accountNumber: '9999888877',
      accountName: 'Nguyen Van A',
      isDefault: true,
    });
    expect(second.isDefault).toBe(true);

    const defaults = await prisma.bankAccount.count({
      where: { ownerUserId: userId, isDefault: true, status: BANK_ACCOUNT_STATUS.ACTIVE },
    });
    expect(defaults).toBe(1);
  });

  /**
   * Bỏ tài khoản mặc định mà không ai lên thay sẽ để danh sách ở trạng thái "có tài khoản nhưng
   * không biết chuyển vào đâu" — và lệnh chi kế tiếp không có đích.
   */
  maybe('bỏ tài khoản mặc định ⇒ tài khoản còn lại lên thay, danh sách không bao giờ mất mặc định', async () => {
    const list = await accounts.list(owner());
    const current = list.find((a) => a.isDefault)!;
    await accounts.archive(owner(), current.id);

    const after = await accounts.list(owner());
    expect(after).toHaveLength(1);
    expect(after[0]!.isDefault).toBe(true);
  });

  maybe('bỏ dùng là LƯU TRỮ chứ không xoá — lệnh chuyển cũ còn trỏ về nó', async () => {
    const archived = await prisma.bankAccount.count({
      where: { ownerUserId: userId, status: BANK_ACCOUNT_STATUS.ARCHIVED },
    });
    expect(archived).toBe(1);
  });
});

describe('Phạm vi — tài khoản của ai người nấy thấy', () => {
  maybe('người khác KHÔNG đọc được danh sách của mình', async () => {
    const theirs = await accounts.list({ type: WALLET_OWNER_TYPE.USER, userId: otherUserId });
    expect(theirs).toEqual([]);
  });

  /**
   * Đây là bề mặt thật: biết id của một tài khoản không cho quyền đụng vào nó. Điều kiện chủ sở
   * hữu nằm trong CHÍNH câu truy vấn, không phải một phép kiểm trước đó.
   */
  maybe('biết id cũng KHÔNG đặt mặc định hay bỏ được tài khoản của người khác', async () => {
    const [mine] = await accounts.list(owner());
    const stranger = { type: WALLET_OWNER_TYPE.USER, userId: otherUserId } as const;

    await expect(accounts.setDefault(stranger, mine!.id)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
    await expect(accounts.archive(stranger, mine!.id)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });

    const still = await accounts.list(owner());
    expect(still).toHaveLength(1);
  });
});

describe('Đọc tài khoản để ghi lệnh chi', () => {
  maybe('trả SỐ ĐẦY ĐỦ — caller là đường ghi tiền, không phải màn hình', async () => {
    // Tài khoản còn lại sau khi cái mặc định (ACB) bị lưu trữ ở khối trên.
    const resolved = await accounts.resolveForPayout(owner());
    expect(resolved!.accountNumber).toBe('0011001234567');
    expect(resolved!.bankCode).toBe('VCB');
  });

  maybe('tài khoản đã lưu trữ KHÔNG còn được chọn làm đích chi', async () => {
    const archivedRow = await prisma.bankAccount.findFirstOrThrow({
      where: { ownerUserId: userId, status: BANK_ACCOUNT_STATUS.ARCHIVED },
    });
    const resolved = await accounts.resolveForPayout(owner(), archivedRow.id);
    expect(resolved).toBeNull();
  });
});
