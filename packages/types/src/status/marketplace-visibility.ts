import { STATUS_COLOR, type StatusMeta } from './meta';
import { VEHICLE_PUBLIC_STATUS, type VehiclePublicStatus } from './vehicle';

/**
 * BA trục độc lập quyết định một chiếc xe có nằm ngoài chợ hay không (ADR 0048).
 *
 *   1. **Vận hành** — `vehicles.operation_status`: xe đang rảnh, đang thuê, đang bảo dưỡng.
 *      KHÔNG liên quan gì tới việc xe có hiện ngoài chợ; một chiếc đang có khách thuê vẫn phải
 *      hiện để nhận yêu cầu cho những ngày sau.
 *   2. **Kiểm duyệt của nền tảng** — `vehicles.public_status`: nền tảng đã duyệt, đang giữ ở
 *      hàng chờ, trả về yêu cầu bổ sung, hay ĐÃ ẨN vì vi phạm. Chỉ nền tảng đổi được trục này.
 *   3. **Lựa chọn hiển thị của chủ xe** — `vehicles.marketplace_enabled`: chủ xe tự bật/tắt,
 *      hiệu lực ngay, không đụng tới hai trục kia.
 *
 * Trước ADR 0048, trục 3 không tồn tại và cám dỗ hiển nhiên là mượn `public_status = hidden` để
 * biểu diễn nó. Đó là lý do file này có mặt: `hidden` là NỀN TẢNG ẩn xe (một quyết định kiểm
 * duyệt, chủ xe không được tự gỡ), còn "tôi tạm không cho thuê chiếc này" là quyền của chủ xe và
 * phải bật lại được bất cứ lúc nào. Trộn hai thứ vào một cột nghĩa là chủ xe tự gỡ được án ẩn
 * của nền tảng bằng một cú bấm — hoặc nền tảng bỏ ẩn một chiếc mà chủ xe đang cố ý cất đi.
 *
 * `resolveMarketplaceVisibility` là phép GỘP duy nhất của ba trục đó. Nó thuần và nằm ở
 * `@xeprime/types` vì cả API (dựng DTO) lẫn web (dựng nhãn) đều phải trả lời câu hỏi "xe này có
 * đang hiện ngoài chợ không, và vì sao không" bằng CÙNG một câu.
 */
export const MARKETPLACE_VISIBILITY_REASON = {
  /** Xe đang hiện ngoài chợ và nhận được yêu cầu thuê. */
  VISIBLE: 'visible',
  /** Chủ xe tự tắt công tắc hiển thị. Bật lại được ngay, không cần duyệt lại. */
  OWNER_PAUSED: 'owner_paused',
  /** Chưa qua cổng duyệt: nháp, đang chờ duyệt, cần bổ sung, bị từ chối, hoặc đã lưu trữ. */
  NOT_APPROVED: 'not_approved',
  /** Nền tảng ẩn xe (`public_status = hidden`). Chỉ nền tảng bỏ ẩn được. */
  PLATFORM_HIDDEN: 'platform_hidden',
  /** Gian hàng đang bị khoá/ngừng hoạt động — mọi xe của nó biến khỏi chợ (ADR 0008 §3). */
  SHOP_INACTIVE: 'shop_inactive',
  /** Xe đã xoá mềm. */
  ARCHIVED: 'archived',
} as const;

export type MarketplaceVisibilityReason =
  (typeof MARKETPLACE_VISIBILITY_REASON)[keyof typeof MARKETPLACE_VISIBILITY_REASON];

export const MARKETPLACE_VISIBILITY_REASON_VALUES = Object.values(
  MARKETPLACE_VISIBILITY_REASON,
) as MarketplaceVisibilityReason[];

export const MARKETPLACE_VISIBILITY_REASON_META: Readonly<
  Record<MarketplaceVisibilityReason, StatusMeta>
> = {
  [MARKETPLACE_VISIBILITY_REASON.VISIBLE]: {
    label: 'Đang hiển thị',
    color: STATUS_COLOR.SUCCESS,
  },
  [MARKETPLACE_VISIBILITY_REASON.OWNER_PAUSED]: {
    label: 'Chủ xe tạm ẩn',
    color: STATUS_COLOR.NEUTRAL,
  },
  [MARKETPLACE_VISIBILITY_REASON.NOT_APPROVED]: {
    label: 'Chưa được duyệt',
    color: STATUS_COLOR.WAITING,
  },
  [MARKETPLACE_VISIBILITY_REASON.PLATFORM_HIDDEN]: {
    label: 'Bị nền tảng ẩn',
    color: STATUS_COLOR.DANGER,
  },
  [MARKETPLACE_VISIBILITY_REASON.SHOP_INACTIVE]: {
    label: 'Gian hàng ngừng hoạt động',
    color: STATUS_COLOR.DANGER,
  },
  [MARKETPLACE_VISIBILITY_REASON.ARCHIVED]: {
    label: 'Đã lưu trữ',
    color: STATUS_COLOR.NEUTRAL,
  },
};

/** Lát cắt của một chiếc xe mà phép gộp cần — không phụ thuộc Prisma hay DTO nào. */
export interface MarketplaceVisibilityInput {
  /** Xoá mềm. `null` = còn sống. */
  deletedAt: Date | string | null;
  /** Trục KIỂM DUYỆT (`vehicles.public_status`). */
  publicStatus: VehiclePublicStatus | string;
  /** Trục LỰA CHỌN CỦA CHỦ XE (`vehicles.marketplace_enabled`). */
  marketplaceEnabled: boolean;
  /** Gian hàng đang hoạt động và chưa xoá. */
  shopActive: boolean;
}

export interface MarketplaceVisibility {
  /** Khách có thấy và đặt được xe này không — kết quả hiển thị THỰC TẾ. */
  visible: boolean;
  reason: MarketplaceVisibilityReason;
}

/**
 * Ba trục → một trạng thái hiệu lực + LÝ DO.
 *
 * ## Thứ tự xét là một quyết định, không phải chi tiết cài đặt
 *
 * Với `visible` thì thứ tự không đổi gì — mọi vế đều là điều kiện AND. Nó chỉ quyết định LÝ DO
 * nào được kể khi có nhiều vế cùng chặn, và lý do là thứ chủ xe đọc để biết phải làm gì tiếp.
 * Nên thứ tự đi từ rào KHÔNG THỂ vượt bằng thao tác trên chính chiếc xe, xuống dần tới rào chủ
 * xe tự gỡ được bằng một cú bấm:
 *
 *   xoá mềm → gian hàng bị khoá → nền tảng ẩn → chưa duyệt → chủ xe tạm ẩn
 *
 * Nói "bạn đang tắt hiển thị" với một người mà gian hàng của họ vừa bị khoá là chỉ sai chỗ: họ
 * bật lại công tắc, không có gì xảy ra, và không ai giải thích tại sao.
 */
export function resolveMarketplaceVisibility(
  input: MarketplaceVisibilityInput,
): MarketplaceVisibility {
  const hidden = (reason: MarketplaceVisibilityReason): MarketplaceVisibility => ({
    visible: false,
    reason,
  });

  if (input.deletedAt != null) return hidden(MARKETPLACE_VISIBILITY_REASON.ARCHIVED);
  if (!input.shopActive) return hidden(MARKETPLACE_VISIBILITY_REASON.SHOP_INACTIVE);
  if (input.publicStatus === VEHICLE_PUBLIC_STATUS.HIDDEN) {
    return hidden(MARKETPLACE_VISIBILITY_REASON.PLATFORM_HIDDEN);
  }
  if (input.publicStatus !== VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC) {
    return hidden(MARKETPLACE_VISIBILITY_REASON.NOT_APPROVED);
  }
  if (!input.marketplaceEnabled) return hidden(MARKETPLACE_VISIBILITY_REASON.OWNER_PAUSED);

  return { visible: true, reason: MARKETPLACE_VISIBILITY_REASON.VISIBLE };
}

/**
 * Công tắc hiển thị có BẬT LÊN được không — dùng ở cả hai phía.
 *
 * Backend ném lỗi theo đúng vị từ này; web dùng nó để quyết định `disabled`. Tắt thì LUÔN được
 * (ADR 0048 điều 3): gỡ xe của mình khỏi chợ không cần xin phép ai.
 */
export function canEnableMarketplace(publicStatus: VehiclePublicStatus | string): boolean {
  return publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
}
