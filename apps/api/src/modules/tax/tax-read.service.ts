import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  AUDIT_ACTOR_SCOPE,
  SELLER_ENTITY_TYPE,
  TAX_CATEGORY_VALUES,
  TAX_EXPORT_GROUP_BY,
  TAX_WITHHOLDING_STATUS,
  TAX_WITHHOLDING_STATUS_UNPAID,
  VN_UTC_OFFSET_MS,
  isTaxPeriodEnded,
  taxPeriodKeyVn,
  type PaginationMeta,
  type SellerEntityType,
  type TaxCategory,
  type TaxExportGroupBy,
  type TaxWithholdingStatus,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
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
  vatAmount: true,
  pitAmount: true,
  vatPercent: true,
  pitPercent: true,
  taxCategory: true,
  sellerEntityType: true,
  taxSubjectType: true,
  sellerTaxId: true,
  sellerIdNumber: true,
  sellerLegalName: true,
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Tờ khai một KỲ: tổng, chia theo LOẠI CHỦ THỂ, và chia theo gian hàng.
   *
   * Chia theo `entityType` là yêu cầu nghiệp vụ thật, không phải trang trí: cá nhân, hộ kinh
   * doanh và doanh nghiệp có nghĩa vụ khác nhau và đi vào những tờ khai khác nhau. Nhóm
   * `unknown` là gian hàng CHƯA khai hồ sơ người bán — nó phải hiện ra chứ không bị gộp vào
   * "cá nhân", vì gộp là đoán hộ họ một nghĩa vụ pháp lý.
   */
  async periodSummary(periodKey: string, now: Date = new Date()): Promise<TaxPeriodSummaryDto> {
    const [totals, byStatus, byEntity, byTenant, filing] = await Promise.all([
      this.prisma.taxWithholding.aggregate({
        where: { periodKey },
        _sum: { amount: true, taxableBase: true, vatAmount: true, pitAmount: true },
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
       *
       * Loại chủ thể là loại người bán KHAI, đọc SNAPSHOT của dòng (`seller_entity_type`, chụp từ
       * hồ sơ lúc ghi sổ — ADR 0068), rơi về hồ sơ đang trỏ tới chỉ cho dòng một-mức trước đợt này.
       * Dòng ghi lúc gian hàng CHƯA có hồ sơ mang cả hai NULL ⇒ `'unknown'`: nhóm đó phải xuất hiện,
       * không bị gộp vào cá nhân dù tiền của nó đã bị khấu trừ theo mức cá nhân (`tax_subject_type`).
       */
      this.prisma.$queryRaw<
        Array<{
          entityType: string;
          amount: Prisma.Decimal;
          vatAmount: Prisma.Decimal;
          pitAmount: Prisma.Decimal;
          rows: bigint;
        }>
      >`
        SELECT COALESCE(tw.seller_entity_type, sp.entity_type, 'unknown') AS "entityType",
               COALESCE(SUM(tw.amount), 0)        AS amount,
               COALESCE(SUM(tw.vat_amount), 0)    AS "vatAmount",
               COALESCE(SUM(tw.pit_amount), 0)    AS "pitAmount",
               COUNT(*)                            AS rows
          FROM tax_withholdings tw
          LEFT JOIN seller_profiles sp ON sp.id = tw.seller_profile_id
         WHERE tw.period_key = ${periodKey}
         GROUP BY COALESCE(tw.seller_entity_type, sp.entity_type, 'unknown')
         ORDER BY amount DESC
      `,
      this.prisma.$queryRaw<
        Array<{
          tenantId: string;
          tenantName: string;
          entityType: string;
          taxCode: string | null;
          legalName: string | null;
          amount: Prisma.Decimal;
          vatAmount: Prisma.Decimal;
          pitAmount: Prisma.Decimal;
          rows: bigint;
        }>
      >`
        SELECT tw.tenant_id                                    AS "tenantId",
               t.name                                          AS "tenantName",
               COALESCE(tw.seller_entity_type, sp.entity_type, 'unknown') AS "entityType",
               COALESCE(tw.seller_tax_id, sp.tax_id)           AS "taxCode",
               COALESCE(tw.seller_legal_name, sp.legal_name)   AS "legalName",
               COALESCE(SUM(tw.amount), 0)                     AS amount,
               COALESCE(SUM(tw.vat_amount), 0)                 AS "vatAmount",
               COALESCE(SUM(tw.pit_amount), 0)                 AS "pitAmount",
               COUNT(*)                                        AS rows
          FROM tax_withholdings tw
          JOIN tenants t ON t.id = tw.tenant_id
          LEFT JOIN seller_profiles sp ON sp.id = tw.seller_profile_id
         WHERE tw.period_key = ${periodKey}
         GROUP BY tw.tenant_id, t.name,
                  COALESCE(tw.seller_entity_type, sp.entity_type, 'unknown'),
                  COALESCE(tw.seller_tax_id, sp.tax_id),
                  COALESCE(tw.seller_legal_name, sp.legal_name)
         ORDER BY amount DESC
      `,
      this.prisma.taxPeriodFiling.findUnique({
        where: { periodKey },
        include: {
          declaredByUser: { select: { displayName: true } },
          remittedByUser: { select: { displayName: true } },
        },
      }),
    ]);

    const zero = new Prisma.Decimal(0);
    const statusOf = (status: TaxWithholdingStatus) =>
      byStatus.find((s) => s.status === status)?._sum.amount ?? zero;
    const rowsOf = (status: TaxWithholdingStatus) =>
      byStatus.find((s) => s.status === status)?._count._all ?? 0;

    return {
      periodKey,
      ...splitTotals(totals._sum),
      rows: totals._count._all,
      accruedAmount: statusOf(TAX_WITHHOLDING_STATUS.ACCRUED).toFixed(0),
      declaredAmount: statusOf(TAX_WITHHOLDING_STATUS.DECLARED).toFixed(0),
      remittedAmount: statusOf(TAX_WITHHOLDING_STATUS.REMITTED).toFixed(0),
      accruedRows: rowsOf(TAX_WITHHOLDING_STATUS.ACCRUED),
      declaredRows: rowsOf(TAX_WITHHOLDING_STATUS.DECLARED),
      periodEnded: isTaxPeriodEnded(periodKey, now),
      filing: filing
        ? {
            declarationRef: filing.declarationRef,
            declaredOn: filing.declaredOn ? dbDateToKey(filing.declaredOn) : null,
            declaredAt: filing.declaredAt?.toISOString() ?? null,
            declaredByName: filing.declaredByUser?.displayName ?? null,
            remittanceRef: filing.remittanceRef,
            remittedOn: filing.remittedOn ? dbDateToKey(filing.remittedOn) : null,
            remittedAmount: filing.remittedAmount?.toFixed(0) ?? null,
            ledgerAmount: filing.ledgerAmount?.toFixed(0) ?? null,
            remittanceNote: filing.remittanceNote,
            remittedAt: filing.remittedAt?.toISOString() ?? null,
            remittedByName: filing.remittedByUser?.displayName ?? null,
          }
        : null,
      byEntityType: byEntity.map((r) => ({
        entityType: normalizeEntityType(r.entityType),
        amount: new Prisma.Decimal(r.amount).toFixed(0),
        vatAmount: new Prisma.Decimal(r.vatAmount).toFixed(0),
        pitAmount: new Prisma.Decimal(r.pitAmount).toFixed(0),
        rows: Number(r.rows),
      })),
      byTenant: byTenant.map((r) => ({
        tenantId: r.tenantId,
        tenantName: r.tenantName,
        entityType: normalizeEntityType(r.entityType),
        taxCode: r.taxCode,
        legalName: r.legalName,
        amount: new Prisma.Decimal(r.amount).toFixed(0),
        vatAmount: new Prisma.Decimal(r.vatAmount).toFixed(0),
        pitAmount: new Prisma.Decimal(r.pitAmount).toFixed(0),
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
  async periodCsv(
    periodKey: string,
    actorUserId: string,
    groupBy?: TaxExportGroupBy,
  ): Promise<string> {
    const rows = await this.prisma.taxWithholding.findMany({
      where: { periodKey },
      select: ROW_SELECT,
      orderBy: [{ accruedAt: 'asc' }, { id: 'asc' }],
    });

    const table =
      groupBy === TAX_EXPORT_GROUP_BY.SELLER ? sellerCsvTable(rows) : detailCsvTable(rows);

    /*
     * BOM UTF-8 ở đầu file: Excel trên Windows đọc CSV không BOM bằng codepage hệ thống và mọi
     * tên gian hàng có dấu sẽ thành ký tự lạ. Người làm tờ khai mở file này bằng Excel, không
     * bằng editor.
     */
    const body = [
      table.header.join(','),
      ...table.lines.map((cells) => cells.map(csvCell).join(',')),
    ].join('\r\n');

    /*
     * File này mang SỐ CCCD ĐẦY ĐỦ và MST của mọi người bán trong kỳ — một lần tải là một lần dữ
     * liệu định danh rời khỏi hệ thống. Ghi audit (ai, kỳ nào, bao nhiêu dòng, bao nhiêu số định
     * danh) TRƯỚC khi trả file: audit lỗi thì không xuất, không bao giờ có một lần tải không dấu
     * vết. Không ghi số giấy tờ vào audit — chỉ đếm.
     */
    await this.audit.record({
      actorUserId,
      actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
      action: 'tax.period_export',
      targetType: 'tax_period',
      targetId: periodKey,
      after: {
        periodKey,
        groupBy: groupBy ?? null,
        rows: table.lines.length,
        withIdNumber: table.withIdNumber,
      },
    });

    return `${BOM_UTF8}${body}\r\n`;
  }

  /** "Thuế đã khấu trừ trong kỳ" của MỘT gian hàng — bề mặt của chủ xe. */
  async tenantSummary(tenantId: string, periodKey: string): Promise<TenantTaxSummaryDto> {
    const [agg, rows] = await Promise.all([
      this.prisma.taxWithholding.aggregate({
        where: { tenantId, periodKey },
        _sum: { amount: true, taxableBase: true, vatAmount: true, pitAmount: true },
        _count: { _all: true },
      }),
      this.prisma.taxWithholding.findMany({
        where: { tenantId, periodKey },
        select: ROW_SELECT,
        orderBy: [{ accruedAt: 'desc' }],
        take: TAX_MAX_LIMIT,
      }),
    ]);

    return {
      periodKey,
      ...splitTotals(agg._sum),
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
    entityType: declaredEntityTypeOf(r),
    taxSubjectType: entityTypeOrNull(r.taxSubjectType),
    taxCode: r.sellerTaxId ?? r.sellerProfile?.taxId ?? null,
    legalName: r.sellerLegalName ?? r.sellerProfile?.legalName ?? null,
    taxableBase: r.taxableBase.toFixed(0),
    percent: Number(r.percent),
    vatPercent: r.vatPercent == null ? null : Number(r.vatPercent),
    pitPercent: r.pitPercent == null ? null : Number(r.pitPercent),
    vatAmount: r.vatAmount?.toFixed(0) ?? null,
    pitAmount: r.pitAmount?.toFixed(0) ?? null,
    taxCategory: normalizeTaxCategory(r.taxCategory),
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

/**
 * Loại chủ thể người bán KHAI của một dòng — snapshot của dòng trước (ADR 0068), hồ sơ đang trỏ tới
 * chỉ cho dòng một-mức ghi trước đợt này. Không có cả hai (gian hàng chưa khai hồ sơ lúc ghi sổ) ⇒
 * `'unknown'`, KHÔNG BAO GIỜ `individual`: cùng một phép với `COALESCE(..., 'unknown')` của tờ khai.
 */
function declaredEntityTypeOf(r: Row): SellerEntityType | 'unknown' {
  return normalizeEntityType(r.sellerEntityType ?? r.sellerProfile?.entityType ?? 'unknown');
}

/** Chủ thể ÁP THUẾ — `null` ở dòng một-mức cũ; giá trị lạ (ghi tay) cũng `null`, không đoán. */
function entityTypeOrNull(value: string | null): SellerEntityType | null {
  const normalized = value ? normalizeEntityType(value) : 'unknown';
  return normalized === 'unknown' ? null : normalized;
}

/**
 * Tổng của một tập dòng, kèm phần CHƯA TÁCH GTGT/TNCN.
 *
 * Kỳ có cả dòng một-mức cũ lẫn dòng tách (ADR 0068) thì `GTGT + TNCN ≠ tổng`: phần chênh chính là
 * tổng `amount` của các dòng cũ. Tính bằng phép trừ, không bằng truy vấn thứ hai — CHECK
 * `tax_withholdings_vat_pit_sum_check` bảo đảm `vat + pit = amount` ở MỌI dòng tách (cả dòng đảo),
 * nên `tổng − ΣGTGT − ΣTNCN` đúng bằng tổng của các dòng không tách.
 */
function splitTotals(sum: {
  amount: Prisma.Decimal | null;
  taxableBase: Prisma.Decimal | null;
  vatAmount: Prisma.Decimal | null;
  pitAmount: Prisma.Decimal | null;
}) {
  const zero = new Prisma.Decimal(0);
  const total = sum.amount ?? zero;
  const vat = sum.vatAmount ?? zero;
  const pit = sum.pitAmount ?? zero;
  return {
    totalAmount: total.toFixed(0),
    totalTaxableBase: (sum.taxableBase ?? zero).toFixed(0),
    totalVatAmount: vat.toFixed(0),
    totalPitAmount: pit.toFixed(0),
    totalUnsplitAmount: total.minus(vat).minus(pit).toFixed(0),
  };
}

/** Nhóm NĐ 117 lạ (ghi tay) ⇒ null thay vì ép về một nhóm. */
function normalizeTaxCategory(value: string | null): TaxCategory | null {
  return value != null && (TAX_CATEGORY_VALUES as string[]).includes(value)
    ? (value as TaxCategory)
    : null;
}

/** Bọc một ô CSV — dấu phẩy, dấu ngoặc kép và xuống dòng trong tên gian hàng đều có thật. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Cột `DATE` (nửa đêm UTC của ngày lịch) → `YYYY-MM-DD`. */
function dbDateToKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Mốc thời gian → `YYYY-MM-DD HH:mm:ss` theo GIỜ VIỆT NAM. File CSV trước đây ghi ISO UTC: một
 * chuyến bắt đầu 06:30 ngày 01/04 giờ VN hiện thành 23:30 ngày 31/03, và người làm tờ khai đọc nhầm
 * kỳ của nó dù cột `ky` vẫn đúng.
 */
function vnDateTime(at: Date): string {
  return new Date(at.getTime() + VN_UTC_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 19);
}

interface CsvTable {
  header: string[];
  lines: string[][];
  /** Số dòng của file mang số định danh đầy đủ — đi vào audit (chỉ đếm, không ghi số). */
  withIdNumber: number;
}

/**
 * Từng dòng theo chuyến. Cột theo yêu cầu kê khai của NĐ 117 (ADR 0068 điều 4): người bán (loại
 * chủ thể, MST, số định danh, tên pháp lý — SNAPSHOT lúc ghi sổ), doanh thu, GTGT và TNCN tách riêng
 * kèm tỷ lệ, và nhóm ngành nghề. Dòng trước đợt này (một mức) để trống các cột tách — không bịa phép
 * tách.
 */
function detailCsvTable(rows: readonly Row[]): CsvTable {
  const header = [
    'ky',
    'ma_don',
    'gian_hang',
    'loai_chu_the',
    'khau_tru_nhu',
    'ma_so_thue',
    'so_dinh_danh',
    'ten_phap_ly',
    'nhom',
    'gia_tri_chiu_thue',
    'ty_le',
    'ty_le_gtgt',
    'ty_le_tncn',
    'thue_gtgt',
    'thue_tncn',
    'nhan',
    'so_tien',
    'trang_thai',
    'ngay_phat_sinh',
    'ngay_ke_khai',
    'ngay_nop',
    'dao_cua',
    'ly_do_dao',
  ];
  const lines = rows.map((r) => [
    r.periodKey,
    r.booking.code,
    r.tenant.name,
    declaredEntityTypeOf(r),
    // Chủ thể ÁP THUẾ đã đóng băng (không hồ sơ / doanh nghiệp chưa xác minh ⇒ cá nhân).
    // Trống ở dòng một-mức cũ: khi đó mọi chủ thể bị khấu trừ, không có phép phân loại.
    r.taxSubjectType ?? '',
    r.sellerTaxId ?? r.sellerProfile?.taxId ?? '',
    r.sellerIdNumber ?? '',
    r.sellerLegalName ?? r.sellerProfile?.legalName ?? '',
    r.taxCategory ?? '',
    r.taxableBase.toFixed(0),
    r.percent.toFixed(2),
    r.vatPercent?.toFixed(2) ?? '',
    r.pitPercent?.toFixed(2) ?? '',
    r.vatAmount?.toFixed(0) ?? '',
    r.pitAmount?.toFixed(0) ?? '',
    r.label,
    r.amount.toFixed(0),
    r.status,
    vnDateTime(r.accruedAt),
    r.declaredAt ? vnDateTime(r.declaredAt) : '',
    r.remittedAt ? vnDateTime(r.remittedAt) : '',
    r.reversalOfId ?? '',
    r.reversalReason ?? '',
  ]);
  return { header, lines, withIdNumber: rows.filter((r) => r.sellerIdNumber).length };
}

/**
 * Một dòng mỗi NGƯỜI BÁN của kỳ — dạng người làm tờ khai cần để lập bảng kê kèm tờ khai nộp thay
 * (định danh + doanh thu chịu thuế + GTGT + TNCN).
 *
 * Chỉ cộng dòng CÒN HIỆU LỰC (`status ≠ reversed`): dòng gốc bị đảo và dòng đảo của nó đều mang
 * `reversed`, và dòng đảo giữ nguyên `taxable_base` dương — cộng cả hai là đếm đôi doanh thu.
 * Người bán = bộ định danh đã chụp lúc ghi sổ + gian hàng; một người đổi MST giữa kỳ hiện hai dòng,
 * đúng như hai lần khai khác nhau.
 */
function sellerCsvTable(rows: readonly Row[]): CsvTable {
  interface SellerGroup {
    cells: [string, string, string, string, string, string, string];
    trips: number;
    taxableBase: Prisma.Decimal;
    vat: Prisma.Decimal;
    pit: Prisma.Decimal;
    unsplit: Prisma.Decimal;
    total: Prisma.Decimal;
  }
  const zero = new Prisma.Decimal(0);
  const groups = new Map<string, SellerGroup>();
  for (const r of rows) {
    if (r.status === TAX_WITHHOLDING_STATUS.REVERSED) continue;
    const cells: SellerGroup['cells'] = [
      r.periodKey,
      declaredEntityTypeOf(r),
      r.taxSubjectType ?? '',
      r.sellerTaxId ?? r.sellerProfile?.taxId ?? '',
      r.sellerIdNumber ?? '',
      r.sellerLegalName ?? r.sellerProfile?.legalName ?? '',
      r.tenant.name,
    ];
    const key = JSON.stringify([r.tenantId, ...cells.slice(1, 6)]);
    const group = groups.get(key) ?? {
      cells,
      trips: 0,
      taxableBase: zero,
      vat: zero,
      pit: zero,
      unsplit: zero,
      total: zero,
    };
    group.trips += 1;
    group.taxableBase = group.taxableBase.add(r.taxableBase);
    if (r.vatAmount !== null && r.pitAmount !== null) {
      group.vat = group.vat.add(r.vatAmount);
      group.pit = group.pit.add(r.pitAmount);
    } else {
      group.unsplit = group.unsplit.add(r.amount);
    }
    group.total = group.total.add(r.amount);
    groups.set(key, group);
  }

  const sorted = [...groups.values()].sort((a, b) => b.total.comparedTo(a.total));
  const header = [
    'ky',
    'loai_chu_the',
    'khau_tru_nhu',
    'ma_so_thue',
    'so_dinh_danh',
    'ten_phap_ly',
    'gian_hang',
    'so_chuyen',
    'gia_tri_chiu_thue',
    'thue_gtgt',
    'thue_tncn',
    // Dòng một-mức trước 22/10/2026 không tách GTGT/TNCN — phần đó hiện riêng, không bịa phép tách.
    'thue_chua_tach',
    'tong_thue',
  ];
  const lines = sorted.map((g) => [
    ...g.cells,
    String(g.trips),
    g.taxableBase.toFixed(0),
    g.vat.toFixed(0),
    g.pit.toFixed(0),
    g.unsplit.toFixed(0),
    g.total.toFixed(0),
  ]);
  return { header, lines, withIdNumber: sorted.filter((g) => g.cells[4] !== '').length };
}
