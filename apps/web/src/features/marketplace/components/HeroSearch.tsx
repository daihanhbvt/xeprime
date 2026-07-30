'use client';

import {
  CarOutlined,
  EnvironmentOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Button, DatePicker, Select } from 'antd';
import dayjs from 'dayjs';
import { VEHICLE_TYPE } from '@xeprime/types';
import { useMemo, useState } from 'react';
import { cx } from '@/lib/cx';
import { useDestinations } from '../hooks/use-destinations';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import styles from './HeroSearch.module.css';

/** Số tỉnh/thành đổ vào ô "Địa điểm" — ưu tiên nơi nhiều xe nhất. */
const PROVINCE_OPTIONS_LIMIT = 24;

/**
 * Hero + thẻ tìm kiếm.
 *
 * "Tìm xe khả dụng" đẩy loại xe + tỉnh + khoảng ngày vào URL searchParams (ADR 0004); backend lọc
 * theo tỉnh (`provinceName`) và xe rảnh trong khoảng ngày (`vehicle_occupancies`, ADR 0006).
 * Danh sách tỉnh lấy từ `/public/destinations` — chỉ nơi THỰC SỰ có xe, không hardcode ở FE.
 */
export function HeroSearch() {
  const { filters, setFilters } = useMarketplaceFilters();
  const vehicleType = filters.vehicleType ?? VEHICLE_TYPE.CAR;
  const { data: destinations, isLoading: loadingProvinces } =
    useDestinations(PROVINCE_OPTIONS_LIMIT);

  const [province, setProvince] = useState(filters.province ?? '');
  const [pickup, setPickup] = useState(() =>
    filters.pickupAt ? dayjs(filters.pickupAt) : dayjs().add(1, 'day'),
  );
  const [dropoff, setDropoff] = useState(() =>
    filters.returnAt ? dayjs(filters.returnAt) : dayjs().add(4, 'day'),
  );

  const provinceOptions = useMemo(() => {
    const fromApi = (destinations ?? []).map((d) => ({
      value: d.provinceName,
      label: d.provinceName,
    }));
    // Giữ tỉnh đang lọc dù không nằm trong top — link chia sẻ vẫn hiển thị đúng.
    const current =
      province && !fromApi.some((o) => o.value === province)
        ? [{ value: province, label: province }]
        : [];
    return [{ value: '', label: 'Toàn quốc' }, ...current, ...fromApi];
  }, [destinations, province]);

  function submit() {
    setFilters({
      vehicleType,
      province: province || undefined,
      pickupAt: pickup.toISOString(),
      returnAt: dropoff.toISOString(),
    });
    document.getElementById('recommendations')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <>
      <section className={styles.hero}>
        <span className={styles.glow} aria-hidden="true" />
        <div className={styles.inner}>
          <p className={styles.eyebrow}>Nâng tầm giá trị mỗi hành trình</p>
          <h1 className={styles.title}>
            Cầm lái chiếc xe <em className={styles.accent}>vừa ý</em>,<br />
            bất cứ đâu trên đất Việt.
          </h1>

          <div className={styles.tabs} role="tablist" aria-label="Loại xe">
            <button
              type="button"
              role="tab"
              aria-selected={vehicleType === VEHICLE_TYPE.CAR}
              className={cx(styles.tab, vehicleType === VEHICLE_TYPE.CAR && styles.tabActive)}
              onClick={() => setFilters({ vehicleType: VEHICLE_TYPE.CAR })}
            >
              <CarOutlined /> Ô tô tự lái
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={vehicleType === VEHICLE_TYPE.MOTORBIKE}
              className={cx(styles.tab, vehicleType === VEHICLE_TYPE.MOTORBIKE && styles.tabActive)}
              onClick={() => setFilters({ vehicleType: VEHICLE_TYPE.MOTORBIKE })}
            >
              <ThunderboltOutlined /> Xe máy
            </button>
          </div>
        </div>
      </section>

      {/*
       * Thẻ tìm kiếm là SIBLING của hero (không lồng bên trong) — kéo lên bằng margin-top âm
       * (`.cardOuter`). Cách này không đụng `overflow` của hero nên không bị cắt, và khoảng cách
       * xuống "Xe cho thuê gợi ý" phía dưới chỉ phụ thuộc padding-top của khối kế tiếp, độc lập
       * hoàn toàn với độ tràn vào hero — không còn hai con số phải khớp tay như bản cũ.
       */}
      <div className={styles.cardOuter}>
        <div className={styles.card}>
          <label className={styles.field}>
            <span className={styles.fieldIcon}>
              <EnvironmentOutlined />
            </span>
            <span className={styles.fieldBody}>
              <span className={styles.fieldLabel}>Địa điểm</span>
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
            </span>
          </label>

          <div className={styles.dates}>
            <label className={styles.field}>
              <span className={styles.fieldIcon}>
                <span className={styles.dot} aria-hidden="true" />
              </span>
              <span className={styles.fieldBody}>
                <span className={styles.fieldLabel}>Nhận xe</span>
                <DatePicker
                  variant="borderless"
                  value={pickup}
                  onChange={(d) => {
                    if (!d) return;
                    setPickup(d);
                    // Giữ khoảng hợp lệ: trả xe luôn phải sau nhận xe.
                    if (!dropoff.isAfter(d)) setDropoff(d.add(1, 'day'));
                  }}
                  format="DD/MM/YYYY"
                  allowClear={false}
                  minDate={dayjs()}
                  className={styles.date}
                  inputReadOnly
                />
              </span>
            </label>
            <span className={styles.dateSep} aria-hidden="true" />
            <label className={styles.field}>
              <span className={styles.fieldIcon}>
                <span className={styles.dot} aria-hidden="true" />
              </span>
              <span className={styles.fieldBody}>
                <span className={styles.fieldLabel}>Trả xe</span>
                <DatePicker
                  variant="borderless"
                  value={dropoff}
                  onChange={(d) => d && setDropoff(d)}
                  format="DD/MM/YYYY"
                  allowClear={false}
                  minDate={pickup.add(1, 'day')}
                  className={styles.date}
                  inputReadOnly
                />
              </span>
            </label>
          </div>

          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            className={styles.submit}
            onClick={submit}
          >
            Tìm xe khả dụng
          </Button>
        </div>
      </div>
    </>
  );
}
