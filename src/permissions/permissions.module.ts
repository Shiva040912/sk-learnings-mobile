import { Module } from '@nestjs/common';

import { UsersModule } from '../users/users.module';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';
import { PermissionsController } from './permissions.controller';

@Module({
  imports: [UsersModule],
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionsGuard],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
