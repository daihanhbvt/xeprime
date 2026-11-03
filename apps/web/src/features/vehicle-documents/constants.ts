import { VEHICLE_DOCUMENT_TYPE, type VehicleDocumentType } from '@xeprime/types';

/**
 * Ba loại giấy tờ CỐT LÕI của mọi xe — đăng ký · đăng kiểm · bảo hiểm. Màn giấy tờ luôn dựng sẵn
 * ba hàng này (kể cả khi chưa có file), và menu màn sửa xe đếm "x/3" trên đúng bộ này.
 */
export const STANDARD_VEHICLE_DOCUMENT_TYPES: readonly VehicleDocumentType[] = [
  VEHICLE_DOCUMENT_TYPE.REGISTRATION,
  VEHICLE_DOCUMENT_TYPE.INSPECTION,
  VEHICLE_DOCUMENT_TYPE.INSURANCE,
];
