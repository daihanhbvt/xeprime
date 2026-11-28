import { useQuery } from '@tanstack/react-query';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { queryKeys } from '@xeprime/api-client';
import { RENT_REFERENCE_BASIS, type VehicleDataRentField } from '@xeprime/types';
import {
  vehicleDataApi,
  type VehicleDataSuggestion,
  type VehicleDataValue,
} from '@/api/catalog';
import { Ionicons } from '@/components/icons/Ionicons';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

/**
 * Gợi ý từ Dữ liệu xe khi đăng/sửa xe (ADR 0090) - bản native của `CatalogSuggestions` bên web: GỢI Ý,
 * không tự điền; lỗi mạng thì im lặng biến mất (gợi ý không được chặn việc đăng xe).
 */
export function useVehicleCatalogSuggestion(params: {
  modelId: string | null | undefined;
  variantId: string | null | undefined;
  year: number | null | undefined;
  vehicleId?: string | null;
}): VehicleDataSuggestion | null {
  const { modelId, variantId, year, vehicleId } = params;
  const query = {
    modelId: modelId ?? '',
    variantId: variantId ?? null,
    year: year ?? null,
    vehicleId: vehicleId ?? null,
  };
  const { data } = useQuery({
    // Cùng query key với web - một nghĩa, một khoá.
    queryKey: queryKeys.catalog.suggestion(query),
    queryFn: () => vehicleDataApi.suggestion({ ...query, modelId: modelId! }),
    enabled: Boolean(modelId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data ?? null;
}

/** Nút chữ "Dùng giá này" - liên kết nhỏ dưới ô nhập. */
function HintAction({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Text
      col={colors.brandLink}
      fos={fontSize.bodySm}
      fow={fontWeight.semibold}
      onPress={onPress}
      accessibilityRole="button"
    >
      {label}
    </Text>
  );
}

/** Câu "Giá trị tham khảo: … (căn cứ)" - dùng chung cho dòng gợi ý và chú thích ô (wizard thêm xe). */
export function useCatalogValueText() {
  const t = useTranslations('Vehicles.form.catalog');
  const fmt = useAppFormat();
  return (value: VehicleDataValue) => {
    const basis =
      value.age > 0
        ? t('valueBasis', { age: value.age, percent: value.residualPercent })
        : t('valueBasisNew');
    return `${t('valueHint', { amount: fmt.money(value.amount) })} ${basis}`;
  };
}

/** Giá trị xe tham khảo cho bảo hiểm - giá xe mới × khấu hao theo tuổi xe. */
export function CatalogValueHint({
  value,
  onApply,
}: {
  value: VehicleDataValue;
  onApply: (amount: number) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.catalog');
  const text = useCatalogValueText()(value);
  return (
    <YStack gap={2}>
      <XStack ai="flex-start" gap={space.xs}>
        <Ionicons name="information-circle-outline" size={iconSize.sm} color={colors.textMuted} />
        <Text col={colors.textMuted} fos={fontSize.bodySm} f={1}>
          {text}
        </Text>
      </XStack>
      <HintAction label={t('useValue')} onPress={() => onApply(Number(value.amount))} />
    </YStack>
  );
}

/**
 * Câu gợi ý của MỘT ô giá (giá tham khảo + khoảng giá trên chợ) - wizard thêm xe nhét nó vào ⓘ của ô,
 * vì giá đã TỰ ĐIỀN (`useAutofillCatalogRent`) nên không còn nút "Dùng …". `null` = không có gì.
 */
export function useCatalogRentText() {
  const t = useTranslations('Vehicles.form.catalog');
  const fmt = useAppFormat();
  return (suggestion: VehicleDataSuggestion | null, field: VehicleDataRentField): string | null => {
    const rent = suggestion?.rent.find((r) => r.field === field);
    if (!rent || (!rent.reference && !rent.market)) return null;
    const lines: string[] = [];
    if (rent.reference) {
      lines.push(
        rent.referenceBasis === RENT_REFERENCE_BASIS.MODEL
          ? t('rentReferenceModel', { price: fmt.money(rent.reference) })
          : t('rentReference', { price: fmt.money(rent.reference) }),
      );
    }
    if (rent.market) {
      lines.push(
        t('rentMarket', {
          low: fmt.money(rent.market.low),
          high: fmt.money(rent.market.high),
          count: rent.market.sampleSize,
        }),
      );
    }
    return lines.join('\n');
  };
}

/**
 * Gợi ý cho MỘT ô giá: giá tham khảo của XePrime (kèm nút dùng) + khoảng giá cùng dòng trên chợ khi đủ
 * mẫu. Không có gì ⇒ không vẽ.
 */
export function CatalogRentHint({
  suggestion,
  field,
  onApply,
}: {
  suggestion: VehicleDataSuggestion | null;
  field: VehicleDataRentField;
  onApply?: (price: number) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.catalog');
  const fmt = useAppFormat();
  const rent = suggestion?.rent.find((r) => r.field === field);
  if (!rent || (!rent.reference && !rent.market)) return null;
  return (
    <YStack gap={2}>
      {rent.reference ? (
        <XStack ai="flex-start" gap={space.xs} flexWrap="wrap">
          <Ionicons name="information-circle-outline" size={iconSize.sm} color={colors.textMuted} />
          <Text col={colors.textMuted} fos={fontSize.bodySm} f={1}>
            {rent.referenceBasis === RENT_REFERENCE_BASIS.MODEL
              ? t('rentReferenceModel', { price: fmt.money(rent.reference) })
              : t('rentReference', { price: fmt.money(rent.reference) })}
          </Text>
        </XStack>
      ) : null}
      {rent.reference && onApply ? (
        <HintAction
          label={t('useRent', { price: fmt.money(rent.reference) })}
          onPress={() => onApply(Number(rent.reference))}
        />
      ) : null}
      {rent.market ? (
        <Text col={colors.placeholder} fos={fontSize.label}>
          {t('rentMarket', {
            low: fmt.money(rent.market.low),
            high: fmt.money(rent.market.high),
            count: rent.market.sampleSize,
          })}
        </Text>
      ) : null}
    </YStack>
  );
}

/** `CatalogRentHint` tự lấy gợi ý - màn sửa xe, nơi form giá không có sẵn dòng/phiên bản/năm. */
export function CatalogRentHintFor({
  modelId,
  variantId,
  year,
  vehicleId,
  field,
  onApply,
}: {
  modelId: string | null | undefined;
  variantId: string | null | undefined;
  year: number | null | undefined;
  vehicleId?: string | null;
  field: VehicleDataRentField;
  onApply?: (price: number) => void;
}) {
  const suggestion = useVehicleCatalogSuggestion({ modelId, variantId, year, vehicleId });
  return <CatalogRentHint suggestion={suggestion} field={field} onApply={onApply} />;
}
