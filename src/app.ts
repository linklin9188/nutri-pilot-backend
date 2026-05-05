import express from 'express';
import dotenv from 'dotenv';
import menuRoutes from './routes/menuRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api/menu', menuRoutes);

app.get('/', (req, res) => {
  res.send('悦小厨 Nutri-Pilot API 核心中枢已通电运行！');
});

app.listen(PORT, () => {
  console.log(`🚀 API Server is running on http://localhost:${PORT}`);
});
