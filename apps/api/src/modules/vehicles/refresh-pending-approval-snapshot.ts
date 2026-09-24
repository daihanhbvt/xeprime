import { newId, Prisma } from '@xeprime/prisma';
import {
  APPROVAL_ACTION,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  VEHICLE_PUBLIC_STATUS,
  type VehicleReviewPolicySnapshot,
} from '@xeprime/types';
import type { EffectivePolicy } from '../pricing/pricing.service';
import { buildVehicleReviewSnapshot } from './vehicle-review-snapshot';

/**
 * Dựng lại snapshot của phiếu duyệt ĐANG CHỜ sau khi chủ xe sửa hồ sơ (24/09/2026).
 *
 * ## Vì sao tồn tại
 *
 * Trước ngày này, `approval_tasks.snapshot_json` đóng băng vĩnh viễn ở lần gửi đầu. Điều đó bảo
 * vệ được một thứ thật — người duyệt quyết định trên đúng thứ họ nhìn — nhưng đổi lại hai cái giá
 * mà không ai trả được:
 *
 *  1. Chủ xe sửa xe lúc chờ thì **không có đường nào** báo bản mới: `pending_public_review` không
 *     nằm trong `VEHICLE_PUBLIC_STATUS_SUBMITTABLE`, nên nút gửi lại biến mất khỏi giao diện.
 *  2. Sửa đúng một trong năm trường CĂN CƯỚC thì người duyệt bấm Phê duyệt nhận
 *     `APPROVAL_SUBJECT_CHANGED` và **phải từ chối một hồ sơ không sai gì** để mở khoá — trong khi
 *     chủ xe không hề được báo là mình vừa làm kẹt phiếu.
 *
 * Nay mỗi lần chủ xe lưu, phiếu mang bản mới nhất. Đổi lại phải trả một cái giá KHÁC, và nó được
 * trả tường minh ở chỗ khác: người duyệt có thể đang đọc bản cũ, nên lượt Phê duyệt mang theo
 * `capturedAt` và lệch mốc thì trả `APPROVAL_SNAPSHOT_STALE` thay vì duyệt nhầm.
 *
 * ## Ba thứ được ghi, và vì sao đủ ba
 *
 *  - `approval_tasks.snapshot_json` — thứ người duyệt ĐỌC.
 *  - `approval_vehicle_subjects` — hình chiếu HÀNG ĐỢI (lọc/tìm/đếm). Bỏ qua nó thì hàng đợi
 *    hiện tên và biển số cũ trong khi mở phiếu ra lại thấy bản mới.
 *  - `approval_review_checks` — **xoá sạch**. Một tick là bằng chứng của người duyệt về MỘT bản
 *    hồ sơ cụ thể ("ảnh đạt", "giấy tờ khớp"); giữ nó lại trên một bản khác là biến danh mục kiểm
 *    tra thành lời chứng cho thứ chưa ai xem. Dòng log dưới đây là chỗ giải thích vì sao chúng
 *    biến mất.
 *
 * Không đụng `status`, `submitted_by` hay `submitted_at`: đây KHÔNG phải một lượt gửi mới. Phiếu
 * vẫn là phiếu cũ, vẫn giữ đúng thứ tự trong hàng đợi cũ-nhất-trước — sửa hồ sơ không được dùng
 * làm cách chen lên đầu hàng.
 *
 * ## Vì sao là free function, không phải một method của service
 *
 * Ba đường ghi cần nó nằm ở hai module, và `VehicleSettingsModule` cố ý là module LÁ (docblock của
 * chính nó: không import VehiclesModule/PricingModule để không tạo vòng Nest). Một hàm thuần chỉ
 * nhận `tx` thì không tạo cạnh DI nào, và file này không import ngược lại module nào trong hai
 * module đó — nên cũng không có vòng file-import.
 *
 * @returns `true` nếu có phiếu chờ và đã dựng lại; `false` khi xe không có phiếu nào đang chờ
 *          (đường ghi thường gặp nhất — xe nháp hoặc xe đã duyệt).
 */
export async function refreshPendingApprovalSnapshot(
  tx: Prisma.TransactionClient,
  args: {
    vehicleId: string;
    actorUserId: string;
    /**
     * Chính sách thuê hiệu lực SAU lần ghi này.
     *
     * `'unchanged'` dành cho đường ghi KHÔNG THỂ đụng tới chính sách (thiết lập theo dịch vụ):
     * phần `policy` của snapshot cũ được mang sang nguyên vẹn vì nó vẫn đúng. Đây không phải một
     * phép đoán — dựng lại với `null` mới là đoán, và nó sẽ âm thầm xoá chính sách khỏi thứ người
     * duyệt đọc.
     */
    policy: EffectivePolicy | null | 'unchanged';
  },
): Promise<boolean> {
  const pending = await tx.approvalTask.findFirst({
    where: {
      targetType: APPROVAL_TARGET_TYPE.VEHICLE,
      targetId: args.vehicleId,
      status: APPROVAL_STATUS.PENDING,
    },
    select: { id: true, snapshot: true },
  });
  if (!pending) return false;

  const snapshot = await buildVehicleReviewSnapshot(tx, {
    vehicleId: args.vehicleId,
    policy: args.policy === 'unchanged' ? null : args.policy,
    now: new Date(),
  });
  // Xe vừa bị xoá mềm trong cùng transaction: không còn gì để chụp, và phiếu sẽ được đóng ở
  // đường xoá. Không ném — lượt ghi kia mới là chủ thể của transaction này.
  if (!snapshot) return false;

  const next =
    args.policy === 'unchanged'
      ? { ...snapshot, policy: readStoredPolicy(pending.snapshot) }
      : snapshot;

  await tx.approvalTask.update({
    where: { id: pending.id },
    data: { snapshot: next as unknown as Prisma.InputJsonValue },
  });
  /*
   * `updateMany`, không phải `update`: thiếu dòng hình chiếu thì đây là một no-op thay vì một
   * P2025 làm hỏng CẢ lượt lưu của chủ xe. Migration `20260924090000` đã backfill và hai dòng
   * luôn sinh cùng transaction, nên trường hợp đó không được phép xảy ra — nhưng hình chiếu là
   * dữ liệu DẪN XUẤT, và một thứ dẫn xuất không bao giờ đáng để chặn lượt ghi chính.
   */
  await tx.approvalVehicleSubject.updateMany({
    where: { approvalTaskId: pending.id },
    data: {
      vehicleType: next.vehicle.vehicleType,
      name: next.vehicle.name,
      code: next.vehicle.code,
      plateNumber: next.vehicle.plateNumber,
      mainImageUrl: next.vehicle.images[0] ?? null,
      storefrontKind: next.source.storefrontKind,
      sourceName: next.source.name,
    },
  });
  await tx.approvalReviewCheck.deleteMany({ where: { approvalTaskId: pending.id } });
  await tx.approvalLog.create({
    data: {
      id: newId(),
      approvalTaskId: pending.id,
      action: APPROVAL_ACTION.PROFILE_UPDATED,
      // Dòng duy nhất không đổi trạng thái: phiếu vẫn đang chờ, chỉ nội dung đổi.
      fromStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
      toStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
      actorUserId: args.actorUserId,
    },
  });
  return true;
}

/**
 * Phần `policy` của snapshot đã lưu, mang sang bản mới nguyên văn.
 *
 * Cố ý KHÔNG đi qua `readVehicleReviewSnapshot` (bộ đọc có kiểm phiên bản): snapshot v1 sẽ bị bộ
 * đó trả `null` và cả phiếu rơi về `basis = live`, nhưng ở đây ta chỉ cần đúng một nhánh của JSON.
 * Phiếu v1 không có `policy` thì kết quả là `null` — đúng bằng những gì nó vốn có.
 */
function readStoredPolicy(stored: Prisma.JsonValue): VehicleReviewPolicySnapshot | null {
  if (stored && typeof stored === 'object' && !Array.isArray(stored) && 'policy' in stored) {
    return (stored.policy ?? null) as VehicleReviewPolicySnapshot | null;
  }
  return null;
}
