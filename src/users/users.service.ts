import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';

import {
  User,
  UserDocument,
} from './user.schema';

import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  buildDefaultTrainerPermissions,
  sanitizePermissions,
} from '../permissions/permissions.constants';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel:
      Model<UserDocument>,
  ) {}

  async findByEmail(email: string) {
    return this.userModel.findOne({
      email: email
        .toLowerCase()
        .trim(),
    });
  }

  // 'users' page access can now be granted to a Trainer (see
  // PERMISSION_PAGES), so this is no longer implicitly admin-only —
  // creating/editing an ADMIN account specifically still is, otherwise a
  // Trainer granted 'users' access could hand themselves (or an
  // accomplice) full admin rights.
  private ensureNotEscalatingToAdmin(
    callerRole: string | undefined,
    targetRole: string | undefined,
  ) {
    if (
      targetRole === 'admin' &&
      callerRole !== 'admin'
    ) {
      throw new ForbiddenException(
        'Only an administrator can create or modify an admin account',
      );
    }
  }

  async createUser(
    createUserDto: CreateUserDto,
    callerRole?: string,
  ) {
    this.ensureNotEscalatingToAdmin(
      callerRole,
      createUserDto.role,
    );

    const email =
      createUserDto.email
        .toLowerCase()
        .trim();

    const existingUser =
      await this.userModel.findOne({
        email,
      });

    if (existingUser) {
      throw new ConflictException(
        'Email already exists',
      );
    }

    const hashedPassword =
      await bcrypt.hash(
        createUserDto.password,
        10,
      );

    const user =
      new this.userModel({
        name:
          createUserDto.name.trim(),
        email,
        password:
          hashedPassword,
        role:
          createUserDto.role,
        isActive: true,
        permissions:
          createUserDto.role === 'trainer'
            ? sanitizePermissions(
                createUserDto.permissions ??
                  buildDefaultTrainerPermissions(),
              )
            : undefined,
      });

    const savedUser =
      await user.save();

    return {
      message:
        'User created successfully',

      user: {
        id: savedUser._id,
        name: savedUser.name,
        email: savedUser.email,
        role: savedUser.role,
        permissions: savedUser.permissions,
      },
    };
  }

  async getAllUsers() {
    const users =
      await this.userModel
        .find()
        .select('-password')
        .lean();

    return users.map(
      (user) => ({
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      }),
    );
  }

  async getUserById(
    id: string,
  ) {
    const user =
      await this.userModel
        .findById(id)
        .select('-password')
        .lean();

    if (!user) {
      throw new NotFoundException(
        'User not found',
      );
    }

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    };
  }

  async updateUser(
    id: string,
    updateUserDto:
      UpdateUserDto,
    callerRole?: string,
  ) {
    const user =
      await this.userModel.findById(
        id,
      );

    if (!user) {
      throw new NotFoundException(
        'User not found',
      );
    }

    // Covers both directions: editing an account that's already an admin,
    // and promoting a trainer to admin via this same request.
    this.ensureNotEscalatingToAdmin(
      callerRole,
      user.role,
    );

    this.ensureNotEscalatingToAdmin(
      callerRole,
      updateUserDto.role,
    );

    if (updateUserDto.email) {
      const email =
        updateUserDto.email
          .toLowerCase()
          .trim();

      const existingUser =
        await this.userModel.findOne({
          email,
          _id: { $ne: id },
        });

      if (existingUser) {
        throw new ConflictException(
          'Email already exists',
        );
      }

      user.email = email;
    }

    if (updateUserDto.name) {
      user.name =
        updateUserDto.name.trim();
    }

    if (updateUserDto.role) {
      user.role =
        updateUserDto.role;
    }

    if (
      updateUserDto.permissions ||
      updateUserDto.role
    ) {
      if (user.role === 'trainer') {
        const hasExisting =
          user.permissions &&
          typeof user.permissions ===
            'object' &&
          Object.keys(user.permissions)
            .length > 0;

        const currentRaw = hasExisting
          ? user.permissions
          : buildDefaultTrainerPermissions();

        user.permissions =
          sanitizePermissions({
            ...currentRaw,
            ...(updateUserDto.permissions ||
              {}),
          }) as any;
      } else {
        user.permissions = undefined;
      }
    }

    if (
      updateUserDto.password
    ) {
      user.password =
        await bcrypt.hash(
          updateUserDto.password,
          10,
        );
    }

    const updatedUser =
      await user.save();

    return {
      message:
        'User updated successfully',

      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        permissions: updatedUser.permissions,
      },
    };
  }

  async deleteUser(
    id: string,
    callerRole?: string,
  ) {
    const user =
      await this.userModel.findById(
        id,
      );

    if (!user) {
      throw new NotFoundException(
        'User not found',
      );
    }

    this.ensureNotEscalatingToAdmin(
      callerRole,
      user.role,
    );

    await this.userModel.deleteOne({
      _id: id,
    });

    return {
      message:
        'User deleted successfully',
    };
  }
}