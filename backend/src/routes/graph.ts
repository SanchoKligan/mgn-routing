import { Router } from 'express';
import { loadGraph } from '../services/graph-loader';

const router = Router();

router.get('/', (_req, res) => {
  const { nodes, edges } = loadGraph();
  res.json({ nodes, edges });
});

export default router;
