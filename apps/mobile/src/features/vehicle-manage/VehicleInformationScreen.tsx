import { useMemo } from 'react';
import { Controller, useForm, useWatch, type Control } from 'react-hook-form';
import { Linking, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { CATALOG_TYPE, VEHICLE_PUBLIC_STATUS, vehicleFeatureAppliesTo } from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { MapPreview } from '@/components/map/MapPreview';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { FieldLabel } from '@/components/ui/Field';
import { NumberField } from '@/components/ui/NumberField';
import { TextField } from '@/components/ui/TextField';
import { useBranches } from '@/features/branches/hooks/use-branches';
import { useCatalog } from '@/features/catalog/use-catalog';
import { VehicleClassificationFields } from '@/features/vehicles/components/VehicleClassificationFields';
import {
  VehicleEnergyFields,
  useTransmissionOptions,
} from '@/features/vehicles/components/VehicleEnergyFields';
import { VehicleIdentityFields } from '@/features/vehicles/components/VehicleIdentityFields';
import { useUpdateVehicle } from '@/features/vehicles/hooks/use-vehicle';
import { manageInformationValuesToInput, vehicleToFormValues } from '@/features/vehicles/mappers';
import { mapAppUrl, mapPreviewUrl, toGeoPoint } from '@/lib/map-static';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useApiFieldErrors } from '@/hooks/use-api-field-errors';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';
import { colors, fontSize, space } from '@/theme/tokens';
import type { VehicleDetail } from '@/features/vehicles/api';
import { VehicleManageShell } from './components/VehicleManageShell';

/**
 * ĐÚNG 15 trường mục này VALIDATE — cùng danh sách `FIELDS` của `InformationSection` bên web.
 *
 * Danh sách ngắn là ĐIỂM CHÍNH của màn, không phải một sự thiếu sót. Form sửa xe ở cổng quản lý
 * mở 24 trường, trong đó có `name`, `branchId`, `vehicleType`, `serviceTypes`, `operationStatus`
 * và kích thước/công suất — những thứ hoặc được đặt ở nơi khác (menu dịch vụ, mục giá), hoặc
 * không phải việc của chủ xe cá nhân. Gửi kèm chúng trong một lần lưu "thông tin" là ghi đè thứ
 * người dùng không hề chạm vào.
 *
 * Đây là danh sách để BẮT LỖI, không phải danh sách được gửi: phân khúc xe, kiểu dáng và mẫu xe
 * chuẩn (`motorbikeCategory`/`bodyType`/`vehicleCatalogModelId`) vẫn đi theo payload qua
 * `manageInformationValuesToInput` — chúng là ô chọn nên không có gì để bắt lỗi.
 */
const FIELDS: ReadonlyArray<keyof VehicleFormValues> = [
  'plateNumber',
  'brand',
  'model',
  'manufactureYear',
  'seatCount',
  'fuelType',
  'color',
  'transmission',
  'fuelConsumptionCombined',
  'electricRangeKm',
  'batteryCapacityKwh',
  'electricConsumptionKwhPer100Km',
  'engineDisplacementCc',
  'description',
  'features',
];

/**
 * Mục "Thông tin xe" của không gian Quản lý xe — bản native của `InformationSection`.
 *
 * KHÔNG dùng lại form sửa xe của cổng quản lý (`VehicleEditFormScreen`), và đó là cả điểm của
 * màn này. Form kia mở 24 trường kèm dải 6 tab của cổng quản lý, và nút lui của nó dẫn về
 * `/manage/vehicles/:id/edit` — một khu mà chủ xe tuyến hoa hồng không vào được, nên bấm lui là
 * rơi thẳng vào màn "không có quyền truy cập gian hàng này".
 *
 * Ở đây: đúng 15 trường, đúng vỏ của khu tài khoản, lui về mục lục quản lý xe.
 */
export function VehicleInformationScreen({ vehicleId }: { vehicleId: string }) {
  const tNav = useTranslations('VehicleManage.nav');

  return (
    <VehicleManageShell
      vehicleId={vehicleId}
      section={VEHICLE_MANAGE_SECTION.INFORMATION}
      title={tNav('information')}
    >
      {({ vehicle, canEdit }) => (
        <InformationForm vehicle={vehicle} canEdit={canEdit} vehicleId={vehicleId} />
      )}
    </VehicleManageShell>
  );
}

function InformationForm({
  vehicle,
  canEdit,
  vehicleId,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  vehicleId: string;
}) {
  const t = useTranslations('VehicleManage.information');
  const tForm = useTranslations('Vehicles.form');
  const tEdit = useTranslations('Vehicles.edit');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdateVehicle(vehicleId);

  /*
   * Dùng CHUNG `vehicleFormSchema` + `VehicleFormValues` với mọi màn khai xe khác.
   *
   * Bản trước tự khai một interface 15 trường riêng, và cái giá của nó thấy được ngay trên màn:
   * không có `vehicleCatalogModelId` nên "Dòng xe" tụt xuống thành ô gõ tay, không có
   * `motorbikeCategory` nên ô "Phân khúc xe" biến mất khỏi app, và hộp số bị gán cứng hai giá trị
   * nên một chiếc xe máy chỉ chọn được "số sàn/số tự động" thay vì tay ga · xe số · côn tay ·
   * khác. Cả ba đều là chiều LỌC ngoài chợ — sai ở đây nghĩa là khách không tìm ra chiếc xe.
   */
  const initialValues = useMemo(() => vehicleToFormValues(vehicle), [vehicle]);
  const resolver = useValidationResolver<VehicleFormValues>(
    vehicleFormSchema,
    'Vehicles.form.validation',
  );
  const applyApiFieldErrors = useApiFieldErrors();
  const { control, getValues, handleSubmit, reset, setError, setValue, trigger, formState } =
    useForm<VehicleFormValues>({ resolver, values: initialValues });

  const vehicleType = vehicle.vehicleType ?? '';
  const fuelType = useWatch({ control, name: 'fuelType' });
  const transmissionOptions = useTransmissionOptions(vehicleType, fuelType);

  /*
   * Biển số KHOÁ khi xe đang công khai — backend từ chối đổi định danh của một chiếc xe đã lên
   * chợ, nên bày một ô sửa được ở đây chỉ dẫn tới một lỗi lúc lưu. Cùng khoá đó phủ lên nhiên
   * liệu, hộp số và năm sản xuất (ADR 0030).
   */
  const publicLocked = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;

  /*
   * Chỉ validate 15 trường CỦA MÀN NÀY.
   *
   * `vehicleFormSchema` mô tả cả form xe đầy đủ, nên một `handleSubmit` trần sẽ đỏ ở `name`,
   * `branchId`, `serviceTypes`… — những ô không hề có mặt ở đây, tức người dùng bị chặn lưu bởi
   * một lỗi không nhìn thấy và không sửa được.
   */
  const onSubmit = handleSubmit(async () => {
    if (!(await trigger([...FIELDS]))) return;
    update.mutate(manageInformationValuesToInput(getValues()), {
      onSuccess: (saved) => {
        toast.showSuccess(t('saved'));
        reset(vehicleToFormValues(saved));
      },
        /*
         * Lỗi validate của SERVER được đặt ĐÚNG Ô nó nói tới, không gom vào một toast chung.
         *
         * Hai lớp validate (yup ở client, class-validator ở server) không bao giờ trùng khít; khi
         * server bắt được thứ yup bỏ lọt — biển số trùng, đời xe ngoài dải — một câu chung buộc
         * người dùng tự dò trên một form vài chục ô. Lọc theo `FIELDS` là bắt buộc: `setError` với
         * một tên không có ô nào sẽ khoá `handleSubmit` vĩnh viễn mà không hiện gì.
         */
      onError: (error) => {
        const applied = applyApiFieldErrors(error, setError, { fields: FIELDS });
        if (applied.length === 0) toast.showError(errorMessage(error));
      },
    });
  });

  return (
    <YStack gap={space.md}>
      {publicLocked ? <Callout tone="info">{t('lockedNotice')}</Callout> : null}

      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('plateTitle')}</BlockTitle>
          <TextField
            control={control}
            name="plateNumber"
            label={tForm('specs.plateNumber')}
            publishRequired
            placeholder={tForm('specs.platePlaceholder')}
            autoCapitalize="characters"
            editable={canEdit && !publicLocked}
            /*
              Ô khoá nói CÂU NGẮN ("đã khoá vì xe đang trên chợ"), không lặp lại cả đoạn cảnh báo
              đã đứng ở đầu màn — đúng cặp `lockedNotice`/`lockedField` mà web dùng cho hai chỗ.
              Chưa khoá thì đây là chỗ nhắc đổi biển số sẽ đưa xe về chờ duyệt lại.
            */
            hint={publicLocked ? t('lockedField') : t('plateHelp')}
          />
        </YStack>
      </Card>

      <AddressCard vehicle={vehicle} />

      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('basicTitle')}</BlockTitle>

          {/*
            Hãng xe → Dòng xe (mẫu chuẩn), rồi phân loại theo loại xe. CÙNG component với wizard
            đăng nhanh và form đầy đủ ở `/manage` — bốn màn khai xe không thể hỏi khác nhau.
          */}
          <VehicleIdentityFields
            control={control}
            vehicleType={vehicleType}
            disabled={!canEdit}
            setValue={setValue}
            {...(publicLocked ? { lockedNotice: t('lockedField') } : {})}
          />

          {/*
            Ô tô hỏi số chỗ; xe máy hỏi PHÂN KHÚC (tay ga / xe số / côn tay). Không truyền
            `bodyTypePicker`: kiểu dáng thân xe chọn bằng thẻ có ảnh và thuộc form khai xe đầy đủ
            — `InformationSection` bên web cũng bỏ trống đúng chỗ đó.
          */}
          <VehicleClassificationFields
            control={control}
            vehicleType={vehicleType}
            disabled={!canEdit}
            setValue={setValue}
          />

          <NumberField
            control={control}
            name="manufactureYear"
            grouped={false}
            label={tForm('specs.manufactureYear')}
            editable={canEdit && !publicLocked}
            {...(publicLocked ? { hint: t('lockedField') } : {})}
          />
          <TextField
            control={control}
            name="color"
            label={tForm('specs.color')}
            placeholder={tForm('specs.colorPlaceholder')}
            editable={canEdit}
          />
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.md}>
          {/*
            Nguồn năng lượng và thông số của nó dùng CHUNG khối với các màn khai xe khác — cùng ma
            trận `vehicleEnergySpecPolicy`, nên không màn nào hỏi lít/100km cho một chiếc xe điện.
            Danh sách hộp số cũng từ đây: `vehicleTransmissionTypesFor` biết xe máy có tay ga · xe
            số · côn tay · khác, còn ô tô mới là MT/AT/CVT/DCT/AMT.
          */}
          <VehicleEnergyFields
            control={control}
            vehicleType={vehicleType}
            transmissionOptions={transmissionOptions}
            disabled={!canEdit || publicLocked}
            setValue={setValue}
            {...(publicLocked ? { lockedNotice: t('lockedField') } : {})}
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
            multiline
            editable={canEdit}
          />
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('featuresTitle')}</BlockTitle>
          <FeaturesField control={control} vehicleType={vehicleType} disabled={!canEdit} />
        </YStack>
      </Card>

      {canEdit ? (
        <YStack gap={space.sm}>
          <Button
            label={tActions('saveChanges')}
            disabled={!formState.isDirty}
            loading={update.isPending}
            onPress={() => void onSubmit()}
          />
          <Button
            label={tEdit('revert')}
            variant="ghost"
            disabled={!formState.isDirty || update.isPending}
            onPress={() => reset(initialValues)}
          />
        </YStack>
      ) : null}
    </YStack>
  );
}

/**
 * Địa chỉ hiện tại của xe = CHI NHÁNH đang giữ xe — bản native của `AddressCard` bên web.
 *
 * Ba dòng, mỗi dòng trả lời một câu: địa chỉ đường phố, tên chi nhánh, rồi vì sao địa chỉ này
 * quan trọng. Bản trước nhét câu thứ ba vào cột NHÃN của một `DataRow` — mà cột nhãn rộng 30%
 * cho những nhãn hai chữ, nên một câu 30 chữ rơi xuống tám dòng ép sát bên trái trong khi tên chi
 * nhánh đứng một mình bên phải. Đó không phải một bảng, đó là một đoạn văn.
 *
 * Chỉ ĐỌC ở đây: web mở `BranchFormDialog` tại chỗ, nhưng chi nhánh là dữ liệu của GIAN HÀNG và
 * khu tài khoản đã thống nhất không mở đường sang `/manage`. Cảnh báo "chi nhánh đang giữ nhiều
 * xe" vì thế hiện THẲNG ra thẻ thay vì nằm trong hộp thoại sửa như web — nó là thứ chủ xe cần
 * biết trước khi đi tìm chỗ sửa, không phải sau.
 *
 * Địa chỉ đường phố và số xe không nằm trong `vehicle.branch` (chỉ có id/tên/tỉnh), nên phải đọc
 * danh sách chi nhánh — đúng nguồn web dùng. Thiếu quyền hay lỗi mạng thì lùi về phần tóm tắt đã
 * có sẵn, không bao giờ để trống thẻ.
 */
function AddressCard({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('VehicleManage.information');
  const tAddress = useTranslations('Address');
  const tStates = useTranslations('Common.states');
  const branchId = vehicle.branch?.id ?? null;
  const branches = useBranches({}, branchId !== null);
  const branch = branches.data?.items.find((b) => b.id === branchId) ?? null;

  /*
   * `branch.address` là địa chỉ HIỂN THỊ đã ghép sẵn số nhà + xã/phường + tỉnh — hợp đồng API
   * nói thẳng "dùng thẳng, đừng ghép lại". Nối thêm `provinceName` vào sau nó (như web đang làm)
   * in ra "… Hải Châu, Đà Nẵng, Đà Nẵng". Chỉ khi chi nhánh chưa có địa chỉ chi tiết thì tên tỉnh
   * mới là thứ duy nhất nói được xe đang ở đâu.
   */
  const addressLine = branch?.address ?? vehicle.branch?.provinceName ?? '';
  const branchName = branch?.name ?? vehicle.branch?.name ?? null;

  /*
   * Toạ độ chỉ đến từ CHI NHÁNH đã tải về được — `vehicle.branch` rút gọn không mang lat/lng.
   * Không có thì khối bản đồ tự vắng mặt, y như `StaticMap` bên web.
   */
  const mapGeo = toGeoPoint(branch?.latitude ?? null, branch?.longitude ?? null);
  const mapUri = mapPreviewUrl(mapGeo);
  const shared = (branch?.vehicleCount ?? 0) > 1;

  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{t('addressTitle')}</BlockTitle>

        {!vehicle.branch ? (
          <Callout tone="warning">{t('addressMissing')}</Callout>
        ) : (
          <>
            <Text col={colors.text} fos={fontSize.bodySm}>
              {addressLine || t('addressNoStreet')}
            </Text>
            {branchName ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {branchName}
              </Text>
            ) : null}
            {/*
              Bản đồ vị trí xe — cùng khối `StaticMap` mà `InformationSection` bên web dựng, qua
              ảnh tĩnh Geoapify (ADR 0037). Chú thích cũ ở đây nói native "không có bản đồ nhúng"
              và web dùng `EmbedMap` + khoá Google: cả hai vế đều đã hết đúng.

              Chưa tra được toạ độ thì câu "chưa định vị được" ở lại nguyên chỗ cũ — đó vẫn là
              thứ cần nói, và nó phân biệt "chưa có gì để chỉ" với "bản đồ hỏng".
            */}
            {mapGeo && mapUri ? (
              <YStack gap={space.xs}>
                <MapPreview
                  uri={mapUri}
                  unavailableLabel={tStates('imageUnavailable')}
                  busyLabel={tStates('loading')}
                  onOpen={() => void Linking.openURL(mapAppUrl(mapGeo))}
                  openLabel={t('addressMapTitle')}
                />
                {/* Nhắc ra thành chữ: một tấm ảnh bản đồ không tự nói rằng nó bấm được. */}
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={tAddress('map.openInGoogleMaps')}
                  onPress={() => void Linking.openURL(mapAppUrl(mapGeo))}
                >
                  <Text col={colors.primaryActive} fos={fontSize.label}>
                    {tAddress('map.openInGoogleMaps')}
                  </Text>
                </Pressable>
              </YStack>
            ) : branch?.address ? (
              <Text col={colors.placeholder} fos={fontSize.label}>
                {t('addressMapPending')}
              </Text>
            ) : null}

            {shared ? (
              <Callout
                tone="warning"
                title={t('addressSharedTitle', { count: branch?.vehicleCount ?? 0 })}
              >
                {t('addressSharedBody')}
              </Callout>
            ) : (
              <Text col={colors.placeholder} fos={fontSize.label}>
                {t('addressBranchHint')}
              </Text>
            )}
          </>
        )}
      </YStack>
    </Card>
  );
}

/**
 * Tiện ích xe — dải chip chọn nhiều, LỌC THEO LOẠI XE.
 *
 * `vehicleFeatureAppliesTo` là bộ lọc web dùng ở `FeaturesSelect`. Thiếu nó, một chiếc xe máy
 * được mời gắn "Cửa sổ trời" và "Ghế trẻ em" — và vì tiện ích là một chiều lọc ngoài chợ, giá trị
 * vô nghĩa đó không chỉ xấu mà còn làm sai kết quả tìm kiếm.
 */
function FeaturesField({
  control,
  vehicleType,
  disabled,
}: {
  control: Control<VehicleFormValues>;
  vehicleType: string;
  disabled: boolean;
}) {
  const t = useTranslations('Vehicles.form.media');
  const { catalog } = useCatalog();
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
        const selected = field.value ?? [];
        return (
          <YStack gap={space.xs}>
            <FieldLabel label={t('features')} />
            <XStack flexWrap="wrap" gap={space.xs}>
              {features.map((item) => {
                const key = item.key as (typeof selected)[number];
                const active = selected.includes(key);
                return (
                  <Chip
                    key={item.key}
                    label={item.label}
                    selected={active}
                    {...(disabled ? { disabled: true } : {})}
                    onPress={() =>
                      field.onChange(
                        active ? selected.filter((k) => k !== key) : [...selected, key],
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
