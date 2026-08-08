<script setup lang="ts">
import {
  CheckCircle2,
  RotateCcw,
  Settings2,
  TriangleAlert,
  X,
} from '@lucide/vue'
import { useNotifications } from '@app/services/notifications'

const notifications = useNotifications()
</script>

<template>
  <Teleport to="body">
    <ol aria-live="polite" class="app-toast-host">
      <li
        v-for="notification in notifications.notifications.value"
        :key="notification.id"
        :class="['app-toast', notification.tone]"
        role="status"
      >
        <CheckCircle2
          v-if="notification.tone === 'success'"
          aria-hidden="true"
        />
        <TriangleAlert v-else aria-hidden="true" />
        <p>{{ notification.message }}</p>
        <div
          v-if="notification.retry || notification.openSettings"
          class="app-toast-actions"
        >
          <button
            v-if="notification.retry"
            type="button"
            @click="notifications.retry(notification.id)"
          >
            <RotateCcw aria-hidden="true" />
            Tentar novamente
          </button>
          <button
            v-if="notification.openSettings"
            type="button"
            @click="notifications.openSettings(notification.id)"
          >
            <Settings2 aria-hidden="true" />
            Abrir configurações
          </button>
        </div>
        <button
          aria-label="Dispensar aviso"
          class="app-toast-dismiss"
          type="button"
          @click="notifications.remove(notification.id)"
        >
          <X aria-hidden="true" />
        </button>
      </li>
    </ol>
  </Teleport>
</template>
