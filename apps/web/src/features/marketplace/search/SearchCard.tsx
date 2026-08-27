'use client';

import { CalendarOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Radio } from 'antd';
import { useTranslations } from 'next-intl';
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
import { useDomainLabel } from '@/i18n/use-domain-label';
import { RentalDateTimeRangeField } from '@/components/form/RentalDateTimeRangeField';
import { cx } from '@/lib/cx';
import { LocationPicker } from './LocationPicker';
import { SegmentedTabs } from './SegmentedTabs';
import { useSearchExperience } from './search-context';
import { serviceUsesRentalRange } from './search-draft';
import { serviceItems, vehicleItems } from './search-items';
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
  const t = useTranslations('HomeSearch');
  const tService = useTranslations('HomeSearch.service');
  const domainLabel = useDomainLabel();
  const formId = useId();
  const serviceOptions = useMemo(
    () => serviceItems(draft.vehicleType, true, tService),
    [draft.vehicleType, tService],
  );
  const vehicleOptions = useMemo(() => vehicleItems(domainLabel), [domainLabel]);

  const withDriver = draft.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const longTerm = draft.serviceType === SERVICE_TYPE.LONG_TERM;
  const usesRange = serviceUsesRentalRange(draft.serviceType);

  return (
    <div className={styles.cardOuter} ref={observerRef}>
      <div role="search" aria-label={t('card.searchLabel')} className={styles.card}>
        {/*
          Ba TẦNG xếp chồng, mỗi tầng rộng hơn tầng trên và cùng canh giữa — hình bậc thang này
          chính là thứ nói ra thứ tự quyết định: chọn loại xe → chọn dịch vụ → mới tới tiêu chí.
          Tầng trên đè lên tầng dưới vài pixel nên ba khối trắng đọc như MỘT thẻ liền mạch.
        */}
        <div className={cx(styles.tier, styles.tierVehicle)}>
          <SegmentedTabs
            value={draft.vehicleType}
            onChange={setVehicleType}
            items={vehicleOptions}
            ariaLabel={t('card.vehicleTypeLabel')}
            controls={formId}
            tone="plain"
          />
        </div>

        <div className={cx(styles.tier, styles.tierService)}>
          <SegmentedTabs
            value={draft.serviceType}
            onChange={setServiceType}
            items={serviceOptions}
            ariaLabel={t('card.serviceTypeLabel')}
            controls={formId}
            tone="plain"
          />
        </div>

        {/*
          KHÔNG `key` theo dịch vụ, và KHÔNG hoạt cảnh vào ở tầng này.

          Đổi dịch vụ chỉ đổi MỘT PHẦN của form: ô địa điểm và nút "Tìm xe" là chung cho cả ba
          dịch vụ. Gắn `key` là ép React dựng lại cả khối, nên hai thứ không hề đổi cũng bị tháo
          rồi dựng lại — cộng thêm một lần fade-in nữa là ra đúng cái chớp nháy khó chịu khi bấm
          qua lại giữa các tab. Bỏ `key` thì các nút được giữ nguyên; chỉ hàng lộ trình, ô thời
          gian và dòng ghi chú xuất hiện/biến mất, và chúng đổi TỨC THÌ.
        */}
        <div
          id={formId}
          role="tabpanel"
          /*
           * Tên khả truy cập của vùng form GHÉP từ hai lựa chọn đang có. Ghép bằng ICU chứ
           * không nối chuỗi: trật tự từ của hai ngôn ngữ khác nhau, và `.toLowerCase()` trên
           * một câu tiếng Anh sẽ hạ cả danh từ riêng.
           */
          aria-label={t('card.panelLabel', {
            vehicle: domainLabel('vehicleType', draft.vehicleType, VEHICLE_TYPE_LABEL[draft.vehicleType]),
            service: domainLabel('serviceType', draft.serviceType, SERVICE_TYPE_LABEL[draft.serviceType]),
          })}
          className={cx(styles.tier, styles.tierFields)}
        >
          {withDriver ? (
            <div className={styles.routeRow}>
              <span className={styles.cellLabel}>{t('route.label')}</span>
              <Radio.Group
                value={draft.routeType}
                onChange={(e) => setRouteType(e.target.value as RouteType)}
                options={ROUTE_TYPE_VALUES.map((value) => ({
                  value,
                  label: domainLabel('routeType', value, ROUTE_TYPE_LABEL[value]),
                }))}
              />
              <span className={styles.routeHint}>
                {domainLabel(
                  'routeTypeDescription',
                  draft.routeType,
                  ROUTE_TYPE_DESCRIPTION[draft.routeType],
                )}
              </span>
            </div>
          ) : null}

          <div className={cx(styles.fields, longTerm && styles.fieldsCompact)}>
            <div className={styles.cell}>
              <span className={styles.cellLabel}>{t('location.label')}</span>
              <LocationPicker />
            </div>

            {usesRange ? (
              <div className={styles.cell}>
                <span className={styles.cellLabel}>{t('rental.label')}</span>
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
              {t('card.submit')}
            </Button>
          </div>

          {longTerm ? (
            <p className={styles.hint}>{t('card.longTermHint')}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
