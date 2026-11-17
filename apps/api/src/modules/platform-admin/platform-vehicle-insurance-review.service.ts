import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { INSURANCE_ELIGIBILITY_VEHICLE_SELECT, insuranceEligibilityInputOf } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
  VEHICLE_DOCUMENT_TYPE,
  insuranceEligibilityGaps,
  insuredValueDeviationPercent,
  insuredValueDeviationWarns,
  normalizePlateNumber,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { R2Service } from '../storage/r2.service';
import { VehicleDataSuggestionService } from '../vehicle-data/vehicle-data-suggestion.service';
import type {
  VehicleInsuranceReviewDto,
  VehicleRegistrationImageDto,
} from './dto/vehicle-insurance-review.dto';

/** Ảnh cà vẹt sống ngắn — đủ để mở xem, không đủ để chia sẻ đi đâu. */
const IMAGE_URL_TTL_SECONDS = 120;

/** Cà vẹt còn hiệu lực mới nhất của xe — cùng điều kiện với cổng bảo hiểm (`INSURANCE_ELIGIBILITY_VEHICLE_SELECT`). */
const REGISTRATION_WHERE = { type: VEHICLE_DOCUMENT_TYPE.REGISTRATION, archivedAt: null };

/**
 * Khối "Bảo hiểm và giấy tờ" của người duyệt xe (đợt rà Admin 16/11/2026) — CHỈ ĐỌC trên dữ liệu SỐNG.
 *
 * Không có công thức nào mới: điều kiện bảo hiểm đi qua `insuranceEligibilityGaps` (một hàm cho báo giá,
 * worker và màn chủ xe), giá trị tham khảo qua `VehicleDataSuggestionService.suggest` (cùng gợi ý chủ xe
 * thấy lúc đăng xe, ADR 0090). Ảnh cà vẹt là tài liệu riêng tư: URL ký ngắn hạn, mỗi lần mở một audit.
 */
@Injectable()
export class PlatformVehicleInsuranceReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly r2: R2Service,
    private readonly suggestions: VehicleDataSuggestionService,
  ) {}

  /** `null` khi xe không còn (đã xoá). */
  async review(vehicleId: string): Promise<VehicleInsuranceReviewDto | null> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, deletedAt: null },
      select: {
        ...INSURANCE_ELIGIBILITY_VEHICLE_SELECT,
        id: true,
        plateNumber: true,
        vehicleCatalogModelId: true,
        vehicleCatalogVariantId: true,
      },
    });
    if (!vehicle) return null;

    const registration = await this.prisma.vehicleDocument.findFirst({
      where: { vehicleId, ...REGISTRATION_WHERE },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        holderName: true,
        chassisNumber: true,
        engineNumber: true,
        plateNumber: true,
        activeVersion: { select: { privateFile: { select: { deletedAt: true } } } },
      },
    });

    const referenceValue = await this.referenceValue(vehicle);
    const insuredValue = vehicle.insuredValue?.toFixed(0) ?? null;
    const deviationPercent = insuredValueDeviationPercent(
      insuredValue,
      referenceValue?.amount ?? null,
    );

    const regPlate = normalizePlateNumber(registration?.plateNumber);
    const ownPlate = normalizePlateNumber(vehicle.plateNumber);
    return {
      insuredValue,
      referenceValue,
      deviationPercent,
      deviationWarning: insuredValueDeviationWarns(deviationPercent),
      eligibilityGaps: insuranceEligibilityGaps(insuranceEligibilityInputOf(vehicle)),
      registration: registration
        ? {
            documentId: registration.id,
            holderName: registration.holderName,
            chassisNumber: registration.chassisNumber,
            engineNumber: registration.engineNumber,
            plateNumber: registration.plateNumber,
            plateMatches: regPlate && ownPlate ? regPlate === ownPlate : null,
            hasImage:
              registration.activeVersion?.privateFile != null &&
              registration.activeVersion.privateFile.deletedAt == null,
          }
        : null,
    };
  }

  /** Mở ảnh cà vẹt của xe — URL ký ngắn hạn + một dòng audit mỗi lần (cùng khuôn ảnh bằng lái). */
  async registrationImage(
    vehicleId: string,
    actorUserId: string,
  ): Promise<VehicleRegistrationImageDto> {
    if (!this.r2.privateEnabled) {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODE.UPLOADS_NOT_CONFIGURED,
        message: 'Kho lưu trữ riêng tư chưa được cấu hình',
      });
    }
    const document = await this.prisma.vehicleDocument.findFirst({
      where: { vehicleId, ...REGISTRATION_WHERE, vehicle: { deletedAt: null } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        tenantId: true,
        activeVersion: {
          select: {
            privateFile: { select: { objectKey: true, originalName: true, deletedAt: true } },
          },
        },
      },
    });
    const file = document?.activeVersion?.privateFile;
    if (!document || !file || file.deletedAt) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Xe chưa có ảnh cà vẹt',
      });
    }
    const ticket = await this.r2.presignPrivateDownload(
      file.objectKey,
      file.originalName,
      IMAGE_URL_TTL_SECONDS,
    );
    await this.audit.record({
      tenantId: document.tenantId,
      actorUserId,
      actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
      action: 'vehicle_document.view_registration_image',
      targetType: AUDIT_TARGET_TYPE.VEHICLE_DOCUMENT,
      targetId: document.id,
      after: { vehicleId },
    });
    return { url: ticket.downloadUrl, expiresIn: ticket.expiresIn };
  }

  /**
   * Giá trị tham khảo — đúng gợi ý chủ xe thấy lúc đăng xe. Xe không gắn dòng xe chuẩn, hoặc dòng không
   * có giá bán ⇒ `null` (không bịa).
   */
  private async referenceValue(vehicle: {
    id: string;
    vehicleCatalogModelId: string | null;
    vehicleCatalogVariantId: string | null;
    manufactureYear: number | null;
  }) {
    if (!vehicle.vehicleCatalogModelId) return null;
    try {
      const suggestion = await this.suggestions.suggest({
        modelId: vehicle.vehicleCatalogModelId,
        ...(vehicle.vehicleCatalogVariantId ? { variantId: vehicle.vehicleCatalogVariantId } : {}),
        ...(vehicle.manufactureYear ? { year: vehicle.manufactureYear } : {}),
        vehicleId: vehicle.id,
      });
      return suggestion.value;
    } catch (err) {
      // Dòng xe đã xoá / phiên bản lệch dòng: không có gợi ý — người duyệt vẫn xem được phần còn lại.
      if (err instanceof NotFoundException) return null;
      if (
        (err as { response?: { code?: string } }).response?.code ===
        API_ERROR_CODE.CATALOG_VARIANT_MISMATCH
      ) {
        return null;
      }
      throw err;
    }
  }
}
