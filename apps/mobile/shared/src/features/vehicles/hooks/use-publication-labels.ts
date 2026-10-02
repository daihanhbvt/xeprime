import { useCallback, useMemo } from 'react';
import { useTranslations } from 'use-intl';
import type { PublishRequirement } from '@xeprime/types';
import { publishGapFields, type missingPublishRequirementsForForm } from '../publication';

/**
 * Chữ cho điều kiện lên chợ — BẢN NATIVE (phần cần cho form) của
 * apps/web/src/features/vehicles/hooks/use-publication-labels.ts. Cùng khoá, cùng cách ghép.
 */
export interface PublicationLabels {
  /** Nhãn một điều kiện lên chợ: `'mainImage'` → "Ảnh đại diện". */
  requirement: (key: PublishRequirement) => string;
  /**
   * Danh sách điều kiện còn thiếu của một FORM, nêu từng Ô cụ thể với hai điều kiện gộp nhiều
   * trường (danh tính · thông số năng lượng) — "Phân khúc xe, Dung tích động cơ (cc)".
   */
  formGaps: (
    keys: readonly PublishRequirement[],
    values: Parameters<typeof missingPublishRequirementsForForm>[0],
  ) => string;
}

export function usePublicationLabels(): PublicationLabels {
  const t = useTranslations('Vehicles.publish');
  const tSpecs = useTranslations('Vehicles.form.specs');
  const tAdvanced = useTranslations('Vehicles.form.advanced');

  const requirement = useCallback(
    (key: PublishRequirement) => t(`requirements.${key}` as 'requirements.plateNumber'),
    [t],
  );

  const formGaps = useCallback<PublicationLabels['formGaps']>(
    (keys, values) =>
      keys
        .flatMap((key) => {
          const fields = publishGapFields(key, values);
          if (fields.length === 0) return [requirement(key)];
          return fields.map((field) => {
            switch (field) {
              case 'fuelConsumptionCombined':
                return tAdvanced('consumption');
              case 'engineDisplacementCc':
                return tAdvanced('engineDisplacementCc');
              case 'electricRangeKm':
                return tAdvanced('electricRange');
              case 'transmission':
                return tAdvanced('transmission');
              default:
                return tSpecs(field as 'brand');
            }
          });
        })
        .join(', '),
    [requirement, tSpecs, tAdvanced],
  );

  return useMemo(() => ({ requirement, formGaps }), [requirement, formGaps]);
}
