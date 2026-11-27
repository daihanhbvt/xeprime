import {
  COLLATERAL_COMBINATION,
  COLLATERAL_MODE,
  LEGACY_COLLATERAL_MODE,
  type CollateralCombination,
} from '@xeprime/types';
import { isZeroMoney } from './money';

/**
 * Hình dạng cọc mà mọi bề mặt nhận vào (ADR 0112 điều 2): chính sách của form (`collateralMode` …),
 * listing công khai (`mode` / `cashEnabled` …) hay snapshot cũ chỉ có `cash` / `asset`. Nơi gọi chép
 * các trường mình có sang hình dạng này - trường vắng được suy ra ở `normalizeCollateral`.
 */
export interface CollateralLike {
  /** `required` | `none`, hoặc mã CŨ `cash` | `asset` của snapshot trước 27/11/2026. */
  mode: string | null | undefined;
  cashEnabled?: boolean | null;
  assetEnabled?: boolean | null;
  combination?: string | null;
  assetTypes?: readonly string[] | null;
  /** Chuỗi tiền (ADR 0007). */
  depositAmount?: string | null;
}

export interface NormalizedCollateral {
  /** Miễn thế chấp. */
  none: boolean;
  /** Có cọc tiền - số tiền ở `depositAmount` (có thể `null` khi nguồn không ghi số). */
  cash: boolean;
  asset: boolean;
  combination: CollateralCombination;
  assetTypes: readonly string[];
  depositAmount: string | null;
}

/**
 * Quy mọi đời dữ liệu cọc về MỘT hình dạng. Mã cũ `cash` / `asset` là `required` + đúng một hình
 * thức; `required` thiếu hai cờ (bản ghi giữa hai đời) thì suy từ số tiền / danh mục tài sản.
 * `null` khi nguồn không nói gì về cọc (đừng đoán "miễn thế chấp").
 */
export function normalizeCollateral(
  input: CollateralLike | null | undefined,
): NormalizedCollateral | null {
  if (!input || !input.mode) return null;
  const assetTypes = input.assetTypes ?? [];
  const depositAmount =
    input.depositAmount != null && !isZeroMoney(input.depositAmount) ? input.depositAmount : null;
  const combination =
    input.combination === COLLATERAL_COMBINATION.ALL
      ? COLLATERAL_COMBINATION.ALL
      : COLLATERAL_COMBINATION.ANY_ONE;
  if (input.mode === COLLATERAL_MODE.NONE) {
    return {
      none: true,
      cash: false,
      asset: false,
      combination: COLLATERAL_COMBINATION.ANY_ONE,
      assetTypes: [],
      depositAmount: null,
    };
  }
  if (input.mode === LEGACY_COLLATERAL_MODE.CASH) {
    return { none: false, cash: true, asset: false, combination, assetTypes: [], depositAmount };
  }
  if (input.mode === LEGACY_COLLATERAL_MODE.ASSET) {
    return { none: false, cash: false, asset: true, combination, assetTypes, depositAmount: null };
  }
  const cash = input.cashEnabled ?? depositAmount != null;
  const asset = input.assetEnabled ?? assetTypes.length > 0;
  return {
    none: false,
    cash,
    asset,
    // "Bắt buộc cả 2" chỉ có nghĩa khi cả hai hình thức bật (CHECK ở DB).
    combination: cash && asset ? combination : COLLATERAL_COMBINATION.ANY_ONE,
    assetTypes: asset ? assetTypes : [],
    depositAmount: cash ? depositAmount : null,
  };
}

/** Chữ do nơi gọi dịch (ADR 0012) - hàm này chỉ ghép, không biết ngôn ngữ. */
export interface CollateralCopy {
  money: (amount: string) => string;
  assetLabel: (code: string) => string;
  /** "Miễn thế chấp". */
  none: string;
  /** "Cọc tiền {amount}" - nhận số ĐÃ định dạng. */
  cash: (formattedAmount: string) => string;
  /** "Cọc tiền" khi nguồn không ghi số. */
  cashNoAmount: string;
  /** "Cọc tài sản ({assets})" - nhận danh sách ĐÃ ghép. */
  asset: (assets: string) => string;
  /**
   * "Cọc tài sản (một trong: {assets})" - khi chấp nhận từ 2 loại trở lên, khách đưa MỘT loại.
   * Vắng thì dùng `asset` (bản app chưa cập nhật message).
   */
  assetOneOf?: (assets: string) => string;
  /** "Cọc tài sản" khi chưa chọn loại. */
  assetNoTypes: string;
  /** "{cash} hoặc {asset}". */
  anyOne: (cash: string, asset: string) => string;
  /** "{cash} và {asset}". */
  all: (cash: string, asset: string) => string;
  /** Ngăn cách các loại tài sản - mặc định ", ". */
  assetSeparator?: string;
}

/**
 * "Cọc tài sản (A)" khi chỉ một loại, "Cọc tài sản (một trong: A, B)" khi nhiều loại - danh mục là
 * các loại ĐƯỢC CHẤP NHẬN, khách chỉ đưa một (ADR 0112 điều 2).
 */
export function describeAssetTypes(
  assetTypes: readonly string[],
  copy: Pick<CollateralCopy, 'assetLabel' | 'asset' | 'assetOneOf' | 'assetSeparator'>,
): string {
  const list = assetTypes.map(copy.assetLabel).join(copy.assetSeparator ?? ', ');
  return assetTypes.length > 1 && copy.assetOneOf ? copy.assetOneOf(list) : copy.asset(list);
}

/**
 * MỘT câu mô tả cọc cho mọi bề mặt (trang xe, yêu cầu, đơn, duyệt xe, wizard):
 * "Cọc tiền X hoặc Cọc tài sản (…)" / "Cọc tiền X và Cọc tài sản (…)" / "Miễn thế chấp".
 * `null` khi nguồn không có dữ liệu cọc, hoặc `required` mà chưa bật hình thức nào.
 */
export function describeCollateral(
  input: CollateralLike | null | undefined,
  copy: CollateralCopy,
): string | null {
  const c = normalizeCollateral(input);
  if (!c) return null;
  if (c.none) return copy.none;
  const cashText = c.cash
    ? c.depositAmount
      ? copy.cash(copy.money(c.depositAmount))
      : copy.cashNoAmount
    : null;
  const assetText = c.asset
    ? c.assetTypes.length > 0
      ? describeAssetTypes(c.assetTypes, copy)
      : copy.assetNoTypes
    : null;
  if (cashText && assetText) {
    return c.combination === COLLATERAL_COMBINATION.ALL
      ? copy.all(cashText, assetText)
      : copy.anyOne(cashText, assetText);
  }
  return cashText ?? assetText;
}
