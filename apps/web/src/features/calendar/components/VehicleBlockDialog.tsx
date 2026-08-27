'use client';

import { Alert, App, Button, Form, Input, Select } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
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
import { APP_TIME_ZONE, dayjs } from '@/lib/datetime';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import type { Dayjs } from 'dayjs';
import { useCreateVehicleBlock, useUpdateVehicleBlock } from '../hooks/use-calendar-mutations';
import type { VehicleBlock } from '../types/calendar.types';
import styles from './VehicleBlockDialog.module.css';

/** Tạo mới từ ô lịch (biết xe + ngày) hoặc sửa một block đang có. */
export type VehicleBlockDialogState =
  | { mode: 'create'; vehicleId: string; vehicleName: string; date: string }
  | { mode: 'edit'; block: VehicleBlock }
  | null;

/**
 * Khoá xe — nghiệp vụ THẬT: block + occupancy ghi cùng transaction ở backend (ADR 0006).
 * Preview trùng lịch chỉ là cảnh báo sớm; chốt chặn là exclusion constraint (409 khi lưu).
 *
 * Mặc định khoá TRỌN NGÀY được bấm (00:00 → 00:00 hôm sau, giờ VN) — người dùng chỉnh lại
 * bằng cùng control chọn khoảng thuê của toàn hệ thống.
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
      title={t(state?.mode === 'edit' ? 'block.editTitle' : 'block.createTitle')}
    >
      {state ? (
        <BlockForm
          key={state.mode === 'edit' ? state.block.id : `${state.vehicleId}-${state.date}`}
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
    if (editing) return { pickupAt: dayjs(editing.startAt), returnAt: dayjs(editing.endAt) };
    const dayStart = dayjs
      .tz(state.mode === 'create' ? state.date : '', APP_TIME_ZONE)
      .startOf('day');
    return { pickupAt: dayStart, returnAt: dayStart.add(1, 'day') };
  });
  const [mode, setMode] = useState<RentalMode>('daily');
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
      range.pickupAt?.toISOString(),
      range.returnAt?.toISOString(),
      editing?.id ?? null,
    ],
    queryFn: () =>
      checkConflict({
        vehicleId,
        startAt: range.pickupAt!.toISOString(),
        endAt: range.returnAt!.toISOString(),
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
      startAt: range.pickupAt.toISOString(),
      endAt: range.returnAt.toISOString(),
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
          message={t('block.conflictTitle')}
          description={t('block.conflictDescription')}
        />
      ) : previewConflict ? (
        <Alert
          type="warning"
          showIcon
          className={styles.alert}
          message={t('block.previewConflictTitle')}
          description={t('block.previewConflictDescription')}
        />
      ) : null}

      <Form.Item label={t('block.vehicle')}>
        <Input value={vehicleName} disabled />
      </Form.Item>

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

      <div className={styles.actions}>
        <Button onClick={onClose} disabled={pending}>
          {tCommon('actions.cancel')}
        </Button>
        <Button type="primary" htmlType="submit" loading={pending}>
          {t(editing ? 'block.submitEdit' : 'block.submitCreate')}
        </Button>
      </div>
    </Form>
  );
}
