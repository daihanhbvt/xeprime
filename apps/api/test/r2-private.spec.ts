import type { ConfigService } from '@nestjs/config';
import { R2Service } from '../src/modules/storage/r2.service';

/**
 * Wave 4.1 — tách kho public/riêng tư ở tầng R2Service. SDK AWS được MOCK toàn bộ:
 * test khoá hành vi ký URL (bucket nào, có publicUrl không, Content-Disposition đã khử
 * ký tự lạ chưa) mà không cần credential Cloudflare.
 */

interface CapturedCommand {
  kind: string;
  input: Record<string, unknown>;
}

const captured: CapturedCommand[] = [];

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = jest.fn();
  },
  PutObjectCommand: class {
    constructor(public input: Record<string, unknown>) {
      captured.push({ kind: 'put', input });
    }
  },
  GetObjectCommand: class {
    constructor(public input: Record<string, unknown>) {
      captured.push({ kind: 'get', input });
    }
  },
  HeadObjectCommand: class {
    constructor(public input: Record<string, unknown>) {
      captured.push({ kind: 'head', input });
    }
  },
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async (_client: unknown, command: { input: Record<string, unknown> }) => {
    return `signed://${String(command.input.Bucket)}/${String(command.input.Key)}`;
  }),
}));

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string) => env[key],
    getOrThrow: (key: string) => {
      const value = env[key];
      if (!value) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

const FULL_ENV = {
  R2_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET: 'xeprime-public',
  R2_PUBLIC_BASE_URL: 'https://cdn.xeprime.vn',
  R2_PRIVATE_BUCKET: 'xeprime-private',
};

beforeEach(() => {
  captured.length = 0;
});

describe('R2Service — kho public (giữ nguyên hành vi Wave trước)', () => {
  it('presignUpload ảnh public vẫn trả publicUrl dựng từ R2_PUBLIC_BASE_URL', async () => {
    const r2 = new R2Service(makeConfig(FULL_ENV));
    const result = await r2.presignUpload({
      prefix: 'tenants/t1/vehicles',
      fileName: 'xe.jpg',
      contentType: 'image/jpeg',
    });
    expect(result.publicUrl).toMatch(/^https:\/\/cdn\.xeprime\.vn\/tenants\/t1\/vehicles\//);
    expect(captured.at(-1)?.input.Bucket).toBe('xeprime-public');
  });
});

describe('R2Service — kho RIÊNG TƯ (Wave 4.1)', () => {
  it('thiếu R2_PRIVATE_BUCKET → privateEnabled=false (endpoint hợp đồng fail-closed 503)', () => {
    const r2 = new R2Service(makeConfig({ ...FULL_ENV, R2_PRIVATE_BUCKET: undefined }));
    expect(r2.privateEnabled).toBe(false);
    // Kho public vẫn chạy bình thường — hai cấu hình độc lập.
    expect(r2.enabled).toBe(true);
  });

  it('privateEnabled KHÔNG đòi R2_PUBLIC_BASE_URL — bucket riêng tư không có URL public', () => {
    const r2 = new R2Service(makeConfig({ ...FULL_ENV, R2_PUBLIC_BASE_URL: undefined }));
    expect(r2.privateEnabled).toBe(true);
  });

  it('presignPrivateUpload nhắm đúng bucket riêng tư và KHÔNG trả publicUrl', async () => {
    const r2 = new R2Service(makeConfig(FULL_ENV));
    const result = await r2.presignPrivateUpload({
      key: 'tenants/t1/vehicles/v1/contracts/01ABC.pdf',
      contentType: 'application/pdf',
      contentLength: 123,
    });
    expect(result).toEqual({
      uploadUrl: 'signed://xeprime-private/tenants/t1/vehicles/v1/contracts/01ABC.pdf',
      expiresIn: 300,
    });
    expect(result).not.toHaveProperty('publicUrl');
    const put = captured.at(-1)!;
    expect(put.input.Bucket).toBe('xeprime-private');
    // Content-Length ký vào URL — file to hơn khai báo là R2 từ chối.
    expect(put.input.ContentLength).toBe(123);
  });

  it('presignPrivateDownload: URL sống ngắn + Content-Disposition đã khử ký tự lạ', async () => {
    const r2 = new R2Service(makeConfig(FULL_ENV));
    const result = await r2.presignPrivateDownload(
      'tenants/t1/vehicles/v1/contracts/01ABC.pdf',
      '../hợp "đồng" cuối.pdf',
      120,
    );
    expect(result.expiresIn).toBe(120);
    expect(result.downloadUrl).toContain('signed://xeprime-private/');
    const get = captured.at(-1)!;
    const disposition = String(get.input.ResponseContentDisposition);
    // Không còn dấu nháy kép / ký tự path — không tiêm header, không traversal tên file.
    expect(disposition).toMatch(/^attachment; filename="[\w.-]+"$/);
  });
});
