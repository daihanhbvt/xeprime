'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useId, useMemo } from 'react';
import {
  ROUTE_TYPE_LABEL,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_LABEL,
  VEHICLE_TYPE_LABEL,
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
 *   - **Có tài xế**: LỘ TRÌNH thay chỗ nhóm "Loại xe" ở đầu hàng — ngữ cảnh để gian hàng báo
 *     giá đúng khi duyệt, không phải chiều lọc danh sách xe (xe không khai lộ trình phục vụ).
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
    () => serviceItems(draft.vehicleType, false, tService),
    [draft.vehicleType, tService],
  );
  const vehicleOptions = useMemo(
    () => vehicleItems(domainLabel, draft.serviceType),
    [domainLabel, draft.serviceType],
  );
  const routeOptions = useMemo(
    () =>
      ROUTE_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('routeType', value, ROUTE_TYPE_LABEL[value]),
      })),
    [domainLabel],
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
          Dải tab dịch vụ theo thiết kế mới: nằm liền trên viên tìm kiếm trắng với góc lượn ngược ở hai bên.
        */}
        <div className={styles.tabsOuter}>
          <div className={styles.tabs}>
            <TabShoulder className={styles.shoulderLeft} />
            <TabShoulder className={styles.shoulderRight} />
            <SegmentedTabs
              value={draft.serviceType}
              onChange={setServiceType}
              items={serviceOptions}
              ariaLabel={t('card.serviceTypeLabel')}
              controls={formId}
              appearance="tabs"
            />
          </div>
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
          <div className={cx(styles.fields, longTerm && styles.fieldsCompact)}>
            {/*
              Có tài xế chỉ phục vụ ô tô, nên nhóm "Loại xe" chỉ còn một lựa chọn — ô đầu hàng
              nhường chỗ cho LỘ TRÌNH (Figma `21902:31701`).
            */}
            <div className={cx(styles.cell, styles.cellVehicle)}>
              {withDriver ? (
                <SegmentedTabs
                  value={draft.routeType}
                  onChange={setRouteType}
                  items={routeOptions}
                  ariaLabel={t('route.label')}
                  semantics="radio"
                  appearance="segment"
                />
              ) : (
                <SegmentedTabs
                  value={draft.vehicleType}
                  onChange={setVehicleType}
                  items={vehicleOptions}
                  ariaLabel={t('card.vehicleTypeLabel')}
                  semantics="radio"
                  appearance="segment"
                />
              )}
            </div>

            <div className={cx(styles.cell, styles.cellLocation)}>
              <span className={styles.srOnly}>{t('location.label')}</span>
              <LocationPicker className={styles.locationField} />
            </div>

            {usesRange ? (
              <div className={cx(styles.cell, styles.cellRental)}>
                <span className={styles.srOnly}>{t('rental.pickupReturnLabel')}</span>
                <RentalDateTimeRangeField
                  value={draft.rental}
                  onChange={setRentalRange}
                  mode={draft.rental.mode}
                  onModeChange={setRentalMode}
                  placeholder={t('rental.placeholder')}
                  formatPoint={(d) => d.format('HH:mm DD/MM/YYYY')}
                  separator=" - "
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
              shape="pill"
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
        </div>
      </div>
    </div>
  );
}

/**
 * "Vai" của dải tab — path lấy nguyên từ Figma (`21902:31703`): chân loe ra từ mép viên tìm kiếm,
 * uốn chữ S lên đỉnh phẳng. Tô bằng `currentColor` để theo màu nền thẻ ở cả giao diện tối.
 */
function TabShoulder({ className }: { className?: string }) {
  return (
    <svg className={className} width="156" height="48" viewBox="0 0 156 48" aria-hidden="true">
      <path
        d="M0 48H156L117 0H59.9285C47.215 0 35.7073 7.5262 30.6115 19.1738L25.2147 31.5092C20.832 41.5269 10.9345 48 0 48Z"
        fill="currentColor"
      />
    </svg>
  );
}
