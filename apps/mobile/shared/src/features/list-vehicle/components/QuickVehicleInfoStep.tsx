import { useMemo } from 'react';
import { Controller, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CATALOG_TYPE,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  vehicleFeatureAppliesTo,
  type VehicleRegistrationReading,
} from '@xeprime/types';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { FieldLabel } from '@/components/ui/Field';
import { NumberField } from '@/components/ui/NumberField';
import { RadioOption } from '@/components/ui/RadioOption';
import { TextField } from '@/components/ui/TextField';
import { useCatalog } from '@/features/catalog/use-catalog';
import { VehicleClassificationFields } from '@/features/vehicles/components/VehicleClassificationFields';
import {
  VehicleEnergyFields,
  useTransmissionOptions,
} from '@/features/vehicles/components/VehicleEnergyFields';
import { VehicleIdentityFields } from '@/features/vehicles/components/VehicleIdentityFields';
import { RegistrationTextField } from '@/features/vehicles/components/RegistrationTextField';
import { BodyTypePicker } from '@/features/vehicles/components/VehicleFormSteps';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import type { QuickVehicleValues } from '../quick-schema';

/** Trần mô tả — khớp `vehicleFormSchema.description` và `maxLength={4000}` của web. */
const DESCRIPTION_MAX = 4000;

/**
 * Bước THÔNG TIN XE của wizard đăng xe nhanh — bản native của `QuickVehicleInfoStep`.
 *
 * Sáu khối, đúng thứ tự web: loại phương tiện · biển số · thông tin cơ bản · nguồn năng lượng ·
 * mô tả · tiện nghi.
 *
 * Các ô dùng ĐÚNG những khối mà wizard `/manage` và màn sửa xe đang dùng — hãng → mẫu xe từ danh
 * mục (`VehicleIdentityFields`), phân loại theo `vehicleFieldPolicy`, khối năng lượng theo
 * `vehicleEnergySpecPolicy`. Không có bộ form thứ hai cho luồng nhanh: một chiếc xe đăng nhanh
 * rồi vào sửa lại phải thấy đúng những ô đó, hỏi đúng cách đó.
 *
 * Không có ô tên (ADR 0102): server ghép "Hãng Dòng Phiên bản Năm"; tấm xác nhận hiện đúng tên đó.
 */
export function QuickVehicleInfoStep({
  control,
  setValue,
  registrationReading,
}: {
  control: Control<QuickVehicleValues>;
  setValue: UseFormSetValue<QuickVehicleValues>;
  /** Lượt đọc cà vẹt mới nhất - biển số/màu khớp nó thì khoá (ADR 0102 điều 6). */
  registrationReading?: VehicleRegistrationReading | null;
}) {
  const colors = useColors();
  const t = useTranslations('ListYourVehicle.info');
  const tForm = useTranslations('Vehicles.form');
  const domainLabel = useDomainLabel();

  const vehicleType = useWatch({ control, name: 'vehicleType' }) || VEHICLE_TYPE.CAR;
  const fuelType = useWatch({ control, name: 'fuelType' });

  const transmissionOptions = useTransmissionOptions(vehicleType, fuelType);


  return (
    <YStack gap={space.md}>
      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('typeTitle')}</BlockTitle>
          {/*
            Hai lựa chọn nằm trên MỘT HÀNG, chia đôi bề ngang.

            Đây là ngoại lệ hợp lệ của luật "mọi lựa chọn từ hai giá trị trở lên đi qua ô chọn"
            (xem `SelectControl`): luật đó sinh ra vì nhãn dài ("Liên tỉnh một chiều") xếp ngang
            là tự xuống ba hàng. "Ô tô" và "Xe máy" thì không — chúng ngắn nhất trong cả app, và
            xếp dọc thành hai dòng chỉ tốn chiều cao cho một câu hỏi trả lời trong nửa giây.
          */}
          <Controller
            control={control}
            name="vehicleType"
            render={({ field }) => (
              <YStack gap={space.xs}>
                <FieldLabel label={t('typeLabel')} required />
                <XStack gap={space.xs}>
                  {VEHICLE_TYPE_VALUES.map((value) => (
                    <YStack key={value} f={1}>
                      <RadioOption
                        label={domainLabel('vehicleType', value)}
                        checked={field.value === value}
                        onPress={() => field.onChange(value)}
                      />
                    </YStack>
                  ))}
                </XStack>
              </YStack>
            )}
          />
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('plateTitle')}</BlockTitle>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('plateHint')}
          </Text>
          <RegistrationTextField
            control={control as never}
            name="plateNumber"
            reading={registrationReading}
            label={tForm('specs.plateNumber')}
            placeholder={tForm('specs.platePlaceholder')}
            autoCapitalize="characters"
            required
          />
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('basicTitle')}</BlockTitle>

          <VehicleIdentityFields
            required
            control={control as never}
            vehicleType={vehicleType}
            setValue={setValue as never}
          />
          <VehicleClassificationFields
            required
            control={control as never}
            vehicleType={vehicleType}
            bodyTypePicker={<BodyTypePicker control={control as never} />}
            setValue={setValue as never}
          />

          <NumberField
            control={control}
            name="manufactureYear"
            grouped={false}
            integer
            required
            label={tForm('specs.manufactureYear')}
            placeholder={String(new Date().getFullYear())}
            min={1980}
            max={new Date().getFullYear() + 1}
          />
          <RegistrationTextField
            control={control as never}
            name="color"
            reading={registrationReading}
            label={tForm('specs.color')}
            placeholder={tForm('specs.colorPlaceholder')}
          />
          {/* Không có ô tên xe: server ghép "Hãng Dòng Phiên bản Năm" (ADR 0102). */}
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('energyTitle')}</BlockTitle>
          <VehicleEnergyFields
            control={control as never}
            vehicleType={vehicleType}
            transmissionOptions={transmissionOptions}
            fuelTypeRequired
            setValue={setValue as never}
          />
        </YStack>
      </Card>

    </YStack>
  );
}

/**
 * Tiện nghi xe — dải chip CHỌN NHIỀU, đã LỌC theo loại xe.
 *
 * Bộ tiện nghi thiên hẳn về ô tô (camera 360, túi khí, ghế trẻ em); nguồn lọc là
 * `vehicleFeatureAppliesTo` ở `@xeprime/types` — cùng hàm backend dùng để TỪ CHỐI, nên ẩn ở đây
 * không phải trang trí.
 *
 * Chip đọc được vì nhãn tiện nghi ngắn ("Bluetooth", "Camera lùi"); khác với lựa chọn dịch vụ/gói
 * thuê nơi nhãn dài buộc phải dùng ô chọn.
 */
function FeaturesField({
  control,
  vehicleType,
}: {
  control: Control<QuickVehicleValues>;
  vehicleType: string;
}) {
  const t = useTranslations('Vehicles.form.media');
  const { catalog } = useCatalog();

  /* Tiện nghi đến từ DANH MỤC ở server, không phải một hằng gõ tay — cùng nguồn với form đầy đủ. */
  const features = useMemo(
    () =>
      (catalog[CATALOG_TYPE.VEHICLE_FEATURE] ?? []).filter((item) =>
        vehicleFeatureAppliesTo(item.key, vehicleType),
      ),
    [catalog, vehicleType],
  );

  return (
    <Controller
      control={control}
      name="features"
      render={({ field }) => {
        const selected = (field.value ?? []) as string[];
        return (
          <YStack gap={space.xs}>
            <FieldLabel label={t('features')} />
            <XStack flexWrap="wrap" gap={space.xs}>
              {features.map((item) => {
                const active = selected.includes(item.key);
                return (
                  <Chip
                    key={item.key}
                    label={item.label}
                    selected={active}
                    onPress={() =>
                      field.onChange(
                        active ? selected.filter((k) => k !== item.key) : [...selected, item.key],
                      )
                    }
                  />
                );
              })}
            </XStack>
          </YStack>
        );
      }}
    />
  );
}

/**
 * Bước 3 "Tiện ích & mô tả" của luồng đăng nhanh (Figma `24352:81824`, 17/11/2026) — tiện nghi rồi mô
 * tả văn bản thường. Hai khối này trước nằm cuối bước "Thông tin xe".
 */
export function QuickVehicleFeaturesStep({ control }: { control: Control<QuickVehicleValues> }) {
  const t = useTranslations('ListYourVehicle.info');
  const tForm = useTranslations('Vehicles.form');
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  return (
    <Card>
      <YStack gap={space.md}>
        <BlockTitle>{t('featuresTitle')}</BlockTitle>
        <FeaturesField control={control} vehicleType={vehicleType} />
        <TextField
          control={control}
          name="description"
          label={tForm('media.description')}
          placeholder={tForm('media.descriptionPlaceholder')}
          hint={t('descriptionHelp')}
          multiline
          rows={5}
          maxLength={DESCRIPTION_MAX}
        />
      </YStack>
    </Card>
  );
}
