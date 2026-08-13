import { Injectable } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  HANDOVER_STATUS,
  HANDOVER_TYPE,
  MAINTENANCE_DUE_SOON_KM_DEFAULT,
  MAINTENANCE_DUE_STATUS,
  MAINTENANCE_STATUS,
  PERMISSION,
  VEHICLE_ALERT_KIND,
  VEHICLE_ALERT_SEVERITY_OF,
  VEHICLE_DOCUMENT_OCR_STATUS,
  VEHICLE_DOCUMENT_PRESENTATION,
  VEHICLE_PUBLIC_STATUS,
  sortVehicleAlerts,
  vehicleDocumentPresentation,
  vehicleMaintenanceSchedule,
  type VehicleAlert,
  type VehicleAlertKind,
  type VehicleDocumentOcrStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { VehicleAlertDto, VehicleAlertsDto } from './dto/vehicle-alert.dto';

/**
 * Người gọi được thấy MIỀN nào — controller kiểm quyền rồi truyền xuống, service không tự đọc.
 *
 * Tách theo miền chứ không theo một cờ chung (Wave 8.1): endpoint cảnh báo chỉ đòi
 * `vehicles.view`, nên nếu service cứ tính hết thì một custom role chỉ có `vehicles.view` vẫn
 * suy ra được xe có giấy tờ hết hạn không, KM bao nhiêu, có biên bản thiếu KM nào không, và
 * id đơn thuê nằm ngay trong URL. Cảnh báo là dữ liệu tổng hợp — nó phải chịu đúng ràng buộc
 * quyền của miền sinh ra nó.
 */
export interface VehicleAlertScope {
  /** `finance.view` — nghĩa vụ thanh toán định kỳ của nguồn xe. */
  canViewFinance: boolean;
  /** `vehicles.documents.view` — trạng thái hạn giấy tờ (kể cả chỉ là con số đếm). */
  canViewDocuments: boolean;
  /** `vehicles.maintenance.view` — KM hiện tại, mốc bảo dưỡng, phiếu đang thực hiện. */
  canViewMaintenance: boolean;
  /** `handovers.view` — biên bản trả xe thiếu KM. */
  canViewHandovers: boolean;
  /** `bookings.view` — chỉ khi có mới được dẫn link mang `bookingId`. */
  canViewBookings: boolean;
}

/**
 * Dựng scope từ permission của request — MỘT chỗ duy nhất, để hai controller (lô xe và Hồ sơ
 * 360) không thể lệch nhau. Đọc từ `tenant.permissions` (membership), không bao giờ từ body.
 */
export function vehicleAlertScopeOf(permissions: readonly string[]): VehicleAlertScope {
  return {
    canViewFinance: permissions.includes(PERMISSION.FINANCE_VIEW),
    canViewDocuments: permissions.includes(PERMISSION.VEHICLE_DOCUMENT_VIEW),
    canViewMaintenance: permissions.includes(PERMISSION.VEHICLE_MAINTENANCE_VIEW),
    canViewHandovers: permissions.includes(PERMISSION.HANDOVER_VIEW),
    canViewBookings: permissions.includes(PERMISSION.BOOKING_VIEW),
  };
}

/** Số ngày trước kỳ thanh toán thì bắt đầu nhắc — hằng số có tên, không phải số giấu trong code. */
const OBLIGATION_LEAD_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tổng hợp "việc cần làm" của xe (Wave 8) — NGUỒN DUY NHẤT cho cả danh sách xe lẫn Hồ sơ 360.
 *
 * Vì sao là service riêng chứ không nằm trong `VehiclesService`: nó đọc CHÉO bốn miền (giấy tờ,
 * bảo dưỡng/KM, bàn giao, nguồn xe) mà không sở hữu miền nào. Đặt vào `VehiclesService` sẽ kéo
 * nửa hệ thống vào một class vốn đã lo CRUD xe.
 *
 * Ba luật đóng đinh:
 *  - **Một phép tính, hai bề mặt.** Thẻ xe và trang chi tiết gọi cùng hàm này; không surface nào
 *    được tự suy ra cảnh báo của riêng nó (nếu không, cùng một xe sẽ nói hai điều khác nhau).
 *  - **Không rò dữ liệu nhạy cảm.** Tiêu đề/mô tả/đếm/URL chỉ mang loại việc và số lượng —
 *    không số giấy tờ, không tên file, không số tiền, không định danh riêng tư.
 *  - **Ngưỡng đến từ cấu hình gian hàng**, dùng lại đúng khoá mà Wave 5/6 đã đặt; chưa cấu hình
 *    thì không kết luận (không có ngưỡng ngầm).
 */
@Injectable()
export class VehicleAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cảnh báo cho một LÔ xe — dùng cho lưới danh sách. Truy vấn theo lô (không N+1): mỗi miền
   * đúng một câu, rồi ghép trong bộ nhớ theo `vehicleId`.
   */
  async forVehicles(
    tenantId: string,
    vehicleIds: string[],
    scope: VehicleAlertScope,
  ): Promise<VehicleAlertsDto[]> {
    const ids = [...new Set(vehicleIds)].filter(Boolean);
    if (ids.length === 0) return [];

    const today = startOfUtcDay(new Date());
    const todayKey = today.toISOString().slice(0, 10);
    const [vehicles, profiles, documents, openRecords, missingKm, obligations, thresholds] =
      await Promise.all([
        this.prisma.vehicle.findMany({
          where: { id: { in: ids }, tenantId, deletedAt: null },
          select: {
            id: true,
            publicStatus: true,
            plateNumber: true,
            weekdayPrice: true,
            mainImageUrl: true,
          },
        }),
        // Thiếu quyền miền nào thì KHÔNG chạy truy vấn của miền đó — dữ liệu không rời khỏi DB,
        // và cũng không có cách nào suy ngược ra nó từ thời gian phản hồi hay hình dạng kết quả.
        scope.canViewMaintenance
          ? this.prisma.vehicleMaintenanceProfile.findMany({
              where: { tenantId, vehicleId: { in: ids } },
              select: {
                vehicleId: true,
                currentOdometerKm: true,
                currentOdometerSource: true,
                currentOdometerAt: true,
                lastServiceKm: true,
                oilChangeIntervalKm: true,
              },
            })
          : Promise.resolve([]),
        scope.canViewDocuments
          ? this.prisma.vehicleDocument.findMany({
              where: {
                tenantId,
                vehicleId: { in: ids },
                archivedAt: null,
                expiresAt: { not: null },
              },
              // `activeVersionId` + trạng thái OCR mới nhất: luật trình bày CHUẨN của module
              // giấy tờ cần cả hai, và giấy tờ chưa có file phải là `missing`, không phải
              // "đã hết hạn" (Wave 8.1).
              select: {
                vehicleId: true,
                expiresAt: true,
                activeVersionId: true,
                ocrJobs: {
                  orderBy: { createdAt: 'desc' as const },
                  take: 1,
                  select: { status: true },
                },
              },
            })
          : Promise.resolve([]),
        scope.canViewMaintenance
          ? this.prisma.vehicleMaintenanceRecord.findMany({
              where: {
                tenantId,
                vehicleId: { in: ids },
                status: MAINTENANCE_STATUS.IN_PROGRESS,
              },
              select: { vehicleId: true },
            })
          : Promise.resolve([]),
        scope.canViewHandovers
          ? this.prisma.vehicleHandover.findMany({
              where: {
                tenantId,
                vehicleId: { in: ids },
                type: HANDOVER_TYPE.RETURN,
                status: HANDOVER_STATUS.CONFIRMED,
                odometerMissing: true,
                // Cùng luật "bản ghi còn hiệu lực" với hàng đợi ở Trung tâm bảo dưỡng
                // (Wave 8.1 §6) — xe/đơn đã xoá mềm thì không còn là việc phải làm.
                vehicle: { deletedAt: null },
                booking: { deletedAt: null },
              },
              select: { vehicleId: true, bookingId: true },
            })
          : Promise.resolve([]),
        // Không có quyền tài chính thì KHÔNG chạy truy vấn — dữ liệu không rời khỏi DB.
        scope.canViewFinance
          ? this.prisma.vehicleSourceDetail.findMany({
              where: { tenantId, vehicleId: { in: ids }, paymentDay: { not: null } },
              select: { vehicleId: true, paymentDay: true },
            })
          : Promise.resolve([]),
        this.thresholds(tenantId),
      ]);

    const byVehicle = new Map<string, VehicleAlertsDto>();
    for (const vehicle of vehicles) {
      byVehicle.set(vehicle.id, {
        vehicleId: vehicle.id,
        currentOdometerKm: null,
        currentOdometerSource: null,
        currentOdometerAt: null,
        alerts: [],
      });
    }

    const push = (vehicleId: string, kind: VehicleAlertKind, alert: Omit<VehicleAlert, 'kind' | 'severity'>) => {
      const entry = byVehicle.get(vehicleId);
      if (!entry) return;
      entry.alerts.push({
        kind,
        severity: VEHICLE_ALERT_SEVERITY_OF[kind],
        title: alert.title,
        detail: alert.detail ?? null,
        count: alert.count ?? null,
        href: alert.href ?? null,
      });
    };

    // ── KM & bảo dưỡng ────────────────────────────────────────────────────
    for (const profile of profiles) {
      const entry = byVehicle.get(profile.vehicleId);
      if (!entry) continue;
      entry.currentOdometerKm = profile.currentOdometerKm;
      entry.currentOdometerSource = profile.currentOdometerSource;
      entry.currentOdometerAt = profile.currentOdometerAt?.toISOString() ?? null;

      const schedule = vehicleMaintenanceSchedule({
        currentKm: profile.currentOdometerKm,
        lastServiceKm: profile.lastServiceKm,
        intervalKm: profile.oilChangeIntervalKm,
        dueSoonKm: thresholds.dueSoonKm,
      });
      if (schedule.status === MAINTENANCE_DUE_STATUS.OVERDUE) {
        push(profile.vehicleId, VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE, {
          title: 'Xe đã quá mốc bảo dưỡng',
          detail:
            schedule.remainingKm != null
              ? `Vượt ${Math.abs(schedule.remainingKm)} km so với mốc dự kiến`
              : null,
          href: maintenanceTab(profile.vehicleId),
        });
      } else if (schedule.status === MAINTENANCE_DUE_STATUS.DUE_SOON) {
        push(profile.vehicleId, VEHICLE_ALERT_KIND.MAINTENANCE_DUE_SOON, {
          title: 'Sắp tới mốc bảo dưỡng',
          detail: schedule.remainingKm != null ? `Còn ${schedule.remainingKm} km` : null,
          href: maintenanceTab(profile.vehicleId),
        });
      }
    }
    if (scope.canViewMaintenance) {
      // "Chưa có KM" cũng là dữ liệu bảo dưỡng: nói ra nó với vai trò không có quyền là tiết lộ
      // trạng thái odometer theo hướng phủ định.
      for (const vehicle of vehicles) {
        const entry = byVehicle.get(vehicle.id);
        if (entry && entry.currentOdometerKm === null) {
          push(vehicle.id, VEHICLE_ALERT_KIND.MISSING_ODOMETER, {
            title: 'Chưa ghi nhận số KM',
            detail: 'Mốc bảo dưỡng chưa tính được cho tới khi có số KM đầu tiên',
            href: maintenanceTab(vehicle.id),
          });
        }
      }
    }

    // ── Giấy tờ ───────────────────────────────────────────────────────────
    // Chỉ ĐẾM theo trạng thái trình bày — không mang loại giấy tờ, số hiệu hay ngày hết hạn
    // cụ thể ra ngoài (đó là dữ liệu sau quyền `documents.view_details`).
    const documentCounts = new Map<string, { expired: number; expiring: number }>();
    for (const doc of documents) {
      const latestOcr = doc.ocrJobs[0]
        ? (doc.ocrJobs[0].status as VehicleDocumentOcrStatus)
        : null;
      // ĐÚNG luật của module giấy tờ, không phải một bản rút gọn: giấy tờ chưa có file là
      // `missing`, job OCR dang dở thắng trạng thái hạn dùng. Trước Wave 8.1 chỗ này ghim
      // cứng `hasActiveVersion: true`, nên một giấy tờ mới khai ngày hết hạn mà chưa tải file
      // bị đếm là "đã hết hạn" — tab giấy tờ và cảnh báo nói hai chuyện khác nhau.
      const presentation = vehicleDocumentPresentation({
        hasActiveVersion: Boolean(doc.activeVersionId),
        ocrStatus: latestOcr === VEHICLE_DOCUMENT_OCR_STATUS.REVIEWED ? null : latestOcr,
        expiresAt: doc.expiresAt ? doc.expiresAt.toISOString().slice(0, 10) : null,
        warningDays: thresholds.documentWarningDays,
        today: todayKey,
      });
      const bucket = documentCounts.get(doc.vehicleId) ?? { expired: 0, expiring: 0 };
      // Chỉ đếm khi luật chuẩn trả về ĐÚNG hai trạng thái này — `missing`/`processing`/
      // `needs_review`/`unreadable` là việc của tab giấy tờ, không phải cảnh báo hạn dùng.
      if (presentation === VEHICLE_DOCUMENT_PRESENTATION.EXPIRED) bucket.expired += 1;
      else if (presentation === VEHICLE_DOCUMENT_PRESENTATION.EXPIRING_SOON) bucket.expiring += 1;
      documentCounts.set(doc.vehicleId, bucket);
    }
    for (const [vehicleId, bucket] of documentCounts) {
      if (bucket.expired > 0) {
        push(vehicleId, VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED, {
          title: 'Có giấy tờ đã hết hạn',
          count: bucket.expired,
          href: documentsTab(vehicleId),
        });
      }
      if (bucket.expiring > 0) {
        push(vehicleId, VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING, {
          title: 'Có giấy tờ sắp hết hạn',
          count: bucket.expiring,
          href: documentsTab(vehicleId),
        });
      }
    }

    // ── Bàn giao thiếu KM trả (Wave 7) ────────────────────────────────────
    const missingByVehicle = new Map<string, string[]>();
    for (const row of missingKm) {
      missingByVehicle.set(row.vehicleId, [
        ...(missingByVehicle.get(row.vehicleId) ?? []),
        row.bookingId,
      ]);
    }
    /**
     * Đường đi tiếp phải là chỗ người này VÀO ĐƯỢC, và không được mang định danh họ không có
     * quyền biết:
     *  - có `bookings.view` và đúng một biên bản → đi thẳng đơn đó (kèm `bookingId`);
     *  - không có quyền đơn → về hàng đợi chung, nhưng chỉ khi hàng đợi đó vào được
     *    (Trung tâm bảo dưỡng đòi `vehicles.maintenance.view`, tab đòi `handovers.view`);
     *  - không có đích nào hợp lệ → `href: null`. Thà không có lối đi còn hơn một link 403
     *    hoặc một `bookingId` rò ra ngoài.
     */
    const queueHref =
      scope.canViewMaintenance && scope.canViewHandovers
        ? '/manage/maintenance?filter=missing_return_km'
        : null;
    for (const [vehicleId, bookingIds] of missingByVehicle) {
      const soleBookingId = bookingIds.length === 1 ? bookingIds[0] : null;
      push(vehicleId, VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER, {
        title: 'Thiếu KM trả',
        detail: 'Biên bản trả xe đã chốt nhưng chưa có số KM — KM của xe chưa được cập nhật',
        count: bookingIds.length,
        href:
          scope.canViewBookings && soleBookingId
            ? `/manage/bookings?booking=${soleBookingId}`
            : queueHref,
      });
    }

    // ── Phiếu bảo dưỡng đang thực hiện ────────────────────────────────────
    for (const record of openRecords) {
      push(record.vehicleId, VEHICLE_ALERT_KIND.MAINTENANCE_IN_PROGRESS, {
        title: 'Xe đang trong lịch bảo dưỡng',
        href: maintenanceTab(record.vehicleId),
      });
    }

    // ── Duyệt công khai & thông tin còn thiếu ─────────────────────────────
    for (const vehicle of vehicles) {
      const status = vehicle.publicStatus as VehiclePublicStatus;
      if (
        status === VEHICLE_PUBLIC_STATUS.REJECTED ||
        status === VEHICLE_PUBLIC_STATUS.NEEDS_REVISION ||
        status === VEHICLE_PUBLIC_STATUS.HIDDEN
      ) {
        push(vehicle.id, VEHICLE_ALERT_KIND.PUBLIC_ACTION_REQUIRED, {
          title: 'Cần xử lý để xe hiển thị trên sàn',
          href: informationTab(vehicle.id),
        });
      }
      // Điều kiện lên sàn: có biển số, có giá ngày thường, có ảnh đại diện. Cùng bộ điều kiện
      // với `missingPublishRequirements` ở FE — nhưng ở đây server là nơi chốt.
      const missingFields = [
        vehicle.plateNumber ? null : 'biển số',
        vehicle.weekdayPrice ? null : 'giá ngày thường',
        vehicle.mainImageUrl ? null : 'ảnh đại diện',
      ].filter(Boolean) as string[];
      if (missingFields.length > 0 && status !== VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC) {
        push(vehicle.id, VEHICLE_ALERT_KIND.MISSING_VEHICLE_INFO, {
          title: 'Thiếu thông tin để gửi duyệt công khai',
          detail: `Còn thiếu: ${missingFields.join(', ')}`,
          count: missingFields.length,
          href: informationTab(vehicle.id),
        });
      }
    }

    // ── Nghĩa vụ tài chính nguồn xe (chỉ vai trò có quyền tiền) ───────────
    for (const row of obligations) {
      const daysLeft = daysUntilPaymentDay(row.paymentDay!, today);
      if (daysLeft > OBLIGATION_LEAD_DAYS) continue;
      push(row.vehicleId, VEHICLE_ALERT_KIND.SOURCE_OBLIGATION_DUE, {
        title: 'Sắp tới kỳ thanh toán nguồn xe',
        // CỐ Ý không kèm số tiền: đây là cảnh báo, không phải bảng tài chính.
        detail: daysLeft === 0 ? 'Đến hạn hôm nay' : `Còn ${daysLeft} ngày`,
        href: sourceTab(row.vehicleId),
      });
    }

    // DTO khai `kind: string` (OpenAPI enum), nhưng thứ tự phải theo union đã đặt tên —
    // ép về `VehicleAlert` để dùng đúng bảng ưu tiên duy nhất ở `@xeprime/types`.
    for (const entry of byVehicle.values()) {
      entry.alerts = sortVehicleAlerts(
        entry.alerts as unknown as VehicleAlert[],
      ) as unknown as VehicleAlertDto[];
    }
    // Giữ đúng thứ tự id người gọi hỏi; id không thuộc tenant đơn giản là vắng mặt (không lộ).
    return ids.map((id) => byVehicle.get(id)).filter(Boolean) as VehicleAlertsDto[];
  }

  /** Cảnh báo của MỘT xe — dùng cho Hồ sơ 360; cùng phép tính với lưới danh sách. */
  async forVehicle(
    tenantId: string,
    vehicleId: string,
    scope: VehicleAlertScope,
  ): Promise<VehicleAlertsDto> {
    const [row] = await this.forVehicles(tenantId, [vehicleId], scope);
    return (
      row ?? {
        vehicleId,
        currentOdometerKm: null,
        currentOdometerSource: null,
        currentOdometerAt: null,
        alerts: [],
      }
    );
  }

  /**
   * Hai ngưỡng cấu hình của gian hàng, đọc một lần cho cả lô. Dùng lại đúng khoá Wave 5/6 —
   * cảnh báo không được kể một ngưỡng khác với tab giấy tờ / tab bảo dưỡng.
   */
  private async thresholds(
    tenantId: string,
  ): Promise<{ dueSoonKm: number; documentWarningDays: number | null }> {
    const profile = await this.prisma.tenantProfile.findUnique({
      where: { tenantId },
      select: { settings: true },
    });
    const settings = profile?.settings as {
      maintenanceDueSoonKm?: unknown;
      documentExpiryWarningDays?: unknown;
    } | null;
    const dueSoon = settings?.maintenanceDueSoonKm;
    const warning = settings?.documentExpiryWarningDays;
    return {
      dueSoonKm:
        typeof dueSoon === 'number' && Number.isInteger(dueSoon) && dueSoon > 0
          ? dueSoon
          : MAINTENANCE_DUE_SOON_KM_DEFAULT,
      documentWarningDays:
        typeof warning === 'number' && Number.isInteger(warning) && warning > 0 ? warning : null,
    };
  }
}

/* ─── Đường đi tiếp (đường dẫn nội bộ, không bao giờ là tài nguyên riêng tư) ─── */

const informationTab = (id: string) => `/manage/vehicles/${id}/edit?tab=information`;
const documentsTab = (id: string) => `/manage/vehicles/${id}/edit?tab=documents`;
const maintenanceTab = (id: string) => `/manage/vehicles/${id}/edit?tab=maintenance`;
const sourceTab = (id: string) => `/manage/vehicles/${id}/edit?tab=source`;

function startOfUtcDay(value: Date): Date {
  return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/** Số ngày tới kỳ thanh toán hằng tháng gần nhất (0 = hôm nay). */
function daysUntilPaymentDay(paymentDay: number, today: Date): number {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const dayThisMonth = Math.min(paymentDay, daysInMonth);
  let due = new Date(Date.UTC(year, month, dayThisMonth));
  if (due.getTime() < today.getTime()) {
    const nextDays = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
    due = new Date(Date.UTC(year, month + 1, Math.min(paymentDay, nextDays)));
  }
  return Math.round((due.getTime() - today.getTime()) / DAY_MS);
}

/** Kiểu Prisma dùng lại ở test — khai ở đây để không rải `any` khi ghép dữ liệu. */
export type VehicleAlertRow = Prisma.VehicleGetPayload<{ select: { id: true } }>;
