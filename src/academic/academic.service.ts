import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  Course,
  CourseDocument,
} from './course.schema';

import {
  Batch,
  BatchDocument,
} from './batch.schema';

import { CreateCourseDto } from './dto/create-course.dto';
import { CreateBatchDto } from './dto/create-batch.dto';

@Injectable()
export class AcademicService {
  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,

    @InjectModel(Batch.name)
    private readonly batchModel: Model<BatchDocument>,
  ) {}

  async createCourse(
    createCourseDto: CreateCourseDto,
  ) {
    const courseName =
      createCourseDto.courseName.trim();

    const existingCourse =
      await this.courseModel.findOne({
        courseName: {
          $regex: `^${this.escapeRegex(courseName)}$`,
          $options: 'i',
        },
      });

    if (existingCourse) {
      throw new ConflictException(
        'Course already exists',
      );
    }

    const course = new this.courseModel({
      courseName,
    });

    return course.save();
  }

  async getCourses() {
    return this.courseModel
      .find()
      .sort({ courseName: 1 });
  }

  async deleteCourse(id: string) {
    const course =
      await this.courseModel.findByIdAndDelete(
        id,
      );

    if (!course) {
      throw new NotFoundException(
        'Course not found',
      );
    }

    return {
      message:
        'Course deleted successfully',
    };
  }

  async createBatch(
    createBatchDto: CreateBatchDto,
  ) {
    const batchName =
      createBatchDto.batchName.trim();

    const existingBatch =
      await this.batchModel.findOne({
        batchName: {
          $regex: `^${this.escapeRegex(batchName)}$`,
          $options: 'i',
        },
      });

    if (existingBatch) {
      throw new ConflictException(
        'Batch already exists',
      );
    }

    const batch = new this.batchModel({
      batchName,
      startTime:
        createBatchDto.startTime.trim(),
      endTime:
        createBatchDto.endTime.trim(),
    });

    return batch.save();
  }

  async getBatches() {
    return this.batchModel
      .find()
      .sort({ batchName: 1 });
  }

  async deleteBatch(id: string) {
    const batch =
      await this.batchModel.findByIdAndDelete(
        id,
      );

    if (!batch) {
      throw new NotFoundException(
        'Batch not found',
      );
    }

    return {
      message:
        'Batch deleted successfully',
    };
  }

  private escapeRegex(value: string) {
    return value.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&',
    );
  }
}