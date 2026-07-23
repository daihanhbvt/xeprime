'use client';

import { CarOutlined, EnvironmentOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, DatePicker, Select } from 'antd';
import dayjs from 'dayjs';
import { VEHICLE_TYPE } from '@xeprime/types';
import { useState } from 'react';
import { cx } from '@/lib/cx';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import styles from './HeroSearch.module.css';

const PROVINCES = [
  { value: '', label: 'Toàn quốc' },
  { value: 'HN', label: 'Hà Nội' },
  { value: 'HCM', label: 'TP. Hồ Chí Minh' },
  { value: 'DN', label: 'Đà Nẵng' },
  { value: 'HUE', label: 'Huế' },
  { value: 'DL', label: 'Đà Lạt' },
  { value: 'NT', label: 'Nha Trang' },
];

/**
 * Hero + thẻ tìm kiếm — bám xeprime.vn.
 *
 * Tab loại xe đẩy vào URL (đồng bộ với chip ở phần gợi ý — ADR 0004). Địa điểm và ngày là
 * state cục bộ: backend chưa lọc theo tỉnh (vehicle chưa có `province`) và theo lịch trống
 * (Phase 4), nên chúng được thu thập cho bước sau, còn "Tìm xe khả dụng" lọc theo loại xe và
 * cuộn xuống danh sách.
 */
export function HeroSearch() {
  const { filters, setFilters } = useMarketplaceFilters();
  const vehicleType = filters.vehicleType ?? VEHICLE_TYPE.CAR;

  const [province, setProvince] = useState('');
  const [pickup, setPickup] = useState(() => dayjs().add(1, 'day'));
  const [dropoff, setDropoff] = useState(() => dayjs().add(4, 'day'));

  function submit() {
    setFilters({ vehicleType });
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
