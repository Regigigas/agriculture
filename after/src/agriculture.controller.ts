import { Body, Controller, ForbiddenException, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { AgricultureService } from './agriculture.service';
import { ApplicationDatabase } from './application-database';
import { Alert, Device, Field, InventoryItem, PurchaseOrder, Task, User } from './types';
import { AuthService } from './auth/auth.service';
import { CurrentUser } from './auth/current-user.decorator';
import { Public } from './auth/public.decorator';
import { Roles } from './auth/roles.decorator';

@Controller()
export class AgricultureController {
  constructor(
    private readonly service: AgricultureService,
    private readonly auth: AuthService,
    private readonly database: ApplicationDatabase,
  ) {}

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
      if (!this.auth.consumeOperationAuthorization(user.id, 'uproot-crop', operationAuthorization)) {
        throw new ForbiddenException('高危操作授权无效、已使用或已过期');
      }
      return this.service.uprootField(id, body);
    });
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
  updateTaskStatus(@Param('id') id: string, @Body() body: unknown): Task {
    return this.service.updateTaskStatus(id, body);
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

  @Get('inventory')
  inventory(): InventoryItem[] {
    return this.service.getInventory();
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
}
