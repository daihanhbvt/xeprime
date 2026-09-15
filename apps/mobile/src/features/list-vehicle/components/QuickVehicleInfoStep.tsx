import { useMemo } from 'react';
import { Controller, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CATALOG_TYPE,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  vehicleFeatureAppliesTo,
} from '@xeprime/types';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { FieldLabel } from '@/components/ui/Field';
import { InlineAction } from '@/components/ui/InlineAction';
import { NumberField } from '@/components/ui/NumberField';
import { RadioOption } from '@/components/ui/RadioOption';
import { TextField } from '@/components/ui/TextField';
import { useCatalog } from '@/features/catalog/use-catalog';
import { useCatalogModels } from '@/features/catalog/use-catalog-models';
import { VehicleClassificationFields } from '@/features/vehicles/components/VehicleClassificationFields';
import {
  VehicleEnergyFields,
  useTransmissionOptions,
} from '@/features/vehicles/components/VehicleEnergyFields';
import { VehicleIdentityFields } from '@/features/vehicles/components/VehicleIdentityFields';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, space } from '@/theme/tokens';
import { suggestVehicleName } from '../quick-mappers';
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
 * Tên hiển thị có nút gợi ý từ hãng + mẫu + năm, nhưng vẫn là một ô người dùng nhìn thấy và sửa
 * được: hệ thống không lưu một cái tên mà chủ xe không biết mình đang đặt.
 */
export function QuickVehicleInfoStep({
  control,
  setValue,
}: {
  control: Control<QuickVehicleValues>;
  setValue: UseFormSetValue<QuickVehicleValues>;
}) {
  const t = useTranslations('ListYourVehicle.info');
  const tForm = useTranslations('Vehicles.form');
  const domainLabel = useDomainLabel();
  const { catalog } = useCatalog();

  const vehicleType = useWatch({ control, name: 'vehicleType' }) || VEHICLE_TYPE.CAR;
  const fuelType = useWatch({ control, name: 'fuelType' });
  const brand = useWatch({ control, name: 'brand' });
  const modelId = useWatch({ control, name: 'vehicleCatalogModelId' });
  const manufactureYear = useWatch({ control, name: 'manufactureYear' });

  const transmissionOptions = useTransmissionOptions(vehicleType, fuelType);

  // Tên mẫu để gợi ý tên xe lấy từ DANH MỤC — ô "Mẫu xe" là select, không còn chữ tự do.
  const { models } = useCatalogModels({ vehicleType, brandKey: brand, includeId: modelId });
  const model = models.find((m) => m.id === modelId)?.label ?? null;

  const brandLabel = useMemo(() => {
    const items = catalog[CATALOG_TYPE.VEHICLE_BRAND] ?? [];
    return items.find((item) => item.key === brand)?.label ?? brand;
  }, [catalog, brand]);

  const suggestedName = suggestVehicleName({ brandLabel, model, manufactureYear });

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
          <TextField
            control={control}
            name="plateNumber"
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
            control={control as never}
            vehicleType={vehicleType}
            setValue={setValue as never}
          />
          <VehicleClassificationFields
            control={control as never}
            vehicleType={vehicleType}
            setValue={setValue as never}
          />

          <NumberField
            control={control}
            name="manufactureYear"
            grouped={false}
            integer
            label={tForm('specs.manufactureYear')}
            placeholder={String(new Date().getFullYear())}
            min={1980}
            max={new Date().getFullYear() + 1}
          />
          <TextField
            control={control}
            name="color"
            label={tForm('specs.color')}
            placeholder={tForm('specs.colorPlaceholder')}
          />

          <YStack gap={space.xs}>
            <TextField
              control={control}
              name="name"
              label={t('nameLabel')}
              placeholder={t('namePlaceholder')}
              {...(suggestedName ? {} : { hint: t('nameHelp') })}
              required
            />
            {/* Gợi ý là một nút BẤM ĐƯỢC, không phải một dòng chữ để gõ lại bằng tay. */}
            {suggestedName ? (
              <InlineAction
                label={t('nameSuggestion', { name: suggestedName })}
                onPress={() => setValue('name', suggestedName, { shouldValidate: true })}
              />
            ) : null}
          </YStack>
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('energyTitle')}</BlockTitle>
          <VehicleEnergyFields
            control={control as never}
            vehicleType={vehicleType}
            transmissionOptions={transmissionOptions}
            setValue={setValue as never}
          />
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('descriptionTitle')}</BlockTitle>
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

      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('featuresTitle')}</BlockTitle>
          <FeaturesField control={control} vehicleType={vehicleType} />
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
