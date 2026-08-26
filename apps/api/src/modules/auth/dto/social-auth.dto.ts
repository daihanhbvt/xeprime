import { ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORTED_LOCALES } from '@xeprime/types';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Query của `GET /auth/social/:provider` — do WEB gửi.
 *
 * Cả hai trường đều lỏng có chủ đích: route này là một lần điều hướng trình duyệt, nên một lỗi
 * 400 ở đây là một trang trắng chứa JSON ngay giữa luồng đăng nhập. Giá trị vô nghĩa được xử lý
 * bằng cách rơi về mặc định (`isSafeNextPath` → null, `resolveAppLocale` → `vi`), không phải
 * bằng cách từ chối.
 */
export class SocialAuthQueryDto {
  @ApiPropertyOptional({
    description:
      'Đường dẫn nội bộ để quay về sau khi đăng nhập. Không an toàn (có scheme, protocol-relative…) thì bị bỏ qua và về trang chủ.',
    example: '/xe/01HZX9',
    maxLength: 512,
  })
  @IsOptional()
  @IsString()
  // Trùng độ dài cột `oauth_states.redirect_next` — chặn ở đây để không bao giờ có một request
  // thất bại ở tầng DB vì lý do mà tầng này biết trước.
  @MaxLength(512)
  next?: string;

  @ApiPropertyOptional({
    description:
      'Ngôn ngữ cho màn đồng ý của provider (màn đó do Google/Facebook render, không phải XePrime).',
    enum: SUPPORTED_LOCALES,
    example: 'vi',
  })
  @IsOptional()
  @IsString()
  locale?: string;
}

/**
 * Query của `GET /auth/social/:provider/callback` — do PROVIDER gửi.
 *
 * ⚠️ Route dùng DTO này PHẢI nới `forbidNonWhitelisted`. Google còn gắn thêm `scope`,
 * `authuser`, `prompt`, `hl`; Facebook gắn `error_reason`, `error_description`. Với luật toàn
 * cục (`bootstrap.ts`) thì mỗi tham số thừa là một 400 — tức đăng nhập Google sẽ hỏng 100% mà
 * không có gì trong code XePrime trông sai cả.
 *
 * `code` và `state` đều optional vì luồng HUỶ là hợp lệ: người dùng bấm "Cancel" ở màn đồng ý
 * thì provider chỉ gửi `error=access_denied`.
 */
export class SocialCallbackQueryDto {
  @ApiPropertyOptional({ description: 'Authorization code, có khi người dùng đã đồng ý.' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Giá trị `state` đã phát ở bước bắt đầu.' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({
    description: 'Mã lỗi của provider. `access_denied` = người dùng bấm huỷ.',
    example: 'access_denied',
  })
  @IsOptional()
  @IsString()
  error?: string;
}
