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
import { Button, Radio, Segmented, Select } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import {
  LONG_TERM_MIN_DAYS,
  ROUTE_TYPE,
  ROUTE_TYPE_DESCRIPTION,
  ROUTE_TYPE_LABEL,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  VEHICLE_TYPE,
  VEHICLE_TYPE_LABEL,
  VEHICLE_TYPE_VALUES,
  isRouteType,
  type RouteType,
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

/** Số ngày tính tiền — trùng công thức backend, để chỉnh khoảng dài hạn không lệch sàn. */
function chargedDays(range: RentalRange): number {
  if (!range.pickupAt || !range.returnAt) return 0;
  return Math.max(1, Math.ceil(range.returnAt.diff(range.pickupAt, 'minute') / 1440));
}

/**
 * Thẻ tìm kiếm của trang chủ (mô hình 3 dịch vụ — plan 17/08): hàng TAB Xe tự lái · Xe có tài
 * xế · Thuê xe dài hạn đè trên thẻ trắng; trong thẻ là các ô CÓ CẤU TRÚC — Loại xe · Địa điểm ·
 * Thời gian thuê · nút Tìm xe. Không có ô từ khoá: mọi ý định tìm đều có bộ lọc cấu trúc.
 *
 * Khác nhau giữa tab (địa điểm/thời gian đã chọn GIỮ NGUYÊN khi đổi tab):
 *   - Có tài xế: thêm hàng LỘ TRÌNH (nội thành / liên tỉnh / 1 chiều) — là NGỮ CẢNH mang sang
 *     yêu cầu thuê để shop báo giá đúng, không phải chiều lọc danh sách xe.
 *   - Dài hạn: khách chọn NGÀY CỤ THỂ, sàn `LONG_TERM_MIN_DAYS` ngày (control tự khoá ngày
 *     dưới sàn, đổi tab tự nới khoảng); không có chế độ thuê giờ.
 *
 * "Tìm xe" điều hướng sang `/search` với filter serialize bằng đúng `applyFilterPatch` —
 * `serviceType`/`routeType` trên URL cũng là thứ trang kết quả và luồng đặt xe đọc lại.
 *
 * Mobile: Segmented 3 dịch vụ + hàng ngữ cảnh (mở sheet chỉnh đủ trường) + nút Tìm xe.
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
  const [routeType, setRouteType] = useState<RouteType>(() =>
    isRouteType(filters.routeType) ? filters.routeType : ROUTE_TYPE.IN_CITY,
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
  const withDriver = service === SERVICE_TYPE.WITH_DRIVER;

  /** Đổi tab: sang dài hạn thì tự NỚI khoảng lên sàn — không đưa người dùng vào trạng thái lỗi. */
  function selectService(key: ServiceType) {
    setService(key);
    if (key === SERVICE_TYPE.LONG_TERM && range.pickupAt && chargedDays(range) < LONG_TERM_MIN_DAYS) {
      setRange({ pickupAt: range.pickupAt, returnAt: range.pickupAt.add(LONG_TERM_MIN_DAYS, 'day') });
    }
  }

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
      // Lộ trình chỉ có nghĩa với có tài xế — dịch vụ khác thì xoá khỏi URL.
      routeType: withDriver ? routeType : undefined,
      vehicleType,
      provinceCode: province || undefined,
      pickupAt: range.pickupAt?.toISOString(),
      returnAt: range.returnAt?.toISOString(),
      hourly: !longTerm && mode === 'hourly' ? true : undefined,
    });
    setSheetOpen(false);
    const qs = params.toString();
    router.push(qs ? `${ROUTES.SEARCH}?${qs}` : ROUTES.SEARCH);
  }

  if (isMobile) {
    const summary = [
      VEHICLE_TYPE_LABEL[vehicleType as VehicleType] ?? 'Xe',
      withDriver ? ROUTE_TYPE_LABEL[routeType] : null,
      // Tóm tắt hiện TÊN tỉnh, không hiện mã — mã là chuyện của URL.
      provinceLabelOf(destinations, province) ?? 'Toàn quốc',
      range.pickupAt && range.returnAt
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
              onChange={(v) => selectService(v as ServiceType)}
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

        {/* Sheet dùng CHUNG với /search — nhận serviceType/routeType đang chọn để hiện đúng
            trường (dài hạn: sàn ngày; có tài xế: radio lộ trình). */}
        {sheetOpen ? (
          <SearchDialog
            open
            initial={{ ...filters, serviceType: service, routeType }}
            onClose={() => setSheetOpen(false)}
            onSubmit={(values) => {
              setSheetOpen(false);
              if (isRouteType(values.routeType)) setRouteType(values.routeType);
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
            onClick={() => selectService(tab.key)}
          >
            <span className={styles.tabIcon}>{SERVICE_TAB_ICON[tab.key]}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.card}>
        {withDriver ? (
          <div className={styles.routeRow}>
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

        <div className={styles.cell}>
          <span className={styles.cellLabel}>
            {longTerm ? `Thời gian thuê (tối thiểu ${LONG_TERM_MIN_DAYS} ngày)` : 'Thời gian thuê'}
          </span>
          {/* Toàn bộ control, gồm icon và khoảng đệm sát viền, là một nút mở cùng hộp lịch. */}
          <RentalDateTimeRangeField
            value={range}
            onChange={setRange}
            mode={longTerm ? 'daily' : mode}
            onModeChange={setMode}
            minDays={longTerm ? LONG_TERM_MIN_DAYS : undefined}
            prefix={<CalendarOutlined className={styles.boxIcon} />}
            className={styles.box}
          />
        </div>

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
            Thuê liên tục từ {LONG_TERM_MIN_DAYS} ngày — giá tham chiếu theo tháng, gian hàng xác
            nhận giá chốt khi duyệt yêu cầu.
          </p>
        ) : null}
      </div>
    </div>
  );
}
