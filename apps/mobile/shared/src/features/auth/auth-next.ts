import { useEffect } from 'react';
import { useGlobalSearchParams, useLocalSearchParams, usePathname } from 'expo-router';
import { REGISTRATION_TRACK, type RegistrationTrack } from '@xeprime/types';
import { deepLinkPended } from '@/features/shell/shell-scope.slice';
import { useAppDispatch } from '@/store/hooks';

/** Tên tham số mang ĐÍCH sau đăng nhập/đăng ký — cùng chữ với `?next=` của web. */
export const AUTH_NEXT_PARAM = 'next';

/**
 * Đường dẫn NỘI BỘ an toàn để làm đích sau đăng nhập — bản native của `isSafeNextPath` bên web.
 *
 * `next` đến từ một deep link (app khác, email, trình duyệt) nên là dữ liệu của người lạ: chỉ nhận
 * đường dẫn tuyệt đối trong CHÍNH app (`/manage/...`), không scheme, không `//host`, không `\`.
 * Không chặn ở đây là mở một lỗ open-redirect ngay sau màn đăng nhập.
 */
export function isSafeAppPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 1 &&
    value.length <= 512 &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !/^[^?#]*:/.test(value)
  );
}

/**
 * Màn đăng nhập/đăng ký được mở kèm `?next=` (vd. từ app XePrime: "Trở thành chủ xe" → đăng ký tài
 * khoản đối tác → wizard đăng xe): cất đích vào ngăn "deep link đang chờ" — CÙNG ngăn mà thông báo
 * đẩy dùng — để `useEnterApp` đưa người dùng tới đó ngay sau lượt đăng nhập/đăng ký thành công.
 *
 * Trả về đích đã kiểm (hoặc `null`) để màn còn tự chuyển thẳng khi phiên đã có sẵn.
 */
export function usePendAuthNext({ enabled = true }: { enabled?: boolean } = {}): string | null {
  const params = useLocalSearchParams<{ [AUTH_NEXT_PARAM]?: string }>();
  const raw = params[AUTH_NEXT_PARAM];
  const next = isSafeAppPath(raw) ? raw : null;
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Phiên đã có sẵn ⇒ nơi gọi chuyển thẳng; cất vào ngăn chờ lúc đó là để nó bị tiêu nhầm ở lần
    // đăng nhập SAU.
    if (next && enabled) dispatch(deepLinkPended(next));
  }, [dispatch, enabled, next]);

  return next;
}

/**
 * Đường dẫn HIỆN TẠI kèm query — để màn chặn "cần đăng nhập" cất lại đúng chỗ người dùng đang đứng
 * (vd. wizard `?from=marketplace`) trước khi dẫn sang đăng nhập.
 */
export function useCurrentAppPath(): string {
  const pathname = usePathname() ?? '/';
  const params = useGlobalSearchParams();
  const query = Object.entries(params)
    .filter(([, v]) => typeof v === 'string' && v.length > 0)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
    .join('&');
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Tuyến ĐĂNG KÝ suy từ đích `next` — để màn đăng ký nói đúng "bạn đang đăng ký…" như web
 * (`?track=` của `/register` site partner). Đích là bước đầu của tuyến: wizard đăng xe nhanh = hoa
 * hồng, onboarding `track=package` = gói; còn lại = chưa chọn.
 */
export function registrationTrackOfNext(next: string | null): RegistrationTrack | null {
  if (!next) return null;
  if (next.startsWith('/list-your-vehicle/register')) return REGISTRATION_TRACK.COMMISSION;
  if (
    next.startsWith('/manage/onboarding') &&
    next.includes(`track=${REGISTRATION_TRACK.PACKAGE}`)
  ) {
    return REGISTRATION_TRACK.PACKAGE;
  }
  return null;
}
