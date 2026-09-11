import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BANK_ACCOUNT_STATUS,
  WALLET_OWNER_TYPE,
  maskAccountNumber,
  type BankAccountStatus,
  type WalletOwnerType,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import type { BankAccountDto, SaveBankAccountDto } from './dto/bank-account.dto';

/** Chủ của một tài khoản — đúng một trong hai, khớp CHECK owner XOR ở DB. */
export type BankAccountOwner =
  | { type: typeof WALLET_OWNER_TYPE.USER; userId: string }
  | { type: typeof WALLET_OWNER_TYPE.TENANT; tenantId: string };

const SELECT = {
  id: true,
  ownerType: true,
  bankCode: true,
  accountNumber: true,
  accountName: true,
  label: true,
  isDefault: true,
  status: true,
  verifiedAt: true,
  changedAt: true,
  createdAt: true,
} satisfies Prisma.BankAccountSelect;

type Row = Prisma.BankAccountGetPayload<{ select: typeof SELECT }>;

/**
 * Tài khoản ngân hàng NHẬN TIỀN của khách và của gian hàng — writer duy nhất của
 * `bank_accounts` (ADR 0033).
 *
 * Một service cho cả hai phía, phân biệt bằng `owner` (ADR 0023 điều 7): hai bộ hàm song sinh là
 * hai chỗ để quên sửa, và quy tắc che PII phải giống hệt nhau ở cả hai.
 *
 * Ba điều bảo đảm, tất cả do DATABASE giữ chứ không phải do service nhớ kiểm:
 *   - Một tài khoản thuộc đúng một chủ (CHECK owner XOR).
 *   - Không trùng số tài khoản trong danh sách đang dùng (partial unique).
 *   - Đúng một tài khoản mặc định mỗi chủ (partial unique).
 *
 * Service bắt vi phạm unique và dịch thành lỗi người đọc được, nhưng KHÔNG thay thế ràng buộc:
 * hai request đặt mặc định cùng lúc thì database là thứ quyết định ai thắng.
 */
@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Danh sách đang dùng, mặc định lên đầu. */
  async list(owner: BankAccountOwner): Promise<BankAccountDto[]> {
    const rows = await this.prisma.bankAccount.findMany({
      where: { ...ownerWhere(owner), status: BANK_ACCOUNT_STATUS.ACTIVE },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: SELECT,
    });
    return rows.map(toDto);
  }

  /**
   * Thêm một tài khoản. Tài khoản ĐẦU TIÊN của một chủ tự thành mặc định — bắt người dùng bấm
   * thêm một nút để chọn cái duy nhất họ có là một bước thừa, và một danh sách không có mặc định
   * làm lệnh rút không biết chuyển vào đâu.
   */
  async create(owner: BankAccountOwner, dto: SaveBankAccountDto): Promise<BankAccountDto> {
    const accountNumber = normalizeNumber(dto.accountNumber);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.bankAccount.count({
        where: { ...ownerWhere(owner), status: BANK_ACCOUNT_STATUS.ACTIVE },
      });
      const makeDefault = existing === 0 || dto.isDefault === true;
      if (makeDefault) await clearDefaultWithinTx(tx, owner);

      try {
        const row = await tx.bankAccount.create({
          data: {
            id: newId(),
            ownerType: owner.type,
            ownerUserId: owner.type === WALLET_OWNER_TYPE.USER ? owner.userId : null,
            ownerTenantId: owner.type === WALLET_OWNER_TYPE.TENANT ? owner.tenantId : null,
            bankCode: dto.bankCode.trim().toUpperCase(),
            accountNumber,
            accountName: dto.accountName.trim(),
            label: dto.label?.trim() || null,
            isDefault: makeDefault,
            changedAt: new Date(),
          },
          select: SELECT,
        });
        return toDto(row);
      } catch (err) {
        throw translateUnique(err);
      }
    });
  }

  /**
   * Đặt làm mặc định. Đổi cả hai dòng trong CÙNG transaction: giữa hai câu lệnh có một khoảnh
   * khắc không tài khoản nào là mặc định, và một lệnh rút rơi đúng vào đó sẽ không tìm ra đích.
   */
  async setDefault(owner: BankAccountOwner, id: string): Promise<BankAccountDto> {
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.bankAccount.findFirst({
        where: { id, ...ownerWhere(owner), status: BANK_ACCOUNT_STATUS.ACTIVE },
        select: { id: true },
      });
      if (!target) throw notFound();

      await clearDefaultWithinTx(tx, owner);
      const row = await tx.bankAccount.update({
        where: { id },
        data: { isDefault: true },
        select: SELECT,
      });
      return toDto(row);
    });
  }

  /**
   * Bỏ dùng một tài khoản — LƯU TRỮ, không xoá (ADR 0033): lệnh rút cũ còn trỏ về nó, và xoá là
   * mất khả năng trả lời "khoản đó đã chuyển vào đâu".
   *
   * Bỏ tài khoản mặc định thì tài khoản còn lại gần nhất lên thay, để danh sách không bao giờ ở
   * trạng thái "có tài khoản nhưng không biết chuyển vào đâu".
   */
  async archive(owner: BankAccountOwner, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.bankAccount.findFirst({
        where: { id, ...ownerWhere(owner), status: BANK_ACCOUNT_STATUS.ACTIVE },
        select: { id: true, isDefault: true },
      });
      if (!target) throw notFound();

      await tx.bankAccount.update({
        where: { id },
        data: { status: BANK_ACCOUNT_STATUS.ARCHIVED, isDefault: false },
      });
      if (!target.isDefault) return;

      const next = await tx.bankAccount.findFirst({
        where: { ...ownerWhere(owner), status: BANK_ACCOUNT_STATUS.ACTIVE },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (next) await tx.bankAccount.update({ where: { id: next.id }, data: { isDefault: true } });
    });
  }

  /**
   * Tài khoản nhận tiền đang dùng của một chủ — dùng khi ghi snapshot vào lệnh hoàn/rút.
   *
   * Trả SỐ ĐẦY ĐỦ, không che: caller là đường ghi tiền, không phải màn hình.
   */
  async resolveForPayout(
    owner: BankAccountOwner,
    id?: string | null,
  ): Promise<{ id: string; bankCode: string; accountNumber: string; accountName: string } | null> {
    const row = await this.prisma.bankAccount.findFirst({
      where: {
        ...ownerWhere(owner),
        status: BANK_ACCOUNT_STATUS.ACTIVE,
        ...(id ? { id } : { isDefault: true }),
      },
      select: { id: true, bankCode: true, accountNumber: true, accountName: true },
    });
    return row;
  }
}

// ── Nội bộ ──────────────────────────────────────────────────────────────────

function ownerWhere(owner: BankAccountOwner): Prisma.BankAccountWhereInput {
  return owner.type === WALLET_OWNER_TYPE.USER
    ? { ownerType: WALLET_OWNER_TYPE.USER, ownerUserId: owner.userId }
    : { ownerType: WALLET_OWNER_TYPE.TENANT, ownerTenantId: owner.tenantId };
}

async function clearDefaultWithinTx(
  tx: Prisma.TransactionClient,
  owner: BankAccountOwner,
): Promise<void> {
  await tx.bankAccount.updateMany({
    where: { ...ownerWhere(owner), isDefault: true },
    data: { isDefault: false },
  });
}

function toDto(row: Row): BankAccountDto {
  return {
    id: row.id,
    ownerType: row.ownerType as WalletOwnerType,
    bankCode: row.bankCode,
    // PII: màn hình chỉ cần đủ để người dùng NHẬN RA tài khoản của mình, không cần đọc lại nó.
    // `?? ''` chỉ để chiều chữ ký nhận nullable — cột này NOT NULL, không có nhánh rỗng thật.
    accountNumberMasked: maskAccountNumber(row.accountNumber) ?? '',
    accountName: row.accountName,
    label: row.label,
    isDefault: row.isDefault,
    status: row.status as BankAccountStatus,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Bỏ mọi khoảng trắng người dùng gõ hoặc dán từ app ngân hàng. */
function normalizeNumber(value: string): string {
  return value.replace(/\s+/g, '');
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy tài khoản ngân hàng',
  });
}

/**
 * Vi phạm partial unique số tài khoản → 409 nói đúng chuyện, thay vì một P2002 khó đọc.
 *
 * Chỉ DỊCH lỗi của database, không thay nó bằng một phép kiểm trước: hai request thêm cùng một
 * số tài khoản cùng lúc đều vượt qua phép kiểm đó, và chỉ ràng buộc mới chặn được.
 */
function translateUnique(err: unknown): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return new ConflictException({
      code: API_ERROR_CODE.BANK_ACCOUNT_DUPLICATE,
      message: 'Tài khoản ngân hàng này đã có trong danh sách',
    });
  }
  return err;
}
