import express from 'express';
import cors from 'cors';
import graphRoutes from './routes/graph';
import routeRoutes from './routes/route';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/graph', graphRoutes);
app.use('/api/route', routeRoutes);

export default app;
