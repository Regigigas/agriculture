import { useChatStore } from '@/stores/chat'
import { useFarmStore } from '@/stores/farm'
import { useOperationsStore } from '@/stores/operations'
import { useProductionStore } from '@/stores/production'

export function resetDomainStores() {
  useChatStore().reset()
  useFarmStore().reset()
  useOperationsStore().reset()
  useProductionStore().reset()
}
