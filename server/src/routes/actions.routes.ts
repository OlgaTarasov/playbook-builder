import { Router } from 'express';
import type { ActionService } from '../services/action.service';

export function createActionsRouter(actions: ActionService): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    res.json({ actions: await actions.list() });
  });

  return router;
}
