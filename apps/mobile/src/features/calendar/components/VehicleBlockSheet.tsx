import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  VEHICLE_BLOCK_REASON,
  VEHICLE_BLOCK_REASON_VALUES,
  type VehicleBlockReason,
} from '@xeprime/types';
import {
  appWallClockToIso,
  startOfAppDay,
  toAppTz,
  type Dayjs,
  type RentalMode,
} from '@xeprime/domain';
import { getErrorCode } from '@xeprime/api-client';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { DataRow } from '@/components/ui/DataRow';
import { RangeFieldBox } from '@/components/ui/RangeFieldBox';
import { SelectControl } from '@/components/ui/SelectControl';
import { TextControl } from '@/components/ui/TextControl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { bookingsApi } from '@/features/bookings/api';
import { RentalRangeSheet } from '@/features/marketplace/components/RentalRangeSheet';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import type { VehicleBlock } from '../api';
import { useCreateVehicleBlock, useUpdateVehicleBlock } from '../hooks/use-calendar-mutations';

/** Ghi chú tối đa — khớp `@MaxLength(2000)` của `CreateVehicleBlockDto`. */
const NOTE_MAX = 2000;

/** Tạo mới từ ô lịch (biết xe + ngày) hoặc sửa một khoá đang có. */
export type VehicleBlockSheetState =
  | { mode: 'create'; vehicleId: string; vehicleName: string; date: string }
  | { mode: 'edit'; block: VehicleBlock }
  | null;

/**
 * Khoá xe (CAL-02) — bản native của `VehicleBlockDialog`.
 *
 * Nghiệp vụ THẬT: block + occupancy ghi cùng một transaction ở backend (ADR 0006). Preview trùng
 * lịch chỉ là cảnh báo sớm; chốt chặn là exclusion constraint, và nó trả 409 lúc lưu.
 *
 * Mặc định khoá TRỌN NGÀY được chạm (00:00 → 00:00 hôm sau, giờ VN) — người dùng chỉnh lại bằng
 * cùng control chọn khoảng thuê của toàn hệ thống.
 *
 * `key` theo đối tượng đang mở: state form không được dính lại từ lần mở trước.
 */
export function VehicleBlockSheet({
  state,
  onClose,
}: {
  state: VehicleBlockSheetState;
  onClose: () => void;
}) {
  /*
   * Đóng thì KHÔNG dựng form — không phải để tiết kiệm, mà vì form không có gì để dựng: bộ khởi
   * tạo state của nó đọc `state.date`, và với `state === null` thì đó là một ngày rỗng. Web giữ
   * đúng ranh giới này (`{state ? <BlockForm/> : null}`).
   */
  if (state === null) return null;

  const key = state.mode === 'edit' ? state.block.id : `${state.vehicleId}-${state.date}`;
  return <BlockForm key={key} state={state} onClose={onClose} />;
}

function BlockForm({
  state,
  onClose,
}: {
  state: NonNullable<VehicleBlockSheetState>;
  onClose: () => void;
}) {
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const editing = state.mode === 'edit' ? state.block : null;
  /*
   * Đọc XE qua chính `state.mode`, không qua biến `editing`.
   *
   * TypeScript không thu hẹp được union từ một biến dẫn xuất, nên `editing ? … : state.vehicleId`
   * làm nhánh else vẫn mang cả hình dạng 'edit' — thứ không có `vehicleId`.
   */
  const { vehicleId, vehicleName } =
    state.mode === 'edit'
      ? {
          vehicleId: state.block.vehicleId,
          vehicleName: state.block.vehiclePlate
            ? `${state.block.vehicleName} · ${state.block.vehiclePlate}`
            : state.block.vehicleName,
        }
      : { vehicleId: state.vehicleId, vehicleName: state.vehicleName };

  const [range, setRange] = useState<{ pickupAt: Dayjs | null; returnAt: Dayjs | null }>(() => {
    // Mốc UTC đang lưu → giờ VIỆT NAM cho hộp chọn khoảng (CLAUDE.md mục 9).
    if (editing) return { pickupAt: toAppTz(editing.startAt), returnAt: toAppTz(editing.endAt) };
    const dayStart = startOfAppDay(state.mode === 'create' ? state.date : '');
    return { pickupAt: dayStart, returnAt: dayStart.add(1, 'day') };
  });
  const [rentalMode, setRentalMode] = useState<RentalMode>('daily');
  const [picking, setPicking] = useState(false);
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
    vehicleId && range.pickupAt && range.returnAt && range.returnAt.isAfter(range.pickupAt),
  );

  /*
   * Preview trùng lịch (ADR 0006: chỉ cảnh báo sớm, KHÔNG chặn lưu). Khi sửa thì bỏ qua chính
   * khoá đang sửa, nếu không nó tự báo trùng với bản thân nó.
   *
   * `queryKey` mang ĐÚNG hai mốc đã quy đổi — cùng phép quy đổi với lúc gửi đi. Hai chỗ khác
   * nhau thì cảnh báo "sạch" rồi lưu vẫn dính exclusion constraint.
   */
  const startIso = range.pickupAt ? appWallClockToIso(range.pickupAt) : null;
  const endIso = range.returnAt ? appWallClockToIso(range.returnAt) : null;

  const preview = useQuery({
    queryKey: ['calendar', 'check-conflict', vehicleId, startIso, endIso, editing?.id ?? null],
    queryFn: () =>
      bookingsApi.checkConflict({
        vehicleId,
        startAt: startIso as string,
        endAt: endIso as string,
        ...(editing ? { excludeSourceId: editing.id } : {}),
      }),
    enabled: canCheck,
    staleTime: 10_000,
  });
  const previewConflict = canCheck && preview.data?.hasConflict === true;

  const reasonOptions = useMemo(
    () =>
      VEHICLE_BLOCK_REASON_VALUES.map((value) => ({
        value,
        label: domainLabel('vehicleBlockReason', value),
      })),
    [domainLabel],
  );

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
      // 409 trùng lịch là câu trả lời NGHIỆP VỤ, không phải sự cố — nói tại chỗ, không bằng toast
      // đỏ chung chung, và giữ nguyên form để người dùng đổi giờ ngay.
      if (getErrorCode(error) === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT) setConflict(true);
      else toast.showError(errorMessage(error));
    };
    const onSuccess = () => {
      toast.showSuccess(t(editing ? 'block.updated' : 'block.created'));
      onClose();
    };

    const body = {
      startAt: appWallClockToIso(range.pickupAt),
      endAt: appWallClockToIso(range.returnAt),
      reason,
      ...(note.trim() ? { note: note.trim() } : {}),
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
    <>
      <BottomSheet
        open
        onClose={onClose}
        title={t(editing ? 'block.editTitle' : 'block.createTitle')}
        footer={
          <>
            <Button
              label={t(editing ? 'block.submitEdit' : 'block.submitCreate')}
              icon={editing ? 'save-outline' : 'lock-closed-outline'}
              onPress={save}
              loading={pending}
            />
            <Button
              label={tCommon('cancel')}
              icon="close-outline"
              variant="secondary"
              onPress={onClose}
              disabled={pending}
            />
          </>
        }
      >
        {conflict ? (
          <Callout tone="danger" title={t('block.conflictTitle')}>
            {t('block.conflictDescription')}
          </Callout>
        ) : previewConflict ? (
          <Callout tone="warning" title={t('block.previewConflictTitle')}>
            {t('block.previewConflictDescription')}
          </Callout>
        ) : null}

        <YStack gap={space.md}>
          {/* Xe là dữ kiện ĐÃ CHỐT, không phải ô nhập: một block không "chuyển xe" được — muốn
              đổi xe thì gỡ và tạo lại, đúng như `CreateVehicleBlockDto` (chỉ CREATE có vehicleId). */}
          <DataRow label={t('block.vehicle')} value={vehicleName} />

          <RangeFieldBox
            label={t('block.period')}
            required
            startValue={range.pickupAt ? fmt.rentalPoint(range.pickupAt, { withTime: true }) : ''}
            endValue={range.returnAt ? fmt.rentalPoint(range.returnAt, { withTime: true }) : ''}
            {...(rangeError ? { error: rangeError } : {})}
            onPress={() => setPicking(true)}
          />

          <SelectControl
            label={t('block.reason')}
            required
            value={reason}
            options={reasonOptions}
            onChange={(next) => setReason(next as VehicleBlockReason)}
          />

          <TextControl
            label={t('block.note')}
            value={note}
            onChangeText={setNote}
            placeholder={t('block.notePlaceholder')}
            multiline
            rows={3}
            maxLength={NOTE_MAX}
          />
        </YStack>
      </BottomSheet>

      <RentalRangeSheet
        open={picking}
        value={range}
        mode={rentalMode}
        onChange={setRange}
        onModeChange={setRentalMode}
        onApply={() => setPicking(false)}
        onCancel={() => setPicking(false)}
      />
    </>
  );
}
