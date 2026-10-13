import {
  APP_CONFIG_KEY,
  DEFAULT_LOCALE,
  EMAIL_OUTBOX_KIND,
  EMAIL_OUTBOX_STATUS,
  planGuideDedupeKey,
  type AppLocale,
  type PlanGuideEmailPayload,
  type PlanGuideReason,
} from '@xeprime/types';
import type { Prisma, PrismaClient } from '../generated/client';
import { newId } from './id';

/**
 * Xếp hàng email "Hướng dẫn đăng ký và gia hạn gói" — CỬA DUY NHẤT ghi `email_outbox` loại
 * `plan_guide`, dùng chung cho API (đăng ký gian hàng, tư vấn gói) và worker (mốc vòng đời gói).
 *
 * Vì sao ở `@xeprime/prisma`: hai tiến trình cùng xếp hàng loại thư này, worker không kéo Nest;
 * hai bản sao từng lệch nhau (một bên đọc `isPlanPromotionEnabled`, một bên không chuẩn hoá người nhận).
 *
 * Cổng: `isPlanPromotionEnabled` của app Partner đọc trong CÙNG `db`/transaction — tắt ⇒ không xếp gì. Chống
 * trùng: `dedupe_key` UNIQUE + `ON CONFLICT DO NOTHING` (DB gác, không phải app).
 *
 * Ngôn ngữ: `users` chưa có cột ngôn ngữ đã lưu ⇒ caller truyền nếu biết, không thì `vi`.
 */
export interface EnqueuePlanGuideEmailInput {
  to: string;
  locale?: AppLocale;
  reason: PlanGuideReason;
  displayName?: string | null;
  shopName?: string | null;
  tenantId?: string | null;
  subscriptionId?: string | null;
  endsAt?: Date | null;
  /** Ghi đè khoá chống trùng (vd tư vấn: một thư mỗi tài khoản mỗi ngày). */
  dedupeKey?: string;
}

type Db = PrismaClient | Prisma.TransactionClient;

export async function isPlanPromotionEnabled(db: Db): Promise<boolean> {
  const row = await db.platformAppConfig.findUnique({
    where: { key: APP_CONFIG_KEY.PARTNER },
    select: { isPlanPromotionEnabled: true },
  });
  return row?.isPlanPromotionEnabled ?? false;
}

/** Trả `true` khi có một dòng MỚI vào hàng. */
export async function enqueuePlanGuideEmail(
  db: Db,
  input: EnqueuePlanGuideEmailInput,
): Promise<boolean> {
  const to = input.to.trim();
  if (!to) return false;
  if (!(await isPlanPromotionEnabled(db))) return false;

  const payload: PlanGuideEmailPayload = {
    reason: input.reason,
    displayName: input.displayName ?? null,
    shopName: input.shopName ?? null,
    tenantId: input.tenantId ?? null,
    subscriptionId: input.subscriptionId ?? null,
    endsAt: input.endsAt ? input.endsAt.toISOString() : null,
  };
  const result = await db.emailOutbox.createMany({
    data: [
      {
        id: newId(),
        kind: EMAIL_OUTBOX_KIND.PLAN_GUIDE,
        toEmail: to,
        locale: input.locale ?? DEFAULT_LOCALE,
        payloadJson: payload as unknown as Prisma.InputJsonValue,
        dedupeKey:
          input.dedupeKey ??
          planGuideDedupeKey(input.reason, {
            tenantId: input.tenantId ?? undefined,
            subscriptionId: input.subscriptionId ?? undefined,
          }),
        status: EMAIL_OUTBOX_STATUS.PENDING,
      },
    ],
    skipDuplicates: true,
  });
  return result.count > 0;
}

/**
 * Mốc vòng đời của một thuê bao: người nhận là email CHỦ gian hàng, rơi về email liên hệ của gian
 * hàng; không có email nào ⇒ bỏ qua.
 */
export async function enqueuePlanGuideForSubscription(
  db: Db,
  input: { tenantId: string; subscriptionId: string; endsAt: Date; reason: PlanGuideReason },
): Promise<boolean> {
  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: { name: true, email: true, owner: { select: { email: true, displayName: true } } },
  });
  const to = (tenant?.owner?.email ?? tenant?.email ?? '').trim();
  if (!to) return false;
  return enqueuePlanGuideEmail(db, {
    to,
    reason: input.reason,
    displayName: tenant?.owner?.displayName ?? null,
    shopName: tenant?.name ?? null,
    tenantId: input.tenantId,
    subscriptionId: input.subscriptionId,
    endsAt: input.endsAt,
  });
}
