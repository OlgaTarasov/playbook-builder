import { Router } from 'express';
import { requireUser } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { triggerAddBody, type TriggerAddBody } from '../schemas';
import type { TriggerService } from '../services/trigger.service';

export function createTriggersRouter(triggers: TriggerService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const list = await triggers.listAdded(requireUser(req).id);
    res.json({ triggers: list });
  });

  router.get('/available', async (req, res) => {
    const list = await triggers.listAvailable(requireUser(req).id);
    res.json({ triggers: list });
  });

  router.post('/added', validate({ body: triggerAddBody }), async (req, res) => {
    const { triggerId } = req.body as TriggerAddBody;
    const trigger = await triggers.add(requireUser(req).id, triggerId);
    res.status(201).json({ trigger });
  });

  return router;
}
