import {
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import { PermissionsMap } from '../../permissions/permissions.constants';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsIn(['admin', 'trainer'])
  role?: 'admin' | 'trainer';

  // See CreateUserDto — sanitized in UsersService before being persisted.
  @IsOptional()
  @IsObject()
  permissions?: Partial<PermissionsMap>;
}