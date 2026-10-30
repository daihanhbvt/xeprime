'use client';

import { EditOutlined } from '@ant-design/icons';
import { Button, Tabs } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { DRIVER_LINK_OPEN_STATUSES, PERMISSION } from '@xeprime/types';
import { driverLinkTone } from '@xeprime/domain';
import { ToneBadge } from '@/components/data-display/ToneBadge';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import {
  WorkDrawerFooter,
  WorkDrawerPager,
  WorkDrawerTitle,
} from '@/components/overlay/WorkDrawer';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { isNotFoundError } from '@/lib/http-status';
import { useDriverOverview } from '../hooks/use-drivers';
import { DRIVER_DETAIL_TAB, DRIVER_DETAIL_TABS, type Driver, type DriverDetailTab } from '../types';
import { DriverMonthPicker } from './DriverMonthPicker';
import { DriverOverviewTab } from './DriverOverviewTab';
import { DriverProfileTab } from './DriverProfileTab';
import { DriverTripsTab } from './DriverTripsTab';
import styles from './DriverDetail.module.css';

/**
 * Chi tiết MỘT tài xế ở trang Tài xế (ADR 0063 · 0074 · 0075) — panel rộng, toàn màn hình trên
 * mobile, chuyển thẳng sang tài xế trước/sau trong danh sách đang lọc.
 *
 *  - **Tổng quan**: tiền công ghi nhận của tháng, việc đang treo, độ tin cậy khi được gán (90
 *    ngày), xu hướng 6 tháng.
 *  - **Chuyến & tiền công**: từng chuyến kết thúc trong tháng + tải bảng kê để đối chiếu khi trả.
 *  - **Hồ sơ**: liên kết, bằng lái, mốc mời/đồng ý/kết thúc, ghi chú.
 *
 * Tài xế đang mở, tab và tháng sống trên URL (ADR 0004) — F5, Back và link gửi đồng nghiệp rơi
 * đúng chỗ. Tháng là CÙNG tham số với cột tháng của danh sách. Tiền công chỉ là số GHI NHẬN: không
 * có con số nào ở đây là tiền XePrime giữ hay chi.
 */
export function DriverDetailDrawer({
  driverId,
  month,
  tab,
  previousId,
  nextId,
  onNavigate,
  onTabChange,
  onMonthChange,
  onEdit,
  onClose,
}: {
  driverId: string | null;
  month: string | undefined;
  tab: DriverDetailTab | undefined;
  previousId: string | null;
  nextId: string | null;
  onNavigate: (id: string) => void;
  onTabChange: (tab: DriverDetailTab) => void;
  onMonthChange: (month: string) => void;
  onEdit: (driver: Driver) => void;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.detail');
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();
  const query = useDriverOverview(driverId, month);
  // Số của tài xế trước còn trong cache một nhịp khi vừa chuyển — chỉ vẽ đúng người đang mở.
  const data = query.data && query.data.driver.id === driverId ? query.data : undefined;
  const driver = data?.driver;
  const notFound = isNotFoundError(query.error);
  const active = tab && DRIVER_DETAIL_TABS.includes(tab) ? tab : DRIVER_DETAIL_TAB.OVERVIEW;
  const canEdit =
    has(PERMISSION.DRIVER_MANAGE) && Boolean(driver && DRIVER_LINK_OPEN_STATUSES.includes(driver.linkStatus));

  // Bộ chọn tháng nằm TRONG thân hai tab theo tháng, không ở thanh tab: trên mobile thanh tab
  // không đủ chỗ cho cả ba tab lẫn một ô chọn tháng.
  const monthPicker = data ? (
    <DriverMonthPicker month={data.month.month} onChange={onMonthChange} />
  ) : null;
  const content: Record<DriverDetailTab, () => ReactNode> = {
    [DRIVER_DETAIL_TAB.OVERVIEW]: () =>
      data ? <DriverOverviewTab overview={data} monthPicker={monthPicker} /> : null,
    [DRIVER_DETAIL_TAB.TRIPS]: () =>
      driver ? (
        <DriverTripsTab driver={driver} month={data.month.month} monthPicker={monthPicker} />
      ) : null,
    [DRIVER_DETAIL_TAB.PROFILE]: () => (driver ? <DriverProfileTab driver={driver} /> : null),
  };

  return (
    <DetailDrawer
      open={Boolean(driverId)}
      onClose={onClose}
      size="xl"
      closeAtEnd
      ariaLabel={driver ? t('ariaLabel', { name: driver.name }) : t('fallbackTitle')}
      title={
        driver ? (
          <WorkDrawerTitle
            label={driver.name}
            code={driver.phone}
            status={
              <ToneBadge tone={driverLinkTone(driver.linkStatus)}>
                {domainLabel('driverLinkStatus', driver.linkStatus)}
              </ToneBadge>
            }
          />
        ) : (
          t('fallbackTitle')
        )
      }
      extra={
        <WorkDrawerPager
          previousId={previousId}
          nextId={nextId}
          onNavigate={onNavigate}
          previousLabel={t('previous')}
          nextLabel={t('next')}
        />
      }
      loading={!data && !query.isError}
      error={query.isError && !data}
      errorTitle={notFound ? t('notFound') : t('loadError')}
      onRetry={notFound ? undefined : () => void query.refetch()}
      bodyClassName={styles.body}
      footer={
        driver && canEdit ? (
          <WorkDrawerFooter
            actions={
              <Button icon={<EditOutlined />} onClick={() => onEdit(driver)}>
                {t('edit')}
              </Button>
            }
          />
        ) : null
      }
    >
      {data ? (
        // `key` theo tài xế: trang của tab chuyến, lượt tải bảng kê… thuộc về một người.
        <Tabs
          key={data.driver.id}
          className={styles.tabs}
          activeKey={active}
          onChange={(key) => onTabChange(key as DriverDetailTab)}
          // Chỉ tab đang mở được dựng — tab chuyến tự tải danh sách của nó khi được mở.
          items={DRIVER_DETAIL_TABS.map((key) => ({
            key,
            label: t(`tabs.${key}`),
            children: key === active ? content[key]() : null,
          }))}
        />
      ) : null}
    </DetailDrawer>
  );
}
