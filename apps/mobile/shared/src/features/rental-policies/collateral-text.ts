import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { describeCollateral, type CollateralLike } from '@xeprime/domain';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';

/**
 * Câu mô tả cọc cho MỌI bề mặt app (ADR 0112 điều 2): "Cọc tiền X hoặc Cọc tài sản (…)", "… và …",
 * "Miễn thế chấp". Bản native của web `useDescribeCollateral` - logic ghép ở `@xeprime/domain`
 * (`describeCollateral`), ở đây chỉ nối chữ `Domain.collateralSummary` và định dạng tiền.
 */
export function useDescribeCollateral(): (input: CollateralLike | null | undefined) => string | null {
  const t = useTranslations('Domain.collateralSummary');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  return useCallback(
    (input) =>
      describeCollateral(input, {
        money: (amount) => fmt.money(amount),
        assetLabel: (code) => domainLabel('collateralAssetType', code),
        none: t('none'),
        cash: (amount) => t('cash', { amount }),
        cashNoAmount: t('cashNoAmount'),
        asset: (assets) => t('asset', { assets }),
        assetOneOf: (assets) => t('assetOneOf', { assets }),
        assetNoTypes: t('assetNoTypes'),
        anyOne: (cash, asset) => t('anyOne', { cash, asset }),
        all: (cash, asset) => t('all', { cash, asset }),
      }),
    [t, domainLabel, fmt],
  );
}

/** Chính sách dạng form/API (`collateralMode` …) → hình dạng `describeCollateral` nhận (web). */
export function policyCollateral(
  policy:
    | {
        collateralMode?: string | null;
        collateralCashEnabled?: boolean | null;
        collateralAssetEnabled?: boolean | null;
        collateralCombination?: string | null;
        collateralAssetTypes?: readonly string[] | null;
        depositAmount?: string | number | null;
      }
    | null
    | undefined,
): CollateralLike | null {
  if (!policy?.collateralMode) return null;
  return {
    mode: policy.collateralMode,
    cashEnabled: policy.collateralCashEnabled,
    assetEnabled: policy.collateralAssetEnabled,
    combination: policy.collateralCombination,
    assetTypes: policy.collateralAssetTypes,
    depositAmount: policy.depositAmount == null ? null : String(policy.depositAmount),
  };
}
