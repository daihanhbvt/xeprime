import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  APP_CONFIG_KEY,
  AUDIT_ACTOR_SCOPE,
  CANCEL_CREDIT_DELAY_BOUNDS,
  HOLD_REFUND_STATUS,
  SCHEDULED_CREDIT_STATUS,
  WALLET_OWNER_TYPE,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { WalletService, type CreditInput, type WalletOwner } from './wallet.service';

const HOUR_MS = 3_600_000;
/** Mỗi vòng quét cộng tối đa chừng này khoản — vòng sau làm tiếp, không giữ khoá lâu. */
const RELEASE_BATCH = 50;

/** Hai cấu hình số giờ chờ khi khách huỷ (biên bản họp 19/11/2026). */
export interface CancelCreditDelays {
  refundHours: number;
  ownerPayoutHours: number;
}

/**
 * KHOẢN CỘNG VÍ HẸN GIỜ — writer duy nhất của `scheduled_wallet_credits` (biên bản họp 19/11/2026,
 * việc #4: khách huỷ chuyến thì tiền hoàn không vào ví ngay mà chờ để kịp xử lý tranh chấp).
 *
 * Tiền đã CHỐT thuộc về ai (kết cục giữ chỗ đã ghi trong cùng transaction) — chỉ có THỜI ĐIỂM vào ví
 * là lùi lại. Vì vậy một khoản hẹn giờ mang nguyên bộ khoá nguồn của bút toán sẽ ghi
 * (`kind, source_type, source_ref`), và lúc tới hạn đi qua đúng `WalletService.creditWithinTx`: chống
 * cộng đôi vẫn là unique của sổ ví, không phải một phép kiểm mới.
 *
 * Ba thao tác của admin: tạm giữ (vòng quét bỏ qua), bỏ tạm giữ (chờ tiếp tới hạn cũ), cộng ngay.
 */
@Injectable()
export class ScheduledCreditService {
  private readonly logger = new Logger(ScheduledCreditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly audit: AuditService,
  ) {}

  /** Số giờ chờ đang áp — đọc trong transaction của lượt chốt để hai số không lệch nhau. */
  async delaysWithinTx(tx: Prisma.TransactionClient): Promise<CancelCreditDelays> {
    const row = await tx.platformAppConfig.findUnique({
      where: { key: APP_CONFIG_KEY.PARTNER },
      select: { cancelRefundDelayHours: true, cancelOwnerPayoutDelayHours: true },
    });
    return {
      refundHours: row?.cancelRefundDelayHours ?? CANCEL_CREDIT_DELAY_BOUNDS.default,
      ownerPayoutHours: row?.cancelOwnerPayoutDelayHours ?? CANCEL_CREDIT_DELAY_BOUNDS.default,
    };
  }

  /**
   * Hẹn cộng `input` vào ví sau `delayHours` giờ. `delayHours <= 0` ⇒ cộng NGAY (hành vi cũ) và trả
   * bút toán; còn lại trả `null` cho `entry` cùng id khoản hẹn giờ. Cùng nguồn hẹn hai lần ⇒ cộng dồn
   * vào khoản đang chờ (một hold — một khoản mỗi loại bút toán).
   */
  async scheduleWithinTx(
    tx: Prisma.TransactionClient,
    input: CreditInput & { holdRefundId?: string | null },
    delayHours: number,
    now: Date = new Date(),
  ): Promise<{ scheduledId: string | null; entryId: string | null }> {
    if (delayHours <= 0) {
      const credited = await this.wallet.creditWithinTx(tx, input);
      return { scheduledId: null, entryId: credited?.entryId ?? null };
    }
    const owner = ownerKey(input.owner);
    const existing = await tx.scheduledWalletCredit.findUnique({
      where: {
        ownerType_ownerId_kind_sourceType_sourceRefId: {
          ...owner,
          kind: input.kind,
          sourceType: input.sourceType,
          sourceRefId: input.sourceRefId,
        },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status === SCHEDULED_CREDIT_STATUS.RELEASED) {
        // Nguồn này đã vào ví — đi tiếp như `creditWithinTx` với nguồn trùng: no-op.
        this.logger.warn(`Khoản hẹn giờ ${existing.id} đã cộng ví — bỏ qua lượt hẹn trùng nguồn`);
        return { scheduledId: existing.id, entryId: null };
      }
      await tx.scheduledWalletCredit.update({
        where: { id: existing.id },
        data: { amount: { increment: input.amount } },
      });
      return { scheduledId: existing.id, entryId: null };
    }
    const id = newId();
    await tx.scheduledWalletCredit.create({
      data: {
        id,
        ...owner,
        kind: input.kind,
        sourceType: input.sourceType,
        sourceRefId: input.sourceRefId,
        amount: input.amount,
        bookingId: input.bookingId ?? null,
        holdId: input.holdId ?? null,
        note: input.note ?? null,
        holdRefundId: input.holdRefundId ?? null,
        status: SCHEDULED_CREDIT_STATUS.SCHEDULED,
        releaseAt: new Date(now.getTime() + delayHours * HOUR_MS),
      },
    });
    return { scheduledId: id, entryId: null };
  }

  /** Vòng quét: cộng mọi khoản đã tới hạn (không tạm giữ). Trả số khoản đã cộng. */
  async releaseDue(now: Date = new Date()): Promise<number> {
    const due = await this.prisma.scheduledWalletCredit.findMany({
      where: { status: SCHEDULED_CREDIT_STATUS.SCHEDULED, releaseAt: { lte: now } },
      orderBy: { releaseAt: 'asc' },
      take: RELEASE_BATCH,
      select: { id: true },
    });
    let released = 0;
    for (const { id } of due) {
      try {
        if (await this.releaseOne(id, now, null)) released += 1;
      } catch (error) {
        // Một khoản hỏng không chặn các khoản khác; vòng sau thử lại.
        this.logger.error(`Cộng ví khoản hẹn giờ ${id} lỗi`, error as Error);
      }
    }
    return released;
  }

  /** Admin cho cộng NGAY (kể cả khoản đang tạm giữ). */
  async releaseNow(id: string, actorUserId: string): Promise<void> {
    const ok = await this.releaseOne(id, new Date(), actorUserId);
    if (!ok) throw alreadyReleased();
  }

  /** Admin tạm giữ — tranh chấp; vòng quét bỏ qua cho tới khi bỏ tạm giữ. */
  async freeze(id: string, actorUserId: string, note: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.scheduledWalletCredit.updateMany({
        where: { id, status: SCHEDULED_CREDIT_STATUS.SCHEDULED },
        data: {
          status: SCHEDULED_CREDIT_STATUS.FROZEN,
          frozenAt: new Date(),
          frozenBy: actorUserId,
          freezeNote: note,
        },
      });
      if (claimed.count === 0) throw await this.stateError(tx, id);
      await this.recordAudit(tx, id, actorUserId, 'wallet.scheduled_credit.freeze', { note });
    });
  }

  /** Admin bỏ tạm giữ — khoản chờ tiếp tới hạn cũ (đã quá hạn thì vòng quét kế tiếp cộng). */
  async unfreeze(id: string, actorUserId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.scheduledWalletCredit.updateMany({
        where: { id, status: SCHEDULED_CREDIT_STATUS.FROZEN },
        data: { status: SCHEDULED_CREDIT_STATUS.SCHEDULED, frozenAt: null, frozenBy: null },
      });
      if (claimed.count === 0) throw await this.stateError(tx, id);
      await this.recordAudit(tx, id, actorUserId, 'wallet.scheduled_credit.unfreeze', {});
    });
  }

  /**
   * Cộng MỘT khoản vào ví. Chiếm khoản bằng `updateMany` có điều kiện trạng thái (một lượt thắng khi
   * nhiều tiến trình API cùng quét), ghi bút toán trong CÙNG transaction, rồi lật khoản hoàn của khách
   * (nếu có) sang `credited`.
   */
  private async releaseOne(id: string, now: Date, actorUserId: string | null): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.scheduledWalletCredit.findUnique({ where: { id } });
      if (!row)
        throw new NotFoundException({
          code: API_ERROR_CODE.NOT_FOUND,
          message: 'Không có khoản này',
        });
      const allowed: string[] = actorUserId
        ? [SCHEDULED_CREDIT_STATUS.SCHEDULED, SCHEDULED_CREDIT_STATUS.FROZEN]
        : [SCHEDULED_CREDIT_STATUS.SCHEDULED];
      if (!allowed.includes(row.status)) return false;

      const credited = await this.wallet.creditWithinTx(tx, {
        owner: walletOwnerOf(row.ownerType, row.ownerId),
        kind: row.kind as CreditInput['kind'],
        sourceType: row.sourceType as CreditInput['sourceType'],
        sourceRefId: row.sourceRefId,
        amount: row.amount,
        bookingId: row.bookingId,
        holdId: row.holdId,
        note: row.note,
        createdByUserId: actorUserId,
      });
      if (!credited) {
        // Nguồn đã có bút toán từ trước (không qua khoản này) — không cộng đôi, để admin xem.
        this.logger.warn(`Khoản hẹn giờ ${id}: nguồn đã có bút toán — giữ nguyên để đối chiếu`);
        return false;
      }
      const claimed = await tx.scheduledWalletCredit.updateMany({
        where: { id, status: { in: allowed } },
        data: {
          status: SCHEDULED_CREDIT_STATUS.RELEASED,
          releasedAt: now,
          walletEntryId: credited.entryId,
          frozenAt: null,
          frozenBy: null,
        },
      });
      // Lượt khác đã chiếm trước — huỷ cả transaction (bút toán vừa ghi cũng quay đầu).
      if (claimed.count === 0) throw new Error(`Khoản hẹn giờ ${id} đã được lượt khác xử lý`);

      if (row.holdRefundId) {
        // `walletEntryId` của khoản hoàn là bút toán ĐẦU TIÊN (unique) — giữ nếu đã có (ca chuyển thừa).
        const refund = await tx.holdRefund.findUnique({
          where: { id: row.holdRefundId },
          select: { status: true, walletEntryId: true },
        });
        if (refund?.status === HOLD_REFUND_STATUS.SCHEDULED) {
          await tx.holdRefund.update({
            where: { id: row.holdRefundId },
            data: {
              status: HOLD_REFUND_STATUS.CREDITED,
              walletEntryId: refund.walletEntryId ?? credited.entryId,
            },
          });
        }
      }
      if (actorUserId) {
        await this.recordAudit(tx, id, actorUserId, 'wallet.scheduled_credit.release_now', {
          amount: row.amount.toFixed(2),
        });
      }
      return true;
    });
  }

  private async stateError(tx: Prisma.TransactionClient, id: string): Promise<Error> {
    const row = await tx.scheduledWalletCredit.findUnique({ where: { id }, select: { id: true } });
    if (!row)
      return new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không có khoản này',
      });
    return alreadyReleased();
  }

  private async recordAudit(
    tx: Prisma.TransactionClient,
    id: string,
    actorUserId: string,
    action: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record(
      {
        actorUserId,
        actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
        action,
        targetType: 'scheduled_wallet_credit',
        targetId: id,
        after,
      },
      tx,
    );
  }
}

function alreadyReleased(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.CONFLICT,
    message:
      'Khoản này không còn ở trạng thái cho phép thao tác (đã cộng ví hoặc đã đổi trạng thái).',
  });
}

function ownerKey(owner: WalletOwner): { ownerType: string; ownerId: string } {
  return owner.type === WALLET_OWNER_TYPE.USER
    ? { ownerType: owner.type, ownerId: owner.userId }
    : { ownerType: owner.type, ownerId: owner.tenantId };
}

function walletOwnerOf(ownerType: string, ownerId: string): WalletOwner {
  return ownerType === WALLET_OWNER_TYPE.USER
    ? { type: WALLET_OWNER_TYPE.USER, userId: ownerId }
    : { type: WALLET_OWNER_TYPE.TENANT, tenantId: ownerId };
}

/** Một khoản hẹn giờ cho màn admin. */
export interface ScheduledCreditView {
  id: string;
  ownerType: string;
  ownerId: string;
  ownerName: string | null;
  kind: string;
  amount: string;
  holdId: string | null;
  bookingId: string | null;
  holdRefundId: string | null;
  status: string;
  releaseAt: string;
  frozenAt: string | null;
  freezeNote: string | null;
  note: string | null;
  createdAt: string;
}

/** Danh sách khoản đang chờ/tạm giữ — cũ nhất (sắp tới hạn) trước. Chỉ đọc. */
export async function listPendingScheduledCredits(
  prisma: PrismaService,
  limit = 200,
): Promise<ScheduledCreditView[]> {
  const rows = await prisma.scheduledWalletCredit.findMany({
    where: { status: { in: [SCHEDULED_CREDIT_STATUS.SCHEDULED, SCHEDULED_CREDIT_STATUS.FROZEN] } },
    orderBy: { releaseAt: 'asc' },
    take: Math.min(500, Math.max(1, limit)),
  });
  const userIds = rows.filter((r) => r.ownerType === WALLET_OWNER_TYPE.USER).map((r) => r.ownerId);
  const tenantIds = rows
    .filter((r) => r.ownerType === WALLET_OWNER_TYPE.TENANT)
    .map((r) => r.ownerId);
  const [users, tenants] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true },
        })
      : [],
    tenantIds.length
      ? prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  const names = new Map<string, string>([
    ...users.map((u) => [u.id, u.displayName] as [string, string]),
    ...tenants.map((t) => [t.id, t.name] as [string, string]),
  ]);
  return rows.map((r) => ({
    id: r.id,
    ownerType: r.ownerType,
    ownerId: r.ownerId,
    ownerName: names.get(r.ownerId) ?? null,
    kind: r.kind,
    amount: r.amount.toFixed(2),
    holdId: r.holdId,
    bookingId: r.bookingId,
    holdRefundId: r.holdRefundId,
    status: r.status,
    releaseAt: r.releaseAt.toISOString(),
    frozenAt: r.frozenAt?.toISOString() ?? null,
    freezeNote: r.freezeNote,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  }));
}
