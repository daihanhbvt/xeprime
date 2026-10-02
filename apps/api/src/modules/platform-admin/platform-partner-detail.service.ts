import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  APPROVAL_TARGET_TYPE,
  BILLING_MODE,
  BOOKING_STATUS,
  BOOKING_STATUS_OCCUPYING,
  FEE_POLICY_STATUS,
  MEMBERSHIP_STATUS,
  PARTNER_COMMISSION_MONTHS,
  PARTNER_QUOTA_KIND,
  PERMISSION,
  PLATFORM_PARTNER_KIND,
  QUOTA_LIMIT_REASON,
  SHOP_ONBOARDING_STATE,
  SUBSCRIPTION_INVOICE_STATUS,
  SUPPORT_CASE_STATUS,
  TENANT_STATUS,
  VEHICLE_OPERATION_STATUS,
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

const UNPAID_INVOICE_STATUSES: string[] = [
  SUBSCRIPTION_INVOICE_STATUS.ISSUED,
  SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
];

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

    const [tenant, verification, vehicleIds, listed, renting, lastActivity, branches] =
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
              select: { displayName: true, logoUrl: true, address: true, provinceName: true },
            },
            owner: { select: OWNER_SELECT },
            usedFeatures: true,
            subscriptions: {
              where: effectiveSubscriptionWhere(now),
              orderBy: EFFECTIVE_SUBSCRIPTION_ARGS.orderBy,
              take: 1,
              select: { ...EFFECTIVE_SUBSCRIPTION_ARGS.select, quotaJson: true },
            },
          },
        }),
        this.verificationOf(partner.tenantId),
        this.prisma.vehicle.findMany({
          where: { tenantId: partner.tenantId, deletedAt: null },
          select: { id: true },
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
        ? this.billingService.vehicleQuotaFor(partner.tenantId, now)
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
              displayName: tenant.profile?.displayName,
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
              tenant.subscriptions[0] ?? null,
              tenant.usedFeatures,
              vehicleQuotaItem(vehicleQuota, vehicleIds.length),
              now,
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
          phone: true,
          email: true,
          profile: {
            select: {
              displayName: true,
              bio: true,
              logoUrl: true,
              coverUrl: true,
              address: true,
              provinceName: true,
              taxCode: true,
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
              displayName: tenant.profile.displayName,
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
            taxIdMasked: maskOrNull(seller?.taxId ?? tenant.profile?.taxCode ?? null),
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

    const [tenant, vehiclesUsed, branchesUsed, membersUsed, feePolicy, invoices, subscriptions] =
      await Promise.all([
        this.prisma.tenant.findUniqueOrThrow({
          where: { id: partner.tenantId },
          select: {
            usedFeatures: true,
            subscriptions: {
              where: effectiveSubscriptionWhere(now),
              orderBy: EFFECTIVE_SUBSCRIPTION_ARGS.orderBy,
              take: 1,
              select: { ...EFFECTIVE_SUBSCRIPTION_ARGS.select, quotaJson: true, startsAt: true },
            },
          },
        }),
        this.prisma.vehicle.count({ where: { tenantId: partner.tenantId, deletedAt: null } }),
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
            startsAt: true,
            endsAt: true,
            plan: { select: { name: true, code: true } },
          },
        }),
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
     * Trần xe và chi nhánh đọc từ CHÍNH hai hàm mà cổng tạo xe / tạo chi nhánh gọi — màn này
     * không được nói một con số khác với con số backend thật sự chặn (vd. gian hàng hết gói bị
     * chặn ở trần Owner Lite, không phải "không giới hạn").
     */
    const [vehicleQuota, branchLimit] = await Promise.all([
      this.billingService.vehicleQuotaFor(partner.tenantId, now),
      this.billingService.branchQuotaFor(partner.tenantId, now),
    ]);
    const row = tenant.subscriptions[0] ?? null;
    const vehicles = vehicleQuotaItem(vehicleQuota, vehiclesUsed);
    const plan = planSummaryOf(row, tenant.usedFeatures, vehicles, now);
    const context = resolveTenantFeatures(row, tenant.usedFeatures, now);
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
        // `branchQuotaFor` trả `null` cho HAI nghĩa: tuyến gói không trần, hoặc tuyến không có khái
        // niệm trần chi nhánh (nhiều chi nhánh là cờ năng lực của gói) — tách bằng tuyến hiệu lực.
        branches: onPackage ? limitItem(branchesUsed, branchLimit) : notApplicable(branchesUsed),
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
        billingMode: sub.billingMode,
        price: sub.price.toFixed(2),
        termMonths: sub.termMonths,
        status: sub.status,
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

type VehicleQuota = Awaited<ReturnType<BillingService['vehicleQuotaFor']>>;

/** Trần xe ĐANG CƯỠNG CHẾ → hình dạng hiển thị, giữ nguyên lý do (gói / Owner Lite / chưa cấu hình). */
function vehicleQuotaItem(quota: VehicleQuota, used: number): PartnerQuotaItemDto {
  return quota.kind === 'total'
    ? { used, kind: PARTNER_QUOTA_KIND.TOTAL, limit: quota.limit, reason: quota.reason }
    : { used, kind: PARTNER_QUOTA_KIND.UNLIMITED, limit: null, reason: null };
}

/** Trần của một bậc gói — `null` là bậc không giới hạn (chỉ gọi khi tenant ĐANG ở tuyến gói). */
function limitItem(used: number, limit: number | null): PartnerQuotaItemDto {
  return limit == null
    ? { used, kind: PARTNER_QUOTA_KIND.UNLIMITED, limit: null, reason: null }
    : { used, kind: PARTNER_QUOTA_KIND.TOTAL, limit, reason: QUOTA_LIMIT_REASON.PLAN };
}

function planSummaryOf(
  row: {
    billingMode: string | null;
    endsAt: Date;
    quotaJson: Prisma.JsonValue;
    plan: { code: string; name: string; limitsJson: Prisma.JsonValue };
  } | null,
  usedFeatures: string[],
  vehicleQuota: PartnerQuotaItemDto,
  now: Date,
): PartnerPlanSummaryDto {
  const context = resolveTenantFeatures(row, usedFeatures, now);
  return {
    planName: context.planName,
    planCode: context.planCode,
    phase: context.phase,
    billingMode: context.billingMode,
    endsAt: context.planEndsAt?.toISOString() ?? null,
    graceEndsAt: context.graceEndsAt?.toISOString() ?? null,
    vehicleQuota,
  };
}
