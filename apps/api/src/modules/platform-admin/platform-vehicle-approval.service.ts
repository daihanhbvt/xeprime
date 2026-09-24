import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  isVehicleReviewCheck,
  VEHICLE_REVIEW_BASIS,
  VEHICLE_REVIEW_CHECK_VALUES,
  VEHICLE_TYPE,
  type VehicleReviewBasis,
  type VehicleReviewSnapshot,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PricingService } from '../pricing/pricing.service';
import {
  buildVehicleReviewSnapshot,
  readVehicleReviewSnapshot,
  vehicleApprovalBlockers,
  type VehicleApprovalBlockers,
} from '../vehicles/vehicle-review-snapshot';
import {
  approvalNotFound,
  assertApprovalPending,
  lockApprovalTask,
  type LockedApprovalTask,
} from './approval-task-lock';
import {
  SaveApprovalInternalNoteDto,
  VEHICLE_APPROVAL_DEFAULT_LIMIT,
  VEHICLE_APPROVAL_MAX_LIMIT,
  VehicleApprovalCheckDto,
  VehicleApprovalChecksDto,
  VehicleApprovalCountsDto,
  VehicleApprovalDetailDto,
  VehicleApprovalInternalNoteDto,
  VehicleApprovalListQueryDto,
  VehicleApprovalPageDto,
} from './dto/vehicle-approval.dto';
import { PlatformApprovalService, type ApprovalDecisionKind } from './platform-approval.service';

/** Mốc hàng đợi `approval_tasks.target_type` — cố định cho MỌI truy vấn của service này. */
const VEHICLE_TARGET = APPROVAL_TARGET_TYPE.VEHICLE;

/**
 * Màn "DUYỆT XE" của nền tảng (24/09/2026).
 *
 * Tách khỏi `PlatformApprovalService` (hàng đợi chung mọi loại phiếu) vì hai lý do:
 *
 *  1. **Loại phiếu là ĐIỀU KIỆN CỨNG, không phải bộ lọc.** Mọi truy vấn ở đây khoá
 *     `target_type = vehicle` ở server; không tham số nào của client mở được nó ra. Màn duyệt xe
 *     không thể vô tình liệt kê hay quyết định một phiếu gian hàng/hồ sơ người bán/giấy tờ.
 *  2. **Hồ sơ đầy đủ đến từ MỘT DTO.** Chi tiết phiếu dựng từ snapshot v2 (xe, giá, chính sách,
 *     thiết lập dịch vụ, điểm nhận, nguồn đăng) — web không phải ghép năm endpoint sống lại với
 *     nhau và hy vọng chúng khớp.
 *
 * Quyết định (phê duyệt/từ chối/yêu cầu bổ sung) KHÔNG được viết lại ở đây: nó đi qua
 * `PlatformApprovalService.decide` — một đường duy nhất giữ khoá dòng, cổng checklist, listing,
 * audit và thông báo, dù lời gọi đến từ route chung hay route xe.
 */
@Injectable()
export class PlatformVehicleApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pricing: PricingService,
    private readonly approvals: PlatformApprovalService,
  ) {}

  // -------------------------------------------------------------------------
  // Danh sách
  // -------------------------------------------------------------------------

  /**
   * Một trang hàng đợi + số phiếu theo loại xe, trong CÙNG một transaction đọc.
   *
   * Mọi bộ lọc áp ở DB trước `count`/`skip`/`take`. Thứ tự: phiếu CHỜ thì cũ nhất trước (hàng đợi
   * công bằng — người gửi trước được xem trước); xem lịch sử (mọi trạng thái khác, kể cả "tất cả")
   * thì mới nhất trước, vì khi tra lại người ta tìm việc vừa xảy ra. `id` phá hoà để phân trang
   * ổn định khi hai phiếu gửi cùng một mili-giây.
   */
  async list(query: VehicleApprovalListQueryDto): Promise<VehicleApprovalPageDto> {
    const paging = resolvePaging(query, VEHICLE_APPROVAL_DEFAULT_LIMIT, VEHICLE_APPROVAL_MAX_LIMIT);
    const q = query.q?.trim() || undefined;

    const taskWhere: Prisma.ApprovalTaskWhereInput = {
      targetType: VEHICLE_TARGET,
      ...(query.status ? { status: query.status } : {}),
      ...(query.submittedFrom || query.submittedTo
        ? {
            submittedAt: {
              ...(query.submittedFrom ? { gte: new Date(query.submittedFrom) } : {}),
              ...(query.submittedTo ? { lte: new Date(query.submittedTo) } : {}),
            },
          }
        : {}),
    };
    // Mọi chiều TRỪ loại xe — dùng chung cho danh sách và cho phép đếm theo tab.
    const subjectWhere: Prisma.ApprovalVehicleSubjectWhereInput = {
      // Xe đã xoá mềm không còn gì để duyệt — nó không thuộc hàng đợi ở bất kỳ trạng thái nào.
      vehicle: { deletedAt: null },
      ...(query.storefrontKind ? { storefrontKind: query.storefrontKind } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { plateNumber: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const listWhere: Prisma.ApprovalTaskWhereInput = {
      ...taskWhere,
      vehicleSubject: {
        is: { ...subjectWhere, ...(query.vehicleType ? { vehicleType: query.vehicleType } : {}) },
      },
    };
    const direction: Prisma.SortOrder = query.status === APPROVAL_STATUS.PENDING ? 'asc' : 'desc';

    /*
     * REPEATABLE READ: ba câu đọc thấy CÙNG một ảnh dữ liệu. Ở READ COMMITTED mặc định mỗi câu có
     * ảnh riêng, và một phiếu được gửi/duyệt chen giữa sẽ làm số trên tab lệch với danh sách.
     */
    const [total, rows, groups] = await this.prisma.$transaction(
      [
        this.prisma.approvalTask.count({ where: listWhere }),
        this.prisma.approvalTask.findMany({
          where: listWhere,
          orderBy: [{ submittedAt: direction }, { id: direction }],
          skip: paging.skip,
          take: paging.take,
          select: {
            id: true,
            status: true,
            submittedAt: true,
            submitter: { select: { displayName: true } },
            vehicleSubject: {
              select: {
                vehicleId: true,
                vehicleType: true,
                name: true,
                code: true,
                plateNumber: true,
                mainImageUrl: true,
                storefrontKind: true,
                sourceName: true,
              },
            },
          },
        }),
        this.prisma.approvalVehicleSubject.groupBy({
          by: ['vehicleType'],
          where: { ...subjectWhere, task: { is: taskWhere } },
          orderBy: { vehicleType: 'asc' },
          _count: { _all: true },
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return {
      data: rows.flatMap((row) => {
        const subject = row.vehicleSubject;
        // `listWhere` đòi có dòng hình chiếu, nên nhánh này chỉ để thu hẹp kiểu.
        if (!subject) return [];
        return [
          {
            approvalTaskId: row.id,
            approvalStatus: row.status,
            vehicleId: subject.vehicleId,
            vehicleCode: subject.code,
            vehicleName: subject.name,
            vehicleType: subject.vehicleType,
            plateNumber: subject.plateNumber,
            mainImageUrl: subject.mainImageUrl,
            storefrontKind: subject.storefrontKind,
            sourceName: subject.sourceName,
            submittedByName: row.submitter.displayName,
            submittedAt: row.submittedAt.toISOString(),
          },
        ];
      }),
      meta: paginationMeta(paging, total),
      counts: countsFrom(groups),
    };
  }

  // -------------------------------------------------------------------------
  // Chi tiết
  // -------------------------------------------------------------------------

  async detail(id: string): Promise<VehicleApprovalDetailDto> {
    const task = await this.prisma.approvalTask.findFirst({
      where: { id, targetType: VEHICLE_TARGET },
      select: {
        id: true,
        tenantId: true,
        targetId: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        reason: true,
        snapshot: true,
        internalNote: true,
        internalNoteUpdatedAt: true,
        noteEditor: { select: { displayName: true } },
        reviewer: { select: { displayName: true } },
        submitter: { select: PERSON_SELECT },
        tenant: { select: { owner: { select: PERSON_SELECT } } },
        vehicleSubject: { select: { approvalTaskId: true } },
        reviewChecks: { select: CHECK_SELECT },
        logs: {
          orderBy: { createdAt: 'asc' },
          select: {
            action: true,
            fromStatus: true,
            toStatus: true,
            note: true,
            createdAt: true,
            actor: { select: { displayName: true } },
          },
        },
      },
    });
    // Không có hình chiếu = phiếu mồ côi (xe đã bị xoá cứng) — không còn gì để duyệt.
    if (!task?.vehicleSubject) throw approvalNotFound();

    const { snapshot, basis, live } = await this.reviewData(task);
    const approvalBlockers: VehicleApprovalBlockers =
      task.status === APPROVAL_STATUS.PENDING && live
        ? vehicleApprovalBlockers(live, basis === VEHICLE_REVIEW_BASIS.SNAPSHOT ? snapshot : null)
        : { missingRequirements: [], changedLockedFields: [] };

    return {
      approvalTaskId: task.id,
      approvalStatus: task.status,
      submittedAt: task.submittedAt.toISOString(),
      reviewedAt: task.reviewedAt?.toISOString() ?? null,
      reviewedByName: task.reviewer?.displayName ?? null,
      reason: task.reason,
      basis,
      capturedAt: snapshot.capturedAt,
      vehicle: snapshot.vehicle,
      pricing: snapshot.pricing,
      services: snapshot.services,
      policy: snapshot.policy,
      pickup: snapshot.pickup,
      source: snapshot.source,
      approvalBlockers,
      owner: task.tenant?.owner ? personOf(task.tenant.owner) : null,
      submitter: personOf(task.submitter),
      manualChecks: checksOf(task.reviewChecks),
      internalNote: {
        note: task.internalNote,
        updatedAt: task.internalNoteUpdatedAt?.toISOString() ?? null,
        updatedByName: task.noteEditor?.displayName ?? null,
      },
      logs: task.logs.map((log) => ({
        action: log.action,
        fromStatus: log.fromStatus,
        toStatus: log.toStatus,
        note: log.note,
        actorName: log.actor?.displayName ?? null,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Snapshot v2 nếu phiếu có; nếu không (phiếu v1 trước 24/09/2026, hoặc seed cũ không có
   * snapshot) thì dựng bằng CHÍNH bộ dựng lúc gửi trên dữ liệu SỐNG và gắn `basis = live`.
   *
   * Cố ý không vá snapshot v1 vào khung v2: v1 thiếu chính sách giao xe, giới hạn km, tự nhận
   * chuyến, điều khoản và tiện nghi. Trộn nửa cũ nửa mới cho ra một hồ sơ trông như đã gửi mà
   * thật ra không phải — tệ hơn một hồ sơ nói thẳng "đây là dữ liệu hiện tại".
   */
  private async reviewData(task: {
    tenantId: string | null;
    targetId: string;
    status: string;
    snapshot: Prisma.JsonValue;
  }): Promise<{
    snapshot: VehicleReviewSnapshot;
    basis: VehicleReviewBasis;
    /** Xe SỐNG — chỉ dựng khi cần (phiếu cũ, hoặc phiếu còn chờ để so chặn phê duyệt). */
    live: VehicleReviewSnapshot | null;
  }> {
    const frozen = readVehicleReviewSnapshot(task.snapshot);
    if (frozen) {
      const live =
        task.status === APPROVAL_STATUS.PENDING
          ? await buildVehicleReviewSnapshot(this.prisma, {
              vehicleId: task.targetId,
              // Hai phép so chặn phê duyệt không đọc chính sách thuê.
              policy: null,
              now: new Date(),
            })
          : null;
      return { snapshot: frozen, basis: VEHICLE_REVIEW_BASIS.SNAPSHOT, live };
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: task.targetId },
      select: { tenantId: true },
    });
    if (!vehicle) throw approvalNotFound();
    const policy = await this.pricing.effectivePolicy(vehicle.tenantId, task.targetId);
    const live = await buildVehicleReviewSnapshot(this.prisma, {
      vehicleId: task.targetId,
      policy,
      now: new Date(),
    });
    if (!live) throw approvalNotFound();
    return { snapshot: live, basis: VEHICLE_REVIEW_BASIS.LIVE, live };
  }

  // -------------------------------------------------------------------------
  // Danh mục kiểm tra thủ công
  // -------------------------------------------------------------------------

  /**
   * Đánh dấu / bỏ đánh dấu MỘT mục — chỉ khi phiếu còn chờ.
   *
   * Dưới khoá dòng phiếu (`lockApprovalTask`), cùng khoá mà lượt phê duyệt giữ: bỏ đánh dấu
   * không thể chen vào giữa lúc phê duyệt đọc "đủ" và lúc nó chốt phiếu. Ghi lại đúng giá trị
   * đang có là no-op — không làm mới "ai sửa lúc nào" cho một thứ không đổi.
   */
  async setCheck(
    id: string,
    checkKey: string,
    passed: boolean,
    userId: string,
  ): Promise<VehicleApprovalChecksDto> {
    if (!isVehicleReviewCheck(checkKey)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Mục kiểm tra không hợp lệ',
        details: { checkKey },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const task = await this.lockVehicleTask(tx, id);
      assertApprovalPending(task);

      const key = { approvalTaskId: task.id, checkKey };
      const current = await tx.approvalReviewCheck.findUnique({
        where: { approvalTaskId_checkKey: key },
        select: { passed: true },
      });
      if ((current?.passed ?? false) === passed) return;

      const now = new Date();
      await tx.approvalReviewCheck.upsert({
        where: { approvalTaskId_checkKey: key },
        create: { id: newId(), ...key, passed, updatedBy: userId, updatedAt: now },
        update: { passed, updatedBy: userId, updatedAt: now },
      });
      await this.audit.record(
        {
          tenantId: task.tenantId,
          actorUserId: userId,
          actorScope: 'platform',
          action: 'approval.check_update',
          targetType: 'approval_task',
          targetId: task.id,
          before: { checkKey, passed: current?.passed ?? false },
          after: { checkKey, passed },
        },
        tx,
      );
    });

    const rows = await this.prisma.approvalReviewCheck.findMany({
      where: { approvalTaskId: id },
      select: CHECK_SELECT,
    });
    return { items: checksOf(rows) };
  }

  // -------------------------------------------------------------------------
  // Ghi chú nội bộ
  // -------------------------------------------------------------------------

  /**
   * Lưu ghi chú NỘI BỘ — khoá lạc quan theo `internal_note_updated_at`.
   *
   * Hai người duyệt cùng mở một phiếu và cùng gõ ghi chú: người lưu sau KHÔNG được xoá mất chữ
   * của người lưu trước mà không biết. Mốc so sánh đọc dưới khoá dòng, nên không có khe nào giữa
   * "so" và "ghi". Lệch ⇒ 409 kèm bản đang lưu để giao diện cho người duyệt đọc trước khi ghi
   * đè có chủ đích.
   *
   * Sửa được cả khi phiếu đã có quyết định: ghi chú là trí nhớ của đội vận hành về chiếc xe này,
   * và nó hữu ích nhất đúng lúc chủ xe gửi lại.
   */
  async saveInternalNote(
    id: string,
    dto: SaveApprovalInternalNoteDto,
    userId: string,
  ): Promise<VehicleApprovalInternalNoteDto> {
    const next = dto.note.trim() || null;
    const expected = dto.expectedUpdatedAt ? new Date(dto.expectedUpdatedAt).getTime() : null;

    return this.prisma.$transaction(async (tx) => {
      const task = await this.lockVehicleTask(tx, id);
      const current = await tx.approvalTask.findUniqueOrThrow({
        where: { id: task.id },
        select: {
          internalNote: true,
          internalNoteUpdatedAt: true,
          noteEditor: { select: { displayName: true } },
        },
      });
      const currentDto: VehicleApprovalInternalNoteDto = {
        note: current.internalNote,
        updatedAt: current.internalNoteUpdatedAt?.toISOString() ?? null,
        updatedByName: current.noteEditor?.displayName ?? null,
      };

      if ((current.internalNoteUpdatedAt?.getTime() ?? null) !== expected) {
        throw new ConflictException({
          code: API_ERROR_CODE.APPROVAL_NOTE_CONFLICT,
          message: 'Ghi chú vừa được người khác sửa. Tải lại để xem bản mới nhất.',
          details: { current: currentDto },
        });
      }
      if (next === current.internalNote) return currentDto;

      const updated = await tx.approvalTask.update({
        where: { id: task.id },
        data: {
          internalNote: next,
          internalNoteUpdatedBy: userId,
          internalNoteUpdatedAt: new Date(),
        },
        select: {
          internalNote: true,
          internalNoteUpdatedAt: true,
          noteEditor: { select: { displayName: true } },
        },
      });
      await this.audit.record(
        {
          tenantId: task.tenantId,
          actorUserId: userId,
          actorScope: 'platform',
          action: 'approval.internal_note_update',
          targetType: 'approval_task',
          targetId: task.id,
          before: { note: current.internalNote },
          after: { note: next },
        },
        tx,
      );
      return {
        note: updated.internalNote,
        updatedAt: updated.internalNoteUpdatedAt?.toISOString() ?? null,
        updatedByName: updated.noteEditor?.displayName ?? null,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Quyết định
  // -------------------------------------------------------------------------

  /** Ba quyết định — đi qua `PlatformApprovalService.decide`, khoá loại phiếu là `vehicle`. */
  async decide(
    kind: ApprovalDecisionKind,
    id: string,
    reviewerId: string,
    reason?: string,
  ): Promise<VehicleApprovalDetailDto> {
    await this.approvals.decide(kind, id, reviewerId, reason, { targetType: VEHICLE_TARGET });
    return this.detail(id);
  }

  private async lockVehicleTask(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<LockedApprovalTask> {
    const task = await lockApprovalTask(tx, id);
    if (!task || task.targetType !== VEHICLE_TARGET) throw approvalNotFound();
    return task;
  }
}

const PERSON_SELECT = { id: true, displayName: true, phone: true, email: true } as const;

const CHECK_SELECT = {
  checkKey: true,
  passed: true,
  updatedAt: true,
  updater: { select: { displayName: true } },
} as const;

function personOf(user: {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
}) {
  return { id: user.id, name: user.displayName, phone: user.phone, email: user.email };
}

/**
 * ĐỦ năm mục theo thứ tự hiển thị — mục chưa từng đánh dấu là `passed = false` không có người
 * sửa. Dòng mang khoá lạ (dữ liệu cũ hơn bộ mục hiện tại) bị bỏ qua: nó không còn là điều kiện.
 */
function checksOf(
  rows: ReadonlyArray<{
    checkKey: string;
    passed: boolean;
    updatedAt: Date;
    updater: { displayName: string };
  }>,
): VehicleApprovalCheckDto[] {
  return VEHICLE_REVIEW_CHECK_VALUES.map((key) => {
    const row = rows.find((r) => r.checkKey === key);
    return {
      key,
      passed: row?.passed ?? false,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedByName: row?.updater.displayName ?? null,
    };
  });
}

/**
 * `_count` khai lỏng vì `groupBy` đi trong `$transaction([...])` mất kiểu hẹp của `_count: { _all }`
 * — Prisma trả về union của mọi cột đếm được.
 */
function countsFrom(
  groups: ReadonlyArray<{ vehicleType: string; _count?: true | { _all?: number } }>,
): VehicleApprovalCountsDto {
  const byType = new Map(
    groups.map((g) => [g.vehicleType, typeof g._count === 'object' ? (g._count._all ?? 0) : 0]),
  );
  const car = byType.get(VEHICLE_TYPE.CAR) ?? 0;
  const motorbike = byType.get(VEHICLE_TYPE.MOTORBIKE) ?? 0;
  const all = [...byType.values()].reduce((sum, n) => sum + n, 0);
  return { all, car, motorbike };
}
