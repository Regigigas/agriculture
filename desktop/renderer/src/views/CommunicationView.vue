<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { ArrowLeft, Check, CheckCheck, MessageCircle, Plus, RefreshCw, RotateCcw, Search, Send, UserPlus, Users } from '@lucide/vue'
import PageHeader from '@/components/PageHeader.vue'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import type { ChatConversation, ChatMessage, CreateUserInput, UserRole } from '@/types'

const auth = useAuthStore()
const chat = useChatStore()
const notice = useMessage()
const activeList = ref<'conversations' | 'contacts'>('conversations')
const conversationQuery = ref('')
const contactQuery = ref('')
const draft = ref('')
const mobileChatVisible = ref(false)
const groupVisible = ref(false)
const accountVisible = ref(false)
const groupSubmitting = ref(false)
const accountSubmitting = ref(false)
const messageList = ref<HTMLElement | null>(null)
const groupForm = reactive<{ title: string; memberIds: Array<string | number> }>({ title: '', memberIds: [] })
const accountForm = reactive<CreateUserInput>({ name: '', username: '', password: '', role: 'worker' })
const roleOptions: Array<{ label: string; value: UserRole }> = [
  { label: '工作人员', value: 'worker' },
  { label: '管理员', value: 'admin' },
]

const isAdmin = computed(() => auth.user?.role === 'admin')
const contacts = computed(() => chat.users.filter((user) => !isCurrentUser(user)))
const filteredContacts = computed(() => {
  const query = contactQuery.value.trim().toLowerCase()
  if (!query) return contacts.value
  return contacts.value.filter((user) => `${user.name || ''} ${user.username}`.toLowerCase().includes(query))
})
const filteredConversations = computed(() => {
  const query = conversationQuery.value.trim().toLowerCase()
  if (!query) return chat.conversations
  return chat.conversations.filter((item) => conversationTitle(item).toLowerCase().includes(query))
})
const groupMemberOptions = computed(() => contacts.value
  .filter((user) => user.id !== undefined)
  .map((user) => ({ label: `${user.name || user.username} (${user.username})`, value: user.id as string | number })))

function isCurrentUser(user: { id?: string | number; username: string }) {
  if (auth.user?.id !== undefined && user.id !== undefined) return String(user.id) === String(auth.user.id)
  return user.username === auth.user?.username
}

function conversationTitle(conversation: ChatConversation) {
  if (conversation.type === 'group') return conversation.title || '未命名群聊'
  const counterpart = conversation.members.find((member) => !isCurrentUser(member))
  return counterpart?.name || counterpart?.username || conversation.title || '私聊会话'
}

function conversationSubtitle(conversation: ChatConversation) {
  if (conversation.lastMessage?.body) return conversation.lastMessage.body
  return conversation.type === 'group' ? `${conversation.members.length} 位成员` : '尚无消息'
}

function displayTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function displayMessageTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

function isOwnMessage(item: ChatMessage) {
  if (auth.user?.id !== undefined && String(item.senderId) === String(auth.user.id)) return true
  return item.sender?.username === auth.user?.username || String(item.senderId) === auth.user?.username
}

function senderName(item: ChatMessage) {
  if (isOwnMessage(item)) return '我'
  return item.sender?.name || item.sender?.username || '成员'
}

function deliveryText(item: ChatMessage) {
  if (item.clientStatus === 'sending') return '发送中'
  if (item.clientStatus === 'failed') return '发送失败'
  return '已发送'
}

async function openConversation(id: string | number) {
  mobileChatVisible.value = true
  try {
    await chat.selectConversation(id)
    await scrollToLatest()
  } catch (cause) {
    notice.error(cause instanceof Error ? cause.message : '消息加载失败')
  }
}

async function startPrivate(userId: string | number | undefined) {
  if (userId === undefined) return notice.warning('该联系人缺少用户标识，无法发起会话')
  try {
    await chat.createPrivateConversation(userId)
    activeList.value = 'conversations'
    mobileChatVisible.value = true
    await scrollToLatest()
  } catch (cause) {
    notice.error(cause instanceof Error ? cause.message : '发起私聊失败')
  }
}

function openGroupDialog() {
  groupForm.title = ''
  groupForm.memberIds = []
  groupVisible.value = true
}

async function createGroup() {
  if (!groupForm.title.trim()) return notice.warning('请输入群聊名称')
  if (!groupForm.memberIds.length) return notice.warning('请至少选择一位群聊成员')
  groupSubmitting.value = true
  try {
    await chat.createGroupConversation({ title: groupForm.title.trim(), memberIds: groupForm.memberIds })
    groupVisible.value = false
    activeList.value = 'conversations'
    mobileChatVisible.value = true
    notice.success('群聊已创建')
  } catch (cause) {
    notice.error(cause instanceof Error ? cause.message : '创建群聊失败')
  } finally {
    groupSubmitting.value = false
  }
}

async function sendMessage() {
  const content = draft.value.trim()
  if (!content || !chat.activeConversation) return
  draft.value = ''
  await scrollToLatest()
  try {
    await chat.sendMessage(content)
  } catch {
    notice.error('消息发送失败，可在消息下方手动重试')
  }
  await scrollToLatest()
}

async function retryMessage(id: string | number) {
  try {
    await chat.retryMessage(id)
  } catch {
    notice.error('重试仍未成功，请检查网络后再试')
  }
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void sendMessage()
}

async function createAccount() {
  if (!accountForm.name.trim() || !accountForm.username.trim() || !accountForm.password) return notice.warning('请完整填写账号信息')
  accountSubmitting.value = true
  try {
    await chat.createUser({
      name: accountForm.name.trim(),
      username: accountForm.username.trim(),
      password: accountForm.password,
      role: accountForm.role,
    })
    Object.assign(accountForm, { name: '', username: '', password: '', role: 'worker' as UserRole })
    notice.success('账号已添加')
  } catch (cause) {
    notice.error(cause instanceof Error ? cause.message : '添加账号失败')
  } finally {
    accountSubmitting.value = false
  }
}

async function refresh() {
  await chat.initialize()
  if (chat.error) notice.error(chat.error)
}

async function scrollToLatest() {
  await nextTick()
  if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight
}

watch(() => chat.messages.length, () => {
  if (!chat.olderMessagesLoading) void scrollToLatest()
})

onMounted(async () => {
  await chat.initialize()
  chat.startPolling()
  await scrollToLatest()
})

onBeforeUnmount(() => chat.stopPolling())
</script>

<template>
  <div class="communication-page">
    <page-header title="工作沟通" description="与生产、采购和现场团队保持同步">
      <n-button v-if="isAdmin" secondary @click="accountVisible = true"><template #icon><UserPlus /></template>账号管理</n-button>
      <n-button type="primary" @click="openGroupDialog"><template #icon><Plus /></template>创建群聊</n-button>
    </page-header>

    <n-alert v-if="chat.error" class="communication-alert" type="error" :show-icon="true">
      {{ chat.error }}
      <template #action><n-button text type="error" @click="refresh">重新加载</n-button></template>
    </n-alert>

    <section :class="['communication-workspace', { 'mobile-chat': mobileChatVisible }]">
      <aside class="navigation-pane">
        <n-tabs v-model:value="activeList" type="line" justify-content="space-evenly" pane-style="height: 100%;">
          <n-tab-pane name="conversations" tab="会话">
            <div class="pane-search"><n-input v-model:value="conversationQuery" clearable placeholder="搜索会话"><template #prefix><Search :size="16" /></template></n-input></div>
            <div class="conversation-list">
              <button
                v-for="item in filteredConversations"
                :key="item.id"
                :class="['conversation-row', { active: String(chat.activeConversationId) === String(item.id) }]"
                @click="openConversation(item.id)"
              >
                <span :class="['conversation-avatar', item.type]"><Users v-if="item.type === 'group'" /><MessageCircle v-else /></span>
                <span class="conversation-copy"><strong>{{ conversationTitle(item) }}</strong><small>{{ conversationSubtitle(item) }}</small></span>
                <span class="conversation-meta"><time>{{ displayTime(item.updatedAt) }}</time><n-badge v-if="item.unreadCount" :value="item.unreadCount" :max="99" /></span>
              </button>
              <n-empty v-if="!chat.loading && !filteredConversations.length" size="small" description="暂无会话" />
              <n-spin v-if="chat.loading" class="list-loading" size="small" />
            </div>
          </n-tab-pane>
          <n-tab-pane name="contacts" tab="联系人">
            <div class="pane-search"><n-input v-model:value="contactQuery" clearable placeholder="搜索联系人"><template #prefix><Search :size="16" /></template></n-input></div>
            <div class="contact-list">
              <button v-for="user in filteredContacts" :key="user.id ?? user.username" class="contact-row" @click="startPrivate(user.id)">
                <n-avatar round :size="36">{{ (user.name || user.username).slice(0, 1) }}</n-avatar>
                <span><strong>{{ user.name || user.username }}</strong><small>@{{ user.username }}</small></span>
                <MessageCircle />
              </button>
              <n-empty v-if="!filteredContacts.length" size="small" description="暂无联系人" />
            </div>
          </n-tab-pane>
        </n-tabs>
      </aside>

      <main class="chat-pane">
        <template v-if="chat.activeConversation">
          <header class="chat-heading">
            <n-button class="chat-back" quaternary circle aria-label="返回会话列表" @click="mobileChatVisible = false"><ArrowLeft /></n-button>
            <span :class="['conversation-avatar', chat.activeConversation.type]"><Users v-if="chat.activeConversation.type === 'group'" /><MessageCircle v-else /></span>
            <div><h2>{{ conversationTitle(chat.activeConversation) }}</h2><p>{{ chat.activeConversation.type === 'group' ? `${chat.activeConversation.members.length} 位成员` : '私聊' }}</p></div>
            <n-button quaternary circle title="刷新消息" aria-label="刷新消息" :loading="chat.messagesLoading" @click="chat.selectConversation(chat.activeConversation.id)"><RefreshCw /></n-button>
          </header>

          <div ref="messageList" class="message-list">
            <n-spin v-if="chat.messagesLoading && !chat.messages.length" class="message-loading" />
            <n-empty v-else-if="!chat.messages.length" description="发送第一条消息开始沟通" />
            <div v-else-if="chat.hasOlderMessages" class="history-action"><n-button text :loading="chat.olderMessagesLoading" @click="chat.loadOlderMessages">加载更早消息</n-button></div>
            <div v-for="item in chat.messages" :key="item.id" :class="['message-row', { own: isOwnMessage(item) }]">
              <n-avatar v-if="!isOwnMessage(item)" round :size="32">{{ senderName(item).slice(0, 1) }}</n-avatar>
              <div class="message-content">
                <span class="message-sender">{{ senderName(item) }}</span>
                <div :class="['message-bubble', { failed: item.clientStatus === 'failed' }]">{{ item.body }}</div>
                <div class="message-status">
                  <time>{{ displayMessageTime(item.createdAt) }}</time>
                  <template v-if="isOwnMessage(item)">
                    <span :class="{ failed: item.clientStatus === 'failed' }"><CheckCheck v-if="item.clientStatus === 'sent'" /><Check v-else />{{ deliveryText(item) }}</span>
                    <button v-if="item.clientStatus === 'failed'" @click="retryMessage(item.id)"><RotateCcw />重试</button>
                  </template>
                </div>
              </div>
            </div>
          </div>

          <footer class="composer">
            <n-input v-model:value="draft" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" placeholder="输入消息" @keydown="handleComposerKeydown" />
            <n-button type="primary" circle :disabled="!draft.trim()" title="发送消息" aria-label="发送消息" @click="sendMessage"><Send /></n-button>
          </footer>
        </template>
        <div v-else class="chat-empty"><MessageCircle /><h2>选择一个会话</h2><p>从会话列表继续沟通，或从联系人发起私聊。</p></div>
      </main>
    </section>

    <n-modal v-model:show="groupVisible" preset="card" title="创建群聊" class="communication-modal">
      <n-form label-placement="top">
        <n-form-item label="群聊名称" required><n-input v-model:value="groupForm.title" maxlength="40" show-count placeholder="例如：秋收协调组" /></n-form-item>
        <n-form-item label="群聊成员" required><n-select v-model:value="groupForm.memberIds" multiple filterable :options="groupMemberOptions" placeholder="至少选择一位成员" /></n-form-item>
      </n-form>
      <template #footer><div class="modal-actions"><n-button @click="groupVisible = false">取消</n-button><n-button type="primary" :loading="groupSubmitting" @click="createGroup">创建群聊</n-button></div></template>
    </n-modal>

    <n-drawer v-if="isAdmin" v-model:show="accountVisible" placement="right" :width="520">
      <n-drawer-content title="账号管理" closable>
        <section class="account-form">
          <h3>添加账号</h3>
          <n-form label-placement="top">
            <div class="account-form-grid">
              <n-form-item label="姓名" required><n-input v-model:value="accountForm.name" placeholder="成员姓名" /></n-form-item>
              <n-form-item label="登录账号" required><n-input v-model:value="accountForm.username" placeholder="英文或数字账号" /></n-form-item>
              <n-form-item label="初始密码" required><n-input v-model:value="accountForm.password" type="password" show-password-on="click" placeholder="设置初始密码" /></n-form-item>
              <n-form-item label="角色" required><n-select v-model:value="accountForm.role" :options="roleOptions" /></n-form-item>
            </div>
            <n-button type="primary" :loading="accountSubmitting" @click="createAccount"><template #icon><UserPlus /></template>添加账号</n-button>
          </n-form>
        </section>
        <section class="account-list">
          <div class="account-list-heading"><h3>现有账号</h3><span>{{ chat.users.length }} 个</span></div>
          <n-table :single-line="false" size="small">
            <thead><tr><th>姓名</th><th>账号</th><th>角色</th></tr></thead>
            <tbody><tr v-for="user in chat.users" :key="user.id ?? user.username"><td>{{ user.name || '-' }}</td><td>{{ user.username }}</td><td><n-tag size="small" :type="user.role === 'admin' ? 'warning' : 'default'">{{ user.role === 'admin' ? '管理员' : '普通用户' }}</n-tag></td></tr></tbody>
          </n-table>
        </section>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<style scoped>
.communication-page { min-width: 0; }
.communication-alert { margin-bottom: 14px; }
.communication-workspace { height: calc(100vh - 200px); min-height: 520px; display: grid; grid-template-columns: 310px minmax(0, 1fr); overflow: hidden; border: 1px solid #dfe5e1; border-radius: 8px; background: #fff; }
.navigation-pane { min-width: 0; overflow: hidden; border-right: 1px solid #e3e8e5; background: #fafbfa; }
.navigation-pane :deep(.n-tabs) { height: 100%; display: flex; flex-direction: column; }
.navigation-pane :deep(.n-tabs-nav) { flex: 0 0 auto; padding: 0 18px; background: #fff; }
.navigation-pane :deep(.n-tabs-pane-wrapper), .navigation-pane :deep(.n-tab-pane) { min-height: 0; flex: 1; }
.navigation-pane :deep(.n-tab-pane) { height: 100%; display: flex; flex-direction: column; }
.pane-search { padding: 14px; flex: 0 0 auto; }
.conversation-list, .contact-list { min-height: 0; padding: 0 8px 12px; overflow-y: auto; }
.conversation-row, .contact-row { width: 100%; min-width: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.conversation-row { min-height: 70px; padding: 10px; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: 10px; border-radius: 7px; }
.conversation-row:hover, .contact-row:hover { background: #f0f3f1; }
.conversation-row.active { background: #e8efea; }
.conversation-avatar { width: 40px; height: 40px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 7px; color: #426650; background: #e3ede6; }
.conversation-avatar.group { color: #546f7d; background: #e5edf0; }
.conversation-avatar svg { width: 19px; height: 19px; }
.conversation-copy, .conversation-copy strong, .conversation-copy small, .contact-row > span { min-width: 0; display: block; }
.conversation-copy strong, .contact-row strong { overflow: hidden; color: #2d3a34; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.conversation-copy small, .contact-row small { margin-top: 4px; overflow: hidden; color: #82908a; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.conversation-meta { align-self: stretch; display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; }
.conversation-meta time { color: #929c97; font-size: 10px; }
.contact-row { min-height: 58px; padding: 9px 10px; display: grid; grid-template-columns: 36px minmax(0, 1fr) 20px; align-items: center; gap: 10px; border-radius: 7px; }
.contact-row > svg { width: 17px; color: #76847d; }
.list-loading { margin: 36px auto; display: block; }
.conversation-list > :deep(.n-empty), .contact-list > :deep(.n-empty) { margin-top: 48px; }
.chat-pane { min-width: 0; min-height: 0; display: grid; grid-template-rows: 68px minmax(0, 1fr) auto; background: #fff; }
.chat-heading { min-width: 0; padding: 0 20px; display: flex; align-items: center; gap: 11px; border-bottom: 1px solid #e5e9e7; }
.chat-heading > div { min-width: 0; flex: 1; }
.chat-heading h2 { margin: 0; overflow: hidden; color: #29362f; font-size: 15px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.chat-heading p { margin: 3px 0 0; color: #84908a; font-size: 10px; }
.chat-heading .conversation-avatar { width: 38px; height: 38px; }
.chat-heading > .n-button:last-child { flex: 0 0 auto; }
.chat-back { display: none; }
.message-list { min-height: 0; padding: 24px clamp(18px, 4vw, 54px); overflow-y: auto; background: #f7f9f7; }
.message-loading { margin: 60px auto; display: block; }
.history-action { padding-bottom: 16px; text-align: center; }
.message-list > :deep(.n-empty) { margin-top: 90px; }
.message-row { margin-bottom: 18px; display: flex; align-items: flex-start; gap: 9px; }
.message-row.own { justify-content: flex-end; }
.message-content { min-width: 0; max-width: min(68%, 680px); }
.message-row.own .message-content { display: flex; flex-direction: column; align-items: flex-end; }
.message-sender { display: block; margin: 0 3px 5px; color: #7c8983; font-size: 10px; }
.message-bubble { padding: 10px 13px; border: 1px solid #dfe5e1; border-radius: 3px 7px 7px; background: #fff; color: #34423b; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; }
.message-row.own .message-bubble { border-color: #c8dacd; border-radius: 7px 3px 7px 7px; background: #e2ece5; }
.message-bubble.failed { border-color: #dfb8b1; background: #f7ebe9; }
.message-status { min-height: 17px; margin: 4px 3px 0; display: flex; align-items: center; gap: 8px; color: #929c97; font-size: 9px; }
.message-status span, .message-status button { display: inline-flex; align-items: center; gap: 3px; }
.message-status svg { width: 12px; height: 12px; }
.message-status .failed { color: #ad5549; }
.message-status button { padding: 0; border: 0; background: transparent; color: #a54f44; cursor: pointer; }
.composer { padding: 12px 16px; display: grid; grid-template-columns: minmax(0, 1fr) 40px; align-items: end; gap: 10px; border-top: 1px solid #e3e8e5; background: #fff; }
.composer > .n-button { width: 40px; height: 40px; }
.chat-empty { grid-row: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #85918b; text-align: center; }
.chat-empty > svg { width: 36px; height: 36px; color: #7f9a88; }
.chat-empty h2 { margin: 14px 0 5px; color: #405048; font-size: 16px; }
.chat-empty p { margin: 0; font-size: 12px; }
.communication-modal { width: min(520px, calc(100vw - 32px)); }
.account-form { padding-bottom: 22px; border-bottom: 1px solid #e3e8e5; }
.account-form h3, .account-list h3 { margin: 0 0 16px; color: #2d3a34; font-size: 15px; }
.account-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
.account-list { margin-top: 22px; }
.account-list-heading { display: flex; align-items: center; justify-content: space-between; }
.account-list-heading span { color: #84908a; font-size: 11px; }
.account-list :deep(th) { color: #69766f; font-size: 11px; background: #f6f8f7; }
.account-list :deep(td) { font-size: 12px; }
@media (max-width: 1000px) {
  .communication-workspace { grid-template-columns: 270px minmax(0, 1fr); }
  .message-content { max-width: 78%; }
}
@media (max-width: 760px) {
  .communication-workspace { height: calc(100vh - 184px); min-height: 480px; display: block; }
  .navigation-pane, .chat-pane { width: 100%; height: 100%; }
  .chat-pane { display: none; }
  .communication-workspace.mobile-chat .navigation-pane { display: none; }
  .communication-workspace.mobile-chat .chat-pane { display: grid; }
  .chat-back { display: inline-flex; }
  .message-list { padding: 18px 14px; }
  .message-content { max-width: 84%; }
}
@media (max-width: 520px) {
  .account-form-grid { grid-template-columns: 1fr; }
}
</style>
