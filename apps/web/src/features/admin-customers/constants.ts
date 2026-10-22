import { CUSTOMER_LICENCE_STATE, STATUS_COLOR, type CustomerLicenceState } from '@xeprime/types';

/** Màu nhãn tình trạng bằng lái của khách — nhãn dịch ở `AdminCustomers.licenceState`. */
export const CUSTOMER_LICENCE_STATE_COLOR: Readonly<Record<CustomerLicenceState, string>> = {
  [CUSTOMER_LICENCE_STATE.NONE]: STATUS_COLOR.NEUTRAL,
  [CUSTOMER_LICENCE_STATE.PROCESSING]: STATUS_COLOR.PROCESSING,
  [CUSTOMER_LICENCE_STATE.VERIFIED]: STATUS_COLOR.SUCCESS,
  [CUSTOMER_LICENCE_STATE.REJECTED]: STATUS_COLOR.DANGER,
};
