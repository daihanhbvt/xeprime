'use client';

import { Switch, Tooltip } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ServiceType } from '@xeprime/types';

import { VEHICLE_MANAGE_SECTION, vehicleManageSectionOf } from '@/constants/routes';
import {
  supportAllowsVehicleSection,
  useSupportSession,
} from '@/features/tenant-support/support-session';
import type { VehicleDetail } from '@/features/vehicles/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { useDomainLabel } from '@/i18n/use-domain-label';

import { VEHICLE_MANAGE_NAV } from '../navigation';
import type { ServiceToggleState } from '../hooks/use-service-toggle';
import { VehicleSectionNav, type VehicleSectionNavGroup } from './VehicleSectionNav';
import styles from './VehicleManageSidebar.module.css';

interface Props {
  vehicle: VehicleDetail;
  toggle: ServiceToggleState;
}

/**
 * Menu trái của một xe ở KHU TÀI KHOẢN — năm nhóm mục, công tắc dịch vụ trên tiêu đề nhóm.
 *
 * Mục của dịch vụ đang tắt vẫn bấm được (trang con tự hiện lý do và nút bật) nhưng mờ đi, để
 * thấy ngay nhóm nào không hoạt động.
 *
 * File này chỉ còn phần DỮ LIỆU: dựng nhóm/mục từ `VEHICLE_MANAGE_NAV`, lọc theo phiên hỗ trợ và
 * gắn công tắc dịch vụ. Phần trình bày nằm ở `VehicleSectionNav`, dùng chung với cổng quản lý —
 * xem docblock ở đó.
 *
 * KHÔNG có khối thương hiệu và KHÔNG có thẻ người dùng (29/09/2026): không gian này chiếm trọn
 * bề ngang nhưng vẫn nằm TRONG khu tài khoản, nơi đã có logo ở header và thẻ người dùng ở menu
 * của chính nó. Thứ thay chúng là breadcrumb ở `VehicleManageHeader`.
 */
export function VehicleManageSidebar({ vehicle, toggle }: Props) {
  const t = useTranslations('VehicleManage');
  const tMenu = useTranslations('VehicleManage.menu');
  const domainLabel = useDomainLabel();
  const pathname = usePathname();
  const { vehicles: vehiclePaths } = useWorkspace();
  // Phiên hỗ trợ (ADR 0050): chỉ các mục của Đợt 1, và không có công tắc dịch vụ — bật/tắt dịch
  // vụ là quyết định kinh doanh của chủ xe.
  const support = useSupportSession();
  const active = vehicleManageSectionOf(pathname);
  const services = vehicle.serviceTypes ?? [];

  const groups: VehicleSectionNavGroup[] = VEHICLE_MANAGE_NAV.map((group) => {
    const items = group.items.filter((item) => supportAllowsVehicleSection(support, item.section));
    const service = group.serviceType;
    const enabled = service ? services.includes(service) : true;
    const serviceLabel = service ? domainLabel('serviceType', service) : '';
    const blocked = service ? toggle.blockedReason(service as ServiceType, !enabled) : null;

    return {
      key: group.key,
      label: tMenu(group.labelKey),
      dimmed: !enabled,
      control:
        service && !support ? (
          <Tooltip title={blocked ?? undefined}>
            <Switch
              size="small"
              aria-label={t('nav.toggleLabel', { service: serviceLabel })}
              checked={enabled}
              disabled={Boolean(blocked) || toggle.pending}
              loading={toggle.pending}
              onChange={(next) => toggle.toggle(service as ServiceType, next)}
            />
          </Tooltip>
        ) : undefined,
      /*
       * Nhóm chỉ có công tắc (thuê dài hạn): nói giá tháng nằm đâu và dẫn tới đó — một nhóm
       * không mục nào dưới tiêu đề trông như lỗi hiển thị.
       */
      extra:
        service && items.length === 0 && !support ? (
          <Link
            href={vehiclePaths.manageSection(vehicle.id, VEHICLE_MANAGE_SECTION.PRICING)}
            className={styles.groupNote}
          >
            {tMenu('longTermNote')}
          </Link>
        ) : undefined,
      items: items.map((item) => ({
        key: item.section,
        label: tMenu(item.labelKey),
        icon: item.icon,
        href: vehiclePaths.manageSection(vehicle.id, item.section),
      })),
    };
  });

  return <VehicleSectionNav groups={groups} activeKey={active} ariaLabel={t('nav.menuLabel')} />;
}
