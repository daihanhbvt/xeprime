import {
  PAYMENT_METHOD_META,
  PAYMENT_METHOD_VALUES,
  RECEIPT_STATUS_META,
  RECEIPT_STATUS_VALUES,
  RECEIPT_TYPE,
  RECEIPT_TYPE_META,
  RECEIPT_TYPE_VALUES,
} from '@xeprime/types';

export const RECEIPTS_DEFAULT_LIMIT = 20;

export const RECEIPT_TYPE_OPTIONS = RECEIPT_TYPE_VALUES.map((v) => ({
  value: v,
  label: RECEIPT_TYPE_META[v].label,
}));

export const RECEIPT_STATUS_OPTIONS = RECEIPT_STATUS_VALUES.map((v) => ({
  value: v,
  label: RECEIPT_STATUS_META[v].label,
}));

export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHOD_VALUES.map((v) => ({
  value: v,
  label: PAYMENT_METHOD_META[v].label,
}));

export { RECEIPT_TYPE };
