import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';

import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  
  @Put('due-date')
  setFeeDueDate(
    @Body('feeDueDate') feeDueDate: string,
  ) {
    return this.paymentsService.setFeeDueDate(
      feeDueDate,
    );
  }

  
  @Get('due-date')
  getFeeDueDate() {
    return this.paymentsService.getFeeDueDate();
  }

  
  @Get()
  getPayments() {
    return this.paymentsService.getPayments();
  }


  @Get(':id')
  getPaymentById(@Param('id') id: string) {
    return this.paymentsService.getPaymentById(id);
  }
}