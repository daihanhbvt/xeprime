import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { nowInAppTz } from '@xeprime/domain';
import type { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  CATALOG_REVIEW_STATUS,
  RENT_REFERENCE_BASIS,
  RENT_SUGGESTION_RULES,
  VEHICLE_DATA_RENT_FIELDS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  estimateCatalogValue,
  rentPercentile,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  VehicleDataRentSuggestionDto,
  VehicleDataSuggestionDto,
  VehicleDataSuggestionQueryDto,
} from './dto/vehicle-data.dto';
import { RECORD_SELECT, recordFields, toOptionDto, type RecordRow } from './vehicle-data.service';

/** Trần số xe đọc cho một phép phân vị — đủ cho một dòng xe phổ biến, không quét cả chợ. */
const MARKET_SAMPLE_MAX = 500;

/**
 * Gợi ý cho chủ xe khi đăng/sửa xe (ADR 0090) — thông số + tiện ích của xe chuẩn, giá trị xe tham
 * khảo cho bảo hiểm, giá thuê tham khảo + giá thực tế của xe cùng dòng trên chợ. CHỈ ĐỌC — form chỉ
 * điền khi chủ xe bấm áp dụng.
 */
@Injectable()
export class VehicleDataSuggestionService {
  constructor(private readonly prisma: PrismaService) {}

  async suggest(query: VehicleDataSuggestionQueryDto): Promise<VehicleDataSuggestionDto> {
    const model = await this.prisma.vehicleCatalogModel.findFirst({
      where: { id: query.modelId, deletedAt: null },
      select: { id: true, vehicleType: true },
    });
    if (!model) throw new NotFoundException('Không tìm thấy dòng xe');

    const approvedOfModel = await this.prisma.vehicleCatalogVariant.findMany({
      where: {
        modelId: model.id,
        deletedAt: null,
        active: true,
        reviewStatus: CATALOG_REVIEW_STATUS.APPROVED,
      },
      select: RECORD_SELECT,
      take: 200,
    });

    let record: RecordRow | null = null;
    if (query.variantId) {
      record =
        approvedOfModel.find((r) => r.id === query.variantId) ??
        (await this.prisma.vehicleCatalogVariant.findFirst({
          where: { id: query.variantId, deletedAt: null },
          select: RECORD_SELECT,
        }));
      if (!record || record.modelId !== model.id) {
        throw new BadRequestException({
          code: API_ERROR_CODE.CATALOG_VARIANT_MISMATCH,
          message: 'Phiên bản không thuộc dòng xe đã chọn',
        });
      }
      // Dòng chờ duyệt / đã ẩn không gợi ý gì (kể cả cho chính xe đã tạo ra nó).
      if (record.reviewStatus !== CATALOG_REVIEW_STATUS.APPROVED || !record.active) record = null;
    } else {
      // Chưa chọn phiên bản: dòng chỉ có MỘT xe chuẩn hợp đời thì đó chính là xe của chủ xe.
      const fit = query.year
        ? approvedOfModel.filter((r) => matchesYear(r, query.year!))
        : approvedOfModel;
      if (fit.length === 1) record = fit[0]!;
      // Không xe chuẩn nào hợp đời nhưng dòng chỉ có MỘT ⇒ vẫn là điểm tựa tốt nhất (cùng luật ô chọn).
      else if (fit.length === 0 && approvedOfModel.length === 1) record = approvedOfModel[0]!;
    }

    const fields = record ? recordFields(record) : null;
    const value =
      model.vehicleType === VEHICLE_TYPE.CAR && fields
        ? estimateCatalogValue(fields.listPrice, query.year ?? null, nowInAppTz().year())
        : null;

    const market = await this.marketPrices(model.id, query);
    const rent: VehicleDataRentSuggestionDto[] = VEHICLE_DATA_RENT_FIELDS.map((field) => {
      const own = fields?.[field] ?? null;
      const modelMedian = own ? null : medianOf(approvedOfModel, field, query.year);
      return {
        field,
        reference: own ?? modelMedian,
        referenceBasis: own
          ? RENT_REFERENCE_BASIS.RECORD
          : modelMedian
            ? RENT_REFERENCE_BASIS.MODEL
            : null,
        market: market.get(field) ?? null,
      };
    });

    return {
      modelId: model.id,
      record: record ? toOptionDto(record) : null,
      value,
      rent,
    };
  }

  /**
   * Giá các xe CÙNG DÒNG, cùng đời (±3 năm) đang lên chợ — P25/trung vị/P75 khi đủ mẫu. Không tính
   * chính chiếc xe đang sửa.
   */
  private async marketPrices(modelId: string, query: VehicleDataSuggestionQueryDto) {
    const where: Prisma.VehicleWhereInput = {
      vehicleCatalogModelId: modelId,
      deletedAt: null,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      marketplaceEnabled: true,
      ...(query.vehicleId ? { id: { not: query.vehicleId } } : {}),
      ...(query.year
        ? {
            manufactureYear: {
              gte: query.year - RENT_SUGGESTION_RULES.yearWindow,
              lte: query.year + RENT_SUGGESTION_RULES.yearWindow,
            },
          }
        : {}),
    };
    const rows = await this.prisma.vehicle.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: MARKET_SAMPLE_MAX,
      select: {
        hourlyPrice: true,
        weekdayPrice: true,
        weekendPrice: true,
        monthlyPrice: true,
        withDriverDailyPrice: true,
      },
    });
    const out = new Map<
      string,
      { sampleSize: number; low: string; median: string; high: string }
    >();
    for (const field of VEHICLE_DATA_RENT_FIELDS) {
      const values = rows
        .map((r) => r[field])
        .filter((v): v is Prisma.Decimal => v != null)
        .map((v) => v.toNumber())
        .sort((a, b) => a - b);
      if (values.length < RENT_SUGGESTION_RULES.marketplaceMinSamples) continue;
      out.set(field, {
        sampleSize: values.length,
        low: rentPercentile(values, 0.25)!,
        median: rentPercentile(values, 0.5)!,
        high: rentPercentile(values, 0.75)!,
      });
    }
    return out;
  }
}

function matchesYear(row: Pick<RecordRow, 'yearFrom' | 'yearTo'>, year: number): boolean {
  return (
    (row.yearFrom == null || row.yearFrom <= year) && (row.yearTo == null || row.yearTo >= year)
  );
}

/** Trung vị giá tham khảo của các xe chuẩn cùng dòng (ưu tiên xe hợp đời) — khi chưa chọn phiên bản. */
function medianOf(
  rows: RecordRow[],
  field: (typeof VEHICLE_DATA_RENT_FIELDS)[number],
  year: number | undefined,
): string | null {
  const pick = (list: RecordRow[]) =>
    list
      .map((r) => r[field])
      .filter((v): v is Prisma.Decimal => v != null)
      .map((v) => v.toNumber())
      .sort((a, b) => a - b);
  const fit = year ? pick(rows.filter((r) => matchesYear(r, year))) : [];
  const values = fit.length > 0 ? fit : pick(rows);
  return rentPercentile(values, 0.5);
}
