import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { AgricultureService } from './agriculture.service';
import { Alert, Device, Field, InventoryItem, Task } from './types';
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
}
