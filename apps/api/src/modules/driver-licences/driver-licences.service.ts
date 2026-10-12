import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DRIVER_LICENCE_GATE_ERROR_CODE,
  DRIVER_LICENCE_TRIP_GATE,
  evaluateDriverLicenceForTrip,
  licenceClassCoverage,
  normalizeLicenceClasses,
  type DriverLicenceGateInput,
} from '@xeprime/domain';
import { newId, Prisma, type CustomerDriverLicence } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
  DOCUMENT_MIME_EXTENSION,
  DRIVER_LICENCE_DECISION_SOURCE,
  DRIVER_LICENCE_IN_FLIGHT_STATUSES,
  DRIVER_LICENCE_KIND,
  DRIVER_LICENCE_PENDING_REASON,
  DRIVER_LICENCE_REJECT_REASON,
  DRIVER_LICENCE_REVIEWABLE_REJECT_REASONS,
  DRIVER_LICENCE_STATUS,
  DRIVER_LICENCE_UPLOAD_MAX_BYTES,
  serviceRequiresDriverLicence,
  vnDateKey,
  type DriverLicenceKind,
  type DriverLicencePendingReason,
  type DriverLicenceRejectReason,
  type DriverLicenceStatus,
  type ImageUploadMimeType,
  type PaginationMeta,
} from '@xeprime/types';
import { fromDateOnly, isValidDateOnly, toDateOnly } from '../../common/date-only';
import { FILE_SIGNATURE_PREFIX_BYTES, matchesFileSignature } from '../../common/file-signature';
import { maskEmail, maskPhone } from '../../common/mask';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { phoneLookupVariants } from '../../common/phone';
import { isUniqueViolation } from '../../common/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { R2Service } from '../storage/r2.service';
import {
  decideFromReading,
  type LicenceDecision,
  type ResolvedLicenceFields,
} from './driver-licence-decision';
import {
  ApproveDriverLicenceDto,
  DRIVER_LICENCE_DEFAULT_LIMIT,
  DRIVER_LICENCE_MAX_LIMIT,
  DriverLicenceDto,
  DriverLicenceImageDto,
  DriverLicenceOverviewDto,
  DriverLicencePresignDto,
  PlatformDriverLicenceCountsDto,
  PlatformDriverLicenceDto,
  PlatformDriverLicenceListQueryDto,
  PresignDriverLicenceDto,
  RejectDriverLicenceDto,
} from './dto/driver-licence.dto';
import {
  DRIVER_LICENCE_READER,
  DriverLicenceReaderError,
  READER_FAILURE,
  type DriverLicenceReader,
  type DriverLicenceReading,
  type ReaderFailureCode,
} from './reader/driver-licence-reader';

/** URL xem ảnh sống ngắn — đủ để hiện ảnh, không đủ để chia sẻ lại có ý nghĩa. */
const IMAGE_URL_TTL_SECONDS = 120;
/**
 * Một lượt đọc kẹt ở `processing` quá mốc này nghĩa là tiến trình đã dừng giữa chừng (khởi động
 * lại khi đang đọc). Một lượt đọc thường 2–5 giây, trần 60 giây, xếp hàng sau tối đa vài lượt khác.
 */
const STALE_PROCESSING_MS = 5 * 60_000;
/**
 * Trần lượt nộp ĐÃ TẢI XONG mỗi tài khoản trong 24 giờ. Mỗi lượt chiếm vài giây CPU của máy chủ và
 * một chỗ trong hàng đợi đọc dùng chung; người thật cần vài lần chụp lại, không cần hàng chục.
 */
const MAX_SUBMISSIONS_PER_DAY = 10;
/**
 * Tắt tiến trình: chờ lượt đọc đang dở tối đa chừng này — NGẮN HƠN 10 giây Docker cho một container
 * dừng trước khi giết hẳn. Lượt không kịp xong vẫn ở `processing` và được đọc lại lúc khởi động.
 */
const SHUTDOWN_DRAIN_MS = 8_000;

/** Lượt nộp đã có kết quả hoặc đang chờ người — thứ "lượt nộp gần nhất" được hiển thị. */
const VISIBLE_STATUSES: DriverLicenceStatus[] = [
  DRIVER_LICENCE_STATUS.PROCESSING,
  DRIVER_LICENCE_STATUS.PENDING_REVIEW,
  DRIVER_LICENCE_STATUS.VERIFIED,
  DRIVER_LICENCE_STATUS.REJECTED,
];

/** Vì sao một lượt nộp đang chờ người duyệt — lưu trong `ocr_result_json`. */
type PendingReason = DriverLicencePendingReason;

/** Hình dạng của `ocr_result_json`. */
interface StoredReading {
  reading: DriverLicenceReading | null;
  pendingReason: PendingReason | null;
}

const OWNER_SELECT = {
  id: true,
  displayName: true,
  phone: true,
  email: true,
} satisfies Prisma.UserSelect;

type PlatformRow = CustomerDriverLicence & {
  user: Prisma.UserGetPayload<{ select: typeof OWNER_SELECT }>;
  decider: { displayName: string } | null;
};

/**
 * Bằng lái của tài khoản khách — ADR 0057. Writer DUY NHẤT của `customer_driver_licences`.
 *
 * Vòng đời một lượt nộp:
 *   presign (`uploading`) → khách PUT ảnh lên R2 → complete (kiểm kích thước + chữ ký định dạng,
 *   chuyển `processing`, trả về NGAY) → đọc ảnh chạy nền → `verified` | `rejected` |
 *   `pending_review` → người duyệt của nền tảng chốt `verified` | `rejected`.
 *
 * Đọc ảnh chạy NỀN chứ không trong request: một lượt đọc mất vài giây, và các lượt nộp cùng lúc
 * xếp hàng chờ MỘT worker Tesseract — đọc trong request là treo request theo hàng đợi đó. Client
 * hỏi lại trạng thái (`GET /account/driver-licence`).
 */
@Injectable()
export class DriverLicencesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DriverLicencesService.name);
  private readonly readings = new Set<Promise<void>>();
  private readonly enforcement: 'on' | 'off';

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
    private readonly audit: AuditService,
    @Inject(DRIVER_LICENCE_READER) private readonly reader: DriverLicenceReader,
    config: ConfigService,
  ) {
    this.enforcement = config.get<'on' | 'off'>('DRIVER_LICENCE_ENFORCEMENT') ?? 'on';
  }

  // ── Phía khách ─────────────────────────────────────────────────────────────────────────

  async getOverview(userId: string): Promise<DriverLicenceOverviewDto> {
    await this.recoverStaleProcessing({ userId });
    const { verified, latest } = await this.loadCurrent(userId);
    return {
      verified: verified ? toDto(verified) : null,
      latest: latest ? toDto(latest) : null,
    };
  }

  /**
   * Bước 1: tạo lượt nộp `uploading` + phát URL PUT. `id` và `object_key` do SERVER sinh. Lượt
   * dở cũ (chờ duyệt, tải dở) chuyển `cancelled` — khách vừa quyết định nộp ảnh khác.
   */
  async presign(userId: string, dto: PresignDriverLicenceDto): Promise<DriverLicencePresignDto> {
    this.assertStorage();
    await this.recoverStaleProcessing({ userId });

    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const recent = await this.prisma.customerDriverLicence.count({
      where: { userId, uploadedAt: { gte: since } },
    });
    if (recent >= MAX_SUBMISSIONS_PER_DAY) {
      throw new HttpException(
        {
          code: API_ERROR_CODE.DRIVER_LICENCE_SUBMISSION_LIMIT,
          message: 'Bạn đã nộp ảnh bằng lái nhiều lần trong 24 giờ qua — vui lòng thử lại sau.',
          details: { limit: MAX_SUBMISSIONS_PER_DAY },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const id = newId();
    const mimeType = dto.contentType as ImageUploadMimeType;
    const objectKey = `customers/${userId}/driver-licences/${id}.${DOCUMENT_MIME_EXTENSION[mimeType]}`;

    try {
      await this.prisma.$transaction(async (tx) => {
        const open = await tx.customerDriverLicence.findFirst({
          where: { userId, status: { in: [...DRIVER_LICENCE_IN_FLIGHT_STATUSES] } },
          select: { id: true, status: true },
        });
        if (open?.status === DRIVER_LICENCE_STATUS.PROCESSING) {
          // Lượt trước đang được đọc (chưa quá hạn — `recoverStaleProcessing` vừa chạy).
          throw stateConflict('Ảnh trước đang được đọc — vui lòng đợi vài giây.');
        }
        if (open) {
          await tx.customerDriverLicence.updateMany({
            where: { id: open.id, status: open.status },
            data: { status: DRIVER_LICENCE_STATUS.CANCELLED },
          });
        }
        await tx.customerDriverLicence.create({
          data: {
            id,
            userId,
            status: DRIVER_LICENCE_STATUS.UPLOADING,
            objectKey,
            mimeType,
            sizeBytes: dto.fileSize,
            consentedAt: new Date(),
          },
        });
      });
    } catch (error) {
      // Hai lượt presign cùng lúc của cùng một người — partial unique "một lượt đang dở" chặn.
      if (isUniqueViolation(error)) throw stateConflict('Đang có một lượt nộp khác — thử lại.');
      throw error;
    }
    // Ảnh của lượt vừa bị thay không còn ai cần — xoá ngay, không đợi.
    await this.purgeObsoleteImages(userId, { includeRejected: false });

    const ticket = await this.r2.presignPrivateUpload({
      key: objectKey,
      contentType: mimeType,
      contentLength: dto.fileSize,
    });
    return { licenceId: id, uploadUrl: ticket.uploadUrl, expiresIn: ticket.expiresIn };
  }

  /**
   * Bước 2: PUT thành công CHƯA phải bằng chứng ảnh hợp lệ — HEAD (đúng dung lượng đã khai, đúng
   * loại) + chữ ký byte đầu. Đạt thì chuyển `processing`, khởi động lượt đọc NỀN, trả về ngay.
   * Gọi lại sau khi đã xong là idempotent.
   */
  async complete(userId: string, id: string): Promise<DriverLicenceDto> {
    this.assertStorage();
    const row = await this.prisma.customerDriverLicence.findFirst({ where: { id, userId } });
    if (!row) throw licenceNotFound();
    if (row.status !== DRIVER_LICENCE_STATUS.UPLOADING) {
      if (row.uploadedAt) return toDto(row);
      throw stateConflict('Lượt nộp này không còn hiệu lực — vui lòng chọn lại ảnh.');
    }

    const head = await this.r2.headPrivateObject(row.objectKey);
    if (!head) {
      throw new BadRequestException({
        code: API_ERROR_CODE.DRIVER_LICENCE_IMAGE_INVALID,
        message: 'Chưa nhận được ảnh — vui lòng tải lên lại.',
      });
    }
    const prefix = await this.r2.readPrivateObjectPrefix(
      row.objectKey,
      FILE_SIGNATURE_PREFIX_BYTES,
    );
    if (
      head.size !== row.sizeBytes ||
      head.size > DRIVER_LICENCE_UPLOAD_MAX_BYTES ||
      (head.contentType !== null && head.contentType !== row.mimeType) ||
      !matchesFileSignature(row.mimeType, prefix)
    ) {
      throw new BadRequestException({
        code: API_ERROR_CODE.DRIVER_LICENCE_IMAGE_INVALID,
        message: 'Tệp tải lên không phải ảnh hợp lệ — hãy chọn ảnh JPG, PNG hoặc WEBP.',
      });
    }

    const now = new Date();
    const claimed = await this.prisma.customerDriverLicence.updateMany({
      where: { id, status: DRIVER_LICENCE_STATUS.UPLOADING },
      data: {
        status: DRIVER_LICENCE_STATUS.PROCESSING,
        uploadedAt: now,
        ocrProvider: this.reader.name,
        ocrModel: this.reader.model,
      },
    });
    if (claimed.count === 0) {
      const again = await this.prisma.customerDriverLicence.findUniqueOrThrow({ where: { id } });
      if (again.uploadedAt) return toDto(again);
      throw stateConflict('Lượt nộp này không còn hiệu lực — vui lòng chọn lại ảnh.');
    }

    // Giấy tờ tuỳ thân vào hệ thống — để lại vết. KHÔNG ghi object key / nội dung đọc được.
    await this.audit.record({
      actorUserId: userId,
      actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
      action: 'driver_licence.submit',
      targetType: AUDIT_TARGET_TYPE.CUSTOMER_DRIVER_LICENCE,
      targetId: id,
    });

    this.startReading(id);
    return toDto(await this.prisma.customerDriverLicence.findUniqueOrThrow({ where: { id } }));
  }

  /**
   * Khách nhờ người xem lại một lượt MÁY từ chối vì lý do máy có thể đọc sai (ảnh mờ, thiếu
   * trường, không nhận ra hạng). Một lần cho mỗi lượt nộp, và chỉ với lượt nộp mới nhất.
   */
  async requestReview(userId: string, id: string): Promise<DriverLicenceDto> {
    const row = await this.prisma.customerDriverLicence.findFirst({ where: { id, userId } });
    if (!row) throw licenceNotFound();
    if (!canRequestReview(row)) {
      throw stateConflict('Lượt nộp này không thể gửi xem lại.');
    }
    const newer = await this.prisma.customerDriverLicence.count({
      where: {
        userId,
        createdAt: { gt: row.createdAt },
        status: { notIn: [DRIVER_LICENCE_STATUS.CANCELLED] },
      },
    });
    if (newer > 0) throw stateConflict('Bạn đã nộp ảnh mới hơn — không cần gửi xem lại ảnh cũ.');

    const stored = readStored(row.ocrResult);
    try {
      const claimed = await this.prisma.customerDriverLicence.updateMany({
        where: {
          id,
          status: DRIVER_LICENCE_STATUS.REJECTED,
          decisionSource: DRIVER_LICENCE_DECISION_SOURCE.AUTO,
          reviewRequestedAt: null,
        },
        data: {
          status: DRIVER_LICENCE_STATUS.PENDING_REVIEW,
          rejectionReason: null,
          decisionSource: null,
          decidedAt: null,
          reviewRequestedAt: new Date(),
          ocrResult: toJson({
            ...stored,
            pendingReason: DRIVER_LICENCE_PENDING_REASON.CUSTOMER_REQUEST,
          }),
        },
      });
      if (claimed.count === 0) throw stateConflict('Lượt nộp này vừa thay đổi — tải lại trang.');
    } catch (error) {
      if (isUniqueViolation(error)) throw stateConflict('Đang có một lượt nộp khác chờ xử lý.');
      throw error;
    }
    return toDto(await this.prisma.customerDriverLicence.findUniqueOrThrow({ where: { id } }));
  }

  /** Ảnh của CHÍNH mình — URL sống ngắn. */
  async imageForOwner(userId: string, id: string): Promise<DriverLicenceImageDto> {
    this.assertStorage();
    const row = await this.prisma.customerDriverLicence.findFirst({
      where: { id, userId, uploadedAt: { not: null }, imageDeletedAt: null },
      select: { id: true, objectKey: true, mimeType: true },
    });
    if (!row) throw licenceNotFound();
    return this.signImage(row);
  }

  // ── Cổng đặt xe ────────────────────────────────────────────────────────────────────────

  /**
   * Cổng "phải có bằng lái hợp lệ cho CHUYẾN NÀY" — gọi từ `BookingRequestsService.submitPublic`.
   * Thuê có tài xế thì bỏ qua. `userId = null` (khách chưa có tài khoản) ⇒ chưa có bằng.
   */
  async assertCanDriveForTrip(input: {
    userId: string | null;
    serviceType: string | null | undefined;
    vehicleType: string | null | undefined;
    /** Ngày cuối của chuyến theo giờ Việt Nam (`YYYY-MM-DD`) — bằng phải còn hạn tới hết ngày đó. */
    lastDayKey: string;
  }): Promise<void> {
    if (!serviceRequiresDriverLicence(input.serviceType)) return;
    if (this.enforcement === 'off') return;

    const current = input.userId
      ? await this.loadCurrent(input.userId)
      : { verified: null, latest: null };
    const gate = evaluateDriverLicenceForTrip(
      {
        verified: current.verified ? toGateInput(current.verified) : null,
        latest: current.latest ? toGateInput(current.latest) : null,
      },
      { vehicleType: input.vehicleType, lastDayKey: input.lastDayKey },
    );

    switch (gate) {
      case DRIVER_LICENCE_TRIP_GATE.OK:
        return;
      case DRIVER_LICENCE_TRIP_GATE.PENDING_REVIEW:
        throw new ForbiddenException({
          code: DRIVER_LICENCE_GATE_ERROR_CODE[gate],
          message: 'Bằng lái của bạn đang chờ XePrime xác thực — bạn sẽ đặt được xe ngay sau đó.',
        });
      case DRIVER_LICENCE_TRIP_GATE.EXPIRED:
        throw new ForbiddenException({
          code: DRIVER_LICENCE_GATE_ERROR_CODE[gate],
          message: 'Bằng lái hết hạn trước khi chuyến kết thúc — vui lòng cập nhật bằng còn hạn.',
          details: { expiresOn: fromDateOnly(current.verified?.expiresOn ?? null) },
        });
      case DRIVER_LICENCE_TRIP_GATE.CLASS_MISMATCH:
        throw new ForbiddenException({
          code: DRIVER_LICENCE_GATE_ERROR_CODE[gate],
          message: 'Hạng bằng lái của bạn không lái được loại xe này.',
          details: { vehicleType: input.vehicleType ?? null },
        });
      default:
        throw new ForbiddenException({
          code: DRIVER_LICENCE_GATE_ERROR_CODE[DRIVER_LICENCE_TRIP_GATE.MISSING],
          message: 'Bạn cần xác thực bằng lái xe trước khi đặt xe tự lái.',
          details: { status: current.latest?.status ?? null },
        });
    }
  }

  // ── Phía nền tảng ──────────────────────────────────────────────────────────────────────

  async listForPlatform(
    query: PlatformDriverLicenceListQueryDto,
  ): Promise<{ data: PlatformDriverLicenceDto[]; meta: PaginationMeta }> {
    await this.recoverStaleProcessing({});
    const paging = resolvePaging(query, DRIVER_LICENCE_DEFAULT_LIMIT, DRIVER_LICENCE_MAX_LIMIT);
    // Không lọc = VIỆC CẦN LÀM, không phải toàn bộ lịch sử.
    const status =
      (query.status as DriverLicenceStatus | undefined) ?? DRIVER_LICENCE_STATUS.PENDING_REVIEW;
    const q = query.q?.trim();
    const where: Prisma.CustomerDriverLicenceWhereInput = {
      status,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { licenceNumber: { contains: q.replace(/\s+/g, ''), mode: 'insensitive' } },
              { user: { displayName: { contains: q, mode: 'insensitive' } } },
              { user: { phone: { in: phoneLookupVariants(q) } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.customerDriverLicence.count({ where }),
      this.prisma.customerDriverLicence.findMany({
        where,
        // Hàng đợi: cũ nhất trước (FIFO). Lịch sử: mới nhất trước.
        orderBy: {
          createdAt: status === DRIVER_LICENCE_STATUS.PENDING_REVIEW ? 'asc' : 'desc',
        },
        skip: paging.skip,
        take: paging.take,
        include: { user: { select: OWNER_SELECT }, decider: { select: { displayName: true } } },
      }),
    ]);
    return {
      data: rows.map((row) => toPlatformDto(row)),
      meta: paginationMeta(paging, total),
    };
  }

  async countsForPlatform(): Promise<PlatformDriverLicenceCountsDto> {
    const groups = await this.prisma.customerDriverLicence.groupBy({
      by: ['status'],
      where: {
        status: {
          in: [
            DRIVER_LICENCE_STATUS.PENDING_REVIEW,
            DRIVER_LICENCE_STATUS.VERIFIED,
            DRIVER_LICENCE_STATUS.REJECTED,
          ],
        },
      },
      _count: { _all: true },
    });
    const count = (s: DriverLicenceStatus) => groups.find((g) => g.status === s)?._count._all ?? 0;
    return {
      pendingReview: count(DRIVER_LICENCE_STATUS.PENDING_REVIEW),
      verified: count(DRIVER_LICENCE_STATUS.VERIFIED),
      rejected: count(DRIVER_LICENCE_STATUS.REJECTED),
    };
  }

  /**
   * Chi tiết một lượt nộp. Liên hệ của chủ tài khoản VẪN CHE: đối chiếu bằng lái cần ảnh + thông
   * tin trên bằng, không cần SĐT/email đầy đủ — và quyền duyệt bằng lái (reviewer) KHÔNG phải quyền
   * xem PII khách. Cần liên hệ thì đi qua "Hiện liên hệ" của màn Khách thuê (quyền riêng + audit).
   */
  async getForPlatform(id: string): Promise<PlatformDriverLicenceDto> {
    return toPlatformDto(await this.findPlatformRow(id));
  }

  /** Mở ảnh bằng lái của một khách — mỗi lần mở một dòng audit. */
  async imageForPlatform(id: string, actorUserId: string): Promise<DriverLicenceImageDto> {
    this.assertStorage();
    const row = await this.prisma.customerDriverLicence.findFirst({
      where: { id, uploadedAt: { not: null }, imageDeletedAt: null },
      select: { id: true, objectKey: true, mimeType: true },
    });
    if (!row) throw licenceNotFound();
    const image = await this.signImage(row);
    await this.audit.record({
      actorUserId,
      actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
      action: 'driver_licence.view_image',
      targetType: AUDIT_TARGET_TYPE.CUSTOMER_DRIVER_LICENCE,
      targetId: id,
    });
    return image;
  }

  /**
   * Người duyệt CHỐT bằng hợp lệ — với thông tin họ đã đối chiếu (sửa được chỗ máy đọc sai).
   * Bằng đang dùng trước đó (nếu có) chuyển `superseded` trong CÙNG transaction.
   */
  async approve(
    id: string,
    actorUserId: string,
    dto: ApproveDriverLicenceDto,
  ): Promise<PlatformDriverLicenceDto> {
    const before = await this.findPlatformRow(id);
    if (before.status !== DRIVER_LICENCE_STATUS.PENDING_REVIEW) throw notPending(before.status);

    for (const value of [dto.dateOfBirth, dto.issuedOn, dto.expiresOn]) {
      // `@Matches` chỉ kiểm HÌNH; 2026-02-30 qua được nó và bị `Date` âm thầm đẩy sang tháng 3.
      if (value && !isValidDateOnly(value)) throw invalidReview(`Ngày không có thật: ${value}`);
    }
    const fields = resolveManualFields(dto);
    const today = vnDateKey(new Date());
    if (fields.classes.length === 0) {
      throw invalidReview('Hạng bằng không hợp lệ — nhập hạng như in trên bằng (vd B2, A1).');
    }
    if (fields.noExpiry === Boolean(fields.expiresOn)) {
      throw invalidReview('Chọn MỘT trong hai: ngày hết hạn, hoặc "không thời hạn".');
    }
    if (fields.expiresOn && fields.expiresOn < today) {
      throw invalidReview('Bằng đã hết hạn — hãy từ chối với lý do "Bằng đã hết hạn".');
    }
    if (!fields.coversCar && !fields.coversMotorbike) {
      throw invalidReview('Hạng bằng không lái được ô tô lẫn xe máy — không thể duyệt.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.customerDriverLicence.updateMany({
        where: { userId: before.userId, status: DRIVER_LICENCE_STATUS.VERIFIED },
        data: { status: DRIVER_LICENCE_STATUS.SUPERSEDED },
      });
      const claimed = await tx.customerDriverLicence.updateMany({
        where: { id, status: DRIVER_LICENCE_STATUS.PENDING_REVIEW },
        data: {
          ...fieldColumns(fields),
          status: DRIVER_LICENCE_STATUS.VERIFIED,
          decisionSource: DRIVER_LICENCE_DECISION_SOURCE.MANUAL,
          decidedBy: actorUserId,
          decidedAt: new Date(),
          reviewNote: null,
        },
      });
      if (claimed.count === 0) throw decidedByOther();
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'driver_licence.verified',
          targetType: AUDIT_TARGET_TYPE.CUSTOMER_DRIVER_LICENCE,
          targetId: id,
          before: { status: before.status },
          after: {
            status: DRIVER_LICENCE_STATUS.VERIFIED,
            kind: fields.kind,
            classes: fields.classes,
            expiresOn: fields.expiresOn,
            noExpiry: fields.noExpiry,
            coversCar: fields.coversCar,
            coversMotorbike: fields.coversMotorbike,
          },
        },
        tx,
      );
    });
    // Có bằng hợp lệ ⇒ ảnh bằng cũ và các lượt bị từ chối trước đó hết lý do để giữ.
    await this.purgeObsoleteImages(before.userId, { includeRejected: true });
    return this.getForPlatform(id);
  }

  async reject(
    id: string,
    actorUserId: string,
    dto: RejectDriverLicenceDto,
  ): Promise<PlatformDriverLicenceDto> {
    const before = await this.findPlatformRow(id);
    if (before.status !== DRIVER_LICENCE_STATUS.PENDING_REVIEW) throw notPending(before.status);
    const reason = dto.reason as DriverLicenceRejectReason;
    const note = dto.note?.trim() || null;
    if (reason === DRIVER_LICENCE_REJECT_REASON.OTHER && !note) {
      throw invalidReview('Lý do "khác" cần một lời nhắn cho khách.');
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.customerDriverLicence.updateMany({
        where: { id, status: DRIVER_LICENCE_STATUS.PENDING_REVIEW },
        data: {
          status: DRIVER_LICENCE_STATUS.REJECTED,
          rejectionReason: reason,
          reviewNote: note,
          decisionSource: DRIVER_LICENCE_DECISION_SOURCE.MANUAL,
          decidedBy: actorUserId,
          decidedAt: new Date(),
        },
      });
      if (claimed.count === 0) throw decidedByOther();
      await this.audit.record(
        {
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: 'driver_licence.rejected',
          targetType: AUDIT_TARGET_TYPE.CUSTOMER_DRIVER_LICENCE,
          targetId: id,
          before: { status: before.status },
          after: { status: DRIVER_LICENCE_STATUS.REJECTED, reason, ...(note ? { note } : {}) },
        },
        tx,
      );
    });
    return this.getForPlatform(id);
  }

  // ── Đọc ảnh (chạy nền) ─────────────────────────────────────────────────────────────────

  /** Chờ mọi lượt đọc đang chạy — cho test và cho lúc tắt tiến trình. */
  async drainReadings(): Promise<void> {
    while (this.readings.size > 0) await Promise.allSettled([...this.readings]);
  }

  /**
   * Khởi động lại: lượt nào còn `processing` là lượt của tiến trình trước (một VPS, một API) —
   * đọc lại ngay thay vì để khách nhìn vòng quay 5 phút rồi rơi vào hàng đợi tay. Ghi có điều
   * kiện trạng thái nên chạy trùng cũng chỉ một lượt thắng.
   */
  async onApplicationBootstrap(): Promise<void> {
    const orphans = await this.prisma.customerDriverLicence
      .findMany({
        where: { status: DRIVER_LICENCE_STATUS.PROCESSING },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: 50,
      })
      .catch(() => []);
    if (orphans.length === 0) return;
    // LẦN LƯỢT, không đồng loạt: bộ đọc chạy một ảnh mỗi lúc, và 50 lượt cùng xếp hàng là 50 ảnh
    // nằm trong RAM — vượt trần hàng đợi thì các lượt sau bị đẩy oan sang người duyệt.
    const resume: Promise<void> = (async () => {
      for (const row of orphans) await this.processReading(row.id);
    })().finally(() => this.readings.delete(resume));
    this.readings.add(resume);
  }

  /**
   * Tắt tiến trình (deploy): cho lượt đọc đang dở một khoảng ngắn để xong, không chờ vô hạn, RỒI
   * mới tắt bộ đọc — tắt trước thì chính các lượt đang chờ đó hỏng oan sang hàng đợi duyệt tay.
   *
   * `onModuleDestroy`, không phải `onApplicationShutdown`: Nest gọi MỌI `onModuleDestroy` trước mọi
   * `onApplicationShutdown`, và `PrismaModule` (global) huỷ SAU CÙNG — chỉ ở đây lượt đọc còn ghi
   * được kết quả xuống DB.
   */
  async onModuleDestroy(): Promise<void> {
    await Promise.race([
      this.drainReadings(),
      new Promise((r) => setTimeout(r, SHUTDOWN_DRAIN_MS)),
    ]);
    await this.reader.dispose?.().catch(() => undefined);
  }

  /**
   * Xoá ẢNH (giữ dòng) của những lượt nộp không còn cần ảnh: lượt bị huỷ, bằng đã bị thay, và — khi
   * người đó vừa có bằng hợp lệ — các lượt bị từ chối trước đó (thường là ảnh CCCD/hộ chiếu chụp
   * nhầm). Chạy SAU commit và best-effort: R2 lỗi thì ảnh còn đó cho lần dọn sau, quyết định đã chốt
   * không bị ảnh hưởng.
   */
  private async purgeObsoleteImages(
    userId: string,
    opts: { includeRejected: boolean },
  ): Promise<void> {
    if (!this.r2.privateEnabled) return;
    const statuses: DriverLicenceStatus[] = [
      DRIVER_LICENCE_STATUS.CANCELLED,
      DRIVER_LICENCE_STATUS.SUPERSEDED,
      ...(opts.includeRejected ? [DRIVER_LICENCE_STATUS.REJECTED] : []),
    ];
    try {
      const rows = await this.prisma.customerDriverLicence.findMany({
        where: { userId, status: { in: statuses }, imageDeletedAt: null },
        select: { id: true, objectKey: true },
      });
      for (const row of rows) {
        if (!(await this.r2.deletePrivateObject(row.objectKey))) continue;
        await this.prisma.customerDriverLicence.update({
          where: { id: row.id },
          data: { imageDeletedAt: new Date() },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Dọn ảnh bằng lái của ${userId} chưa xong: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private startReading(id: string): void {
    const job: Promise<void> = this.processReading(id).finally(() => this.readings.delete(job));
    this.readings.add(job);
  }

  /**
   * Đọc ảnh của một lượt `processing` rồi ghi quyết định. KHÔNG BAO GIỜ để lượt nộp kẹt ở
   * `processing`: mọi lỗi ngoài dự kiến (DB, R2, bug) đẩy nó sang hàng đợi duyệt tay.
   */
  async processReading(id: string): Promise<void> {
    try {
      await this.readAndDecide(id);
    } catch (error) {
      this.logger.error(
        `Lượt đọc bằng lái ${id} hỏng ngoài dự kiến: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.toPendingReview(
        id,
        null,
        DRIVER_LICENCE_PENDING_REASON.READER_UNAVAILABLE,
        READER_FAILURE.PROVIDER_ERROR,
      ).catch(() => undefined);
    }
  }

  private async readAndDecide(id: string): Promise<void> {
    const row = await this.prisma.customerDriverLicence.findUnique({ where: { id } });
    if (!row || row.status !== DRIVER_LICENCE_STATUS.PROCESSING) return;

    if (!this.reader.enabled) {
      await this.toPendingReview(
        id,
        null,
        DRIVER_LICENCE_PENDING_REASON.READER_UNAVAILABLE,
        READER_FAILURE.NOT_CONFIGURED,
      );
      return;
    }
    const image = await this.r2.readPrivateObject(row.objectKey, DRIVER_LICENCE_UPLOAD_MAX_BYTES);
    if (!image) {
      await this.toPendingReview(
        id,
        null,
        DRIVER_LICENCE_PENDING_REASON.READER_UNAVAILABLE,
        READER_FAILURE.IMAGE_UNAVAILABLE,
      );
      return;
    }

    let reading: DriverLicenceReading;
    try {
      reading = await this.reader.read({ image, mimeType: row.mimeType as ImageUploadMimeType });
    } catch (error) {
      const code =
        error instanceof DriverLicenceReaderError ? error.code : READER_FAILURE.PROVIDER_ERROR;
      this.logger.warn(`Không đọc được bằng lái ${id}: ${code}`);
      await this.toPendingReview(id, null, DRIVER_LICENCE_PENDING_REASON.READER_UNAVAILABLE, code);
      return;
    }

    await this.applyAutoDecision(row, reading, decideFromReading(reading, vnDateKey(new Date())));
  }

  private async applyAutoDecision(
    row: CustomerDriverLicence,
    reading: DriverLicenceReading,
    decision: LicenceDecision,
  ): Promise<void> {
    const now = new Date();
    const base = {
      ...fieldColumns(decision.fields),
      ocrCompletedAt: now,
      ocrErrorCode: null,
    };

    if (decision.status === DRIVER_LICENCE_STATUS.PENDING_REVIEW) {
      await this.prisma.customerDriverLicence.updateMany({
        where: { id: row.id, status: DRIVER_LICENCE_STATUS.PROCESSING },
        data: {
          ...base,
          status: DRIVER_LICENCE_STATUS.PENDING_REVIEW,
          ocrResult: toJson({ reading, pendingReason: decision.why }),
        },
      });
      return;
    }

    const ocrResult = toJson({ reading, pendingReason: null });
    if (decision.status === DRIVER_LICENCE_STATUS.REJECTED) {
      await this.prisma.customerDriverLicence.updateMany({
        where: { id: row.id, status: DRIVER_LICENCE_STATUS.PROCESSING },
        data: {
          ...base,
          ocrResult,
          status: DRIVER_LICENCE_STATUS.REJECTED,
          rejectionReason: decision.reason,
          decisionSource: DRIVER_LICENCE_DECISION_SOURCE.AUTO,
          decidedAt: now,
        },
      });
      return;
    }

    // Xác thực: thay bằng đang dùng + chốt bằng mới trong MỘT transaction. Lượt nộp bị huỷ giữa
    // chừng (khách nộp ảnh khác) thì rollback — bằng cũ không bị thay bởi một bằng đã bỏ.
    await this.prisma
      .$transaction(async (tx) => {
        await tx.customerDriverLicence.updateMany({
          where: { userId: row.userId, status: DRIVER_LICENCE_STATUS.VERIFIED },
          data: { status: DRIVER_LICENCE_STATUS.SUPERSEDED },
        });
        const claimed = await tx.customerDriverLicence.updateMany({
          where: { id: row.id, status: DRIVER_LICENCE_STATUS.PROCESSING },
          data: {
            ...base,
            ocrResult,
            status: DRIVER_LICENCE_STATUS.VERIFIED,
            decisionSource: DRIVER_LICENCE_DECISION_SOURCE.AUTO,
            decidedAt: now,
          },
        });
        if (claimed.count === 0) throw new SupersededReading();
      })
      .then(() => this.purgeObsoleteImages(row.userId, { includeRejected: true }))
      .catch((error: unknown) => {
        if (error instanceof SupersededReading) return;
        throw error;
      });
  }

  private async toPendingReview(
    id: string,
    reading: DriverLicenceReading | null,
    pendingReason: PendingReason,
    errorCode: ReaderFailureCode | null,
  ): Promise<void> {
    await this.prisma.customerDriverLicence.updateMany({
      where: { id, status: DRIVER_LICENCE_STATUS.PROCESSING },
      data: {
        status: DRIVER_LICENCE_STATUS.PENDING_REVIEW,
        ocrResult: toJson({ reading, pendingReason }),
        ocrErrorCode: errorCode,
        ocrCompletedAt: new Date(),
      },
    });
  }

  /**
   * Lượt đọc kẹt ở `processing` (tiến trình khởi động lại giữa chừng) ⇒ chuyển sang người duyệt.
   * Chạy trên đường đọc của khách và của hàng đợi — idempotent, không cần job riêng.
   */
  private async recoverStaleProcessing(scope: { userId?: string }): Promise<void> {
    await this.prisma.customerDriverLicence.updateMany({
      where: {
        ...(scope.userId ? { userId: scope.userId } : {}),
        status: DRIVER_LICENCE_STATUS.PROCESSING,
        updatedAt: { lt: new Date(Date.now() - STALE_PROCESSING_MS) },
      },
      data: {
        status: DRIVER_LICENCE_STATUS.PENDING_REVIEW,
        ocrErrorCode: READER_FAILURE.INTERRUPTED,
        ocrResult: toJson({
          reading: null,
          pendingReason: DRIVER_LICENCE_PENDING_REASON.READER_UNAVAILABLE,
        }),
        ocrCompletedAt: new Date(),
      },
    });
  }

  // ── Nội bộ ─────────────────────────────────────────────────────────────────────────────

  private async loadCurrent(
    userId: string,
  ): Promise<{ verified: CustomerDriverLicence | null; latest: CustomerDriverLicence | null }> {
    const [verified, latest] = await Promise.all([
      this.prisma.customerDriverLicence.findFirst({
        where: { userId, status: DRIVER_LICENCE_STATUS.VERIFIED },
      }),
      this.prisma.customerDriverLicence.findFirst({
        where: { userId, status: { in: VISIBLE_STATUSES } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { verified, latest };
  }

  private async findPlatformRow(id: string): Promise<PlatformRow> {
    const row = await this.prisma.customerDriverLicence.findUnique({
      where: { id },
      include: { user: { select: OWNER_SELECT }, decider: { select: { displayName: true } } },
    });
    if (!row || row.status === DRIVER_LICENCE_STATUS.UPLOADING) throw licenceNotFound();
    return row;
  }

  private async signImage(row: {
    id: string;
    objectKey: string;
    mimeType: string;
  }): Promise<DriverLicenceImageDto> {
    const ext = DOCUMENT_MIME_EXTENSION[row.mimeType as ImageUploadMimeType] ?? 'jpg';
    const ticket = await this.r2.presignPrivateDownload(
      row.objectKey,
      `bang-lai-${row.id}.${ext}`,
      IMAGE_URL_TTL_SECONDS,
    );
    return { url: ticket.downloadUrl, expiresIn: ticket.expiresIn };
  }

  private assertStorage(): void {
    if (!this.r2.privateEnabled) {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODE.UPLOADS_NOT_CONFIGURED,
        message: 'Kho lưu trữ riêng tư chưa được cấu hình',
      });
    }
  }
}

/** Lượt nộp đã bị huỷ trong lúc đọc — tín hiệu rollback nội bộ, không phải lỗi. */
class SupersededReading extends Error {}

// ── Ánh xạ ──────────────────────────────────────────────────────────────────────────────────

function readStored(value: Prisma.JsonValue | null): StoredReading {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as unknown as Partial<StoredReading>;
    return { reading: v.reading ?? null, pendingReason: v.pendingReason ?? null };
  }
  return { reading: null, pendingReason: null };
}

function toJson(value: StoredReading): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

function canRequestReview(row: CustomerDriverLicence): boolean {
  return (
    row.status === DRIVER_LICENCE_STATUS.REJECTED &&
    row.decisionSource === DRIVER_LICENCE_DECISION_SOURCE.AUTO &&
    row.reviewRequestedAt === null &&
    row.rejectionReason !== null &&
    DRIVER_LICENCE_REVIEWABLE_REJECT_REASONS.includes(
      row.rejectionReason as DriverLicenceRejectReason,
    )
  );
}

function fieldColumns(fields: ResolvedLicenceFields) {
  return {
    kind: fields.kind,
    licenceNumber: fields.licenceNumber,
    fullName: fields.fullName,
    dateOfBirth: fields.dateOfBirth ? toDateOnly(fields.dateOfBirth) : null,
    licenceClasses: fields.classes,
    issuedOn: fields.issuedOn ? toDateOnly(fields.issuedOn) : null,
    expiresOn: fields.expiresOn ? toDateOnly(fields.expiresOn) : null,
    noExpiry: fields.noExpiry,
    issuingCountry: fields.issuingCountry,
    coversCar: fields.coversCar,
    coversMotorbike: fields.coversMotorbike,
  };
}

/** Trường người duyệt nhập — GPLX VN/IDP vẫn suy "lái được gì" từ hạng, không tin cờ gửi lên. */
function resolveManualFields(dto: ApproveDriverLicenceDto): ResolvedLicenceFields {
  const kind = dto.kind as DriverLicenceKind;
  const classes = normalizeLicenceClasses(dto.classes);
  const issuedOn = dto.issuedOn ?? null;
  const coverage = licenceClassCoverage({ kind, classes, issuedOn });
  return {
    kind,
    licenceNumber: dto.licenceNumber.replace(/\s+/g, '').toUpperCase(),
    fullName: dto.fullName.replace(/\s+/g, ' ').trim(),
    dateOfBirth: dto.dateOfBirth ?? null,
    classes,
    issuedOn,
    expiresOn: dto.noExpiry ? null : (dto.expiresOn ?? null),
    noExpiry: dto.noExpiry,
    issuingCountry: kind === DRIVER_LICENCE_KIND.VN ? 'VN' : (dto.issuingCountry ?? null),
    coversCar: coverage ? coverage.car : dto.coversCar,
    coversMotorbike: coverage ? coverage.motorbike : dto.coversMotorbike,
  };
}

function toGateInput(row: CustomerDriverLicence): DriverLicenceGateInput {
  return {
    status: row.status,
    kind: row.kind,
    expiresOn: fromDateOnly(row.expiresOn),
    noExpiry: row.noExpiry,
    coversCar: row.coversCar,
    coversMotorbike: row.coversMotorbike,
  };
}

function toDto(row: CustomerDriverLicence): DriverLicenceDto {
  const stored = readStored(row.ocrResult);
  return {
    id: row.id,
    status: row.status,
    kind: row.kind,
    licenceNumber: row.licenceNumber,
    fullName: row.fullName,
    dateOfBirth: fromDateOnly(row.dateOfBirth),
    classes: row.licenceClasses,
    issuedOn: fromDateOnly(row.issuedOn),
    expiresOn: fromDateOnly(row.expiresOn),
    noExpiry: row.noExpiry,
    issuingCountry: row.issuingCountry,
    coversCar: row.coversCar,
    coversMotorbike: row.coversMotorbike,
    rejectionReason: row.rejectionReason,
    reviewNote: row.reviewNote,
    qualityIssues: stored.reading?.qualityIssues ?? [],
    canRequestReview: canRequestReview(row),
    reviewRequestedAt: row.reviewRequestedAt?.toISOString() ?? null,
    decisionSource: row.decisionSource,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    submittedAt: row.createdAt.toISOString(),
  };
}

function toPlatformDto(row: PlatformRow): PlatformDriverLicenceDto {
  const stored = readStored(row.ocrResult);
  return {
    ...toDto(row),
    owner: {
      id: row.user.id,
      displayName: row.user.displayName,
      phone: maskPhone(row.user.phone),
      email: maskEmail(row.user.email),
    },
    reading: {
      provider: row.ocrProvider,
      model: row.ocrModel,
      confidence: stored.reading?.confidence ?? null,
      notes: stored.reading?.notes ?? null,
      errorCode: row.ocrErrorCode,
      pendingReason:
        row.status === DRIVER_LICENCE_STATUS.PENDING_REVIEW ? stored.pendingReason : null,
    },
    decidedByName: row.decider?.displayName ?? null,
  };
}

// ── Lỗi ─────────────────────────────────────────────────────────────────────────────────────

function licenceNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy lượt nộp bằng lái',
  });
}

function stateConflict(message: string): ConflictException {
  return new ConflictException({ code: API_ERROR_CODE.DRIVER_LICENCE_STATE_CONFLICT, message });
}

function notPending(status: string): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.DRIVER_LICENCE_STATE_CONFLICT,
    message: 'Lượt nộp này không ở trạng thái chờ duyệt',
    details: { status },
  });
}

function decidedByOther(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.DRIVER_LICENCE_STATE_CONFLICT,
    message: 'Lượt nộp vừa được người khác xử lý, hoặc khách vừa nộp ảnh khác',
  });
}

function invalidReview(message: string): BadRequestException {
  return new BadRequestException({ code: API_ERROR_CODE.VALIDATION_FAILED, message });
}
