'use client';

import { CalendarOutlined, DownOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Radio } from 'antd';
import {
  ROUTE_TYPE_DESCRIPTION,
  ROUTE_TYPE_LABEL,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_LABEL,
  VEHICLE_TYPE_LABEL,
  type RouteType,
} from '@xeprime/types';
import { useCallback, useMemo, useRef } from 'react';
import { RentalDateTimeRangeField } from '@/components/form/RentalDateTimeRangeField';
import { useIsMobile } from '@/hooks/use-media-query';
import { cx } from '@/lib/cx';
import { LocationPicker } from './LocationPicker';
import { SearchPopover } from './SearchPopover';
import { SegmentedTabs } from './SegmentedTabs';
import { useSearchExperience } from './search-context';
import { serviceUsesRentalRange } from './search-draft';
import { VEHICLE_ITEMS, serviceItems } from './search-items';
import { useEnterExit } from './use-element-visibility';
import styles from './StickySearchBar.module.css';

/** Khớp thời lượng transition trong `StickySearchBar.module.css` — vào/ra dùng chung một giá trị. */
const TRANSITION_MS = 200;

/**
 * Thanh tìm kiếm THU GỌN — hiện ngay dưới header khi thẻ tìm kiếm đã trôi khỏi màn hình.
 *
 * Không phải là thẻ hero bị `position: sticky`: đó sẽ là một khối cao 200px đè lên nội dung suốt
 * cả trang. Đây là một trình bày KHÁC của cùng một trạng thái (xem `search-context.tsx`).
 *
 * **Hai tầng trên được KẾ THỪA, không hỏi lại.** Người đã cuộn qua thẻ tìm kiếm là người đã chọn
 * xong loại xe và dịch vụ; thứ họ còn đổi khi đang đọc danh sách là ĐỊA ĐIỂM và NGÀY GIỜ. Ngữ
 * cảnh kế thừa vẫn hiện ở viên đầu tiên (và vẫn bấm được để đổi) nhưng thu về một viên nhỏ, để
 * thanh này là một dải gọn ở GIỮA thay vì một thanh công cụ tràn hết bề ngang.
 *
 * Mỗi ô mở panel neo vào CHÍNH nó, và panel render bên trong thanh (`getPopupContainer`) — thanh
 * `position: fixed` mà thả panel ra `<body>` thì nó đứng theo toạ độ tài liệu, cuộn một cái là
 * panel trôi khỏi ô.
 *
 * `position: fixed` ⇒ không đẩy layout, không gây layout shift lúc hiện/ẩn. Tầng z nằm DƯỚI
 * header đúng một bậc: header vẫn là lớp trên cùng, thanh này không bao giờ đè lên nó.
 */
export function StickySearchBar({ active }: { active: boolean }) {
  const { mounted, entered } = useEnterExit(active, TRANSITION_MS);
  const { draft, setRentalRange, setRentalMode, submit } = useSearchExperience();
  const isMobile = useIsMobile();
  /** Panel neo TRONG thanh cố định — xem docblock. */
  const barRef = useRef<HTMLDivElement>(null);
  const popupContainer = useCallback(() => barRef.current ?? document.body, []);

  if (!mounted) return null;

  const withDriver = draft.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const usesRange = serviceUsesRentalRange(draft.serviceType);

  return (
    // Đang chạy hoạt cảnh RỜI thì phần tử vẫn còn trong DOM nhưng phải ngoài luồng Tab: một
    // thanh đang mờ dần mà bàn phím vẫn dừng vào là bẫy focus vô hình.
    <div
      ref={barRef}
      role="search"
      aria-label="Tìm kiếm nhanh"
      className={cx(styles.bar, entered && styles.barIn)}
      inert={!entered ? true : undefined}
    >
      <div className={styles.inner}>
        {/* Ngữ cảnh kế thừa. Mobile bỏ hẳn để còn đúng MỘT hàng địa điểm + ngày giờ + nút. */}
        {isMobile ? null : (
          <>
            <ModePicker popupContainer={popupContainer} />
            {withDriver ? <RoutePicker popupContainer={popupContainer} /> : null}
            <span className={styles.divider} aria-hidden="true" />
          </>
        )}

        <LocationPicker
          variant="chip"
          className={styles.location}
          popupContainer={popupContainer}
        />

        {usesRange ? (
          <RentalDateTimeRangeField
            value={draft.rental}
            onChange={setRentalRange}
            mode={draft.rental.mode}
            onModeChange={setRentalMode}
            prefix={<CalendarOutlined className={styles.chipIcon} aria-hidden="true" />}
            className={styles.dateChip}
            // Thanh gọn: `19/08 10:00 → 27/08 10:00`, bỏ thứ trong tuần cho vừa một dòng.
            compactPoint
            getPopupContainer={popupContainer}
          />
        ) : null}

        {/* Mobile: nút thu về đúng biểu tượng — nhãn chữ ăn mất chỗ của hai ô kia. */}
        <Button
          type="primary"
          icon={<SearchOutlined aria-hidden="true" />}
          className={styles.submit}
          aria-label="Tìm xe"
          onClick={submit}
        >
          {isMobile ? null : 'Tìm xe'}
        </Button>
      </div>
    </div>
  );
}

/** Viên "Ô tô · Tự lái" — mở đúng hai tầng chọn của thẻ tìm kiếm, không phải một menu dẹt khác. */
function ModePicker({ popupContainer }: { popupContainer: () => HTMLElement }) {
  const { draft, setVehicleType, setServiceType } = useSearchExperience();
  const summary = `${VEHICLE_TYPE_LABEL[draft.vehicleType]} · ${SERVICE_TYPE_LABEL[draft.serviceType]}`;
  const serviceOptions = useMemo(() => serviceItems(draft.vehicleType, false), [draft.vehicleType]);

  return (
    <SearchPopover
      title="Loại xe và dịch vụ"
      panelSize="sm"
      popupContainer={popupContainer}
      triggerLabel={`Loại xe và dịch vụ: ${summary}`}
      triggerClassName={cx(styles.chip, styles.modeChip)}
      trigger={
        <>
          <span className={styles.chipValue}>{summary}</span>
          <DownOutlined className={styles.caret} aria-hidden="true" />
        </>
      }
    >
      {() => (
        <div className={styles.panelStack}>
          <SegmentedTabs
            value={draft.vehicleType}
            onChange={setVehicleType}
            items={VEHICLE_ITEMS}
            ariaLabel="Loại xe"
            size="sm"
          />
          <SegmentedTabs
            value={draft.serviceType}
            onChange={setServiceType}
            items={serviceOptions}
            ariaLabel="Loại dịch vụ thuê xe"
            size="sm"
          />
        </div>
      )}
    </SearchPopover>
  );
}

/** Lộ trình — chỉ tồn tại ở dịch vụ CÓ TÀI XẾ, đúng như ở thẻ tìm kiếm. */
function RoutePicker({ popupContainer }: { popupContainer: () => HTMLElement }) {
  const { draft, setRouteType } = useSearchExperience();

  return (
    <SearchPopover
      title="Lộ trình"
      panelSize="sm"
      popupContainer={popupContainer}
      triggerLabel={`Lộ trình: ${ROUTE_TYPE_LABEL[draft.routeType]}`}
      triggerClassName={styles.chip}
      trigger={
        <>
          <span className={styles.chipValue}>{ROUTE_TYPE_LABEL[draft.routeType]}</span>
          <DownOutlined className={styles.caret} aria-hidden="true" />
        </>
      }
    >
      {(close) => (
        <div className={styles.panelStack}>
          <Radio.Group
            value={draft.routeType}
            onChange={(e) => {
              setRouteType(e.target.value as RouteType);
              close();
            }}
            options={ROUTE_TYPE_VALUES.map((value) => ({ value, label: ROUTE_TYPE_LABEL[value] }))}
            className={styles.routeGroup}
          />
          <p className={styles.routeHint}>{ROUTE_TYPE_DESCRIPTION[draft.routeType]}</p>
        </div>
      )}
    </SearchPopover>
  );
}
