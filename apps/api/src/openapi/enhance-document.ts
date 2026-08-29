import { API_ERROR_CODE } from '@xeprime/types';
import type { OpenAPIObject } from '@nestjs/swagger';
import { API_TAG_GROUPS_EXTENSION } from './api-tags';
import type { RouteAccess } from './route-access';

/*
 * Ba thứ Swagger KHÔNG tự suy ra được, làm nốt ở đây thay vì bắt 240+ route gắn tay:
 *
 *  1. Lớp bọc `{ data }`. `ResponseInterceptor` bọc mọi payload trước khi ra dây, nhưng
 *     `@ApiOkResponse({ type: XDto })` chỉ mô tả phần RUỘT. Không sửa thì spec sai shape ở
 *     mọi endpoint trả một object — dev đọc docs sẽ viết client hỏng.
 *  2. Yêu cầu xác thực. `.addCookieAuth()` mới chỉ ĐỊNH NGHĨA scheme; operation nào không
 *     tham chiếu nó thì Swagger UI không hiện ổ khoá, đọc docs không phân biệt được endpoint
 *     công khai với endpoint cần đăng nhập.
 *  3. Nhánh lỗi. Guard và exception filter là nơi quyết định 400/401/403/404/409/429/500 —
 *     suy ngược từ metadata của chúng thì tài liệu luôn khớp hành vi thật.
 *
 * Chạy chung cho cả Swagger UI (`/docs`) lẫn `openapi.json` sinh type FE (ADR 0007), nên hai
 * bên không thể lệch nhau.
 */

/** Tên security scheme do `DocumentBuilder.addCookieAuth()` đặt (mặc định là `cookie`). */
export const COOKIE_SECURITY_SCHEME = 'cookie';

/*
 * Kiểu dẫn xuất từ `OpenAPIObject` thay vì import sâu vào `@nestjs/swagger/dist/...` — barrel
 * của package chỉ export `OpenAPIObject`, và import sâu sẽ vỡ khi package đổi bố cục dist.
 */
type Components = NonNullable<OpenAPIObject['components']>;
type SchemaOrRef = NonNullable<Components['schemas']>[string];
type PathItemObject = OpenAPIObject['paths'][string];
type OperationObject = NonNullable<PathItemObject['get']>;
type ResponseOrRef = OperationObject['responses'][string];
type ResponseObject = Exclude<NonNullable<ResponseOrRef>, ReferenceObject>;

interface ReferenceObject {
  $ref: string;
}

const ERROR_SCHEMA_NAME = 'ApiErrorDto';
const ERROR_SCHEMA_REF = `#/components/schemas/${ERROR_SCHEMA_NAME}`;

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head'] as const;
const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

/** Message đi kèm ví dụ lỗi — lấy đúng câu `AllExceptionsFilter` trả về, không bịa lại. */
const ERROR_MESSAGES: Record<string, string> = {
  [API_ERROR_CODE.VALIDATION_FAILED]: 'Dữ liệu gửi lên không hợp lệ',
  [API_ERROR_CODE.UNAUTHENTICATED]: 'Chưa đăng nhập hoặc phiên đã hết hạn',
  [API_ERROR_CODE.MISSING_PERMISSION]: 'Tài khoản không có quyền thực hiện thao tác này',
  [API_ERROR_CODE.FORBIDDEN]: 'Không có quyền truy cập',
  [API_ERROR_CODE.NO_TENANT_SCOPE]: 'Tài khoản không thuộc gian hàng nào',
  [API_ERROR_CODE.FEATURE_NOT_IN_PLAN]: 'Tính năng này thuộc gói dịch vụ mà gian hàng chưa có',
  [API_ERROR_CODE.FEATURE_READ_ONLY]: 'Gói đã hết hạn — tính năng đang ở chế độ chỉ xem',
  [API_ERROR_CODE.NOT_FOUND]: 'Không tìm thấy dữ liệu',
  [API_ERROR_CODE.CONFLICT]: 'Dữ liệu đã tồn tại',
  [API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT]: 'Xe đã có lịch khác trùng khoảng thời gian này',
  [API_ERROR_CODE.INVALID_CREDENTIALS]: 'Email/số điện thoại hoặc mật khẩu không đúng',
  [API_ERROR_CODE.SESSION_EXPIRED]: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
  [API_ERROR_CODE.ACCOUNT_LOCKED]: 'Tài khoản đã bị khoá',
  [API_ERROR_CODE.RATE_LIMITED]: 'Vượt giới hạn số request',
  [API_ERROR_CODE.INTERNAL_ERROR]: 'Có lỗi xảy ra, vui lòng thử lại',
};

/** Mô tả mặc định cho response thành công — Swagger UI để trống trông như docs còn dang dở. */
const SUCCESS_DESCRIPTIONS: Record<string, string> = {
  '200': 'Thành công',
  '201': 'Đã tạo',
  '202': 'Đã tiếp nhận, xử lý bất đồng bộ',
  '204': 'Thành công, không có nội dung trả về',
};

export interface EnhanceResult {
  readonly operationCount: number;
  /** Operation không tìm thấy metadata truy cập — luôn rỗng, khác rỗng là build sai. */
  readonly unmatchedOperationIds: readonly string[];
}

/**
 * Bổ sung tại chỗ vào `document`. Trả về thống kê để test và lệnh sinh spec kiểm tra được.
 *
 * KHÔNG ghi đè thứ controller đã khai báo tường minh: response mã nào đã có thì giữ nguyên,
 * `description` sẵn có thì nối thêm phía dưới chứ không thay.
 */
export function enhanceOpenApiDocument(
  document: OpenAPIObject,
  access: ReadonlyMap<string, RouteAccess>,
): EnhanceResult {
  const schemas = document.components?.schemas ?? {};
  const unmatched: string[] = [];
  let operationCount = 0;

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      operationCount += 1;
      wrapSuccessResponses(operation, schemas);

      const operationId = operation.operationId;
      const route = operationId ? access.get(operationId) : undefined;
      if (!route) {
        unmatched.push(operationId ?? `${method.toUpperCase()} ${path}`);
        continue;
      }

      applyAccess(operation, route);
      addErrorResponses(operation, route, { path, isMutating: MUTATING_METHODS.has(method) });
    }
  }

  // Redoc/Scalar gom tag theo `x-tagGroups`; Swagger UI bỏ qua key lạ nên vô hại.
  (document as unknown as Record<string, unknown>)['x-tagGroups'] = API_TAG_GROUPS_EXTENSION;

  return { operationCount, unmatchedOperationIds: unmatched };
}

/* -------------------------------------------------------------------------- */
/* 1. Lớp bọc `{ data }`                                                       */
/* -------------------------------------------------------------------------- */

function wrapSuccessResponses(
  operation: OperationObject,
  schemas: Record<string, SchemaOrRef>,
): void {
  for (const [status, response] of Object.entries(operation.responses)) {
    if (!isSuccessStatus(status) || !isResponseObject(response)) continue;

    if (!response.description) {
      response.description = SUCCESS_DESCRIPTIONS[status] ?? 'Thành công';
    }

    const media = response.content?.['application/json'];
    if (!media?.schema || isEnveloped(media.schema, schemas)) continue;

    media.schema = {
      type: 'object',
      properties: { data: media.schema },
      required: ['data'],
    };
  }
}

/**
 * Payload đã tự mang lớp bọc thì không bọc lần hai — đúng nhánh `wrap()` của
 * `ResponseInterceptor`, vốn bỏ qua object đã có sẵn `data` hoặc `error`.
 *
 * Hai trường hợp thật: DTO phân trang (`{ data, meta }`) và kết quả health-check của Terminus
 * (`{ status, info, error, details }` — có `error` nên cũng thoát lớp bọc).
 */
function isEnveloped(schema: SchemaOrRef, schemas: Record<string, SchemaOrRef>): boolean {
  const resolved: SchemaOrRef | undefined = isReference(schema)
    ? schemas[schemaNameFromRef(schema.$ref)]
    : schema;

  // Ref trỏ ra ngoài `components.schemas`, hoặc ref lồng ref: không tra được thì coi như chưa
  // bọc — thà bọc thừa một schema lạ còn hơn để lọt endpoint mô tả sai shape.
  if (!resolved || isReference(resolved)) return false;

  const properties: Record<string, SchemaOrRef> | undefined = resolved.properties;
  return Boolean(properties && ('data' in properties || 'error' in properties));
}

/* -------------------------------------------------------------------------- */
/* 2. Điều kiện truy cập                                                       */
/* -------------------------------------------------------------------------- */

function applyAccess(operation: OperationObject, route: RouteAccess): void {
  // Mảng rỗng KHÔNG phải "chưa khai báo": trong OpenAPI nó nghĩa là "endpoint này bỏ qua mọi
  // security requirement" — đúng thứ cần nói cho route `@Public()`.
  operation.security = route.isPublic ? [] : [{ [COOKIE_SECURITY_SCHEME]: [] }];

  const lines: string[] = [
    route.isPublic
      ? '**Truy cập:** công khai — không cần đăng nhập.'
      : '**Truy cập:** cần đăng nhập (httpOnly session cookie, ADR 0002).',
  ];

  if (route.tenantScoped) {
    lines.push(
      '**Phạm vi:** gian hàng — `tenantId` lấy từ membership của phiên đăng nhập, ' +
        'KHÔNG nhận từ body/query.',
    );
  }

  if (route.platformOnly) {
    lines.push('**Phạm vi:** nền tảng — chỉ tài khoản `platform_admin` / `platform_staff`.');
  }

  if (route.permissions.length > 0) {
    const required = route.permissions.map((permission) => `\`${permission}\``).join(', ');
    lines.push(`**Quyền yêu cầu:** ${required} (đọc từ DB mỗi request, không nằm trong session).`);
  }

  const block = lines.join('\n\n');
  operation.description = operation.description ? `${operation.description}\n\n${block}` : block;
}

/* -------------------------------------------------------------------------- */
/* 3. Nhánh lỗi                                                                */
/* -------------------------------------------------------------------------- */

function addErrorResponses(
  operation: OperationObject,
  route: RouteAccess,
  context: { path: string; isMutating: boolean },
): void {
  if (operation.requestBody || (operation.parameters?.length ?? 0) > 0) {
    setResponse(operation, '400', 'Dữ liệu gửi lên không hợp lệ (chi tiết ở `error.details`)', [
      API_ERROR_CODE.VALIDATION_FAILED,
    ]);
  }

  if (!route.isPublic) {
    setResponse(operation, '401', 'Chưa đăng nhập, session cookie thiếu hoặc đã hết hạn', [
      API_ERROR_CODE.UNAUTHENTICATED,
    ]);
  } else if (route.verifiesCredentials) {
    // @Public() nhưng handler tự kiểm credential — xem `@VerifiesCredentials`. Đây là nhánh
    // client PHẢI code theo, không phải lỗi hiếm.
    setResponse(operation, '401', 'Thông tin đăng nhập không hợp lệ, hoặc phiên đã hết hạn', [
      API_ERROR_CODE.INVALID_CREDENTIALS,
      API_ERROR_CODE.SESSION_EXPIRED,
      API_ERROR_CODE.ACCOUNT_LOCKED,
    ]);
  }

  const [firstForbidden, ...otherForbidden] = collectForbiddenCodes(route);
  if (firstForbidden) {
    setResponse(operation, '403', 'Đã đăng nhập nhưng không đủ quyền hoặc sai phạm vi', [
      firstForbidden,
      ...otherForbidden,
    ]);
  }

  if (context.path.includes('{')) {
    setResponse(operation, '404', 'Không tìm thấy bản ghi tương ứng', [API_ERROR_CODE.NOT_FOUND]);
  }

  if (context.isMutating) {
    // Filter dịch mọi vi phạm ràng buộc Postgres thành 409: `P2002` (unique) → CONFLICT,
    // `23P01` (exclusion của `vehicle_occupancies`) → BOOKING_SCHEDULE_CONFLICT (ADR 0006).
    setResponse(
      operation,
      '409',
      'Xung đột dữ liệu — trùng bản ghi đã có, hoặc trùng lịch xe với đơn khác',
      [API_ERROR_CODE.CONFLICT, API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT],
    );
  }

  // ThrottlerGuard là guard global (120 request / 60 giây) nên áp cho mọi endpoint.
  setResponse(operation, '429', 'Vượt giới hạn 120 request / 60 giây', [
    API_ERROR_CODE.RATE_LIMITED,
  ]);

  setResponse(operation, '500', 'Lỗi không lường trước phía server', [
    API_ERROR_CODE.INTERNAL_ERROR,
  ]);
}

function collectForbiddenCodes(route: RouteAccess): string[] {
  const codes: string[] = [];
  if (route.permissions.length > 0) codes.push(API_ERROR_CODE.MISSING_PERMISSION);
  if (route.tenantScoped) codes.push(API_ERROR_CODE.NO_TENANT_SCOPE);
  if (route.platformOnly || route.permissions.length > 0) codes.push(API_ERROR_CODE.FORBIDDEN);
  // Trục năng lực theo gói (ADR 0027) — cùng nhánh 403 với quyền, xem docblock của hai mã.
  // `FEATURE_READ_ONLY` chỉ xuất hiện ở route GHI: `read_only` cho mọi lượt đọc đi qua.
  if (route.feature) {
    codes.push(API_ERROR_CODE.FEATURE_NOT_IN_PLAN);
    codes.push(API_ERROR_CODE.FEATURE_READ_ONLY);
  }
  return [...new Set(codes)];
}

/**
 * Controller đã khai báo mã này thì tôn trọng bản viết tay — nó cụ thể hơn bản suy ra.
 *
 * `codes` là tuple không rỗng: mã đầu tiên vừa dùng làm ví dụ vừa là mã hay gặp nhất của
 * nhánh lỗi đó, nên không được phép gọi với mảng rỗng.
 */
function setResponse(
  operation: OperationObject,
  status: string,
  description: string,
  codes: readonly [string, ...string[]],
): void {
  if (operation.responses[status]) return;

  const [primary] = codes;
  const listed = codes.map((code) => `\`${code}\``).join(' · ');

  operation.responses[status] = {
    description: `${description}.\n\nMã lỗi: ${listed}`,
    content: {
      'application/json': {
        schema: { $ref: ERROR_SCHEMA_REF },
        example: {
          error: { code: primary, message: ERROR_MESSAGES[primary] ?? description },
        },
      },
    },
  } satisfies ResponseObject;
}

/* -------------------------------------------------------------------------- */

function isSuccessStatus(status: string): boolean {
  const code = Number(status);
  return Number.isInteger(code) && code >= 200 && code < 300;
}

function isResponseObject(response: ResponseOrRef): response is ResponseObject {
  return response !== undefined && !isReference(response);
}

function isReference(value: unknown): value is ReferenceObject {
  return typeof value === 'object' && value !== null && '$ref' in value;
}

function schemaNameFromRef(ref: string): string {
  return ref.slice(ref.lastIndexOf('/') + 1);
}
