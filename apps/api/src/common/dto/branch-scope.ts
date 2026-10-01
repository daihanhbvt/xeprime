import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Tham số `branchId` của một danh sách lọc được theo chi nhánh.
 *
 * Một định nghĩa cho MỌI bề mặt (xe, đội xe, đơn thuê, yêu cầu đặt xe, lịch, bảo dưỡng, hàng đợi
 * bàn giao). Chép tay vào từng DTO là để chúng lệch nhau — một chỗ quên `@Length(26, 26)` là một
 * chỗ nhận chuỗi rác vào `where`, và mô tả Swagger lệch nhau thì `/docs` nói tám điều khác nhau
 * về cùng một tham số.
 *
 * **Không phải cơ chế phân quyền.** `tenantId` vẫn là ranh giới thật và luôn đến từ membership của
 * phiên (CLAUDE.md mục 6, lằn ranh 1); `branchId` chỉ THU HẸP bên trong gian hàng đó. Chi nhánh của
 * gian hàng khác lọt vào đây chỉ ra danh sách rỗng, không bao giờ là đường đi ra ngoài.
 *
 * `vehicles` là bảng DUY NHẤT mang `branch_id`, nên ở các bảng khác (đơn thuê, yêu cầu, chiếm lịch,
 * bàn giao) bộ lọc phải đi qua quan hệ `vehicle: { branchId }` — xem từng service.
 */
export function BranchIdQuery(): PropertyDecorator {
  return applyDecorators(
    ApiPropertyOptional({
      description: 'Id chi nhánh (ULID) — chỉ thu hẹp trong gian hàng hiện tại',
    }),
    IsOptional(),
    IsString(),
    Length(26, 26),
  );
}

/**
 * Phạm vi chi nhánh HIỆU LỰC của một truy vấn — dạng dùng được thẳng làm giá trị `branchId`
 * trong `where` của Prisma.
 *
 * `undefined` = không thu hẹp. Prisma bỏ qua trường có giá trị `undefined`, nên nơi gọi viết
 * `branchId: resolveBranchScope(...)` thẳng, không cần `...(x ? {} : {})` nữa.
 *
 * Kiểu để sẵn nhánh `{ in: [...] }` vì đó là hình dạng của bước kế tiếp (phân quyền theo chi
 * nhánh): một nhân viên được giao NHIỀU chi nhánh thì phạm vi là một tập hợp, không phải một id.
 */
/** `string[]` chứ không `readonly string[]` — Prisma đòi mảng ghi được ở `{ in: … }`. */
export type BranchScope = string | { in: string[] } | undefined;

/**
 * Chi nhánh mà truy vấn này THỰC SỰ được đọc — phép GIAO giữa "được giao" và "đang xin".
 *
 * Đây là chỗ DUY NHẤT quyết định điều đó (ADR 0052). Hai trục gặp nhau ở đây:
 *
 *  - **Được giao** (`allowed`): phạm vi của thành viên, từ `TenantContext.allowedBranchIds`.
 *    Người dùng KHÔNG đổi được — nó do chủ gian hàng giao.
 *  - **Đang xin** (`requested`): ô lọc trên URL. Người dùng đổi tuỳ ý, nhưng chỉ THU HẸP được
 *    bên trong phần đã giao.
 *
 * `allowed` là tham số BẮT BUỘC, không có mặc định: quên nó ở một endpoint mới là lỗi biên dịch
 * chứ không phải một lỗ hổng im lặng. Đó là lý do nó không `?`.
 *
 * `tenantId` vẫn là ranh giới thật và luôn đến từ membership của phiên — hàm này chỉ cắt thêm
 * bên trong gian hàng đó.
 *
 * @param requested `branchId` client gửi lên (đã qua validate của DTO).
 * @param allowed   Chi nhánh người gọi được giao. `null` = toàn gian hàng. Mảng RỖNG nghĩa là
 *                  không được giao chi nhánh nào — **chặn hết, không mở hết**.
 */
export function resolveBranchScope(
  requested: string | undefined,
  allowed: readonly string[] | null,
): BranchScope {
  if (allowed == null) return requested;
  // Được giao rồi thì xin ngoài phạm vi = không thấy gì, chứ không phải thấy tất cả.
  if (requested) return allowed.includes(requested) ? requested : { in: [] };
  return { in: [...allowed] };
}

/**
 * Cùng phạm vi đó nhưng cho bảng KHÔNG mang `branch_id` — đơn thuê, yêu cầu, bàn giao, chiếm lịch.
 * Chúng nối qua XE, vì `vehicles` là bảng duy nhất có cột chi nhánh (ADR 0052).
 *
 * Trả `{}` khi không thu hẹp, để truy vấn không sinh thêm một phép nối vô ích.
 */
export function vehicleBranchWhere(scope: BranchScope): { vehicle?: { branchId: BranchScope } } {
  return scope === undefined ? {} : { vehicle: { branchId: scope } };
}

/**
 * Chi nhánh của một PHIẾU THU CHI — hai đường, một kết quả (ADR 0052).
 *
 * Phiếu gắn xe lấy chi nhánh TỪ XE; phiếu không gắn xe lấy từ cột `receipts.branch_id` của chính
 * nó (thuê mặt bằng, lương — chi phí của một chi nhánh nhưng không của chiếc xe nào). CHECK ở
 * database cấm một phiếu mang cả hai, nên hai nhánh `OR` dưới đây không bao giờ chồng nhau và
 * không có phiếu nào bị đếm hai lần.
 *
 * Phiếu NULL cả hai là khoản chung toàn gian hàng: nó cố ý rơi ra ngoài mọi bộ lọc chi nhánh và
 * được đếm riêng (`meta.unassignedCount`) để màn hình nói ra, thay vì im lặng làm lệch tổng.
 */
export function receiptBranchWhere(scope: BranchScope): {
  OR?: Array<{ vehicle: { branchId: BranchScope } } | { vehicleId: null; branchId: BranchScope }>;
} {
  if (scope === undefined) return {};
  return { OR: [{ vehicle: { branchId: scope } }, { vehicleId: null, branchId: scope }] };
}

/**
 * Cùng phép giao đó, nhưng trả về DANH SÁCH id cho các truy vấn `$queryRaw` — Bảo dưỡng và các
 * báo cáo tài chính dùng SQL thô nên không nhận được hình dạng `where` của Prisma.
 *
 * Ba trạng thái, và phân biệt được cả ba là điều bắt buộc:
 *   `null` → không thu hẹp (toàn gian hàng)
 *   `[]`   → KHÔNG thấy gì (được giao phạm vi `limited` nhưng chưa có chi nhánh nào, hoặc xin một
 *            chi nhánh ngoài phạm vi) — chặn hết, không mở hết
 *   `[…]`  → đúng những chi nhánh đó
 *
 * Dùng trong SQL đúng một khuôn, và khuôn này xử lý cả ba:
 *
 * ```sql
 * AND (${ids}::char(26)[] IS NULL OR v.branch_id = ANY(${ids}::char(26)[]))
 * ```
 *
 * `NULL::char(26)[] IS NULL` là true nên vế lọc biến mất; mảng rỗng thì `IS NULL` false và
 * `= ANY('{}')` cũng false nên không dòng nào lọt — đúng chiều fail-closed.
 */
export function resolveBranchIdList(
  requested: string | undefined,
  allowed: readonly string[] | null,
): string[] | null {
  const scope = resolveBranchScope(requested, allowed);
  if (scope === undefined) return null;
  return typeof scope === 'string' ? [scope] : scope.in;
}
