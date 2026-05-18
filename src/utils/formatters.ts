import type { Task } from '../types/index.js';

// Status icons
const STATUS_ICONS: Record<string, string> = {
  active: '[ON]',
  stopped: '[OFF]',
  paused: '[PAUSE]',
  error: '[ERR]',
};

// Condition labels (Russian)
const CONDITION_LABELS: Record<string, string> = {
  always: 'Всегда',
  on_match: 'При совпадении',
  on_change: 'При изменении',
  on_increase: 'При увеличении',
  on_decrease: 'При уменьшении',
  custom: 'Пользовательское',
};

// Mode labels (Russian)
const MODE_LABELS: Record<string, string> = {
  check: 'Проверка',
  extract: 'Извлечение',
};

// Get status icon
export function getStatusIcon(status: string): string {
  return STATUS_ICONS[status] || '[?]';
}

// Get condition label
export function getConditionLabel(condition: string): string {
  return CONDITION_LABELS[condition] || condition;
}

// Get mode label
export function getModeLabel(mode: string): string {
  return MODE_LABELS[mode] || mode;
}

// Truncate text
export function truncate(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// Escape HTML for Telegram
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Format seconds to human readable (Russian)
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} сек`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч`;
  return `${Math.floor(seconds / 86400)} дн`;
}

// Format task details
export function formatTaskDetails(task: Task): string {
  return `
<b>Task #${task.id}</b>

- <b>Name:</b> ${task.name || 'Not set'}
- <b>URL:</b> ${truncate(task.url, 50)}
- <b>RegExp:</b> <code>${escapeHtml(truncate(task.regex_pattern, 40))}</code>
- <b>Template:</b> ${truncate(task.template, 50)}
- <b>Mode:</b> ${getModeLabel(task.mode)}
- <b>Condition:</b> ${getConditionLabel(task.condition_type)}
- <b>Frequency:</b> ${formatDuration(task.frequency_seconds)}
- <b>Status:</b> ${getStatusIcon(task.status)} ${task.status}
  `.trim();
}

// Format task list item
export function formatTaskListItem(task: Task): string {
  const status = getStatusIcon(task.status);
  const mode = getModeLabel(task.mode);
  const condition = getConditionLabel(task.condition_type);
  const frequency = formatDuration(task.frequency_seconds);
  const name = task.name || `Task #${task.id}`;

  return `${status} <b>${escapeHtml(name)}</b> (ID: ${task.id})
   URL: ${truncate(task.url, 40)}
   Mode: ${mode} | Condition: ${condition}
   Frequency: ${frequency} | Status: ${task.status}`;
}
