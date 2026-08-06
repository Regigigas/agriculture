import type { Component } from 'vue'

export interface TableAction {
  key: string
  label: string
  icon?: Component
  type?: 'default' | 'tertiary' | 'primary' | 'info' | 'success' | 'warning' | 'error'
  secondary?: boolean
  quaternary?: boolean
  loading?: boolean
  disabled?: boolean
  onClick: () => unknown
}
