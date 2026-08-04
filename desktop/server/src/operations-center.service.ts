import { Injectable } from '@nestjs/common';
import { AgricultureService } from './agriculture.service';
import { AuditLog, LocalDatabase } from './local-database';
import { OperationsRisk } from './production.types';
import { ProductionService } from './production.service';

@Injectable()
export class OperationsCenterService {
  constructor(
    private readonly agriculture: AgricultureService,
    private readonly production: ProductionService,
    private readonly database: LocalDatabase,
  ) {}

  summary(): Record<string, number> {
    const cycles = this.production.getCycles();
    const plans = this.production.getPlans();
    const logs = this.production.getOperationLogs();
    const harvests = this.production.getHarvestBatches();
    const sales = this.production.getSalesOrders();
    const risks = this.risks();
    return {
      activeSubjects: this.production.getSubjects().filter((item) => item.status === 'active').length,
      activeFarms: this.production.getFarms().filter((item) => item.status === 'active').length,
      activeCycles: cycles.filter((item) => ['planned', 'in_progress', 'harvesting'].includes(item.status)).length,
      pendingPlans: plans.filter((item) => ['planned', 'in_progress'].includes(item.status)).length,
      plannedBudget: cycles.filter((item) => item.status !== 'cancelled').reduce((sum, item) => sum + item.budget, 0),
      actualCost: logs.reduce((sum, item) => sum + item.cost, 0),
      harvestQuantity: harvests.reduce((sum, item) => sum + item.quantity, 0),
      salesRevenue: sales.reduce((sum, item) => sum + item.amount, 0),
      receivables: sales.filter((item) => item.paymentStatus !== 'paid').reduce((sum, item) => sum + item.amount, 0),
      criticalRisks: risks.filter((item) => item.severity === 'critical').length,
      openRisks: risks.length,
    };
  }

  risks(): OperationsRisk[] {
    const risks: OperationsRisk[] = [];
    const today = this.localDateKey();
    const warningDate = this.addDays(today, 30);

    for (const alert of this.agriculture.getAlerts().filter((item) => !item.acknowledged)) {
      risks.push({ id: `alert:${alert.id}`, source: 'alert', sourceId: alert.id, title: alert.title, content: alert.message, severity: alert.severity === 'critical' ? 'critical' : 'warning', status: 'open', riskAt: alert.createdAt, route: '/devices' });
    }
    for (const task of this.agriculture.getTasks().filter((item) => item.status !== 'completed' && item.dueDate < today)) {
      risks.push({ id: `task:${task.id}`, source: 'task', sourceId: task.id, title: '生产任务逾期', content: `${task.title}，负责人 ${task.assignee}，截止 ${task.dueDate}`, severity: task.priority === 'high' ? 'critical' : 'warning', status: task.status, riskAt: task.dueDate, route: '/tasks' });
    }
    for (const issue of this.agriculture.getIssues().filter((item) => item.status !== 'closed')) {
      risks.push({ id: `issue:${issue.id}`, source: 'issue', sourceId: String(issue.id), title: issue.title, content: `${issue.description}，处理人 ${issue.assignee}`, severity: ['high', 'critical'].includes(issue.severity) ? 'critical' : 'warning', status: issue.status, riskAt: issue.reviewDueDate || issue.updatedAt, route: '/issues' });
    }
    for (const item of this.agriculture.getInventory().filter((candidate) => candidate.quantity <= candidate.minimumStock)) {
      risks.push({ id: `inventory:${item.id}`, source: 'inventory', sourceId: item.id, title: '农资库存不足', content: `${item.name}：现存 ${item.quantity}${item.unit}，安全库存 ${item.minimumStock}${item.unit}`, severity: item.quantity <= item.minimumStock * 0.5 ? 'critical' : 'warning', status: 'open', riskAt: item.updatedAt, route: '/inventory' });
    }
    for (const cycle of this.production.getCycles().filter((item) => !['completed', 'cancelled'].includes(item.status) && item.plannedHarvest <= warningDate)) {
      risks.push({ id: `cycle:${cycle.id}`, source: 'cycle', sourceId: cycle.id, title: cycle.plannedHarvest < today ? '种植季采收逾期' : '种植季临近采收', content: `${cycle.code} ${cycle.crop}，计划采收 ${cycle.plannedHarvest}`, severity: cycle.plannedHarvest < today ? 'critical' : 'warning', status: cycle.status, riskAt: cycle.plannedHarvest, route: '/production' });
    }
    for (const batch of this.production.getHarvestBatches().filter((item) => item.qualityStatus === 'pending')) {
      risks.push({ id: `quality:${batch.id}`, source: 'quality', sourceId: batch.id, title: '采收批次待质检', content: `${batch.batchCode} ${batch.product} ${batch.quantity}${batch.unit}`, severity: 'warning', status: batch.qualityStatus, riskAt: batch.harvestedAt, route: '/traceability' });
    }
    for (const contract of this.production.getContracts().filter((item) => item.status === 'expired' || (item.status === 'active' && item.endDate <= warningDate))) {
      risks.push({ id: `contract:${contract.id}`, source: 'contract', sourceId: contract.id, title: contract.status === 'expired' ? '合同已到期' : '合同即将到期', content: `${contract.contractNo} ${contract.title}，到期日 ${contract.endDate}`, severity: contract.status === 'expired' ? 'critical' : 'warning', status: contract.status, riskAt: contract.endDate, route: '/compliance' });
    }
    for (const document of this.production.getDocuments().filter((item) => ['expiring', 'expired'].includes(item.status))) {
      risks.push({ id: `document:${document.id}`, source: 'document', sourceId: document.id, title: document.status === 'expired' ? '合规文书已过期' : '合规文书即将到期', content: `${document.name}，有效期 ${document.expiryDate || '长期'}`, severity: document.status === 'expired' ? 'critical' : 'warning', status: document.status, riskAt: document.expiryDate || document.updatedAt, route: '/compliance' });
    }
    return risks.sort((a, b) => {
      const severity = (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1);
      return severity || a.riskAt.localeCompare(b.riskAt);
    });
  }

  auditLogs(limit = 200): AuditLog[] {
    return this.database.listAuditLogs(limit);
  }

  private localDateKey(): string {
    const value = new Date();
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  private addDays(date: string, days: number): string {
    const value = new Date(`${date}T12:00:00`);
    value.setDate(value.getDate() + days);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
}
