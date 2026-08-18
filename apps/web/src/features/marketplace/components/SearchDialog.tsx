'use client';

import { CalendarOutlined, EnvironmentOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Radio, Segmented, Select } from 'antd';
import dayjs from 'dayjs';
import {
  LONG_TERM_PACKAGE_MONTHS,
  ROUTE_TYPE,
  ROUTE_TYPE_DESCRIPTION,
  ROUTE_TYPE_LABEL,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  VEHICLE_TYPE,
  isRouteType,
  type RouteType,
} from '@xeprime/types';
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
  /** Lộ trình — chỉ phát khi ngữ cảnh là CÓ TÀI XẾ (undefined = xoá khỏi URL). */
  routeType?: string;
}

/**
 * Hộp "Tìm kiếm" dùng CHUNG — thanh tìm kiếm mobile của trang chủ và vùng ngữ cảnh trên
 * `/search`. Một bộ trường duy nhất nên hai lối vào không bao giờ lệch nhau. DỊCH VỤ không đổi
 * ở đây (tab hero / chip trên `/search` sở hữu nó) nhưng hộp ĐỌC `initial.serviceType`:
 *   - dài hạn → KHÔNG hỏi ngày (chọn gói + nguyện vọng ngày nhận ở bước gửi yêu cầu);
 *   - có tài xế → thêm radio LỘ TRÌNH (ngữ cảnh cho yêu cầu thuê, không phải chiều lọc).
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

  const longTerm = initial.serviceType === SERVICE_TYPE.LONG_TERM;
  const withDriver = initial.serviceType === SERVICE_TYPE.WITH_DRIVER;

  const [vehicleType, setVehicleType] = useState<string>(initial.vehicleType ?? VEHICLE_TYPE.CAR);
  const [province, setProvince] = useState(initial.provinceCode ?? '');
  const [routeType, setRouteType] = useState<RouteType>(() =>
    isRouteType(initial.routeType) ? initial.routeType : ROUTE_TYPE.IN_CITY,
  );
  const [mode, setMode] = useState<RentalMode>(initial.hourly ? 'hourly' : 'daily');
  const [range, setRange] = useState<RentalRange>(() => {
    const pickupAt = initial.pickupAt
      ? dayjs(initial.pickupAt)
      : dayjs().add(1, 'day').hour(10).startOf('hour');
    const returnAt = initial.returnAt
      ? dayjs(initial.returnAt)
      : dayjs().add(4, 'day').hour(10).startOf('hour');
    return { pickupAt, returnAt };
  });

  const provinceOptions = useMemo(
    () => buildProvinceOptions(destinations, province),
    [destinations, province],
  );

  function submit() {
    onSubmit({
      vehicleType,
      provinceCode: province || undefined,
      // Dài hạn KHÔNG mang ngày (Mioto flow — 17/08 đợt 3): chọn xe trước, ngày chọn ở modal
      // gửi yêu cầu (sàn 7 ngày giữ nguyên ở đó + backend).
      pickupAt: longTerm ? undefined : range.pickupAt?.toISOString(),
      returnAt: longTerm ? undefined : range.returnAt?.toISOString(),
      hourly: !longTerm && mode === 'hourly' ? true : undefined,
      routeType: withDriver ? routeType : undefined,
    });
  }

  return (
    <ResponsiveDialog title="Tìm kiếm" open={open} onClose={onClose} footer={null}>
      <div className={styles.body}>
        {withDriver ? (
          <div className={styles.cell}>
            <span className={styles.cellLabel}>Lộ trình</span>
            <Radio.Group
              value={routeType}
              onChange={(e) => setRouteType(e.target.value as RouteType)}
              options={ROUTE_TYPE_VALUES.map((value) => ({
                value,
                label: ROUTE_TYPE_LABEL[value],
              }))}
            />
            <span className={styles.routeHint}>{ROUTE_TYPE_DESCRIPTION[routeType]}</span>
          </div>
        ) : null}

        {/* Thời gian thuê đứng ĐẦU các ô nhập — lý do mở hộp này thường là đổi lịch.
            Dài hạn KHÔNG hỏi ngày ở bước tìm (Mioto flow): chọn xe trước, ngày ở bước yêu cầu. */}
        {longTerm ? (
          <p className={styles.routeHint}>
            Chọn xe trước — sau đó chọn gói thuê ({LONG_TERM_PACKAGE_MONTHS.join('/')} tháng) và
            nguyện vọng ngày nhận khi gửi yêu cầu thuê.
          </p>
        ) : (
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
        )}

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
