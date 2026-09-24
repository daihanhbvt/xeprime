import 'reflect-metadata';
import { ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import {
  APPROVAL_INTERNAL_NOTE_MAX_LENGTH,
  APPROVAL_REASON_MAX_LENGTH,
  PERMISSION,
} from '@xeprime/types';
import { PERMISSIONS_KEY, PLATFORM_ONLY_KEY } from '../src/common/decorators';
import {
  SaveApprovalInternalNoteDto,
  SetVehicleApprovalCheckDto,
  VehicleApprovalListQueryDto,
  VehicleApprovalReasonDto,
} from '../src/modules/platform-admin/dto/vehicle-approval.dto';
import { PlatformVehicleApprovalsController } from '../src/modules/platform-admin/platform-vehicle-approvals.controller';

/**
 * Biên HTTP của màn "Duyệt xe" — không cần DB.
 *
 * Hai điều khoá ở đây mà spec service (gọi thẳng service) không với tới:
 *  1. DTO chặn đúng thứ phải chặn ở CỔNG, cùng cấu hình pipe với `bootstrap.ts`
 *     (whitelist + forbidNonWhitelisted + transform, KHÔNG chuyển kiểu ngầm);
 *  2. controller đứng sau scope NỀN TẢNG + quyền duyệt — guard là lớp bảo vệ thật, ẩn nút ở web
 *     chỉ là trang trí.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const body = <T>(metatype: new () => T): ArgumentMetadata => ({ type: 'body', metatype, data: '' });
const query = <T>(metatype: new () => T): ArgumentMetadata => ({
  type: 'query',
  metatype,
  data: '',
});

describe('VehicleApprovalReasonDto — lý do gửi chủ xe', () => {
  it('trim rồi mới kiểm rỗng: chuỗi toàn khoảng trắng bị từ chối', async () => {
    await expect(
      pipe.transform({ reason: '    ' }, body(VehicleApprovalReasonDto)),
    ).rejects.toBeDefined();
    await expect(pipe.transform({}, body(VehicleApprovalReasonDto))).rejects.toBeDefined();
  });

  it(`quá ${APPROVAL_REASON_MAX_LENGTH} ký tự bị từ chối; hợp lệ thì đã trim`, async () => {
    await expect(
      pipe.transform(
        { reason: 'x'.repeat(APPROVAL_REASON_MAX_LENGTH + 1) },
        body(VehicleApprovalReasonDto),
      ),
    ).rejects.toBeDefined();
    const ok = (await pipe.transform(
      { reason: '  Ảnh mờ  ' },
      body(VehicleApprovalReasonDto),
    )) as VehicleApprovalReasonDto;
    expect(ok.reason).toBe('Ảnh mờ');
  });
});

describe('SaveApprovalInternalNoteDto — ghi chú nội bộ', () => {
  it('xoá ghi chú (chuỗi rỗng) với mốc null là hợp lệ', async () => {
    await expect(
      pipe.transform({ note: '', expectedUpdatedAt: null }, body(SaveApprovalInternalNoteDto)),
    ).resolves.toBeDefined();
  });

  it('mốc không phải ISO-8601, ghi chú quá dài, khoá lạ — đều bị từ chối', async () => {
    await expect(
      pipe.transform(
        { note: 'a', expectedUpdatedAt: 'hôm qua' },
        body(SaveApprovalInternalNoteDto),
      ),
    ).rejects.toBeDefined();
    await expect(
      pipe.transform(
        { note: 'x'.repeat(APPROVAL_INTERNAL_NOTE_MAX_LENGTH + 1) },
        body(SaveApprovalInternalNoteDto),
      ),
    ).rejects.toBeDefined();
    // Không có đường nào để client tự đặt người sửa / thời điểm sửa.
    await expect(
      pipe.transform({ note: 'a', updatedBy: 'someone' }, body(SaveApprovalInternalNoteDto)),
    ).rejects.toBeDefined();
  });
});

describe('SetVehicleApprovalCheckDto', () => {
  it('chỉ nhận boolean thật — "true" dạng chuỗi không được chuyển kiểu ngầm', async () => {
    await expect(
      pipe.transform({ passed: 'true' }, body(SetVehicleApprovalCheckDto)),
    ).rejects.toBeDefined();
    await expect(
      pipe.transform({ passed: true }, body(SetVehicleApprovalCheckDto)),
    ).resolves.toEqual({ passed: true });
  });
});

describe('VehicleApprovalListQueryDto — bộ lọc hàng đợi', () => {
  it.each([
    [{ vehicleType: 'truck' }],
    [{ storefrontKind: 'enterprise' }],
    [{ status: 'done' }],
    [{ limit: '101' }],
    [{ q: 'x'.repeat(101) }],
    [{ submittedFrom: 'hôm nay' }],
    // `tenantId` từ client KHÔNG BAO GIỜ là một bộ lọc ở đây — whitelist từ chối thẳng.
    [{ tenantId: '01TENANT00000000000000000' }],
  ])('%j bị từ chối', async (value) => {
    await expect(pipe.transform(value, query(VehicleApprovalListQueryDto))).rejects.toBeDefined();
  });

  it('bộ lọc hợp lệ đi qua, số trang ép kiểu, từ khoá đã trim', async () => {
    const ok = (await pipe.transform(
      {
        status: 'pending',
        vehicleType: 'motorbike',
        storefrontKind: 'personal',
        q: '  75A ',
        page: '2',
        limit: '50',
      },
      query(VehicleApprovalListQueryDto),
    )) as VehicleApprovalListQueryDto;
    expect(ok).toMatchObject({ q: '75A', page: 2, limit: 50, vehicleType: 'motorbike' });
  });
});

describe('PlatformVehicleApprovalsController — scope + quyền', () => {
  it('đứng sau scope NỀN TẢNG và quyền duyệt ở MỌI route', () => {
    expect(Reflect.getMetadata(PLATFORM_ONLY_KEY, PlatformVehicleApprovalsController)).toBe(true);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, PlatformVehicleApprovalsController)).toEqual([
      PERMISSION.PLATFORM_APPROVAL_REVIEW,
    ]);
  });
});
