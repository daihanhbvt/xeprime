'use client';

import { App, Alert, Button, Divider, Skeleton, Space } from 'antd';
import { useState } from 'react';
import {
  FUEL_LEVEL_LABEL, HANDOVER_STATUS, HANDOVER_STATUS_META, HANDOVER_TYPE, HANDOVER_TYPE_LABEL, PERMISSION, type FuelLevel, type HandoverStatus, type HandoverType, } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { usePermissions } from '@/hooks/use-permissions';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { cancelHandover, saveHandoverDraft } from '../api';
import { useHandoverContext, useInvalidateHandovers } from '../hooks';
import type { Handover, HandoverContext } from '../types';
import { HandoverDialog } from './HandoverDialog';
import { ResolveOdometerDialog } from './ResolveOdometerDialog';
import styles from './Handover.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useTranslations } from 'next-intl';

type OpenDialog = { kind: 'form' | 'odometer'; type: HandoverType } | null;

/**
 * Khối "Bàn giao & Nhận lại" trong chi tiết đơn thuê (Wave 7).
 *
 * Đặt trong chi tiết đơn chứ không phải một màn riêng: bàn giao là một BƯỚC của vòng đời đơn,
 * người vận hành đang đứng ở đơn nào thì làm bàn giao của đơn đó. Không có mục điều hướng mới.
 */
export function HandoverPanel({
  bookingId,
  bookingStatus,
  onDirtyChange,
}: {
  bookingId: string;
  bookingStatus: string;
  /** Báo lên drawer chi tiết đơn là biên bản đang có thay đổi chưa lưu (xem HandoverDialog). */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { has } = usePermissions();
  const canView = has(PERMISSION.HANDOVER_VIEW);
  const { data, isLoading, isError, error, refetch } = useHandoverContext(bookingId, canView);

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title="Không có quyền xem biên bản bàn giao"
        description="Biên bản bàn giao chứa chỉ số KM và ảnh hiện trạng của xe. Liên hệ quản trị viên nếu bạn cần quyền này."
        missingPermissions={[PERMISSION.HANDOVER_VIEW]}
      />
    );
  }

  if (isLoading) {
    return <Skeleton active paragraph={{ rows: 4 }} />;
  }

  if (isError || !data) {
    // Đơn/xe đã bị xoá là câu trả lời cuối cùng — không mời thử lại một thứ không còn tồn tại
    // (quy tắc R10 của EmptyState: chỉ retry khi việc đó có nghĩa).
    const gone = getErrorCode(error) === 'NOT_FOUND';
    return (
      <EmptyState
        variant="error"
        title={gone ? 'Đơn hoặc xe không còn tồn tại' : 'Không tải được biên bản bàn giao'}
        description={
          gone
            ? 'Đơn thuê này đã bị xoá hoặc thuộc gian hàng khác, nên không còn biên bản bàn giao để xem.'
            : 'Kết nối có thể bị gián đoạn. Thử lại để xem tình trạng giao/nhận xe.'
        }
        onRetry={gone ? undefined : () => void refetch()}
      />
    );
  }

  return (
    <HandoverPanelBody
      context={data}
      bookingStatus={bookingStatus}
      onDirtyChange={onDirtyChange}
    />
  );
}

function HandoverPanelBody({
  context,
  bookingStatus,
  onDirtyChange,
}: {
  context: HandoverContext;
  bookingStatus: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();

  const { message } = App.useApp();
  const { has } = usePermissions();
  const invalidate = useInvalidateHandovers(context.bookingId, context.vehicleId);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [starting, setStarting] = useState<HandoverType | null>(null);
  const [cancelling, setCancelling] = useState<HandoverType | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const canManage = has(PERMISSION.HANDOVER_MANAGE);
  const canConfirm = has(PERMISSION.HANDOVER_CONFIRM);
  const canViewFiles = has(PERMISSION.HANDOVER_FILE_VIEW);
  const canFixOdometer = has(PERMISSION.VEHICLE_ODOMETER_CORRECT);

  /** Tạo bản nháp rỗng rồi mở form — ảnh cần một biên bản có thật để gắn vào. */
  async function start(type: HandoverType) {
    setStarting(type);
    try {
      await saveHandoverDraft(context.bookingId, type, {});
      invalidate();
      setDialog({ kind: 'form', type });
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setStarting(null);
    }
  }

  const handoverOf = (type: HandoverType) =>
    (type === HANDOVER_TYPE.PICKUP ? context.pickup : context.return) ?? null;
  const active = dialog ? handoverOf(dialog.type) : null;
  const cancelTarget = cancelling ? handoverOf(cancelling) : null;

  /** Huỷ bản nháp/sẵn sàng. Biên bản đã xác nhận không đi được đường này (backend chặn). */
  async function runCancel() {
    if (!cancelling || !cancelTarget) return;
    setCancelBusy(true);
    try {
      await cancelHandover(context.bookingId, cancelling, cancelTarget.rowVersion);
      message.success('Đã huỷ biên bản — có thể lập lại từ đầu khi cần');
      setCancelling(null);
      invalidate();
    } catch (err) {
      // Người khác vừa xác nhận/sửa trong lúc mình mở hộp xác nhận → dùng đúng UX 409 chung.
      message.error(
        getErrorCode(err) === 'CONFLICT'
          ? 'Biên bản vừa được người khác cập nhật — tải lại rồi thử lại.'
          : getErrorMessage(err),
      );
      invalidate();
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <div className={styles.panel}>
      {renderRow(HANDOVER_TYPE.PICKUP, context.pickup ?? null, context.canStartPickup)}
      <Divider className={styles.panelDivider} />
      {renderRow(HANDOVER_TYPE.RETURN, context.return ?? null, context.canStartReturn)}

      {dialog?.kind === 'form' && active ? (
        <HandoverDialog
          open
          type={dialog.type}
          context={context}
          handover={active}
          canManage={canManage}
          canConfirm={canConfirm}
          canViewFiles={canViewFiles}
          onClose={() => setDialog(null)}
          onChanged={invalidate}
          onDirtyChange={onDirtyChange}
        />
      ) : null}

      <ResponsiveDialog
        open={cancelling !== null}
        title="Huỷ biên bản bàn giao?"
        size="sm"
        confirmLoading={cancelBusy}
        onClose={() => setCancelling(null)}
        onOk={() => void runCancel()}
        okText="Huỷ biên bản"
        cancelText="Giữ lại"
        destructive
      >
        Toàn bộ dữ liệu và ảnh đã nhập trong biên bản này sẽ bị bỏ. Khi đơn còn hợp lệ, bạn vẫn
        lập lại được từ đầu.
      </ResponsiveDialog>

      {dialog?.kind === 'odometer' && active ? (
        <ResolveOdometerDialog
          open
          type={dialog.type}
          context={context}
          handover={active}
          onClose={() => setDialog(null)}
          onSaved={invalidate}
        />
      ) : null}
    </div>
  );

  function renderRow(type: HandoverType, handover: Handover | null, eligible: boolean) {
    const label = HANDOVER_TYPE_LABEL[type];
    const confirmed = handover?.status === HANDOVER_STATUS.CONFIRMED;

    return (
      <section className={styles.panelRow} aria-label={label}>
        <div className={styles.panelHead}>
          <span className={styles.panelTitle}>{label}</span>
          {handover ? (
            <StatusTag value={handover.status as HandoverStatus} meta={HANDOVER_STATUS_META} group="handoverStatus" />
          ) : (
            <span className={styles.panelMuted}>Chưa thực hiện</span>
          )}
        </div>

        {handover ? (
          <dl className={styles.panelFacts}>
            <div className={styles.panelFact}>
              <dt>Chỉ số KM</dt>
              <dd>{fmt.km(handover.odometerKm)}</dd>
            </div>
            <div className={styles.panelFact}>
              <dt>{handover.batteryPercent != null ? 'Mức pin' : 'Nhiên liệu'}</dt>
              <dd>
                {handover.batteryPercent != null
                  ? `${handover.batteryPercent}%`
                  : handover.fuelLevel
                    ? FUEL_LEVEL_LABEL[handover.fuelLevel as FuelLevel]
                    : tCommon('labels.notAvailable')}
              </dd>
            </div>
            <div className={styles.panelFact}>
              <dt>Ảnh hiện trạng</dt>
              <dd>{handover.photos.length} ảnh</dd>
            </div>
            {confirmed ? (
              <div className={styles.panelFact}>
                <dt>Xác nhận</dt>
                <dd>
                  {fmt.dateTime(handover.confirmedAt)}
                  {handover.confirmedByName ? ` · ${handover.confirmedByName}` : ''}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {handover?.odometerMissing ? (
          <Alert
            type="warning"
            showIcon
            role="alert"
            className={styles.inlineAlert}
            message="Thiếu KM trả"
            description="Biên bản đã chốt nhưng chưa có chỉ số KM, nên KM của xe chưa được cập nhật từ chuyến này."
            action={
              canFixOdometer ? (
                <Button size="small" onClick={() => setDialog({ kind: 'odometer', type })}>
                  Bổ sung KM
                </Button>
              ) : null
            }
          />
        ) : null}

        <Space wrap className={styles.panelActions}>
          {handover ? (
            <Button
              className={styles.panelButton}
              type={confirmed ? 'default' : 'primary'}
              onClick={() => setDialog({ kind: 'form', type })}
            >
              {confirmed ? 'Xem biên bản' : canManage ? 'Tiếp tục nhập' : 'Xem biên bản'}
            </Button>
          ) : canManage && eligible ? (
            <Button
              className={styles.panelButton}
              type="primary"
              loading={starting === type}
              onClick={() => void start(type)}
            >
              Bắt đầu {label.toLowerCase()}
            </Button>
          ) : (
            <span className={styles.panelMuted}>
              {canManage
                ? `Đơn đang ở trạng thái "${bookingStatus}" nên chưa mở được bước này.`
                : 'Bạn không có quyền lập biên bản bàn giao.'}
            </span>
          )}
          {confirmed && canFixOdometer && !handover?.odometerMissing ? (
            <Button
              className={styles.panelButton}
              type="link"
              onClick={() => setDialog({ kind: 'odometer', type })}
            >
              Điều chỉnh KM
            </Button>
          ) : null}
          {/* Chỉ nháp/sẵn sàng mới huỷ được — biên bản đã xác nhận là bằng chứng, không phải nháp. */}
          {handover && !confirmed && canManage ? (
            <Button
              className={styles.panelButton}
              type="text"
              danger
              onClick={() => setCancelling(type)}
            >
              Huỷ biên bản
            </Button>
          ) : null}
        </Space>
      </section>
    );
  }
}
