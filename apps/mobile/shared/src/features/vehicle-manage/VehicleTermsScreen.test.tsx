import { render } from '@testing-library/react-native';
import viShop from '@xeprime/domain/messages/vi/shop.json';
import { SERVICE_TYPE } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { TermsBody } from './VehicleTermsScreen';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/hooks/use-navigate-once', () => ({ useNavigateOnce: () => jest.fn() }));

const conditions = viShop.policies.workspace.conditions;
const policiesTitle = viShop.policies.workspace.title;

/**
 * ADR 0112 điều 3: xe không còn giấy tờ / cách đối chiếu / điều khoản riêng. Khối thủ tục của một xe
 * chỉ hiện luật chuẩn nền tảng (chỉ đọc), cổng quản lý có thêm link sang trang Chính sách thuê.
 */
describe('TermsBody - luật chuẩn nền tảng, không form theo xe', () => {
  it('hiện điều kiện chuẩn, không có ô điều khoản theo xe', async () => {
    const view = await render(
      withIntl(
        <TermsBody vehicleId="v1" serviceType={SERVICE_TYPE.SELF_DRIVE} canEdit isManage={false} />,
      ),
    );
    expect(view.getByText(conditions.title)).toBeTruthy();
    expect(view.getAllByText(conditions.documents).length).toBe(2);
    expect(view.queryByText(conditions.termsTitle)).toBeNull();
    expect(view.queryByText(policiesTitle)).toBeNull();
  });

  it('cổng quản lý: link sang trang Chính sách thuê của gian hàng', async () => {
    const view = await render(
      withIntl(<TermsBody vehicleId="v1" serviceType={SERVICE_TYPE.SELF_DRIVE} canEdit isManage />),
    );
    expect(view.getByText(policiesTitle)).toBeTruthy();
  });
});
