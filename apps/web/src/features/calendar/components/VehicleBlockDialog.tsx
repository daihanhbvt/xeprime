'use client';

import { Alert, App, Button, Form, Input, Select } from 'antd';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  API_ERROR_CODE,
  VEHICLE_BLOCK_REASON,
  VEHICLE_BLOCK_REASON_META,
  VEHICLE_BLOCK_REASON_VALUES,
  type VehicleBlockReason,
} from '@xeprime/types';
import {
  RentalDateTimeRangeField,
  type RentalMode,
} from '@/components/form/RentalDateTimeRangeField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
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

const REASON_OPTIONS = VEHICLE_BLOCK_REASON_VALUES.map((value) => ({
  value,
  label: VEHICLE_BLOCK_REASON_META[value].label,
}));

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
  return (
    <ResponsiveDialog
      open={state !== null}
      onClose={onClose}
      size="md"
      mobileMode="fullscreen"
      footer={null}
      title={state?.mode === 'edit' ? 'Sửa lịch khoá xe' : 'Khóa xe'}
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
      setRangeError('Chọn khoảng thời gian khoá');
      return;
    }
    if (!range.returnAt.isAfter(range.pickupAt)) {
      setRangeError('Thời điểm kết thúc phải sau thời điểm bắt đầu');
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
      message.success(editing ? 'Đã cập nhật lịch khoá' : 'Đã khoá xe');
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
          message="Xe đã bận trong khoảng này"
          description="Đổi thời gian, hoặc xử lý đơn/lịch đang chiếm chỗ trước."
        />
      ) : previewConflict ? (
        <Alert
          type="warning"
          showIcon
          className={styles.alert}
          message="Xe có thể đã bận khoảng này"
          description="Cảnh báo sớm — hệ thống vẫn kiểm tra lại khi lưu."
        />
      ) : null}

      <Form.Item label="Xe">
        <Input value={vehicleName} disabled />
      </Form.Item>

      <Form.Item
        label="Thời gian khoá"
        required
        validateStatus={rangeError ? 'error' : ''}
        help={rangeError}
      >
        <RentalDateTimeRangeField
          value={range}
          onChange={setRange}
          mode={mode}
          onModeChange={setMode}
          labels={{ start: 'Bắt đầu', end: 'Kết thúc' }}
          variant="labelled"
          ariaLabel="Thời gian khoá xe"
        />
      </Form.Item>

      <Form.Item label="Lý do" required>
        <Select<VehicleBlockReason>
          value={reason}
          onChange={setReason}
          options={REASON_OPTIONS}
          aria-label="Lý do khoá xe"
        />
      </Form.Item>

      <Form.Item label="Ghi chú">
        <Input.TextArea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Bảo dưỡng, sửa chữa, không cho thuê…"
        />
      </Form.Item>

      <div className={styles.actions}>
        <Button onClick={onClose} disabled={pending}>
          Huỷ
        </Button>
        <Button type="primary" htmlType="submit" loading={pending}>
          {editing ? 'Lưu thay đổi' : 'Khoá xe'}
        </Button>
      </div>
    </Form>
  );
}
