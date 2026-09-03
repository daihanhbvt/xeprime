'use client';

import { CalendarOutlined, EnvironmentOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Radio, Segmented, Select } from 'antd';
import { appWallClockToIso, toAppTz } from '@/lib/datetime';
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
import { defaultRentalRange } from '../search/search-draft';
import { useDestinations } from '../hooks/use-destinations';
import type { MarketplaceFilters } from '../types';
import styles from './SearchDialog.module.css';
import { useTranslations } from 'next-intl';
import { useDomainLabel } from '@/i18n/use-domain-label';

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
  const domainLabel = useDomainLabel();
  const tSearch = useTranslations('HomeSearch');
  const tDialog = useTranslations('Marketplace.searchDialog');
  const tLocation = useTranslations('HomeSearch.location');
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
    // Khoảng mặc định là LUẬT dùng chung (`@xeprime/domain`), không phải hai dòng chép lại ở
    // đây; và mốc từ URL đọc theo giờ VN như mọi bề mặt khác (CLAUDE.md §9).
    const fallback = defaultRentalRange();
    return {
      pickupAt: initial.pickupAt ? toAppTz(initial.pickupAt) : fallback.pickupAt,
      returnAt: initial.returnAt ? toAppTz(initial.returnAt) : fallback.returnAt,
    };
  });

  const provinceOptions = useMemo(
    () =>
      buildProvinceOptions(destinations, province, {
        nationwide: tLocation('nationwide'),
        unavailable: tLocation('unavailable'),
      }),
    [destinations, province, tLocation],
  );

  function submit() {
    onSubmit({
      vehicleType,
      provinceCode: province || undefined,
      // Dài hạn KHÔNG mang ngày (Mioto flow — 17/08 đợt 3): chọn xe trước, ngày chọn ở modal
      // gửi yêu cầu (sàn 7 ngày giữ nguyên ở đó + backend).
      pickupAt: longTerm || !range.pickupAt ? undefined : appWallClockToIso(range.pickupAt),
      returnAt: longTerm || !range.returnAt ? undefined : appWallClockToIso(range.returnAt),
      hourly: !longTerm && mode === 'hourly' ? true : undefined,
      routeType: withDriver ? routeType : undefined,
    });
  }

  return (
    <ResponsiveDialog title={tDialog('title')} open={open} onClose={onClose} footer={null}>
      <div className={styles.body}>
        {withDriver ? (
          <div className={styles.cell}>
            <span className={styles.cellLabel}>{tSearch('route.label')}</span>
            <Radio.Group
              value={routeType}
              onChange={(e) => setRouteType(e.target.value as RouteType)}
              options={ROUTE_TYPE_VALUES.map((value) => ({
                value,
                label: domainLabel('routeType', value, ROUTE_TYPE_LABEL[value]),
              }))}
            />
            <span className={styles.routeHint}>
              {domainLabel('routeTypeDescription', routeType, ROUTE_TYPE_DESCRIPTION[routeType])}
            </span>
          </div>
        ) : null}

        {/* Thời gian thuê đứng ĐẦU các ô nhập — lý do mở hộp này thường là đổi lịch.
            Dài hạn KHÔNG hỏi ngày ở bước tìm (Mioto flow): chọn xe trước, ngày ở bước yêu cầu. */}
        {longTerm ? (
          <p className={styles.routeHint}>
            {tDialog('longTermHint', { packages: LONG_TERM_PACKAGE_MONTHS.join('/') })}
          </p>
        ) : (
          <div className={styles.cell}>
            <span className={styles.cellLabel}>{tSearch('rental.label')}</span>
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
          <span className={styles.cellLabel}>{tSearch('card.vehicleTypeLabel')}</span>
          <Segmented
            block
            value={vehicleType}
            onChange={(v) => setVehicleType(v as string)}
            options={[
              { value: VEHICLE_TYPE.CAR, label: domainLabel('vehicleType', VEHICLE_TYPE.CAR) },
              {
                value: VEHICLE_TYPE.MOTORBIKE,
                label: domainLabel('vehicleType', VEHICLE_TYPE.MOTORBIKE),
              },
            ]}
          />
        </div>

        <div className={styles.cell}>
          <span className={styles.cellLabel}>{tSearch('location.label')}</span>
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
              aria-label={tDialog('locationAriaLabel')}
            />
          </div>
        </div>

        <Button type="primary" size="large" block icon={<SearchOutlined />} onClick={submit}>
          {tSearch('card.submit')}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}
