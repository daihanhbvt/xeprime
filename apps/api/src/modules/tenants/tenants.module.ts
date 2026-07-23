import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';

@Module({
  controllers: [TenantsController],
})
export class TenantsModule {}
