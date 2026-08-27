import 'reflect-metadata';
import { PERMISSION } from '@xeprime/types';
import { PERMISSIONS_KEY } from '../src/common/decorators';
import { VehiclesController } from '../src/modules/vehicles/vehicles.controller';

/**
 * Wave 4.1 — hợp đồng quyền của các endpoint tài liệu nhạy cảm, đọc từ metadata mà
 * `PermissionGuard` thực thi (guard đòi ĐỦ MỌI permission liệt kê; controller nằm sau
 * `@TenantScoped()` nên request không đăng nhập/không membership bị chặn trước đó).
 * Khoá metadata ở đây để một lần sửa tay không âm thầm hạ rào.
 */
function permissionsOf(method: keyof VehiclesController): string[] {
  const handler = VehiclesController.prototype[method] as unknown as object;
  return (Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[]) ?? [];
}

describe('Quyền endpoint hồ sơ nguồn & hợp đồng riêng tư', () => {
  it('đọc hồ sơ nguồn cần finance.view', () => {
    expect(permissionsOf('getSource')).toEqual([PERMISSION.FINANCE_VIEW]);
  });

  it('tải hợp đồng cần finance.view', () => {
    expect(permissionsOf('downloadSourceContract')).toEqual([PERMISSION.FINANCE_VIEW]);
  });

  it('lưu hồ sơ nguồn cần CẢ vehicles.update lẫn finance.view', () => {
    expect(permissionsOf('saveSource')).toEqual(
      expect.arrayContaining([PERMISSION.VEHICLE_UPDATE, PERMISSION.FINANCE_VIEW]),
    );
    expect(permissionsOf('saveSource')).toHaveLength(2);
  });

  it('presign upload hợp đồng cần CẢ vehicles.update lẫn finance.view', () => {
    expect(permissionsOf('presignSourceContract')).toEqual(
      expect.arrayContaining([PERMISSION.VEHICLE_UPDATE, PERMISSION.FINANCE_VIEW]),
    );
    expect(permissionsOf('presignSourceContract')).toHaveLength(2);
  });

  it('hoàn tất upload hợp đồng cần CẢ vehicles.update lẫn finance.view', () => {
    expect(permissionsOf('completeSourceContract')).toEqual(
      expect.arrayContaining([PERMISSION.VEHICLE_UPDATE, PERMISSION.FINANCE_VIEW]),
    );
    expect(permissionsOf('completeSourceContract')).toHaveLength(2);
  });
});
