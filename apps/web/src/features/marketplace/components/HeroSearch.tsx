'use client';

import { CalendarOutlined, EnvironmentOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Input, Segmented, Select } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { VEHICLE_TYPE, VEHICLE_TYPE_LABEL, type VehicleType } from '@xeprime/types';
import { useMemo, useState } from 'react';
import {
  RentalDateTimeRangeField,
  type RentalMode,
  type RentalRange,
} from '@/components/form/RentalDateTimeRangeField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { ROUTES } from '@/constants/routes';
import { useIsMobile } from '@/hooks/use-media-query';
import { applyFilterPatch } from '../filter-params';
import { useDestinations } from '../hooks/use-destinations';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import styles from './HeroSearch.module.css';

/** Số tỉnh/thành đổ vào ô "Địa điểm" — ưu tiên nơi nhiều xe nhất. */
const PROVINCE_OPTIONS_LIMIT = 24;

/**
 * Thẻ tìm kiếm của trang chủ — đúng BỐN thứ theo Figma `18:4`: Từ khoá · Địa điểm · Thời gian
 * thuê · nút Tìm xe. Bộ lọc nâng cao thuộc về `/search`, không nhồi vào đây.
 *
 * "Tìm xe" điều hướng sang `/search`, filter serialize bằng đúng bộ `applyFilterPatch` của
 * marketplace (một định dạng query duy nhất; giá trị rỗng bị loại khỏi URL).
 *
 * Mobile (Figma `23:896`/`23:1053`): thẻ thu thành MỘT thanh tóm tắt, bấm mở sheet toàn màn
 * chứa đủ trường (thêm toggle Loại xe theo đúng frame mobile-search-expanded).
 */
export function HeroSearch() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { filters } = useMarketplaceFilters();
  const { data: destinations, isLoading: loadingProvinces } =
    useDestinations(PROVINCE_OPTIONS_LIMIT);

  const [keyword, setKeyword] = useState(filters.q ?? '');
  const [province, setProvince] = useState(filters.province ?? '');
  const [vehicleType, setVehicleType] = useState<string>(filters.vehicleType ?? VEHICLE_TYPE.CAR);
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

  const provinceOptions = useMemo(() => {
    const fromApi = (destinations ?? []).map((d) => ({
      value: d.provinceName,
      label: d.provinceName,
    }));
    const current =
      province && !fromApi.some((o) => o.value === province)
        ? [{ value: province, label: province }]
        : [];
    return [{ value: '', label: 'Toàn quốc' }, ...current, ...fromApi];
  }, [destinations, province]);

  function submit() {
    const params = new URLSearchParams();
    applyFilterPatch(params, {
      vehicleType,
      q: keyword.trim() || undefined,
      province: province || undefined,
      pickupAt: range.pickupAt?.toISOString(),
      returnAt: range.returnAt?.toISOString(),
      hourly: mode === 'hourly' ? true : undefined,
    });
    setSheetOpen(false);
    const qs = params.toString();
    router.push(qs ? `${ROUTES.SEARCH}?${qs}` : ROUTES.SEARCH);
  }

  const fields = (
    <>
      <div className={styles.cell}>
        <span className={styles.cellLabel}>Từ khoá tìm kiếm</span>
        <div className={styles.box}>
          <SearchOutlined className={styles.boxIcon} />
          <Input
            variant="borderless"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={submit}
            placeholder="Toyota Vios, xe 7 chỗ…"
            className={styles.keyword}
            aria-label="Từ khoá tìm kiếm"
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
        <span className={styles.cellLabel}>Thời gian thuê</span>
        <div className={styles.box}>
          <CalendarOutlined className={styles.boxIcon} />
          {/* MỘT giá trị khoảng, hai đầu Nhận/Trả vẫn bấm sửa riêng — xem RentalDateTimeRangeField. */}
          <RentalDateTimeRangeField
            value={range}
            onChange={setRange}
            mode={mode}
            onModeChange={setMode}
            className={styles.range}
          />
        </div>
      </div>
    </>
  );

  if (isMobile) {
    const summary = [
      VEHICLE_TYPE_LABEL[vehicleType as VehicleType] ?? 'Xe',
      province || 'Toàn quốc',
      range.pickupAt && range.returnAt
        ? `${range.pickupAt.format('DD/MM')}–${range.returnAt.format('DD/MM')}`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <div className={styles.cardOuter}>
        <button type="button" className={styles.mobilePill} onClick={() => setSheetOpen(true)}>
          <SearchOutlined /> <span className={styles.mobilePillText}>{summary}</span>
        </button>

        <ResponsiveDialog
          title="Tìm kiếm"
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          footer={null}
        >
          <div className={styles.sheetBody}>
            {/* Frame mobile-search-expanded có thêm toggle Loại xe — desktop thì không. */}
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
            {fields}
            <Button type="primary" size="large" block icon={<SearchOutlined />} onClick={submit}>
              Tìm xe
            </Button>
          </div>
        </ResponsiveDialog>
      </div>
    );
  }

  return (
    <div className={styles.cardOuter}>
      <div className={styles.card}>
        {fields}
        <Button
          type="primary"
          size="large"
          icon={<SearchOutlined />}
          className={styles.submit}
          onClick={submit}
        >
          Tìm xe
        </Button>
      </div>
    </div>
  );
}
