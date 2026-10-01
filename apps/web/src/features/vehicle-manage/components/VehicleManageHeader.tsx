'use client';

import { StarFilled } from '@ant-design/icons';
import { Breadcrumb, Button, Tooltip } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';

import { BackButton } from '@/components/navigation/BackButton';
import { useBranchReturnHref } from '@/features/branches/hooks/use-branch-return';
import { VEHICLE_MANAGE_SECTION, listingPath, vehicleManageSectionOf } from '@/constants/routes';
import { VehicleEditHeader } from '@/features/vehicles/components/VehicleEditHeader';
import { useAvailableHref } from '@/features/tenant-support/support-session';
import { useWorkspace } from '@/hooks/use-workspace';
import type { VehicleDetail, VehicleStats } from '@/features/vehicles/types';
import { useAppFormat } from '@/i18n/use-app-format';

import { sectionLabelKeyOf } from '../navigation';
import styles from './VehicleManageHeader.module.css';

interface Props {
  vehicle: VehicleDetail;
  /** Chỉ số từ `/vehicles/:id/summary` — vắng mặt khi chưa tải xong hoặc hỏng; header tự bỏ trống. */
  stats: VehicleStats | undefined;
  /** Đổi trạng thái vận hành tại chỗ trên chip — `vehicles.update` ∧ phiên hỗ trợ không khoá ô này. */
  statusEditable?: boolean;
}

/**
 * Thanh đầu của không gian quản lý xe: ảnh đại diện, tên, trạng thái, điểm đánh giá + số chuyến
 * THẬT (từ summary — không bịa), và "Xem trang xe" chỉ dẫn được khi xe đã công khai.
 *
 * KHÔNG có "Số dư": nền tảng chưa có số dư/ví chủ xe (ADR 0028 điều 8) — một con số giả là
 * một lời hứa sai.
 */
export function VehicleManageHeader({ vehicle, stats, statusEditable = false }: Props) {
  const t = useTranslations('VehicleManage.header');
  const tRoot = useTranslations('VehicleManage');
  const tMenu = useTranslations('VehicleManage.menu');
  const fmt = useAppFormat();
  const { paths, vehicles: vehiclePaths } = useWorkspace();
  const profileHref = useAvailableHref()(vehiclePaths.overview(vehicle.id));
  // Quay lại đúng chi nhánh đang lọc lúc rời danh sách, không về danh sách trần (ADR 0052).
  const backHref = useBranchReturnHref(paths.vehicles);
  const pathname = usePathname();
  const section = vehicleManageSectionOf(pathname);
  const sectionLabelKey = section ? sectionLabelKeyOf(section) : null;
  /*
   * "Xem trang xe" theo KẾT QUẢ hiển thị thật, không theo trạng thái kiểm duyệt (ADR 0048): một
   * chiếc xe đã duyệt nhưng chủ xe đang tạm ẩn thì `/listings/:id` trả 404, nên một đường dẫn
   * sáng ở đây là dẫn người dùng tới một trang không tồn tại.
   */
  const isPublic = vehicle.isMarketplaceVisible;
  const router = useRouter();
  const imagesHref = useAvailableHref()(
    vehiclePaths.manageSection(vehicle.id, VEHICLE_MANAGE_SECTION.IMAGES),
  );

  return (
    <div className={styles.root}>
      {/*
        Nút lui + breadcrumb trên CÙNG một hàng (30/09/2026).

        Không gian này chiếm trọn bề ngang nên người dùng mất mọi mốc của khu tài khoản; thứ họ
        cần lúc đó là "đường ra" và "tôi đang ở mục nào, của chiếc xe nào". `BackButton` trả lời
        câu đầu — nó là một đích chạm 40px, thấy ngay, giống mọi trang chi tiết khác — còn
        breadcrumb trả lời câu sau.

        Breadcrumb KHÔNG lặp lại cấp "Danh sách xe": nút ngay bên trái đã là chính đường dẫn đó,
        và hai liên kết giống hệt nhau cạnh nhau chỉ làm người đọc phải chọn giữa hai thứ như
        nhau. Cấp còn lại trỏ HỒ SƠ 360, và nó thành chữ thường khi khu này không có Hồ sơ 360
        (phiên hỗ trợ).
      */}
      <div className={styles.trail}>
        <BackButton href={backHref} label={tRoot('backToList')} />
        <Breadcrumb
          className={styles.crumbs}
          items={[
            {
              key: 'vehicle',
              title: profileHref ? <Link href={profileHref}>{vehicle.name}</Link> : vehicle.name,
            },
            ...(sectionLabelKey ? [{ key: 'section', title: tMenu(sectionLabelKey) }] : []),
          ]}
        />
      </div>
      {/*
        CÙNG thẻ đầu xe với màn sửa xe ở cổng quản lý (30/09/2026) — ảnh, tên + mã, biển số · loại
        xe / dịch vụ, số KM, hai trục trạng thái, công tắc "Trên chợ". Chủ xe đổi trạng thái vận hành
        ngay trên chip (30/09/2026, như cổng quản lý). Riêng khu này: điểm đánh giá + số
        chuyến thật và hai lối Hồ sơ xe · Trang xe, đặt dưới công tắc.
      */}
      <VehicleEditHeader
        vehicle={vehicle}
        statusEditable={statusEditable}
        onEditImages={
          imagesHref && section !== VEHICLE_MANAGE_SECTION.IMAGES
            ? () => router.push(imagesHref)
            : undefined
        }
        extraActions={
          <>
            {stats ? (
              <span className={styles.meta}>
                <span className={styles.rating}>
                  <StarFilled aria-hidden="true" />
                  {stats.ratingAvg ? fmt.rating(Number(stats.ratingAvg)) : t('noRating')}
                </span>
                <span className={styles.sep} aria-hidden="true">
                  {LIST_SEPARATOR}
                </span>
                <span>{t('trips', { count: stats.completedBookings })}</span>
              </span>
            ) : null}
            {profileHref ? (
              <Link href={profileHref}>
                <Button size="small">{t('viewProfile')}</Button>
              </Link>
            ) : null}
            {isPublic ? (
              <Link href={listingPath.detail(vehicle.id)} target="_blank" rel="noopener">
                <Button size="small">{t('viewListing')}</Button>
              </Link>
            ) : (
              <Tooltip title={t('viewListingDisabled')}>
                <span className={styles.disabledWrap}>
                  <Button size="small" disabled>
                    {t('viewListing')}
                  </Button>
                </span>
              </Tooltip>
            )}
          </>
        }
      />
    </div>
  );
}
