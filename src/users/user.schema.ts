import {
  Prop,
  Schema,
  SchemaFactory,
} from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

import { PermissionsMap } from '../permissions/permissions.constants';

export type UserDocument =
  HydratedDocument<User>;

@Schema({
  timestamps: true,
})
export class User {
  @Prop({
    required: true,
    trim: true,
  })
  name!: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email!: string;

  @Prop({
    required: true,
  })
  password!: string;

  @Prop({
    enum: ['admin', 'trainer'],
    default: 'trainer',
  })
  role!: 'admin' | 'trainer';

  @Prop({
    default: true,
  })
  isActive!: boolean;

  // Only meaningful for role: 'trainer' — admins are always full-access
  // (see PermissionsService) and never read from this field. Stored as a
  // free-form object because the set of pages/actions/columns/sections is
  // defined once in permissions.constants.ts and can grow without a schema
  // migration; every write is passed through sanitizePermissions() first.
  @Prop({
    type: MongooseSchema.Types.Mixed,
    default: {},
  })
  permissions?: Partial<PermissionsMap>;
}

export const UserSchema =
  SchemaFactory.createForClass(User);