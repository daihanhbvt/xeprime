'use client';

import { CalendarOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Radio } from 'antd';
import { useId, useMemo } from 'react';
import {
  ROUTE_TYPE_DESCRIPTION,
  ROUTE_TYPE_LABEL,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_LABEL,
  VEHICLE_TYPE_LABEL,
  type RouteType,
} from '@xeprime/types';
import { RentalDateTimeRangeField } from '@/components/form/RentalDateTimeRangeField';
import { cx } from '@/lib/cx';
import { LocationPicker } from './LocationPicker';
import { SegmentedTabs } from './SegmentedTabs';
import { useSearchExperience } from './search-context';
import { serviceUsesRentalRange } from './search-draft';
import { VEHICLE_ITEMS, serviceItems } from './search-items';
import styles from './SearchCard.module.css';

/**
 * Thẻ tìm kiếm của trang chủ — hai tầng lựa chọn, rồi mới tới tiêu chí:
 *
 *   Ô tô | Xe máy
 *   Xe tự lái | Xe có tài xế | Thuê xe dài hạn
 *   ‹form của riêng dịch vụ đang chọn›
 *
 * Loại xe và dịch vụ là hai chiều ĐỘC LẬP (một trạng thái mỗi chiều), nên chúng không nằm chung
 * hàng với Địa điểm/Thời gian: nhét chúng vào hàng ô nhập là ngụ ý "loại xe cũng chỉ là một
 * tiêu chí lọc như mọi tiêu chí khác", trong khi nó quyết định cả tập xe đang xét.
 *
 * Form theo từng dịch vụ, KHÔNG phải một form gộp mọi trường rồi ẩn bớt:
 *   - **Tự lái**: Địa điểm · Thời gian thuê · Tìm xe.
 *   - **Có tài xế**: thêm hàng LỘ TRÌNH — ngữ cảnh để gian hàng báo giá đúng khi duyệt, không
 *     phải chiều lọc danh sách xe (xe không khai lộ trình phục vụ).
 *   - **Dài hạn**: Địa điểm · Tìm xe. **Không** hỏi ngày (ADR 0011) — khách chọn gói
 *     1/2/3/6/9/12 tháng và nêu nguyện vọng ngày nhận SAU khi đã chọn được xe.
 *
 * Bố cục desktop/mobile khác nhau hoàn toàn bằng CSS (cùng một cây DOM): không nhánh `isMobile`
 * ở đây, nên hai bố cục không thể trôi ra hai bộ hành vi khác nhau.
 */
export function SearchCard({
  observerRef,
}: {
  observerRef: (node: HTMLDivElement | null) => void;
}) {
  const {
    draft,
    setVehicleType,
    setServiceType,
    setRouteType,
    setRentalRange,
    setRentalMode,
    submit,
  } = useSearchExperience();
  const formId = useId();
  const serviceOptions = useMemo(() => serviceItems(draft.vehicleType, true), [draft.vehicleType]);

  const withDriver = draft.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const longTerm = draft.serviceType === SERVICE_TYPE.LONG_TERM;
  const usesRange = serviceUsesRentalRange(draft.serviceType);

  return (
    <div className={styles.cardOuter} ref={observerRef}>
      <div role="search" aria-label="Tìm xe cho thuê" className={styles.card}>
        {/*
          Ba TẦNG xếp chồng, mỗi tầng rộng hơn tầng trên và cùng canh giữa — hình bậc thang này
          chính là thứ nói ra thứ tự quyết định: chọn loại xe → chọn dịch vụ → mới tới tiêu chí.
          Tầng trên đè lên tầng dưới vài pixel nên ba khối trắng đọc như MỘT thẻ liền mạch.
        */}
        <div className={cx(styles.tier, styles.tierVehicle)}>
          <SegmentedTabs
            value={draft.vehicleType}
            onChange={setVehicleType}
            items={VEHICLE_ITEMS}
            ariaLabel="Loại xe"
            controls={formId}
            tone="plain"
          />
        </div>

        <div className={cx(styles.tier, styles.tierService)}>
          <SegmentedTabs
            value={draft.serviceType}
            onChange={setServiceType}
            items={serviceOptions}
            ariaLabel="Loại dịch vụ thuê xe"
            controls={formId}
            tone="sand"
          />
        </div>

        {/*
          `key` theo dịch vụ: đổi dịch vụ là đổi form, nên khối được dựng lại và chạy lại hoạt
          cảnh vào. Không animate CHIỀU CAO — mỗi form cao đúng nội dung của nó, và animate
          height là nguồn giật khung hình kinh điển.
        */}
        <div
          key={draft.serviceType}
          id={formId}
          role="tabpanel"
          aria-label={`Tìm ${VEHICLE_TYPE_LABEL[draft.vehicleType].toLowerCase()} ${SERVICE_TYPE_LABEL[draft.serviceType].toLowerCase()}`}
          className={cx(styles.tier, styles.tierFields)}
        >
          {withDriver ? (
            <div className={styles.routeRow}>
              <span className={styles.cellLabel}>Lộ trình</span>
              <Radio.Group
                value={draft.routeType}
                onChange={(e) => setRouteType(e.target.value as RouteType)}
                options={ROUTE_TYPE_VALUES.map((value) => ({
                  value,
                  label: ROUTE_TYPE_LABEL[value],
                }))}
              />
              <span className={styles.routeHint}>{ROUTE_TYPE_DESCRIPTION[draft.routeType]}</span>
            </div>
          ) : null}

          <div className={cx(styles.fields, longTerm && styles.fieldsCompact)}>
            <div className={styles.cell}>
              <span className={styles.cellLabel}>Địa điểm</span>
              <LocationPicker />
            </div>

            {usesRange ? (
              <div className={styles.cell}>
                <span className={styles.cellLabel}>Thời gian thuê</span>
                <RentalDateTimeRangeField
                  value={draft.rental}
                  onChange={setRentalRange}
                  mode={draft.rental.mode}
                  onModeChange={setRentalMode}
                  prefix={<CalendarOutlined className={styles.boxIcon} aria-hidden="true" />}
                  className={styles.box}
                />
              </div>
            ) : null}

            <Button
              type="primary"
              size="large"
              icon={<SearchOutlined aria-hidden="true" />}
              className={styles.submit}
              onClick={submit}
            >
              Tìm xe
            </Button>
          </div>

          {longTerm ? (
            <p className={styles.hint}>
              Chọn xe trước, sau đó chọn gói thuê và nguyện vọng ngày nhận. Gian hàng xác nhận ngày
              giờ nhận chính xác khi duyệt yêu cầu.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
