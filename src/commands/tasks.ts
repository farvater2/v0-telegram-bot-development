import { InputFile } from 'grammy';
import type { BotContext } from '../bot/index.js';
import { 
  sendMessage, 
  getUserId, 
  clearSession, 
  getSession, 
  setSessionStep,
  updateSessionTaskData,
  getModeKeyboard,
  getConditionKeyboard,
  getEditFieldKeyboard,
  getConfirmKeyboard,
  getEditModeKeyboard,
  getEditConditionKeyboard,
  getStopOnConditionKeyboard,
  getNotifyTargetKeyboard
} from '../bot/index.js';
import { 
  getTasksByUserId, 
  getTaskById, 
  createTask, 
  updateTask,
  updateTaskStatus,
  deleteTask,
  countUserTasks,
  getTaskHistory
} from '../database/index.js';
import { executeTask } from '../scraper/index.js';
import { logger } from '../utils/logger.js';
import { isValidUrl, isValidRegex, isValidFrequency } from '../utils/validators.js';
import { 
  getStatusIcon, 
  getConditionLabel, 
  getModeLabel, 
  truncate, 
  escapeHtml, 
  formatDuration,
  formatTaskListItem,
  formatTaskDetails
} from '../utils/formatters.js';
import { config } from '../config/index.js';
import type { TaskMode, ConditionType, Task } from '../types/index.js';

// /new_task command
export async function handleNewTask(ctx: BotContext): Promise<void> {
  const userId = getUserId(ctx);
  const taskCount = countUserTasks(userId);

  if (taskCount >= config.maxTasksPerUser) {
    await sendMessage(ctx, `You have reached the task limit (${config.maxTasksPerUser}). Delete some tasks first.`);
    return;
  }

  clearSession(ctx);
  updateSessionTaskData(ctx, { user_id: userId });
  setSessionStep(ctx, 'mode');

  await sendMessage(ctx, `
<b>Create New Task</b>

<b>Step 1/8: Select mode</b>

- <b>Check</b> - checks for data presence (True/False)
- <b>Extract</b> - extracts specific values using regular expressions
  `.trim(), { reply_markup: getModeKeyboard() });
}

// /my_tasks command
export async function handleMyTasks(ctx: BotContext): Promise<void> {
  const userId = getUserId(ctx);
  const tasks = getTasksByUserId(userId);

  if (tasks.length === 0) {
    await sendMessage(ctx, 'You have no tasks yet.\n\nUse /new_task to create your first task.');
    return;
  }

  let message = '<b>Your Monitoring Tasks:</b>\n\n';

  for (const task of tasks) {
    message += formatTaskListItem(task) + '\n\n';
  }

  message += `\n<i>Total: ${tasks.length}/${config.maxTasksPerUser}</i>`;

  await sendMessage(ctx, message);
}

// /start_task command
export async function handleStartTask(ctx: BotContext): Promise<void> {
  const args = ctx.message?.text?.split(' ');
  if (!args || args.length < 2) {
    await sendMessage(ctx, 'Please specify task ID: /start_task &lt;id&gt;');
    return;
  }

  const taskId = parseInt(args[1], 10);
  if (isNaN(taskId)) {
    await sendMessage(ctx, 'Invalid task ID');
    return;
  }

  const userId = getUserId(ctx);
  const task = getTaskById(taskId);

  if (!task || task.user_id !== userId) {
    await sendMessage(ctx, 'Task not found');
    return;
  }

  if (task.status === 'active') {
    await sendMessage(ctx, 'Task is already running');
    return;
  }

  updateTaskStatus(taskId, 'active');
  await sendMessage(ctx, `Task #${taskId} started!\n\nChecks will run every ${formatDuration(task.frequency_seconds)}.`);
  logger.info(`Task ${taskId} started by user ${userId}`);
}

// /stop_task command
export async function handleStopTask(ctx: BotContext): Promise<void> {
  const args = ctx.message?.text?.split(' ');
  if (!args || args.length < 2) {
    await sendMessage(ctx, 'Please specify task ID: /stop_task &lt;id&gt;');
    return;
  }

  const taskId = parseInt(args[1], 10);
  if (isNaN(taskId)) {
    await sendMessage(ctx, 'Invalid task ID');
    return;
  }

  const userId = getUserId(ctx);
  const task = getTaskById(taskId);

  if (!task || task.user_id !== userId) {
    await sendMessage(ctx, 'Task not found');
    return;
  }

  if (task.status === 'stopped') {
    await sendMessage(ctx, 'Task is already stopped');
    return;
  }

  updateTaskStatus(taskId, 'stopped');
  await sendMessage(ctx, `Task #${taskId} stopped`);
  logger.info(`Task ${taskId} stopped by user ${userId}`);
}

// /edit_task command
export async function handleEditTask(ctx: BotContext): Promise<void> {
  const args = ctx.message?.text?.split(' ');
  if (!args || args.length < 2) {
    await sendMessage(ctx, 'Please specify task ID: /edit_task &lt;id&gt;');
    return;
  }

  const taskId = parseInt(args[1], 10);
  if (isNaN(taskId)) {
    await sendMessage(ctx, 'Invalid task ID');
    return;
  }

  const userId = getUserId(ctx);
  const task = getTaskById(taskId);

  if (!task || task.user_id !== userId) {
    await sendMessage(ctx, 'Task not found');
    return;
  }

  clearSession(ctx);
  const session = getSession(ctx);
  session.editingTaskId = taskId;
  setSessionStep(ctx, 'edit_select');

  await sendMessage(ctx, formatTaskDetails(task) + '\n\n<b>Select parameter to edit:</b>', { reply_markup: getEditFieldKeyboard() });
}

// /delete_task command
export async function handleDeleteTask(ctx: BotContext): Promise<void> {
  const args = ctx.message?.text?.split(' ');
  if (!args || args.length < 2) {
    await sendMessage(ctx, 'Please specify task ID: /delete_task &lt;id&gt;');
    return;
  }

  const taskId = parseInt(args[1], 10);
  if (isNaN(taskId)) {
    await sendMessage(ctx, 'Invalid task ID');
    return;
  }

  const userId = getUserId(ctx);
  const task = getTaskById(taskId);

  if (!task || task.user_id !== userId) {
    await sendMessage(ctx, 'Task not found');
    return;
  }

  await sendMessage(ctx, `<b>Confirm deletion of task #${taskId}</b>\n\n${task.name || 'Unnamed'}\nURL: ${truncate(task.url, 50)}`, { reply_markup: getConfirmKeyboard(`confirm_delete_${taskId}`) });
}

// /history command
export async function handleHistory(ctx: BotContext): Promise<void> {
  const args = ctx.message?.text?.split(' ');
  if (!args || args.length < 2) {
    await sendMessage(ctx, 'Please specify task ID: /history &lt;id&gt;');
    return;
  }

  const taskId = parseInt(args[1], 10);
  if (isNaN(taskId)) {
    await sendMessage(ctx, 'Invalid task ID');
    return;
  }

  const userId = getUserId(ctx);
  const task = getTaskById(taskId);

  if (!task || task.user_id !== userId) {
    await sendMessage(ctx, 'Task not found');
    return;
  }

  const history = getTaskHistory(taskId, 10);

  if (history.length === 0) {
    await sendMessage(ctx, `<b>Check History for Task #${taskId}</b>\n\nNo checks yet.`);
    return;
  }

  let message = `<b>Check History for Task #${taskId}</b>\n\n`;

  for (const entry of history) {
    const icon = entry.error ? '[ERR]' : (entry.message_sent ? '[SENT]' : '[OK]');
    const time = entry.check_time;
    const result = entry.result ? truncate(entry.result, 30) : '-';
    const responseTime = entry.response_time ? `${entry.response_time}ms` : '-';

    message += `${icon} ${time}\n`;
    message += `   Result: ${escapeHtml(result)}\n`;
    message += `   Response: ${responseTime}\n`;
    if (entry.error) {
      message += `   Error: ${escapeHtml(truncate(entry.error, 40))}\n`;
    }
    message += '\n';
  }

  await sendMessage(ctx, message);
}

// /test_task command
export async function handleTestTask(ctx: BotContext): Promise<void> {
  const args = ctx.message?.text?.split(' ');
  if (!args || args.length < 2) {
    await sendMessage(ctx, 'Please specify task ID: /test_task &lt;id&gt;');
    return;
  }

  const taskId = parseInt(args[1], 10);
  if (isNaN(taskId)) {
    await sendMessage(ctx, 'Invalid task ID');
    return;
  }

  const userId = getUserId(ctx);
  const task = getTaskById(taskId);

  if (!task || task.user_id !== userId) {
    await sendMessage(ctx, 'Task not found');
    return;
  }

  await sendMessage(ctx, `Running test for task #${taskId}...`);

  try {
    const result = await executeTask(task, true);
    
    let message = `<b>Test Result for Task #${taskId}</b>\n\n`;
    message += `Status: ${result.success ? 'Success' : 'Error'}\n`;
    message += `HTTP Code: ${result.statusCode}\n`;
    message += `Response Time: ${result.responseTime}ms\n`;
    message += `Matches: ${result.matchCount}\n\n`;

    if (result.firstMatch) {
      message += `<b>First match:</b>\n<code>${escapeHtml(truncate(result.firstMatch, 200))}</code>\n\n`;
    }

    if (Object.keys(result.groups).length > 0) {
      message += '<b>Groups:</b>\n';
      for (const [key, value] of Object.entries(result.groups)) {
        message += `- ${key}: <code>${escapeHtml(truncate(value, 100))}</code>\n`;
      }
    }

    if (result.error) {
      message += `\n<b>Error:</b> ${escapeHtml(result.error)}`;
    }

    await sendMessage(ctx, message);
  } catch (error) {
    await sendMessage(ctx, `Error: ${escapeHtml((error as Error).message)}`);
  }
}

// /export_tasks command
export async function handleExportTasks(ctx: BotContext): Promise<void> {
  const userId = getUserId(ctx);
  const tasks = getTasksByUserId(userId);

  if (tasks.length === 0) {
    await sendMessage(ctx, 'No tasks to export.');
    return;
  }

  const exportData = tasks.map(task => ({
    id: task.id,
    name: task.name,
    url: task.url,
    regex_pattern: task.regex_pattern,
    template: task.template,
    mode: task.mode,
    condition_type: task.condition_type,
    frequency_seconds: task.frequency_seconds,
    status: task.status,
    created_at: task.created_at,
  }));

  const json = JSON.stringify(exportData, null, 2);
  
  await ctx.replyWithDocument(
    new InputFile(Buffer.from(json), 'tasks_export.json'),
    { caption: `Exported ${tasks.length} tasks` }
  );
}

// Callback query handler
export async function handleCallback(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  await ctx.answerCallbackQuery();

  // Mode selection
  if (data.startsWith('mode_')) {
    const mode = data.replace('mode_', '') as TaskMode;
    updateSessionTaskData(ctx, { mode });
    setSessionStep(ctx, 'url');
    
    await ctx.editMessageText(`
<b>Create New Task</b>

<b>Step 2/8: Enter URL</b>

Send the full URL of the page to monitor.
Example: <code>https://example.com/product/123</code>
    `.trim(), { parse_mode: 'HTML' });
    return;
  }

  // Condition selection
  if (data.startsWith('condition_')) {
    const condition = data.replace('condition_', '') as ConditionType;
    updateSessionTaskData(ctx, { condition_type: condition });
    setSessionStep(ctx, 'stop_on_condition');
    
    await ctx.editMessageText(`
<b>Create New Task</b>

<b>Step 6/8: Stop on condition</b>

Should the task automatically stop after the notification condition is first fulfilled?
    `.trim(), { parse_mode: 'HTML', reply_markup: getStopOnConditionKeyboard() });
    return;
  }

  // Stop on condition selection (new task creation)
  if (data === 'set_stop_true' || data === 'set_stop_false') {
    const stopOnCondition = data === 'set_stop_true';
    const session = getSession(ctx);

    // During editing, update the existing task directly
    if (session.step === 'edit_stop_on_condition' && session.editingTaskId) {
      updateTask(session.editingTaskId, { stop_on_condition: stopOnCondition });
      await ctx.editMessageText(`Stop on condition set to: <b>${stopOnCondition ? 'Yes' : 'No'}</b>`, { parse_mode: 'HTML' });
      clearSession(ctx);
      return;
    }

    // During new task creation, proceed to notify target step
    updateSessionTaskData(ctx, { stop_on_condition: stopOnCondition });
    setSessionStep(ctx, 'notify_target');

    await ctx.editMessageText(`
<b>Create New Task</b>

<b>Step 7/8: Notification target</b>

Where should notifications be delivered?
    `.trim(), { parse_mode: 'HTML', reply_markup: getNotifyTargetKeyboard() });
    return;
  }

  // Notify target selection
  if (data === 'set_notify_bot' || data === 'set_notify_channel' || data === 'set_notify_both') {
    const notifyTarget = data.replace('set_notify_', '') as 'bot' | 'channel' | 'both';
    const session = getSession(ctx);

    // During editing, update the task directly
    if (session.step === 'edit_notify_target' && session.editingTaskId) {
      updateTask(session.editingTaskId, { notify_target: notifyTarget });
      const label = notifyTarget === 'bot' ? 'Bot only' : notifyTarget === 'channel' ? 'Channel only' : 'Bot + Channel';
      await ctx.editMessageText(`Notification target set to: <b>${label}</b>`, { parse_mode: 'HTML' });
      clearSession(ctx);
      return;
    }

    // During creation: if channel needed, ask for channel ID; otherwise go to frequency
    updateSessionTaskData(ctx, { notify_target: notifyTarget });

    if (notifyTarget === 'channel' || notifyTarget === 'both') {
      setSessionStep(ctx, 'notify_channel_id');
      await ctx.editMessageText(`
<b>Create New Task</b>

<b>Step 7/8: Enter channel ID</b>

Send the channel chat ID or username.
Examples: <code>@mychannel</code> or <code>-1001234567890</code>

<i>The bot must be an admin of the channel.</i>
      `.trim(), { parse_mode: 'HTML' });
    } else {
      setSessionStep(ctx, 'frequency');
      await ctx.editMessageText(`
<b>Create New Task</b>

<b>Step 8/8: Set check frequency</b>

Enter interval between checks in seconds.
Minimum: ${config.minFrequencySeconds} sec

Examples:
- 60 - every minute
- 300 - every 5 minutes
- 3600 - every hour
- 86400 - once a day
      `.trim(), { parse_mode: 'HTML' });
    }
    return;
  }

  // Edit field selection
  if (data.startsWith('edit_')) {
    const field = data.replace('edit_', '');
    const session = getSession(ctx);
    session.editingField = field;

    if (field === 'mode') {
      setSessionStep(ctx, 'edit_mode');
      await ctx.editMessageText('Select new mode:', { parse_mode: 'HTML', reply_markup: getEditModeKeyboard() });
      return;
    }

    if (field === 'condition') {
      setSessionStep(ctx, 'edit_condition');
      await ctx.editMessageText('Select new condition:', { parse_mode: 'HTML', reply_markup: getEditConditionKeyboard() });
      return;
    }

    if (field === 'stop_on_condition') {
      setSessionStep(ctx, 'edit_stop_on_condition');
      await ctx.editMessageText('Should the task stop after the condition is first fulfilled?', { parse_mode: 'HTML', reply_markup: getStopOnConditionKeyboard() });
      return;
    }

    if (field === 'notify_channel_id') {
      setSessionStep(ctx, 'edit_notify_channel_id');
      await ctx.editMessageText(
        'Enter the channel chat ID or username (e.g. <code>@mychannel</code> or <code>-1001234567890</code>), or send <code>-</code> to remove:',
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (field === 'notify_target') {
      setSessionStep(ctx, 'edit_notify_target');
      await ctx.editMessageText('Where should notifications be delivered?', { parse_mode: 'HTML', reply_markup: getNotifyTargetKeyboard() });
      return;
    }

    setSessionStep(ctx, `edit_${field}`);
    const labels: Record<string, string> = {
      name: 'name',
      url: 'URL',
      regex: 'regular expression',
      template: 'message template',
      frequency: 'check frequency (in seconds)',
    };
    
    await ctx.editMessageText(`Enter new ${labels[field] || field}:`, { parse_mode: 'HTML' });
    return;
  }

  // Set mode for edit
  if (data.startsWith('set_mode_')) {
    const mode = data.replace('set_mode_', '') as TaskMode;
    const session = getSession(ctx);
    if (session.editingTaskId) {
      updateTask(session.editingTaskId, { mode });
      await ctx.editMessageText(`Mode updated to "${getModeLabel(mode)}"`);
      clearSession(ctx);
    }
    return;
  }

  // Set condition for edit
  if (data.startsWith('set_condition_')) {
    const condition = data.replace('set_condition_', '') as ConditionType;
    const session = getSession(ctx);
    if (session.editingTaskId) {
      updateTask(session.editingTaskId, { condition_type: condition });
      await ctx.editMessageText(`Condition updated to "${getConditionLabel(condition)}"`);
      clearSession(ctx);
    }
    return;
  }

  // Confirm delete
  if (data.startsWith('confirm_delete_')) {
    const taskId = parseInt(data.replace('confirm_delete_', ''), 10);
    const userId = getUserId(ctx);
    const task = getTaskById(taskId);

    if (task && task.user_id === userId) {
      deleteTask(taskId);
      await ctx.editMessageText(`Task #${taskId} deleted`);
      logger.info(`Task ${taskId} deleted by user ${userId}`);
    }
    return;
  }

  // Cancel
  if (data === 'cancel') {
    clearSession(ctx);
    await ctx.editMessageText('Operation cancelled');
    return;
  }
}

// Text message handler for conversation flow
export async function handleTextMessage(ctx: BotContext): Promise<void> {
  const session = getSession(ctx);
  const step = session.step;
  const text = ctx.message?.text?.trim() || '';

  if (!step) return;

  // URL input
  if (step === 'url') {
    if (!isValidUrl(text)) {
      await sendMessage(ctx, 'Invalid URL. Enter full URL starting with http:// or https://');
      return;
    }
    updateSessionTaskData(ctx, { url: text });
    setSessionStep(ctx, 'regex');
    
    await sendMessage(ctx, `
<b>Create New Task</b>

<b>Step 3/8: Enter regular expression</b>

Enter RegExp to search for data on the page.

Examples:
- <code>Price: (\\d+)</code> - extract price
- <code>Status: (\\w+)</code> - extract status
- <code>In stock</code> - check text presence

Use groups () to extract values.
    `.trim());
    return;
  }

  // RegExp input
  if (step === 'regex') {
    if (!isValidRegex(text)) {
      await sendMessage(ctx, 'Invalid regular expression. Check syntax and try again.');
      return;
    }
    updateSessionTaskData(ctx, { regex_pattern: text });
    setSessionStep(ctx, 'template');
    
    await sendMessage(ctx, `
<b>Create New Task</b>

<b>Step 4/8: Enter message template</b>

Create notification text with variables:

<b>Available variables:</b>
- <code>{url}</code> - page address
- <code>{check_time}</code> - check time
- <code>{task_name}</code> - task name
- <code>{first_match}</code> - first match
- <code>{total_matches}</code> - match count
- <code>{group_1}</code>, <code>{group_2}</code> - RegExp groups

Example:
<code>Price changed: {group_1}</code>
    `.trim());
    return;
  }

  // Template input
  if (step === 'template') {
    if (!text) {
      await sendMessage(ctx, 'Template cannot be empty');
      return;
    }
    updateSessionTaskData(ctx, { template: text });
    setSessionStep(ctx, 'condition');
    
    await sendMessage(ctx, `
<b>Create New Task</b>

<b>Step 5/8: Select notification condition</b>

- <b>Always</b> - notify on every check
- <b>On match</b> - only when data is found
- <b>On change</b> - when value changes
- <b>On increase</b> - when number increases
- <b>On decrease</b> - when number decreases
    `.trim(), { reply_markup: getConditionKeyboard() });
    return;
  }

  // Notify channel ID input (creation, follows step 7 when target is channel or both)
  if (step === 'notify_channel_id') {
    const channelId = text.trim();
    updateSessionTaskData(ctx, { notify_channel_id: channelId });
    setSessionStep(ctx, 'frequency');
    await sendMessage(ctx, `
<b>Create New Task</b>

<b>Step 8/8: Set check frequency</b>

Enter interval between checks in seconds.
Minimum: ${config.minFrequencySeconds} sec

Examples:
- 60 - every minute
- 300 - every 5 minutes
- 3600 - every hour
- 86400 - once a day
    `.trim());
    return;
  }

  // Frequency input
  if (step === 'frequency') {
    const frequency = parseInt(text, 10);
    if (!isValidFrequency(frequency, config.minFrequencySeconds)) {
      await sendMessage(ctx, `Enter a number of at least ${config.minFrequencySeconds}`);
      return;
    }
    
    updateSessionTaskData(ctx, { frequency_seconds: frequency });
    
    // Create task
    const taskData = session.taskData;
    try {
      const task = createTask({
        user_id: taskData.user_id!,
        url: taskData.url!,
        regex_pattern: taskData.regex_pattern!,
        template: taskData.template!,
        mode: taskData.mode!,
        condition_type: taskData.condition_type!,
        frequency_seconds: frequency,
        stop_on_condition: taskData.stop_on_condition !== false,
        notify_channel_id: taskData.notify_channel_id || null,
        notify_target: taskData.notify_target || 'bot',
      });
      
      clearSession(ctx);
      
      await sendMessage(ctx, `
<b>Task #${task.id} created!</b>

<b>Parameters:</b>
- URL: ${truncate(task.url, 50)}
- Mode: ${getModeLabel(task.mode)}
- RegExp: <code>${escapeHtml(truncate(task.regex_pattern, 40))}</code>
- Condition: ${getConditionLabel(task.condition_type)}
- Frequency: ${formatDuration(task.frequency_seconds)}
- Stop on condition: ${task.stop_on_condition ? 'Yes' : 'No'}
- Notify target: ${task.notify_target === 'bot' ? 'Bot only' : task.notify_target === 'channel' ? `Channel only (${escapeHtml(task.notify_channel_id || '')})` : `Bot + Channel (${escapeHtml(task.notify_channel_id || '')})`}

Use /start_task ${task.id} to start monitoring
      `.trim());
      
      logger.info(`Task ${task.id} created by user ${taskData.user_id}`);
    } catch (error) {
      await sendMessage(ctx, `Error creating task: ${(error as Error).message}`);
    }
    return;
  }

  // Edit handlers
  if (step.startsWith('edit_')) {
    const field = step.replace('edit_', '');
    const taskId = session.editingTaskId;
    
    if (!taskId) {
      clearSession(ctx);
      return;
    }

    let updateData: Record<string, string | number> = {};

    switch (field) {
      case 'name':
        updateData = { name: text };
        break;
      case 'url':
        if (!isValidUrl(text)) {
          await sendMessage(ctx, 'Invalid URL');
          return;
        }
        updateData = { url: text };
        break;
      case 'regex':
        if (!isValidRegex(text)) {
          await sendMessage(ctx, 'Invalid regular expression');
          return;
        }
        updateData = { regex_pattern: text };
        break;
      case 'template':
        updateData = { template: text };
        break;
      case 'frequency':
        const freq = parseInt(text, 10);
        if (!isValidFrequency(freq, config.minFrequencySeconds)) {
          await sendMessage(ctx, `Enter a number of at least ${config.minFrequencySeconds}`);
          return;
        }
        updateData = { frequency_seconds: freq };
        break;
      case 'notify_channel_id': {
        // '-' means clear the channel
        const channelVal = text.trim() === '-' ? null : text.trim();
        updateTask(taskId, { notify_channel_id: channelVal });
        clearSession(ctx);
        await sendMessage(ctx, channelVal
          ? `Task #${taskId} — notify channel set to <code>${escapeHtml(channelVal)}</code>`
          : `Task #${taskId} — notify channel removed`
        );
        return;
      }
    }

    updateTask(taskId, updateData);
    clearSession(ctx);
    await sendMessage(ctx, `Task #${taskId} updated`);
    return;
  }
}
