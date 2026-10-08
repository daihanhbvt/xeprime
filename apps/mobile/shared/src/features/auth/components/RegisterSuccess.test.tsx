import type { ReactNode } from 'react';
import { render } from '@testing-library/react-native';
import { MOBILE_CLIENT_APP } from '@xeprime/types';
import { APP_PROFILE } from '@/app-profile';
import { withIntl } from '@/i18n/test-utils';
import { RegisterSuccess } from './RegisterSuccess';

/**
 * Bước "vừa tạo tài khoản xong" nói đúng chuyện của TỪNG APP.
 *
 * Bộ này tồn tại vì bản trước dùng y nguyên câu của app khách ở cả hai app: app Partner mời người
 * vừa tạo tài khoản ĐỐI TÁC đi "tìm và đặt xe" — một việc realm `partner` không làm được (ADR 0053
 * điều 7) — và cho họ một nút "Cập nhật tài khoản" dẫn về đúng nơi nút kia đã dẫn.
 *
 * Cả hai nhánh chỉ khác nhau ở CHỮ và SỐ NÚT, nên một lần sửa bố cục sẽ không gãy gì cả; chính vì
 * vậy nó phải được khoá bằng test chứ không bằng mắt.
 */

function wrap(children: ReactNode) {
  return withIntl(children);
}

describe('RegisterSuccess', () => {
  const original = APP_PROFILE.clientApp;
  afterEach(() => {
    (APP_PROFILE as { clientApp: string }).clientApp = original;
  });

  function asApp(clientApp: string) {
    (APP_PROFILE as { clientApp: string }).clientApp = clientApp;
  }

  it('app KHÁCH: mời tiếp tục việc đang làm, kèm lối mở tài khoản — hai nút như web', async () => {
    asApp(MOBILE_CLIENT_APP.CUSTOMER);
    const view = await render(
      wrap(<RegisterSuccess onContinue={jest.fn()} onOpenAccount={jest.fn()} />),
    );

    expect(view.getByText('Tạo tài khoản thành công')).toBeTruthy();
    expect(view.getByRole('button', { name: new RegExp('Cập nhật tài khoản$') })).toBeTruthy();
  });

  /**
   * App Partner: MỘT nút, và nó dẫn tới màn chọn cách cho thuê. Không có nút "Cập nhật tài khoản"
   * — tài khoản vừa tạo chưa có gì để cập nhật, và `ScopeGuard` đưa họ về cùng một chỗ dù bấm nút
   * nào, nên nút thứ hai chỉ là một lời hứa rỗng.
   */
  it('app PARTNER: nói chuyện ĐỐI TÁC, một nút dẫn tới màn chọn cách cho thuê', async () => {
    asApp(MOBILE_CLIENT_APP.PARTNER);
    const onContinue = jest.fn();
    const view = await render(
      wrap(<RegisterSuccess onContinue={onContinue} onOpenAccount={jest.fn()} />),
    );

    expect(view.getByText('Tạo tài khoản đối tác thành công')).toBeTruthy();
    expect(view.queryByRole('button', { name: new RegExp('Cập nhật tài khoản$') })).toBeNull();
    // KHÔNG mời người của realm `partner` đi đặt xe — câu của app khách phải biến mất hẳn.
    expect(view.queryByText(/tìm và đặt xe/)).toBeNull();
    expect(view.getByRole('button', { name: new RegExp('Chọn cách cho thuê$') })).toBeTruthy();
  });
});
