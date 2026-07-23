'use client';

import { Button, Input, Segmented, Space } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { PERMISSION, VEHICLE_TYPE, VEHICLE_TYPE_LABEL } from '@xeprime/types';
import { usePermissions } from '@/hooks/use-permissions';
import { useCalendarFilters } from '../hooks/use-calendar-filters';
import { todayIsoDate } from '../utils/calendar-date.util';
import styles from './CalendarToolbar.module.css';

const ALL = 'all';

export function CalendarToolbar() {
  const { filters, setFilters } = useCalendarFilters();
  const { has } = usePermissions();

  return (
    <div className={styles.toolbar}>
      <Space wrap size="small">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Tìm xe hoặc biển số"
          defaultValue={filters.q ?? ''}
          onChange={(e) => setFilters({ q: e.target.value || null })}
          className={styles.search}
        />

        <Segmented
          value={filters.vehicleType ?? ALL}
          onChange={(value) => setFilters({ vehicleType: value === ALL ? null : String(value) })}
          options={[
            { label: 'Tất cả xe', value: ALL },
            { label: VEHICLE_TYPE_LABEL[VEHICLE_TYPE.CAR], value: VEHICLE_TYPE.CAR },
            { label: VEHICLE_TYPE_LABEL[VEHICLE_TYPE.MOTORBIKE], value: VEHICLE_TYPE.MOTORBIKE },
          ]}
        />

        <Segmented
          value={filters.days}
          onChange={(value) => setFilters({ days: Number(value) })}
          options={[
            { label: '7 ngày', value: 7 },
            { label: '14 ngày', value: 14 },
            { label: '30 ngày', value: 30 },
          ]}
        />

        <Button onClick={() => setFilters({ from: todayIsoDate() })}>Hôm nay</Button>
      </Space>

      {/* Ẩn nút khi thiếu quyền chỉ là chuyện hiển thị — backend vẫn phải chặn (CLAUDE.md mục 3). */}
      {has(PERMISSION.BOOKING_CREATE) ? (
        <Button type="primary" icon={<PlusOutlined />} disabled title="Sẽ mở ở Phase 4">
          Tạo đơn
        </Button>
      ) : null}
    </div>
  );
}
