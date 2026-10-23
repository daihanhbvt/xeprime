import type { components } from './api.generated';
import { VEHICLE_TYPE, type VehicleType } from './status/vehicle';

/**
 * Xe yêu thích của tài khoản khách (BRD customer favorites, 21/10/2026).
 *
 * Hằng số mà API và các client phải nói CÙNG một con số — đặt ở đây để trần phía server và cỡ lô
 * phía client không trôi khỏi nhau.
 */

/**
 * Số xe tối đa trong MỘT lượt hỏi "xe nào tôi đã thích" (`GET /account/favorites/status`).
 *
 * Bằng trần một trang kết quả chợ (48) cộng dư — một trang tìm kiếm là đúng một lượt hỏi. Client
 * gom các thẻ đang hiện thành lô không vượt số này; server từ chối lô lớn hơn thay vì âm thầm cắt.
 */
export const FAVORITE_STATUS_MAX_IDS = 100;

/** Danh sách "Xe yêu thích": mặc định 12 thẻ/trang (một lưới 3–4 cột), trần 48 như chợ. */
export const FAVORITE_LIST_DEFAULT_LIMIT = 12;
export const FAVORITE_LIST_MAX_LIMIT = 48;

/**
 * Tab mặc định của trang Xe yêu thích — luôn Ô tô (giả định đã chốt cho BRD §9 câu 5: tab sống
 * trên URL, không nhớ lần trước).
 */
export const FAVORITE_DEFAULT_VEHICLE_TYPE: VehicleType = VEHICLE_TYPE.CAR;

type Schemas = components['schemas'];

/** Một thẻ trong danh sách Xe yêu thích — thẻ chợ + `favoritedAt` (sinh từ OpenAPI, ADR 0007). */
export type FavoriteVehicle = Schemas['FavoriteVehicleDto'];
export type FavoriteStatus = Schemas['FavoriteStatusDto'];
export type FavoriteToggleResult = Schemas['FavoriteToggleResultDto'];
