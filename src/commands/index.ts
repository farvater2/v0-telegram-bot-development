import { type Bot, InputFile } from 'grammy';
import type { BotContext } from '../bot/index.js';
import { 
  sendMessage, 
  getUserId, 
  clearSession, 
  getSession, 
  setSessionStep,
  updateSessionTaskData,
  createKeyboard,
  getStatusIcon,
  getConditionLabel,
  getModeLabel,
  truncate,
  escapeHtml,
  formatDuration
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
import type { TaskMode, ConditionType, Task } from '../types/index.js';

const MAX_TASKS_PER_USER = 50;
const MIN_FREQUENCY_SECONDS = 10;

// Register all commands
export function registerCommands(bot: Bot<BotContext>): void {
  // Start command
  bot.command('start', handleStart);
  bot.command('help', handleHelp);
  bot.command('new_task', handleNewTask);
  bot.command('my_tasks', handleMyTasks);
  bot.command('start_task', handleStartTask);
  bot.command('stop_task', handleStopTask);
  bot.command('edit_task', handleEditTask);
  bot.command('delete_task', handleDeleteTask);
  bot.command('history', handleHistory);
  bot.command('test_task', handleTestTask);
  bot.command('export_tasks', handleExportTasks);
  bot.command('cancel', handleCancel);

  // Callback queries
  bot.on('callback_query:data', handleCallback);

  // Text messages for conversation flow
  bot.on('message:text', handleTextMessage);

  logger.info('Commands registered');
}

// /start command
async function handleStart(ctx: BotContext): Promise<void> {
  clearSession(ctx);
  
  const welcomeMessage = `
<b>Добро пожаловать в бот мониторинга веб-страниц!</b>

Я помогу вам отслеживать изменения на веб-страницах и получать уведомления.

<b>Основные команды:</b>
/new_task - Создать новую задачу
/my_tasks - Просмотреть ваши задачи
/help - Подробная справка

<b>Что я умею:</b>
• Отслеживать изменения на веб-страницах
• Извлекать данные по регулярным выражениям
• Отправлять уведомления при изменениях
• Гибко настраивать условия оповещений
  `.trim();

  await sendMessage(ctx, welcomeMessage);
}

// /help command
async function handleHelp(ctx: BotContext): Promise<void> {
  const helpMessage = `
<b>📚 Справка по командам</b>

<b>Управление задачами:</b>
/new_task - Создать новую задачу мониторинга
/my_tasks - Список всех ваших задач
/edit_task &lt;id&gt; - Редактировать задачу
/delete_task &lt;id&gt; - Удалить задачу

<b>Управление процессом:</b>
/start_task &lt;id&gt; - Запустить задачу
/stop_task &lt;id&gt; - Остановить задачу
/test_task &lt;id&gt; - Тестовый запуск

<b>Информация:</b>
/history &lt;id&gt; - История проверок задачи
/export_tasks - Экспорт всех задач

<b>Прочее:</b>
/cancel - Отменить текущую операцию

<b>Режимы работы:</b>
• <b>check</b> - Проверка наличия данных (True/False)
• <b>extract</b> - Извлечение значений по RegExp

<b>Условия отправки:</b>
• <b>always</b> - При каждой проверке
• <b>on_match</b> - При наличии данных
• <b>on_change</b> - При изменении значения
• <b>on_increase</b> - При увеличении числа
• <b>on_decrease</b> - При уменьшении числа

<b>Переменные в шаблонах:</b>
{url}, {check_time}, {task_id}, {task_name}
{first_match}, {total_matches}, {matches_list}
{group_1}, {group_2}, ... - группы из RegExp
  `.trim();

  await sendMessage(ctx, helpMessage);
}

// /new_task command
async function handleNewTask(ctx: BotContext): Promise<void> {
  const userId = getUserId(ctx);
  const taskCount = countUserTasks(userId);

  if (taskCount >= MAX_TASKS_PER_USER) {
    await sendMessage(ctx, `❌ Вы достигли лимита задач (${MAX_TASKS_PER_USER}). Удалите ненужные задачи.`);
    return;
  }

  clearSession(ctx);
  updateSessionTaskData(ctx, { user_id: userId });
  setSessionStep(ctx, 'mode');

  const keyboard = createKeyboard([
    [
      { text: '🔍 Проверка (check)', callback_data: 'mode_check' },
      { text: '📊 Извлечение (extract)', callback_data: 'mode_extract' },
    ],
  ]);

  await sendMessage(ctx, `
<b>📝 Создание новой задачи</b>

<b>Шаг 1/6: Выберите режим работы</b>

• <b>Проверка (check)</b> - проверяет наличие данных на странице (True/False)
• <b>Извлечение (extract)</b> - извлекает конкретные значения по регулярному выражению
  `.trim(), { reply_markup: keyboard });
}

// /my_tasks command
async function handleMyTasks(ctx: BotContext): Promise<void> {
  const userId = getUserId(ctx);
  const tasks = getTasksByUserId(userId);

  if (tasks.length === 0) {
    await sendMessage(ctx, '📋 У вас пока нет задач.\n\nИспользуйте /new_task для создания первой задачи.');
    return;
  }

  let message = '<b>📋 Ваши задачи мониторинга:</b>\n\n';

  for (const task of tasks) {
    const status = getStatusIcon(task.status);
    const mode = getModeLabel(task.mode);
    const condition = getConditionLabel(task.condition_type);
    const frequency = formatDuration(task.frequency_seconds);
    const name = task.name || `Задача #${task.id}`;

    message += `${status} <b>${escapeHtml(name)}</b> (ID: ${task.id})\n`;
    message += `   URL: ${truncate(task.url, 40)}\n`;
    message += `   Режим: ${mode} | Условие: ${condition}\n`;
    message += `   Частота: ${frequency} | Статус: ${task.status}\n\n`;
  }

  message += `\n<i>Всего задач: ${tasks.length}/${MAX_TASKS_PER_USER}</i>`;

  await sendMessage(ctx, message);
}

// /start_task command
async function handleStartTask(ctx: BotContext): Promise<void> {
  const args = ctx.message?.text?.split(' ');
  if (!args || args.length < 2) {
    await sendMessage(ctx, '❌ Укажите ID задачи: /start_task &lt;id&gt;');
    return;
  }

  const taskId = parseInt(args[1], 10);
  if (isNaN(taskId)) {
    await sendMessage(ctx, '❌ Некорректный ID задачи');
    return;
  }

  const userId = getUserId(ctx);
  const task = getTaskById(taskId);

  if (!task || task.user_id !== userId) {
    await sendMessage(ctx, '❌ Задача не найдена');
    return;
  }

  if (task.status === 'active') {
    await sendMessage(ctx, '⚠️ Задача уже запущена');
    return;
  }

  updateTaskStatus(taskId, 'active');
  await sendMessage(ctx, `✅ Задача #${taskId} запущена!\n\nПроверки будут выполняться каждые ${formatDuration(task.frequency_seconds)}.`);
  logger.info(`Task ${taskId} started by user ${userId}`);
}

// /stop_task command
async function handleStopTask(ctx: BotContext): Promise<void> {
  const args = ctx.message?.text?.split(' ');
  if (!args || args.length < 2) {
    await sendMessage(ctx, '❌ Укажите ID задачи: /stop_task &lt;id&gt;');
    return;
  }

  const taskId = parseInt(args[1], 10);
  if (isNaN(taskId)) {
    await sendMessage(ctx, '❌ Некорректный ID задачи');
    return;
  }

  const userId = getUserId(ctx);
  const task = getTaskById(taskId);

  if (!task || task.user_id !== userId) {
    await sendMessage(ctx, '❌ Задача не найдена');
    return;
  }

  if (task.status === 'stopped') {
    await sendMessage(ctx, '⚠️ Задача уже остановлена');
    return;
  }

  updateTaskStatus(taskId, 'stopped');
  await sendMessage(ctx, `🛑 Задача #${taskId} остановлена`);
  logger.info(`Task ${taskId} stopped by user ${userId}`);
}

// /edit_task command
async function handleEditTask(ctx: BotContext): Promise<void> {
  const args = ctx.message?.text?.split(' ');
  if (!args || args.length < 2) {
    await sendMessage(ctx, '❌ Укажите ID задачи: /edit_task &lt;id&gt;');
    return;
  }

  const taskId = parseInt(args[1], 10);
  if (isNaN(taskId)) {
    await sendMessage(ctx, '❌ Некорректный ID задачи');
    return;
  }

  const userId = getUserId(ctx);
  const task = getTaskById(taskId);

  if (!task || task.user_id !== userId) {
    await sendMessage(ctx, '❌ Задача не найдена');
    return;
  }

  clearSession(ctx);
  const session = getSession(ctx);
  session.editingTaskId = taskId;
  setSessionStep(ctx, 'edit_select');

  const keyboard = createKeyboard([
    [
      { text: '📝 Название', callback_data: 'edit_name' },
      { text: '🔗 URL', callback_data: 'edit_url' },
    ],
    [
      { text: '🔍 RegExp', callback_data: 'edit_regex' },
      { text: '📄 Шаблон', callback_data: 'edit_template' },
    ],
    [
      { text: '⚙️ Режим', callback_data: 'edit_mode' },
      { text: '📊 Условие', callback_data: 'edit_condition' },
    ],
    [
      { text: '⏱ Частота', callback_data: 'edit_frequency' },
    ],
    [
      { text: '❌ Отмена', callback_data: 'cancel' },
    ],
  ]);

  await sendMessage(ctx, formatTaskDetails(task) + '\n\n<b>Выберите параметр для редактирования:</b>', { reply_markup: keyboard });
}

// /delete_task command
async function handleDeleteTask(ctx: BotContext): Promise<void> {
  const args = ctx.message?.text?.split(' ');
  if (!args || args.length < 2) {
    await sendMessage(ctx, '❌ Укажите ID задачи: /delete_task &lt;id&gt;');
    return;
  }

  const taskId = parseInt(args[1], 10);
  if (isNaN(taskId)) {
    await sendMessage(ctx, '❌ Некорректный ID задачи');
    return;
  }

  const userId = getUserId(ctx);
  const task = getTaskById(taskId);

  if (!task || task.user_id !== userId) {
    await sendMessage(ctx, '❌ Задача не найдена');
    return;
  }

  const keyboard = createKeyboard([
    [
      { text: '✅ Да, удалить', callback_data: `confirm_delete_${taskId}` },
      { text: '❌ Отмена', callback_data: 'cancel' },
    ],
  ]);

  await sendMessage(ctx, `⚠️ <b>Подтвердите удаление задачи #${taskId}</b>\n\n${task.name || 'Без названия'}\nURL: ${truncate(task.url, 50)}`, { reply_markup: keyboard });
}

// /history command
async function handleHistory(ctx: BotContext): Promise<void> {
  const args = ctx.message?.text?.split(' ');
  if (!args || args.length < 2) {
    await sendMessage(ctx, '❌ Укажите ID задачи: /history &lt;id&gt;');
    return;
  }

  const taskId = parseInt(args[1], 10);
  if (isNaN(taskId)) {
    await sendMessage(ctx, '❌ Некорректный ID задачи');
    return;
  }

  const userId = getUserId(ctx);
  const task = getTaskById(taskId);

  if (!task || task.user_id !== userId) {
    await sendMessage(ctx, '❌ Задача не найдена');
    return;
  }

  const history = getTaskHistory(taskId, 10);

  if (history.length === 0) {
    await sendMessage(ctx, `📊 <b>История проверок задачи #${taskId}</b>\n\nПроверок пока не было.`);
    return;
  }

  let message = `📊 <b>История проверок задачи #${taskId}</b>\n\n`;

  for (const entry of history) {
    const icon = entry.error ? '❌' : (entry.message_sent ? '📨' : '✅');
    const time = entry.check_time;
    const result = entry.result ? truncate(entry.result, 30) : '-';
    const responseTime = entry.response_time ? `${entry.response_time}ms` : '-';

    message += `${icon} ${time}\n`;
    message += `   Результат: ${escapeHtml(result)}\n`;
    message += `   Время отклика: ${responseTime}\n`;
    if (entry.error) {
      message += `   Ошибка: ${escapeHtml(truncate(entry.error, 40))}\n`;
    }
    message += '\n';
  }

  await sendMessage(ctx, message);
}

// /test_task command
async function handleTestTask(ctx: BotContext): Promise<void> {
  const args = ctx.message?.text?.split(' ');
  if (!args || args.length < 2) {
    await sendMessage(ctx, '❌ Укажите ID задачи: /test_task &lt;id&gt;');
    return;
  }

  const taskId = parseInt(args[1], 10);
  if (isNaN(taskId)) {
    await sendMessage(ctx, '❌ Некорректный ID задачи');
    return;
  }

  const userId = getUserId(ctx);
  const task = getTaskById(taskId);

  if (!task || task.user_id !== userId) {
    await sendMessage(ctx, '❌ Задача не найдена');
    return;
  }

  await sendMessage(ctx, `⏳ Выполняю тестовый запуск задачи #${taskId}...`);

  try {
    const result = await executeTask(task, true);
    
    let message = `🧪 <b>Результат тестового запуска задачи #${taskId}</b>\n\n`;
    message += `Статус: ${result.success ? '✅ Успешно' : '❌ Ошибка'}\n`;
    message += `Код ответа: ${result.statusCode}\n`;
    message += `Время отклика: ${result.responseTime}ms\n`;
    message += `Совпадений: ${result.matchCount}\n\n`;

    if (result.firstMatch) {
      message += `<b>Первое совпадение:</b>\n<code>${escapeHtml(truncate(result.firstMatch, 200))}</code>\n\n`;
    }

    if (Object.keys(result.groups).length > 0) {
      message += '<b>Группы:</b>\n';
      for (const [key, value] of Object.entries(result.groups)) {
        message += `• ${key}: <code>${escapeHtml(truncate(value, 100))}</code>\n`;
      }
    }

    if (result.error) {
      message += `\n<b>Ошибка:</b> ${escapeHtml(result.error)}`;
    }

    await sendMessage(ctx, message);
  } catch (error) {
    await sendMessage(ctx, `❌ Ошибка при выполнении: ${escapeHtml((error as Error).message)}`);
  }
}

// /export_tasks command
async function handleExportTasks(ctx: BotContext): Promise<void> {
  const userId = getUserId(ctx);
  const tasks = getTasksByUserId(userId);

  if (tasks.length === 0) {
    await sendMessage(ctx, '📋 У вас нет задач для экспорта.');
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
    { caption: `Экспорт ${tasks.length} задач` }
  );
}

// /cancel command
async function handleCancel(ctx: BotContext): Promise<void> {
  clearSession(ctx);
  await sendMessage(ctx, '❌ Операция отменена');
}

// Callback query handler
async function handleCallback(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  await ctx.answerCallbackQuery();

  // Mode selection
  if (data.startsWith('mode_')) {
    const mode = data.replace('mode_', '') as TaskMode;
    updateSessionTaskData(ctx, { mode });
    setSessionStep(ctx, 'url');
    
    await ctx.editMessageText(`
<b>📝 Создание новой задачи</b>

<b>Шаг 2/6: Введите URL страницы</b>

Отправьте полный URL страницы для мониторинга.
Например: <code>https://example.com/product/123</code>
    `.trim(), { parse_mode: 'HTML' });
    return;
  }

  // Condition selection
  if (data.startsWith('condition_')) {
    const condition = data.replace('condition_', '') as ConditionType;
    updateSessionTaskData(ctx, { condition_type: condition });
    setSessionStep(ctx, 'frequency');
    
    await ctx.editMessageText(`
<b>📝 Создание новой задачи</b>

<b>Шаг 6/6: Укажите частоту проверок</b>

Введите интервал между проверками в секундах.
Минимум: ${MIN_FREQUENCY_SECONDS} сек

Примеры:
• 60 - каждую минуту
• 300 - каждые 5 минут
• 3600 - каждый час
• 86400 - раз в день
    `.trim(), { parse_mode: 'HTML' });
    return;
  }

  // Edit field selection
  if (data.startsWith('edit_')) {
    const field = data.replace('edit_', '');
    const session = getSession(ctx);
    session.editingField = field;

    if (field === 'mode') {
      setSessionStep(ctx, 'edit_mode');
      const keyboard = createKeyboard([
        [
          { text: '🔍 Проверка (check)', callback_data: 'set_mode_check' },
          { text: '📊 Извлечение (extract)', callback_data: 'set_mode_extract' },
        ],
      ]);
      await ctx.editMessageText('Выберите новый режим работы:', { parse_mode: 'HTML', reply_markup: keyboard });
      return;
    }

    if (field === 'condition') {
      setSessionStep(ctx, 'edit_condition');
      const keyboard = createKeyboard([
        [
          { text: 'Всегда', callback_data: 'set_condition_always' },
          { text: 'При совпадении', callback_data: 'set_condition_on_match' },
        ],
        [
          { text: 'При изменении', callback_data: 'set_condition_on_change' },
        ],
        [
          { text: 'При увеличении', callback_data: 'set_condition_on_increase' },
          { text: 'При уменьшении', callback_data: 'set_condition_on_decrease' },
        ],
      ]);
      await ctx.editMessageText('Выберите новое условие отправки:', { parse_mode: 'HTML', reply_markup: keyboard });
      return;
    }

    setSessionStep(ctx, `edit_${field}`);
    const labels: Record<string, string> = {
      name: 'название',
      url: 'URL',
      regex: 'регулярное выражение',
      template: 'шаблон сообщения',
      frequency: 'частоту проверок (в секундах)',
    };
    
    await ctx.editMessageText(`Введите новое ${labels[field] || field}:`, { parse_mode: 'HTML' });
    return;
  }

  // Set mode for edit
  if (data.startsWith('set_mode_')) {
    const mode = data.replace('set_mode_', '') as TaskMode;
    const session = getSession(ctx);
    if (session.editingTaskId) {
      updateTask(session.editingTaskId, { mode });
      await ctx.editMessageText(`✅ Режим обновлен на "${getModeLabel(mode)}"`);
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
      await ctx.editMessageText(`✅ Условие обновлено на "${getConditionLabel(condition)}"`);
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
      await ctx.editMessageText(`✅ Задача #${taskId} удалена`);
      logger.info(`Task ${taskId} deleted by user ${userId}`);
    }
    return;
  }

  // Cancel
  if (data === 'cancel') {
    clearSession(ctx);
    await ctx.editMessageText('❌ Операция отменена');
    return;
  }
}

// Text message handler for conversation flow
async function handleTextMessage(ctx: BotContext): Promise<void> {
  const session = getSession(ctx);
  const step = session.step;
  const text = ctx.message?.text?.trim() || '';

  if (!step) return;

  // URL input
  if (step === 'url') {
    if (!isValidUrl(text)) {
      await sendMessage(ctx, '❌ Некорректный URL. Введите полный URL, начинающийся с http:// или https://');
      return;
    }
    updateSessionTaskData(ctx, { url: text });
    setSessionStep(ctx, 'regex');
    
    await sendMessage(ctx, `
<b>📝 Создание новой задачи</b>

<b>Шаг 3/6: Введите регулярное выражение</b>

Введите RegExp для поиска данных на странице.

Примеры:
• <code>Цена: (\\d+) руб</code> - извлечение цены
• <code>Статус: (\\w+)</code> - извлечение статуса
• <code>В наличии</code> - проверка наличия текста

Используйте группы () для извлечения значений.
    `.trim());
    return;
  }

  // RegExp input
  if (step === 'regex') {
    if (!isValidRegex(text)) {
      await sendMessage(ctx, '❌ Некорректное регулярное выражение. Проверьте синтаксис и попробуйте снова.');
      return;
    }
    updateSessionTaskData(ctx, { regex_pattern: text });
    setSessionStep(ctx, 'template');
    
    await sendMessage(ctx, `
<b>📝 Создание новой задачи</b>

<b>Шаг 4/6: Введите шаблон сообщения</b>

Создайте текст уведомления с переменными:

<b>Доступные переменные:</b>
• <code>{url}</code> - адрес страницы
• <code>{check_time}</code> - время проверки
• <code>{task_name}</code> - название задачи
• <code>{first_match}</code> - первое совпадение
• <code>{total_matches}</code> - количество совпадений
• <code>{group_1}</code>, <code>{group_2}</code> - группы из RegExp

Пример:
<code>Цена изменилась: {group_1} руб</code>
    `.trim());
    return;
  }

  // Template input
  if (step === 'template') {
    if (!text) {
      await sendMessage(ctx, '❌ Шаблон не может быть пустым');
      return;
    }
    updateSessionTaskData(ctx, { template: text });
    setSessionStep(ctx, 'condition');
    
    const keyboard = createKeyboard([
      [
        { text: 'Всегда', callback_data: 'condition_always' },
        { text: 'При совпадении', callback_data: 'condition_on_match' },
      ],
      [
        { text: 'При изменении', callback_data: 'condition_on_change' },
      ],
      [
        { text: 'При увеличении', callback_data: 'condition_on_increase' },
        { text: 'При уменьшении', callback_data: 'condition_on_decrease' },
      ],
    ]);
    
    await sendMessage(ctx, `
<b>📝 Создание новой задачи</b>

<b>Шаг 5/6: Выберите условие отправки</b>

• <b>Всегда</b> - уведомлять при каждой проверке
• <b>При совпадении</b> - только когда найдены данные
• <b>При изменении</b> - когда значение изменилось
• <b>При увеличении</b> - когда число стало больше
• <b>При уменьшении</b> - когда число стало меньше
    `.trim(), { reply_markup: keyboard });
    return;
  }

  // Frequency input
  if (step === 'frequency') {
    const frequency = parseInt(text, 10);
    if (isNaN(frequency) || frequency < MIN_FREQUENCY_SECONDS) {
      await sendMessage(ctx, `❌ Введите число не менее ${MIN_FREQUENCY_SECONDS}`);
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
      });
      
      clearSession(ctx);
      
      await sendMessage(ctx, `
✅ <b>Задача #${task.id} успешно создана!</b>

<b>📋 Параметры:</b>
• URL: ${truncate(task.url, 50)}
• Режим: ${getModeLabel(task.mode)}
• RegExp: <code>${escapeHtml(truncate(task.regex_pattern, 40))}</code>
• Условие: ${getConditionLabel(task.condition_type)}
• Частота: ${formatDuration(task.frequency_seconds)}

Используйте /start_task ${task.id} для запуска мониторинга
      `.trim());
      
      logger.info(`Task ${task.id} created by user ${taskData.user_id}`);
    } catch (error) {
      await sendMessage(ctx, `❌ Ошибка при создании задачи: ${(error as Error).message}`);
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
          await sendMessage(ctx, '❌ Некорректный URL');
          return;
        }
        updateData = { url: text };
        break;
      case 'regex':
        if (!isValidRegex(text)) {
          await sendMessage(ctx, '❌ Некорректное регулярное выражение');
          return;
        }
        updateData = { regex_pattern: text };
        break;
      case 'template':
        updateData = { template: text };
        break;
      case 'frequency':
        const freq = parseInt(text, 10);
        if (isNaN(freq) || freq < MIN_FREQUENCY_SECONDS) {
          await sendMessage(ctx, `❌ Введите число не менее ${MIN_FREQUENCY_SECONDS}`);
          return;
        }
        updateData = { frequency_seconds: freq };
        break;
    }

    updateTask(taskId, updateData);
    clearSession(ctx);
    await sendMessage(ctx, `✅ Задача #${taskId} обновлена`);
    return;
  }
}

// Helper functions
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function formatTaskDetails(task: Task): string {
  return `
<b>📋 Задача #${task.id}</b>

• <b>Название:</b> ${task.name || 'Не задано'}
• <b>URL:</b> ${truncate(task.url, 50)}
• <b>RegExp:</b> <code>${escapeHtml(truncate(task.regex_pattern, 40))}</code>
• <b>Шаблон:</b> ${truncate(task.template, 50)}
• <b>Режим:</b> ${getModeLabel(task.mode)}
• <b>Условие:</b> ${getConditionLabel(task.condition_type)}
• <b>Частота:</b> ${formatDuration(task.frequency_seconds)}
• <b>Статус:</b> ${getStatusIcon(task.status)} ${task.status}
  `.trim();
}
