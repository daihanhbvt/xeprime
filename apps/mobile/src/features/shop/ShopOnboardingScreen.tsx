import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { TENANT_TYPE, TENANT_TYPE_VALUES } from '@xeprime/types';
import { registerShopSchema, type RegisterShopValues } from '@xeprime/validators';
import { images } from '@/assets';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { useRegisterShop } from './hooks/use-shop';

/** Viên tròn của khoang giới thiệu và cỡ hình bên trong — đúng `.introIcon` bên web. */
const INTRO_ICON = 72;
const INTRO_GLYPH = 30;

/**
 * Cao đúng `.heroArt` ở nhánh mobile của web. Ảnh 640×400 vào khung này bằng `contain` nên
 * không bị xén — nó là hình trang trí, cắt mất một góc là mất luôn ý của hình.
 */
const styles = StyleSheet.create({ heroArt: { width: '100%', height: 132 } });

/** Bốn bước, đúng thứ tự `<ol>` của web. Khoá con của `ShopOnboarding.guide.steps`. */
const GUIDE_STEPS = ['create', 'complete', 'prepare', 'publish'] as const;

/**
 * Đăng ký gian hàng (SHP-01) — nơi DUY NHẤT dựng form tạo gian hàng.
 *
 * Chỉ tới được đây bằng ý định TƯỜNG MINH (thẻ "Trở thành chủ xe" ở tab Tài khoản, hoặc trạng
 * thái "chưa có gian hàng" trong cổng quản lý). Tài khoản khách vẫn dùng marketplace bình thường
 * mà không cần gian hàng — không màn nào ép họ mở shop.
 *
 * Đã có gian hàng thì ở đây không còn việc gì: vào thẳng HỒ SƠ gian hàng. Vì sao `/manage/shop`
 * chứ không phải `/manage`: gian hàng vừa tạo là bản nháp chưa gửi duyệt, chưa có xe, chưa có
 * đơn — tổng quan chỉ toàn số 0 và không nói được việc gì tiếp theo. Việc duy nhất còn lại (điền
 * nốt hồ sơ rồi gửi duyệt) nằm ở `/manage/shop`.
 *
 * Trạng thái duyệt do BACKEND quyết định: client không gửi `status`, không tự đặt `active`.
 */
export function ShopOnboardingScreen() {
  const t = useTranslations('ShopOnboarding');
  const tLegal = useTranslations('Legal');
  const tActions = useTranslations('Common.actions');
  const [guideOpen, setGuideOpen] = useState(false);
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const domainLabel = useDomainLabel();
  const provinces = useProvinceOptions();
  const register = useRegisterShop();

  const { data: user, isLoading } = useCurrentUser();
  const hasTenant = Boolean(user?.tenant);

  /*
   * Điều hướng trong effect, KHÔNG giữa lúc render: đổi route trong thân render của một màn đang
   * mount là nguồn của cảnh báo "update during render" và của những cú nháy không lần ra được.
   */
  useEffect(() => {
    if (hasTenant) router.replace(ROUTES.manage.shop());
  }, [hasTenant, router]);

  const resolver = useValidationResolver<RegisterShopValues>(
    registerShopSchema,
    'ShopOnboarding.validation',
  );
  const { control, handleSubmit } = useForm<RegisterShopValues>({
    resolver,
    defaultValues: {
      name: '',
      tenantType: TENANT_TYPE.INDIVIDUAL,
      provinceCode: '',
      address: '',
      phone: '',
      email: '',
    },
  });

  /*
   * `handleSubmit` GIỮ NGUYÊN giá trị đã nhập khi mutation lỗi — React Hook Form không reset
   * form, nên người dùng chỉ cần đọc thông báo rồi bấm lại. Đó cũng là thứ cứu dữ liệu khi app
   * bị đưa xuống nền giữa chừng: state của form sống cùng màn, và màn không bị tháo.
   */
  const submit = handleSubmit((values) => {
    register.mutate(
      {
        name: values.name.trim(),
        tenantType: values.tenantType,
        provinceCode: values.provinceCode,
        ...(values.address.trim() ? { address: values.address.trim() } : {}),
        ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
        ...(values.email.trim() ? { email: values.email.trim() } : {}),
      },
      {
        /*
         * Không tự điều hướng ở đây: `useRegisterShop` làm mới `/auth/me`, `hasTenant` thành
         * `true` và effect ở trên đưa đi — MỘT đường đi cho cả hai lối vào màn này.
         */
        onSuccess: () => toast.showSuccess(t('created')),
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  const typeOptions = TENANT_TYPE_VALUES.map((value) => ({
    value,
    label: domainLabel('tenantType', value),
  }));

  // Đang tải phiên, hoặc đã có gian hàng (effect đang đưa đi): không nháy form ra rồi thu lại.
  if (isLoading || !user || hasTenant) {
    return (
      <>
        <AppHeader title={t('page.title')} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenLoading />
        </Screen>
      </>
    );
  }

  return (
    <>
      {/*
        Thanh trên cùng mang LOGO chứ không mang tiêu đề — tiêu đề là chữ lớn trong dải hero ngay
        dưới, y như web. Đặt cả hai chỗ thì cùng một câu hiện hai lần cách nhau 40dp.
      */}
      <AppHeader
        onBack={() => navigateOnce(ROUTES.explore.home())}
        right={
          <IconButton
            icon="help-circle-outline"
            label={t('guide.trigger')}
            onPress={() => setGuideOpen(true)}
          />
        }
      />
      <Screen edges={['left', 'right', 'bottom']} padded={false}>
        <YStack gap={layout.section} pb={layout.section}>
          {/*
            Dải hero nền kem: tiêu đề lớn, câu mô tả, rồi hình minh hoạ neo đáy dải — đúng bố cục
            mobile của web (`.hero` / `.heroArt`; điểm gãy 900px nên điện thoại luôn ở nhánh này).

            Hình là TRANG TRÍ: `accessible={false}` để trình đọc màn hình bỏ qua, giống
            `aria-hidden` bên web — nó không nói thêm gì mà chữ bên trên chưa nói.
          */}
          <YStack bg={colors.primaryLight} px={layout.screenX} pt={layout.section} gap={space.md}>
            <YStack gap={space.sm}>
              <Text col={colors.text} fos={fontSize.h1} fow={fontWeight.bold}>
                {t('page.title')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodyLg}>
                {t('page.subtitle')}
              </Text>
            </YStack>
            <Image
              source={images.shopOnboarding}
              style={styles.heroArt}
              contentFit="contain"
              accessible={false}
            />
          </YStack>

          <YStack px={layout.screenX} gap={layout.section}>
            <Card>
              <YStack gap={space.md}>
                {/*
                  Khoang GIỚI THIỆU của web (`.intro`): viên tròn, tên khối, câu dẫn — canh GIỮA.
                  Bên web nó là cột trái ở màn rộng và xếp lên trên ở mobile; app luôn ở nhánh
                  mobile nên chỉ còn một cách xếp.
                */}
                <YStack ai="center" gap={space.sm}>
                  <YStack
                    w={INTRO_ICON}
                    h={INTRO_ICON}
                    br={radius.pill}
                    bg={colors.primaryLight}
                    ai="center"
                    jc="center"
                  >
                    <Ionicons
                      name="storefront-outline"
                      size={INTRO_GLYPH}
                      color={colors.primaryActive}
                    />
                  </YStack>
                  <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold} ta="center">
                    {t('form.title')}
                  </Text>
                  <Text col={colors.textMuted} fos={fontSize.body} ta="center">
                    {t('form.intro')}
                  </Text>
                </YStack>

                {/*
                  Khối "Lưu ý" đứng TRƯỚC các ô nhập, đúng thứ tự của web: nó nói phải khai chính
                  xác cái gì, mà đọc sau khi điền xong thì đã muộn.
                */}
                <YStack
                  gap={space.xs}
                  p={space.md}
                  br={radius.md}
                  bw={1}
                  bc={colors.primary}
                  bg={colors.primaryLight}
                >
                  <XStack ai="center" gap={space.xs}>
                    <Ionicons
                      name="information-circle-outline"
                      size={iconSize.sm}
                      color={colors.primaryActive}
                    />
                    <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                      {t('tips.title')}
                    </Text>
                  </XStack>
                  {[t('tips.accuracy'), t('tips.editable')].map((tip) => (
                    <XStack key={tip} ai="flex-start" gap={space.xs}>
                      <Ionicons name="checkmark" size={iconSize.sm} color={colors.primaryActive} />
                      <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                        {tip}
                      </Text>
                    </XStack>
                  ))}
                </YStack>

                {provinces.isError ? (
                  <Callout tone="warning" title={t('form.fields.province.loadError')}>
                    <YStack gap={space.sm}>
                      <Text col={colors.textMuted} fos={fontSize.bodySm}>
                        {errorMessage(provinces.error)}
                      </Text>
                      <Button
                        label={tActions('retry')}
                        variant="secondary"
                        onPress={provinces.refetch}
                      />
                    </YStack>
                  </Callout>
                ) : null}

                <TextField
                  control={control}
                  name="name"
                  label={t('form.fields.name.label')}
                  placeholder={t('form.fields.name.placeholder')}
                  required
                />
                <SelectField
                  control={control}
                  name="tenantType"
                  label={t('form.fields.tenantType.label')}
                  options={typeOptions}
                  required
                />
                {/*
                Tỉnh/thành BẮT BUỘC: đăng ký tạo luôn chi nhánh mặc định, và đó là nơi xe của gian
                hàng hiển thị trên marketplace. Danh sách lấy từ API, không hardcode.
              */}
                <SelectField
                  control={control}
                  name="provinceCode"
                  label={t('form.fields.province.label')}
                  options={provinces.options}
                  required
                  /* Đang tải / lỗi / rỗng đều là điều khiển CHẾT — không mở tấm chọn không có gì để chọn. */
                  disabled={
                    provinces.isLoading || provinces.isError || provinces.options.length === 0
                  }
                  placeholder={
                    provinces.isLoading
                      ? t('form.fields.province.loading')
                      : t('form.fields.province.placeholder')
                  }
                  hint={
                    provinces.options.length === 0 && !provinces.isLoading && !provinces.isError
                      ? t('form.fields.province.empty')
                      : t('form.fields.province.help')
                  }
                />
                <TextField
                  control={control}
                  name="address"
                  label={t('form.fields.address.label')}
                  placeholder={t('form.fields.address.placeholder')}
                />
                <TextField
                  control={control}
                  name="phone"
                  label={t('form.fields.phone.label')}
                  placeholder={t('form.fields.phone.placeholder')}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                />
                <TextField
                  control={control}
                  name="email"
                  label={t('form.fields.email.label')}
                  placeholder={t('form.fields.email.placeholder')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />

                {/*
                Web đặt câu quyền riêng tư và nút gửi TRONG cùng thẻ với các ô nhập, không tách ra
                ngoài: cả ba là một hành động liên tục — đọc điều kiện rồi bấm gửi.
              */}
                {/*
                `.privacy` bên web là một KHỐI có viền vàng nhạt trên nền kem, không phải một dòng
                chữ xám: nó đứng ngay trên nút gửi và là câu cuối người dùng đọc trước khi giao
                thông tin liên hệ của mình.
              */}
                <XStack
                  ai="flex-start"
                  gap={space.xs}
                  p={space.md}
                  br={radius.md}
                  bw={1}
                  bc={colors.primary}
                  bg={colors.primaryLight}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={iconSize.sm}
                    color={colors.primary}
                  />
                  {/*
                  Tiêu đề XUỐNG DÒNG riêng, không chạy tiếp vào thân câu.

                  Web dùng `flex-wrap` với `<strong>` và `<span>` là hai flex item, nên ở bề ngang
                  điện thoại chúng gần như luôn nằm hai dòng. Nối liền thành một đoạn thì
                  "Bảo mật thông tin" đọc ra như bốn chữ đầu của câu chứ không phải cái nhãn của
                  khối.
                */}
                  <YStack f={1} gap={2}>
                    <Text
                      col={colors.primaryActive}
                      fos={fontSize.bodySm}
                      fow={fontWeight.semibold}
                    >
                      {t('privacy.title')}
                    </Text>
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {t('privacy.body')}
                    </Text>
                  </YStack>
                </XStack>

                <Button
                  label={t('form.submit')}
                  icon="storefront-outline"
                  loading={register.isPending}
                  onPress={() => void submit()}
                />

                {/*
                Quy chế sàn ràng buộc NGƯỜI BÁN kể từ khoảnh khắc này (ADR 0028 điều 9), nên câu
                này phải đứng cạnh nút — không phải ở một chân trang mà cổng quản lý không có.

                Tên văn bản in đậm nhưng KHÔNG phải liên kết: app chưa có màn văn bản pháp lý
                (`Legal.docs`), và một liên kết dẫn tới màn không tồn tại tệ hơn một câu chữ đúng.
              */}
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {tLegal.rich('consent.shop', {
                    rules: (chunks) => <Text fow={fontWeight.semibold}>{chunks}</Text>,
                    terms: (chunks) => <Text fow={fontWeight.semibold}>{chunks}</Text>,
                  })}
                </Text>
              </YStack>
            </Card>

            {/* Lối lui đặt ở CUỐI nội dung, đúng `.back` của web — ngoài nút lui trên thanh. */}
            <Button
              label={t('page.back')}
              variant="ghost"
              icon="arrow-back"
              onPress={() => navigateOnce(ROUTES.explore.home())}
            />
          </YStack>
        </YStack>
      </Screen>

      {/*
        Bốn bước mở gian hàng — bản native của `Popover` "Hướng dẫn" trên thanh của web: một tấm
        trượt mở từ chính nút đó. Không rải thẳng ra trang: web không rải, và bốn đoạn văn chen
        giữa hero và form đẩy ô nhập đầu tiên xuống dưới màn đầu.
      */}
      <BottomSheet open={guideOpen} onClose={() => setGuideOpen(false)} title={t('guide.title')}>
        <YStack gap={space.sm}>
          {GUIDE_STEPS.map((step, index) => (
            <XStack key={step} ai="flex-start" gap={space.sm}>
              <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.bold}>
                {index + 1}.
              </Text>
              <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                {t(`guide.steps.${step}`)}
              </Text>
            </XStack>
          ))}
        </YStack>
      </BottomSheet>
    </>
  );
}
