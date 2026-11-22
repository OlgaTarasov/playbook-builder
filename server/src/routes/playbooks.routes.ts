import { Router } from 'express';
import { requireUser } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { idParam, playbookBody, type PlaybookBody } from '../schemas';
import type { PlaybookService } from '../services/playbook.service';

export function createPlaybooksRouter(playbooks: PlaybookService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const list = await playbooks.list(requireUser(req).id);
    res.json({ playbooks: list });
  });

  router.post('/', validate({ body: playbookBody }), async (req, res) => {
    const playbook = await playbooks.create(requireUser(req).id, req.body as PlaybookBody);
    res.status(201).json({ playbook });
  });

  router.delete('/:id', validate({ params: idParam }), async (req, res) => {
    // A single named param is always a string; validate({ params: idParam }) ran first.
    await playbooks.remove(requireUser(req).id, req.params.id as string);
    res.status(204).end();
  });

  return router;
}
