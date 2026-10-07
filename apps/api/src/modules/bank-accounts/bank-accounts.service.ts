import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BANK_ACCOUNT_STATUS,
  WALLET_OWNER_TYPE,
  maskAccountNumber,
  type BankAccountStatus,
  type WalletOwnerType,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
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
 * ## Mỗi chủ MỘT tài khoản nhận tiền (07/10/2026)
 *
 * Trước đợt này bảng là một SỔ nhiều tài khoản có một cái "mặc định", và mỗi lệnh rút bắt chọn
 * trong sổ. Nay một chủ có đúng một tài khoản đang dùng: khai cái mới là THAY cái cũ. "Tiền về
 * đâu" chỉ còn một câu trả lời — không có cái mặc định để quên đổi, không có danh sách để chọn nhầm.
 *
 * Hai điều bảo đảm, cả hai do DATABASE giữ chứ không phải do service nhớ kiểm:
 *   - Một tài khoản thuộc đúng một chủ (CHECK owner XOR).
 *   - Mỗi chủ tối đa MỘT tài khoản `active`, và nó luôn là mặc định (partial unique + CHECK —
 *     migration `20261007160000_bank_accounts_single_active`).
 *
 * Cột `is_default` còn đó cho client cũ (app native) đọc; với dòng `active` nó luôn `true`.
 */
@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    // Mặc định tự dựng cho các spec dựng `new BankAccountsService(prisma)` bằng tay — cùng cách với
    // `AuditService` và `SupportRequestStore`. Ở runtime Nest tiêm bản của `AuditModule` (global).
    private readonly audit: AuditService = new AuditService(prisma),
  ) {}

  /**
   * Tài khoản đang dùng — mảng 0 hoặc 1 phần tử. Giữ hình MẢNG vì đó là hợp đồng app native đang
   * đọc (`GET /…/bank-accounts`); ràng buộc DB bảo đảm không bao giờ có phần tử thứ hai.
   */
  async list(owner: BankAccountOwner): Promise<BankAccountDto[]> {
    const rows = await this.prisma.bankAccount.findMany({
      where: { ...ownerWhere(owner), status: BANK_ACCOUNT_STATUS.ACTIVE },
      select: SELECT,
    });
    return rows.map(toDto);
  }

  /**
   * Đặt tài khoản nhận tiền — chưa có thì THÊM, có rồi thì ĐỔI.
   *
   * Đổi = lưu trữ cái cũ + tạo cái mới trong CÙNG transaction: không có khoảnh khắc nào chủ này
   * "không có tài khoản" hay "có hai". Cái cũ được LƯU TRỮ chứ không sửa tại chỗ — lệnh rút cũ còn
   * trỏ về nó, và lệnh đang chờ đã chụp số tài khoản vào chính nó
   * (`withdrawal_requests.bank_account_number`), nên đổi ở đây không âm thầm đổi đích của lệnh đó.
   *
   * Khai lại ĐÚNG đích đang dùng (cùng ngân hàng, số, tên thụ hưởng) thì không đẻ dòng mới: giữ
   * dấu đã đối chiếu (`verified_at`), chỉ cập nhật tên gợi nhớ nếu có gửi. Đổi tên thụ hưởng là một
   * đích MỚI — ngân hàng đối chiếu tên, nên dấu đối chiếu cũ không còn giá trị.
   *
   * ## `isDefault: false` = KHÔNG đồng ý đổi
   *
   * Bản app native cũ có ô "thêm tài khoản" với công tắc mặc định TẮT — người dùng đang thêm một
   * tài khoản PHỤ, không định đổi chỗ tiền về. Lặng lẽ thay tài khoản của họ là chuyển tiền tới nơi
   * họ không chọn; nên server từ chối (`BANK_ACCOUNT_REPLACE_NOT_CONFIRMED`) và câu lỗi chỉ cách
   * đổi thật. Web không gửi trường này.
   *
   * ## Vì sao khoá tư vấn
   *
   * Hai lượt đổi song song cùng thấy "đang có A", cùng lưu trữ A rồi cùng chèn — lượt sau đâm vào
   * partial unique và người dùng nhận lỗi 500 cho một thao tác hợp lệ. Khoá theo CHỦ tuần tự hoá
   * chúng: lượt sau chờ, rồi thấy và thay đúng cái lượt trước vừa tạo. Ràng buộc DB vẫn là thứ bảo
   * đảm "một"; khoá chỉ để lượt đến sau không nổ.
   *
   * Thêm/đổi ghi audit trong cùng transaction: đổi chỗ tiền về là thao tác mà kẻ chiếm được tài
   * khoản sẽ làm đầu tiên, và "ai đổi, lúc nào, từ đâu sang đâu" phải trả lời được.
   */
  async create(
    owner: BankAccountOwner,
    dto: SaveBankAccountDto,
    actorUserId: string | null = null,
  ): Promise<BankAccountDto> {
    const bankCode = dto.bankCode.trim().toUpperCase();
    const accountNumber = normalizeNumber(dto.accountNumber);
    const accountName = dto.accountName.trim();
    const label = dto.label?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      await lockOwnerWithinTx(tx, owner);

      const current = await tx.bankAccount.findFirst({
        where: { ...ownerWhere(owner), status: BANK_ACCOUNT_STATUS.ACTIVE },
        select: { id: true, bankCode: true, accountNumber: true, accountName: true },
      });

      if (
        current &&
        current.bankCode === bankCode &&
        current.accountNumber === accountNumber &&
        current.accountName === accountName
      ) {
        const row = await tx.bankAccount.update({
          where: { id: current.id },
          // Không gửi tên gợi nhớ thì GIỮ cái cũ — form web không gửi trường để trống.
          data: dto.label === undefined ? {} : { label },
          select: SELECT,
        });
        return toDto(row);
      }

      if (current && dto.isDefault === false) {
        throw new ConflictException({
          code: API_ERROR_CODE.BANK_ACCOUNT_REPLACE_NOT_CONFIRMED,
          message:
            'Mỗi chủ chỉ có một tài khoản nhận tiền — bật "đặt làm mặc định" để đổi sang tài khoản này',
        });
      }

      if (current) {
        await tx.bankAccount.update({
          where: { id: current.id },
          data: { status: BANK_ACCOUNT_STATUS.ARCHIVED, isDefault: false },
        });
      }

      const row = await tx.bankAccount.create({
        data: {
          id: newId(),
          ownerType: owner.type,
          ownerUserId: owner.type === WALLET_OWNER_TYPE.USER ? owner.userId : null,
          ownerTenantId: owner.type === WALLET_OWNER_TYPE.TENANT ? owner.tenantId : null,
          bankCode,
          accountNumber,
          accountName,
          label,
          isDefault: true,
          changedAt: new Date(),
        },
        select: SELECT,
      });

      await this.audit.record(
        {
          ...auditScope(owner),
          actorUserId,
          action: current ? 'bank_account.replaced' : 'bank_account.added',
          targetType: 'bank_account',
          targetId: row.id,
          // Số tài khoản CHE cả trong audit — sổ này nhiều người đọc hơn đường ghi tiền.
          before: current ? auditSnapshot(current) : null,
          after: auditSnapshot(row),
        },
        tx,
      );
      return toDto(row);
    });
  }

  /**
   * TƯƠNG THÍCH NGƯỢC — app native còn nút "Đặt làm mặc định". Từ khi mỗi chủ chỉ có một tài
   * khoản đang dùng thì nó luôn là mặc định sẵn: endpoint chỉ còn kiểm chủ sở hữu và trả lại nó.
   */
  async setDefault(owner: BankAccountOwner, id: string): Promise<BankAccountDto> {
    const row = await this.prisma.bankAccount.findFirst({
      where: { id, ...ownerWhere(owner), status: BANK_ACCOUNT_STATUS.ACTIVE },
      select: SELECT,
    });
    if (!row) throw notFound();
    return toDto(row);
  }

  /**
   * Bỏ dùng tài khoản — LƯU TRỮ, không xoá (ADR 0033): lệnh rút cũ còn trỏ về nó, và xoá là mất
   * khả năng trả lời "khoản đó đã chuyển vào đâu". Sau đó chủ này không còn tài khoản nhận tiền
   * cho tới khi khai cái mới.
   *
   * Điều kiện chủ sở hữu nằm trong CHÍNH câu cập nhật: biết id không cho quyền đụng vào nó.
   */
  async archive(
    owner: BankAccountOwner,
    id: string,
    actorUserId: string | null = null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.bankAccount.updateMany({
        where: { id, ...ownerWhere(owner), status: BANK_ACCOUNT_STATUS.ACTIVE },
        data: { status: BANK_ACCOUNT_STATUS.ARCHIVED, isDefault: false },
      });
      if (count === 0) throw notFound();

      await this.audit.record(
        {
          ...auditScope(owner),
          actorUserId,
          action: 'bank_account.archived',
          targetType: 'bank_account',
          targetId: id,
        },
        tx,
      );
    });
  }

  /**
   * Tài khoản nhận tiền đang dùng của một chủ — dùng khi ghi snapshot vào lệnh hoàn/rút.
   *
   * Có `id` thì nó phải CHÍNH LÀ tài khoản đang dùng: một id đã lưu trữ (người dùng vừa đổi tài
   * khoản ở tab khác) trả `null`, không âm thầm chuyển về đích cũ.
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
        ...(id ? { id } : {}),
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

/**
 * Tuần tự hoá mọi lượt ĐỔI tài khoản của một chủ — xem `create`. `hashtext` trả int4, vừa tham số
 * bigint của `pg_advisory_xact_lock`; tiền tố `bank-account:` giữ không gian khoá (dùng chung toàn
 * database) không đụng khoá của module khác. Tự nhả khi transaction kết thúc.
 */
async function lockOwnerWithinTx(
  tx: Prisma.TransactionClient,
  owner: BankAccountOwner,
): Promise<void> {
  const ownerId = owner.type === WALLET_OWNER_TYPE.USER ? owner.userId : owner.tenantId;
  const key = `bank-account:${owner.type}:${ownerId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/** Phạm vi audit theo chủ: tài khoản của gian hàng ghi vào sổ của tenant đó. */
function auditScope(owner: BankAccountOwner) {
  return owner.type === WALLET_OWNER_TYPE.TENANT
    ? { tenantId: owner.tenantId, actorScope: AUDIT_ACTOR_SCOPE.TENANT }
    : { tenantId: null, actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER };
}

function auditSnapshot(row: { bankCode: string; accountNumber: string; accountName: string }) {
  return {
    bankCode: row.bankCode,
    accountNumberMasked: maskAccountNumber(row.accountNumber),
    accountName: row.accountName,
  };
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
