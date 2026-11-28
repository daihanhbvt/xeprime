import { useEffect, useMemo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { Control } from 'react-hook-form';
import {
  VEHICLE_IMAGE_TYPE,
  isSingleVehicleImageSlot,
  requiredVehicleImageTypes,
  type VehicleImageType,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { InfoGroupCard } from '@/components/ui/InfoGroupCard';
import { useImageUpload } from '@/components/ui/use-image-upload';
import { uploadsApi } from '@/api/uploads/api';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { useImageSlotLabel } from '../hooks/use-vehicle-spec-items';
import { checkRegistration, type RegistrationCaptureState } from '../registration-capture';
import { RegistrationScanStatus, useRegistrationPicker } from './RegistrationCapture';
import { useTypedMediaField } from './TypedMediaFields';
import { VEHICLE_IMAGE_TILE_GAP, VehicleImageTile } from './VehicleImageTile';

interface MediaItem {
  url: string;
  type: VehicleImageType;
}

/**
 * Thẻ "Ảnh xe" của bước 1 wizard thêm xe - Figma Thêm xe MB (`24486:108227`): tiêu đề + viên cam
 * "x/y ảnh bắt buộc", lưới HAI cột các góc chụp bắt buộc (`requiredVehicleImageTypes`, mặt trước
 * mang nhãn "Ảnh bìa"), ô cuối là "Cà vẹt xe" (ADR 0089 · 0099 - ảnh tuỳ chọn, ADR 0100).
 *
 * Cùng luật dữ liệu với `TypedMediaFields` (đăng nhanh): ảnh là trường RHF `media` (+ mảng `images`
 * song song), mỗi ô một ảnh, trần thư viện đếm mọi ảnh + ảnh đang tải; chỉ đổi cách vẽ.
 */
export function CreateVehiclePhotosCard({
  control,
  vehicleType,
  vehicleName,
  registration,
  onRegistrationChange,
  vehiclePlate,
  showRegistrationErrors,
}: {
  control: Control<VehicleFormValues>;
  vehicleType: string;
  vehicleName: string;
  registration: RegistrationCaptureState;
  onRegistrationChange: (
    update: (prev: RegistrationCaptureState) => RegistrationCaptureState,
  ) => void;
  vehiclePlate: string | null | undefined;
  showRegistrationErrors: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('VehicleManage.images');
  const tCreate = useTranslations('Vehicles.form.appCreate');
  const tRegistration = useTranslations('Vehicles.form.registration');
  const tSteps = useTranslations('Vehicles.form.createSteps');
  const domainLabel = useDomainLabel();
  const slotLabel = useImageSlotLabel();

  const media = useTypedMediaField(control);
  const { items, remaining, track } = media;

  const slots = useMemo(() => requiredVehicleImageTypes(vehicleType), [vehicleType]);
  const done = slots.filter((slot) => items.some((item) => item.type === slot)).length;
  const complete = done === slots.length;

  const picker = useRegistrationPicker({ state: registration, onChange: onRegistrationChange });
  const registrationCheck = checkRegistration(registration, vehiclePlate);
  const registrationPhotoError = showRegistrationErrors && Boolean(registrationCheck.errors.photo);

  return (
    <InfoGroupCard
      title={tSteps('photosTitle')}
      headerRight={
        <CountBadge
          label={tCreate('photosRequired', { done, total: slots.length })}
          complete={complete}
        />
      }
    >
      <XStack flexWrap="wrap" gap={VEHICLE_IMAGE_TILE_GAP}>
        {slots.map((slot) => (
          <PhotoSlotTile
            key={slot}
            slot={slot}
            label={domainLabel('vehicleImageType', slot)}
            shortLabel={slotLabel(slot)}
            helper={t(`helper.${slot}` as never)}
            vehicleName={vehicleName}
            item={items.find((item) => item.type === slot) ?? null}
            remaining={remaining}
            error={Boolean(media.error) && !items.some((item) => item.type === slot)}
            onUploaded={(url) => media.place(slot, url)}
            onRemove={media.remove}
            onBusyChange={track}
          />
        ))}
        {/* Ô "Cà vẹt xe" - ảnh tuỳ chọn (ADR 0100); ba ô nhập nằm ở thẻ "Thông tin xe". */}
        <VehicleImageTile
          uri={registration.previewUrl}
          label={tCreate('registrationTile')}
          imageLabel={tRegistration('previewAlt')}
          emptyHint={t('formats')}
          onPressImage={picker.open}
          imagePressDisabled={registration.phase === 'working'}
          pressLabel={registration.previewUrl ? tRegistration('replace') : tRegistration('choose')}
          onReplace={registration.phase === 'working' ? null : picker.open}
          replaceLabel={tRegistration('replace')}
          busy={registration.phase === 'working'}
          error={registrationPhotoError}
        />
      </XStack>

      {/* Còn trống một góc ảnh bắt buộc - lỗi của form, ngay dưới lưới. */}
      {media.error?.message ? (
        <Text col={colors.danger} fos={typeScale.body.fontSize} accessibilityRole="alert">
          {media.error.message}
        </Text>
      ) : null}
      {registrationPhotoError && registrationCheck.errors.photo ? (
        <Text col={colors.danger} fos={typeScale.body.fontSize}>
          {tRegistration(`errors.${registrationCheck.errors.photo}`)}
        </Text>
      ) : null}
      <RegistrationScanStatus state={registration} vehiclePlate={vehiclePlate} />
      {picker.sheet}
    </InfoGroupCard>
  );
}

/** Viên "x/y ảnh bắt buộc" (Figma `_Badge` cam `status/orange-*`); đủ ảnh thì sang xanh. */
function CountBadge({ label, complete }: { label: string; complete: boolean }) {
  const colors = useColors();
  return (
    <YStack
      px={space.sm}
      py={2}
      br={radius.pill}
      bw={1}
      bc={complete ? colors.successBorder : colors.warningBorder}
      bg={complete ? colors.successSurface : colors.orangeLow}
    >
      <Text
        col={complete ? colors.success : colors.orangeHigh}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.medium}
        numberOfLines={1}
      >
        {label}
      </Text>
    </YStack>
  );
}

/** Một góc chụp: ô Figma + lượt tải của riêng ô đó. Mỗi ô giữ đúng MỘT ảnh. */
function PhotoSlotTile({
  slot,
  label,
  shortLabel,
  helper,
  vehicleName,
  item,
  remaining,
  error,
  onUploaded,
  onRemove,
  onBusyChange,
}: {
  slot: VehicleImageType;
  label: string;
  shortLabel: string;
  helper: string;
  vehicleName: string;
  item: MediaItem | null;
  remaining: number;
  error: boolean;
  onUploaded: (url: string) => void;
  onRemove: (url: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const t = useTranslations('VehicleManage.images');
  const single = isSingleVehicleImageSlot(slot);
  const upload = useImageUpload({
    title: label,
    hint: helper,
    presign: uploadsApi.vehicleImage,
    remaining: single ? 1 : remaining,
    onUploaded: (urls: readonly string[]) => urls.forEach(onUploaded),
  });
  const busy = upload.busy;
  useEffect(() => {
    if (!busy) return;
    onBusyChange(true);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);

  return (
    <>
      <VehicleImageTile
        uri={item?.url ?? null}
        label={shortLabel}
        imageLabel={t('alt', { slot: label, vehicle: vehicleName })}
        emptyHint={t('formats')}
        badge={slot === VEHICLE_IMAGE_TYPE.FRONT ? t('coverBadge') : null}
        onPressImage={upload.open}
        imagePressDisabled={busy}
        pressLabel={item ? label : t('choose')}
        onRemove={item ? () => onRemove(item.url) : null}
        removeLabel={t('remove', { slot: label })}
        onReplace={item ? upload.open : null}
        replaceLabel={t('choose')}
        replaceDisabled={busy}
        busy={busy}
        error={error}
      />
      {upload.sheet}
    </>
  );
}
