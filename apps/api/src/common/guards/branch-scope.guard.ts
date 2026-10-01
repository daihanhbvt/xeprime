import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@xeprime/prisma';
import { API_ERROR_CODE } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BRANCH_SCOPED_KEY,
  BRANCH_SCOPED_RESOURCE,
  type BranchScopedMeta,
  type BranchScopedResource,
} from '../decorators';
import type { RequestContext } from '../types/request-context';

/**
 * Phạm vi chi nhánh cho route THEO ID — nửa còn lại của ADR 0052.
 *
 * Danh sách đã thu hẹp bằng `resolveBranchScope` trong `where`. Nhưng mọi route theo id chỉ khoá
 * theo `{ id, tenantId }`, nên một nhân viên chỉ phụ trách chi nhánh A vẫn đọc được tên + SĐT
 * khách của đơn ở chi nhánh B, duyệt yêu cầu (tức chiếm lịch xe B), huỷ đơn, sửa giá xe — và
 * "kéo" xe B về chi nhánh mình, vì `PATCH /vehicles/:id` chỉ kiểm chi nhánh ĐÍCH. Id thì dò ra
 * dễ: `/receipts/vehicle-options`, `/customers/:id/bookings` đều trả id của mọi chi nhánh.
 *
 * ## Vì sao một guard, không phải ~80 phép kiểm trong service
 *
 * Bề mặt là ~80 route ở 10 controller. Rải phép kiểm vào từng service là để route thứ 81 quên nó
 * — đúng cái lỗ vừa vá. Ở đây phạm vi được KHAI cạnh route (`@BranchScoped`), một guard thi hành,
 * và một spec quét mọi controller để route theo id nào thiếu khai báo là đỏ ngay.
 *
 * ## Hành vi
 *
 *  - `allowedBranchIds === null` (toàn gian hàng — mọi chủ shop, mọi nhân viên `all`): đi qua,
 *    KHÔNG tốn truy vấn nào. Chi phí chỉ rơi vào người thật sự bị giới hạn.
 *  - Tài nguyên không tồn tại trong tenant: đi qua — service tự trả 404 của nó, đúng như trước.
 *  - Tồn tại nhưng thuộc chi nhánh ngoài phạm vi: **404 `NOT_FOUND`**, cùng mã mọi service đang
 *    dùng, KHÔNG phải 403. Một mã riêng cho "có, nhưng ở chi nhánh khác" là một máy dò: liệt kê id
 *    để biết gian hàng có những đơn nào, ở đâu. Với người bị giới hạn, phần ngoài phạm vi phải
 *    giống hệt phần không tồn tại — đúng cách `tenantId` đang đối xử với gian hàng khác.
 *  - Xe chưa gán chi nhánh (`branch_id IS NULL`, chỉ còn ở dữ liệu cũ): ngoài phạm vi. Đóng chứ
 *    không mở — một bản ghi không thuộc về đâu thì không thuộc phần được giao của ai.
 *
 * Đăng ký SAU `PermissionGuard`: người không có quyền vào khu đó nhận `MISSING_PERMISSION` trước,
 * và phép tra chi nhánh không chạy cho request đằng nào cũng bị từ chối.
 *
 * `req.platform` đi qua: nhân sự nền tảng không có phạm vi chi nhánh, họ đi trục riêng.
 */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<BranchScopedMeta | undefined>(BRANCH_SCOPED_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!meta) return true;

    const req = ctx.switchToHttp().getRequest<RequestContext & { params?: Record<string, string> }>();
    if (req.platform || !req.tenant) return true;

    const allowed = req.tenant.allowedBranchIds;
    if (allowed === null) return true;

    const id = req.params?.[meta.param];
    // Route khai sai tên param là lỗi lập trình — đóng lại cho an toàn, đừng lặng lẽ mở.
    if (!id) throw notFound();

    const owner = await this.branchOf(meta.resource, id, req.tenant.tenantId);
    if (owner === undefined) return true; // không tồn tại ⇒ service tự 404
    if (owner !== null && allowed.includes(owner)) return true;
    throw notFound();
  }

  /**
   * Chi nhánh sở hữu tài nguyên. `undefined` = không tồn tại trong tenant; `null` = tồn tại nhưng
   * không quy được về chi nhánh nào.
   *
   * Mỗi loại một câu SQL đi thẳng qua khoá chính — một phép tra index, không nạp bản ghi.
   */
  private async branchOf(
    resource: BranchScopedResource,
    id: string,
    tenantId: string,
  ): Promise<string | null | undefined> {
    // Chi nhánh tự là chi nhánh của nó — nhưng vẫn phải tồn tại trong tenant mới tính.
    const sql = BRANCH_LOOKUP[resource](id, tenantId);
    const rows = await this.prisma.$queryRaw<Array<{ branch_id: string | null }>>(sql);
    if (rows.length === 0) return undefined;
    return rows[0]!.branch_id?.trim() ?? null;
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({ code: API_ERROR_CODE.NOT_FOUND, message: 'Không tìm thấy' });
}

const BRANCH_LOOKUP: Record<BranchScopedResource, (id: string, tenantId: string) => Prisma.Sql> = {
  [BRANCH_SCOPED_RESOURCE.VEHICLE]: (id, t) => Prisma.sql`
    SELECT v.branch_id FROM vehicles v
    WHERE v.id = ${id} AND v.tenant_id = ${t}`,
  [BRANCH_SCOPED_RESOURCE.BOOKING]: (id, t) => Prisma.sql`
    SELECT v.branch_id FROM bookings b JOIN vehicles v ON v.id = b.vehicle_id
    WHERE b.id = ${id} AND b.tenant_id = ${t}`,
  [BRANCH_SCOPED_RESOURCE.BOOKING_REQUEST]: (id, t) => Prisma.sql`
    SELECT v.branch_id FROM booking_requests r JOIN vehicles v ON v.id = r.vehicle_id
    WHERE r.id = ${id} AND r.tenant_id = ${t}`,
  // Phiếu gắn xe lấy chi nhánh TỪ XE; không gắn xe lấy cột của chính nó (CHECK cấm có cả hai).
  [BRANCH_SCOPED_RESOURCE.RECEIPT]: (id, t) => Prisma.sql`
    SELECT COALESCE(v.branch_id, r.branch_id) AS branch_id
    FROM receipts r LEFT JOIN vehicles v ON v.id = r.vehicle_id
    WHERE r.id = ${id} AND r.tenant_id = ${t}`,
  [BRANCH_SCOPED_RESOURCE.BRANCH]: (id, t) => Prisma.sql`
    SELECT b.id AS branch_id FROM tenant_branches b
    WHERE b.id = ${id} AND b.tenant_id = ${t}`,
  [BRANCH_SCOPED_RESOURCE.VEHICLE_BLOCK]: (id, t) => Prisma.sql`
    SELECT v.branch_id FROM vehicle_blocks k JOIN vehicles v ON v.id = k.vehicle_id
    WHERE k.id = ${id} AND k.tenant_id = ${t}`,
  [BRANCH_SCOPED_RESOURCE.PAYMENT]: (id, t) => Prisma.sql`
    SELECT v.branch_id FROM payments p
    JOIN bookings b ON b.id = p.booking_id JOIN vehicles v ON v.id = b.vehicle_id
    WHERE p.id = ${id} AND p.tenant_id = ${t}`,
  [BRANCH_SCOPED_RESOURCE.CONTRACT]: (id, t) => Prisma.sql`
    SELECT v.branch_id FROM contracts c
    JOIN bookings b ON b.id = c.booking_id JOIN vehicles v ON v.id = b.vehicle_id
    WHERE c.id = ${id} AND b.tenant_id = ${t}`,
};
