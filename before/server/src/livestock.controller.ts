import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { LivestockService } from './livestock.service'

@Controller('livestock')
export class LivestockController {
  constructor(private readonly service: LivestockService) {}
  @Get('summary') summary() { return this.service.summary() }
  @Get('barns') barns() { return this.service.listBarns() }
  @Post('barns') createBarn(@Body() body: unknown) { return this.service.createBarn(body) }
  @Patch('barns/:id/status') updateBarnStatus(@Param('id') id: string, @Body() body: unknown) { return this.service.updateBarnStatus(id, body) }
  @Get('batches') batches() { return this.service.listBatches() }
  @Post('batches') createBatch(@Body() body: unknown) { return this.service.createBatch(body) }
  @Patch('batches/:id/status') updateBatchStatus(@Param('id') id: string, @Body() body: unknown) { return this.service.updateBatchStatus(id, body) }
  @Get('feeding') feeding() { return this.service.listFeeding() }
  @Post('feeding') createFeeding(@Body() body: unknown) { return this.service.createFeeding(body) }
  @Get('health') health() { return this.service.listHealth() }
  @Post('health') createHealth(@Body() body: unknown) { return this.service.createHealth(body) }
  @Get('exits') exits() { return this.service.listExits() }
  @Post('exits') createExit(@Body() body: unknown) { return this.service.createExit(body) }
}
