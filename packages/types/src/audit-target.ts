/**
 * Mã LOẠI ĐỐI TƯỢNG của `audit_logs.target_type` — một danh sách cho api (ghi + tra tên), web
 * (nhãn, lọc, link sâu) và test phủ nhãn. Mã là dữ liệu đối soát: thêm mã mới ở đây cùng lúc với
 * dòng `audit.record` đầu tiên ghi nó, và thêm nhãn ở `Domain.auditTargetType` (vi + en).
 *
 * Các module cũ còn viết mã bằng chuỗi tại chỗ ghi; chuyển dần sang hằng này khi đụng tới.
 */
export const AUDIT_TARGET_TYPE = {
  APPROVAL_TASK: 'approval_task',
  BANK_ACCOUNT: 'bank_account',
  BANK_TRANSACTION: 'bank_transaction',
  BOOKING: 'booking',
  BOOKING_HOLD: 'booking_hold',
  BOOKING_INSURANCE_POLICY: 'booking_insurance_policy',
  BOOKING_REQUEST: 'booking_request',
  BOOKING_SURCHARGE: 'booking_surcharge',
  CATALOG_ITEM: 'catalog_item',
  CONTRACT: 'contract',
  /** Lượt nộp bằng lái của tài khoản khách (ADR 0057). */
  CUSTOMER_DRIVER_LICENCE: 'customer_driver_licence',
  DRIVER: 'driver',
  FEE_POLICY: 'fee_policy',
  HOLD_REFUND: 'hold_refund',
  HOLIDAY_SYNC_RUN: 'holiday_sync_run',
  MARKETPLACE_BANNER: 'marketplace_banner',
  PAYMENT: 'payment',
  PLAN: 'plan',
  PLATFORM_BANK_BALANCE: 'platform_bank_balance',
  PLATFORM_MEMBERSHIP: 'platform_membership',
  PROMO_CODE: 'promo_code',
  PROVINCE: 'province',
  RECEIPT: 'receipt',
  RENTAL_POLICY: 'rental_policy',
  SELLER_PROFILE: 'seller_profile',
  SUBSCRIPTION_INVOICE: 'subscription_invoice',
  SUPPORT_CASE: 'support_case',
  TAX_PERIOD: 'tax_period',
  TAX_WITHHOLDING: 'tax_withholding',
  TENANT: 'tenant',
  TENANT_BRANCH: 'tenant_branch',
  TENANT_CUSTOMER: 'tenant_customer',
  TENANT_CUSTOMER_DOCUMENT: 'tenant_customer_document',
  TENANT_INVITE: 'tenant_invite',
  TENANT_MEMBERSHIP: 'tenant_membership',
  TENANT_PAYMENT_SETTINGS: 'tenant_payment_settings',
  TENANT_SUBSCRIPTION: 'tenant_subscription',
  USER: 'user',
  VEHICLE: 'vehicle',
  VEHICLE_BLOCK: 'vehicle_block',
  VEHICLE_BLOCK_BATCH: 'vehicle_block_batch',
  VEHICLE_CATALOG_MODEL: 'vehicle_catalog_model',
  VEHICLE_DAILY_PRICE_BATCH: 'vehicle_daily_price_batch',
  VEHICLE_DOCUMENT: 'vehicle_document',
  VEHICLE_HANDOVER: 'vehicle_handover',
  VEHICLE_MAINTENANCE_RECORD: 'vehicle_maintenance_record',
  VEHICLE_PRIVATE_FILE: 'vehicle_private_file',
  WITHDRAWAL_REQUEST: 'withdrawal_request',
} as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPE)[keyof typeof AUDIT_TARGET_TYPE];

export const AUDIT_TARGET_TYPE_VALUES = Object.values(AUDIT_TARGET_TYPE) as AuditTargetType[];
