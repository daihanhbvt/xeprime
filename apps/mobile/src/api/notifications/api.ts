import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Shape sinh từ OpenAPI (ADR 0007) — không viết tay DTO. */
export type RegisterPushDeviceInput = Schemas['RegisterPushDeviceDto'];
export type PushDevice = Schemas['PushDeviceDto'];

/**
 * Thiết bị nhận thông báo đẩy.
 *
 * KHÔNG có `userId`/`sessionId` trong payload, và đó là chủ đích: server lấy cả hai từ phiên
 * (`@CurrentUser`). Một client gửi được `userId` là một client đăng ký được thiết bị đứng tên
 * người khác — rồi nhận mọi thông báo của họ.
 *
 * Cũng KHÔNG có hàm huỷ đăng ký ở đây: đăng xuất native gọi `/auth/mobile/logout`, và server
 * tắt mọi thiết bị của phiên đó trong cùng transaction thu hồi (`NativeSessionService`). Gọi
 * thêm DELETE từ app chỉ là một lời gọi mạng nữa có thể hỏng ở đúng lúc mạng đang chập chờn.
 */
export const pushDeviceApi = {
  register(input: RegisterPushDeviceInput): Promise<PushDevice> {
    return getApiClient().post<PushDevice>('/notifications/device-token', input);
  },
};
