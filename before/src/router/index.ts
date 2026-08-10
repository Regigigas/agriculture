import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AppLayout from '@/components/AppLayout.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { guest: true } },
    {
      path: '/',
      component: AppLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', name: 'dashboard', component: () => import('@/views/DashboardView.vue'), meta: { title: '农业驾驶舱' } },
        { path: 'agronomy-decision', name: 'agronomy-decision', component: () => import('@/views/AgronomyDecisionView.vue'), meta: { title: '农情决策中心' } },
        { path: 'operations', name: 'operations', component: () => import('@/views/OperationsCenterView.vue'), meta: { title: '运营风险中心', adminOnly: true } },
        { path: 'data-security', name: 'data-security', component: () => import('@/views/OperationsCenterView.vue'), meta: { title: '本地备份与同步', adminOnly: true } },
        { path: 'communication', name: 'communication', component: () => import('@/views/CommunicationView.vue'), meta: { title: '工作沟通' } },
        { path: 'organizations', name: 'organizations', component: () => import('@/views/OrganizationsView.vue'), meta: { title: '经营主体与农场' } },
        { path: 'tasks', name: 'tasks', component: () => import('@/views/TasksView.vue'), meta: { title: '生产任务' } },
        { path: 'fields', name: 'fields', component: () => import('@/views/FieldsView.vue'), meta: { title: '农田档案' } },
        { path: 'field-3d', name: 'field-3d', component: () => import('@/views/Field3DView.vue'), meta: { title: '地块三维巡查' } },
        { path: 'experiments', name: 'experiments', component: () => import('@/views/ExperimentView.vue'), meta: { title: '农业对照试验' } },
        { path: 'production', name: 'production', component: () => import('@/views/ProductionView.vue'), meta: { title: '种植季与生产执行' } },
        { path: 'issues', name: 'issues', component: () => import('@/views/IssuesView.vue'), meta: { title: '巡田问题' } },
        { path: 'devices', name: 'devices', component: () => import('@/views/DevicesView.vue'), meta: { title: '设备监控' } },
        { path: 'inventory', name: 'inventory', component: () => import('@/views/InventoryView.vue'), meta: { title: '农资库存' } },
        { path: 'purchases', name: 'purchases', component: () => import('@/views/PurchasesView.vue'), meta: { title: '采购管理' } },
        { path: 'traceability', name: 'traceability', component: () => import('@/views/TraceabilityView.vue'), meta: { title: '采收销售与追溯' } },
        { path: 'compliance', name: 'compliance', component: () => import('@/views/ComplianceView.vue'), meta: { title: '合同与合规档案' } },
        { path: 'connections', name: 'connections', component: () => import('@/views/ConnectionView.vue'), meta: { title: '连接中心', adminOnly: true } },
        { path: 'update', name: 'update', component: () => import('@/views/UpdateView.vue'), meta: { title: '软件更新', adminOnly: true } },
      ],
    },
    { path: '/corrections', name: 'corrections', component: () => import('@/views/CorrectionView.vue'), meta: { requiresAuth: true, title: '纠错中心' } },
    { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (auth.token && !auth.sessionVerified) await auth.refreshSession()
  if (to.meta.requiresAuth && !auth.isAuthenticated) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.meta.adminOnly && auth.user?.role !== 'admin') return { name: 'dashboard' }
  if (to.meta.guest && auth.isAuthenticated) return { name: 'dashboard' }
  document.title = `${String(to.meta.title || '登录')} - 丰域农业`
})

export default router
