import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Student,
  StudentSchema,
} from './students.schema';

import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { PaymentsModule } from '../payments/payments.module';
import { AcademicModule } from '../academic/academic.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Student.name,
        schema: StudentSchema,
      },
    ]),
    PaymentsModule,
    AcademicModule,
    PermissionsModule,
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}