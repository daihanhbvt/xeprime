import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  REGISTRATION_TRACK,
  SUBSCRIPTION_INVOICE_STATUS,
  TENANT_TYPE,
  TENANT_TYPE_VALUES,
  tenantUsesManagePortal,
  type RegistrationTrack,
} from '@xeprime/types';
import { registerShopSchema, type RegisterShopValues } from '@xeprime/validators';
import { images } from '@/assets';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { SelectField } from '@/components/ui/SelectField';
import { AddressFields } from '@/components/form/AddressFields';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { APP_SCOPE } from '@/features/shell/app-scope';
import { useShellScope } from '@/features/shell/use-shell-scope';
import { isPackageOnboarding, resolveWorkspaceHref } from '@/features/shell/workspace';
import { PackageShopCheckout } from '@/features/subscription/components/PackageShopCheckout';
import { usePendingInvoice } from '@/features/subscription/hooks/use-subscription';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { queryKeys } from '@/queries/query-keys';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { useRegisterShop } from './hooks/use-shop';

/** Viên tròn của khoang giới thiệu và cỡ hình bên trong — đúng `.introIcon` bên web. */
const INTRO_ICON = 72;
const INTRO_GLYPH = 30;

/** Số thứ tự của một bước trong chỉ dẫn hai chặng. */
const STEP_INDEX = 24;

/**
 * Cao đúng `.heroArt` ở nhánh mobile của web. Ảnh 640×400 vào khung này bằng `contain` nên
 * không bị xén — nó là hình trang trí, cắt mất một góc là mất luôn ý của hình.
 */
const styles = StyleSheet.create({ heroArt: { width: '100%', height: 132 } });

/** Bốn bước của TUYẾN HOA HỒNG, đúng thứ tự `<ol>` của web. Khoá con của `ShopOnboarding.guide.steps`. */
const GUIDE_STEPS = ['create', 'complete', 'prepare', 'publish'] as const;
/** Bốn bước của TUYẾN GÓI — mở gian hàng → trả tiền → logo → lên chợ. */
const PACKAGE_GUIDE_STEPS = ['createShop', 'pay', 'logo', 'publish'] as const;

/** Tên trường địa chỉ trong `registerShopSchema` — hằng ngoài component, định danh ổn định. */
const ADDRESS_FIELD_NAMES = {
  provinceCode: 'provinceCode',
  wardCode: 'wardCode',
  addressLine: 'addressLine',
} as const;
const ADDRESS_PIN_NAMES = {
  placeId: 'placeId',
  latitude: 'latitude',
  longitude: 'longitude',
  locationSource: 'locationSource',
} as const;

/**
 * ONBOARDING — nơi DUY NHẤT dựng form tạo hồ sơ người cho thuê xe, cho CẢ HAI TUYẾN (ADR 0040).
 *
 * Chỉ tới được đây bằng ý định TƯỜNG MINH: CTA chủ xe ("Trở thành chủ xe" / "Đăng xe cho thuê")
 * hoặc CTA gian hàng ("Đăng ký gian hàng", mang `track=package`). Tài khoản khách vẫn dùng
 * marketplace bình thường mà không cần gian hàng — không màn nào ép họ mở shop.
 *
 * ## Máy trạng thái, và nó SUY TỪ SERVER
 *
 * | Trạng thái thật | Màn hiện ra |
 * | --- | --- |
 * | chưa có gian hàng, `track=commission` (mặc định) | form hồ sơ chủ xe |
 * | chưa có gian hàng, `track=package` | **bước 1**: tạo gian hàng trả phí |
 * | `onboardingState = package_pending` | **bước 2**: chọn gói → QR chuyển khoản |
 * | gói đã hiệu lực | chuyển tới hồ sơ gian hàng |
 * | tuyến hoa hồng (đã có gian hàng) | chuyển tới khu của họ |
 *
 * `track` CHỈ có nghĩa ở hai dòng đầu — tức khi CHƯA có gian hàng. Sau đó nguồn là
 * `tenants.onboarding_state`, nên tắt app, mở lại, hay đăng nhập trên máy khác đều rơi đúng bước
 * còn nợ. Đây là toàn bộ điểm của ADR 0040: bốn cách phân biệt hai tuyến ở client (prop component,
 * query tạm, state router, "đã có gói hay chưa") đều chết sau một lần app bị tháo.
 *
 * Trạng thái duyệt do BACKEND quyết định: client không gửi `status`, không tự đặt `active`.
 */
export function ShopOnboardingScreen({
  track = REGISTRATION_TRACK.COMMISSION,
}: {
  /** Cửa vào người dùng vừa bấm — đọc từ `?track=` ở file route, không đoán trong component. */
  track?: RegistrationTrack;
}) {
  const t = useTranslations('ShopOnboarding');
  const [guideOpen, setGuideOpen] = useState(false);
  const navigateOnce = useNavigateOnce();
  const { switchTo } = useShellScope();
  const queryClient = useQueryClient();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const domainLabel = useDomainLabel();
  const register = useRegisterShop();

  const { data: user, isLoading } = useCurrentUser();
  const tenant = user?.tenant ?? null;
  const hasTenant = tenant != null;
  const packagePending = isPackageOnboarding(user);
  /** Gian hàng đã có gói hiệu lực — onboarding xong, không còn gì để làm ở đây. */
  const packageReady = hasTenant && !packagePending && tenantUsesManagePortal(tenant);
  const isPackageTrack = track === REGISTRATION_TRACK.PACKAGE;
  /** Câu chữ và chỉ dẫn bước theo tuyến GÓI — bước 1 chọn cửa đó, hoặc đã sang bước 2. */
  const packageWording = isPackageTrack || packagePending;

  useSyncScopeWhenInvoiceSettles(packagePending, queryClient);

  /*
   * Điều hướng trong effect, KHÔNG giữa lúc render: đổi route trong thân render của một màn đang
   * mount là nguồn của cảnh báo "update during render" và của những cú nháy không lần ra được.
   */
  useEffect(() => {
    if (!hasTenant || packagePending) return;
    /*
     * Gói đã bật ⇒ hồ sơ gian hàng; còn lại (tuyến hoa hồng, hoặc nhân viên) ⇒ khu làm việc của
     * chính họ. `resolveWorkspaceHref` chứ không cố định `/manage/shop` như bản trước: chủ xe
     * tuyến hoa hồng KHÔNG vào được khu quản lý, nên đích cũ đẩy họ thẳng vào `ScopeGuard` rồi bị
     * đá ngược ra chợ xe — hai cú nhảy cho một lần bấm.
     *
     * Đi qua `switchTo` chứ không `router.replace` trần: màn này nằm dưới `manage/`, nên vỏ app
     * đang ghi nhận khu QUẢN LÝ. Thả một chủ xe tuyến hoa hồng về `/account/...` bằng một lượt
     * replace để lại `shellScope` trỏ sang khu kia — bộ đổi khu tô sáng nhầm nửa, và lần bấm tiếp
     * theo của họ rơi về một màn quản lý mà `ScopeGuard` sẽ đá ra.
     */
    if (packageReady) {
      switchTo(APP_SCOPE.MANAGE, ROUTES.manage.shop({ welcome: true }));
      return;
    }
    switchTo(APP_SCOPE.CUSTOMER, resolveWorkspaceHref(user) ?? ROUTES.account.home());
  }, [hasTenant, packagePending, packageReady, switchTo, user]);

  const resolver = useValidationResolver<RegisterShopValues>(
    registerShopSchema,
    'ShopOnboarding.validation',
  );
  /*
   * Cửa vào đi VÀO giá trị form: `registerShopSchema` đọc `registrationTrack` trong chính giá trị
   * để biết xã/phường, số nhà và SĐT là bắt buộc hay không. MỘT schema cho cả hai tuyến — resolver
   * được RHF giữ từ lần dựng đầu, nên một biểu thức `isPackageTrack ? A : B` sẽ đổi luật mà RHF
   * không biết.
   */
  const emptyValues: RegisterShopValues = {
    name: user?.displayName ?? '',
    tenantType: TENANT_TYPE.INDIVIDUAL,
    registrationTrack: track,
    provinceCode: '',
    wardCode: '',
    addressLine: '',
    placeId: null,
    latitude: null,
    longitude: null,
    locationSource: null,
    phone: user?.phone ?? '',
    email: user?.email ?? '',
  };
  const { control, handleSubmit } = useForm<RegisterShopValues>({
    resolver,
    defaultValues: emptyValues,
    /*
     * `values` chứ không chỉ `defaultValues`: hook này chạy TRƯỚC nhánh chờ `/auth/me`, nên ở lần
     * dựng đầu `user` còn rỗng và giá trị điền sẵn (tên, SĐT, email của tài khoản) sẽ không bao
     * giờ tới được form. RHF chỉ nạp lại khi nội dung thật sự khác, nên một lượt refetch trả về
     * đúng hồ sơ cũ không xoá thứ người dùng đang gõ dở.
     */
    ...(user ? { values: emptyValues } : {}),
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
        /*
         * CỬA VÀO đi trên dây. Đây là điểm mấu chốt của ADR 0040: không có trường này thì server
         * không phân biệt được hai luồng, gán gói hoa hồng cho cả hai, và người vừa bấm "Đăng ký
         * gian hàng" thành chủ xe tuyến hoa hồng ở mọi nơi đọc `billingMode`.
         */
        registrationTrack: track,
        // Tuyến gói không hỏi loại hình — gửi mặc định, và server cũng mặc định đúng giá trị đó.
        tenantType: values.tenantType,
        provinceCode: values.provinceCode,
        ...(values.wardCode ? { wardCode: values.wardCode } : {}),
        ...(values.addressLine.trim() ? { addressLine: values.addressLine.trim() } : {}),
        ...(values.placeId ? { placeId: values.placeId } : {}),
        ...(values.latitude != null && values.longitude != null
          ? { latitude: values.latitude, longitude: values.longitude }
          : {}),
        ...(values.locationSource ? { locationSource: values.locationSource } : {}),
        ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
        ...(values.email.trim() ? { email: values.email.trim() } : {}),
      },
      {
        /*
         * Không tự điều hướng ở đây. `useRegisterShop` làm mới `/auth/me`: tuyến GÓI quay về mang
         * `package_pending` và màn này tự chuyển sang bước 2; tuyến hoa hồng thì effect ở trên đưa
         * đi — MỘT đường đi cho cả hai lối vào màn này.
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

  // Đang tải phiên, hoặc đã có gian hàng và KHÔNG ở bước 2 (effect đang đưa đi): không nháy form.
  if (isLoading || !user || (hasTenant && !packagePending)) {
    return (
      <>
        <AppHeader title={t('page.title')} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenLoading />
        </Screen>
      </>
    );
  }

  /** Chỉ tuyến GÓI có hai bước; tuyến hoa hồng là một màn duy nhất. */
  const showSteps = packageWording;
  const currentStep = packagePending ? 2 : 1;

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
                {packageWording ? t('packagePage.title') : t('page.title')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodyLg}>
                {packageWording ? t('packagePage.subtitle') : t('page.subtitle')}
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
            {/*
              Chỉ dẫn bước RẤT GỌN: hai chặng, một hàng. Không dựng một `Steps` đầy đủ — nó chiếm
              gần nửa chiều cao khung nhìn trên điện thoại, ngay phía trên thứ người dùng phải điền.
            */}
            {showSteps ? (
              <XStack gap={space.sm} accessibilityLabel={t('steps.label')}>
                {([1, 2] as const).map((step) => {
                  const active = step === currentStep;
                  return (
                    <XStack
                      key={step}
                      f={1}
                      ai="center"
                      gap={space.xs}
                      px={space.sm}
                      py={space.xs}
                      br={radius.md}
                      bw={1}
                      bc={active ? colors.primary : colors.border}
                      bg={active ? colors.primaryLight : colors.surface}
                    >
                      <YStack
                        w={STEP_INDEX}
                        h={STEP_INDEX}
                        br={radius.pill}
                        ai="center"
                        jc="center"
                        bg={active ? colors.primary : colors.surfaceMuted}
                      >
                        <Text
                          col={active ? colors.surface : colors.textMuted}
                          fos={fontSize.label}
                          fow={fontWeight.bold}
                        >
                          {step}
                        </Text>
                      </YStack>
                      <Text
                        f={1}
                        col={active ? colors.text : colors.textMuted}
                        fos={fontSize.label}
                        fow={active ? fontWeight.semibold : fontWeight.medium}
                      >
                        {t(step === 1 ? 'steps.shopInfo' : 'steps.planPayment')}
                      </Text>
                    </XStack>
                  );
                })}
              </XStack>
            ) : null}

            {packagePending ? (
              <Card>
                <PackageShopCheckout />
              </Card>
            ) : (
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
                    <Text
                      col={colors.text}
                      fos={fontSize.h4}
                      fow={fontWeight.semibold}
                      ta="center"
                    >
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
                        <Ionicons
                          name="checkmark"
                          size={iconSize.sm}
                          color={colors.primaryActive}
                        />
                        <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                          {tip}
                        </Text>
                      </XStack>
                    ))}
                  </YStack>

                  <TextField
                    control={control}
                    name="name"
                    label={t('form.fields.name.label')}
                    placeholder={t('form.fields.name.placeholder')}
                    required
                  />
                  {/*
                    Loại hình CHỈ ở tuyến hoa hồng. Tuyến gói không dùng nó để quyết định gì —
                    nguồn duy nhất của chế độ thu phí là GÓI (ADR 0014 điều 2) — nên một ô chọn ở
                    bước đang đếm từng giây trước khi người ta xem giá là ma sát không đổi lấy được
                    gì.
                  */}
                  {isPackageTrack ? null : (
                    <SelectField
                      control={control}
                      name="tenantType"
                      label={t('form.fields.tenantType.label')}
                      options={typeOptions}
                      required
                    />
                  )}
                  {/*
                    Địa chỉ BẮT BUỘC có tỉnh/thành ở CẢ HAI tuyến: đăng ký tạo luôn chi nhánh mặc
                    định, và đó là nơi xe hiển thị trên chợ.

                    Xã/phường và số nhà thì theo TUYẾN. Tuyến hoa hồng để trống được — người mở hồ
                    sơ chủ xe thường chưa có địa chỉ chính xác, và chặn ở đây là chặn luôn việc họ
                    bắt đầu. Tuyến gói thì bắt buộc: đó là một mặt tiền có người trả tiền để khách
                    tìm thấy, và cổng đăng xe sẽ đòi nó ngay sau khi thanh toán — hỏi ở đây rẻ hơn
                    hẳn so với để họ trả tiền rồi mới bị từ chối.
                  */}
                  <AddressFields
                    control={control}
                    names={ADDRESS_FIELD_NAMES}
                    pin={ADDRESS_PIN_NAMES}
                    required={isPackageTrack}
                    provinceRequired
                    prefillRememberedProvince
                  />
                  <TextField
                    control={control}
                    name="phone"
                    label={t('form.fields.phone.label')}
                    placeholder={t('form.fields.phone.placeholder')}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    required={isPackageTrack}
                    /*
                     * Dòng chú thích nói rõ đây là số LIÊN HỆ CỦA GIAN HÀNG — không phải một số
                     * "đã xác thực" thứ hai. Số đã qua OTP của người chủ sống ở `users.phone`;
                     * gọi ô này là số đã xác thực là một lời hứa không ai đứng sau, vì người dùng
                     * sửa được nó tự do ngay tại đây.
                     */
                    {...(isPackageTrack ? { hint: t('form.fields.phone.shopHelp') } : {})}
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
                    `.privacy` bên web là một KHỐI có viền vàng nhạt trên nền kem, không phải một
                    dòng chữ xám: nó đứng ngay trên nút gửi và là câu cuối người dùng đọc trước khi
                    giao thông tin liên hệ của mình.
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
                      Tiêu đề XUỐNG DÒNG riêng, không chạy tiếp vào thân câu. Web dùng `flex-wrap`
                      với `<strong>` và `<span>` là hai flex item, nên ở bề ngang điện thoại chúng
                      gần như luôn nằm hai dòng. Nối liền thành một đoạn thì "Bảo mật thông tin"
                      đọc ra như bốn chữ đầu của câu chứ không phải cái nhãn của khối.
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
                    label={isPackageTrack ? t('form.submitPackage') : t('form.submit')}
                    icon="storefront-outline"
                    loading={register.isPending}
                    onPress={() => void submit()}
                  />

                  {/*
                    Quy chế sàn ràng buộc NGƯỜI BÁN kể từ khoảnh khắc này (ADR 0028 điều 9), nên
                    câu này phải đứng cạnh nút — không phải ở một chân trang mà cổng quản lý không
                    có.
                  */}
                  <LegalConsentNote place="shop" />
                </YStack>
              </Card>
            )}

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
      <BottomSheet
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title={packageWording ? t('guide.packageTitle') : t('guide.title')}
      >
        <YStack gap={space.sm}>
          {(packageWording ? PACKAGE_GUIDE_STEPS : GUIDE_STEPS).map((step, index) => (
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

/**
 * Hoá đơn vừa RỜI trạng thái chờ ⇒ hỏi lại scope thật.
 *
 * Tiền về là webhook SePay lật hoá đơn `paid`, bật thuê bao và hoàn tất onboarding trong MỘT
 * transaction (ADR 0040). Client không biết điều đó xảy ra lúc nào, nên `usePendingInvoice` hỏi
 * lại theo nhịp và tự dừng khi hoá đơn tới trạng thái kết thúc. Lượt hỏi CUỐI CÙNG đó — lượt trả
 * về `null` — là tín hiệu duy nhất đáng tin, và hook này biến nó thành một lần làm mới `/auth/me`.
 * Điều hướng thì để `useEffect` ở màn lo, sau khi scope mới thật sự về.
 *
 * `seenAwaiting` là thứ phân biệt "vừa trả xong" với "chưa bao giờ tạo hoá đơn": cả hai đều cho
 * `data === null`, và làm mới scope ở ca thứ hai là một lượt gọi vô ích mỗi lần màn mở.
 *
 * Cũng chạy đúng khi hoá đơn hết hạn (`void`): scope không đổi, màn hình quay về bộ chọn gói.
 */
function useSyncScopeWhenInvoiceSettles(
  enabled: boolean,
  queryClient: ReturnType<typeof useQueryClient>,
): void {
  const pending = usePendingInvoice(enabled);
  const status = pending.data?.status ?? null;
  const awaiting =
    status === SUBSCRIPTION_INVOICE_STATUS.ISSUED ||
    status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID;
  const seenAwaiting = useRef(false);

  useEffect(() => {
    if (awaiting) {
      seenAwaiting.current = true;
      return;
    }
    if (!seenAwaiting.current) return;
    seenAwaiting.current = false;
    void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
  }, [awaiting, queryClient]);
}
