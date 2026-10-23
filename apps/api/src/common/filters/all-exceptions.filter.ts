import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { API_ERROR_CODE, type ApiErrorCode } from '@xeprime/types';
import type { Response } from 'express';
import { NO_STORE_CACHE_CONTROL } from '../http-cache';

/** Hình dạng tối thiểu của một lỗi Prisma đã biết. */
interface PrismaKnownError {
  code: string;
  meta?: unknown;
}

/**
 * Nhận diện lỗi Prisma đã biết bằng duck-typing thay vì `instanceof`.
 *
 * Prisma 7 sinh class theo cách khiến `instanceof Prisma.PrismaClientKnownRequestError`
 * không narrow được kiểu ở TypeScript. Kiểm tra `code` dạng `P####` vừa đủ tin cậy vừa
 * không phụ thuộc chi tiết generate.
 */
function asPrismaKnownError(e: unknown): PrismaKnownError | null {
  if (typeof e !== 'object' || e === null) return null;
  const code = (e as { code?: unknown }).code;
  if (typeof code === 'string' && /^P\d{4}$/.test(code)) {
    return { code, meta: (e as { meta?: unknown }).meta };
  }
  return null;
}

/**
 * Chuẩn hoá mọi lỗi về `{ error: { code, message, details } }` — CLAUDE.md mục 9.
 *
 * Hai việc quan trọng ở đây:
 *  1. Dịch mã lỗi Postgres sang mã nghiệp vụ. `23P01` (exclusion_violation) chính là
 *     cơ chế chống trùng lịch của ADR 0006 — nó phải ra `BOOKING_SCHEDULE_CONFLICT`,
 *     không phải 500.
 *  2. Không để chi tiết lỗi hạ tầng rò ra client ở production (tên bảng, câu SQL).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly isProduction: boolean) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    // Response LỖI không bao giờ được cache. `@PublicCache` đã chỉ set header khi handler thành
    // công, nhưng dòng này là bảo hiểm cho MỌI đường set header khác (hiện tại và tương lai):
    // thiếu nó, một cú 500 thoáng qua mang `s-maxage` sẽ được CDN giữ làm bản "tốt" suốt TTL.
    res.setHeader('Cache-Control', NO_STORE_CACHE_CONTROL);
    const { status, code, message, details } = this.translate(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${code}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    res.status(status).json({
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    });
  }

  private translate(exception: unknown): {
    status: number;
    code: ApiErrorCode | string;
    message: string;
    details?: unknown;
  } {
    const prismaError = asPrismaKnownError(exception);

    /*
     * --- Postgres: ràng buộc của chuỗi kỳ thuê bao (ADR 0065) — xét TRƯỚC nhánh 23P01 chung ---
     *
     * Hai EXCLUDE khác nhau cùng ra mã 23P01; dịch theo TÊN ràng buộc, không theo mã, nếu không
     * một lượt gán gói chồng kỳ sẽ nói với admin rằng "xe đã có lịch khác".
     */
    const pgText = postgresErrorText(exception);
    if (pgText.includes(SUBSCRIPTION_TERM_EXCLUDE)) {
      return {
        status: HttpStatus.CONFLICT,
        code: API_ERROR_CODE.SUBSCRIPTION_TERM_CONFLICT,
        message: 'Gian hàng đã có một kỳ gói khác trùng thời gian cho loại xe này',
      };
    }
    if (pgText.includes(SUBSCRIPTION_SCOPE_MISMATCH_TOKEN)) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Phạm vi loại xe của kỳ thuê bao không khớp phạm vi của gói',
      };
    }

    // --- Postgres: exclusion constraint của vehicle_occupancies (ADR 0006) ---
    // 23P01 (exclusion_violation) là cơ chế chống trùng lịch. Nó có thể đến qua Prisma
    // (code P2010, meta.code) hoặc raw $queryRaw (code 23P01 trực tiếp) — bắt cả hai.
    if (
      (prismaError?.code === 'P2010' &&
        String((prismaError.meta as { code?: string } | undefined)?.code) === '23P01') ||
      isRawExclusionViolation(exception)
    ) {
      return {
        status: HttpStatus.CONFLICT,
        code: API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT,
        message: 'Xe đã có lịch khác trùng khoảng thời gian này',
      };
    }

    if (prismaError) {
      switch (prismaError.code) {
        case 'P2002':
          return {
            status: HttpStatus.CONFLICT,
            code: API_ERROR_CODE.CONFLICT,
            message: 'Dữ liệu đã tồn tại',
            details: this.isProduction ? undefined : prismaError.meta,
          };
        case 'P2025':
          return {
            status: HttpStatus.NOT_FOUND,
            code: API_ERROR_CODE.NOT_FOUND,
            message: 'Không tìm thấy dữ liệu',
          };
        case 'P2003':
          return {
            status: HttpStatus.BAD_REQUEST,
            code: API_ERROR_CODE.VALIDATION_FAILED,
            message: 'Dữ liệu tham chiếu không hợp lệ',
          };
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null) {
        const b = body as { code?: string; message?: string | string[]; details?: unknown };
        return {
          status,
          code: b.code ?? defaultCodeForStatus(status),
          message: Array.isArray(b.message)
            ? 'Dữ liệu gửi lên không hợp lệ'
            : (b.message ?? exception.message),
          details: Array.isArray(b.message) ? b.message : b.details,
        };
      }

      return { status, code: defaultCodeForStatus(status), message: String(body) };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: API_ERROR_CODE.INTERNAL_ERROR,
      message: this.isProduction
        ? 'Có lỗi xảy ra, vui lòng thử lại'
        : exception instanceof Error
          ? exception.message
          : String(exception),
    };
  }
}

/**
 * Nhận diện vi phạm exclusion constraint (23P01) — cơ chế chống trùng lịch (ADR 0006).
 *
 * Ba đường lỗi phải bắt hết:
 *  - `$queryRaw`: mã Postgres nằm thẳng trên `code`/`meta.code`.
 *  - Prisma ORM `.create()` (OccupancyService.reserve dùng đường này): Prisma KHÔNG mô hình hoá
 *    exclusion constraint nên bọc thành Unknown error — mã `23P01` chỉ còn trong `message`.
 */
/** Tên EXCLUDE chống chồng kỳ gói theo phạm vi loại xe — migration `…_per_vehicle_type_plans`. */
const SUBSCRIPTION_TERM_EXCLUDE = 'tenant_subscriptions_package_scope_no_overlap';
/** Mã ổn định mà trigger `tenant_subscriptions_vehicle_scope_matches_plan` đặt đầu thông điệp (23514). */
const SUBSCRIPTION_SCOPE_MISMATCH_TOKEN = 'TENANT_SUBSCRIPTION_SCOPE_MISMATCH';

/**
 * Văn bản lỗi Postgres để nhận diện ràng buộc theo TÊN — Prisma bọc lỗi trigger/EXCLUDE theo nhiều
 * cách (`message`, `meta.message`, `meta.driverAdapterError.cause`…), nên gom hết rồi tìm chuỗi.
 * Chỉ dùng để PHÂN LOẠI; không bao giờ trả văn bản này ra client.
 */
function postgresErrorText(exception: unknown): string {
  if (typeof exception !== 'object' || exception === null) return '';
  const e = exception as { message?: unknown; meta?: unknown; cause?: unknown };
  const parts: string[] = [];
  if (typeof e.message === 'string') parts.push(e.message);
  for (const extra of [e.meta, e.cause]) {
    if (extra === undefined) continue;
    try {
      parts.push(JSON.stringify(extra, (_key, value) => (value instanceof Error ? { ...value, message: value.message } : value)));
    } catch {
      // vòng tham chiếu — bỏ qua, `message` đã đủ cho phần lớn đường lỗi
    }
  }
  return parts.join(' ');
}

function isRawExclusionViolation(exception: unknown): boolean {
  if (typeof exception !== 'object' || exception === null) return false;
  const e = exception as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
  if (e.code === '23P01' || e.meta?.code === '23P01') return true;
  return typeof e.message === 'string' && e.message.includes('23P01');
}

function defaultCodeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return API_ERROR_CODE.UNAUTHENTICATED;
    case HttpStatus.FORBIDDEN:
      return API_ERROR_CODE.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return API_ERROR_CODE.NOT_FOUND;
    case HttpStatus.BAD_REQUEST:
      return API_ERROR_CODE.VALIDATION_FAILED;
    case HttpStatus.CONFLICT:
      return API_ERROR_CODE.CONFLICT;
    case HttpStatus.TOO_MANY_REQUESTS:
      return API_ERROR_CODE.RATE_LIMITED;
    default:
      return API_ERROR_CODE.INTERNAL_ERROR;
  }
}
