'use client';

import {
  CalendarOutlined,
  EditOutlined,
  EnvironmentOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Button, Input, Select } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { VEHICLE_TYPE, VEHICLE_TYPE_LABEL, type VehicleType } from '@xeprime/types';
import { useMemo, useState } from 'react';
import {
  RentalDateTimeRangeField,
  type RentalMode,
  type RentalRange,
} from '@/components/form/RentalDateTimeRangeField';
import { ROUTES } from '@/constants/routes';
import { useIsMobile } from '@/hooks/use-media-query';
import { applyFilterPatch } from '../filter-params';
import { buildProvinceOptions, provinceLabelOf } from '../province-options';
import { useDestinations } from '../hooks/use-destinations';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import { SearchDialog } from './SearchDialog';
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
  // Giá trị state là MÃ tỉnh — cùng thứ đi vào URL và gửi cho API.
  const [province, setProvince] = useState(filters.provinceCode ?? '');
  // Desktop không có nút đổi loại xe (hero đúng 4 ô); loại đổi ở sheet mobile/trang /search.
  const vehicleType = filters.vehicleType ?? VEHICLE_TYPE.CAR;
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

  const provinceOptions = useMemo(
    () => buildProvinceOptions(destinations, province),
    [destinations, province],
  );

  function submit() {
    const params = new URLSearchParams();
    applyFilterPatch(params, {
      vehicleType,
      q: keyword.trim() || undefined,
      provinceCode: province || undefined,
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
    </>
  );

  if (isMobile) {
    const summary = [
      VEHICLE_TYPE_LABEL[vehicleType as VehicleType] ?? 'Xe',
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
        {/*
         * Mobile hai tầng: TỪ KHOÁ là ô nhập thật ngay trên trang (Enter → /search), tầng dưới
         * là ngữ cảnh thuê — bấm bất kỳ đâu trong tầng đó đều mở sheet (không còn nấp trong sheet).
         */}
        <div className={styles.mobileBox}>
          <div className={styles.mobileKeywordRow}>
            <SearchOutlined className={styles.mobileIcon} />
            <Input
              variant="borderless"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={submit}
              placeholder="Tìm theo tên xe, hãng xe…"
              className={styles.mobileKeywordInput}
              aria-label="Từ khoá tìm kiếm"
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
        </div>

        {/* Sheet dùng CHUNG với /search — chỉ ngữ cảnh thuê; từ khoá lấy từ ô đang gõ ở trên. */}
        {sheetOpen ? (
          <SearchDialog
            open
            initial={filters}
            onClose={() => setSheetOpen(false)}
            onSubmit={(values) => {
              setSheetOpen(false);
              const params = new URLSearchParams();
              applyFilterPatch(params, { ...values, q: keyword.trim() || undefined });
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
