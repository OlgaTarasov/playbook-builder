import express, { type Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { NotFoundError } from './errors';
import { createAuthenticate } from './middleware/authenticate';
import { errorHandler } from './middleware/errorHandler';
import { ActionRepository } from './repositories/action.repository';
import { PlaybookRepository } from './repositories/playbook.repository';
import { TriggerRepository } from './repositories/trigger.repository';
import { UserRepository } from './repositories/user.repository';
import { createActionsRouter } from './routes/actions.routes';
import { createAuthRouter } from './routes/auth.routes';
import { createDocsRouter } from './routes/docs.routes';
import { createPlaybooksRouter } from './routes/playbooks.routes';
import { createSimulationRouter } from './routes/simulation.routes';
import { createTriggersRouter } from './routes/triggers.routes';
import { ActionService } from './services/action.service';
import { AuthService } from './services/auth.service';
import { PlaybookService } from './services/playbook.service';
import { SimulationService } from './services/simulation.service';
import { TokenService } from './services/token.service';
import { TriggerService } from './services/trigger.service';

export interface AppDependencies {
  prisma: PrismaClient;
  jwtSecret: string;
  /** Sets the Secure flag on the session cookie. Defaults to off (plain HTTP in Compose). */
  cookieSecure?: boolean;
}

/**
 * Builds the Express app. Dependencies are passed in so tests can use a
 * test database client.
 */
export function createApp({ prisma, jwtSecret, cookieSecure = false }: AppDependencies): Express {
  const tokens = new TokenService(jwtSecret);
  const userRepo = new UserRepository(prisma);
  const triggerRepo = new TriggerRepository(prisma);
  const actionRepo = new ActionRepository(prisma);
  const playbookRepo = new PlaybookRepository(prisma);

  const triggerService = new TriggerService(triggerRepo);
  const authService = new AuthService(userRepo, tokens);
  const actionService = new ActionService(actionRepo);
  const playbookService = new PlaybookService(playbookRepo, actionRepo, triggerService);
  const simulationService = new SimulationService(playbookRepo, triggerRepo, triggerService);

  const authenticate = createAuthenticate({ tokens, users: userRepo });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  app.use(createDocsRouter());
  app.use('/auth', createAuthRouter(authService, { cookieSecure, authenticate }));
  app.use('/triggers', authenticate, createTriggersRouter(triggerService));
  app.use('/actions', authenticate, createActionsRouter(actionService));
  app.use('/playbooks', authenticate, createPlaybooksRouter(playbookService));
  app.use('/simulateTrigger', authenticate, createSimulationRouter(simulationService));

  app.use((_req, _res, next) => next(new NotFoundError('Route not found')));
  app.use(errorHandler);

  return app;
}
