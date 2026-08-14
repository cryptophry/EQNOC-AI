// Server-owned tool definitions. Clients cannot add or replace these.

export const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'set_alarm',
      description: 'Set a reminder or alarm for a specific time.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The reminder text.' },
          type: { type: 'string', enum: ['RELATIVE_MINUTES', 'ABSOLUTE_TIME'] },
          timeValue: { type: 'string', description: 'Minutes (e.g., "15") or Time (e.g., "14:30").' },
        },
        required: ['message', 'type', 'timeValue'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_optical_budget',
      description: 'Calculate fiber optical loss budget.',
      parameters: {
        type: 'object',
        properties: {
          txPower: { type: 'number' },
          rxSensitivity: { type: 'number' },
          distance: { type: 'number' },
          wavelength: { type: 'string' },
          connectorCount: { type: 'number' },
          spliceCount: { type: 'number' },
        },
        required: ['txPower', 'rxSensitivity', 'distance'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_notes',
      description: 'Update the persistent scratchpad notes.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          mode: { type: 'string', enum: ['APPEND', 'OVERWRITE'] },
        },
        required: ['content'],
      },
    },
  },
];

export const TOOL_NAMES = new Set(CHAT_TOOLS.map((t) => t.function.name));
