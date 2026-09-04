import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import { PermissionsMap } from '../../permissions/permissions.constants';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsIn(['admin', 'trainer'])
  role!: 'admin' | 'trainer';

  // Loosely validated here on purpose — UsersService always runs this
  // through sanitizePermissions() before it ever reaches the database, so a
  // partial/malformed object can't corrupt data or grant unintended access.
  @IsOptional()
  @IsObject()
  permissions?: Partial<PermissionsMap>;
}