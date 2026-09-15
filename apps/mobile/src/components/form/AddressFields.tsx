import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useController,
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
} from 'react-hook-form';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LOCATION_SOURCE } from '@xeprime/types';
import { Callout } from '@/components/ui/Callout';
import { FieldLabel } from '@/components/ui/Field';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import {
  PLACE_SEARCH_MIN_LENGTH,
  usePlaceDetail,
  usePlaceSearch,
  useReverseGeocode,
} from '@/features/locations/hooks/use-places';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { useWardOptions } from '@/features/locations/hooks/use-wards';
import { MAP_PREVIEW_RATIO, mapAppUrl, mapPreviewUrl, toGeoPoint } from '@/lib/map-static';
import { colors, fieldFontSize, fontSize, iconSize, radius, space } from '@/theme/tokens';

/** Tên ba trường HÀNH CHÍNH + chi tiết — bản native của `AddressFieldNames` bên web. */
export interface AddressFieldNames<T extends FieldValues> {
  provinceCode: Path<T>;
  wardCode: Path<T>;
  addressLine: Path<T>;
}

/** Tên bốn trường GHIM. Bỏ trống = địa chỉ này không lưu toạ độ (sổ khách). */
export interface AddressPinNames<T extends FieldValues> {
  placeId: Path<T>;
  latitude: Path<T>;
  longitude: Path<T>;
  locationSource: Path<T>;
}

const styles = StyleSheet.create({
  map: { width: '100%', aspectRatio: MAP_PREVIEW_RATIO },
});

/**
 * Ô nhập ĐỊA CHỈ VẬT LÝ trên native — cùng ba bước với `AddressField` của web, cùng dữ liệu,
 * cùng luật; chỉ khác cách bày.
 *
 * 1. **Tỉnh/thành** và 2. **xã/phường/đặc khu** chọn từ DANH MỤC NHÀ NƯỚC (mô hình hai cấp, hiệu
 *    lực 01/07/2025 — không có quận/huyện). Ô chọn cấp xã có ô TÌM vì một tỉnh có tới 168 đơn vị,
 *    và phép tìm chạy ở server trên khoá đã bỏ dấu.
 * 3. **Số nhà, đường** thì GÕ, kèm danh sách gợi ý địa điểm. Không danh mục nhà nước nào phát
 *    hành số nhà và tên đường.
 *
 * **Khác web ở phần BẢN ĐỒ, và chỉ ở đó.** Web có bản đồ tương tác kéo được ghim; native hiện ẢNH
 * bản đồ tĩnh (Maps Static API) — chạm vào thì mở bản đồ THẬT của hệ điều hành. Lý do không kéo
 * `react-native-maps` vào cho đúng một khối kiểm ghim: `lib/map-static.ts`. Người dùng vẫn CHỈNH
 * được ghim: chọn một gợi ý địa điểm khác là ghim nhảy theo.
 */
export function AddressFields<T extends FieldValues>({
  control,
  names,
  pin,
  title,
  required,
  disabled,
}: {
  control: Control<T>;
  names: AddressFieldNames<T>;
  pin?: AddressPinNames<T>;
  title?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations('Address');
  const province = useController({ control, name: names.provinceCode });
  const ward = useController({ control, name: names.wardCode });

  const provinceCode = (province.field.value as string | null) ?? '';
  const wardCode = (ward.field.value as string | null) ?? '';

  const provinces = useProvinceOptions();
  const [wardSearch, setWardSearch] = useState('');
  const wards = useWardOptions(provinceCode, wardSearch);

  /**
   * Đổi tỉnh ⇒ mã xã cũ chắc chắn sai. Xoá ngay thay vì để backend từ chối lúc lưu: FK tổ hợp
   * `(ward_code, province_code)` chặn được, nhưng người dùng nhận một lỗi không giải thích được.
   *
   * Ref khởi tạo bằng CHÍNH giá trị đầu tiên, nên form mở ở chế độ sửa (đã có tỉnh + xã) không
   * bị coi là "vừa đổi tỉnh" và không xoá mất xã đã lưu.
   */
  const lastProvinceRef = useRef(provinceCode);
  useEffect(() => {
    // So sánh BÊN TRONG effect: đọc `ref.current` giữa lượt render là thứ React Compiler chặn,
    // và ở đây không cần — thứ quyết định có xoá hay không là lần chạy effect, không phải render.
    if (lastProvinceRef.current === provinceCode) return;
    lastProvinceRef.current = provinceCode;
    ward.field.onChange('' as PathValue<T, Path<T>>);
    setWardSearch('');
    // `ward.field` đổi định danh mỗi lần render; phụ thuộc vào nó sẽ xoá ô xã ở mọi lần gõ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provinceCode]);

  const locationContext = useMemo(() => {
    const wardName = wards.items.find((w) => w.code === wardCode)?.name ?? '';
    const provinceName = provinces.options.find((p) => p.value === provinceCode)?.label ?? '';
    return [wardName, provinceName].filter(Boolean).join(', ');
  }, [wards.items, wardCode, provinces.options, provinceCode]);

  return (
    <YStack gap={space.md}>
      {title ? <FieldLabel label={title} required={required} /> : null}

      {provinces.isError ? <Callout tone="warning" title={t('provinceLoadError')} /> : null}

      <SelectField
        control={control}
        name={names.provinceCode}
        label={t('provinceLabel')}
        options={provinces.options}
        required={required ?? false}
        disabled={(disabled ?? false) || provinces.isError}
        placeholder={t('provincePlaceholder')}
      />

      <SelectField
        control={control}
        name={names.wardCode}
        label={t('wardLabel')}
        options={wards.options}
        required={required ?? false}
        disabled={(disabled ?? false) || !provinceCode}
        placeholder={provinceCode ? t('wardPlaceholder') : t('wardNeedsProvince')}
        onSearch={setWardSearch}
        searchPlaceholder={t('wardPlaceholder')}
        emptyText={wards.isError ? t('wardLoadError') : t('wardEmpty')}
        {...(wards.isError ? { hint: t('wardLoadError') } : {})}
      />

      {pin ? (
        <AddressLocationSection
          control={control}
          addressLineName={names.addressLine}
          pin={pin}
          provinceCode={provinceCode}
          locationContext={locationContext}
          required={required ?? false}
          disabled={disabled ?? false}
        />
      ) : (
        <TextField
          control={control}
          name={names.addressLine}
          label={t('addressLineLabel')}
          placeholder={t('addressLinePlaceholder')}
          required={required ?? false}
          editable={!disabled}
        />
      )}
    </YStack>
  );
}

/**
 * Phần "số nhà, đường + ghim" — component riêng để **hook chỉ chạy khi ô này thật sự lưu toạ độ**.
 * Gọi `useController` cho bốn trường ghim ngay trong `AddressFields` sẽ nổ ở form không khai
 * chúng, mà hook thì không gọi có điều kiện được.
 */
function AddressLocationSection<T extends FieldValues>({
  control,
  addressLineName,
  pin,
  provinceCode,
  locationContext,
  required,
  disabled,
}: {
  control: Control<T>;
  addressLineName: Path<T>;
  pin: AddressPinNames<T>;
  provinceCode: string;
  locationContext: string;
  required: boolean;
  disabled: boolean;
}) {
  const t = useTranslations('Address');
  const tStates = useTranslations('Common.states');

  const addressLine = useController({ control, name: addressLineName });
  const placeId = useController({ control, name: pin.placeId });
  const latitude = useController({ control, name: pin.latitude });
  const longitude = useController({ control, name: pin.longitude });
  const locationSource = useController({ control, name: pin.locationSource });

  const line = (addressLine.field.value as string | null) ?? '';
  const point = toGeoPoint(
    latitude.field.value as number | null,
    longitude.field.value as number | null,
  );

  const placeQuery = line.trim()
    ? `${line.trim()}${locationContext ? `, ${locationContext}` : ''}`
    : '';
  const suggestions = usePlaceSearch(placeQuery, {
    biasPoint: point,
    // Chưa chọn tỉnh thì không hỏi: gợi ý lúc đó rải khắp cả nước, và mỗi lượt hỏi có tính tiền.
    enabled: !disabled && Boolean(provinceCode),
  });
  const placeDetail = usePlaceDetail();
  const reverse = useReverseGeocode();

  const [provinceMismatch, setProvinceMismatch] = useState(false);
  const [pinAddress, setPinAddress] = useState<string | null>(null);

  const onPickSuggestion = async (id: string) => {
    const result = await placeDetail.mutateAsync(id).catch(() => null);
    const place = result?.place;
    if (!place) return;

    placeId.field.onChange((place.placeId ?? null) as PathValue<T, Path<T>>);
    latitude.field.onChange(Number(place.latitude) as PathValue<T, Path<T>>);
    longitude.field.onChange(Number(place.longitude) as PathValue<T, Path<T>>);
    locationSource.field.onChange(LOCATION_SOURCE.GOOGLE_PLACE as PathValue<T, Path<T>>);
    setPinAddress(place.formattedAddress ?? null);
    // Chỉ điền phần "số nhà, đường" nhà cung cấp tách ra — dán nguyên chuỗi đầy đủ vào ô là mang
    // theo tên quận/phường CŨ, rồi bị ghép thêm một lần nữa lúc lưu.
    if (place.suggestedAddressLine) {
      addressLine.field.onChange(place.suggestedAddressLine as PathValue<T, Path<T>>);
    }
    setProvinceMismatch(
      Boolean(place.suggestedProvinceCode) && place.suggestedProvinceCode !== provinceCode,
    );
  };

  /** Đổi tỉnh ⇒ ghim cũ nằm ở tỉnh khác. Bỏ nó thay vì mang theo một toạ độ chắc chắn sai. */
  const lastProvinceRef = useRef(provinceCode);
  useEffect(() => {
    // So sánh BÊN TRONG effect — xem ghi chú cùng loại ở `AddressFields`.
    if (lastProvinceRef.current === provinceCode) return;
    lastProvinceRef.current = provinceCode;
    placeId.field.onChange(null as PathValue<T, Path<T>>);
    latitude.field.onChange(null as PathValue<T, Path<T>>);
    longitude.field.onChange(null as PathValue<T, Path<T>>);
    locationSource.field.onChange(null as PathValue<T, Path<T>>);
    setPinAddress(null);
    setProvinceMismatch(false);
    // Các `field` của RHF đổi định danh mỗi render — xem ghi chú cùng loại ở `AddressFields`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provinceCode]);

  /** Đọc lại địa chỉ chữ của ghim đang có (dữ liệu cũ mở ra lần đầu chưa có chú thích nào). */
  useEffect(() => {
    if (!point || pinAddress || reverse.isPending) return;
    void reverse
      .mutateAsync(point)
      .then((r) => setPinAddress(r.place?.formattedAddress ?? null))
      .catch(() => setPinAddress(null));
    // Chạy khi có ghim mà chưa có chú thích; `reverse` là mutation ổn định của TanStack Query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.lat, point?.lng]);

  const source = locationSource.field.value as string | null;
  const needsPinCheck = point != null && source !== LOCATION_SOURCE.GOOGLE_PLACE;
  const preview = mapPreviewUrl(point);
  const items = suggestions.data?.items ?? [];

  return (
    <YStack gap={space.sm}>
      <TextField
        control={control}
        name={addressLineName}
        label={t('addressLineLabel')}
        placeholder={t('addressLinePlaceholder')}
        required={required}
        editable={!disabled}
      />

      {/*
        Gợi ý là một DANH SÁCH ngay dưới ô, không phải dropdown nổi: trên màn 360dp một lớp nổi
        che mất chính ô người dùng đang gõ, và bàn phím đã chiếm nửa dưới màn hình rồi.
      */}
      {items.length > 0 && line.trim().length >= PLACE_SEARCH_MIN_LENGTH ? (
        <YStack br={radius.md} bw={1} bc={colors.border} ov="hidden">
          {items.map((item) => (
            <Pressable
              key={item.placeId}
              accessibilityRole="button"
              accessibilityLabel={item.primaryText}
              onPress={() => void onPickSuggestion(item.placeId)}
            >
              <XStack ai="flex-start" gap={space.sm} px={space.md} py={space.sm}>
                <Ionicons name="location-outline" size={iconSize.sm} color={colors.textMuted} />
                <YStack f={1}>
                  <Text col={colors.text} fos={fieldFontSize.value} numberOfLines={1}>
                    {item.primaryText}
                  </Text>
                  {item.secondaryText ? (
                    <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
                      {item.secondaryText}
                    </Text>
                  ) : null}
                </YStack>
              </XStack>
            </Pressable>
          ))}
        </YStack>
      ) : null}

      {provinceMismatch ? (
        <Callout tone="warning" title={t('provinceMismatchTitle')}>
          {t('provinceMismatchHint')}
        </Callout>
      ) : null}

      {needsPinCheck ? <Callout tone="info" title={t('pinNeedsCheck')} /> : null}

      <YStack gap={space.xs}>
        <FieldLabel label={t('mapLabel')} />
        {point && preview ? (
          <>
            <Pressable
              onPress={() => void Linking.openURL(mapAppUrl(point))}
              accessibilityRole="imagebutton"
              accessibilityLabel={t('map.openInMaps')}
            >
              <YStack style={styles.map} br={radius.md} bw={1} bc={colors.border} ov="hidden">
                <RemoteImage
                  uri={preview}
                  radius={radius.md}
                  fallback={
                    <Text col={colors.textMuted} fos={fontSize.label}>
                      {tStates('imageUnavailable')}
                    </Text>
                  }
                />
              </YStack>
            </Pressable>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('map.readOnlyHint')}
            </Text>
          </>
        ) : (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('noPinYet')}
          </Text>
        )}
        {pinAddress ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('pinAt', { address: pinAddress })}
          </Text>
        ) : null}
      </YStack>
    </YStack>
  );
}
