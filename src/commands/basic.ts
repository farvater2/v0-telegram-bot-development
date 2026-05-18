import type { BotContext } from '../bot/index.js';
import { sendMessage, clearSession } from '../bot/index.js';

// Welcome message
const WELCOME_TEXT = `
<b>Welcome to Page Watcher Bot!</b>

I help you monitor web pages and get notifications about changes.

<b>Main commands:</b>
/new_task - Create a new monitoring task
/my_tasks - View your tasks
/help - Detailed help

<b>What I can do:</b>
- Monitor web page changes
- Extract data using regular expressions
- Send notifications on changes
- Flexible notification conditions
`.trim();

// Help message
const HELP_TEXT = `
<b>Command Reference</b>

<b>Task management:</b>
/new_task - Create new monitoring task
/my_tasks - List all your tasks
/edit_task &lt;id&gt; - Edit a task
/delete_task &lt;id&gt; - Delete a task

<b>Process control:</b>
/start_task &lt;id&gt; - Start a task
/stop_task &lt;id&gt; - Stop a task
/test_task &lt;id&gt; - Test run

<b>Information:</b>
/history &lt;id&gt; - Task check history
/export_tasks - Export all tasks

<b>Other:</b>
/cancel - Cancel current operation

<b>Modes:</b>
- <b>check</b> - Check for data presence (True/False)
- <b>extract</b> - Extract values using RegExp

<b>Notification conditions:</b>
- <b>always</b> - On every check
- <b>on_match</b> - When data is found
- <b>on_change</b> - When value changes
- <b>on_increase</b> - When number increases
- <b>on_decrease</b> - When number decreases

<b>Template variables:</b>
{url}, {check_time}, {task_id}, {task_name}
{first_match}, {total_matches}, {matches_list}
{group_1}, {group_2}, ... - RegExp groups
`.trim();

// /start command
export async function handleStart(ctx: BotContext): Promise<void> {
  clearSession(ctx);
  await sendMessage(ctx, WELCOME_TEXT);
}

// /help command
export async function handleHelp(ctx: BotContext): Promise<void> {
  await sendMessage(ctx, HELP_TEXT);
}

// /cancel command
export async function handleCancel(ctx: BotContext): Promise<void> {
  clearSession(ctx);
  await sendMessage(ctx, 'Operation cancelled');
}
