import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { AgricultureService } from './agriculture.service';
import {
  Alert,
  Correction,
  Device,
  Field,
  FieldIssue,
  InventoryItem,
  InventoryTransaction,
  PurchaseOrder,
  Task,
} from './types';
import { Public } from './auth/public.decorator';

@Controller()
export class AgricultureController {
  constructor(private readonly service: AgricultureService) {}

  @Get('dashboard')
  dashboard(): Record<string, unknown> {
    return this.service.getDashboard();
  }

  @Get('fields')
  fields(): Field[] {
    return this.service.getFields();
  }

  @Post('fields')
  createField(@Body() body: unknown): Field {
    return this.service.createField(body);
  }

  @Get('tasks')
  tasks(): Task[] {
    return this.service.getTasks();
  }

  @Post('tasks')
  createTask(@Body() body: unknown): Task {
    return this.service.createTask(body);
  }

  @Patch('tasks/:id/status')
  updateTaskStatus(
    @Param('id') id: string,
    @Headers('x-operation-id') operationId: string | undefined,
    @Headers('x-target-server-id') targetServerId: string | undefined,
    @Body() body: unknown,
  ): Task {
    return this.service.updateTaskStatus(id, body, operationId, targetServerId);
  }

  @Get('devices')
  devices(): Device[] {
    return this.service.getDevices();
  }

  @Public()
  @Post('devices/:id/telemetry')
  telemetry(
    @Param('id') id: string,
    @Headers('x-device-key') deviceKey: string | undefined,
    @Body() body: unknown,
  ): Device {
    return this.service.recordTelemetry(id, deviceKey, body);
  }

  @Get('alerts')
  alerts(): Alert[] {
    return this.service.getAlerts();
  }

  @Patch('alerts/:id/ack')
  acknowledgeAlert(@Param('id') id: string): Alert {
    return this.service.acknowledgeAlert(id);
  }

  @Get('issues')
  issues(): FieldIssue[] {
    return this.service.getIssues();
  }

  @Post('issues')
  createIssue(@Body() body: unknown): FieldIssue {
    return this.service.createIssue(body);
  }

  @Patch('issues/:id/status')
  updateIssueStatus(@Param('id') id: string, @Body() body: unknown): FieldIssue {
    return this.service.updateIssueStatus(id, body);
  }

  @Get('inventory')
  inventory(): InventoryItem[] {
    return this.service.getInventory();
  }

  @Post('inventory')
  createInventoryItem(@Body() body: unknown): InventoryItem {
    return this.service.createInventoryItem(body);
  }

  @Get('inventory/transactions')
  inventoryTransactions(): InventoryTransaction[] {
    return this.service.getInventoryTransactions();
  }

  @Post('inventory/:id/transactions')
  createInventoryTransaction(@Param('id') id: string, @Body() body: unknown): InventoryTransaction {
    return this.service.createInventoryTransaction(id, body);
  }

  @Get('purchases')
  purchases(): PurchaseOrder[] {
    return this.service.getPurchases();
  }

  @Post('purchases')
  createPurchase(@Body() body: unknown): PurchaseOrder {
    return this.service.createPurchase(body);
  }

  @Patch('purchases/:id/receive')
  receivePurchase(@Param('id') id: string, @Body() body: unknown): PurchaseOrder {
    return this.service.receivePurchase(id, body);
  }

  @Get('corrections')
  corrections(): Correction[] {
    return this.service.getCorrections();
  }

  @Post('corrections')
  createCorrection(@Body() body: unknown): Correction {
    return this.service.createCorrection(body);
  }

  @Patch('corrections/:id/status')
  updateCorrectionStatus(@Param('id') id: string, @Body() body: unknown): Correction {
    return this.service.updateCorrectionStatus(id, body);
  }
}
