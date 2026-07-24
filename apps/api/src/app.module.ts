import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './config/env.schema';
import { AuthGuard } from './common/guards/auth.guard';
import { PermissionGuard } from './common/guards/permission.guard';
import { TenantScopeGuard } from './common/guards/tenant-scope.guard';
import { PlatformScopeGuard } from './common/guards/platform-scope.guard';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { HealthModule } from './modules/health/health.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { AuditModule } from './modules/audit/audit.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { PublicListingsModule } from './modules/public-listings/public-listings.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { BookingRequestsModule } from './modules/booking-requests/booking-requests.module';
import { ChatModule } from './modules/chat/chat.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),

    LoggerModule.forRoot({
      pinoHttp: {
        // Redact trước khi ghi: CLAUDE.md/security rules cấm log token.
        redact: {
          paths: [
            'req.headers.cookie',
            'req.headers.authorization',
            'res.headers["set-cookie"]',
            'req.body.idToken',
          ],
          remove: true,
        },
        autoLogging: { ignore: (req) => req.url === '/health' },
      },
    }),

    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),

    PrismaModule,
    AuthModule,
    RbacModule,
    AuditModule,

    HealthModule,
    UsersModule,
    TenantsModule,
    CalendarModule,
    PublicListingsModule,
    VehiclesModule,
    BookingsModule,
    BookingRequestsModule,
    ChatModule,
    PlatformAdminModule,
  ],
  providers: [
    // Thứ tự quan trọng (guard global chạy theo đúng thứ tự khai báo): Throttler chặn trước
    // khi chạm DB; AuthGuard gắn req.user; TenantScopeGuard nạp req.tenant cho endpoint có
    // @TenantScoped; PermissionGuard đọc quyền mà các guard trước đã nạp. TenantScopeGuard
    // PHẢI đứng trước PermissionGuard — guard controller chạy sau guard global nên không thể
    // nạp scope kịp cho PermissionGuard.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: TenantScopeGuard },
    { provide: APP_GUARD, useClass: PlatformScopeGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
