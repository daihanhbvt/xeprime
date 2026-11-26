'use client';

import { Alert, App, Button, Form, Input, Select } from 'antd';
import { DialogHeading } from '@/components/overlay/DialogHeading';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  RENTAL_MODE,
  API_ERROR_CODE,
  VEHICLE_BLOCK_REASON,
  VEHICLE_BLOCK_REASON_VALUES,
  type VehicleBlockReason,
} from '@xeprime/types';
import {
  RentalDateTimeRangeField,
  type RentalMode,
} from '@/components/form/RentalDateTimeRangeField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { checkConflict } from '@/features/bookings/api';
import { APP_TIME_ZONE, appWallClockToIso, dayjs, toAppTz } from '@/lib/datetime';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import type { Dayjs } from '@/lib/datetime';
import { useCreateVehicleBlock, useUpdateVehicleBlock } from '../hooks/use-calendar-mutations';
import type { VehicleBlock } from '../types/calendar.types';
import { CalendarVehicleSummary, type CalendarVehicleInfo } from './CalendarVehicleSummary';
import styles from './VehicleBlockDialog.module.css';

/**
 * Tạo mới từ ô lịch (biết xe + khoảng NGÀY đã chọn — một ô hoặc kéo nhiều ô) hoặc sửa một block
 * đang có. `vehicle` là hàng xe của lưới để dựng thẻ xe đầu hộp; vắng (mở từ nơi khác) thì thẻ
 * chỉ có tên + biển số.
 */
export type VehicleBlockDialogState =
  | {
      mode: 'create';
      vehicleId: string;
      vehicleName: string;
      date: string;
      /** Ngày CUỐI của khoảng chọn (tính cả). Vắng = đúng một ngày `date`. */
      endDate?: string;
      vehicle?: CalendarVehicleInfo;
    }
  | { mode: 'edit'; block: VehicleBlock; vehicle?: CalendarVehicleInfo }
  | null;

/**
 * Khoá xe — nghiệp vụ THẬT: block + occupancy ghi cùng transaction ở backend (ADR 0006).
 * Preview trùng lịch chỉ là cảnh báo sớm; chốt chặn là exclusion constraint (409 khi lưu).
 *
 * Mặc định khoá TRỌN các ngày đã chọn (00:00 ngày đầu → 00:00 sau ngày cuối, giờ VN) — người
 * dùng chỉnh lại tới từng GIỜ bằng cùng control chọn khoảng thuê của toàn hệ thống (giữ chọn giờ
 * dù design chỉ vẽ ngày — người dùng chốt 25/11/2026).
 */
export function VehicleBlockDialog({
  state,
  onClose,
}: {
  state: VehicleBlockDialogState;
  onClose: () => void;
}) {
  const t = useTranslations('Calendar');
  return (
    <ResponsiveDialog
      open={state !== null}
      onClose={onClose}
      size="md"
      mobileMode="fullscreen"
      footer={null}
      title={
        <DialogHeading
          title={t(state?.mode === 'edit' ? 'block.editTitle' : 'block.createTitle')}
          hint={t('block.subtitle')}
        />
      }
    >
      {state ? (
        <BlockForm
          key={
            state.mode === 'edit'
              ? state.block.id
              : `${state.vehicleId}-${state.date}-${state.endDate ?? state.date}`
          }
          state={state}
          onClose={onClose}
        />
      ) : null}
    </ResponsiveDialog>
  );
}

function BlockForm({
  state,
  onClose,
}: {
  state: NonNullable<VehicleBlockDialogState>;
  onClose: () => void;
}) {
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const { message } = App.useApp();
  const editing = state.mode === 'edit' ? state.block : null;
  const vehicleId = editing ? editing.vehicleId : state.mode === 'create' ? state.vehicleId : '';
  const vehicleName = editing
    ? editing.vehiclePlate
      ? `${editing.vehicleName} · ${editing.vehiclePlate}`
      : editing.vehicleName
    : state.mode === 'create'
      ? state.vehicleName
      : '';

  const [range, setRange] = useState<{ pickupAt: Dayjs | null; returnAt: Dayjs | null }>(() => {
    // Mốc UTC đang lưu → giờ VIỆT NAM cho hộp chọn khoảng (CLAUDE.md §9).
    if (editing) return { pickupAt: toAppTz(editing.startAt), returnAt: toAppTz(editing.endAt) };
    const first = state.mode === 'create' ? state.date : '';
    const last = state.mode === 'create' ? (state.endDate ?? state.date) : '';
    return {
      pickupAt: dayjs.tz(first, APP_TIME_ZONE).startOf('day'),
      returnAt: dayjs.tz(last, APP_TIME_ZONE).startOf('day').add(1, 'day'),
    };
  });
  const [mode, setMode] = useState<RentalMode>(RENTAL_MODE.DAILY);
  const [reason, setReason] = useState<VehicleBlockReason>(
    (editing?.reason as VehicleBlockReason | undefined) ??
      VEHICLE_BLOCK_REASON.UNPLANNED_MAINTENANCE,
  );
  const [note, setNote] = useState(editing?.note ?? '');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  const create = useCreateVehicleBlock();
  const update = useUpdateVehicleBlock();
  const pending = create.isPending || update.isPending;

  const canCheck = Boolean(
    range.pickupAt && range.returnAt && range.returnAt.isAfter(range.pickupAt),
  );
  // Preview trùng lịch (ADR 0006: chỉ cảnh báo sớm, KHÔNG chặn lưu). Khi sửa, bỏ qua chính block.
  const preview = useQuery({
    queryKey: [
      'check-conflict',
      vehicleId,
      range.pickupAt ? appWallClockToIso(range.pickupAt) : null,
      range.returnAt ? appWallClockToIso(range.returnAt) : null,
      editing?.id ?? null,
    ],
    queryFn: () =>
      checkConflict({
        vehicleId,
        startAt: appWallClockToIso(range.pickupAt!),
        endAt: appWallClockToIso(range.returnAt!),
        ...(editing ? { excludeSourceId: editing.id } : {}),
      }),
    enabled: canCheck,
    staleTime: 10_000,
  });
  const previewConflict = canCheck && preview.data?.hasConflict === true;

  function save() {
    setConflict(false);
    if (!range.pickupAt || !range.returnAt) {
      setRangeError(t('block.errors.rangeRequired'));
      return;
    }
    if (!range.returnAt.isAfter(range.pickupAt)) {
      setRangeError(t('block.errors.rangeOrder'));
      return;
    }
    setRangeError(null);

    const onError = (error: unknown) => {
      if (getErrorCode(error) === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT) {
        setConflict(true);
      } else {
        message.error(getErrorMessage(error));
      }
    };
    const onSuccess = () => {
      message.success(t(editing ? 'block.updated' : 'block.created'));
      onClose();
    };

    const body = {
      // CÙNG phép quy đổi với preview ngay trên — hai lần hỏi server phải nói về đúng một
      // khoảng, nếu không thì cảnh báo "sạch" rồi lưu vẫn dính exclusion constraint.
      startAt: appWallClockToIso(range.pickupAt),
      endAt: appWallClockToIso(range.returnAt),
      reason,
      note: note.trim() || undefined,
    };
    if (editing) {
      update.mutate(
        { id: editing.id, body: { ...body, expectedRowVersion: editing.rowVersion } },
        { onSuccess, onError },
      );
    } else {
      create.mutate({ vehicleId, ...body }, { onSuccess, onError });
    }
  }

  return (
    <Form layout="vertical" onFinish={save}>
      {conflict ? (
        <Alert
          type="error"
          showIcon
          className={styles.alert}
          title={t('block.conflictTitle')}
          description={t('block.conflictDescription')}
        />
      ) : previewConflict ? (
        <Alert
          type="warning"
          showIcon
          className={styles.alert}
          title={t('block.previewConflictTitle')}
          description={t('block.previewConflictDescription')}
        />
      ) : null}

      <CalendarVehicleSummary
        vehicle={
          state.vehicle ?? {
            name: editing ? editing.vehicleName : vehicleName,
            plateNumber: editing ? (editing.vehiclePlate ?? null) : null,
            imageUrl: null,
            weekdayPrice: null,
            hourlyPrice: null,
          }
        }
      />

      <Form.Item
        label={t('block.period')}
        required
        validateStatus={rangeError ? 'error' : ''}
        help={rangeError}
      >
        <RentalDateTimeRangeField
          value={range}
          onChange={setRange}
          mode={mode}
          onModeChange={setMode}
          labels={{ start: t('block.periodStart'), end: t('block.periodEnd') }}
          variant="labelled"
          ariaLabel={t('block.periodAriaLabel')}
        />
      </Form.Item>

      <Form.Item label={t('block.reason')} required>
        <Select<VehicleBlockReason>
          value={reason}
          onChange={setReason}
          options={VEHICLE_BLOCK_REASON_VALUES.map((value) => ({
            value,
            label: domainLabel('vehicleBlockReason', value),
          }))}
          aria-label={t('block.reasonAriaLabel')}
        />
      </Form.Item>

      <Form.Item label={t('block.note')}>
        <Input.TextArea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={t('block.notePlaceholder')}
        />
      </Form.Item>

      <div className={styles.footer}>
        <div className={styles.footerEnd}>
          <Button onClick={onClose} disabled={pending}>
            {tCommon('actions.cancel')}
          </Button>
          {/* Khoá là NGỪNG nhận đặt — nút đỏ như design; sửa một lịch khoá thì là nút chính thường. */}
          <Button type="primary" danger={!editing} htmlType="submit" loading={pending}>
            {t(editing ? 'block.submitEdit' : 'block.submitCreate')}
          </Button>
        </div>
      </div>
    </Form>
  );
}
