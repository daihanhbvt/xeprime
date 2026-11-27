import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { isUniqueViolation, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BANK_ACCOUNT_CHANGE_REQUEST_STATUS,
  BANK_ACCOUNT_STATUS,
  WALLET_OWNER_TYPE,
  maskAccountNumber,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BankAccountsService, type BankAccountOwner } from './bank-accounts.service';
import type {
  BankAccountChangeRequestDto,
  CreateBankAccountChangeRequestDto,
  PlatformBankAccountChangeRequestDto,
} from './dto/bank-account-change-request.dto';

const SELECT = {
  id: true,
  ownerType: true,
  ownerId: true,
  requestedBy: true,
  bankCode: true,
  accountNumber: true,
  accountName: true,
  label: true,
  note: true,
  status: true,
  reviewedAt: true,
  reviewNote: true,
  createdAt: true,
} satisfies Prisma.BankAccountChangeRequestSelect;

type Row = Prisma.BankAccountChangeRequestGetPayload<{ select: typeof SELECT }>;

/**
 * YÊU CẦU ĐỔI tài khoản nhận tiền — writer duy nhất của `bank_account_change_requests` (biên bản họp
 * 19/11/2026, việc #19: "chốt cứng thông tin tài khoản").
 *
 * Tài khoản khoá từ lần khai đầu (`BankAccountsService.createWithinTx`). Đổi đi theo ba bước:
 *   1. chủ ví gửi yêu cầu (tài khoản MỚI + lời nhắn) — chưa đổi gì;
 *   2. admin/CSKH GỌI ĐIỆN cho người yêu cầu để xác minh chính chủ;
 *   3. duyệt ⇒ thay tài khoản trong CÙNG transaction với lượt duyệt; từ chối ⇒ giữ nguyên.
 *
 * Mỗi chủ tối đa một yêu cầu đang chờ (partial unique ở DB). Mọi bước ghi audit; số tài khoản CHE ở
 * mọi chỗ trừ màn duyệt của admin (người duyệt phải đọc số đầy đủ cho chủ ví xác nhận qua điện thoại).
 */
@Injectable()
export class BankAccountChangeRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bankAccounts: BankAccountsService,
    private readonly audit: AuditService,
  ) {}

  /** Yêu cầu đang chờ của chủ này — `null` khi không có. */
  async current(owner: BankAccountOwner): Promise<BankAccountChangeRequestDto | null> {
    const row = await this.prisma.bankAccountChangeRequest.findFirst({
      where: { ...ownerKey(owner), status: BANK_ACCOUNT_CHANGE_REQUEST_STATUS.PENDING },
      select: SELECT,
    });
    return row ? toOwnerDto(row) : null;
  }

  async create(
    owner: BankAccountOwner,
    actorUserId: string,
    dto: CreateBankAccountChangeRequestDto,
  ): Promise<BankAccountChangeRequestDto> {
    const bankCode = dto.bankCode.trim().toUpperCase();
    const accountNumber = dto.accountNumber.replace(/\s+/g, '');
    const accountName = dto.accountName.trim();

    const current = await this.prisma.bankAccount.findFirst({
      where: { ...accountOwnerWhere(owner), status: BANK_ACCOUNT_STATUS.ACTIVE },
      select: { bankCode: true, accountNumber: true, accountName: true },
    });
    // Chưa có tài khoản nào thì không có gì bị khoá — khai thẳng, không cần yêu cầu.
    if (!current) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Chưa có tài khoản nhận tiền - hãy khai tài khoản trực tiếp',
      });
    }
    if (
      current.bankCode === bankCode &&
      current.accountNumber === accountNumber &&
      current.accountName === accountName
    ) {
      throw new ConflictException({
        code: API_ERROR_CODE.BANK_ACCOUNT_CHANGE_UNCHANGED,
        message: 'Đây đúng là tài khoản đang dùng',
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.bankAccountChangeRequest.create({
          data: {
            id: newId(),
            ...ownerKey(owner),
            requestedBy: actorUserId,
            bankCode,
            accountNumber,
            accountName,
            label: dto.label?.trim() || null,
            note: dto.note?.trim() || null,
          },
          select: SELECT,
        });
        await this.audit.record(
          {
            ...auditScope(owner),
            actorUserId,
            action: 'bank_account.change_requested',
            targetType: 'bank_account_change_request',
            targetId: row.id,
            after: { bankCode, accountNumber: maskAccountNumber(accountNumber), accountName },
          },
          tx,
        );
        return toOwnerDto(row);
      });
    } catch (error) {
      // Partial unique "một yêu cầu đang chờ mỗi chủ" — lượt song song hoặc đã có yêu cầu từ trước.
      if (isUniqueViolation(error, 'bank_account_change_requests_one_pending_per_owner')) {
        throw new ConflictException({
          code: API_ERROR_CODE.BANK_ACCOUNT_CHANGE_PENDING,
          message: 'Đã có một yêu cầu đổi tài khoản đang chờ xác minh',
        });
      }
      throw error;
    }
  }

  /** Chủ ví tự huỷ yêu cầu đang chờ của mình. */
  async cancel(owner: BankAccountOwner, actorUserId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.bankAccountChangeRequest.updateMany({
        where: { id, ...ownerKey(owner), status: BANK_ACCOUNT_CHANGE_REQUEST_STATUS.PENDING },
        data: { status: BANK_ACCOUNT_CHANGE_REQUEST_STATUS.CANCELLED },
      });
      if (count === 0) throw notFound();
      await this.audit.record(
        {
          ...auditScope(owner),
          actorUserId,
          action: 'bank_account.change_cancelled',
          targetType: 'bank_account_change_request',
          targetId: id,
        },
        tx,
      );
    });
  }

  /** Hàng đợi của admin — yêu cầu đang chờ, cũ nhất trước, kèm số điện thoại để gọi xác minh. */
  async listPending(): Promise<PlatformBankAccountChangeRequestDto[]> {
    const rows = await this.prisma.bankAccountChangeRequest.findMany({
      where: { status: BANK_ACCOUNT_CHANGE_REQUEST_STATUS.PENDING },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        ...SELECT,
        requester: { select: { displayName: true, phone: true, email: true } },
      },
    });
    const tenantIds = rows
      .filter((r) => r.ownerType === WALLET_OWNER_TYPE.TENANT)
      .map((r) => r.ownerId);
    const ownerIds = rows.map((r) => r.ownerId);
    const [tenants, currentAccounts] = await Promise.all([
      tenantIds.length
        ? this.prisma.tenant.findMany({
            where: { id: { in: tenantIds } },
            select: { id: true, name: true },
          })
        : [],
      this.prisma.bankAccount.findMany({
        where: {
          status: BANK_ACCOUNT_STATUS.ACTIVE,
          OR: [{ ownerUserId: { in: ownerIds } }, { ownerTenantId: { in: ownerIds } }],
        },
        select: {
          ownerUserId: true,
          ownerTenantId: true,
          bankCode: true,
          accountNumber: true,
          accountName: true,
        },
      }),
    ]);
    const tenantName = new Map(tenants.map((t) => [t.id, t.name]));
    const currentOf = new Map(
      currentAccounts.map((a) => [(a.ownerUserId ?? a.ownerTenantId)!, a] as const),
    );
    return rows.map((row) => {
      const current = currentOf.get(row.ownerId) ?? null;
      return {
        ...toOwnerDto(row),
        // Màn duyệt đọc số ĐẦY ĐỦ cho chủ ví xác nhận qua điện thoại — chỉ quyền tiền nền tảng thấy.
        accountNumber: row.accountNumber,
        ownerType: row.ownerType,
        ownerName:
          row.ownerType === WALLET_OWNER_TYPE.TENANT
            ? (tenantName.get(row.ownerId) ?? null)
            : row.requester.displayName,
        requesterName: row.requester.displayName,
        requesterPhone: row.requester.phone,
        requesterEmail: row.requester.email,
        currentBankCode: current?.bankCode ?? null,
        currentAccountNumberMasked: current ? maskAccountNumber(current.accountNumber) : null,
        currentAccountName: current?.accountName ?? null,
      };
    });
  }

  /**
   * Admin duyệt SAU KHI đã gọi xác minh chính chủ — thay tài khoản trong CÙNG transaction. Ghi chú
   * (đã gọi số nào, xác minh gì) vào audit.
   */
  async approve(id: string, reviewerId: string, note: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.bankAccountChangeRequest.findUnique({ where: { id }, select: SELECT });
      if (!row) throw notFound();
      const claimed = await tx.bankAccountChangeRequest.updateMany({
        where: { id, status: BANK_ACCOUNT_CHANGE_REQUEST_STATUS.PENDING },
        data: {
          status: BANK_ACCOUNT_CHANGE_REQUEST_STATUS.APPROVED,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNote: note,
        },
      });
      if (claimed.count === 0) throw notPending();

      const owner = ownerOf(row.ownerType, row.ownerId);
      await this.bankAccounts.createWithinTx(
        tx,
        owner,
        {
          bankCode: row.bankCode,
          accountNumber: row.accountNumber,
          accountName: row.accountName,
          ...(row.label ? { label: row.label } : {}),
        },
        row.requestedBy,
        { allowReplace: true },
      );
      await this.audit.record(
        {
          actorUserId: reviewerId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'bank_account.change_approved',
          targetType: 'bank_account_change_request',
          targetId: id,
          after: { note },
        },
        tx,
      );
    });
  }

  /** Admin từ chối — không xác minh được chính chủ / nghi giả mạo. Bắt buộc ghi lý do. */
  async reject(id: string, reviewerId: string, note: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const exists = await tx.bankAccountChangeRequest.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) throw notFound();
      const claimed = await tx.bankAccountChangeRequest.updateMany({
        where: { id, status: BANK_ACCOUNT_CHANGE_REQUEST_STATUS.PENDING },
        data: {
          status: BANK_ACCOUNT_CHANGE_REQUEST_STATUS.REJECTED,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          reviewNote: note,
        },
      });
      if (claimed.count === 0) throw notPending();
      await this.audit.record(
        {
          actorUserId: reviewerId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'bank_account.change_rejected',
          targetType: 'bank_account_change_request',
          targetId: id,
          after: { note },
        },
        tx,
      );
    });
  }
}

function toOwnerDto(row: Row): BankAccountChangeRequestDto {
  return {
    id: row.id,
    bankCode: row.bankCode,
    accountNumberMasked: maskAccountNumber(row.accountNumber) ?? '••••',
    accountName: row.accountName,
    label: row.label,
    note: row.note,
    status: row.status,
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function ownerKey(owner: BankAccountOwner): { ownerType: string; ownerId: string } {
  return owner.type === WALLET_OWNER_TYPE.USER
    ? { ownerType: owner.type, ownerId: owner.userId }
    : { ownerType: owner.type, ownerId: owner.tenantId };
}

function ownerOf(ownerType: string, ownerId: string): BankAccountOwner {
  return ownerType === WALLET_OWNER_TYPE.USER
    ? { type: WALLET_OWNER_TYPE.USER, userId: ownerId }
    : { type: WALLET_OWNER_TYPE.TENANT, tenantId: ownerId };
}

function accountOwnerWhere(owner: BankAccountOwner): Prisma.BankAccountWhereInput {
  return owner.type === WALLET_OWNER_TYPE.USER
    ? { ownerUserId: owner.userId }
    : { ownerTenantId: owner.tenantId };
}

function auditScope(owner: BankAccountOwner) {
  return owner.type === WALLET_OWNER_TYPE.TENANT
    ? { tenantId: owner.tenantId, actorScope: AUDIT_ACTOR_SCOPE.TENANT }
    : { actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy yêu cầu đổi tài khoản',
  });
}

function notPending(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.CONFLICT,
    message: 'Yêu cầu này đã được xử lý hoặc đã huỷ',
  });
}
