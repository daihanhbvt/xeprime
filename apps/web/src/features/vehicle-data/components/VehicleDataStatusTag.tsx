'use client';

import { STATUS_COLOR, VEHICLE_DATA_STATUS, type VehicleDataStatus } from '@xeprime/types';
import { Tag } from 'antd';
import { useTranslations } from 'next-intl';

import styles from './VehicleData.module.css';

const COLOR: Record<VehicleDataStatus, string> = {
  [VEHICLE_DATA_STATUS.ACTIVE]: STATUS_COLOR.SUCCESS,
  [VEHICLE_DATA_STATUS.HIDDEN]: STATUS_COLOR.NEUTRAL,
  [VEHICLE_DATA_STATUS.PENDING]: STATUS_COLOR.WARNING,
};

/** Trạng thái hiển thị của một xe chuẩn: đang gợi ý · đã ẩn · chờ duyệt. */
export function VehicleDataStatusTag({ status }: { status: string }) {
  const t = useTranslations('AdminVehicleData.status');
  const key = status as VehicleDataStatus;
  return (
    <Tag color={COLOR[key] ?? STATUS_COLOR.NEUTRAL} className={styles.tag}>
      {COLOR[key] ? t(key) : status}
    </Tag>
  );
}
