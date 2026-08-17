'use client';

import {
  CalendarOutlined,
  CarOutlined,
  EditOutlined,
  EnvironmentOutlined,
  IdcardOutlined,
  ScheduleOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Button, Segmented, Select } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import {
  SERVICE_TYPE,
  VEHICLE_TYPE,
  VEHICLE_TYPE_LABEL,
  VEHICLE_TYPE_VALUES,
  type ServiceType,
  type VehicleType,
} from '@xeprime/types';
import { useMemo, useState, type ReactNode } from 'react';
import {
  RentalDateTimeRangeField,
  type RentalMode,
  type RentalRange,
} from '@/components/form/RentalDateTimeRangeField';
import { ROUTES } from '@/constants/routes';
import { useIsMobile } from '@/hooks/use-media-query';
import { cx } from '@/lib/cx';
import { applyFilterPatch } from '../filter-params';
import { SERVICE_TABS } from '../constants';
import { buildProvinceOptions, provinceLabelOf } from '../province-options';
import { useDestinations } from '../hooks/use-destinations';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { SearchDialog } from './SearchDialog';
import styles from './HeroSearch.module.css';

/** Số tỉnh/thành đổ vào ô "Địa điểm" — ưu tiên nơi nhiều xe nhất. */
const PROVINCE_OPTIONS_LIMIT = 24;

/** Icon từng tab dịch vụ — icon là ReactNode nên sống ở component, không nhét vào constants. */
const SERVICE_TAB_ICON: Partial<Record<ServiceType, ReactNode>> = {
  [SERVICE_TYPE.SELF_DRIVE]: <CarOutlined />,
  [SERVICE_TYPE.WITH_DRIVER]: <IdcardOutlined />,
  [SERVICE_TYPE.LONG_TERM]: <ScheduleOutlined />,
};

/**
 * Thẻ tìm kiếm của trang chủ (yêu cầu 17/08 — mô hình 3 dịch vụ): hàng TAB Xe tự lái · Xe có
 * tài xế · Thuê xe dài hạn đè trên thẻ trắng, trong thẻ là các ô CÓ CẤU TRÚC — Loại xe · Địa
 * điểm · Thời gian thuê · nút Tìm xe. Ô TỪ KHOÁ đã bỏ hẳn: gõ tự do sai key là không ra xe,
 * trong khi mọi ý định tìm ("xe 7 chỗ", hãng…) đều có bộ lọc cấu trúc trên `/search`.
 *
 * Tab chỉ đổi `serviceType` (+ ẩn Thời gian với dài hạn) — địa điểm/thời gian đã chọn GIỮ
 * NGUYÊN khi đổi tab, người dùng không phải nhập lại. Riêng "Thuê dài hạn" không mang ngày giờ
 * vào truy vấn: thời điểm nhận xe của hợp đồng dài hạn là thứ thoả thuận với gian hàng, không
 * phải điều kiện lọc lịch trống.
 *
 * "Tìm xe" điều hướng sang `/search`, filter serialize bằng đúng bộ `applyFilterPatch` của
 * marketplace (một định dạng query duy nhất; giá trị rỗng bị loại khỏi URL) — `serviceType`
 * trên URL cũng chính là chip dịch vụ đang bật ở trang kết quả.
 *
 * Mobile: thẻ thu thành Segmented 3 dịch vụ + hàng ngữ cảnh (bấm mở sheet chỉnh đủ trường) +
 * nút Tìm xe — tìm ngay với mặc định hợp lý, không bắt mở sheet mới tìm được.
 */
export function HeroSearch() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { filters } = useMarketplaceFilters();
  const { data: destinations, isLoading: loadingProvinces } =
    useDestinations(PROVINCE_OPTIONS_LIMIT);

  // Tab dịch vụ — nạp lại từ URL nếu quay về trang chủ với serviceType sẵn có.
  const [service, setService] = useState<ServiceType>(() =>
    SERVICE_TABS.some((t) => t.key === filters.serviceType)
      ? (filters.serviceType as ServiceType)
      : SERVICE_TYPE.SELF_DRIVE,
  );
  const [vehicleType, setVehicleType] = useState<string>(filters.vehicleType ?? VEHICLE_TYPE.CAR);
  // Giá trị state là MÃ tỉnh — cùng thứ đi vào URL và gửi cho API.
  const [province, setProvince] = useState(filters.provinceCode ?? '');
  // Tab "Thuê theo giờ" ánh xạ vào filter `hourly` sẵn có (xe CÓ giá thuê giờ) — nhờ vậy chế độ
  // sống trong URL bằng đúng hợp đồng hiện tại, không phải chế một param mới cho backend lơ đi.
  const [mode, setMode] = useState<RentalMode>(filters.hourly ? 'hourly' : 'daily');
  const [range, setRange] = useState<RentalRange>(() => ({
    pickupAt: filters.pickupAt
      ? dayjs(filters.pickupAt)
      : dayjs().add(1, 'day').hour(10).startOf('hour'),
    returnAt: filters.returnAt
      ? dayjs(filters.returnAt)
      : dayjs().add(4, 'day').hour(10).startOf('hour'),
  }));
  const [sheetOpen, setSheetOpen] = useState(false);

  const longTerm = service === SERVICE_TYPE.LONG_TERM;

  const provinceOptions = useMemo(
    () => buildProvinceOptions(destinations, province),
    [destinations, province],
  );

  const vehicleTypeOptions = useMemo(
    () => VEHICLE_TYPE_VALUES.map((value) => ({ value, label: VEHICLE_TYPE_LABEL[value] })),
    [],
  );

  function submit() {
    const params = new URLSearchParams();
    applyFilterPatch(params, {
      serviceType: service,
      vehicleType,
      provinceCode: province || undefined,
      // Dài hạn: không mang ngày giờ/chế độ giờ vào truy vấn (xem doc-comment đầu file).
      pickupAt: longTerm ? undefined : range.pickupAt?.toISOString(),
      returnAt: longTerm ? undefined : range.returnAt?.toISOString(),
      hourly: !longTerm && mode === 'hourly' ? true : undefined,
    });
    setSheetOpen(false);
    const qs = params.toString();
    router.push(qs ? `${ROUTES.SEARCH}?${qs}` : ROUTES.SEARCH);
  }

  if (isMobile) {
    const summary = [
      VEHICLE_TYPE_LABEL[vehicleType as VehicleType] ?? 'Xe',
      // Tóm tắt hiện TÊN tỉnh, không hiện mã — mã là chuyện của URL.
      provinceLabelOf(destinations, province) ?? 'Toàn quốc',
      !longTerm && range.pickupAt && range.returnAt
        ? `${range.pickupAt.format('DD/MM')}–${range.returnAt.format('DD/MM')}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <div className={styles.cardOuter}>
        <div className={styles.mobileBox}>
          {/* Tab dịch vụ đứng đầu — quyết định các trường bên dưới, giống hàng tab desktop. */}
          <div className={styles.mobileTabs}>
            <Segmented
              block
              value={service}
              onChange={(v) => setService(v as ServiceType)}
              options={SERVICE_TABS.map((t) => ({ value: t.key, label: t.shortLabel }))}
            />
          </div>
          <button
            type="button"
            className={styles.mobileContextRow}
            onClick={() => setSheetOpen(true)}
            aria-label={`Chỉnh sửa tìm kiếm: ${summary}`}
          >
            <span className={styles.mobilePillText}>{summary}</span>
            <EditOutlined className={styles.mobileIcon} />
          </button>
          {/* Tìm ngay với ngữ cảnh đang hiện — sheet chỉ dành cho ai muốn chỉnh trước. */}
          <div className={styles.mobileActions}>
            <Button type="primary" size="large" block icon={<SearchOutlined />} onClick={submit}>
              Tìm xe
            </Button>
          </div>
        </div>

        {/* Sheet dùng CHUNG với /search — nhận serviceType đang chọn để tự ẩn Thời gian thuê
            khi là dài hạn. */}
        {sheetOpen ? (
          <SearchDialog
            open
            initial={{ ...filters, serviceType: service }}
            onClose={() => setSheetOpen(false)}
            onSubmit={(values) => {
              setSheetOpen(false);
              const params = new URLSearchParams();
              applyFilterPatch(params, { ...values, serviceType: service });
              const qs = params.toString();
              router.push(qs ? `${ROUTES.SEARCH}?${qs}` : ROUTES.SEARCH);
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.cardOuter}>
      <div className={styles.tabs} role="tablist" aria-label="Loại dịch vụ thuê xe">
        {SERVICE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={service === tab.key}
            className={cx(styles.tab, service === tab.key && styles.tabActive)}
            onClick={() => setService(tab.key)}
          >
            <span className={styles.tabIcon}>{SERVICE_TAB_ICON[tab.key]}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className={cx(styles.card, longTerm && styles.cardLongTerm)}>
        <div className={styles.cell}>
          <span className={styles.cellLabel}>Loại xe</span>
          <div className={styles.box}>
            <CarOutlined className={styles.boxIcon} />
            <Select
              variant="borderless"
              value={vehicleType}
              onChange={setVehicleType}
              options={vehicleTypeOptions}
              className={styles.select}
              popupMatchSelectWidth={false}
              aria-label="Loại xe"
            />
          </div>
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
              className={styles.select}
              popupMatchSelectWidth={false}
              aria-label="Địa điểm nhận xe"
            />
          </div>
        </div>

        {longTerm ? null : (
          <div className={styles.cell}>
            <span className={styles.cellLabel}>Thời gian thuê</span>
            {/* Toàn bộ control, gồm icon và khoảng đệm sát viền, là một nút mở cùng hộp lịch. */}
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

        <Button
          type="primary"
          size="large"
          icon={<SearchOutlined />}
          className={styles.submit}
          onClick={submit}
        >
          Tìm xe
        </Button>

        {longTerm ? (
          <p className={styles.hint}>
            Thuê xe theo tháng — thời điểm nhận xe và giá chốt thoả thuận trực tiếp với gian hàng
            sau khi bạn gửi yêu cầu.
          </p>
        ) : null}
      </div>
    </div>
  );
}
