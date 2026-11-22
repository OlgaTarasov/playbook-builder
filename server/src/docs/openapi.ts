/**
 * OpenAPI 3.0 description of the playbook builder API.
 * Keep this in step with the routers in src/routes and the schemas in src/schemas.ts.
 */
const errorResponse = (description: string, code: string, message: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
      example: { error: { code, message } },
    },
  },
});

const uuid = (description: string) => ({ type: 'string', format: 'uuid', description });

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Playbook Builder API',
    version: '1.0.0',
    description:
      'Security automation playbook builder. Sign in first; the session is an HttpOnly cookie named `playbook_session` set by `/auth/register` and `/auth/login`. ' +
      'A user adds triggers to their list, then builds playbooks that pair one added trigger with up to three actions.',
  },
  servers: [{ url: '/', description: 'Same origin as this page' }],
  tags: [
    { name: 'Auth', description: 'Register, log in, log out, current user' },
    { name: 'Triggers', description: 'Trigger catalogue and the user\'s added triggers' },
    { name: 'Actions', description: 'Action catalogue' },
    { name: 'Playbooks', description: 'Create, list and delete playbooks' },
    { name: 'Simulation', description: 'Find which playbooks run for a trigger' },
  ],
  paths: {
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        description: 'Creates the account and sets the session cookie. The token is never returned in the body.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RegisterBody' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Account created; session cookie set',
            headers: { 'Set-Cookie': { $ref: '#/components/headers/SessionCookie' } },
            content: {
              'application/json': {
                schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } },
              },
            },
          },
          '400': errorResponse('Validation failed', 'VALIDATION_ERROR', 'Request validation failed'),
          '409': errorResponse('Email already registered', 'EMAIL_TAKEN', 'Email is already registered'),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginBody' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Logged in; session cookie set',
            headers: { 'Set-Cookie': { $ref: '#/components/headers/SessionCookie' } },
            content: {
              'application/json': {
                schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } },
              },
            },
          },
          '400': errorResponse('Validation failed', 'VALIDATION_ERROR', 'Request validation failed'),
          '401': errorResponse('Wrong email or password', 'INVALID_CREDENTIALS', 'Invalid email or password'),
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Log out',
        description: 'Clears the session cookie. Does not require a valid session.',
        responses: {
          '204': { description: 'Session cookie cleared' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get the current user',
        security: [{ sessionCookie: [] }],
        responses: {
          '200': {
            description: 'The signed-in user',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } },
              },
            },
          },
          '401': errorResponse('No valid session', 'UNAUTHORIZED', 'Authentication required'),
        },
      },
    },
    '/triggers': {
      get: {
        tags: ['Triggers'],
        summary: 'List the triggers the user has added',
        security: [{ sessionCookie: [] }],
        responses: {
          '200': {
            description: 'Added triggers',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { triggers: { type: 'array', items: { $ref: '#/components/schemas/Trigger' } } } },
              },
            },
          },
          '401': errorResponse('No valid session', 'UNAUTHORIZED', 'Authentication required'),
        },
      },
    },
    '/triggers/available': {
      get: {
        tags: ['Triggers'],
        summary: 'List triggers the user has not added yet',
        security: [{ sessionCookie: [] }],
        responses: {
          '200': {
            description: 'Triggers that can still be added',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { triggers: { type: 'array', items: { $ref: '#/components/schemas/Trigger' } } } },
              },
            },
          },
          '401': errorResponse('No valid session', 'UNAUTHORIZED', 'Authentication required'),
        },
      },
    },
    '/triggers/added': {
      post: {
        tags: ['Triggers'],
        summary: 'Add a trigger to the user\'s list',
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/TriggerAddBody' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Trigger added',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { trigger: { $ref: '#/components/schemas/Trigger' } } },
              },
            },
          },
          '400': errorResponse('Validation failed', 'VALIDATION_ERROR', 'Request validation failed'),
          '401': errorResponse('No valid session', 'UNAUTHORIZED', 'Authentication required'),
          '404': errorResponse('Trigger does not exist', 'NOT_FOUND', 'Trigger not found'),
          '409': errorResponse('Already added', 'TRIGGER_ALREADY_ADDED', 'Trigger already added'),
        },
      },
    },
    '/actions': {
      get: {
        tags: ['Actions'],
        summary: 'List all actions',
        security: [{ sessionCookie: [] }],
        responses: {
          '200': {
            description: 'Action catalogue',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { actions: { type: 'array', items: { $ref: '#/components/schemas/Action' } } } },
              },
            },
          },
          '401': errorResponse('No valid session', 'UNAUTHORIZED', 'Authentication required'),
        },
      },
    },
    '/playbooks': {
      get: {
        tags: ['Playbooks'],
        summary: 'List the user\'s playbooks',
        security: [{ sessionCookie: [] }],
        responses: {
          '200': {
            description: 'Playbooks owned by the user',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { playbooks: { type: 'array', items: { $ref: '#/components/schemas/Playbook' } } } },
              },
            },
          },
          '401': errorResponse('No valid session', 'UNAUTHORIZED', 'Authentication required'),
        },
      },
      post: {
        tags: ['Playbooks'],
        summary: 'Create a playbook',
        description:
          'The trigger must already be in the user\'s added list. Action order in `actionIds` is kept as the playbook\'s order. Playbook names are unique per user, ignoring letter case.',
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PlaybookBody' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Playbook created',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { playbook: { $ref: '#/components/schemas/Playbook' } } },
              },
            },
          },
          '400': errorResponse('Validation failed or unknown action', 'VALIDATION_ERROR', 'Request validation failed'),
          '401': errorResponse('No valid session', 'UNAUTHORIZED', 'Authentication required'),
          '403': errorResponse('Trigger not added by the user', 'TRIGGER_NOT_ADDED', 'Trigger has not been added'),
          '409': errorResponse('Name already used', 'PLAYBOOK_NAME_TAKEN', 'Playbook name already exists'),
        },
      },
    },
    '/playbooks/{id}': {
      delete: {
        tags: ['Playbooks'],
        summary: 'Delete a playbook',
        security: [{ sessionCookie: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Playbook id',
            schema: { type: 'string', minLength: 1 },
          },
        ],
        responses: {
          '204': { description: 'Playbook deleted' },
          '401': errorResponse('No valid session', 'UNAUTHORIZED', 'Authentication required'),
          '404': errorResponse('Not found or owned by another user', 'NOT_FOUND', 'Playbook not found'),
        },
      },
    },
    '/simulateTrigger': {
      post: {
        tags: ['Simulation'],
        summary: 'Simulate a trigger',
        description:
          'Returns every playbook of the user that uses this trigger, with its actions. Nothing is executed.',
        security: [{ sessionCookie: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SimulateBody' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Matching playbooks',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Simulation' },
              },
            },
          },
          '400': errorResponse('Validation failed', 'VALIDATION_ERROR', 'Request validation failed'),
          '401': errorResponse('No valid session', 'UNAUTHORIZED', 'Authentication required'),
          '403': errorResponse('Trigger not added by the user', 'TRIGGER_NOT_ADDED', 'Trigger has not been added'),
          '404': errorResponse('Trigger does not exist', 'NOT_FOUND', 'Trigger not found'),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'playbook_session',
        description: 'Set by /auth/register or /auth/login.',
      },
    },
    headers: {
      SessionCookie: {
        description: 'HttpOnly session cookie, SameSite=Strict, valid for 24 hours. Secure when COOKIE_SECURE=true.',
        schema: { type: 'string' },
      },
    },
    schemas: {
      RegisterBody: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 255 },
          password: {
            type: 'string',
            minLength: 8,
            maxLength: 72,
            description: 'At least 8 characters, at most 72 bytes, with at least one letter and one digit.',
          },
        },
      },
      LoginBody: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
      TriggerAddBody: {
        type: 'object',
        required: ['triggerId'],
        properties: { triggerId: uuid('Trigger to add') },
      },
      PlaybookBody: {
        type: 'object',
        required: ['name', 'triggerId', 'actionIds'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          triggerId: uuid('Trigger the playbook responds to; must be in the user\'s added list'),
          actionIds: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            uniqueItems: true,
            description: 'Actions in run order',
            items: uuid('Action id'),
          },
        },
      },
      SimulateBody: {
        type: 'object',
        required: ['triggerId'],
        properties: { triggerId: uuid('Trigger to simulate') },
      },
      User: {
        type: 'object',
        properties: {
          id: uuid('User id'),
          email: { type: 'string', format: 'email' },
        },
      },
      Trigger: {
        type: 'object',
        properties: {
          id: uuid('Trigger id'),
          name: { type: 'string', maxLength: 50 },
        },
      },
      Action: {
        type: 'object',
        properties: {
          id: uuid('Action id'),
          name: { type: 'string', maxLength: 50 },
        },
      },
      Playbook: {
        type: 'object',
        properties: {
          id: uuid('Playbook id'),
          name: { type: 'string', maxLength: 100 },
          trigger: { $ref: '#/components/schemas/Trigger' },
          actions: { type: 'array', items: { $ref: '#/components/schemas/Action' } },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Simulation: {
        type: 'object',
        properties: {
          trigger: { $ref: '#/components/schemas/Trigger' },
          matches: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                playbook: {
                  type: 'object',
                  properties: { id: uuid('Playbook id'), name: { type: 'string' } },
                },
                actions: { type: 'array', items: { $ref: '#/components/schemas/Action' } },
              },
            },
          },
        },
      },
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                enum: [
                  'VALIDATION_ERROR',
                  'UNAUTHORIZED',
                  'INVALID_CREDENTIALS',
                  'TRIGGER_NOT_ADDED',
                  'NOT_FOUND',
                  'EMAIL_TAKEN',
                  'TRIGGER_ALREADY_ADDED',
                  'PLAYBOOK_NAME_TAKEN',
                  'INTERNAL',
                ],
              },
              message: { type: 'string' },
              details: {
                type: 'array',
                description: 'Present on validation errors',
                items: {
                  type: 'object',
                  properties: {
                    path: { type: 'string' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
