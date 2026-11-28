import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { assessRegistrationReading } from '@xeprime/types';
import { vehiclesApi } from '@/api/vehicles/api';
import { Ionicons } from '@/components/icons/Ionicons';
import { Callout } from '@/components/ui/Callout';
import { ImageSourceSheet } from '@/components/ui/ImageSourceSheet';
import { TextControl } from '@/components/ui/TextControl';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useImageErrorMessage } from '@/lib/image-permission-message';
import { ImageUploadError, type ImageSource } from '@/lib/r2-image-upload';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import {
  PrepareImageError,
  pickLicenceImage,
  prepareLicenceImage,
  putWithProgress,
} from '@/features/driver-licence/prepare-licence-image';
import {
  EMPTY_REGISTRATION,
  checkRegistration,
  fieldsFromReading,
  mergeTypedFields,
  type RegistrationCaptureState,
  type RegistrationFields,
} from '../registration-capture';
import { PAIR_GAP } from './field-layout';

/** Figma: Tên chủ xe · Số khung · Số máy. Địa chỉ không hỏi - máy đọc được thì lưu ngầm. */
/** Ba trường cà vẹt máy quét báo kết quả. */
const SCAN_FIELDS = ['holderName', 'chassisNumber', 'engineNumber'] as const;

const FIELD_ORDER: readonly (keyof RegistrationFields)[] = [
  'holderName',
  'chassisNumber',
  'engineNumber',
];

/**
 * Đọc cà vẹt quá 1 phút ⇒ thôi chờ: hiện "Chưa lấy được …" và để chủ xe tự nhập, không chặn lượt
 * gửi vì ảnh "đang đọc" nữa (người dùng chốt 28/11/2026). Kết quả về muộn vẫn lấp các ô còn trống.
 */
const READ_TIMEOUT_MS = 60_000;

/** Tỉ lệ khung ảnh cà vẹt (thẻ ID-1, như bằng lái). */
const CARD_ASPECT = 85.6 / 54;

interface RegistrationCaptureProps {
  state: RegistrationCaptureState;
  onChange: (update: (prev: RegistrationCaptureState) => RegistrationCaptureState) => void;
  /** Biển số đã nhập — so với biển in trên cà vẹt. */
  vehiclePlate: string | null | undefined;
  /** Đã bấm "Tiếp tục"/"Lưu" — mới hiện lỗi. */
  showErrors: boolean;
  /** Việc phải xong TRƯỚC khi tải (luồng đăng nhanh mở gian hàng ở đây). */
  beforeUpload?: () => Promise<void>;
}

/**
 * Lượt chọn - nén - tải - đọc ảnh cà vẹt, dùng chung cho `RegistrationCapture` (khối liền của wizard
 * đăng nhanh) và các mảnh rời của wizard thêm xe (ô ảnh trong lưới "Ảnh xe", ô nhập trong thẻ "Thông
 * tin xe" - Figma Thêm xe MB `24486:107803`). Một nguồn, hai bố cục.
 */
export function useRegistrationPicker({
  state,
  onChange,
  beforeUpload,
}: Pick<RegistrationCaptureProps, 'state' | 'onChange' | 'beforeUpload'>) {
  const t = useTranslations('Vehicles.form.registration');
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Lượt chọn ảnh mới nhất — kết quả của lượt cũ về muộn thì bỏ. */
  const attempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);

  async function select(source: ImageSource) {
    setSheetOpen(false);
    const token = ++attempt.current;
    let raw;
    try {
      raw = await pickLicenceImage(source);
    } catch (error) {
      onChange((prev) => ({ ...prev, phase: 'failed', failure: 'upload', failureError: error }));
      return;
    }
    if (!raw) return; // Huỷ - không phải lỗi.
    let prepared;
    try {
      prepared = await prepareLicenceImage(raw);
    } catch (error) {
      const failure = error instanceof PrepareImageError ? error.reason : 'unsupported';
      onChange((prev) => ({ ...prev, phase: 'failed', failure, failureError: null }));
      return;
    }
    // Đang nhập tay thì giữ chữ đã gõ - đổi ảnh không xoá công của chủ xe.
    onChange((prev) =>
      prev.editing
        ? { ...EMPTY_REGISTRATION, phase: 'working', previewUrl: prepared.uri, editing: true, fields: prev.fields }
        : { ...EMPTY_REGISTRATION, phase: 'working', previewUrl: prepared.uri },
    );
    let timedOut = false;
    clearTimer();
    timer.current = setTimeout(() => {
      if (token !== attempt.current) return;
      timedOut = true;
      // Không có kết quả đọc ⇒ `RegistrationScanStatus` báo thiếu cả ba trường, ô nhập mở cho gõ tay.
      onChange((prev) =>
        prev.phase === 'working' ? { ...prev, phase: 'ready', reading: null, editing: true } : prev,
      );
    }, READ_TIMEOUT_MS);
    try {
      if (beforeUpload) await beforeUpload();
      const contentType = 'image/jpeg';
      const ticket = await vehiclesApi.presignRegistration({
        contentType,
        fileSize: prepared.body.size,
      });
      try {
        await putWithProgress(ticket.uploadUrl, prepared.body, contentType);
      } catch (error) {
        throw new ImageUploadError('upload', error);
      }
      const result = await vehiclesApi.readRegistration(ticket.uploadId);
      if (token !== attempt.current) return;
      clearTimer();
      onChange((prev) => ({
        ...prev,
        phase: 'ready',
        uploadId: result.uploadId,
        reading: result.reading,
        readerAvailable: result.readerAvailable,
        // Đã nhập tay: chỉ lấp ô trống bằng kết quả đọc, không ghi đè chữ đã gõ (ADR 0099).
        fields: prev.editing
          ? mergeTypedFields(prev.fields, fieldsFromReading(result.reading))
          : mergeTypedFields(prev.fields, fieldsFromReading(result.reading)),
      }));
    } catch (error) {
      if (token !== attempt.current) return;
      clearTimer();
      // Đã quá hạn và chủ xe đang nhập tay - lỗi về muộn không lật lại thành "lỗi ảnh".
      if (timedOut) return;
      onChange((prev) => ({ ...prev, phase: 'failed', failure: 'upload', failureError: error }));
    }
  }

  const sheet = (
    <ImageSourceSheet
      open={sheetOpen}
      onClose={() => setSheetOpen(false)}
      title={t('title')}
      hint={t('chooseHint')}
      onPick={(source) => void select(source)}
      {...(state.previewUrl && state.phase !== 'working'
        ? {
            // Bỏ ảnh (tuỳ chọn - ADR 0100) chỉ reset phần ẢNH + kết quả đọc, giữ ba ô đã nhập (web).
            onRemove: () => {
              setSheetOpen(false);
              attempt.current += 1;
              clearTimer();
              onChange((prev) => ({ ...EMPTY_REGISTRATION, fields: prev.fields, editing: true }));
            },
          }
        : {})}
    />
  );

  return { open: () => setSheetOpen(true), sheet };
}

/**
 * Ô "Cà vẹt xe" của hai wizard thêm xe (ADR 0089 · 0099) — bản native của `RegistrationCapture` bên
 * web. Cơ chế như bằng lái: chụp/chọn ảnh ⇒ nén ⇒ tải kho riêng tư ⇒ server đọc. Đọc đủ và biển khớp
 * ⇒ bản tóm tắt; thiếu/lệch ⇒ ô nhập tay. "Nhập tay" mở được bất cứ lúc nào; ảnh TUỲ CHỌN (ADR 0100).
 */
export function RegistrationCapture({
  state,
  onChange,
  vehiclePlate,
  showErrors,
  beforeUpload,
}: RegistrationCaptureProps) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.registration');
  const picker = useRegistrationPicker({ state, onChange, ...(beforeUpload ? { beforeUpload } : {}) });
  const check = checkRegistration(state, vehiclePlate);

  const photoError = showErrors ? check.errors.photo : undefined;

  return (
    <YStack gap={space.sm}>
      <XStack ai="center" gap={space.xs}>
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {t('title')}
        </Text>
        <Text col={colors.danger} fos={fontSize.body}>
          *
        </Text>
      </XStack>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t('tip')}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={state.previewUrl ? t('replace') : t('choose')}
        disabled={state.phase === 'working'}
        onPress={picker.open}
      >
        <YStack
          w="100%"
          aspectRatio={CARD_ASPECT}
          br={radius.lg}
          ov="hidden"
          bw={1}
          bc={photoError ? colors.danger : colors.borderInput}
          borderStyle={state.previewUrl ? 'solid' : 'dashed'}
          bg={colors.surfaceMuted}
          ai="center"
          jc="center"
          gap={space.xs}
        >
          {state.previewUrl ? (
            <Image
              source={{ uri: state.previewUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityLabel={t('previewAlt')}
            />
          ) : (
            <>
              <Ionicons name="camera-outline" size={iconSize.lg} color={colors.textMuted} />
              <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                {t('choose')}
              </Text>
              <Text col={colors.placeholder} fos={fontSize.label} ta="center" px={space.md}>
                {t('chooseHint')}
              </Text>
            </>
          )}
        </YStack>
      </Pressable>
      {photoError ? (
        <Text col={colors.danger} fos={fontSize.bodySm}>
          {t(`errors.${photoError}`)}
        </Text>
      ) : null}

      <RegistrationScanStatus state={state} vehiclePlate={vehiclePlate} />

      <RegistrationFieldInputs
        state={state}
        onChange={onChange}
        vehiclePlate={vehiclePlate}
        showErrors={showErrors}
      />

      {picker.sheet}
    </YStack>
  );
}

/**
 * Trạng thái lượt đọc cà vẹt: đang đọc · lỗi tải · đọc được gì / thiếu gì · biển lệch. Đi kèm ô ảnh
 * (đặt ngay dưới lưới ảnh ở wizard thêm xe).
 */
export function RegistrationScanStatus({
  state,
  vehiclePlate,
}: {
  state: RegistrationCaptureState;
  vehiclePlate: string | null | undefined;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.registration');
  const errorMessage = useErrorMessage();
  const imageErrorMessage = useImageErrorMessage(errorMessage);
  const scanned = fieldsFromReading(state.reading);
  const assessment = assessRegistrationReading(state.reading, vehiclePlate);

  return (
    <>
      {state.phase === 'working' ? (
        <XStack ai="center" gap={space.sm} accessibilityRole="progressbar">
          <ActivityIndicator color={colors.primary} />
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('reading')}
          </Text>
        </XStack>
      ) : null}

      {state.phase === 'failed' ? (
        <Callout tone="danger">
          {state.failure === 'upload'
            ? imageErrorMessage(state.failureError)
            : t(`failure.${state.failure ?? 'unsupported'}`)}
        </Callout>
      ) : null}

      {/*
        Kết quả quét OCR ngầm (chốt 18/11/2026): đọc được số khung + số máy ⇒ dòng xanh lá, các ô
        tự điền; không đọc được ⇒ dòng lỗi mời kiểm tra lại. Ảnh vẫn được nhận.
      */}
      {state.phase === 'ready' ? (
        <YStack gap={space.xs}>
          {SCAN_FIELDS.some((f) => scanned[f]) ? (
            <XStack ai="flex-start" gap={space.xs}>
              <Ionicons name="checkmark-circle" size={iconSize.sm} color={colors.success} />
              <Text col={colors.success} fos={fontSize.bodySm} f={1}>
                {t('scanFound', {
                  items: SCAN_FIELDS.filter((f) => scanned[f])
                    .map((f) => `${t(`fields.${f}`)} ${scanned[f]}`)
                    .join(LIST_SEPARATOR),
                })}
              </Text>
            </XStack>
          ) : null}
          {SCAN_FIELDS.some((f) => !scanned[f]) ? (
            <Text col={colors.danger} fos={fontSize.bodySm}>
              {t('scanMissingItems', {
                items: SCAN_FIELDS.filter((f) => !scanned[f])
                  .map((f) => t(`fields.${f}`).toLowerCase())
                  .join(', '),
              })}
            </Text>
          ) : null}
        </YStack>
      ) : null}
      {state.phase === 'ready' && assessment.plateMismatch ? (
        <Text col={colors.danger} fos={fontSize.bodySm}>
          {t('plateMismatch', { read: state.reading?.plateNumber ?? '', typed: vehiclePlate ?? '' })}
        </Text>
      ) : null}
    </>
  );
}

/**
 * Ba ô cà vẹt (tên chủ xe · số khung · số máy). `paired` = bố cục Figma Thêm xe MB: tên chủ xe một
 * hàng, "Số khung xe | Số máy xe" chung một hàng.
 */
export function RegistrationFieldInputs({
  state,
  onChange,
  vehiclePlate,
  showErrors,
  paired = false,
  labels,
}: Pick<RegistrationCaptureProps, 'state' | 'onChange' | 'vehiclePlate' | 'showErrors'> & {
  paired?: boolean;
  /** Chữ riêng của một bố cục (Figma Thêm xe MB: "Số khung xe" · "Nhập số khung"). */
  labels?: Partial<Record<keyof RegistrationFields, { label: string; placeholder: string }>>;
}) {
  const t = useTranslations('Vehicles.form.registration');
  const check = checkRegistration(state, vehiclePlate);
  const setField = (field: keyof RegistrationFields, value: string) =>
    onChange((prev) => ({ ...prev, fields: { ...prev.fields, [field]: value } }));

  const input = (field: keyof RegistrationFields) => {
    const code = showErrors ? check.errors[field] : undefined;
    return (
      <TextControl
        key={field}
        label={labels?.[field]?.label ?? t(`fields.${field}`)}
        required
        value={state.fields[field]}
        onChangeText={(value) =>
          setField(
            field,
            // Số khung / số máy: viết hoa, chỉ chữ và số, tối đa 25 - lọc ngay khi gõ (như web).
            field === 'holderName'
              ? value
              : value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 25),
          )
        }
        placeholder={labels?.[field]?.placeholder ?? t('scanPlaceholder')}
        error={code ? t(`errors.${code}`) : undefined}
        autoCapitalize="characters"
      />
    );
  };

  if (!paired) {
    return <YStack gap={space.sm}>{FIELD_ORDER.map(input)}</YStack>;
  }
  return (
    <YStack gap={space.md}>
      {input('holderName')}
      <XStack gap={PAIR_GAP} ai="flex-start">
        <YStack f={1} minWidth={0}>
          {input('chassisNumber')}
        </YStack>
        <YStack f={1} minWidth={0}>
          {input('engineNumber')}
        </YStack>
      </XStack>
    </YStack>
  );
}
