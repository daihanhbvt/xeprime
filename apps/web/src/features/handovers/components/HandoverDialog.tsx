'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Form, Space } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  FUEL_LEVEL_LABEL, FUEL_LEVEL_VALUES, HANDOVER_ENERGY_KIND, HANDOVER_STATUS, HANDOVER_TYPE, HANDOVER_TYPE_LABEL, fuelLevelDropQuarters, type FuelLevel, type HandoverType, } from '@xeprime/types';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useIsMobile } from '@/hooks/use-media-query';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import type { ApiClientError } from '@/services/api-client';
import { confirmHandover, saveHandoverDraft } from '../api';
import { handoverFormSchema, type HandoverFormValues } from '../schema';
import type {
  Handover,
  HandoverBelowPickupDetails,
  HandoverContext,
  HandoverSuspicionDetails,
} from '../types';
import { HandoverPhotoGrid } from './HandoverPhotoGrid';
import styles from './Handover.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useTranslations } from 'next-intl';

const FUEL_OPTIONS = FUEL_LEVEL_VALUES.map((value) => ({
  value,
  label: FUEL_LEVEL_LABEL[value as FuelLevel],
}));

/** Ba bước của luồng mobile — thiết kế yêu cầu một hàng ngang, cuộn được, KHÔNG xuống dòng. */
const STEPS = ['Odo & Nhiên liệu', 'Ngoại quan & Ảnh', 'Xác nhận'] as const;

/**
 * Biên bản bàn giao — nhập, xác nhận, và xem lại khi đã chốt.
 *
 * Desktop dùng modal của `ResponsiveDialog`; mobile là màn toàn trang chia 3 bước (bàn phím ảo
 * che mất form nếu dùng bottom sheet — quy tắc 5 của `ResponsiveDialog`).
 *
 * Xác nhận LUÔN lưu nháp trước rồi mới gọi confirm: số vừa gõ phải nằm trên server trước khi
 * server đối soát nó, và `rowVersion` trả về từ lần lưu chính là bằng chứng "tôi đang xác nhận
 * đúng bản mình vừa nhìn".
 */
export function HandoverDialog({
  open,
  type,
  context,
  handover,
  canManage,
  canConfirm,
  canViewFiles,
  onClose,
  onChanged,
  onDirtyChange,
}: {
  open: boolean;
  type: HandoverType;
  context: HandoverContext;
  handover: Handover;
  canManage: boolean;
  canConfirm: boolean;
  canViewFiles: boolean;
  onClose: () => void;
  onChanged: () => void;
  /**
   * Báo lên cha là form đang có thay đổi chưa lưu. Cần vì drawer chi tiết đơn (cấp trên) cũng
   * đóng được bằng Esc/nền — nếu nó đóng thì hộp thoại này biến mất kèm dữ liệu, nên chính nó
   * phải hỏi trước.
   */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();

  const { message } = App.useApp();
  const isMobile = useIsMobile();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [suspicion, setSuspicion] = useState<HandoverSuspicionDetails | null>(null);
  const [missingKm, setMissingKm] = useState(false);
  const [missingSlots, setMissingSlots] = useState<string[] | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  // Đã xác nhận là chỉ đọc; `ready` VẪN sửa được — nó chỉ là lời nhắn "tôi nhập xong rồi".
  const isConfirmed = handover.status === HANDOVER_STATUS.CONFIRMED;
  const readOnly = !canManage || isConfirmed;
  const isReturn = type === HANDOVER_TYPE.RETURN;
  const isBattery = context.energyKind === HANDOVER_ENERGY_KIND.BATTERY;

  const defaults = useMemo<HandoverFormValues>(
    () => ({
      odometerKm: handover.odometerKm ?? null,
      fuelLevel: handover.fuelLevel ?? '',
      batteryPercent: handover.batteryPercent ?? null,
      conditionNote: handover.conditionNote ?? '',
      damageNote: handover.damageNote ?? '',
      notes: handover.notes ?? '',
    }),
    [handover],
  );

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { isDirty },
  } = useForm<HandoverFormValues>({
    resolver: yupResolver(handoverFormSchema),
    defaultValues: defaults,
    values: defaults,
  });
  const odometerKm = useWatch({ control, name: 'odometerKm' });
  const fuelLevel = useWatch({ control, name: 'fuelLevel' });
  const batteryPercent = useWatch({ control, name: 'batteryPercent' });

  // Đẩy trạng thái "chưa lưu" lên cha để drawer đơn không đóng mất dữ liệu đang gõ.
  useEffect(() => {
    onDirtyChange?.(isDirty && !readOnly);
  }, [isDirty, readOnly, onDirtyChange]);

  const pickupKm = context.pickupOdometerKm;
  const deltaKm = isReturn && odometerKm != null && pickupKm != null ? odometerKm - pickupKm : null;
  const pickupFuel = context.pickup?.fuelLevel as FuelLevel | null | undefined;
  const fuelDrop = isReturn
    ? fuelLevelDropQuarters(pickupFuel ?? null, (fuelLevel || null) as FuelLevel | null)
    : null;

  /** Dọn mọi cảnh báo của lần gửi trước — mỗi lần bấm là một lần đối soát mới. */
  function clearWarnings() {
    setSuspicion(null);
    setMissingKm(false);
    setMissingSlots(null);
  }

  /** Đóng thật sự — dọn sạch trạng thái cục bộ. Chỉ gọi khi đã chắc không mất dữ liệu. */
  function closeNow() {
    clearWarnings();
    setDiscardOpen(false);
    setStep(0);
    reset(defaults);
    onDirtyChange?.(false);
    onClose();
  }

  /**
   * Mọi đường đóng (nút X, Huỷ, Esc, bấm nền, nút quay lại trên mobile) đi qua đây.
   * Form còn thay đổi chưa lưu thì hỏi trước — biên bản bàn giao là dữ liệu gõ tay ở quầy,
   * mất là phải đi đọc lại đồng hồ và chụp lại ảnh.
   */
  function requestClose() {
    if (isDirty && !readOnly) {
      setDiscardOpen(true);
      return;
    }
    closeNow();
  }

  function payloadOf(values: HandoverFormValues, markReady?: boolean) {
    const text = (value: string) => (value.trim() ? value.trim() : null);
    return {
      odometerKm: values.odometerKm,
      // Chỉ gửi trường năng lượng ĐÚNG với loại xe — backend từ chối trường còn lại.
      ...(isBattery
        ? { batteryPercent: values.batteryPercent }
        : { fuelLevel: values.fuelLevel || null }),
      conditionNote: text(values.conditionNote),
      ...(isReturn ? { damageNote: text(values.damageNote) } : {}),
      notes: text(values.notes),
      ...(markReady ? { markReady: true } : {}),
      expectedRowVersion: handover.rowVersion,
    };
  }

  async function saveDraft(
    values: HandoverFormValues,
    markReady?: boolean,
  ): Promise<Handover | null> {
    try {
      return await saveHandoverDraft(context.bookingId, type, payloadOf(values, markReady));
    } catch (err) {
      handleError(err);
      return null;
    }
  }

  async function onSaveDraft(values: HandoverFormValues, markReady = false) {
    setSaving(true);
    clearWarnings();
    const saved = await saveDraft(values, markReady);
    setSaving(false);
    if (saved) {
      // Lưu xong thì form KHÔNG còn "chưa lưu" nữa — đóng ngay sau đó không được hỏi lại.
      reset(values);
      onDirtyChange?.(false);
      message.success(
        markReady
          ? 'Đã đánh dấu sẵn sàng — người có quyền xác nhận sẽ chốt biên bản'
          : 'Đã lưu nháp bàn giao',
      );
      onChanged();
    }
  }

  async function onConfirm(
    values: HandoverFormValues,
    extra: { acknowledgeSuspicious?: boolean; allowMissingOdometer?: boolean } = {},
  ) {
    setSaving(true);
    clearWarnings();
    const saved = await saveDraft(values);
    if (!saved) {
      setSaving(false);
      return;
    }
    try {
      await confirmHandover(context.bookingId, type, {
        expectedRowVersion: saved.rowVersion,
        ...extra,
      });
      message.success(
        isReturn ? 'Đã xác nhận trả xe' : 'Đã xác nhận giao xe — đơn chuyển sang đang thuê',
      );
      // Xác nhận thành công là điểm không quay lại — không còn gì để cảnh báo "chưa lưu".
      reset(values);
      onChanged();
      closeNow();
    } catch (err) {
      handleError(err);
    } finally {
      setSaving(false);
    }
  }

  /** Mỗi mã lỗi có một lối đi tiếp riêng — không gộp tất cả vào một toast đỏ. */
  function handleError(err: unknown) {
    const code = getErrorCode(err);
    const details = (err as ApiClientError).details as Record<string, unknown> | undefined;

    if (code === 'HANDOVER_ODOMETER_BELOW_PICKUP') {
      const info = details as unknown as HandoverBelowPickupDetails;
      setError('odometerKm', {
        message: `KM nhận lại không được nhỏ hơn chỉ số KM lúc giao (${fmt.km(info?.pickupKm)}). Vui lòng đối soát lại.`,
      });
      if (isMobile) setStep(0);
      return;
    }
    if (code === 'HANDOVER_ODOMETER_SUSPICIOUS') {
      setSuspicion(details as unknown as HandoverSuspicionDetails);
      return;
    }
    if (code === 'VALIDATION_FAILED' && Array.isArray(details?.missingSlots)) {
      setMissingSlots(details.missingSlots as string[]);
      if (isMobile) setStep(1);
      return;
    }
    if (code === 'VALIDATION_FAILED' && hasField(details, 'odometerKm')) {
      // Chỉ chiều TRẢ mới có lối "đóng biên bản, bổ sung sau" — và chính server nói có hay
      // không, UI không tự suy. Giao xe thiếu KM là lỗi nhập liệu, đưa người dùng về ô KM.
      if (details?.allowMissingSupported === true) {
        setMissingKm(true);
        return;
      }
      setError('odometerKm', {
        message: 'Chỉ số KM lúc giao xe là bắt buộc — không thể xác nhận khi chưa có số.',
      });
      if (isMobile) setStep(0);
      return;
    }
    if (code === 'CONFLICT') {
      message.error('Biên bản vừa được người khác cập nhật — đóng và mở lại để xem bản mới nhất.');
      onChanged();
      return;
    }
    if (code === 'HANDOVER_NOT_ELIGIBLE') {
      // Đơn đã đi tiếp thì biên bản này không còn chỗ dùng — đóng thẳng, hỏi "bỏ thay đổi"
      // lúc này chỉ là hỏi một câu không còn lựa chọn nào.
      message.error('Đơn không còn ở trạng thái thực hiện được bước này — đang tải lại.');
      onChanged();
      closeNow();
      return;
    }
    if (code === 'ODOMETER_DECREASE_FORBIDDEN') {
      message.error('Chỉ số KM thấp hơn KM hiện tại của xe — kiểm tra lại số đọc.');
      return;
    }
    message.error(getErrorMessage(err));
  }

  const odometerHelp = isReturn
    ? pickupKm != null
      ? `Yêu cầu: KM nhận lại phải lớn hơn hoặc bằng KM lúc giao (${fmt.km(pickupKm)})`
      : 'Chưa có KM lúc giao để đối chiếu — biên bản giao xe chưa ghi số'
    : context.vehicleOdometerKm != null
      ? `KM hiện tại theo hệ thống: ${fmt.km(context.vehicleOdometerKm)}`
      : 'Xe chưa từng ghi nhận KM — số nhập ở đây sẽ là mốc đầu tiên';

  // ── Các khối nội dung (dùng chung desktop & mobile) ──────────────────────
  const summaryBlock = (
    <div className={styles.summaryBox}>
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Xe</span>
        <span className={styles.summaryValue}>
          {context.vehicleName}
          {context.plateNumber ? ` · ${context.plateNumber}` : ''}
        </span>
      </div>
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>{isReturn ? 'Mốc lúc giao' : 'Thời gian thuê'}</span>
        <span className={styles.summaryValue}>
          {isReturn
            ? `KM giao: ${fmt.km(pickupKm)}${pickupFuel ? ` · Nhiên liệu: ${FUEL_LEVEL_LABEL[pickupFuel]}` : ''}`
            : `${context.rentalDays} ngày`}
        </span>
      </div>
      {handover.confirmedAt ? (
        <div className={styles.summaryRow}>
          <span className={styles.summaryLabel}>Xác nhận</span>
          <span className={styles.summaryValue}>
            {fmt.dateTime(handover.confirmedAt)}
            {handover.confirmedByName ? ` · ${handover.confirmedByName}` : ''}
          </span>
        </div>
      ) : null}
    </div>
  );

  const odometerBlock = (
    <>
      <div className={styles.odometerRow}>
        <div className={styles.odometerField}>
          <NumberField
            control={control}
            name="odometerKm"
            label={isReturn ? 'Chỉ số Kilômét khi nhận lại' : 'Chỉ số Kilômét khi giao'}
            placeholder="45.230"
            addonAfter="km"
            min={0}
            required
            help={odometerHelp}
          />
        </div>
        {deltaKm !== null ? (
          <span
            className={deltaKm < 0 ? styles.deltaBad : styles.deltaGood}
            data-testid="handover-delta"
          >
            {deltaKm >= 0 ? '+' : ''}
            {fmt.km(deltaKm)}
          </span>
        ) : null}
      </div>

      {isBattery ? (
        <NumberField
          control={control}
          name="batteryPercent"
          label={isReturn ? 'Mức pin khi nhận lại' : 'Mức pin khi giao'}
          percent
          help={
            context.pickup?.batteryPercent != null && isReturn
              ? `Khi giao: ${context.pickup.batteryPercent}%`
              : undefined
          }
        />
      ) : (
        <SelectField
          control={control}
          name="fuelLevel"
          label={isReturn ? 'Mức nhiên liệu khi trả' : 'Mức nhiên liệu khi giao'}
          options={FUEL_OPTIONS}
          placeholder="Chọn mức nhiên liệu"
          allowClear
          disabled={readOnly}
          help={
            isReturn && pickupFuel ? `Khi giao: ${FUEL_LEVEL_LABEL[pickupFuel]}` : undefined
          }
        />
      )}
      {fuelDrop !== null && fuelDrop > 0 ? (
        <Alert
          type="warning"
          showIcon
          className={styles.inlineAlert}
          message={`Hao hụt ${fuelDrop}/4 bình so với lúc giao — cân nhắc phụ thu nhiên liệu ở bước thanh toán.`}
        />
      ) : null}
    </>
  );

  const conditionBlock = (
    <>
      <TextAreaField
        control={control}
        name="conditionNote"
        label={isReturn ? 'Tình trạng xe khi nhận lại' : 'Tình trạng ngoại nội thất & máy móc'}
        rows={3}
        maxLength={2000}
        placeholder="Mô tả tình trạng thực tế của xe…"
      />
      {isReturn ? (
        <TextAreaField
          control={control}
          name="damageNote"
          label="Hư hỏng / sự cố phát sinh (nếu có)"
          rows={2}
          maxLength={2000}
          placeholder="Ghi rõ vị trí và mức độ…"
        />
      ) : null}
      {missingSlots ? (
        <Alert
          type="error"
          showIcon
          role="alert"
          className={styles.inlineAlert}
          message="Thiếu ảnh hiện trạng bắt buộc"
          description="Vui lòng tải lên ít nhất ảnh Trước và Sau trước khi xác nhận."
        />
      ) : null}
      <HandoverPhotoGrid
        bookingId={context.bookingId}
        type={type}
        photos={handover.photos}
        canViewFiles={canViewFiles}
        disabled={readOnly}
        onChanged={onChanged}
      />
      <TextAreaField
        control={control}
        name="notes"
        label="Ghi chú thêm"
        rows={2}
        maxLength={2000}
        placeholder="Ghi chú nội bộ hoặc yêu cầu đặc biệt của khách hàng…"
      />
    </>
  );

  /**
   * Hệ quả THẬT của con số sắp ghi — nói trước khi bấm, không để người dùng đoán.
   * Thiếu dữ liệu để tính mốc bảo dưỡng thì nói "Chưa đủ dữ liệu", KHÔNG dựng số giả (§9).
   */
  const consequenceBlock =
    isReturn && odometerKm != null ? (
      <div className={styles.consequenceBox} data-testid="handover-consequence">
        <p className={styles.consequenceTitle}>Hệ quả xử lý hệ thống</p>
        <p className={styles.consequenceText}>
          Odo xe {context.vehicleName} sẽ cập nhật thành <strong>{fmt.km(odometerKm)}</strong>.
        </p>
        <p className={styles.consequenceText}>
          Mốc bảo dưỡng tiếp theo:{' '}
          {context.nextMaintenanceKm != null ? (
            <>
              <strong>{fmt.km(context.nextMaintenanceKm)}</strong> (
              {fmt.remainingKm(context.nextMaintenanceKm - odometerKm)})
            </>
          ) : (
            tCommon('labels.insufficientData')
          )}
        </p>
      </div>
    ) : null;

  /** Bước 3 trên mobile: đọc lại những gì sắp chốt trước khi bấm nút không quay lại được. */
  const reviewBlock = (
    <div className={styles.reviewBox}>
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>{isReturn ? 'KM nhận lại' : 'KM khi giao'}</span>
        <span className={styles.summaryValue}>{fmt.km(odometerKm)}</span>
      </div>
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>{isBattery ? 'Mức pin' : 'Nhiên liệu'}</span>
        <span className={styles.summaryValue}>
          {isBattery
            ? batteryPercent != null
              ? `${batteryPercent}%`
              : tCommon('labels.notAvailable')
            : fuelLevel
              ? FUEL_LEVEL_LABEL[fuelLevel as FuelLevel]
              : tCommon('labels.notAvailable')}
        </span>
      </div>
      <div className={styles.summaryRow}>
        <span className={styles.summaryLabel}>Hình ảnh hiện trạng</span>
        <span className={styles.summaryValue}>{handover.photos.length}/5 ảnh đã tải lên</span>
      </div>
    </div>
  );

  const warningBlock = (
    <>
      {suspicion ? (
        <Alert
          type="warning"
          showIcon
          role="alert"
          className={styles.inlineAlert}
          message="Nghi ngờ số KM không phản ánh thực tế"
          description={
            <div className={styles.warningBody}>
              <p className={styles.warningText}>
                Thuê {suspicion.rentalDays} ngày nhưng chỉ phát sinh {fmt.km(suspicion.deltaKm)}.
                Theo cấu hình gian hàng ({suspicion.thresholdKmPerDay} km/ngày) thì tối thiểu nên
                là {fmt.km(suspicion.expectedMinKm)}. Có thể đồng hồ công-tơ-mét bị ngắt hoặc số
                đọc sai.
              </p>
              <Space wrap>
                <Button
                  type="primary"
                  loading={saving}
                  onClick={() =>
                    void handleSubmit((values) =>
                      onConfirm(values, { acknowledgeSuspicious: true }),
                    )()
                  }
                >
                  Xác nhận vẫn đúng
                </Button>
                <Button onClick={() => setSuspicion(null)}>Kiểm tra lại số đọc</Button>
              </Space>
            </div>
          }
        />
      ) : null}

      {missingKm ? (
        <Alert
          type="warning"
          showIcon
          role="alert"
          className={styles.inlineAlert}
          message="Chưa có chỉ số KM"
          description={
            <div className={styles.warningBody}>
              <p className={styles.warningText}>
                Đóng biên bản mà không có KM sẽ tạo việc <strong>Thiếu KM trả</strong> để bổ sung
                sau. KM hiện tại của xe sẽ <strong>không</strong> bị thay đổi.
              </p>
              <Space wrap>
                <Button
                  loading={saving}
                  onClick={() =>
                    void handleSubmit((values) =>
                      onConfirm(values, { allowMissingOdometer: true }),
                    )()
                  }
                >
                  Đóng biên bản, bổ sung KM sau
                </Button>
                <Button type="primary" onClick={() => setMissingKm(false)}>
                  Nhập KM ngay
                </Button>
              </Space>
            </div>
          }
        />
      ) : null}
    </>
  );

  const confirmLabel = isReturn ? 'Xác nhận trả xe' : 'Xác nhận giao xe';
  /**
   * "Sẵn sàng xác nhận" chỉ có nghĩa khi người đang nhập KHÔNG tự chốt được: `handovers.manage`
   * và `handovers.confirm` là hai quyền tách bạch có chủ đích, và đây là cách người nhập bàn
   * giao việc cho người có thẩm quyền mà không cần một module duyệt riêng.
   */
  const showMarkReady = !canConfirm && handover.status === HANDOVER_STATUS.DRAFT;

  const saveDraftButton = (block?: boolean) => (
    <Button block={block} loading={saving} onClick={() => void handleSubmit((v) => onSaveDraft(v))()}>
      Lưu nháp
    </Button>
  );
  const markReadyButton = (block?: boolean) => (
    <Button
      block={block}
      type="primary"
      loading={saving}
      onClick={() => void handleSubmit((v) => onSaveDraft(v, true))()}
    >
      Sẵn sàng xác nhận
    </Button>
  );
  const confirmButton = (block?: boolean) => (
    <Button
      block={block}
      type="primary"
      loading={saving}
      onClick={() => void handleSubmit((values) => onConfirm(values))()}
    >
      {confirmLabel}
    </Button>
  );

  const footer = readOnly ? (
    <Button onClick={requestClose}>Đóng</Button>
  ) : isMobile ? (
    <Space className={styles.mobileFooter} direction="vertical">
      {step < STEPS.length - 1 ? (
        <Button type="primary" block onClick={() => setStep(step + 1)}>
          {step === 0 ? 'Tiếp tục nhập ảnh & hiện trạng' : 'Xem tóm tắt & Xác nhận'}
        </Button>
      ) : canConfirm ? (
        confirmButton(true)
      ) : showMarkReady ? (
        markReadyButton(true)
      ) : null}
      {saveDraftButton(true)}
      <Button block type="text" onClick={step > 0 ? () => setStep(step - 1) : requestClose}>
        {step > 0 ? 'Quay lại' : 'Hủy quy trình'}
      </Button>
    </Space>
  ) : (
    <Space>
      <Button onClick={requestClose}>Hủy</Button>
      {saveDraftButton()}
      {showMarkReady ? markReadyButton() : null}
      {canConfirm ? confirmButton() : null}
    </Space>
  );

  return (
    <ResponsiveDialog
      open={open}
      title={`${HANDOVER_TYPE_LABEL[type]} — Đơn ${context.bookingCode}`}
      size="md"
      mobileMode="fullscreen"
      confirmLoading={saving}
      onClose={requestClose}
      footer={footer}
      data-testid="handover-dialog"
    >
      <div className={styles.dialogBody}>
        {isMobile && !readOnly ? (
          <ol className={styles.stepper} aria-label="Các bước bàn giao">
            {STEPS.map((label, index) => (
              <li
                key={label}
                className={index === step ? styles.stepActive : styles.step}
                aria-current={index === step ? 'step' : undefined}
              >
                {index + 1}. {label}
              </li>
            ))}
          </ol>
        ) : null}

        {readOnly ? (
          <Alert
            type={isConfirmed ? 'success' : 'info'}
            showIcon
            className={styles.inlineAlert}
            message={
              isConfirmed
                ? 'Biên bản đã xác nhận — chỉ xem. Sai số KM thì dùng chức năng bổ sung/điều chỉnh có lý do.'
                : 'Bạn chỉ có quyền xem biên bản này.'
            }
          />
        ) : null}

        {summaryBlock}

        <Form component={false} layout="vertical" colon={false} disabled={readOnly}>
          {!isMobile || readOnly || step === 0 ? odometerBlock : null}
          {!isMobile || readOnly || step === 1 ? conditionBlock : null}
        </Form>

        {isMobile && !readOnly && step === 2 ? reviewBlock : null}
        {!isMobile || readOnly || step === 2 ? consequenceBlock : null}

        {warningBlock}
      </div>

      {/* Cùng một hộp xác nhận "bỏ thay đổi" của cả kho (ResponsiveDialog + đúng cặp nhãn ở
          `VehicleEditWorkspace`) — không dựng hệ thống modal thứ hai. */}
      <ResponsiveDialog
        open={discardOpen}
        title="Bỏ các thay đổi chưa lưu?"
        size="sm"
        onClose={() => setDiscardOpen(false)}
        onOk={closeNow}
        okText="Bỏ thay đổi"
        cancelText="Tiếp tục chỉnh sửa"
        destructive
      >
        Dữ liệu bạn vừa nhập trong biên bản bàn giao chưa được lưu.
      </ResponsiveDialog>
    </ResponsiveDialog>
  );
}

function hasField(details: Record<string, unknown> | undefined, field: string): boolean {
  const fields = details?.fields;
  return Array.isArray(fields) && fields.some((item) => (item as { field?: string })?.field === field);
}
