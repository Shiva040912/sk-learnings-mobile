import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { User, UserSchema } from './user.schema';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
      },
    ]),

    // UsersController now goes through PermissionsGuard like every other
    // controller — but PermissionsModule itself imports UsersModule (for
    // UsersService), so this needs forwardRef() on both sides to break
    // the cycle.
    forwardRef(() => PermissionsModule),
  ],

  controllers: [UsersController],

  providers: [UsersService],

  exports: [UsersService],
})
export class UsersModule {}