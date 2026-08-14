'use client';

import { CalendarOutlined, EnvironmentOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Segmented, Select } from 'antd';
import dayjs from 'dayjs';
import { VEHICLE_TYPE } from '@xeprime/types';
import { useMemo, useState } from 'react';
import {
  RentalDateTimeRangeField,
  type RentalMode,
  type RentalRange,
} from '@/components/form/RentalDateTimeRangeField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { buildProvinceOptions } from '../province-options';
import { useDestinations } from '../hooks/use-destinations';
import type { MarketplaceFilters } from '../types';
import styles from './SearchDialog.module.css';

/** Số tỉnh/thành đổ vào ô "Địa điểm" — ưu tiên nơi nhiều xe nhất. */
const PROVINCE_OPTIONS_LIMIT = 24;

export interface SearchDialogValues {
  vehicleType: string;
  /** MÃ tỉnh — cùng giá trị mà hero desktop phát ra, nên hai lối vào không lệch nhau. */
  provinceCode?: string;
  pickupAt?: string;
  returnAt?: string;
  hourly?: boolean;
}

/**
 * Hộp "Tìm kiếm" dùng CHUNG — thanh tìm kiếm mobile của trang chủ và vùng ngữ cảnh trên
 * `/search`. Một bộ trường duy nhất (Thời gian thuê · Loại xe · Địa điểm) nên hai lối vào không
 * bao giờ lệch nhau. TỪ KHOÁ không nằm ở đây — nó là ô nhập trực tiếp trên trang (yêu cầu
 * 10/08), hộp này chỉ đổi NGỮ CẢNH thuê.
 *
 * Giữ DRAFT cục bộ, chỉ phát `onSubmit` khi bấm "Tìm xe" — đóng ngang chừng không đổi URL.
 * Remount theo `open` (key ở caller) để mỗi lần mở nạp lại đúng filter hiện hành.
 */
export function SearchDialog({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: MarketplaceFilters;
  onClose: () => void;
  onSubmit: (values: SearchDialogValues) => void;
}) {
  const { data: destinations, isLoading: loadingProvinces } =
    useDestinations(PROVINCE_OPTIONS_LIMIT);

  const [vehicleType, setVehicleType] = useState<string>(initial.vehicleType ?? VEHICLE_TYPE.CAR);
  const [province, setProvince] = useState(initial.provinceCode ?? '');
  const [mode, setMode] = useState<RentalMode>(initial.hourly ? 'hourly' : 'daily');
  const [range, setRange] = useState<RentalRange>(() => ({
    pickupAt: initial.pickupAt
      ? dayjs(initial.pickupAt)
      : dayjs().add(1, 'day').hour(10).startOf('hour'),
    returnAt: initial.returnAt
      ? dayjs(initial.returnAt)
      : dayjs().add(4, 'day').hour(10).startOf('hour'),
  }));

  const provinceOptions = useMemo(
    () => buildProvinceOptions(destinations, province),
    [destinations, province],
  );

  function submit() {
    onSubmit({
      vehicleType,
      provinceCode: province || undefined,
      pickupAt: range.pickupAt?.toISOString(),
      returnAt: range.returnAt?.toISOString(),
      hourly: mode === 'hourly' ? true : undefined,
    });
  }

  return (
    <ResponsiveDialog title="Tìm kiếm" open={open} onClose={onClose} footer={null}>
      <div className={styles.body}>
        {/* Thời gian thuê đứng ĐẦU — lý do người dùng mở hộp này thường là đổi lịch. */}
        <div className={styles.cell}>
          <span className={styles.cellLabel}>Thời gian thuê</span>
          <RentalDateTimeRangeField
            value={range}
            onChange={setRange}
            mode={mode}
            onModeChange={setMode}
            prefix={<CalendarOutlined className={styles.boxIcon} />}
            className={styles.box}
          />
        </div>

        <div className={styles.cell}>
          <span className={styles.cellLabel}>Loại xe</span>
          <Segmented
            block
            value={vehicleType}
            onChange={(v) => setVehicleType(v as string)}
            options={[
              { value: VEHICLE_TYPE.CAR, label: 'Ô tô' },
              { value: VEHICLE_TYPE.MOTORBIKE, label: 'Xe máy' },
            ]}
          />
        </div>

        <div className={styles.cell}>
          <span className={styles.cellLabel}>Địa điểm</span>
          <div className={styles.box}>
            <EnvironmentOutlined className={styles.boxIcon} />
            <Select
              variant="borderless"
              value={province}
              onChange={setProvince}
              options={provinceOptions}
              loading={loadingProvinces}
              showSearch
              optionFilterProp="label"
              className={styles.grow}
              popupMatchSelectWidth={false}
              aria-label="Địa điểm nhận xe"
            />
          </div>
        </div>

        <Button type="primary" size="large" block icon={<SearchOutlined />} onClick={submit}>
          Tìm xe
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
