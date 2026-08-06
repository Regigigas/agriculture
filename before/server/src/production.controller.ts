import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { AuthService } from './auth/auth.service';
import { CurrentUser } from './auth/current-user.decorator';
import { Roles } from './auth/roles.decorator';
import { ProductionService } from './production.service';
import { LocalDatabase } from './local-database';
import { Field, User } from './types';
import {
  BusinessSubject,
  ComplianceDocument,
  CropCycle,
  Farm,
  FarmContract,
  HarvestBatch,
  OperationLog,
  ProductionPlan,
  SalesOrder,
  TraceResult,
} from './production.types';

@Controller()
export class ProductionController {
  constructor(
    private readonly service: ProductionService,
    private readonly auth: AuthService,
    private readonly database: LocalDatabase,
  ) {}

  @Get('subjects') subjects(): BusinessSubject[] { return this.service.getSubjects(); }
  @Post('subjects') createSubject(@Body() body: unknown): BusinessSubject { return this.service.createSubject(body); }
  @Patch('subjects/:id/status') updateSubjectStatus(@Param('id') id: string, @Body() body: unknown): BusinessSubject { return this.service.updateSubjectStatus(id, body); }

  @Get('farms') farms(): Farm[] { return this.service.getFarms(); }
  @Post('farms') createFarm(@Body() body: unknown): Farm { return this.service.createFarm(body); }
  @Patch('farms/:id/status') updateFarmStatus(@Param('id') id: string, @Body() body: unknown): Farm { return this.service.updateFarmStatus(id, body); }

  @Get('crop-cycles') cycles(): CropCycle[] { return this.service.getCycles(); }
  @Post('crop-cycles') createCycle(@Body() body: unknown): CropCycle { return this.service.createCycle(body); }
  @Patch('crop-cycles/:id/status') updateCycleStatus(@Param('id') id: string, @Body() body: unknown): CropCycle { return this.service.updateCycleStatus(id, body); }

  @Roles('admin')
  @Patch('fields/:id/uproot')
  uprootField(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: User,
    @Headers('x-operation-authorization') operationAuthorization = '',
  ): Field {
    this.service.validateUprootField(id, body);
    return this.database.transaction(() => {
      this.auth.consumeOperationAuthorization(user.id, 'uproot-crop', operationAuthorization);
      return this.service.uprootField(id, body);
    });
  }

  @Get('production-plans') plans(): ProductionPlan[] { return this.service.getPlans(); }
  @Post('production-plans') createPlan(@Body() body: unknown): ProductionPlan { return this.service.createPlan(body); }
  @Patch('production-plans/:id/status') updatePlanStatus(@Param('id') id: string, @Body() body: unknown): ProductionPlan { return this.service.updatePlanStatus(id, body); }

  @Get('operation-logs') operationLogs(): OperationLog[] { return this.service.getOperationLogs(); }
  @Post('operation-logs') createOperationLog(@Body() body: unknown): OperationLog { return this.service.createOperationLog(body); }

  @Get('harvest-batches') harvestBatches(): HarvestBatch[] { return this.service.getHarvestBatches(); }
  @Post('harvest-batches') createHarvestBatch(@Body() body: unknown): HarvestBatch { return this.service.createHarvestBatch(body); }
  @Patch('harvest-batches/:id/quality') updateHarvestQuality(@Param('id') id: string, @Body() body: unknown): HarvestBatch { return this.service.updateHarvestQuality(id, body); }

  @Get('sales-orders') salesOrders(): SalesOrder[] { return this.service.getSalesOrders(); }
  @Post('sales-orders') createSalesOrder(@Body() body: unknown): SalesOrder { return this.service.createSalesOrder(body); }
  @Patch('sales-orders/:id/status') updateSalesStatus(@Param('id') id: string, @Body() body: unknown): SalesOrder { return this.service.updateSalesStatus(id, body); }

  @Get('trace/:code') trace(@Param('code') code: string): TraceResult { return this.service.getTrace(code); }

  @Get('compliance-documents') documents(): ComplianceDocument[] { return this.service.getDocuments(); }
  @Post('compliance-documents') createDocument(@Body() body: unknown): ComplianceDocument { return this.service.createDocument(body); }

  @Get('farm-contracts') contracts(): FarmContract[] { return this.service.getContracts(); }
  @Post('farm-contracts') createContract(@Body() body: unknown): FarmContract { return this.service.createContract(body); }
  @Patch('farm-contracts/:id/status') updateContractStatus(@Param('id') id: string, @Body() body: unknown): FarmContract { return this.service.updateContractStatus(id, body); }
}
