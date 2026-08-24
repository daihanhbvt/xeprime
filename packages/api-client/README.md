# `@xeprime/api-client`

MỘT client HTTP cho mọi client của XePrime: `apps/web` hôm nay, `apps/mobile` (Expo/React Native)
sau này.

Không `next/*`, không `antd`, không React, không DOM API. Emit CommonJS
(`packages/config/tsconfig/lib.json`) nên Metro đọc được trực tiếp.

## Điều duy nhất hai nền tảng khác nhau

Cách nói "tôi là ai" — và nó được cô lập trong một interface:

```ts
interface AuthTransport {
  credentials(): Promise<AuthCredentials> | AuthCredentials;
}
```

|            | Web                                                                                    | Native                                                                             |
| ---------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Transport  | `webAuthTransport()`                                                                   | `bearerAuthTransport(getAccessToken)`                                              |
| Trả về     | `{ credentials: 'include' }`                                                           | `{ headers: { Authorization: 'Bearer …' } }`                                       |
| Credential | httpOnly session cookie — [ADR 0002](../../docs/decisions/0002-auth-session-cookie.md) | access token 15 phút — [ADR 0017](../../docs/decisions/0017-native-bearer-auth.md) |

Mọi thứ khác — envelope `{ data, meta }`, `ApiClientError`, dựng query string, phân trang, mã lỗi
— dùng chung, không có nhánh nào theo nền tảng.

## Cấu hình ở web

Đã xong, không phải làm gì. `apps/web/src/services/api-client.ts` gọi `configureApiClient()` ở
module scope và re-export mọi ký hiệu cũ, nên 143 chỗ `import … from '@/services/api-client'` không
đổi một dòng:

```ts
configureApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  transport: webAuthTransport(),
});
```

`NEXT_PUBLIC_API_URL` **chỉ** đọc ở đó. Package không bao giờ đọc `process.env`: biến đó không tồn
tại trong bundle RN, và một package dùng chung mà biết tới `NEXT_PUBLIC_*` là một package đã chọn
sẵn nền tảng cho người dùng nó.

## Cấu hình ở app native (Expo)

```ts
// app/lib/api.ts — gọi MỘT lần lúc khởi động
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import {
  anonymousAuthTransport,
  bearerAuthTransport,
  configureApiClient,
  createApiClient,
  getErrorCode,
  mobileAuthApi,
  type MobileTokenPair,
} from '@xeprime/api-client';
import { API_ERROR_CODE } from '@xeprime/types';

/** Client chính — mọi request nghiệp vụ đi qua đây. */
configureApiClient({
  baseUrl: Constants.expoConfig?.extra?.apiUrl as string,
  // Nhận HÀM, không nhận token: package không bao giờ giữ bí mật của một người dùng.
  transport: bearerAuthTransport(() => getFreshAccessToken()),
});

/**
 * Client KHÔNG kèm danh tính — dùng riêng cho đăng nhập và refresh.
 *
 * Đăng nhập thì chưa có token; refresh thì token đã hết hạn. Đi qua client chính sẽ kéo theo một
 * lần đọc SecureStore vô nghĩa, và nếu app có interceptor tự refresh thì thành vòng lặp.
 */
export const authClient = createApiClient({
  baseUrl: Constants.expoConfig?.extra?.apiUrl as string,
  transport: anonymousAuthTransport(),
});
```

Vòng đời token — năm quy tắc, cả năm đến từ ADR 0017:

```ts
const REFRESH_KEY = 'xp_refresh_token';
let accessToken: string | null = null;
let accessExpiresAt = 0;
/**
 * 5. SINGLE-FLIGHT. Đây không phải tối ưu, nó là điều kiện đúng đắn.
 *
 * Refresh token dùng MỘT lần. Nếu ba request cùng thấy access token hết hạn và cùng gọi
 * `/auth/mobile/refresh` với cùng một refresh token, server cho đúng một cái thắng và trả 401 cho
 * hai cái còn lại — và nếu app coi 401-khi-refresh là "phiên chết" thì người dùng bị đá ra ngoài
 * dù chẳng có gì sai. Một promise dùng chung làm trường hợp đó không thể xảy ra.
 */
let inFlight: Promise<string | null> | null = null;

async function login(identifier: string, password: string) {
  const { tokens, user } = await mobileAuthApi.login(authClient, {
    identifier,
    password,
  });
  await storeTokens(tokens);
  return user;
}

async function storeTokens(tokens: MobileTokenPair) {
  accessToken = tokens.accessToken;
  accessExpiresAt = Date.now() + tokens.accessTokenExpiresIn * 1000;
  // 1. Refresh token CHỈ ở Keychain/Keystore. Không AsyncStorage, không file, không redux-persist.
  await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken);
}

function getFreshAccessToken(): Promise<string | null> {
  // 2. Access token ở MEMORY. Nó sống 15 phút; ghi xuống đĩa chỉ thêm một chỗ để rò.
  if (accessToken && Date.now() < accessExpiresAt - 30_000)
    return Promise.resolve(accessToken);
  inFlight ??= refreshOnce().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function refreshOnce(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refreshToken) return null;

  try {
    const next = await mobileAuthApi.refresh(authClient, { refreshToken });
    // 3. Refresh XOAY: token cũ chết ngay. Không ghi đè token mới = lần refresh sau bị coi là
    //    replay và cả phiên bị thu hồi.
    await storeTokens(next);
    return next.accessToken;
  } catch (error) {
    // Server đã nói phiên chết (`SESSION_EXPIRED`). Đừng retry: nếu nó chết vì phát hiện replay
    // thì retry chỉ làm ồn. Xoá sạch và đưa về màn đăng nhập.
    if (getErrorCode(error) === API_ERROR_CODE.SESSION_EXPIRED)
      await clearSession();
    throw error;
  }
}

async function logout() {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  // 4. Gọi logout để thu hồi phía SERVER. Chỉ xoá local là để phiên sống tiếp 60 ngày trên server.
  if (refreshToken) await mobileAuthApi.logout(authClient, { refreshToken });
  await clearSession();
}

async function clearSession() {
  accessToken = null;
  accessExpiresAt = 0;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}
```

Ba lỗi hay gặp, đều làm người dùng bị đăng xuất oan:

| Lỗi                                             | Hậu quả                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| Không single-flight                             | Nhiều request song song → mỗi cái một lần refresh → cái thua nhận 401 |
| Không lưu refresh token MỚI sau mỗi lần refresh | Lần sau gửi token cũ ⇒ server coi là replay ⇒ **thu hồi cả phiên**    |
| Retry khi refresh trả `SESSION_EXPIRED`         | Phiên đã chết; retry chỉ tạo thêm log và trì hoãn màn đăng nhập       |

## Quyền và tenant scope

Không nằm trong token — cả web lẫn native. `GET /auth/me` là chỗ duy nhất trả chúng, và nó đọc DB
mỗi lần gọi (ADR 0002 ràng buộc 1, ADR 0017 §1). Với native, `POST /auth/mobile/login` và
`/auth/mobile/session` trả kèm `user` để app không phải gọi thêm ngay sau khi đăng nhập; đó là
CÙNG `MeDto` với web, không phải một shape thứ hai.

Đừng cache quyền quá một phiên làm việc: thu hồi quyền phải có hiệu lực mà không cần đăng nhập lại.

## Query key

`queryKeys` cũng ở package này, và cũng vì một lý do: hai app gọi cùng một endpoint mà đặt key khác
nhau thì `invalidateQueries` sau một lần ghi chỉ làm mới một nửa.

TanStack Query **không** là dependency — `queryKeys` chỉ là object hằng. Mỗi app tự cài phiên bản
`@tanstack/react-query` của nó.

## Trạng thái chuyển đổi

Hôm nay package có: client runtime, transport, query key, và feature `auth`.

38 feature `api.ts`/`types.ts` còn lại vẫn ở `apps/web/src/features/*` và sẽ chuyển **từng cái
một** theo [`docs/mobile-readiness-audit.md`](../../docs/mobile-readiness-audit.md) §14.1 bước 3–4.
Không chuyển hàng loạt: mỗi feature là một bước tự verify được, và `marketplace`/`trips` (khu có 16
file test) là chỗ nên bắt đầu.
