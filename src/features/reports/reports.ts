import { Router } from 'express';
import { query } from '../../database/pool.js';
import { authenticate } from '../../middlewares/auth.js';
export const reportsRouter = Router();
reportsRouter.use(authenticate);
reportsRouter.get('/inventory', async (req, res, next) => {
  try {
    const r = await query(
      'SELECT p.id,p.name,p.sku,p.price,p.stock_quantity,p.low_stock_threshold,c.name category_name,(p.price*p.stock_quantity)::numeric stock_value FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.user_id=$1 ORDER BY p.name',
      [req.user!.id],
    );
    res.json({ success: true, data: r.rows });
  } catch (e) {
    next(e);
  }
});
reportsRouter.get('/movement', async (req, res, next) => {
  try {
    const r = await query(
      "SELECT to_char(created_at,'YYYY-MM-DD') date,type,sum(quantity)::int quantity FROM stock_movements WHERE user_id=$1 AND created_at>=now()-interval '30 days' GROUP BY 1,2 ORDER BY 1",
      [req.user!.id],
    );
    res.json({ success: true, data: r.rows });
  } catch (e) {
    next(e);
  }
});
