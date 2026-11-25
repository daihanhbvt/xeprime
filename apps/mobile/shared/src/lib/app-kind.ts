import Constants from 'expo-constants';

/**
 * Đang chạy trong app Partner (không phải app khách). Dùng cho các khác biệt GIAO DIỆN chỉ áp app
 * Partner theo feedback thiết kế 20/11/2026 (thanh đầu, dòng mô tả, nút vàng…) - KHÔNG dùng để
 * quyết quyền hay nghiệp vụ.
 *
 * Nhận diện bằng `slug` Expo như `theme/layout.ts`, KHÔNG qua `@/app-profile`: file đó kéo theo
 * routes / deep link, nạp vào component dùng chung là vòng import.
 */
export const IS_PARTNER_APP = Constants.expoConfig?.slug === 'xeprime-partner';

/** Bóng mảnh dưới thanh đầu trang - Figma "Shadow/xs" (`0 1 2px rgba(10,13,18,.05)`). */
export const HEADER_SHADOW = { boxShadow: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)' } as const;
