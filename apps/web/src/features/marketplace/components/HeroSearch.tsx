'use client';

import { CarOutlined, EnvironmentOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, DatePicker, Select } from 'antd';
import dayjs from 'dayjs';
import { VEHICLE_TYPE } from '@xeprime/types';
import { useState } from 'react';
import { cx } from '@/lib/cx';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import styles from './HeroSearch.module.css';

// Value = `provinceName` khớp `TenantProfile.provinceName` (backend lọc contains-insensitive).
const PROVINCES = [
  { value: '', label: 'Toàn quốc' },
  { value: 'Hà Nội', label: 'Hà Nội' },
  { value: 'TP. Hồ Chí Minh', label: 'TP. Hồ Chí Minh' },
  { value: 'Đà Nẵng', label: 'Đà Nẵng' },
  { value: 'Huế', label: 'Huế' },
  { value: 'Đà Lạt', label: 'Đà Lạt' },
  { value: 'Nha Trang', label: 'Nha Trang' },
];

/**
 * Hero + thẻ tìm kiếm — bám xeprime.vn.
 *
 * "Tìm xe khả dụng" đẩy loại xe + tỉnh + khoảng ngày vào URL searchParams (ADR 0004); backend lọc
 * theo tỉnh (`provinceName`) và loại xe rảnh trong khoảng ngày (`vehicle_occupancies`, ADR 0006).
 */
export function HeroSearch() {
  const { filters, setFilters } = useMarketplaceFilters();
  const vehicleType = filters.vehicleType ?? VEHICLE_TYPE.CAR;

  const [province, setProvince] = useState(filters.province ?? '');
  const [pickup, setPickup] = useState(() =>
    filters.pickupAt ? dayjs(filters.pickupAt) : dayjs().add(1, 'day'),
  );
  const [dropoff, setDropoff] = useState(() =>
    filters.returnAt ? dayjs(filters.returnAt) : dayjs().add(4, 'day'),
  );

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
    <section className={styles.hero}>
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
                options={PROVINCES}
                className={styles.select}
                popupMatchSelectWidth={false}
              />
            </span>
          </label>

          <div className={styles.dates}>
            <label className={styles.field}>
              <span className={styles.fieldBody}>
                <span className={styles.fieldLabel}>Nhận xe</span>
                <DatePicker
                  variant="borderless"
                  value={pickup}
                  onChange={(d) => d && setPickup(d)}
                  format="DD/MM/YYYY"
                  allowClear={false}
                  className={styles.date}
                  inputReadOnly
                />
              </span>
            </label>
            <span className={styles.dateSep} aria-hidden="true" />
            <label className={styles.field}>
              <span className={styles.fieldBody}>
                <span className={styles.fieldLabel}>Trả xe</span>
                <DatePicker
                  variant="borderless"
                  value={dropoff}
                  onChange={(d) => d && setDropoff(d)}
                  format="DD/MM/YYYY"
                  allowClear={false}
                  minDate={pickup}
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
    </section>
  );
}
