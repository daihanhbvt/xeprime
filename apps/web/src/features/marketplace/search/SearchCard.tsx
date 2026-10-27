'use client';

import { Radio } from 'antd';
import Image from 'next/image';
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
import { enterClass } from '@/components/motion/motion-classes';
import { cx } from '@/lib/cx';
import { CtaButton } from '../components/CtaButton';
import { LocationPicker } from './LocationPicker';
import { SegmentedTabs } from './SegmentedTabs';
import { useSearchExperience } from './search-context';
import { serviceUsesRentalRange } from './search-draft';
import { serviceItems, vehicleItems } from './search-items';
import styles from './SearchCard.module.css';

/**
 * Thẻ tìm kiếm của trang chủ theo design v2 (Figma "Search Panel", ADR 0062):
 *
 *   [Thuê xe tự lái | Xe có tài xế | Thuê xe dài hạn]      ← dải tab dịch vụ
 *   Loại xe [Ô tô | Xe máy] · Địa điểm · Thời gian nhận/trả · [Tìm kiếm]
 *
 * Loại xe và dịch vụ vẫn là hai chiều ĐỘC LẬP (một trạng thái mỗi chiều) — chỉ vị trí đổi theo
 * bản vẽ: dịch vụ thành tab của cả thẻ, loại xe thành nhóm nút đầu hàng ô nhập.
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
export function SearchCard() {
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
  const vehicleOptions = useMemo(
    () => vehicleItems(domainLabel, draft.serviceType),
    [domainLabel, draft.serviceType],
  );

  const withDriver = draft.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const longTerm = draft.serviceType === SERVICE_TYPE.LONG_TERM;
  const usesRange = serviceUsesRentalRange(draft.serviceType);

  return (
    <div className={styles.cardOuter}>
      {/* Trượt lên khi gắn (≈ `.banner-btn-area wow fadeInUp` của trang mẫu). Trễ 0.2s thay vì
          1.2s: đây là ô tìm kiếm chính, không phải nút trang trí — người dùng không phải chờ. */}
      <div
        role="search"
        aria-label={t('card.searchLabel')}
        className={cx(styles.card, enterClass(200))}
      >
        {/*
          Dải tab dịch vụ CHỈ rộng bằng các tab của nó (Figma): phần còn lại của hàng trên cùng
          để lộ ảnh hero phía sau. Bảng ô nhập bên dưới vì thế chỉ bo góc PHẢI ở trên.
        */}
        <div className={styles.tabs}>
          <SegmentedTabs
            value={draft.serviceType}
            onChange={setServiceType}
            items={serviceOptions}
            ariaLabel={t('card.serviceTypeLabel')}
            controls={formId}
            appearance="tabs"
          />
        </div>

        {/*
          KHÔNG `key` theo dịch vụ, và KHÔNG hoạt cảnh vào ở tầng này.

          Đổi dịch vụ chỉ đổi MỘT PHẦN của form: ô địa điểm và nút tìm là chung cho cả ba dịch
          vụ. Gắn `key` là ép React dựng lại cả khối, nên hai thứ không hề đổi cũng bị tháo rồi
          dựng lại — đúng cái chớp nháy khó chịu khi bấm qua lại giữa các tab. Bỏ `key` thì các
          nút được giữ nguyên; chỉ hàng lộ trình, ô thời gian và dòng ghi chú đổi TỨC THÌ.
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
            vehicle: domainLabel(
              'vehicleType',
              draft.vehicleType,
              VEHICLE_TYPE_LABEL[draft.vehicleType],
            ),
            service: domainLabel(
              'serviceType',
              draft.serviceType,
              SERVICE_TYPE_LABEL[draft.serviceType],
            ),
          })}
          className={styles.panel}
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
            <div className={cx(styles.cell, styles.cellVehicle)}>
              <span className={styles.cellLabel}>{t('card.vehicleTypeLabel')}</span>
              <SegmentedTabs
                value={draft.vehicleType}
                onChange={setVehicleType}
                items={vehicleOptions}
                ariaLabel={t('card.vehicleTypeLabel')}
                semantics="radio"
                appearance="segment"
              />
            </div>

            <div className={styles.cell}>
              <span className={styles.cellLabel}>{t('location.label')}</span>
              <LocationPicker />
            </div>

            {usesRange ? (
              <div className={styles.cell}>
                <span className={styles.cellLabel}>{t('rental.pickupReturnLabel')}</span>
                <RentalDateTimeRangeField
                  value={draft.rental}
                  onChange={setRentalRange}
                  mode={draft.rental.mode}
                  onModeChange={setRentalMode}
                  placeholder={t('rental.placeholder')}
                  suffix={
                    <span className={styles.boxIcon}>
                      <Image
                        src="/home/field-calendar.svg"
                        alt=""
                        width={16}
                        height={18}
                        unoptimized
                      />
                    </span>
                  }
                  className={styles.box}
                />
              </div>
            ) : null}

            <CtaButton
              size="lg"
              className={styles.submit}
              onClick={submit}
              iconStart={
                <span className={styles.boxIcon}>
                  <Image src="/home/btn-search.svg" alt="" width={19} height={19} unoptimized />
                </span>
              }
            >
              {t('card.searchAction')}
            </CtaButton>
          </div>

          {longTerm ? <p className={styles.hint}>{t('card.longTermHint')}</p> : null}
        </div>
      </div>
    </div>
  );
}
