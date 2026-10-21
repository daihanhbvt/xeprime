import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  subscriptionTermStateOf,
  APPROVAL_TARGET_TYPE,
  BILLING_MODE,
  BOOKING_STATUS,
  BOOKING_STATUS_OCCUPYING,
  FEE_POLICY_STATUS,
  MEMBERSHIP_STATUS,
  PARTNER_COMMISSION_MONTHS,
  PARTNER_QUOTA_KIND,
  VEHICLE_QUOTA_KIND,
  PERMISSION,
  PLATFORM_PARTNER_KIND,
  PLAN_VEHICLE_SCOPE,
  QUOTA_LIMIT_REASON,
  SHOP_ONBOARDING_STATE,
  SUBSCRIPTION_INVOICE_PAYABLE_STATUSES,
  SUPPORT_CASE_STATUS,
  TENANT_STATUS,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_TYPE,
  type VehicleType,
  resolveActivePackageTerms,
  maskAccountNumber,
  missingPackageShopListingRequirements,
  parsePlanLimits,
  parsePlanQuota,
  resolveShopVerification,
  vehicleDocumentPresentation,
} from '@xeprime/types';
import { vnDateKey, vnMonthKey, vnMonthStartUtc } from '../../common/day-range';
import { marketplaceVehicleWhere } from '../../common/marketplace-vehicle-scope';
import { maskEmail, maskPhone } from '../../common/mask';
import {
  EFFECTIVE_SUBSCRIPTION_ARGS,
  effectiveSubscriptionWhere,
  resolveTenantFeatures,
} from '../../common/plan/feature-state';
import type { PlatformContext } from '../../common/types/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { BranchesService } from '../branches/branches.service';
import type {
  PartnerBillingDto,
  PartnerBranchDto,
  PartnerCommissionDto,
  PartnerCommissionMonthDto,
  PartnerFeePolicyDto,
  PartnerOverviewDto,
  PartnerOwnerDto,
  PartnerPlanSummaryDto,
  PartnerProfileDto,
  PartnerQuotaItemDto,
  PartnerVerificationEventDto,
} from './dto/platform-partner.dto';
import { scheduledTermsByTenant } from './plan-terms';
import type { PlanTermRefDto } from '../billing/dto/billing.dto';
import { canViewPartnerMoney, hasPlatformPermission, loadPartner } from './partner-scope';
import { PlatformPartnerOperationsService } from './platform-partner-operations.service';

/** Số dòng "gần đây" ở tab Tổng quan. */
const RECENT_LIMIT = 3;
/** Lịch sử gói/hoá đơn/xác minh hiện ở drawer — màn chuyên trách có danh sách đầy đủ. */
const HISTORY_LIMIT = 12;
/** Giấy tờ xe liệt kê ở tab Hồ sơ của chủ xe cá nhân (ít xe — trần là của gói Owner Lite). */
const VEHICLE_DOCUMENT_LIMIT = 50;
/** Hoá đơn còn nợ hết hạn trong số ngày này được coi là "sắp đến hạn". */
const INVOICE_DUE_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const OWNER_SELECT = {
  displayName: true,
  avatarUrl: true,
  phone: true,
  email: true,
  status: true,
  createdAt: true,
  phoneVerifiedAt: true,
  emailVerifiedAt: true,
} satisfies Prisma.UserSelect;

type OwnerRow = Prisma.UserGetPayload<{ select: typeof OWNER_SELECT }>;

const UNPAID_INVOICE_STATUSES: string[] = [...SUBSCRIPTION_INVOICE_PAYABLE_STATUSES];

const OPEN_SUPPORT_CASE_STATUSES: string[] = [
  SUPPORT_CASE_STATUS.OPEN,
  SUPPORT_CASE_STATUS.IN_PROGRESS,
  SUPPORT_CASE_STATUS.WAITING_PARTY,
];

/**
 * Hồ sơ, gói và tiền của MỘT đối tác cho drawer Platform Admin — CHỈ ĐỌC.
 *
 * PII chỉ ra khỏi server ở dạng đã che; tiền chỉ ra khi người gọi có `platform.money.manage`;
 * giấy tờ pháp lý chỉ liệt kê (không file) khi có `platform.sellers.verify`. Không hàm nào ở đây
 * ghi DB, mở phiên hỗ trợ, tạo membership hay đánh dấu `used_features`.
 */
@Injectable()
export class PlatformPartnerDetailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchesService,
    private readonly operations: PlatformPartnerOperationsService,
    private readonly billingService: BillingService,
  ) {}

  /* ───────────────────────────── Tổng quan ───────────────────────────── */

  async overview(tenantId: string, platform: PlatformContext): Promise<PartnerOverviewDto> {
    const now = new Date();
    const partner = await loadPartner(this.prisma, tenantId, now);
    const isPackage = partner.partnerKind === PLATFORM_PARTNER_KIND.PACKAGE_SHOP;

    const [tenant, verification, vehicleIds, listed, renting, lastActivity, branches, nextTerms] =
      await Promise.all([
        this.prisma.tenant.findUniqueOrThrow({
          where: { id: partner.tenantId },
          select: {
            id: true,
            code: true,
            name: true,
            slug: true,
            status: true,
            onboardingState: true,
            createdAt: true,
            profile: {
              select: { logoUrl: true, address: true, provinceName: true },
            },
            owner: { select: OWNER_SELECT },
            usedFeatures: true,
            subscriptions: {
              where: effectiveSubscriptionWhere(now),
              orderBy: EFFECTIVE_SUBSCRIPTION_ARGS.orderBy,
              take: EFFECTIVE_SUBSCRIPTION_ARGS.take,
              select: { ...EFFECTIVE_SUBSCRIPTION_ARGS.select, id: true, quotaJson: true },
            },
          },
        }),
        this.verificationOf(partner.tenantId),
        this.prisma.vehicle.findMany({
          where: { tenantId: partner.tenantId, deletedAt: null },
          select: { id: true, vehicleType: true },
        }),
        this.prisma.vehicle.count({
          where: { ...marketplaceVehicleWhere(), tenantId: partner.tenantId },
        }),
        this.prisma.vehicle.count({
          where: {
            tenantId: partner.tenantId,
            deletedAt: null,
            operationStatus: VEHICLE_OPERATION_STATUS.RENTING,
          },
        }),
        this.prisma.auditLog.findFirst({
          where: { tenantId: partner.tenantId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.branchesOf(partner.tenantId),
        scheduledTermsByTenant(this.prisma, [partner.tenantId], now),
      ]);

    /*
     * Cảnh báo xe là dữ liệu của miền XE: chỉ tính khi người xem có `platform.vehicles.view` (khối
     * cảnh báo dẫn sang tab Xe — người không vào được tab đó không được thấy phần tóm tắt của nó).
     *
     * Tính trên TOÀN đội xe: con số "cần chú ý" phải đúng cho cả gian hàng, không chỉ trang đầu.
     * `VehicleAlertsService` truy vấn theo lô (mỗi miền một câu), nên chi phí tăng theo số miền
     * chứ không theo số xe.
     */
    const canViewVehicles = hasPlatformPermission(platform, PERMISSION.PLATFORM_VEHICLE_VIEW);
    let alertSummary: { kind: string; severity: string; vehicleCount: number }[] | null = null;
    let vehiclesWithAlerts: number | null = null;
    if (canViewVehicles) {
      const alertsById = await this.operations.alertsFor(
        partner.tenantId,
        vehicleIds.map((v) => v.id),
      );
      const byKind = new Map<string, { kind: string; severity: string; vehicleCount: number }>();
      vehiclesWithAlerts = 0;
      for (const alerts of alertsById.values()) {
        if (alerts.length > 0) vehiclesWithAlerts += 1;
        for (const alert of alerts) {
          const entry = byKind.get(alert.kind) ?? { ...alert, vehicleCount: 0 };
          entry.vehicleCount += 1;
          byKind.set(alert.kind, entry);
        }
      }
      alertSummary = [...byKind.values()].sort((a, b) => b.vehicleCount - a.vehicleCount);
    }

    const defaultBranch = branches.find((b) => b.isDefault) ?? null;
    const [recentVehicles, recentBookings, vehicleQuota] = await Promise.all([
      canViewVehicles
        ? this.operations.vehiclesOf(partner, { limit: RECENT_LIMIT }).then((page) => page.data)
        : Promise.resolve(null),
      // "Đơn thuê gần đây" chỉ có ở Tổng quan của chủ xe cá nhân — gian hàng không tốn câu này.
      !isPackage && hasPlatformPermission(platform, PERMISSION.PLATFORM_BOOKING_VIEW)
        ? this.operations
            .bookingsOf(partner, { limit: RECENT_LIMIT }, platform)
            .then((page) => page.data)
        : Promise.resolve(null),
      // Trần xe đọc từ CHÍNH hàm mà cổng tạo xe gọi — không bao giờ nói khác con số bị chặn.
      isPackage
        ? this.billingService.fleetQuotaFor(partner.tenantId, now)
        : Promise.resolve(null),
    ]);

    return {
      identity: {
        id: tenant.id,
        code: tenant.code,
        name: tenant.name,
        slug: tenant.slug,
        partnerKind: partner.partnerKind,
        status: tenant.status,
        verification,
        onboardingState: tenant.onboardingState,
        logoUrl: tenant.profile?.logoUrl ?? null,
        createdAt: tenant.createdAt.toISOString(),
        storefrontAvailable: tenant.status === TENANT_STATUS.ACTIVE,
      },
      owner: toOwner(tenant.owner),
      counts: { vehicles: vehicleIds.length, listed, renting, vehiclesWithAlerts },
      alerts: alertSummary,
      operating: {
        verification,
        onboardingCompleted: isPackage
          ? tenant.onboardingState !== SHOP_ONBOARDING_STATE.PACKAGE_PENDING
          : null,
        listingRequirementsMissing: isPackage
          ? missingPackageShopListingRequirements({
              displayName: tenant.name,
              contactPhone: defaultBranch?.phone,
              provinceCode: defaultBranch?.provinceCode,
              addressLine: defaultBranch?.addressLine,
              logoUrl: tenant.profile?.logoUrl,
            })
          : null,
        lastActivityAt: lastActivity?.createdAt.toISOString() ?? null,
        areaNames: areaNamesOf(branches, tenant.profile?.provinceName ?? null),
        publicAddress: tenant.profile?.address ?? defaultBranch?.address ?? null,
      },
      plan:
        isPackage && vehicleQuota
          ? planSummaryOf(
              tenant.subscriptions,
              tenant.usedFeatures,
              vehicleQuota,
              usageByType(vehicleIds),
              now,
              nextTerms.get(partner.tenantId) ?? null,
            )
          : null,
      branches: isPackage ? branches.map(toBranch) : null,
      recentVehicles,
      recentBookings,
    };
  }

  /* ───────────────────────────── Hồ sơ ───────────────────────────── */

  async profile(tenantId: string, platform: PlatformContext): Promise<PartnerProfileDto> {
    const now = new Date();
    const partner = await loadPartner(this.prisma, tenantId, now);
    const isPackage = partner.partnerKind === PLATFORM_PARTNER_KIND.PACKAGE_SHOP;

    const [tenant, branches, history, documents, vehicleDocuments] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: partner.tenantId },
        select: {
          name: true,
          phone: true,
          email: true,
          profile: {
            select: {
              bio: true,
              logoUrl: true,
              coverUrl: true,
              address: true,
              provinceName: true,
              businessLicenseNo: true,
            },
          },
          owner: { select: OWNER_SELECT },
          sellerProfile: {
            select: {
              entityType: true,
              legalName: true,
              taxId: true,
              idNumber: true,
              status: true,
              verifiedAt: true,
            },
          },
        },
      }),
      this.branchesOf(partner.tenantId),
      this.verificationHistory(partner.tenantId),
      hasPlatformPermission(platform, PERMISSION.PLATFORM_SELLER_VERIFY)
        ? this.prisma.tenantDocument.findMany({
            where: { tenantId: partner.tenantId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: HISTORY_LIMIT,
            // KHÔNG chọn `fileUrl`: drawer không mở file giấy tờ — việc đó thuộc màn xác minh.
            select: {
              id: true,
              documentType: true,
              status: true,
              createdAt: true,
              reviewedAt: true,
            },
          })
        : Promise.resolve(null),
      !isPackage && hasPlatformPermission(platform, PERMISSION.PLATFORM_VEHICLE_VIEW)
        ? this.vehicleDocumentsOf(partner.tenantId, now)
        : Promise.resolve(null),
    ]);

    const seller = tenant.sellerProfile;
    return {
      publicProfile:
        isPackage && tenant.profile
          ? {
              displayName: tenant.name,
              bio: tenant.profile.bio,
              logoUrl: tenant.profile.logoUrl,
              coverUrl: tenant.profile.coverUrl,
              address: tenant.profile.address,
            }
          : null,
      owner: toOwner(tenant.owner),
      publicPhoneMasked: maskPhone(tenant.phone),
      publicEmailMasked: maskEmail(tenant.email),
      addresses: branches.map(toBranch),
      activityAreas: areaNamesOf(branches, tenant.profile?.provinceName ?? null),
      legal: isPackage
        ? {
            entityType: seller?.entityType ?? null,
            legalName: seller?.legalName ?? null,
            // Một nguồn (07/10/2026): bản sao trên hồ sơ gian hàng đã gỡ, không còn gì để dự phòng.
            taxIdMasked: maskOrNull(seller?.taxId ?? null),
            businessLicenseNoMasked: maskOrNull(tenant.profile?.businessLicenseNo ?? null),
            sellerStatus: seller?.status ?? null,
            verifiedAt: seller?.verifiedAt?.toISOString() ?? null,
          }
        : null,
      identity: isPackage
        ? null
        : {
            sellerStatus: seller?.status ?? null,
            idNumberMasked: maskOrNull(seller?.idNumber ?? null),
            verifiedAt: seller?.verifiedAt?.toISOString() ?? null,
            phoneVerified: tenant.owner?.phoneVerifiedAt != null,
            emailVerified: tenant.owner?.emailVerifiedAt != null,
          },
      documents:
        documents?.map((doc) => ({
          id: doc.id,
          documentType: doc.documentType,
          status: doc.status,
          createdAt: doc.createdAt.toISOString(),
          reviewedAt: doc.reviewedAt?.toISOString() ?? null,
        })) ?? null,
      vehicleDocuments,
      verificationHistory: history,
    };
  }

  /* ───────────────────────────── Gói & phí ───────────────────────────── */

  async billing(tenantId: string): Promise<PartnerBillingDto> {
    const now = new Date();
    const partner = await loadPartner(this.prisma, tenantId, now);

    const [
      tenant,
      vehiclesUsed,
      branchesUsed,
      membersUsed,
      feePolicy,
      invoices,
      subscriptions,
      nextTerms,
    ] = await Promise.all([
        this.prisma.tenant.findUniqueOrThrow({
          where: { id: partner.tenantId },
          select: {
            usedFeatures: true,
            subscriptions: {
              where: effectiveSubscriptionWhere(now),
              orderBy: EFFECTIVE_SUBSCRIPTION_ARGS.orderBy,
              take: EFFECTIVE_SUBSCRIPTION_ARGS.take,
              select: {
                ...EFFECTIVE_SUBSCRIPTION_ARGS.select,
                id: true,
                quotaJson: true,
                startsAt: true,
              },
            },
          },
        }),
        this.prisma.vehicle.findMany({
          where: { tenantId: partner.tenantId, deletedAt: null },
          select: { vehicleType: true },
        }),
        this.prisma.tenantBranch.count({ where: { tenantId: partner.tenantId, deletedAt: null } }),
        this.prisma.tenantMembership.count({
          where: { tenantId: partner.tenantId, status: MEMBERSHIP_STATUS.ACTIVE },
        }),
        this.activeFeePolicy(),
        this.prisma.subscriptionInvoice.findMany({
          where: { tenantId: partner.tenantId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: HISTORY_LIMIT,
          select: {
            id: true,
            code: true,
            periodFrom: true,
            periodTo: true,
            totalAmount: true,
            paidAmount: true,
            status: true,
            paidAt: true,
            expiresAt: true,
          },
        }),
        this.prisma.tenantSubscription.findMany({
          where: { tenantId: partner.tenantId },
          orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
          take: HISTORY_LIMIT,
          select: {
            id: true,
            price: true,
            termMonths: true,
            status: true,
            billingMode: true,
            vehicleScope: true,
            startsAt: true,
            endsAt: true,
            plan: { select: { name: true, code: true } },
          },
        }),
        scheduledTermsByTenant(this.prisma, [partner.tenantId], now),
      ]);

    // Đếm hoá đơn còn nợ trên TOÀN bộ, không chỉ 12 dòng lịch sử đang hiện.
    const unpaid = await this.prisma.subscriptionInvoice.findMany({
      where: { tenantId: partner.tenantId, status: { in: UNPAID_INVOICE_STATUSES } },
      select: { expiresAt: true },
    });
    const soon = now.getTime() + INVOICE_DUE_SOON_DAYS * DAY_MS;
    const upcomingDue = unpaid
      .map((inv) => inv.expiresAt)
      .filter((at): at is Date => at != null && at.getTime() >= now.getTime())
      .sort((a, b) => a.getTime() - b.getTime());

    /*
     * Trần xe đọc từ CHÍNH hàm mà cổng tạo xe gọi — màn này
     * không được nói một con số khác với con số backend thật sự chặn (vd. gian hàng hết gói bị
     * chặn ở trần Owner Lite, không phải "không giới hạn").
     */
    const vehicleQuota = await this.billingService.fleetQuotaFor(partner.tenantId, now);
    const rows = tenant.subscriptions;
    const usage = usageByType(vehiclesUsed);
    const vehicles = fleetQuotaItem(vehicleQuota, usage);
    const nextTerm = nextTerms.get(partner.tenantId) ?? null;
    const plan = planSummaryOf(rows, tenant.usedFeatures, vehicleQuota, usage, now, nextTerm);
    const context = resolveTenantFeatures(rows, tenant.usedFeatures, now);
    // Kỳ ưu tiên (ADR 0065: `all` → ô tô → xe máy), rồi dòng hiệu lực gần nhất.
    const row = resolveActivePackageTerms(rows, now)[0]?.row ?? rows[0] ?? null;
    const onPackage = context.billingMode === BILLING_MODE.PACKAGE;
    // Trần nhân sự chỉ được GHI trên gói (chưa cổng nào cưỡng chế) — snapshot trước, chọn TƯỜNG
    // MINH (ADR 0041 điều 3), không `??`.
    const snapshot = row ? parsePlanQuota(row.quotaJson) : null;
    const memberLimit =
      onPackage && row
        ? snapshot
          ? snapshot.maxMembers
          : parsePlanLimits(row.plan.limitsJson).maxMembers
        : null;
    const notApplicable = (used: number): PartnerQuotaItemDto => ({
      used,
      kind: PARTNER_QUOTA_KIND.NOT_APPLICABLE,
      limit: null,
      reason: null,
    });

    return {
      plan,
      termStartsAt: row?.startsAt.toISOString() ?? null,
      quota: {
        vehicles,
        vehiclesByType: {
          car: typeQuotaItem(vehicleQuota[VEHICLE_TYPE.CAR], usage),
          motorbike: typeQuotaItem(vehicleQuota[VEHICLE_TYPE.MOTORBIKE], usage),
        },
        // Không còn trần chi nhánh theo gói (ADR 0065 điều 1): tuyến gói = không giới hạn; tuyến
        // hoa hồng không có khái niệm này (nhiều chi nhánh là cờ năng lực của gói).
        branches: onPackage ? limitItem(branchesUsed, null) : notApplicable(branchesUsed),
        members: onPackage ? limitItem(membersUsed, memberLimit) : notApplicable(membersUsed),
      },
      features: Object.entries(context.features).map(([feature, state]) => ({ feature, state })),
      feePolicy,
      invoiceStatus: {
        unpaid: unpaid.length,
        dueSoon: upcomingDue.filter((at) => at.getTime() <= soon).length,
        overdue: unpaid.filter((inv) => inv.expiresAt && inv.expiresAt.getTime() < now.getTime())
          .length,
        nextDueAt: upcomingDue[0]?.toISOString() ?? null,
      },
      subscriptions: subscriptions.map((sub) => ({
        id: sub.id,
        planName: sub.plan.name,
        planCode: sub.plan.code,
        vehicleScope: sub.vehicleScope,
        billingMode: sub.billingMode,
        price: sub.price.toFixed(2),
        termMonths: sub.termMonths,
        status: sub.status,
        // Đồng hồ SERVER — xem `SubscriptionDto.termState`.
        termState: subscriptionTermStateOf(sub, now),
        startsAt: sub.startsAt.toISOString(),
        endsAt: sub.endsAt.toISOString(),
      })),
      invoices: invoices.map((inv) => ({
        id: inv.id,
        code: inv.code,
        periodFrom: inv.periodFrom.toISOString(),
        periodTo: inv.periodTo.toISOString(),
        totalAmount: inv.totalAmount.toFixed(2),
        paidAmount: inv.paidAmount.toFixed(2),
        status: inv.status,
        paidAt: inv.paidAt?.toISOString() ?? null,
        expiresAt: inv.expiresAt?.toISOString() ?? null,
      })),
    };
  }

  /* ───────────────────────────── Hoa hồng & đối soát ───────────────────────────── */

  /**
   * Phí dịch vụ theo chuyến và số liệu theo THÁNG của chủ xe tuyến hoa hồng.
   *
   * Nền tảng CHƯA có khái niệm "kỳ đối soát" chốt sổ (không bảng, không trạng thái chi trả) — nên
   * ở đây chỉ có số liệu gộp từ các cột đã ĐÓNG BĂNG trên đơn (`total_amount`, `service_fee_amount`,
   * `tax_amount` — ADR 0024), nhóm theo tháng hoàn tất chuyến. Không dựng "đã thanh toán / đang đối
   * soát" hay "dự kiến thực nhận": các con số đó không có nguồn, và bịa ra chúng là nói sai về tiền.
   * Không đọc ví, lệnh rút, tài khoản ngân hàng.
   */
  async commission(tenantId: string, platform: PlatformContext): Promise<PartnerCommissionDto> {
    const now = new Date();
    const partner = await loadPartner(this.prisma, tenantId, now);
    const amountsVisible = canViewPartnerMoney(platform);
    const windowStart = vnMonthStartUtc(now, PARTNER_COMMISSION_MONTHS - 1);

    const [feePolicy, openBookings, openDisputes, completed] = await Promise.all([
      this.activeFeePolicy(),
      this.prisma.booking.count({
        where: {
          tenantId: partner.tenantId,
          deletedAt: null,
          status: { in: [...BOOKING_STATUS_OCCUPYING] },
        },
      }),
      this.prisma.supportCase.count({
        where: { tenantId: partner.tenantId, status: { in: OPEN_SUPPORT_CASE_STATUSES } },
      }),
      this.prisma.booking.findMany({
        where: {
          tenantId: partner.tenantId,
          deletedAt: null,
          status: BOOKING_STATUS.COMPLETED,
          OR: [
            { actualReturnAt: { gte: windowStart } },
            { actualReturnAt: null, returnAt: { gte: windowStart } },
          ],
        },
        select: {
          actualReturnAt: true,
          returnAt: true,
          totalAmount: true,
          serviceFeeAmount: true,
          taxAmount: true,
        },
      }),
    ]);

    const currentKey = vnMonthKey(now);
    const buckets = new Map<
      string,
      { count: number; revenue: Prisma.Decimal; fee: Prisma.Decimal; tax: Prisma.Decimal }
    >();
    for (let back = 0; back < PARTNER_COMMISSION_MONTHS; back += 1) {
      buckets.set(vnMonthKey(vnMonthStartUtc(now, back)), {
        count: 0,
        revenue: new Prisma.Decimal(0),
        fee: new Prisma.Decimal(0),
        tax: new Prisma.Decimal(0),
      });
    }
    for (const booking of completed) {
      const bucket = buckets.get(vnMonthKey(booking.actualReturnAt ?? booking.returnAt));
      if (!bucket) continue;
      bucket.count += 1;
      bucket.revenue = bucket.revenue.add(booking.totalAmount);
      bucket.fee = bucket.fee.add(booking.serviceFeeAmount);
      bucket.tax = bucket.tax.add(booking.taxAmount);
    }

    const months: PartnerCommissionMonthDto[] = [...buckets.entries()].map(([period, bucket]) => ({
      period,
      closed: period !== currentKey,
      completedCount: bucket.count,
      revenue: amountsVisible ? bucket.revenue.toFixed(2) : null,
      serviceFee: amountsVisible ? bucket.fee.toFixed(2) : null,
      tax: amountsVisible ? bucket.tax.toFixed(2) : null,
    }));

    return { feePolicy, amountsVisible, openBookings, openDisputes, months };
  }

  /* ───────────────────────────── helpers ───────────────────────────── */

  private async branchesOf(tenantId: string) {
    const list = await this.branches.list(tenantId, {}, null); // admin nền tảng xem trọn gian hàng
    return list.items;
  }

  /**
   * Trạng thái xác minh gian hàng — suy từ phiếu duyệt `tenant` MỚI NHẤT, đúng luật
   * `resolveShopVerification` mà màn gian hàng dùng.
   */
  private async verificationOf(tenantId: string): Promise<string> {
    const latest = await this.prisma.approvalTask.findFirst({
      where: { tenantId, targetType: APPROVAL_TARGET_TYPE.TENANT },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      select: { status: true },
    });
    return resolveShopVerification(latest?.status);
  }

  private async verificationHistory(tenantId: string): Promise<PartnerVerificationEventDto[]> {
    const logs = await this.prisma.approvalLog.findMany({
      where: {
        task: {
          tenantId,
          targetType: { in: [APPROVAL_TARGET_TYPE.TENANT, APPROVAL_TARGET_TYPE.SELLER_PROFILE] },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: HISTORY_LIMIT,
      // KHÔNG chọn `note`: ghi chú duyệt có thể chứa số giấy tờ/PII — đọc ở màn xác minh.
      select: {
        createdAt: true,
        toStatus: true,
        task: { select: { targetType: true } },
        actor: { select: { displayName: true } },
      },
    });
    return logs.map((log) => ({
      at: log.createdAt.toISOString(),
      subject: log.task.targetType,
      toStatus: log.toStatus,
      actorName: log.actor.displayName,
    }));
  }

  private async vehicleDocumentsOf(tenantId: string, now: Date) {
    const today = vnDateKey(now);
    const rows = await this.prisma.vehicleDocument.findMany({
      where: { tenantId, archivedAt: null, vehicle: { deletedAt: null } },
      orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      take: VEHICLE_DOCUMENT_LIMIT,
      // KHÔNG chọn số giấy tờ, số khung/máy, người đứng tên hay file — chỉ loại và hạn.
      select: {
        id: true,
        type: true,
        expiresAt: true,
        activeVersionId: true,
        vehicle: { select: { name: true, plateNumber: true } },
      },
    });
    return rows.map((row) => {
      const expiresAt = row.expiresAt ? row.expiresAt.toISOString().slice(0, 10) : null;
      return {
        id: row.id,
        vehicleName: row.vehicle.name,
        vehiclePlateNumber: row.vehicle.plateNumber,
        type: row.type,
        // Không truyền ngưỡng nhắc: ngưỡng là cấu hình riêng của gian hàng, và drawer không suy
        // "sắp hết hạn" bằng một con số ngầm — chỉ còn hạn / hết hạn / thiếu bản.
        presentation: vehicleDocumentPresentation({
          hasActiveVersion: row.activeVersionId != null,
          expiresAt,
          warningDays: null,
          today,
        }),
        expiresAt,
      };
    });
  }

  private async activeFeePolicy(): Promise<PartnerFeePolicyDto | null> {
    const row = await this.prisma.feePolicy.findFirst({
      where: { status: FEE_POLICY_STATUS.ACTIVE },
      select: { serviceFeePercent: true, version: true, effectiveFrom: true },
    });
    return row
      ? {
          serviceFeePercent: row.serviceFeePercent.toFixed(2),
          version: row.version,
          effectiveFrom: row.effectiveFrom?.toISOString() ?? null,
        }
      : null;
  }
}

type BranchItem = Awaited<ReturnType<BranchesService['list']>>['items'][number];

function toBranch(branch: BranchItem): PartnerBranchDto {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    isDefault: branch.isDefault,
    status: branch.status,
    vehicleCount: branch.vehicleCount,
  };
}

function toOwner(owner: OwnerRow | null): PartnerOwnerDto {
  return {
    name: owner?.displayName ?? null,
    avatarUrl: owner?.avatarUrl ?? null,
    phoneMasked: maskPhone(owner?.phone ?? null),
    emailMasked: maskEmail(owner?.email ?? null),
    accountStatus: owner?.status ?? null,
    joinedAt: owner?.createdAt.toISOString() ?? null,
  };
}

function areaNamesOf(branches: BranchItem[], profileProvince: string | null): string[] {
  const names = branches.map((b) => b.provinceName).filter((n): n is string => Boolean(n));
  if (profileProvince) names.push(profileProvince);
  return [...new Set(names)];
}

function maskOrNull(value: string | null): string | null {
  return value ? maskAccountNumber(value) : null;
}

type FleetQuota = Awaited<ReturnType<BillingService['fleetQuotaFor']>>;
type TypeQuota = FleetQuota[VehicleType];
type UsageByType = Record<VehicleType, number>;

function usageByType(vehicles: readonly { vehicleType: string }[]): UsageByType {
  const usage = { [VEHICLE_TYPE.CAR]: 0, [VEHICLE_TYPE.MOTORBIKE]: 0 } as UsageByType;
  for (const v of vehicles) {
    if (v.vehicleType in usage) usage[v.vehicleType as VehicleType] += 1;
  }
  return usage;
}

/** Số xe đếm vào trần của một loại — trần `all` (bậc doanh nghiệp, Owner Lite) đếm GỘP hai loại. */
function usedWithin(quota: TypeQuota, type: VehicleType, usage: UsageByType): number {
  return quota.countedScope === PLAN_VEHICLE_SCOPE.ALL
    ? usage[VEHICLE_TYPE.CAR] + usage[VEHICLE_TYPE.MOTORBIKE]
    : usage[type];
}

/**
 * Trần xe ĐANG CƯỠNG CHẾ cho MỘT loại xe → hình dạng hiển thị (ADR 0065). Loại xe chưa có gói ở
 * gian hàng tuyến gói là `not_covered` — cổng tạo xe trả `PLAN_SCOPE_REQUIRED`.
 */
function typeQuotaItem(quota: TypeQuota, usage: UsageByType): PartnerQuotaItemDto {
  const type = quota.countedScope === PLAN_VEHICLE_SCOPE.MOTORBIKE ? VEHICLE_TYPE.MOTORBIKE : VEHICLE_TYPE.CAR;
  const used = usedWithin(quota, type, usage);
  if (quota.kind === VEHICLE_QUOTA_KIND.SCOPE_REQUIRED) {
    return { used, kind: PARTNER_QUOTA_KIND.NOT_COVERED, limit: null, reason: null };
  }
  return quota.kind === VEHICLE_QUOTA_KIND.TOTAL
    ? { used, kind: PARTNER_QUOTA_KIND.TOTAL, limit: quota.limit, reason: quota.reason }
    : { used, kind: PARTNER_QUOTA_KIND.UNLIMITED, limit: null, reason: null };
}

/**
 * Trần xe GỘP của cả gian hàng (hình dạng trước ADR 0065): tổng trần các kỳ gói phủ hai loại xe
 * (một kỳ `all` chỉ tính một lần), có loại không giới hạn ⇒ không giới hạn. Ngoài tuyến gói: trần
 * Owner Lite TỔNG như cũ. Chi tiết theo loại là `vehiclesByType`/`vehicleQuotaByType`.
 */
function fleetQuotaItem(quota: FleetQuota, usage: UsageByType): PartnerQuotaItemDto {
  const used = usage[VEHICLE_TYPE.CAR] + usage[VEHICLE_TYPE.MOTORBIKE];
  const list = [quota[VEHICLE_TYPE.CAR], quota[VEHICLE_TYPE.MOTORBIKE]];
  if (list.some((q) => q.kind === VEHICLE_QUOTA_KIND.UNLIMITED)) {
    return { used, kind: PARTNER_QUOTA_KIND.UNLIMITED, limit: null, reason: null };
  }
  const car = quota[VEHICLE_TYPE.CAR];
  if (car.reason !== null && car.reason !== QUOTA_LIMIT_REASON.PLAN) {
    return { used, kind: PARTNER_QUOTA_KIND.TOTAL, limit: car.limit, reason: car.reason };
  }
  const seen = new Set<string>();
  let limit = 0;
  for (const q of list) {
    if (q.kind !== VEHICLE_QUOTA_KIND.TOTAL || q.limit === null || !q.subscriptionId || seen.has(q.subscriptionId)) {
      continue;
    }
    seen.add(q.subscriptionId);
    limit += q.limit;
  }
  return { used, kind: PARTNER_QUOTA_KIND.TOTAL, limit, reason: QUOTA_LIMIT_REASON.PLAN };
}

/** Trần của một bậc gói — `null` là bậc không giới hạn (chỉ gọi khi tenant ĐANG ở tuyến gói). */
function limitItem(used: number, limit: number | null): PartnerQuotaItemDto {
  return limit == null
    ? { used, kind: PARTNER_QUOTA_KIND.UNLIMITED, limit: null, reason: null }
    : { used, kind: PARTNER_QUOTA_KIND.TOTAL, limit, reason: QUOTA_LIMIT_REASON.PLAN };
}

function planSummaryOf(
  rows: readonly {
    billingMode: string | null;
    endsAt: Date;
    vehicleScope: string;
    quotaJson: Prisma.JsonValue;
    plan: { code: string; name: string; limitsJson: Prisma.JsonValue };
  }[],
  usedFeatures: string[],
  vehicleQuota: FleetQuota,
  usage: UsageByType,
  now: Date,
  nextTerm: PlanTermRefDto | null,
): PartnerPlanSummaryDto {
  const context = resolveTenantFeatures(rows, usedFeatures, now);
  return {
    planName: context.planName,
    planCode: context.planCode,
    phase: context.phase,
    billingMode: context.billingMode,
    endsAt: context.planEndsAt?.toISOString() ?? null,
    graceEndsAt: context.graceEndsAt?.toISOString() ?? null,
    packageScopes: context.packageScopes,
    vehicleQuota: fleetQuotaItem(vehicleQuota, usage),
    vehicleQuotaByType: {
      car: typeQuotaItem(vehicleQuota[VEHICLE_TYPE.CAR], usage),
      motorbike: typeQuotaItem(vehicleQuota[VEHICLE_TYPE.MOTORBIKE], usage),
    },
    nextTerm,
  };
}
