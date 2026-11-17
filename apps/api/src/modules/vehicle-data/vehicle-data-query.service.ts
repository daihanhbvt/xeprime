import { Injectable, NotFoundException } from '@nestjs/common';
import { nowInAppTz } from '@xeprime/domain';
import { Prisma } from '@xeprime/prisma';
import {
  CATALOG_REVIEW_STATUS,
  CATALOG_TYPE,
  VEHICLE_DATA_GAP,
  VEHICLE_DATA_GAP_ANY,
  VEHICLE_DATA_RENT_FIELDS,
  VEHICLE_DATA_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  catalogResidualPercent,
  estimateCatalogValue,
  rentPercentile,
  vehicleDataGaps,
  vehicleDataStatus,
  type VehicleDataRentField,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  VEHICLE_DATA_DEFAULT_LIMIT,
  VEHICLE_DATA_MAX_LIMIT,
  VEHICLE_DATA_SORT,
  type VehicleDataDetailDto,
  type VehicleDataListItemDto,
  type VehicleDataListQueryDto,
  type VehicleDataMarketStatDto,
  type VehicleDataModelCountDto,
  type VehicleDataModelCountsQueryDto,
  type VehicleDataPageDto,
  type VehicleDataSimilarDto,
  type VehicleDataSummaryDto,
  type VehicleDataVehicleDto,
} from './dto/vehicle-data.dto';
import { RECORD_SELECT, recordFields } from './vehicle-data.service';

const LIVE = { deletedAt: null } as const;

/** Số năm sản xuất hiện trong bảng "giá trị xe theo năm" của chi tiết. */
const VALUE_YEARS = 12;
/** Số xe mẫu hiện trong chi tiết. */
const SAMPLE_VEHICLES = 10;

const LIST_SELECT = {
  ...RECORD_SELECT,
  updatedAt: true,
  model: {
    select: { id: true, label: true, brandKey: true, vehicleType: true, reviewStatus: true },
  },
  proposedByTenant: { select: { name: true } },
} as const satisfies Prisma.VehicleCatalogVariantSelect;

const VEHICLE_SELECT = {
  id: true,
  name: true,
  plateNumber: true,
  tenantId: true,
  tenant: { select: { name: true } },
  manufactureYear: true,
  weekdayPrice: true,
  publicStatus: true,
} as const satisfies Prisma.VehicleSelect;

/**
 * Đọc của màn "Dữ liệu xe" (ADR 0090) — danh sách lọc/sắp/phân trang ở DB, số liệu tổng, chi tiết
 * kèm xe đang dùng, giá thực tế trên chợ, giá trị xe theo năm và dữ liệu có thể trùng. Chỉ đọc.
 */
@Injectable()
export class VehicleDataQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: VehicleDataListQueryDto): Promise<VehicleDataPageDto> {
    const paging = resolvePaging(query, VEHICLE_DATA_DEFAULT_LIMIT, VEHICLE_DATA_MAX_LIMIT);
    const where = await this.buildWhere(query);
    const orderBy: Prisma.VehicleCatalogVariantOrderByWithRelationInput[] =
      query.sort === VEHICLE_DATA_SORT.NAME_ASC
        ? [
            { model: { brandKey: 'asc' } },
            { model: { label: 'asc' } },
            { label: 'asc' },
            { yearFrom: 'desc' },
          ]
        : query.sort === VEHICLE_DATA_SORT.USAGE_DESC
          ? [{ vehicles: { _count: 'desc' } }, { updatedAt: 'desc' }]
          : [{ updatedAt: 'desc' }, { id: 'desc' }];

    const [total, rows, summary] = await Promise.all([
      this.prisma.vehicleCatalogVariant.count({ where }),
      this.prisma.vehicleCatalogVariant.findMany({
        where,
        orderBy,
        skip: paging.skip,
        take: paging.take,
        select: LIST_SELECT,
      }),
      this.summary({
        vehicleType: query.vehicleType,
        brandKey: query.brandKey,
        modelId: query.modelId,
      }),
    ]);
    const ids = rows.map((r) => r.id);
    const [usage, market, brands] = await Promise.all([
      this.usageCounts(ids),
      this.marketStats(ids, ['weekdayPrice']),
      this.brandLabels(),
    ]);
    const data: VehicleDataListItemDto[] = rows.map((row) => {
      const fields = recordFields(row);
      return {
        id: row.id,
        vehicleType: row.model.vehicleType,
        brandKey: row.model.brandKey,
        brandLabel: brands.get(row.model.brandKey) ?? row.model.brandKey,
        modelId: row.model.id,
        modelLabel: row.model.label,
        modelPending: row.model.reviewStatus === CATALOG_REVIEW_STATUS.PENDING,
        variantLabel: row.label,
        yearFrom: row.yearFrom,
        yearTo: row.yearTo,
        seatCount: fields.seatCount,
        fuelType: fields.fuelType,
        transmission: fields.transmission,
        bodyType: fields.bodyType,
        listPrice: fields.listPrice,
        weekdayPrice: fields.weekdayPrice,
        status: vehicleDataStatus(row),
        origin: row.origin,
        gaps: vehicleDataGaps({ ...fields, vehicleType: row.model.vehicleType }),
        usageCount: usage.get(row.id) ?? 0,
        marketWeekday: market.get(row.id)?.get('weekdayPrice') ?? null,
        proposedByTenantName: row.proposedByTenant?.name ?? null,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
    return { data, meta: paginationMeta(paging, total), summary };
  }

  /**
   * Số liệu đầu màn: tổng · đang gợi ý · đã ẩn · chờ duyệt · đang gợi ý mà thiếu dữ liệu — trong
   * PHẠM VI loại xe + hãng đang xem (ADR 0096: dải số liệu nằm trên danh sách đã lọc theo hãng; đếm
   * toàn sàn ở đó là để "Chờ duyệt: 5" đứng trên một danh sách rỗng). Bộ lọc còn lại (trạng thái,
   * thiếu dữ liệu…) KHÔNG thu hẹp dải: bấm ô số liệu chính là đổi các bộ lọc đó.
   */
  async summary(
    scope: { vehicleType?: string; brandKey?: string; modelId?: string } = {},
  ): Promise<VehicleDataSummaryDto> {
    const base = {
      ...LIVE,
      // Danh sách xe của MỘT dòng (tab Mẫu xe mở một dòng ra): đếm trong dòng đó - vài chục dòng,
      // qua chỉ mục `model_id`, thay vì đếm lại cả hãng cho mỗi dòng đang mở.
      ...(scope.modelId ? { modelId: scope.modelId } : {}),
      model: {
        ...LIVE,
        ...(scope.vehicleType ? { vehicleType: scope.vehicleType } : {}),
        ...(scope.brandKey ? { brandKey: scope.brandKey } : {}),
      },
    } satisfies Prisma.VehicleCatalogVariantWhereInput;
    const approved = { ...base, reviewStatus: CATALOG_REVIEW_STATUS.APPROVED };
    const [total, active, hidden, pending, incomplete] = await Promise.all([
      this.prisma.vehicleCatalogVariant.count({ where: base }),
      this.prisma.vehicleCatalogVariant.count({ where: { ...approved, active: true } }),
      this.prisma.vehicleCatalogVariant.count({ where: { ...approved, active: false } }),
      this.prisma.vehicleCatalogVariant.count({
        where: { ...base, reviewStatus: CATALOG_REVIEW_STATUS.PENDING },
      }),
      this.prisma.vehicleCatalogVariant.count({
        where: { ...approved, active: true, OR: Object.values(GAP_WHERE) },
      }),
    ]);
    return { total, active, hidden, pending, incomplete };
  }

  /**
   * Số xe chuẩn theo từng dòng của MỘT hãng (ADR 0096): cột "xe" của mỗi dòng, dòng nào có xe chờ
   * duyệt / thiếu dữ liệu để mở sẵn, và dòng nào khớp bộ lọc xe đang bật. Dải số liệu đầu màn là
   * tổng của các con số này - không cần một lượt đếm riêng.
   *
   * Đếm bằng `groupBy` ở DB; phạm vi hãng đi qua chỉ mục `(vehicle_type, brand_key, …)` của dòng xe
   * rồi chỉ mục `(model_id, …)` của xe chuẩn - đo 17/11/2026 với 120.000 xe chuẩn: ~1-3ms mỗi câu.
   */
  async modelCounts(query: VehicleDataModelCountsQueryDto): Promise<VehicleDataModelCountDto[]> {
    const base = {
      ...LIVE,
      model: { ...LIVE, vehicleType: query.vehicleType, brandKey: query.brandKey },
    } satisfies Prisma.VehicleCatalogVariantWhereInput;
    const approved = { ...base, reviewStatus: CATALOG_REVIEW_STATUS.APPROVED };
    const filtered = Boolean(query.search || query.status || query.gap || query.origin);
    const count = (where: Prisma.VehicleCatalogVariantWhereInput) =>
      this.prisma.vehicleCatalogVariant
        .groupBy({ by: ['modelId'], where, _count: { _all: true } })
        .then((rows) => new Map(rows.map((r) => [r.modelId, r._count._all])));

    const [total, active, hidden, pending, incomplete, matched] = await Promise.all([
      count(base),
      count({ ...approved, active: true }),
      count({ ...approved, active: false }),
      count({ ...base, reviewStatus: CATALOG_REVIEW_STATUS.PENDING }),
      count({ ...approved, active: true, OR: Object.values(GAP_WHERE) }),
      filtered ? this.buildWhere(query).then(count) : null,
    ]);
    if (total.size === 0) return [];
    const models = await this.prisma.vehicleCatalogModel.findMany({
      where: { id: { in: [...total.keys()] } },
      select: { id: true, label: true, reviewStatus: true },
      orderBy: { label: 'asc' },
    });
    return models.map((m) => ({
      modelId: m.id,
      modelLabel: m.label,
      modelPending: m.reviewStatus === CATALOG_REVIEW_STATUS.PENDING,
      total: total.get(m.id) ?? 0,
      active: active.get(m.id) ?? 0,
      hidden: hidden.get(m.id) ?? 0,
      pending: pending.get(m.id) ?? 0,
      incomplete: incomplete.get(m.id) ?? 0,
      matched: matched ? (matched.get(m.id) ?? 0) : (total.get(m.id) ?? 0),
    }));
  }

  async detail(id: string): Promise<VehicleDataDetailDto> {
    const row = await this.prisma.vehicleCatalogVariant.findFirst({
      where: { id, ...LIVE },
      select: {
        ...LIST_SELECT,
        createdAt: true,
        reviewNote: true,
        reviewedAt: true,
        updatedBy: true,
        sourceVehicle: { select: VEHICLE_SELECT },
      },
    });
    if (!row) throw new NotFoundException('Không tìm thấy dữ liệu xe');
    const fields = recordFields(row);
    const vehicleType = row.model.vehicleType;

    const [usage, vehicles, market, brands, updater, similar] = await Promise.all([
      this.usageCounts([id]),
      this.prisma.vehicle.findMany({
        where: { vehicleCatalogVariantId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: SAMPLE_VEHICLES,
        select: VEHICLE_SELECT,
      }),
      this.marketStats([id], VEHICLE_DATA_RENT_FIELDS),
      this.brandLabels(),
      row.updatedBy
        ? this.prisma.user.findUnique({
            where: { id: row.updatedBy },
            select: { displayName: true },
          })
        : null,
      this.similar(row),
    ]);
    const stats = market.get(id);
    return {
      id: row.id,
      vehicleType,
      brandKey: row.model.brandKey,
      brandLabel: brands.get(row.model.brandKey) ?? row.model.brandKey,
      modelId: row.model.id,
      modelLabel: row.model.label,
      modelPending: row.model.reviewStatus === CATALOG_REVIEW_STATUS.PENDING,
      variantLabel: row.label,
      yearFrom: row.yearFrom,
      yearTo: row.yearTo,
      ...fields,
      status: vehicleDataStatus(row),
      origin: row.origin,
      gaps: vehicleDataGaps({ ...fields, vehicleType }),
      proposedByTenantName: row.proposedByTenant?.name ?? null,
      sourceVehicle: row.sourceVehicle ? toVehicleDto(row.sourceVehicle) : null,
      reviewNote: row.reviewNote,
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
      updatedByName: updater?.displayName ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      usageCount: usage.get(id) ?? 0,
      vehicles: vehicles.map(toVehicleDto),
      market: VEHICLE_DATA_RENT_FIELDS.map(
        (field) =>
          stats?.get(field) ?? { field, sampleSize: 0, low: null, median: null, high: null },
      ),
      valueByYear:
        vehicleType === VEHICLE_TYPE.CAR ? valueByYear(fields.listPrice, row.yearFrom) : [],
      similar,
    };
  }

  // ── nội bộ ───────────────────────────────────────────────────────────────

  async buildWhere(
    query: VehicleDataListQueryDto,
  ): Promise<Prisma.VehicleCatalogVariantWhereInput> {
    const and: Prisma.VehicleCatalogVariantWhereInput[] = [];
    const model: Prisma.VehicleCatalogModelWhereInput = {
      ...LIVE,
      ...(query.vehicleType ? { vehicleType: query.vehicleType } : {}),
      ...(query.brandKey ? { brandKey: query.brandKey } : {}),
    };
    if (query.status === VEHICLE_DATA_STATUS.PENDING) {
      and.push({ reviewStatus: CATALOG_REVIEW_STATUS.PENDING });
    } else if (query.status === VEHICLE_DATA_STATUS.ACTIVE) {
      and.push({ reviewStatus: CATALOG_REVIEW_STATUS.APPROVED, active: true });
    } else if (query.status === VEHICLE_DATA_STATUS.HIDDEN) {
      and.push({ reviewStatus: CATALOG_REVIEW_STATUS.APPROVED, active: false });
    }
    if (query.origin) and.push({ origin: query.origin });
    if (query.modelId) and.push({ modelId: query.modelId });
    if (query.excludeId) and.push({ id: { not: query.excludeId } });
    if (query.gap === VEHICLE_DATA_GAP_ANY) and.push({ OR: Object.values(GAP_WHERE) });
    else if (query.gap) and.push(GAP_WHERE[query.gap as keyof typeof GAP_WHERE] ?? {});
    if (query.search) {
      const term = query.search;
      const brandKeys = (
        await this.prisma.catalogItem.findMany({
          where: {
            type: CATALOG_TYPE.VEHICLE_BRAND,
            label: { contains: term, mode: 'insensitive' },
          },
          select: { key: true },
        })
      ).map((b) => b.key);
      // "Toyota Vios" gõ liền: thử thêm vế "hãng khớp từ đầu + phần còn lại khớp dòng xe".
      const words = term.split(/\s+/).filter(Boolean);
      const tail = words.slice(1).join(' ');
      const headBrands =
        words.length > 1
          ? (
              await this.prisma.catalogItem.findMany({
                where: {
                  type: CATALOG_TYPE.VEHICLE_BRAND,
                  label: { equals: words[0], mode: 'insensitive' },
                },
                select: { key: true },
              })
            ).map((b) => b.key)
          : [];
      and.push({
        OR: [
          { label: { contains: term, mode: 'insensitive' } },
          { model: { label: { contains: term, mode: 'insensitive' } } },
          ...(brandKeys.length ? [{ model: { brandKey: { in: brandKeys } } }] : []),
          ...(headBrands.length && tail
            ? [
                {
                  model: { brandKey: { in: headBrands } },
                  OR: [
                    { model: { label: { contains: tail, mode: 'insensitive' as const } } },
                    { label: { contains: tail, mode: 'insensitive' as const } },
                  ],
                },
              ]
            : []),
        ],
      });
    }
    return { ...LIVE, model, AND: and };
  }

  private async similar(row: {
    id: string;
    modelId: string;
    key: string;
    yearFrom: number | null;
    yearTo: number | null;
  }): Promise<VehicleDataSimilarDto[]> {
    const from = row.yearFrom ?? 0;
    const to = row.yearTo ?? 9999;
    const rows = await this.prisma.vehicleCatalogVariant.findMany({
      where: {
        ...LIVE,
        modelId: row.modelId,
        id: { not: row.id },
        OR: [
          { key: row.key },
          // Đời chồng nhau: [a, b] ∩ [from, to] ≠ ∅.
          {
            AND: [
              { OR: [{ yearFrom: null }, { yearFrom: { lte: to } }] },
              { OR: [{ yearTo: null }, { yearTo: { gte: from } }] },
            ],
          },
        ],
      },
      orderBy: [{ reviewStatus: 'asc' }, { label: 'asc' }],
      take: 20,
      select: {
        id: true,
        label: true,
        yearFrom: true,
        yearTo: true,
        reviewStatus: true,
        active: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      variantLabel: r.label,
      yearFrom: r.yearFrom,
      yearTo: r.yearTo,
      status: vehicleDataStatus(r),
    }));
  }

  private async usageCounts(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.vehicle.groupBy({
      by: ['vehicleCatalogVariantId'],
      where: { vehicleCatalogVariantId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      if (r.vehicleCatalogVariantId) map.set(r.vehicleCatalogVariantId, r._count._all);
    }
    return map;
  }

  /**
   * Giá thực tế (P25 · trung vị · P75) của các xe ĐANG LÊN CHỢ gắn từng xe chuẩn — một câu SQL cho cả
   * trang (index một phần `vehicles_vehicle_catalog_variant_id_idx`).
   */
  private async marketStats(
    ids: string[],
    fields: readonly VehicleDataRentField[],
  ): Promise<Map<string, Map<string, VehicleDataMarketStatDto>>> {
    const out = new Map<string, Map<string, VehicleDataMarketStatDto>>();
    if (ids.length === 0) return out;
    const rows = await this.prisma.vehicle.findMany({
      where: {
        vehicleCatalogVariantId: { in: ids },
        deletedAt: null,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        marketplaceEnabled: true,
      },
      select: {
        vehicleCatalogVariantId: true,
        hourlyPrice: true,
        weekdayPrice: true,
        weekendPrice: true,
        monthlyPrice: true,
        withDriverDailyPrice: true,
      },
    });
    const grouped = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.vehicleCatalogVariantId!;
      grouped.set(key, [...(grouped.get(key) ?? []), r]);
    }
    for (const [id, list] of grouped) {
      const perField = new Map<string, VehicleDataMarketStatDto>();
      for (const field of fields) {
        const values = list
          .map((v) => v[field])
          .filter((v): v is Prisma.Decimal => v != null)
          .map((v) => v.toNumber())
          .sort((a, b) => a - b);
        if (values.length === 0) continue;
        perField.set(field, {
          field,
          sampleSize: values.length,
          low: rentPercentile(values, 0.25),
          median: rentPercentile(values, 0.5),
          high: rentPercentile(values, 0.75),
        });
      }
      out.set(id, perField);
    }
    return out;
  }

  private async brandLabels(): Promise<Map<string, string>> {
    const rows = await this.prisma.catalogItem.findMany({
      where: { type: CATALOG_TYPE.VEHICLE_BRAND },
      select: { key: true, label: true },
    });
    return new Map(rows.map((r) => [r.key, r.label]));
  }
}

/**
 * Điều kiện SQL của từng nhóm "thiếu dữ liệu" — CÙNG luật với `vehicleDataGaps` (dùng cho cột hiển
 * thị). Sửa một bên thì sửa bên kia.
 */
const GAP_WHERE = {
  [VEHICLE_DATA_GAP.SPEC]: {
    OR: [
      { fuelType: null },
      { transmission: null },
      {
        model: { vehicleType: VEHICLE_TYPE.CAR },
        OR: [{ seatCount: null }, { bodyType: null }],
      },
    ],
  },
  [VEHICLE_DATA_GAP.LIST_PRICE]: { model: { vehicleType: VEHICLE_TYPE.CAR }, listPrice: null },
  [VEHICLE_DATA_GAP.RENT]: { weekdayPrice: null },
} satisfies Record<string, Prisma.VehicleCatalogVariantWhereInput>;

function toVehicleDto(
  v: Prisma.VehicleGetPayload<{ select: typeof VEHICLE_SELECT }>,
): VehicleDataVehicleDto {
  return {
    id: v.id,
    name: v.name,
    plateNumber: v.plateNumber,
    tenantId: v.tenantId,
    tenantName: v.tenant.name,
    manufactureYear: v.manufactureYear,
    weekdayPrice: v.weekdayPrice ? v.weekdayPrice.toFixed(0) : null,
    publicStatus: v.publicStatus,
  };
}

/** Giá trị xe tham khảo theo từng năm sản xuất — từ năm hiện tại lùi về (không trước đời xe). */
function valueByYear(listPrice: string | null, yearFrom: number | null) {
  if (!listPrice) return [];
  const current = nowInAppTz().year();
  const oldest = Math.max(current - VALUE_YEARS + 1, yearFrom ?? current - VALUE_YEARS + 1);
  const out: Array<{ year: number; amount: string; residualPercent: number }> = [];
  for (let year = current; year >= oldest; year -= 1) {
    const value = estimateCatalogValue(listPrice, year, current);
    if (value)
      out.push({ year, amount: value.amount, residualPercent: catalogResidualPercent(value.age) });
  }
  return out;
}
