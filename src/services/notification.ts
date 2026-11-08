import { ref } from 'vue';

export interface NotificationState {
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
}

export const notification = ref<NotificationState>({
    message: '',
    type: 'success'
});

let timer: ReturnType<typeof setTimeout> | null = null;

export function showNotification(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success', durationMs = 4000) {
    if (timer) clearTimeout(timer);
    notification.value = { message, type };
    if (durationMs > 0) {
        timer = setTimeout(() => {
            if (notification.value.message === message) {
                notification.value.message = '';
            }
        }, durationMs);
    }
}

export function clearNotification() {
    if (timer) clearTimeout(timer);
    notification.value.message = '';
}
