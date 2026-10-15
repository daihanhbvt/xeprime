import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildPlanPricingCards } from '@xeprime/domain';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
  BILLING_MODE,
  parsePlanLimits,
  SUBSCRIPTION_RENEWAL_REMINDER_DAYS,
  tripServiceFeePercent,
  EMAIL_ASSET_PATH,
  PARTNER_PLAN_PURCHASE_PATH,
  PARTNER_SUPPORT_PATH,
  PARTNER_VEHICLE_NEW_PATH,
  PLAN_GUIDE_TEMPLATE_AUDIT_ACTION,
  DEFAULT_LOCALE,
  EMAIL_OUTBOX_KIND,
  FREE_TRIP_ALLOWANCE,
  type PartnerWelcomeEmailPayload,
  EMAIL_OUTBOX_STATUS,
  PLAN_GUIDE_REASON_VARIANT,
  PLAN_GUIDE_VARIANT,
  PLAN_GUIDE_VARIANT_VALUES,
  planGuideSampleReason,
  type AppLocale,
  type PaginationMeta,
  type PlanGuideEmailPayload,
  type PlanGuideReason,
  type PlanGuideVariant,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { FeePoliciesService } from '../fee-policies/fee-policies.service';
import {
  buildPlanTableHtml,
  renderPlanGuideTemplate,
  type PlanGuidePlan,
  type PlanGuideTemplateContent,
  type RenderedEmail,
} from '../email/plan-guide-email';
import { renderPartnerWelcomeEmail } from '../email/partner-welcome-email';
import { AppConfigService } from './app-config.service';
import {
  PLAN_GUIDE_TEMPLATE_DEFAULT_LIMIT,
  PLAN_GUIDE_TEMPLATE_MAX_LIMIT,
  type CreatePlanGuideTemplateDto,
  type DuplicatePlanGuideTemplateDto,
  type PlanGuideTemplateDto,
  type PlanGuideTemplateListQueryDto,
  type PlanGuideTemplatePreviewDto,
  type PlanGuideTemplateSummaryDto,
  type PreviewPlanGuideTemplateDto,
  type SendTestPlanGuideTemplateDto,
  type SendTestResultDto,
  type UpdatePlanGuideTemplateDto,
} from './dto/plan-guide-template.dto';

/** Khoá giao dịch tuần tự hoá lượt BẬT bộ mẫu — hai admin bấm cùng lúc không đụng unique index. */
const ACTIVATE_LOCK_KEY = 'plan_guide_template_activate';

const SUMMARY_SELECT = {
  id: true,
  code: true,
  name: true,
  isActive: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  updatedBy: true,
} satisfies Prisma.PlanGuideEmailTemplateSelect;

const VARIANT_SELECT = {
  variant: true,
  subjectVi: true,
  subjectEn: true,
  bodyVi: true,
  bodyEn: true,
} satisfies Prisma.PlanGuideEmailTemplateVariantSelect;

const FULL_SELECT = {
  ...SUMMARY_SELECT,
  variants: { select: VARIANT_SELECT },
} satisfies Prisma.PlanGuideEmailTemplateSelect;

type SummaryRow = Prisma.PlanGuideEmailTemplateGetPayload<{ select: typeof SUMMARY_SELECT }>;
type FullRow = Prisma.PlanGuideEmailTemplateGetPayload<{ select: typeof FULL_SELECT }>;
type VariantRow = Prisma.PlanGuideEmailTemplateVariantGetPayload<{ select: typeof VARIANT_SELECT }>;

const VARIANT_FIELDS = ['subjectVi', 'subjectEn', 'bodyVi', 'bodyEn'] as const;
type VariantField = (typeof VARIANT_FIELDS)[number];

/** Dữ liệu mẫu cho xem trước / thư thử — người nhận GIẢ, gói THẬT. */
const SAMPLE = {
  recipientName: 'Nguyễn Văn An',
  shopName: 'Xe Sài Gòn Prime',
  /** Hạn mẫu = đúng mốc thư "sắp hết hạn" thật được gửi. */
  expiresInDays: SUBSCRIPTION_RENEWAL_REMINDER_DAYS,
} as const;

export interface PlanGuideRenderContext {
  plans: PlanGuidePlan[];
  purchaseUrl: string;
  contactUrl: string;
  assetBaseUrl: string;
  hotline: string | null;
  zalo: string | null;
  reminderDays: number;
  /** Ân hạn của bậc tự mua đầu tiên — cho thư không gắn thuê bao. */
  graceDays: number | null;
  commissionPercent: number | null;
  packageCommissionPercent: number | null;
}

/**
 * Bộ mẫu email "Hướng dẫn đăng ký và gia hạn gói" do admin nền tảng quản lý — WRITER DUY NHẤT của
 * `plan_guide_email_templates` + `plan_guide_email_template_variants`, và là nơi DỰNG thư
 * (dispatcher, xem trước, thư thử cùng một đường).
 *
 * Một bộ có ĐỦ bốn nội dung (PLAN_GUIDE_VARIANT). Đúng MỘT bộ đang dùng: partial unique index ở DB;
 * lượt bật tắt bộ cũ + bật bộ mới trong MỘT transaction, tuần tự hoá bằng advisory lock. Thư thật
 * dùng nội dung `PLAN_GUIDE_REASON_VARIANT[reason]` của bộ đang dùng. Bộ đang dùng không xoá được.
 * Mọi thao tác ghi audit cùng transaction.
 */
@Injectable()
export class PlanGuideTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly appConfig: AppConfigService,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
    private readonly feePolicies: FeePoliciesService,
  ) {}

  // ── Đọc ───────────────────────────────────────────────────────────────────

  async list(
    query: PlanGuideTemplateListQueryDto,
  ): Promise<{ data: PlanGuideTemplateSummaryDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, PLAN_GUIDE_TEMPLATE_DEFAULT_LIMIT, PLAN_GUIDE_TEMPLATE_MAX_LIMIT);
    const q = query.q?.trim();
    const where: Prisma.PlanGuideEmailTemplateWhereInput = {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.planGuideEmailTemplate.findMany({
        where,
        // Bộ đang dùng luôn ở đầu, rồi mới nhất.
        orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
        skip: paging.skip,
        take: paging.take,
        select: SUMMARY_SELECT,
      }),
      this.prisma.planGuideEmailTemplate.count({ where }),
    ]);
    const names = await this.updaterNames(rows);
    return { data: rows.map((r) => toSummary(r, names)), meta: paginationMeta(paging, total) };
  }

  async get(id: string): Promise<PlanGuideTemplateDto> {
    const row = await this.findOrThrow(this.prisma, id);
    return toFull(row, await this.updaterNames([row]));
  }

  // ── Ghi ───────────────────────────────────────────────────────────────────

  async create(actorUserId: string, dto: CreatePlanGuideTemplateDto): Promise<PlanGuideTemplateDto> {
    assertAllVariants(dto.variants.map((v) => v.variant));
    const id = newId();
    await this.withCodeGuard(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.planGuideEmailTemplate.create({
          data: {
            id,
            code: dto.code,
            name: dto.name,
            isActive: false,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          },
        });
        await tx.planGuideEmailTemplateVariant.createMany({
          data: dto.variants.map((v) => ({
            templateId: id,
            variant: v.variant,
            subjectVi: v.subjectVi,
            subjectEn: v.subjectEn,
            bodyVi: v.bodyVi,
            bodyEn: v.bodyEn,
          })),
        });
        await this.record(tx, actorUserId, PLAN_GUIDE_TEMPLATE_AUDIT_ACTION.CREATE, id, null, {
          code: dto.code,
          name: dto.name,
        });
      }),
    );
    return this.get(id);
  }

  async update(
    actorUserId: string,
    id: string,
    dto: UpdatePlanGuideTemplateDto,
  ): Promise<PlanGuideTemplateDto> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM plan_guide_email_templates WHERE id = ${id} FOR UPDATE`;
      const before = await this.findOrThrow(tx, id);
      if (dto.expectedVersion !== undefined && dto.expectedVersion !== before.version) {
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: 'Bộ mẫu đã được người khác sửa — tải lại rồi sửa tiếp',
          details: { currentVersion: before.version },
        });
      }

      const changed: string[] = [];
      const data: Prisma.PlanGuideEmailTemplateUpdateInput = {};
      if (dto.name !== undefined && dto.name !== before.name) {
        data.name = dto.name;
        changed.push('name');
      }

      const seen = new Set<string>();
      for (const patch of dto.variants ?? []) {
        if (seen.has(patch.variant)) {
          throw new BadRequestException({
            code: API_ERROR_CODE.VALIDATION_FAILED,
            message: `Nội dung "${patch.variant}" gửi lên hai lần`,
          });
        }
        seen.add(patch.variant);
        const current = before.variants.find((v) => v.variant === patch.variant);
        const vData: Partial<Record<VariantField, string>> = {};
        for (const key of VARIANT_FIELDS) {
          const value = patch[key];
          if (value !== undefined && value !== current?.[key]) vData[key] = value;
        }
        if (Object.keys(vData).length === 0) continue;
        if (current) {
          await tx.planGuideEmailTemplateVariant.update({
            where: { templateId_variant: { templateId: id, variant: patch.variant } },
            data: vData,
          });
        } else {
          // Bộ thiếu nội dung này (dữ liệu sửa tay) — chỉ bù được khi gửi ĐỦ bốn trường.
          const { subjectVi, subjectEn, bodyVi, bodyEn } = patch;
          if (!subjectVi || !subjectEn || !bodyVi || !bodyEn) {
            throw new BadRequestException({
              code: API_ERROR_CODE.VALIDATION_FAILED,
              message: `Nội dung "${patch.variant}" chưa có — gửi đủ tiêu đề và thân hai ngôn ngữ`,
            });
          }
          await tx.planGuideEmailTemplateVariant.create({
            data: { templateId: id, variant: patch.variant, subjectVi, subjectEn, bodyVi, bodyEn },
          });
        }
        changed.push(...Object.keys(vData).map((k) => `${patch.variant}.${k}`));
      }
      if (changed.length === 0) return;

      const after = await tx.planGuideEmailTemplate.update({
        where: { id },
        data: { ...data, version: { increment: 1 }, updatedBy: actorUserId },
        select: { version: true },
      });
      await this.record(
        tx,
        actorUserId,
        PLAN_GUIDE_TEMPLATE_AUDIT_ACTION.UPDATE,
        id,
        { version: before.version },
        { version: after.version, fields: changed },
      );
    });
    return this.get(id);
  }

  async duplicate(
    actorUserId: string,
    id: string,
    dto: DuplicatePlanGuideTemplateDto,
  ): Promise<PlanGuideTemplateDto> {
    const source = await this.findOrThrow(this.prisma, id);
    const newTemplateId = newId();
    await this.withCodeGuard(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.planGuideEmailTemplate.create({
          data: {
            id: newTemplateId,
            code: dto.code,
            name: dto.name ?? `${source.name} (bản sao)`.slice(0, 120),
            isActive: false,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          },
        });
        await tx.planGuideEmailTemplateVariant.createMany({
          data: source.variants.map((v) => ({ templateId: newTemplateId, ...v })),
        });
        await this.record(tx, actorUserId, PLAN_GUIDE_TEMPLATE_AUDIT_ACTION.DUPLICATE, newTemplateId, null, {
          code: dto.code,
          sourceId: id,
        });
      }),
    );
    return this.get(newTemplateId);
  }

  async activate(actorUserId: string, id: string): Promise<PlanGuideTemplateDto> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ACTIVATE_LOCK_KEY}))`;
      const target = await this.findOrThrow(tx, id);
      if (target.isActive) return;
      const previous = await tx.planGuideEmailTemplate.findFirst({
        where: { isActive: true },
        select: { id: true },
      });
      // Tắt bộ cũ TRƯỚC khi bật bộ mới — partial unique index không cho hai dòng `true`.
      await tx.planGuideEmailTemplate.updateMany({
        where: { isActive: true },
        data: { isActive: false, updatedBy: actorUserId },
      });
      await tx.planGuideEmailTemplate.update({
        where: { id },
        data: { isActive: true, updatedBy: actorUserId },
      });
      await this.record(
        tx,
        actorUserId,
        PLAN_GUIDE_TEMPLATE_AUDIT_ACTION.ACTIVATE,
        id,
        { activeId: previous?.id ?? null },
        { activeId: id },
      );
    });
    return this.get(id);
  }

  async remove(actorUserId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM plan_guide_email_templates WHERE id = ${id} FOR UPDATE`;
      const row = await this.findOrThrow(tx, id);
      if (row.isActive) {
        throw new ConflictException({
          code: API_ERROR_CODE.PLAN_GUIDE_TEMPLATE_ACTIVE,
          message: 'Bộ mẫu đang dùng — chọn bộ khác trước khi xoá',
        });
      }
      await tx.planGuideEmailTemplate.update({
        where: { id },
        data: { deletedAt: new Date(), updatedBy: actorUserId },
      });
      await this.record(tx, actorUserId, PLAN_GUIDE_TEMPLATE_AUDIT_ACTION.DELETE, id, { code: row.code }, null);
    });
  }

  // ── Xem trước / thư thử ───────────────────────────────────────────────────

  async preview(id: string, dto: PreviewPlanGuideTemplateDto): Promise<PlanGuideTemplatePreviewDto> {
    const row = await this.findOrThrow(this.prisma, id);
    const locale = (dto.locale as AppLocale | undefined) ?? DEFAULT_LOCALE;
    const variant = (dto.variant as PlanGuideVariant | undefined) ?? PLAN_GUIDE_VARIANT.WELCOME;
    const stored = row.variants.find((v) => v.variant === variant);
    // Bản nháp chưa lưu thay cho bản DB đúng ở nội dung + ngôn ngữ đang xem — không ghi gì.
    const content: PlanGuideTemplateContent = {
      subjectVi: locale === 'vi' && dto.subject !== undefined ? dto.subject : (stored?.subjectVi ?? ''),
      subjectEn: locale === 'en' && dto.subject !== undefined ? dto.subject : (stored?.subjectEn ?? ''),
      bodyVi: locale === 'vi' && dto.body !== undefined ? dto.body : (stored?.bodyVi ?? ''),
      bodyEn: locale === 'en' && dto.body !== undefined ? dto.body : (stored?.bodyEn ?? ''),
    };
    return this.renderSample(content, locale, planGuideSampleReason(variant));
  }

  /** Thư thử MỘT nội dung tới CHÍNH email admin, qua hàng đợi (không gửi trong request). */
  async sendTest(
    actorUserId: string,
    id: string,
    dto: SendTestPlanGuideTemplateDto,
  ): Promise<SendTestResultDto> {
    await this.findOrThrow(this.prisma, id);
    const actor = await this.prisma.user.findUnique({
      where: { id: actorUserId },
      select: { email: true, displayName: true },
    });
    const to = actor?.email?.trim();
    if (!to) {
      throw new BadRequestException({
        code: API_ERROR_CODE.PLAN_GUIDE_TEST_NO_EMAIL,
        message: 'Tài khoản chưa có email để nhận thư thử',
      });
    }
    const locale = (dto.locale as AppLocale | undefined) ?? DEFAULT_LOCALE;
    const variant = (dto.variant as PlanGuideVariant | undefined) ?? PLAN_GUIDE_VARIANT.WELCOME;
    const outboxId = newId();
    await this.prisma.$transaction(async (tx) => {
      const payload: PlanGuideEmailPayload = {
        reason: planGuideSampleReason(variant),
        displayName: actor?.displayName ?? SAMPLE.recipientName,
        shopName: SAMPLE.shopName,
        tenantId: null,
        subscriptionId: null,
        endsAt: new Date(Date.now() + SAMPLE.expiresInDays * 86_400_000).toISOString(),
        templateId: id,
        variant,
      };
      await tx.emailOutbox.create({
        data: {
          id: outboxId,
          kind: EMAIL_OUTBOX_KIND.PLAN_GUIDE_TEST,
          toEmail: to,
          locale,
          payloadJson: payload as unknown as Prisma.InputJsonValue,
          status: EMAIL_OUTBOX_STATUS.PENDING,
        },
      });
      await this.record(tx, actorUserId, PLAN_GUIDE_TEMPLATE_AUDIT_ACTION.SEND_TEST, id, null, {
        outboxId,
        locale,
        variant,
      });
    });
    return { to, outboxId };
  }

  // ── Dựng thư (dispatcher dùng) ────────────────────────────────────────────

  /**
   * Dựng thư CHÀO MỪNG chủ xe tuyến hoa hồng (`partner_welcome`) — phí theo chuyến đọc từ chính sách
   * ĐANG HIỆU LỰC lúc gửi (cùng nguồn với thư gói), không bảng giá gói.
   */
  async renderPartnerWelcome(locale: AppLocale, payload: PartnerWelcomeEmailPayload): Promise<RenderedEmail> {
    // CÙNG ngữ cảnh với thư gói: gói đang bán, % hai tuyến, link, hotline.
    const ctx = await this.renderContext();
    return renderPartnerWelcomeEmail({
      locale,
      displayName: payload.displayName,
      shopName: payload.shopName,
      freeTrips: FREE_TRIP_ALLOWANCE,
      commissionPercent: ctx.commissionPercent,
      packageCommissionPercent: ctx.packageCommissionPercent,
      planTableHtml: buildPlanTableHtml(ctx.plans, locale, 'outline', {
        purchaseUrl: ctx.purchaseUrl,
        contactUrl: ctx.contactUrl,
        assetBaseUrl: ctx.assetBaseUrl,
      }),
      purchaseUrl: ctx.purchaseUrl,
      listVehicleUrl: this.partnerUrl(PARTNER_VEHICLE_NEW_PATH),
      contactUrl: ctx.contactUrl,
      hotline: ctx.hotline,
    });
  }

  /**
   * Dựng một dòng outbox: thư thật dùng bộ ĐANG DÙNG lúc gửi và nội dung theo lý do
   * (`PLAN_GUIDE_REASON_VARIANT`); thư thử dùng bộ + nội dung chỉ định.
   * `null` ⇒ chưa có bộ/nội dung dùng được (dispatcher để thư nằm chờ, không gửi email trống).
   */
  async renderOutbox(
    kind: string,
    locale: AppLocale,
    payload: PlanGuideEmailPayload,
  ): Promise<RenderedEmail | null> {
    const isTest = kind === EMAIL_OUTBOX_KIND.PLAN_GUIDE_TEST;
    const template =
      isTest && payload.templateId
        ? await this.prisma.planGuideEmailTemplate.findFirst({
            where: { id: payload.templateId, deletedAt: null },
            select: FULL_SELECT,
          })
        : await this.prisma.planGuideEmailTemplate.findFirst({
            where: { isActive: true, deletedAt: null },
            select: FULL_SELECT,
          });
    if (!template) return null;
    const variant = isTest && payload.variant ? payload.variant : PLAN_GUIDE_REASON_VARIANT[payload.reason];
    const content = template.variants.find((v) => v.variant === variant);
    if (!content) return null;
    const ctx = await this.renderContext();
    const graceDays = payload.subscriptionId
      ? await this.subscriptionGraceDays(payload.subscriptionId)
      : undefined;
    return renderPlanGuideTemplate(content, {
      locale,
      reason: payload.reason,
      recipientName: payload.displayName,
      shopName: payload.shopName ?? null,
      expiresAt: payload.endsAt ? new Date(payload.endsAt) : null,
      ...ctx,
      // Thư gắn thuê bao: ân hạn của CHÍNH gói đó (`limits_json.graceDays`), không phải bậc đề xuất.
      ...(graceDays !== undefined ? { graceDays } : {}),
    });
  }

  /**
   * Danh mục gói ĐÚNG như hộp thoại "Mua / gia hạn gói" của web nhận (`listPlansForTenant`: tuyến gói,
   * đang bán, theo `sortOrder`) — kể cả bậc tư vấn. Lọc/sắp/dựng thẻ là việc của
   * `buildPlanPricingCards` (`@xeprime/domain`) trong renderer, chung với web.
   */
  async renderContext(): Promise<PlanGuideRenderContext> {
    // CHÍNH phương thức của `GET /subscription/plans` (hộp thoại web) — một truy vấn, không bản sao.
    const rows = await this.billing.listPlansForTenant();
    const plans: PlanGuidePlan[] = rows.map((row) => ({
      name: row.name,
      description: row.description,
      billingMode: row.billingMode,
      limits: row.limits,
    }));
    const contact = await this.appConfig.contact();
    // Phí mỗi chuyến: chính sách phí ĐANG HIỆU LỰC (cùng nguồn báo giá + /auth/me), qua luật tuyến
    // dùng chung. Chưa có bản nào ⇒ `null` ⇒ khối `{{#commissionPercent}}` ẩn, không in số bịa.
    const policy = await this.feePolicies.findEffective();
    const cards = buildPlanPricingCards(plans).filter((card) => card.selfServe);
    const guidePlan = cards[0]?.plan;
    return {
      reminderDays: SUBSCRIPTION_RENEWAL_REMINDER_DAYS,
      graceDays: guidePlan ? parsePlanLimits(guidePlan.limits).graceDays : null,
      commissionPercent: policy
        ? tripServiceFeePercent(BILLING_MODE.COMMISSION, policy.serviceFeePercent)
        : null,
      // Tuyến gói: luật tuyến cho 0 bất kể chính sách (ADR 0029 điều 2) — vẫn đi qua CÙNG hàm.
      packageCommissionPercent: tripServiceFeePercent(
        BILLING_MODE.PACKAGE,
        policy?.serviceFeePercent ?? 0,
      ),
      plans,
      purchaseUrl: this.partnerUrl(PARTNER_PLAN_PURCHASE_PATH),
      contactUrl: this.partnerUrl(PARTNER_SUPPORT_PATH),
      assetBaseUrl: `${this.config.getOrThrow<string>('APP_WEB_URL').replace(/\/+$/, '')}${EMAIL_ASSET_PATH}`,
      hotline: contact.hotline,
      zalo: contact.zalo,
    };
  }

  /** Ân hạn của gói mà thuê bao đang chạy; thuê bao không còn ⇒ `null` (khối ẩn). */
  private async subscriptionGraceDays(subscriptionId: string): Promise<number | null> {
    const sub = await this.prisma.tenantSubscription.findUnique({
      where: { id: subscriptionId },
      select: { plan: { select: { limitsJson: true } } },
    });
    return sub ? parsePlanLimits(sub.plan.limitsJson).graceDays : null;
  }

  /** Trang mua/gia hạn gói của site partner — dựng từ `WEB_PARTNER_URL` như mọi link email khác. */
  purchaseUrl(): string {
    return this.partnerUrl(PARTNER_PLAN_PURCHASE_PATH);
  }

  private partnerUrl(path: string): string {
    const base = this.config.getOrThrow<string>('WEB_PARTNER_URL').replace(/\/+$/, '');
    return `${base}${path}`;
  }

  private async renderSample(
    content: PlanGuideTemplateContent,
    locale: AppLocale,
    reason: PlanGuideReason,
  ): Promise<PlanGuideTemplatePreviewDto> {
    const ctx = await this.renderContext();
    return renderPlanGuideTemplate(content, {
      locale,
      reason,
      recipientName: SAMPLE.recipientName,
      shopName: SAMPLE.shopName,
      expiresAt: new Date(Date.now() + SAMPLE.expiresInDays * 86_400_000),
      ...ctx,
    });
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  private async findOrThrow(
    db: PrismaService | Prisma.TransactionClient,
    id: string,
  ): Promise<FullRow> {
    const row = await db.planGuideEmailTemplate.findFirst({
      where: { id, deletedAt: null },
      select: FULL_SELECT,
    });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy bộ mẫu email',
      });
    }
    row.variants.sort(byVariantOrder);
    return row;
  }

  private async withCodeGuard(run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: API_ERROR_CODE.PLAN_GUIDE_TEMPLATE_CODE_TAKEN,
          message: 'Mã bộ mẫu đã được dùng',
        });
      }
      throw err;
    }
  }

  private record(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    action: string,
    targetId: string,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    return this.audit.record(
      {
        actorUserId,
        actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
        action,
        targetType: AUDIT_TARGET_TYPE.PLAN_GUIDE_TEMPLATE,
        targetId,
        before,
        after,
      },
      tx,
    );
  }

  private async updaterNames(rows: readonly SummaryRow[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.updatedBy).filter((v): v is string => !!v))];
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }
}

function toSummary(row: SummaryRow, names: Map<string, string>): PlanGuideTemplateSummaryDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedBy ? (names.get(row.updatedBy) ?? null) : null,
  };
}

function toFull(row: FullRow, names: Map<string, string>): PlanGuideTemplateDto {
  return { ...toSummary(row, names), variants: row.variants.map((v) => ({ ...v })) };
}

function byVariantOrder(a: VariantRow, b: VariantRow): number {
  return (
    PLAN_GUIDE_VARIANT_VALUES.indexOf(a.variant as PlanGuideVariant) -
    PLAN_GUIDE_VARIANT_VALUES.indexOf(b.variant as PlanGuideVariant)
  );
}

/** Bộ mẫu mới phải có ĐỦ bốn nội dung, mỗi loại đúng một lần. */
function assertAllVariants(variants: readonly string[]): void {
  const set = new Set(variants);
  const missing = PLAN_GUIDE_VARIANT_VALUES.filter((v) => !set.has(v));
  if (missing.length > 0 || set.size !== variants.length) {
    throw new BadRequestException({
      code: API_ERROR_CODE.VALIDATION_FAILED,
      message: 'Bộ mẫu phải có đủ bốn nội dung, mỗi loại một lần',
      details: { missing },
    });
  }
}
