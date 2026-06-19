import { InlineKeyboard } from 'grammy';

// Create inline keyboard from button definitions
export function createKeyboard(buttons: { text: string; callback_data: string }[][]): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  
  for (const row of buttons) {
    for (const button of row) {
      keyboard.text(button.text, button.callback_data);
    }
    keyboard.row();
  }
  
  return keyboard;
}

// Mode selection keyboard
export function getModeKeyboard(): InlineKeyboard {
  return createKeyboard([
    [
      { text: 'Check (check)', callback_data: 'mode_check' },
      { text: 'Extract (extract)', callback_data: 'mode_extract' },
    ],
  ]);
}

// Condition selection keyboard
export function getConditionKeyboard(): InlineKeyboard {
  return createKeyboard([
    [
      { text: 'Always', callback_data: 'condition_always' },
      { text: 'On match', callback_data: 'condition_on_match' },
    ],
    [
      { text: 'On change', callback_data: 'condition_on_change' },
    ],
    [
      { text: 'On increase', callback_data: 'condition_on_increase' },
      { text: 'On decrease', callback_data: 'condition_on_decrease' },
    ],
  ]);
}

// Edit task field selection keyboard
export function getEditFieldKeyboard(): InlineKeyboard {
  return createKeyboard([
    [
      { text: 'Name', callback_data: 'edit_name' },
      { text: 'URL', callback_data: 'edit_url' },
    ],
    [
      { text: 'RegExp', callback_data: 'edit_regex' },
      { text: 'Template', callback_data: 'edit_template' },
    ],
    [
      { text: 'Mode', callback_data: 'edit_mode' },
      { text: 'Condition', callback_data: 'edit_condition' },
    ],
    [
      { text: 'Frequency', callback_data: 'edit_frequency' },
      { text: 'Stop on condition', callback_data: 'edit_stop_on_condition' },
    ],
    [
      { text: 'Cancel', callback_data: 'cancel' },
    ],
  ]);
}

// Confirmation keyboard
export function getConfirmKeyboard(confirmCallback: string): InlineKeyboard {
  return createKeyboard([
    [
      { text: 'Yes, delete', callback_data: confirmCallback },
      { text: 'Cancel', callback_data: 'cancel' },
    ],
  ]);
}

// Edit mode keyboard
export function getEditModeKeyboard(): InlineKeyboard {
  return createKeyboard([
    [
      { text: 'Check (check)', callback_data: 'set_mode_check' },
      { text: 'Extract (extract)', callback_data: 'set_mode_extract' },
    ],
  ]);
}

// Stop on condition selection keyboard (used during task creation and editing)
export function getStopOnConditionKeyboard(): InlineKeyboard {
  return createKeyboard([
    [
      { text: 'Yes — stop after first trigger', callback_data: 'set_stop_true' },
    ],
    [
      { text: 'No — keep running', callback_data: 'set_stop_false' },
    ],
  ]);
}

// Edit condition keyboard  
export function getEditConditionKeyboard(): InlineKeyboard {
  return createKeyboard([
    [
      { text: 'Always', callback_data: 'set_condition_always' },
      { text: 'On match', callback_data: 'set_condition_on_match' },
    ],
    [
      { text: 'On change', callback_data: 'set_condition_on_change' },
    ],
    [
      { text: 'On increase', callback_data: 'set_condition_on_increase' },
      { text: 'On decrease', callback_data: 'set_condition_on_decrease' },
    ],
  ]);
}
