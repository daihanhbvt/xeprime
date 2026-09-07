import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/** Hồ sơ nhìn từ phía GIAN HÀNG — số tài khoản/CCCD đầy đủ, đây là dữ liệu của chính họ. */
export type SellerProfile = Schemas['SellerProfileDto'];

/** Thân request lưu hồ sơ — mọi trường optional, người bán lưu nháp dần. */
export type SaveSellerProfileInput = Schemas['SaveSellerProfileDto'];
