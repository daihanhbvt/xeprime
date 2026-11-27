'use client';

import { useTranslations } from 'next-intl';
import { describeCollateral, type CollateralLike } from '@xeprime/domain';

import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

/**
 * Câu mô tả cọc cho MỌI bề mặt web (ADR 0112 điều 2): "Cọc tiền X hoặc Cọc tài sản (…)", "… và …",
 * "Miễn thế chấp". Logic ghép ở `@xeprime/domain` (`describeCollateral`, app native dùng cùng hàm);
 * ở đây chỉ nối chữ của namespace `Domain.collateralSummary` và định dạng tiền.
 */
export function useDescribeCollateral(): (input: CollateralLike | null | undefined) => string | null {
  const t = useTranslations('Domain.collateralSummary');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  return (input) =>
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
    });
}

/** Chính sách dạng form/API (`collateralMode` …) → hình dạng `describeCollateral` nhận. */
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
