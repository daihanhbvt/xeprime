import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  AUDIT_ACTOR_SCOPE,
  AUDIT_TARGET_TYPE,
  auditActionCategoryOf,
  type AuditTargetType,
} from '@xeprime/types';
import type { DomainGroup, DomainLabel } from '@/i18n/domain';
import type { AppMessages } from '@/i18n/messages';

type DomainMessages = AppMessages['Domain'];

/** Cây message lồng nhau — `auditAction.vehicle.document.create` là ba tầng object rồi một chuỗi. */
type MessageTree = { readonly [key: string]: string | MessageTree };

export interface AuditLabels {
  /** Nhãn đầy đủ của một mã hành động: `subscription.assign` → "Gán gói dịch vụ". */
  action: (action: string) => string;
  /** Nhóm của hành động (`auditActionCategory`) — dùng làm tiền tố trong ô chọn. */
  actionCategory: (action: string) => string;
  targetType: (targetType: string) => string;
  /**
   * "Loại: tên" của đối tượng một dòng nhật ký — tên do server tra (`targetLabel`), thiếu thì mã
   * rút gọn. Một chỗ ghép cho bảng nhật ký và tab Nhật ký của đối tác.
   */
  target: (row: {
    targetType: string;
    targetId?: string | null;
    targetLabel?: string | null;
  }) => string;
  /** Nhãn một trường trong snapshot before/after, theo đường dẫn phẳng (`quota.maxVehicles`). */
  field: (path: string) => string;
  /** Mọi mã hành động đã có nhãn — nguồn của ô lọc "Hành động". */
  actionCodes: readonly string[];
  /** Mọi loại đối tượng đã có nhãn — nguồn của ô lọc "Đối tượng". */
  targetTypeCodes: readonly string[];
}

/**
 * Bộ tra nhãn của nhật ký — THUẦN, nhận bó `Domain` và `DomainLabel` để test được bằng bó thật và
 * để Server Component dùng lại nếu cần (`useAuditLabels` chỉ nối hook).
 *
 * Vì sao đọc thẳng cây message thay vì chỉ qua `DomainLabel`: khoá hành động chứa dấu chấm nên
 * `t.has('auditAction.subscription')` cũng trả `true` cho một NHÓM, và `t()` một nhóm là lỗi
 * runtime của next-intl. Tra trên cây thì phân biệt được "có chuỗi" với "chỉ có nhánh".
 */
export function createAuditLabels(domain: DomainMessages, domainLabel: DomainLabel): AuditLabels {
  const actions = domain.auditAction as MessageTree;
  const targetTypes = domain.auditTargetType as MessageTree;
  const fields = domain.auditField as MessageTree;

  return {
    action: (action) => {
      const full = lookup(actions, action);
      if (full) return full;
      // Chưa có nhãn đầy đủ → ghép "Nhóm · Động từ" từ hai bảng cũ; vẫn không có động từ thì
      // hiện mã thô, để một hành động mới KHÔNG BAO GIỜ thành ô trống.
      const verb = action.slice(action.lastIndexOf('.') + 1);
      const verbLabel = domainLabel('auditActionVerb', verb, '');
      const category = domainLabel('auditActionCategory', auditActionCategoryOf(action));
      return verbLabel ? `${category}${LIST_SEPARATOR}${verbLabel}` : action;
    },
    actionCategory: (action) => domainLabel('auditActionCategory', auditActionCategoryOf(action)),
    targetType: (targetType) => lookup(targetTypes, targetType) ?? humanize(targetType),
    target: (row) => {
      const kind = lookup(targetTypes, row.targetType) ?? humanize(row.targetType);
      const name = row.targetLabel ?? (row.targetId ? shortAuditId(row.targetId) : null);
      return name ? `${kind}: ${name}` : kind;
    },
    field: (path) => {
      const full = lookup(fields, path);
      if (full) return full;
      // `items.0.price` → thử "price"; mảng/đối tượng lồng nhau vẫn có nhãn trường lá.
      const leaf = path.slice(path.lastIndexOf('.') + 1);
      return (leaf !== path && lookup(fields, leaf)) || path;
    },
    actionCodes: leafPaths(actions),
    targetTypeCodes: Object.keys(targetTypes),
  };
}

/** Chuỗi ở đường dẫn `a.b.c` trong cây message; `undefined` nếu thiếu hoặc mới tới một nhánh. */
function lookup(tree: MessageTree, path: string): string | undefined {
  let node: string | MessageTree | undefined = tree;
  for (const segment of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

function leafPaths(tree: MessageTree, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.push(path);
    else out.push(...leafPaths(value, path));
  }
  return out;
}

/** `vehicle_private_file` → "vehicle private file" — dự phòng cho mã chưa có nhãn. */
function humanize(code: string): string {
  return code.replace(/_/g, ' ');
}

/** Mã ULID 26 ký tự: hiện đuôi để nhận ra, bản đầy đủ nằm ở `title`/nút sao chép. */
export function shortAuditId(id: string): string {
  return id.length > 10 ? `…${id.slice(-8)}` : id;
}

/**
 * Nhóm từ vựng để dịch GIÁ TRỊ của trường `status` theo loại đối tượng. Một `status` không có
 * nghĩa toàn cục — `active` của gói khác `active` của đơn — nên bảng này tra theo `targetType`.
 */
const STATUS_GROUP_BY_TARGET: Readonly<Partial<Record<AuditTargetType, DomainGroup>>> = {
  [AUDIT_TARGET_TYPE.TENANT_SUBSCRIPTION]: 'subscriptionStatus',
  [AUDIT_TARGET_TYPE.BOOKING]: 'bookingStatus',
  [AUDIT_TARGET_TYPE.TENANT]: 'tenantStatus',
  [AUDIT_TARGET_TYPE.BOOKING_REQUEST]: 'bookingRequestStatus',
  [AUDIT_TARGET_TYPE.BOOKING_HOLD]: 'bookingHoldStatus',
  [AUDIT_TARGET_TYPE.HOLD_REFUND]: 'holdRefundStatus',
  [AUDIT_TARGET_TYPE.WITHDRAWAL_REQUEST]: 'withdrawalStatus',
  [AUDIT_TARGET_TYPE.SUPPORT_CASE]: 'supportCaseStatus',
  [AUDIT_TARGET_TYPE.SUBSCRIPTION_INVOICE]: 'subscriptionInvoiceStatus',
  [AUDIT_TARGET_TYPE.RECEIPT]: 'receiptStatus',
  [AUDIT_TARGET_TYPE.PAYMENT]: 'paymentStatus',
  [AUDIT_TARGET_TYPE.APPROVAL_TASK]: 'approvalStatus',
  [AUDIT_TARGET_TYPE.FEE_POLICY]: 'feePolicyStatus',
  [AUDIT_TARGET_TYPE.SELLER_PROFILE]: 'sellerProfileStatus',
  [AUDIT_TARGET_TYPE.CUSTOMER_DRIVER_LICENCE]: 'driverLicenceStatus',
  [AUDIT_TARGET_TYPE.TENANT_MEMBERSHIP]: 'membershipStatus',
  [AUDIT_TARGET_TYPE.TENANT_INVITE]: 'inviteStatus',
  [AUDIT_TARGET_TYPE.VEHICLE_MAINTENANCE_RECORD]: 'maintenanceStatus',
  [AUDIT_TARGET_TYPE.VEHICLE_HANDOVER]: 'handoverStatus',
  [AUDIT_TARGET_TYPE.DRIVER]: 'driverStatus',
  [AUDIT_TARGET_TYPE.TENANT_BRANCH]: 'branchStatus',
  [AUDIT_TARGET_TYPE.CONTRACT]: 'contractStatus',
  [AUDIT_TARGET_TYPE.BOOKING_INSURANCE_POLICY]: 'insurancePolicyStatus',
  [AUDIT_TARGET_TYPE.TAX_WITHHOLDING]: 'taxWithholdingStatus',
};

/** Trường có từ vựng riêng bất kể đối tượng — tra theo TÊN TRƯỜNG LÁ. */
const GROUP_BY_FIELD: Readonly<Record<string, DomainGroup>> = {
  billingMode: 'billingMode',
  publicStatus: 'vehiclePublicStatus',
  operationStatus: 'vehicleOperationStatus',
  riskLevel: 'tenantCustomerRiskLevel',
  reasonCategory: 'cancellationReasonCategory',
  vehicleType: 'vehicleType',
  serviceType: 'serviceType',
};

const STATUS_FIELDS = new Set(['status', 'fromStatus', 'toStatus']);
const ROLE_FIELDS = new Set(['role', 'roleCode']);

/** Nhóm từ vựng để dịch giá trị của một trường; `null` = hiện giá trị như đã ghi. */
export function auditValueGroup(targetType: string, path: string): DomainGroup | null {
  const leaf = path.slice(path.lastIndexOf('.') + 1);
  if (STATUS_FIELDS.has(leaf)) {
    return STATUS_GROUP_BY_TARGET[targetType as AuditTargetType] ?? null;
  }
  // `reason` của lượt huỷ kỳ gói là MÃ (`SUBSCRIPTION_CANCEL_REASON`); ở chỗ khác nó là chữ người gõ.
  if (leaf === 'reason' && targetType === AUDIT_TARGET_TYPE.TENANT_SUBSCRIPTION) {
    return 'subscriptionCancelReason';
  }
  if (ROLE_FIELDS.has(leaf)) {
    return targetType === AUDIT_TARGET_TYPE.PLATFORM_MEMBERSHIP ? 'platformRole' : 'tenantRole';
  }
  return GROUP_BY_FIELD[leaf] ?? null;
}

/**
 * Tên người thực hiện để HIỂN THỊ: tên tài khoản; dòng do worker/cron ghi (phạm vi Hệ thống,
 * không có tài khoản) gọi đúng là "Hệ thống" thay vì một gạch ngang.
 */
export function auditActorName(
  log: { actorName?: string | null; actorScope: string },
  systemLabel: string,
  emptyLabel: string,
): string {
  if (log.actorName) return log.actorName;
  return log.actorScope === AUDIT_ACTOR_SCOPE.SYSTEM ? systemLabel : emptyLabel;
}
