import { createPrismaClient, newId } from '@xeprime/prisma';
import { ACCOUNT_REALM, BANK_ACCOUNT_STATUS, WALLET_OWNER_TYPE } from '@xeprime/types';
import { BankAccountsService } from '../src/modules/bank-accounts/bank-accounts.service';
import { BankAccountChangeRequestsService } from '../src/modules/bank-accounts/bank-account-change-requests.service';
import { AuditService } from '../src/modules/audit/audit.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tài khoản ngân hàng NHẬN TIỀN — ADR 0033; MỖI CHỦ MỘT tài khoản từ 07/10/2026.
 *
 * Các điều được khẳng định ở đây đều là chống lỗi TIỀN, không phải dọn dẹp hình thức: một tài
 * khoản thuộc đúng một chủ, mỗi chủ đúng một tài khoản đang dùng, và đổi tài khoản không bao giờ
 * để lại khoảnh khắc "có hai" hay "không có". Đó là thứ trả lời câu "chuyển vào đâu" khi admin bấm chi.
 *
 * Mọi bảo đảm nằm ở RÀNG BUỘC DATABASE (partial unique, CHECK); spec này kiểm rằng service đi qua
 * chúng đúng cách, và rằng chính database từ chối ca sai khi có ai ghi vòng qua service.
 */
const prisma = createPrismaClient() as unknown as PrismaService;
const accounts = new BankAccountsService(prisma);
const changeRequests = new BankAccountChangeRequestsService(prisma, accounts, new AuditService(prisma));

let dbAvailable = false;
let userId: string;
let otherUserId: string;

const ACCOUNT = { bankCode: 'vcb', accountNumber: '0011 0012 34567', accountName: 'Nguyen Van A' };
const OTHER = { bankCode: 'ACB', accountNumber: '9999888877', accountName: 'Nguyen Van A' };

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
      { realm: ACCOUNT_REALM.CUSTOMER, id: userId, displayName: 'Khách A', status: 'active' },
      { realm: ACCOUNT_REALM.CUSTOMER, id: otherUserId, displayName: 'Khách B', status: 'active' },
    ],
  });
});

afterAll(async () => {
  if (dbAvailable) {
    const ids = await prisma.bankAccount.findMany({
      where: { ownerUserId: { in: [userId, otherUserId] } },
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({
      where: { targetType: 'bank_account', targetId: { in: ids.map((r) => r.id) } },
    });
    await prisma.bankAccountChangeRequest.deleteMany({
      where: { requestedBy: { in: [userId, otherUserId] } },
    });
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

/**
 * THAY tài khoản theo ĐƯỜNG DUYỆT yêu cầu đổi (biên bản họp 19/11/2026): chủ ví không tự đổi được nữa,
 * chỉ lượt admin duyệt sau khi gọi xác minh mới gọi `createWithinTx` với `allowReplace`. Các luật
 * "đúng MỘT tài khoản, cái cũ LƯU TRỮ" vẫn phải đúng trên đường đó.
 */
const replace = (
  dto: { bankCode: string; accountNumber: string; accountName: string; isDefault?: boolean },
  actor: string | null = null,
) =>
  prisma.$transaction((tx) =>
    accounts.createWithinTx(tx, owner(), dto, actor, { allowReplace: true }),
  );

const activeCount = () =>
  prisma.bankAccount.count({ where: { ownerUserId: userId, status: BANK_ACCOUNT_STATUS.ACTIVE } });

describe('Thêm tài khoản nhận tiền', () => {
  maybe('tài khoản đầu tiên là tài khoản nhận tiền — đang dùng, mặc định', async () => {
    const created = await accounts.create(owner(), ACCOUNT);
    expect(created.isDefault).toBe(true);
    expect(created.status).toBe(BANK_ACCOUNT_STATUS.ACTIVE);
  });

  maybe('số tài khoản được CHUẨN HOÁ: bỏ khoảng trắng dán từ app ngân hàng', async () => {
    const row = await prisma.bankAccount.findFirstOrThrow({ where: { ownerUserId: userId } });
    expect(row.accountNumber).toBe('0011001234567');
    expect(row.bankCode).toBe('VCB');
  });

  maybe('số tài khoản KHÔNG hiện đầy đủ ra màn hình — chỉ đủ để nhận ra của mình', async () => {
    const [row] = await accounts.list(owner());
    expect(row!.accountNumberMasked).not.toContain('0011');
    expect(row!.accountNumberMasked.endsWith('4567')).toBe(true);
  });

  /**
   * Khách khai lại đúng cái đang có (luồng hoàn tiền làm thế) không phải lỗi của họ — và đẻ một
   * dòng mới sẽ xoá dấu "đã đối chiếu" của một tài khoản chẳng hề đổi.
   */
  maybe('khai lại ĐÚNG tài khoản đang dùng ⇒ không đẻ dòng mới, giữ dấu đối chiếu', async () => {
    const [current] = await accounts.list(owner());
    const verifiedAt = new Date('2026-10-01T00:00:00Z');
    await prisma.bankAccount.update({ where: { id: current!.id }, data: { verifiedAt } });

    const again = await accounts.create(owner(), { ...ACCOUNT, label: 'Lương' });

    expect(again.id).toBe(current!.id);
    expect(again.label).toBe('Lương');
    expect(again.verifiedAt).toBe(verifiedAt.toISOString());
    expect(await prisma.bankAccount.count({ where: { ownerUserId: userId } })).toBe(1);
  });
});

describe('Đổi tài khoản nhận tiền — đúng MỘT, luôn có một', () => {
  /** Biên bản họp 19/11/2026: tài khoản KHOÁ từ lần khai đầu — chủ ví không tự đổi được. */
  maybe('chủ ví tự khai tài khoản khác ⇒ BANK_ACCOUNT_LOCKED, tài khoản giữ nguyên', async () => {
    const [before] = await accounts.list(owner());
    await expect(accounts.create(owner(), OTHER)).rejects.toMatchObject({
      response: { code: 'BANK_ACCOUNT_LOCKED' },
    });
    expect((await accounts.list(owner())).map((a) => a.id)).toEqual([before!.id]);
  });

  maybe('đường duyệt: tài khoản khác THAY cái cũ; cái cũ LƯU TRỮ chứ không xoá', async () => {
    const [before] = await accounts.list(owner());
    const replaced = await replace(OTHER);

    const after = await accounts.list(owner());
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(replaced.id);
    expect(after[0]!.isDefault).toBe(true);

    const old = await prisma.bankAccount.findUniqueOrThrow({ where: { id: before!.id } });
    expect(old.status).toBe(BANK_ACCOUNT_STATUS.ARCHIVED);
    expect(old.isDefault).toBe(false);
  });

  /**
   * Bản app native cũ: "thêm tài khoản" với công tắc mặc định TẮT — người dùng thêm tài khoản PHỤ,
   * không đồng ý đổi chỗ tiền về. Lặng lẽ thay là chuyển tiền tới nơi họ không chọn.
   */
  maybe('`isDefault: false` khi đã có tài khoản ⇒ 409, tài khoản đang dùng giữ nguyên', async () => {
    const [before] = await accounts.list(owner());
    await expect(
      replace({ ...ACCOUNT, accountNumber: '5555666677', isDefault: false }),
    ).rejects.toMatchObject({ response: { code: 'BANK_ACCOUNT_REPLACE_NOT_CONFIRMED' } });

    expect((await accounts.list(owner())).map((a) => a.id)).toEqual([before!.id]);
  });

  /** Đổi chỗ tiền về là việc đầu tiên kẻ chiếm tài khoản làm — phải trả lời được ai, khi nào. */
  maybe('đổi tài khoản ghi audit: ai đổi, từ đâu sang đâu — số tài khoản CHE', async () => {
    const [before] = await accounts.list(owner());
    const replaced = await replace(
      { bankCode: 'VPB', accountNumber: '1234500099', accountName: 'Nguyen Van A' },
      userId,
    );

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { targetType: 'bank_account', targetId: replaced.id },
    });
    expect(log.action).toBe('bank_account.replaced');
    expect(log.actorUserId).toBe(userId);
    expect(JSON.stringify(log.beforeJson)).toContain(before!.accountNumberMasked);
    expect(JSON.stringify(log.afterJson)).not.toContain('1234500099');
  });

  /** Ngân hàng đối chiếu TÊN — sửa tên thụ hưởng là một đích mới, dấu đối chiếu cũ hết giá trị. */
  maybe('cùng số nhưng đổi tên thụ hưởng ⇒ một tài khoản mới', async () => {
    const [before] = await accounts.list(owner());
    const renamed = await replace({ ...OTHER, accountName: 'NGUYEN VAN A' });

    expect(renamed.id).not.toBe(before!.id);
    expect(await activeCount()).toBe(1);
  });

  /**
   * Hai tab cùng bấm "Đổi tài khoản": lượt sau phải CHỜ rồi thay cái lượt trước vừa tạo — không
   * được nổ, và tuyệt đối không được để lại hai tài khoản đang dùng.
   */
  maybe('hai lượt đổi SONG SONG ⇒ cả hai thành công, còn đúng một tài khoản', async () => {
    const results = await Promise.allSettled([
      replace({ bankCode: 'TCB', accountNumber: '1903000111', accountName: 'A' }),
      replace({ bankCode: 'MB', accountNumber: '0909000222', accountName: 'A' }),
    ]);

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await activeCount()).toBe(1);
  });

  /** Bảo đảm nằm ở DATABASE: một đường ghi vòng qua service cũng không tạo được dòng thứ hai. */
  maybe('database từ chối dòng `active` thứ hai của cùng một chủ', async () => {
    await expect(
      prisma.bankAccount.create({
        data: {
          id: newId(),
          ownerType: WALLET_OWNER_TYPE.USER,
          ownerUserId: userId,
          bankCode: 'BIDV',
          accountNumber: '31010001234',
          accountName: 'A',
          isDefault: true,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  maybe('database từ chối tài khoản đang dùng mà không phải mặc định', async () => {
    const [current] = await accounts.list(owner());
    await expect(
      prisma.bankAccount.update({ where: { id: current!.id }, data: { isDefault: false } }),
    ).rejects.toThrow();
  });

  maybe('`setDefault` (app native cũ) chỉ trả lại tài khoản đang dùng, không đổi gì', async () => {
    const [current] = await accounts.list(owner());
    const same = await accounts.setDefault(owner(), current!.id);
    expect(same).toEqual(current);
  });
});

describe('Phạm vi — tài khoản của ai người nấy thấy', () => {
  maybe('người khác KHÔNG đọc được tài khoản của mình', async () => {
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

    expect(await accounts.list(owner())).toHaveLength(1);
  });

  maybe('người khác khai tài khoản của họ không chạm tài khoản của mình', async () => {
    const [mine] = await accounts.list(owner());
    await accounts.create({ type: WALLET_OWNER_TYPE.USER, userId: otherUserId }, OTHER);

    const after = await accounts.list(owner());
    expect(after.map((a) => a.id)).toEqual([mine!.id]);
  });
});

describe('Đọc tài khoản để ghi lệnh chi', () => {
  maybe('trả SỐ ĐẦY ĐỦ của tài khoản đang dùng — caller là đường ghi tiền', async () => {
    const [current] = await accounts.list(owner());
    const resolved = await accounts.resolveForPayout(owner());
    expect(resolved!.id).toBe(current!.id);
    expect(resolved!.accountNumber).not.toContain('•');
  });

  /** Người dùng vừa đổi tài khoản ở tab khác: lệnh rút mang id cũ KHÔNG được chảy về đích cũ. */
  maybe('tài khoản đã lưu trữ KHÔNG còn được chọn làm đích chi', async () => {
    const archivedRow = await prisma.bankAccount.findFirstOrThrow({
      where: { ownerUserId: userId, status: BANK_ACCOUNT_STATUS.ARCHIVED },
    });
    expect(await accounts.resolveForPayout(owner(), archivedRow.id)).toBeNull();
  });
});

describe('Bỏ dùng — đã KHOÁ (biên bản họp 19/11/2026)', () => {
  maybe('chủ ví tự bỏ dùng ⇒ BANK_ACCOUNT_LOCKED, tài khoản vẫn nhận tiền', async () => {
    const [current] = await accounts.list(owner());
    await expect(accounts.archive(owner(), current!.id)).rejects.toMatchObject({
      response: { code: 'BANK_ACCOUNT_LOCKED' },
    });
    expect((await accounts.list(owner())).map((a) => a.id)).toEqual([current!.id]);
    expect(await activeCount()).toBe(1);
  });
});

/**
 * Yêu cầu ĐỔI tài khoản (biên bản họp 19/11/2026): gửi ⇒ chưa đổi gì; admin gọi xác minh rồi duyệt ⇒
 * tài khoản mới thay cái cũ; từ chối ⇒ giữ nguyên. Mỗi chủ một yêu cầu đang chờ.
 */
describe('Yêu cầu đổi tài khoản', () => {
  const NEW = { bankCode: 'tcb', accountNumber: '1903 7777 888', accountName: 'Nguyen Van A' };

  maybe('gửi yêu cầu ⇒ chưa đổi gì; yêu cầu thứ hai khi đang chờ ⇒ 409', async () => {
    const [before] = await accounts.list(owner());
    const request = await changeRequests.create(owner(), userId, { ...NEW, note: 'Đổi ngân hàng' });
    expect(request.status).toBe('pending');
    expect(request.accountNumberMasked).not.toContain('19037777888');
    expect((await accounts.list(owner())).map((a) => a.id)).toEqual([before!.id]);
    expect((await changeRequests.current(owner()))?.id).toBe(request.id);

    await expect(changeRequests.create(owner(), userId, NEW)).rejects.toMatchObject({
      response: { code: 'BANK_ACCOUNT_CHANGE_PENDING' },
    });
  });

  maybe('admin từ chối ⇒ tài khoản giữ nguyên, không còn yêu cầu chờ', async () => {
    const [before] = await accounts.list(owner());
    const pending = await changeRequests.current(owner());
    await changeRequests.reject(pending!.id, otherUserId, 'Gọi không phải chính chủ');
    expect(await changeRequests.current(owner())).toBeNull();
    expect((await accounts.list(owner())).map((a) => a.id)).toEqual([before!.id]);
  });

  maybe('admin duyệt sau khi gọi xác minh ⇒ tài khoản mới thay cái cũ; duyệt lại ⇒ 409', async () => {
    const request = await changeRequests.create(owner(), userId, NEW);
    const queue = await changeRequests.listPending();
    const row = queue.find((r) => r.id === request.id)!;
    // Màn duyệt đọc số MỚI đầy đủ cho chủ ví xác nhận qua điện thoại.
    expect(row.accountNumber).toBe('19037777888');

    await changeRequests.approve(request.id, otherUserId, 'Đã gọi số đăng ký, khớp CCCD');
    const [after] = await accounts.list(owner());
    expect(after!.bankCode).toBe('TCB');
    expect(await activeCount()).toBe(1);
    await expect(changeRequests.approve(request.id, otherUserId, null)).rejects.toMatchObject({
      response: { code: 'CONFLICT' },
    });
  });

  maybe('đổi sang đúng tài khoản đang dùng ⇒ 409 không có gì để đổi', async () => {
    await expect(changeRequests.create(owner(), userId, NEW)).rejects.toMatchObject({
      response: { code: 'BANK_ACCOUNT_CHANGE_UNCHANGED' },
    });
  });
});
