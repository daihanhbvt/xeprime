import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  SELLER_ENTITY_TYPE,
  TAX_WITHHOLDING_STATUS,
  TAX_WITHHOLDING_STATUS_UNPAID,
  taxPeriodKeyVn,
  type PaginationMeta,
  type SellerEntityType,
  type TaxWithholdingStatus,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TAX_DEFAULT_LIMIT,
  TAX_MAX_LIMIT,
  type TaxPeriodSummaryDto,
  type TaxRowDto,
  type TaxRowsQueryDto,
  type TenantTaxSummaryDto,
} from './dto/tax.dto';

const ROW_SELECT = {
  id: true,
  bookingId: true,
  tenantId: true,
  taxableBase: true,
  percent: true,
  label: true,
  amount: true,
  status: true,
  periodKey: true,
  accruedAt: true,
  declaredAt: true,
  remittedAt: true,
  reversalOfId: true,
  reversalReason: true,
  booking: { select: { code: true } },
  tenant: { select: { name: true } },
  sellerProfile: { select: { entityType: true, taxId: true, legalName: true } },
} satisfies Prisma.TaxWithholdingSelect;

/**
 * ĐỌC sổ thuế — tách khỏi `TaxService` để writer giữ đúng một trách nhiệm (cùng khuôn
 * `InsuranceReadService` / `WalletReadService`).
 *
 * ## Vì sao mọi tổng đều là `SUM(amount)`
 *
 * Dòng đảo mang số ÂM (CHECK ở DB canh), nên một kỳ có sửa sai vẫn cộng ra đúng nghĩa vụ thật
 * mà không cần một cây `if` theo trạng thái. Đó là lý do bút toán đảo được thiết kế âm thay vì
 * chỉ đánh dấu trạng thái.
 */
@Injectable()
export class TaxReadService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tờ khai một KỲ: tổng, chia theo LOẠI CHỦ THỂ, và chia theo gian hàng.
   *
   * Chia theo `entityType` là yêu cầu nghiệp vụ thật, không phải trang trí: cá nhân, hộ kinh
   * doanh và doanh nghiệp có nghĩa vụ khác nhau và đi vào những tờ khai khác nhau. Nhóm
   * `unknown` là gian hàng CHƯA khai hồ sơ người bán — nó phải hiện ra chứ không bị gộp vào
   * "cá nhân", vì gộp là đoán hộ họ một nghĩa vụ pháp lý.
   */
  async periodSummary(periodKey: string): Promise<TaxPeriodSummaryDto> {
    const [totals, byStatus, byEntity, byTenant] = await Promise.all([
      this.prisma.taxWithholding.aggregate({
        where: { periodKey },
        _sum: { amount: true, taxableBase: true },
        _count: { _all: true },
      }),
      this.prisma.taxWithholding.groupBy({
        by: ['status'],
        where: { periodKey },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      /*
       * `groupBy` của Prisma không đi qua quan hệ, nên phần chia theo loại chủ thể viết SQL.
       * `LEFT JOIN` + `COALESCE(..., 'unknown')`: gian hàng chưa khai hồ sơ vẫn phải xuất hiện.
       */
      this.prisma.$queryRaw<Array<{ entityType: string; amount: Prisma.Decimal; rows: bigint }>>`
        SELECT COALESCE(sp.entity_type, 'unknown') AS "entityType",
               COALESCE(SUM(tw.amount), 0)        AS amount,
               COUNT(*)                            AS rows
          FROM tax_withholdings tw
          LEFT JOIN seller_profiles sp ON sp.id = tw.seller_profile_id
         WHERE tw.period_key = ${periodKey}
         GROUP BY COALESCE(sp.entity_type, 'unknown')
         ORDER BY amount DESC
      `,
      this.prisma.$queryRaw<
        Array<{
          tenantId: string;
          tenantName: string;
          entityType: string | null;
          taxCode: string | null;
          amount: Prisma.Decimal;
          rows: bigint;
        }>
      >`
        SELECT tw.tenant_id            AS "tenantId",
               t.name                  AS "tenantName",
               sp.entity_type          AS "entityType",
               sp.tax_id               AS "taxCode",
               COALESCE(SUM(tw.amount), 0) AS amount,
               COUNT(*)                AS rows
          FROM tax_withholdings tw
          JOIN tenants t ON t.id = tw.tenant_id
          LEFT JOIN seller_profiles sp ON sp.id = tw.seller_profile_id
         WHERE tw.period_key = ${periodKey}
         GROUP BY tw.tenant_id, t.name, sp.entity_type, sp.tax_id
         ORDER BY amount DESC
      `,
    ]);

    const zero = new Prisma.Decimal(0);
    const statusOf = (status: TaxWithholdingStatus) =>
      byStatus.find((s) => s.status === status)?._sum.amount ?? zero;

    return {
      periodKey,
      totalAmount: (totals._sum.amount ?? zero).toFixed(0),
      totalTaxableBase: (totals._sum.taxableBase ?? zero).toFixed(0),
      rows: totals._count._all,
      accruedAmount: statusOf(TAX_WITHHOLDING_STATUS.ACCRUED).toFixed(0),
      declaredAmount: statusOf(TAX_WITHHOLDING_STATUS.DECLARED).toFixed(0),
      remittedAmount: statusOf(TAX_WITHHOLDING_STATUS.REMITTED).toFixed(0),
      byEntityType: byEntity.map((r) => ({
        entityType: normalizeEntityType(r.entityType),
        amount: new Prisma.Decimal(r.amount).toFixed(0),
        rows: Number(r.rows),
      })),
      byTenant: byTenant.map((r) => ({
        tenantId: r.tenantId,
        tenantName: r.tenantName,
        entityType: r.entityType === null ? null : normalizeEntityType(r.entityType),
        taxCode: r.taxCode,
        amount: new Prisma.Decimal(r.amount).toFixed(0),
        rows: Number(r.rows),
      })),
    };
  }

  async rows(
    query: TaxRowsQueryDto,
  ): Promise<{ data: TaxRowDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, TAX_DEFAULT_LIMIT, TAX_MAX_LIMIT);
    const where: Prisma.TaxWithholdingWhereInput = {
      ...(query.period ? { periodKey: query.period } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.taxWithholding.findMany({
        where,
        select: ROW_SELECT,
        orderBy: [{ accruedAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
      }),
      this.prisma.taxWithholding.count({ where }),
    ]);

    return { data: rows.map(toRowDto), meta: paginationMeta(paging, total) };
  }

  /**
   * CSV của một kỳ — đúng những cột người làm tờ khai cần dán vào biểu mẫu.
   *
   * Xuất ở server thay vì dựng ở client: dữ liệu của một kỳ có thể vài nghìn dòng, và tải hết
   * về trình duyệt chỉ để ghép chuỗi là cách chắc chắn để màn hình treo ở kỳ đầu tiên đông đơn.
   */
  async periodCsv(periodKey: string): Promise<string> {
    const rows = await this.prisma.taxWithholding.findMany({
      where: { periodKey },
      select: ROW_SELECT,
      orderBy: [{ accruedAt: 'asc' }, { id: 'asc' }],
    });

    const header = [
      'ky',
      'ma_don',
      'gian_hang',
      'loai_chu_the',
      'ma_so_thue',
      'ten_phap_ly',
      'gia_tri_chiu_thue',
      'ty_le',
      'nhan',
      'so_tien',
      'trang_thai',
      'ngay_phat_sinh',
      'ngay_ke_khai',
      'ngay_nop',
      'dao_cua',
      'ly_do_dao',
    ];
    const lines = rows.map((r) =>
      [
        r.periodKey,
        r.booking.code,
        r.tenant.name,
        r.sellerProfile?.entityType ?? '',
        r.sellerProfile?.taxId ?? '',
        r.sellerProfile?.legalName ?? '',
        r.taxableBase.toFixed(0),
        r.percent.toFixed(2),
        r.label,
        r.amount.toFixed(0),
        r.status,
        r.accruedAt.toISOString(),
        r.declaredAt?.toISOString() ?? '',
        r.remittedAt?.toISOString() ?? '',
        r.reversalOfId ?? '',
        r.reversalReason ?? '',
      ].map(csvCell),
    );

    /*
     * BOM UTF-8 ở đầu file: Excel trên Windows đọc CSV không BOM bằng codepage hệ thống và mọi
     * tên gian hàng có dấu sẽ thành ký tự lạ. Người làm tờ khai mở file này bằng Excel, không
     * bằng editor.
     */
    const body = [header.join(','), ...lines.map((c) => c.join(','))].join('\r\n');
    return `${BOM_UTF8}${body}\r\n`;
  }

  /** "Thuế đã khấu trừ trong kỳ" của MỘT gian hàng — bề mặt của chủ xe. */
  async tenantSummary(tenantId: string, periodKey: string): Promise<TenantTaxSummaryDto> {
    const [agg, rows] = await Promise.all([
      this.prisma.taxWithholding.aggregate({
        where: { tenantId, periodKey },
        _sum: { amount: true, taxableBase: true },
        _count: { _all: true },
      }),
      this.prisma.taxWithholding.findMany({
        where: { tenantId, periodKey },
        select: ROW_SELECT,
        orderBy: [{ accruedAt: 'desc' }],
        take: TAX_MAX_LIMIT,
      }),
    ]);

    const zero = new Prisma.Decimal(0);
    return {
      periodKey,
      totalAmount: (agg._sum.amount ?? zero).toFixed(0),
      totalTaxableBase: (agg._sum.taxableBase ?? zero).toFixed(0),
      rows: agg._count._all,
      items: rows.map(toRowDto),
    };
  }

  /**
   * Thuế đã khấu trừ nhưng CHƯA NỘP tới một mốc — vế `custodied.taxAccrued` của đối soát ba vế.
   *
   * `accrued` + `declared`: tiền đã trừ khỏi chủ xe, chưa nộp cơ quan thuế ⇒ XePrime đang giữ
   * tiền của người khác. `remitted` đã rời tài khoản; `reversed` triệt tiêu (dòng gốc + dòng âm).
   */
  async unpaidAsOf(end: Date): Promise<Prisma.Decimal> {
    const agg = await this.prisma.taxWithholding.aggregate({
      where: { accruedAt: { lt: end }, status: { in: [...TAX_WITHHOLDING_STATUS_UNPAID] } },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? new Prisma.Decimal(0);
  }

  /** Kỳ hiện tại theo giờ Việt Nam — mặc định của mọi màn báo cáo. */
  currentPeriodKey(now: Date = new Date()): string {
    return taxPeriodKeyVn(now);
  }
}

/**
 * BOM UTF-8 cho file CSV — Excel trên Windows đọc CSV KHÔNG có BOM bằng codepage hệ thống, và
 * mọi tên gian hàng có dấu sẽ thành ký tự lạ. Người làm tờ khai mở file này bằng Excel.
 *
 * Dựng từ MÃ ký tự thay vì dán ký tự thật: một BOM vô hình trong mã nguồn thì không ai thấy
 * khi review, và `no-irregular-whitespace` chặn đúng nó.
 */
const BOM_UTF8 = String.fromCharCode(0xfeff);

// ── Hàm thuần ───────────────────────────────────────────────────────────────

type Row = Prisma.TaxWithholdingGetPayload<{ select: typeof ROW_SELECT }>;

function toRowDto(r: Row): TaxRowDto {
  return {
    id: r.id,
    bookingId: r.bookingId,
    bookingCode: r.booking.code,
    tenantId: r.tenantId,
    tenantName: r.tenant.name,
    entityType: r.sellerProfile?.entityType
      ? normalizeEntityType(r.sellerProfile.entityType)
      : null,
    taxCode: r.sellerProfile?.taxId ?? null,
    taxableBase: r.taxableBase.toFixed(0),
    percent: Number(r.percent),
    label: r.label,
    amount: r.amount.toFixed(0),
    status: r.status as TaxWithholdingStatus,
    periodKey: r.periodKey,
    accruedAt: r.accruedAt.toISOString(),
    declaredAt: r.declaredAt?.toISOString() ?? null,
    remittedAt: r.remittedAt?.toISOString() ?? null,
    reversalOfId: r.reversalOfId,
    reversalReason: r.reversalReason,
  };
}

/**
 * Giá trị `entity_type` lạ (dữ liệu cũ, hoặc ai đó ghi tay) trả về nguyên trạng thay vì bị ép
 * về `individual`: ép nghĩa là đoán hộ một nghĩa vụ pháp lý, và con số sai sẽ nằm im trong tờ
 * khai. `'unknown'` của phép `COALESCE` cũng đi qua đây và giữ nguyên.
 */
function normalizeEntityType(value: string): SellerEntityType | 'unknown' {
  const known = Object.values(SELLER_ENTITY_TYPE) as string[];
  return known.includes(value) ? (value as SellerEntityType) : 'unknown';
}

/** Bọc một ô CSV — dấu phẩy, dấu ngoặc kép và xuống dòng trong tên gian hàng đều có thật. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
