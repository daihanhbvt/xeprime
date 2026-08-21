import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/bootstrap';
import { API_TAGS } from '../src/openapi/api-tags';
import { COOKIE_SECURITY_SCHEME } from '../src/openapi/enhance-document';
import { collectRouteAccess } from '../src/openapi/route-access';

/**
 * Hợp đồng của TÀI LIỆU API — thứ giữ cho Swagger nói đúng những gì code thật sự làm.
 *
 * Vì sao cần: tài liệu sai còn tệ hơn không có tài liệu. Dev khác đọc spec rồi viết client theo,
 * lỗi chỉ lộ ra lúc chạy thật. Mỗi khẳng định dưới đây từng là một lỗ hổng có thật trong spec
 * (thiếu lớp bọc `{ data }`, không endpoint nào khai security, không mã lỗi nào được liệt kê,
 * tag không mô tả) — khoá lại để không tái diễn khi thêm module mới.
 *
 * Chạy ở `preview: true`: Nest chỉ quét metadata, KHÔNG khởi tạo provider nên không đụng DB.
 */

/** `/health` cố tình nằm ngoài lớp bọc `{ data }` — xem `modules/health/dto/health.dto.ts`. */
const ENVELOPE_EXEMPT_PATHS = new Set(['/health']);

type PathItemObject = OpenAPIObject['paths'][string];
type OperationObject = NonNullable<PathItemObject['get']>;

interface RouteEntry {
  readonly label: string;
  readonly path: string;
  readonly method: string;
  readonly operation: OperationObject;
}

let app: INestApplication;
let document: OpenAPIObject;
let routes: RouteEntry[];

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { preview: true, logger: false });
  document = buildOpenApiDocument(app);

  routes = [];
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of ['get', 'put', 'post', 'delete', 'patch'] as const) {
      const operation = item[method];
      if (!operation) continue;
      routes.push({ label: `${method.toUpperCase()} ${path}`, path, method, operation });
    }
  }
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('OpenAPI · phủ tài liệu', () => {
  it('có route và mọi route đều được mô tả', () => {
    expect(routes.length).toBeGreaterThan(200);

    const missingSummary = routes.filter((r) => !r.operation.summary?.trim());
    expect(missingSummary.map((r) => r.label)).toEqual([]);
  });

  it('mọi route đều thuộc một tag đã khai báo', () => {
    const declared = new Set(API_TAGS.map((tag) => tag.name));

    const untagged = routes.filter((r) => (r.operation.tags?.length ?? 0) === 0);
    expect(untagged.map((r) => r.label)).toEqual([]);

    const undeclared = routes.filter((r) => r.operation.tags?.some((t) => !declared.has(t)));
    expect(undeclared.map((r) => `${r.label} → ${r.operation.tags?.join(',')}`)).toEqual([]);
  });

  it('không khai báo tag thừa (tag không controller nào dùng)', () => {
    const used = new Set(routes.flatMap((r) => r.operation.tags ?? []));
    const unused = API_TAGS.map((tag) => tag.name).filter((name) => !used.has(name));
    expect(unused).toEqual([]);
  });

  it('mọi tag đều có mô tả và không trùng tên', () => {
    const names = API_TAGS.map((tag) => tag.name);
    expect(new Set(names).size).toBe(names.length);
    expect(API_TAGS.filter((tag) => !tag.description.trim()).map((tag) => tag.name)).toEqual([]);
  });
});

describe('OpenAPI · xác thực', () => {
  it('mọi route đều nói rõ cần đăng nhập hay không', () => {
    const undeclared = routes.filter((r) => !Array.isArray(r.operation.security));
    expect(undeclared.map((r) => r.label)).toEqual([]);
  });

  it('security khớp đúng metadata `@Public` mà guard đang dùng', () => {
    const access = collectRouteAccess(app);

    const mismatched = routes.filter((r) => {
      const route = access.get(r.operation.operationId ?? '');
      if (!route) return true;
      const declaresCookie = (r.operation.security ?? []).some(
        (requirement) => COOKIE_SECURITY_SCHEME in requirement,
      );
      // Public thì phải là `security: []`; còn lại phải tham chiếu scheme cookie.
      return route.isPublic ? declaresCookie : !declaresCookie;
    });

    expect(mismatched.map((r) => r.label)).toEqual([]);
  });

  it('scheme cookie được định nghĩa trong components', () => {
    expect(document.components?.securitySchemes?.[COOKIE_SECURITY_SCHEME]).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
    });
  });

  it('route cần đăng nhập đều ghi rõ quyền/phạm vi trong mô tả', () => {
    const access = collectRouteAccess(app);

    const missing = routes.filter((r) => {
      const route = access.get(r.operation.operationId ?? '');
      if (!route || route.permissions.length === 0) return false;
      return !route.permissions.every((permission) =>
        r.operation.description?.includes(permission),
      );
    });

    expect(missing.map((r) => r.label)).toEqual([]);
  });
});

describe('OpenAPI · hình dạng response', () => {
  it('response thành công đều mô tả đúng lớp bọc `{ data }`', () => {
    const schemas = document.components?.schemas ?? {};

    const wrong: string[] = [];
    for (const route of routes) {
      if (ENVELOPE_EXEMPT_PATHS.has(route.path)) continue;

      for (const [status, response] of Object.entries(route.operation.responses)) {
        const code = Number(status);
        if (code < 200 || code >= 300 || !response || '$ref' in response) continue;

        const schema = response.content?.['application/json']?.schema;
        // 204 không có body — không có gì để bọc.
        if (!schema) continue;

        const resolved =
          '$ref' in schema ? schemas[schema.$ref.slice(schema.$ref.lastIndexOf('/') + 1)] : schema;
        const properties = resolved && !('$ref' in resolved) ? resolved.properties : undefined;

        if (!properties || !('data' in properties)) {
          wrong.push(`${route.label} [${status}]`);
        }
      }
    }

    expect(wrong).toEqual([]);
  });

  it('mọi response 2xx đều có mô tả', () => {
    const blank: string[] = [];
    for (const route of routes) {
      for (const [status, response] of Object.entries(route.operation.responses)) {
        const code = Number(status);
        if (code < 200 || code >= 300 || !response || '$ref' in response) continue;
        if (!response.description?.trim()) blank.push(`${route.label} [${status}]`);
      }
    }
    expect(blank).toEqual([]);
  });
});

describe('OpenAPI · nhánh lỗi', () => {
  const errorRef = '#/components/schemas/ApiErrorDto';

  it('`ApiErrorDto` có mặt trong components', () => {
    expect(document.components?.schemas?.ApiErrorDto).toBeDefined();
  });

  it('mọi route đều mô tả 429 và 500', () => {
    const missing = routes.filter((r) => !r.operation.responses['429'] || !r.operation.responses['500']);
    expect(missing.map((r) => r.label)).toEqual([]);
  });

  it('route cần đăng nhập đều mô tả 401', () => {
    const access = collectRouteAccess(app);
    const missing = routes.filter((r) => {
      const route = access.get(r.operation.operationId ?? '');
      return route && !route.isPublic && !r.operation.responses['401'];
    });
    expect(missing.map((r) => r.label)).toEqual([]);
  });

  it('route công khai KHÔNG mô tả 401 (nhánh không tồn tại)', () => {
    const access = collectRouteAccess(app);
    const spurious = routes.filter((r) => {
      const route = access.get(r.operation.operationId ?? '');
      return route?.isPublic && Boolean(r.operation.responses['401']);
    });
    expect(spurious.map((r) => r.label)).toEqual([]);
  });

  it('route đòi quyền đều mô tả 403', () => {
    const access = collectRouteAccess(app);
    const missing = routes.filter((r) => {
      const route = access.get(r.operation.operationId ?? '');
      return route && route.permissions.length > 0 && !r.operation.responses['403'];
    });
    expect(missing.map((r) => r.label)).toEqual([]);
  });

  it('response lỗi đều dùng chung schema `ApiErrorDto`', () => {
    const wrong: string[] = [];
    for (const route of routes) {
      for (const [status, response] of Object.entries(route.operation.responses)) {
        const code = Number(status);
        if (code < 400 || !response || '$ref' in response) continue;

        const schema = response.content?.['application/json']?.schema;
        if (!schema) continue;
        // 503 của health-check trả nguyên kết quả Terminus, không phải envelope lỗi chuẩn.
        if (ENVELOPE_EXEMPT_PATHS.has(route.path)) continue;
        if (!('$ref' in schema) || schema.$ref !== errorRef) {
          wrong.push(`${route.label} [${status}]`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('OpenAPI · spec đã commit không được cũ đi', () => {
  /**
   * `packages/types/openapi.json` (và `api.generated.ts` sinh từ nó) là HỢP ĐỒNG giữa API và web.
   *
   * Nếu không có bài kiểm tra này thì đổi một DTO rồi quên chạy `pnpm contract` là hoàn toàn im
   * lặng: mọi test khác vẫn xanh vì chúng đọc document dựng tại chỗ, còn file đã commit thì đứng
   * yên. Web tiếp tục compile theo type CŨ và sai sót chỉ lộ ra lúc chạy thật.
   *
   * So sánh nguyên văn byte với cách `src/openapi.ts` ghi file. `.gitattributes` chốt `eol=lf`
   * nên checkout trên Windows cũng không lệch xuống dòng.
   */
  const SPEC_PATH = resolve(__dirname, '../../../packages/types/openapi.json');

  it('khớp đúng document dựng từ source hiện tại', () => {
    const committed = readFileSync(SPEC_PATH, 'utf8');
    const current = `${JSON.stringify(document, null, 2)}\n`;

    if (committed === current) return;

    const diff = summarizeDrift(JSON.parse(committed) as OpenAPIObject, document);
    throw new Error(
      `packages/types/openapi.json đã cũ so với source. Chạy \`pnpm contract\` rồi commit cả ` +
        `openapi.json lẫn api.generated.ts.\n${diff}`,
    );
  });
});

/** Chỉ ra CHỖ lệch thay vì ném hai chuỗi JSON 600KB vào mặt người đọc log. */
function summarizeDrift(committed: OpenAPIObject, current: OpenAPIObject): string {
  const lines: string[] = [];

  const report = (label: string, before: readonly string[], after: readonly string[]): void => {
    const beforeSet = new Set(before);
    const afterSet = new Set(after);
    const added = after.filter((key) => !beforeSet.has(key));
    const removed = before.filter((key) => !afterSet.has(key));
    if (added.length) lines.push(`  ${label} thêm: ${added.slice(0, 10).join(', ')}`);
    if (removed.length) lines.push(`  ${label} mất: ${removed.slice(0, 10).join(', ')}`);
  };

  report('Đường dẫn', Object.keys(committed.paths), Object.keys(current.paths));
  report(
    'Schema',
    Object.keys(committed.components?.schemas ?? {}),
    Object.keys(current.components?.schemas ?? {}),
  );

  // Cùng bộ khoá mà nội dung vẫn khác: đổi field/mô tả/nhánh lỗi bên trong một endpoint có sẵn.
  if (lines.length === 0) {
    lines.push('  Cùng bộ đường dẫn và schema — khác ở chi tiết bên trong (field, mô tả, response).');
  }

  return lines.join('\n');
}
