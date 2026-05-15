import { Router } from 'express';
import { loadGraph } from '../services/graph-loader';
import { aStarSearch } from '../services/routing/a-star';
import { UserProfile, UserCategory } from '../models/types';

const router = Router();

const profiles: Record<UserCategory, UserProfile> = {
  wheelchair: {
    category: 'wheelchair',
    hardConstraints: {
      maxSlopePercent: 8,
      maxCurbHeightCm: 2,
      minWidthM: 1.2,
      allowStairs: false,
    },
    weights: {
      distance: 1.0,
      slope: 2.8,
      surface: 1.8,
      curb: 2.2,
      stairs: 5.0,
      dynamic: 1.5,
    },
  },
  visual_impaired: {
    category: 'visual_impaired',
    hardConstraints: {
      maxSlopePercent: 12,
      maxCurbHeightCm: 4,
      minWidthM: 1.0,
      allowStairs: true,
    },
    weights: {
      distance: 1.0,
      slope: 1.0,
      surface: 0.7,
      curb: 0.7,
      stairs: 0.5,
      dynamic: 1.2,
    },
  },
  elderly: {
    category: 'elderly',
    hardConstraints: {
      maxSlopePercent: 7,
      maxCurbHeightCm: 4,
      minWidthM: 1.0,
      allowStairs: true,
    },
    weights: {
      distance: 1.0,
      slope: 3.0,
      surface: 1.5,
      curb: 1.1,
      stairs: 2.0,
      dynamic: 1.4,
    },
  },
  parent_with_stroller: {
    category: 'parent_with_stroller',
    hardConstraints: {
      maxSlopePercent: 9,
      maxCurbHeightCm: 3,
      minWidthM: 1.2,
      allowStairs: false,
    },
    weights: {
      distance: 1.0,
      slope: 2.3,
      surface: 1.3,
      curb: 1.8,
      stairs: 6.0,
      dynamic: 1.3,
    },
  },
};

router.post('/', (req, res) => {
  const { startNodeId, endNodeId, profile } = req.body as {
    startNodeId: string;
    endNodeId: string;
    profile: UserCategory;
  };

  if (!profiles[profile]) {
    return res.status(400).json({ error: 'Unknown profile' });
  }

  const { nodesMap, adjacency } = loadGraph();
  const result = aStarSearch(
    startNodeId,
    endNodeId,
    nodesMap,
    adjacency,
    profiles[profile]
  );

  if (!result) {
    return res.status(404).json({ error: 'Маршрут не найден' });
  }

  return res.json(result);
});

export default router;
