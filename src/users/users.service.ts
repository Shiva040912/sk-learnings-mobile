import {
  ConflictException,
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

  async createUser(
    createUserDto: CreateUserDto,
  ) {
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
    };
  }

  async updateUser(
    id: string,
    updateUserDto:
      UpdateUserDto,
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
      },
    };
  }

  async deleteUser(
    id: string,
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

    await this.userModel.deleteOne({
      _id: id,
    });

    return {
      message:
        'User deleted successfully',
    };
  }
}