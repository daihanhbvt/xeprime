import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { VEHICLE_TYPE } from '@xeprime/types';
import { CheckOption } from '@/components/ui/RadioOption';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';

/**
 * "Bảo hiểm chuyến đi (MIC)" — hai ô tích TUỲ CHỌN (luồng tiền v2, PR web #213): vật chất xe
 * (`IV`, `vehicleProtectionSelected`) và tai nạn người ngồi trên xe (`IP`, `personalAccidentSelected`).
 *
 * Bản native của khối bảo hiểm ở `ListingBookingCard` (thẻ đặt xe, có dòng ghi chú) và
 * `RequestBookingFlow` (bước Chuyến đi) của web — cùng khoá i18n của từng nơi (`namespace`).
 * Số tiền THẬT do server tính trong báo giá (dòng `unitAmount × quantity`); dòng phụ ở đây chỉ là
 * nhãn gợi ý mà web đặt trong bản dịch.
 */
export function InsuranceOptions({
  namespace,
  vehicleType,
  vehicleProtection,
  personalAccident,
  onChange,
  showNote = false,
}: {
  namespace: 'Listings.detail.booking.insurance' | 'BookingRequests.flow.insurance';
  vehicleType: string | null | undefined;
  vehicleProtection: boolean;
  personalAccident: boolean;
  onChange: (patch: { vehicleProtection?: boolean; personalAccident?: boolean }) => void;
  showNote?: boolean;
}) {
  const t = useTranslations(namespace);
  const colors = useColors();
  const moto = vehicleType === VEHICLE_TYPE.MOTORBIKE;

  return (
    <YStack gap={space.sm}>
      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {t('title')}
      </Text>
      <CheckOption
        label={t('vehicleProtection')}
        hint={moto ? t('vehicleProtectionHintMoto') : t('vehicleProtectionHintCar')}
        checked={vehicleProtection}
        onPress={() => onChange({ vehicleProtection: !vehicleProtection })}
      />
      <CheckOption
        label={t('personalAccident')}
        hint={moto ? t('personalAccidentHintMoto') : t('personalAccidentHintCar')}
        checked={personalAccident}
        onPress={() => onChange({ personalAccident: !personalAccident })}
      />
      {showNote ? (
        <Text col={colors.placeholder} fos={fontSize.label} fontStyle="italic">
          {t('note')}
        </Text>
      ) : null}
    </YStack>
  );
}
