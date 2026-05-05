import { Router } from 'express';
import { getDailyMenu } from '../controllers/menuController';

const router = Router();
router.get('/daily', getDailyMenu);

export default router;
