'use client';

import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  PERMISSION,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { ReasonDialog } from '@/components/overlay/ReasonDialog';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import {
  WORK_DRAWER_BODY_CLASS,
  WorkDrawerFooter,
  WorkDrawerLayout,
  WorkDrawerPager,
  WorkDrawerTitle,
} from '@/components/overlay/WorkDrawer';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useAdminVehicle, useVehicleModeration } from '../hooks/use-admin-vehicles';
import type { AdminVehicleDetail } from '../types';
import { VehicleProfile, VehicleSidePanel } from './VehicleDetailSections';
import styles from './AdminVehicleDetailDrawer.module.css';

interface AdminVehicleDetailDrawerProps {
  vehicleId: string | null;
  /** Xe liền trước / liền sau trong trang đang xem — `null` ở hai đầu. */
  previousId: string | null;
  nextId: string | null;
  onNavigate: (vehicleId: string) => void;
  onClose: () => void;
}

type DialogKind = 'hide' | 'unhide';

/** Trần lý do ẩn — cùng `HideVehicleDto.reason` phía API. */
const HIDE_REASON_MAX = 500;

/**
 * Chi tiết MỘT xe trên màn giám sát — panel làm việc (`DetailDrawer size="xl"`): hồ sơ xe bên
 * trái, ba trục "trên chợ" + gian hàng bên phải (dính khi cuộn), thanh quyết định dính ở đáy.
 *
 * Hai hành động, và chúng KHÔNG đối xứng (ADR 0048 điều 4):
 *  - **Ẩn khỏi chợ**: chỉ với xe đang `approved_public`, BẮT BUỘC lý do (ghi audit).
 *  - **Gỡ ẩn của nền tảng**: chỉ với xe do nền tảng ẩn; nó KHÔNG bật hộ công tắc của chủ xe —
 *    hộp xác nhận và toast nói thẳng hệ quả đó, nếu không người kiểm duyệt bấm xong thấy xe vẫn
 *    không lên chợ và kết luận hệ thống hỏng.
 *
 * Hộp thoại GẮN VỚI XE đã mở nó: sang xe khác (trước/sau, link) thì hộp thoại của xe cũ tự không
 * còn — không có cách nào gửi lý do ẩn xe A lên xe B.
 */
export function AdminVehicleDetailDrawer({
  vehicleId,
  previousId,
  nextId,
  onNavigate,
  onClose,
}: AdminVehicleDetailDrawerProps) {
  const t = useTranslations('AdminVehicles');
  const tCommon = useTranslations('Common.actions');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { data, isLoading, isError, refetch } = useAdminVehicle(vehicleId);
  // Cache của xe trước có thể còn trong tay một nhịp khi vừa chuyển — chỉ vẽ đúng xe đang mở.
  const detail = data && data.id === vehicleId ? data : undefined;
  const moderation = useVehicleModeration();
  const { has } = usePermissions();
  const canModerate = has(PERMISSION.PLATFORM_VEHICLE_MODERATE);

  const [dialogState, setDialogState] = useState<{ id: string; kind: DialogKind } | null>(null);
  const dialog = dialogState && dialogState.id === vehicleId ? dialogState.kind : null;
  const openDialog = (kind: DialogKind) => {
    if (vehicleId) setDialogState({ id: vehicleId, kind });
  };
  // Chỉ đóng hộp thoại của ĐÚNG xe vừa có kết quả — người kiểm duyệt có thể đã sang xe khác.
  const closeDialog = (id: string | null = vehicleId) =>
    setDialogState((current) => (current && current.id === id ? null : current));

  const topRef = useRef<HTMLDivElement>(null);
  const shownId = detail?.id ?? null;
  useEffect(() => {
    // `?.()`: jsdom (test) không có `scrollIntoView`; trình duyệt thật thì luôn có.
    topRef.current?.scrollIntoView?.({ block: 'start' });
  }, [shownId]);

  // Lượt đang bay CỦA XE NÀY — lượt của xe trước không khoá nút của xe sau.
  const busy = moderation.isPending && moderation.variables?.id === vehicleId;
  const isPublic = detail?.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  const isHidden = detail?.publicStatus === VEHICLE_PUBLIC_STATUS.HIDDEN;
  const stillPausedByOwner = detail ? !detail.marketplaceEnabled : false;

  function hide(reason: string) {
    if (!vehicleId) return;
    const id = vehicleId;
    moderation.mutate(
      { id, kind: 'hide', reason },
      {
        onSuccess: () => {
          message.success(t('moderation.hideSuccess'));
          closeDialog(id);
        },
        onError: (error) => message.error(errorMessage(error)),
      },
    );
  }

  function unhide() {
    if (!vehicleId || busy) return;
    const id = vehicleId;
    const ownerPaused = stillPausedByOwner;
    moderation.mutate(
      { id, kind: 'unhide' },
      {
        onSuccess: () => {
          message.success(
            ownerPaused ? t('moderation.unhideSuccessOwnerPaused') : t('moderation.unhideSuccess'),
          );
          closeDialog(id);
        },
        onError: (error) => message.error(errorMessage(error)),
      },
    );
  }

  return (
    <>
      <DetailDrawer
        open={Boolean(vehicleId)}
        onClose={onClose}
        size="xl"
        closeAtEnd
        ariaLabel={detail ? t('drawer.ariaLabel', { name: detail.name }) : t('drawer.title')}
        title={
          <WorkDrawerTitle
            label={t('drawer.title')}
            code={detail?.code}
            status={
              detail ? (
                <StatusTag
                  value={detail.publicStatus as VehiclePublicStatus}
                  meta={VEHICLE_PUBLIC_STATUS_META}
                  group="vehiclePublicStatus"
                />
              ) : null
            }
          />
        }
        extra={
          <WorkDrawerPager
            previousId={previousId}
            nextId={nextId}
            onNavigate={onNavigate}
            previousLabel={t('drawer.previous')}
            nextLabel={t('drawer.next')}
          />
        }
        loading={!detail && !isError && (isLoading || Boolean(vehicleId))}
        error={isError && !detail}
        errorTitle={t('drawer.loadError')}
        onRetry={() => void refetch()}
        bodyClassName={WORK_DRAWER_BODY_CLASS}
        footer={
          detail ? (
            <WorkDrawerFooter
              hint={<FooterHint vehicle={detail} canModerate={canModerate} />}
              actions={
                canModerate && isPublic ? (
                  <Button
                    danger
                    icon={<EyeInvisibleOutlined />}
                    loading={busy}
                    onClick={() => openDialog('hide')}
                  >
                    {t('moderation.hide')}
                  </Button>
                ) : canModerate && isHidden ? (
                  <Button
                    type="primary"
                    icon={<EyeOutlined />}
                    loading={busy}
                    onClick={() => openDialog('unhide')}
                  >
                    {t('moderation.unhide')}
                  </Button>
                ) : undefined
              }
            />
          ) : null
        }
      >
        {detail ? (
          // `key` theo XE: khối đang mở, hộp thoại hỗ trợ… thuộc về một xe; sang xe khác là dựng lại.
          <WorkDrawerLayout
            key={detail.id}
            ref={topRef}
            sideLabel={t('drawer.sideLabel')}
            main={<VehicleProfile vehicle={detail} />}
            side={<VehicleSidePanel vehicle={detail} />}
          />
        ) : null}
      </DetailDrawer>

      <ReasonDialog
        open={dialog === 'hide'}
        title={t('moderation.hideTitle')}
        summary={t('moderation.hideNote')}
        label={t('moderation.reasonLabel')}
        placeholder={t('moderation.reasonPlaceholder')}
        requiredMessage={t('moderation.reasonRequired')}
        minLength={1}
        maxLength={HIDE_REASON_MAX}
        submitText={t('moderation.hideOk')}
        loading={busy}
        onSubmit={hide}
        onClose={() => closeDialog()}
      />

      <ResponsiveDialog
        open={dialog === 'unhide'}
        title={t('moderation.unhideTitle')}
        size="sm"
        okText={t('moderation.unhideOk')}
        cancelText={tCommon('close')}
        confirmLoading={busy}
        onOk={unhide}
        onClose={() => closeDialog()}
      >
        <p className={styles.dialogHint}>
          {stillPausedByOwner ? t('moderation.unhideNoteOwnerPaused') : t('moderation.unhideNote')}
        </p>
      </ResponsiveDialog>
    </>
  );
}

/** Dòng gợi ý ở thanh quyết định — luôn có chữ, không chỉ màu. */
function FooterHint({
  vehicle,
  canModerate,
}: {
  vehicle: AdminVehicleDetail;
  canModerate: boolean;
}) {
  const t = useTranslations('AdminVehicles.footer');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  if (!canModerate) {
    return (
      <span className={styles.footerHint}>
        <InfoCircleOutlined aria-hidden />
        {t('noPermission')}
      </span>
    );
  }
  if (vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.HIDDEN) {
    return (
      <span className={cx(styles.footerHint, styles.footerHintWarn)}>
        <ExclamationCircleOutlined aria-hidden />
        {vehicle.platformHide
          ? t('platformHidden', { at: fmt.dateTime(vehicle.platformHide.hiddenAt) })
          : t('platformHiddenUnknown')}
      </span>
    );
  }
  if (vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC) {
    return vehicle.isMarketplaceVisible ? (
      <span className={cx(styles.footerHint, styles.footerHintLive)}>
        <CheckCircleOutlined aria-hidden />
        {t('live')}
      </span>
    ) : (
      <span className={cx(styles.footerHint, styles.footerHintWarn)}>
        <ExclamationCircleOutlined aria-hidden />
        {t('notShowing', {
          reason: domainLabel('marketplaceVisibility', vehicle.marketplaceVisibilityReason),
        })}
      </span>
    );
  }
  return (
    <span className={styles.footerHint}>
      <InfoCircleOutlined aria-hidden />
      {t('unavailable')}
    </span>
  );
}
