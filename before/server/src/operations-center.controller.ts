import { Controller, Get, Query } from '@nestjs/common';
import { AuditLog } from './local-database';
import { OperationsCenterService } from './operations-center.service';
import { OperationsRisk } from './production.types';

@Controller('operations')
export class OperationsCenterController {
  constructor(private readonly service: OperationsCenterService) {}

  @Get('summary') summary(): Record<string, number> { return this.service.summary(); }
  @Get('risks') risks(): OperationsRisk[] { return this.service.risks(); }
  @Get('audit-logs') auditLogs(@Query('limit') limit?: string): AuditLog[] {
    const parsed = Number(limit ?? 200);
    return this.service.auditLogs(Number.isFinite(parsed) ? parsed : 200);
  }
}
