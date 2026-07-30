import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IMAGE_UPLOAD_MAX_BYTES } from '@xeprime/types';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PresignImageDto } from '../src/modules/storage/dto/storage.dto';
import { R2Service } from '../src/modules/storage/r2.service';
import { StorageController } from '../src/modules/storage/storage.controller';
import type { TenantContext } from '../src/common/types/request-context';

/**
 * Presign upload ảnh (không cần DB): gate env R2 (503 mã ổn định khi thiếu), prefix key dựng
 * server-side từ tenant scope, và DTO chặn MIME/size ngay tầng validate. `getSignedUrl` của
 * AWS SDK ký offline nên test chạy không network.
 */
const R2_ENV = {
  R2_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
  R2_ACCESS_KEY_ID: 'test-key',
  R2_SECRET_ACCESS_KEY: 'test-secret',
  R2_BUCKET: 'xeprime-test',
  R2_PUBLIC_BASE_URL: 'https://pub.example.dev',
};

const TENANT = { tenantId: '01TESTTENANT0000000000000X' } as TenantContext;
const DTO = { fileName: 'xe 01.jpg', contentType: 'image/jpeg', fileSize: 1_000_000 };

function makeController(env: Record<string, string>): StorageController {
  const config = new ConfigService(env);
  return new StorageController(new R2Service(config));
}

// Jest chạy qua `dotenv -e ../../.env` nên process.env CÓ sẵn R2_* thật; ConfigService fallback
// sang process.env khi key vắng trong config nội bộ → phải override rỗng tường minh để mô
// phỏng "chưa cấu hình".
const EMPTY_R2_ENV = Object.fromEntries(Object.keys(R2_ENV).map((k) => [k, '']));

describe('Uploads presign (R2)', () => {
  it('thiếu env R2 → 503 UPLOADS_NOT_CONFIGURED, không nổ 500', () => {
    const controller = makeController(EMPTY_R2_ENV);
    expect(() => controller.presignVehicleImage(TENANT, DTO as PresignImageDto)).toThrow(
      ServiceUnavailableException,
    );
    expect(() => controller.presignShopMedia(TENANT, DTO as PresignImageDto)).toThrow(
      ServiceUnavailableException,
    );
  });

  it('đủ env: key có prefix tenant đúng theo loại ảnh, URL public dựng từ base', async () => {
    const controller = makeController(R2_ENV);

    const vehicle = await controller.presignVehicleImage(TENANT, DTO as PresignImageDto);
    expect(vehicle.key.startsWith(`tenants/${TENANT.tenantId}/vehicles/`)).toBe(true);
    expect(vehicle.publicUrl).toBe(`https://pub.example.dev/${vehicle.key}`);
    expect(vehicle.uploadUrl).toContain('X-Amz-Signature');
    // Tên file được sanitize (khoảng trắng → _), không cho ký tự lạ vào key.
    expect(vehicle.key.endsWith('xe_01.jpg')).toBe(true);

    const shop = await controller.presignShopMedia(TENANT, DTO as PresignImageDto);
    expect(shop.key.startsWith(`tenants/${TENANT.tenantId}/shop/`)).toBe(true);
  });

  it('DTO chặn MIME ngoài allow-list và file quá trần', async () => {
    const ok = plainToInstance(PresignImageDto, DTO);
    expect(await validate(ok)).toHaveLength(0);

    const badMime = plainToInstance(PresignImageDto, { ...DTO, contentType: 'image/gif' });
    expect((await validate(badMime)).length).toBeGreaterThan(0);

    const tooBig = plainToInstance(PresignImageDto, {
      ...DTO,
      fileSize: IMAGE_UPLOAD_MAX_BYTES + 1,
    });
    expect((await validate(tooBig)).length).toBeGreaterThan(0);

    const notImage = plainToInstance(PresignImageDto, {
      ...DTO,
      contentType: 'application/pdf',
    });
    expect((await validate(notImage)).length).toBeGreaterThan(0);
  });
});
