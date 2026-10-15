import {
  APP_CONFIG_KEY,
  DEFAULT_LOCALE,
  EMAIL_OUTBOX_KIND,
  EMAIL_OUTBOX_STATUS,
  partnerWelcomeDedupeKey,
  planGuideDedupeKey,
  type AppLocale,
  type PartnerWelcomeEmailPayload,
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
 * Gửi CÙNG một thư tới email TÀI KHOẢN chủ gian hàng VÀ email LIÊN HỆ của gian hàng — chủ đăng ký
 * bằng SĐT không có email tài khoản, email liên hệ là đường duy nhất tới họ. Hai địa chỉ trùng nhau
 * (không phân biệt hoa thường) ⇒ một thư. Khoá chống trùng: địa chỉ tài khoản giữ khoá gốc, địa chỉ
 * liên hệ thêm hậu tố `:contact` — mỗi địa chỉ một thư cho mỗi mốc, vẫn do DB gác. `dedupeKey`
 * (nếu truyền) thay khoá gốc, vd tư vấn: một thư mỗi tài khoản mỗi ngày cho MỖI địa chỉ.
 *
 * Trả các địa chỉ vừa có dòng MỚI vào hàng (rỗng ⇒ không thư nào).
 */
export async function enqueuePlanGuideToOwnerAndContact(
  db: Db,
  input: Omit<EnqueuePlanGuideEmailInput, 'to'> & {
    accountEmail: string | null | undefined;
    contactEmail: string | null | undefined;
  },
): Promise<string[]> {
  const { accountEmail, contactEmail, dedupeKey, ...rest } = input;
  const baseKey =
    dedupeKey ??
    planGuideDedupeKey(rest.reason, {
      tenantId: rest.tenantId ?? undefined,
      subscriptionId: rest.subscriptionId ?? undefined,
    });
  const queued: string[] = [];
  for (const r of ownerAndContactRecipients(accountEmail, contactEmail, baseKey)) {
    if (await enqueuePlanGuideEmail(db, { ...rest, to: r.to, dedupeKey: r.dedupeKey })) queued.push(r.to);
  }
  return queued;
}

/**
 * Người nhận "email TÀI KHOẢN + email LIÊN HỆ": bỏ trống, trùng nhau (không phân biệt hoa thường)
 * ⇒ một. Địa chỉ tài khoản giữ khoá gốc, địa chỉ liên hệ thêm hậu tố `:contact`.
 */
function ownerAndContactRecipients(
  accountEmail: string | null | undefined,
  contactEmail: string | null | undefined,
  baseKey: string,
): { to: string; dedupeKey: string }[] {
  const account = (accountEmail ?? '').trim();
  const contact = (contactEmail ?? '').trim();
  const out: { to: string; dedupeKey: string }[] = [];
  if (account) out.push({ to: account, dedupeKey: baseKey });
  if (contact && contact.toLowerCase() !== account.toLowerCase()) {
    out.push({ to: contact, dedupeKey: `${baseKey}:contact` });
  }
  return out;
}

/**
 * Thư CHÀO MỪNG chủ xe tuyến hoa hồng vừa đăng ký — tới email tài khoản + email liên hệ (trùng ⇒
 * một), MỘT lần mỗi hồ sơ (DB gác). Đi sau `isPlanPromotionEnabled` như thư gói — tắt ⇒ không xếp gì.
 * Trả các địa chỉ vừa có dòng MỚI vào hàng.
 */
export async function enqueuePartnerWelcomeEmail(
  db: Db,
  input: {
    accountEmail: string | null | undefined;
    contactEmail: string | null | undefined;
    displayName: string | null;
    shopName: string | null;
    tenantId: string;
    locale?: AppLocale;
  },
): Promise<string[]> {
  if (!(await isPlanPromotionEnabled(db))) return [];
  const payload: PartnerWelcomeEmailPayload = {
    displayName: input.displayName,
    shopName: input.shopName,
    tenantId: input.tenantId,
  };
  const queued: string[] = [];
  const recipients = ownerAndContactRecipients(
    input.accountEmail,
    input.contactEmail,
    partnerWelcomeDedupeKey(input.tenantId),
  );
  for (const r of recipients) {
    const result = await db.emailOutbox.createMany({
      data: [
        {
          id: newId(),
          kind: EMAIL_OUTBOX_KIND.PARTNER_WELCOME,
          toEmail: r.to,
          locale: input.locale ?? DEFAULT_LOCALE,
          payloadJson: payload as unknown as Prisma.InputJsonValue,
          dedupeKey: r.dedupeKey,
          status: EMAIL_OUTBOX_STATUS.PENDING,
        },
      ],
      skipDuplicates: true,
    });
    if (result.count > 0) queued.push(r.to);
  }
  return queued;
}

/**
 * Mốc vòng đời của một thuê bao: gửi tới email CHỦ gian hàng và email liên hệ của gian hàng
 * (`enqueuePlanGuideToOwnerAndContact`); không có email nào ⇒ bỏ qua.
 */
export async function enqueuePlanGuideForSubscription(
  db: Db,
  input: { tenantId: string; subscriptionId: string; endsAt: Date; reason: PlanGuideReason },
): Promise<boolean> {
  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: { name: true, email: true, owner: { select: { email: true, displayName: true } } },
  });
  const queued = await enqueuePlanGuideToOwnerAndContact(db, {
    accountEmail: tenant?.owner?.email,
    contactEmail: tenant?.email,
    reason: input.reason,
    displayName: tenant?.owner?.displayName ?? null,
    shopName: tenant?.name ?? null,
    tenantId: input.tenantId,
    subscriptionId: input.subscriptionId,
    endsAt: input.endsAt,
  });
  return queued.length > 0;
}
