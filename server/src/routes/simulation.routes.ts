import { Router } from 'express';
import { requireUser } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { simulateBody, type SimulateBody } from '../schemas';
import type { SimulationService } from '../services/simulation.service';

export function createSimulationRouter(simulation: SimulationService): Router {
  const router = Router();

  router.post('/', validate({ body: simulateBody }), async (req, res) => {
    const { triggerId } = req.body as SimulateBody;
    const result = await simulation.run(requireUser(req).id, triggerId);
    res.status(200).json(result);
  });

  return router;
}
