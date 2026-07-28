import { Router } from 'express';
import { query } from '../../database/pool.js';
import { authenticate } from '../../middlewares/auth.js';
export const dashboardRouter = Router();
dashboardRouter.use(authenticate);
dashboardRouter.get('/', async (req, res, next) => {
  try {
    const id = req.user!.id;
    const [summary, low, recent, trend] = await Promise.all([
      query(
        'SELECT count(*)::int total_products,coalesce(sum(stock_quantity*price),0)::numeric inventory_value,count(*) filter(where stock_quantity=0)::int out_of_stock,count(*) filter(where stock_quantity>0 and stock_quantity<=low_stock_threshold)::int low_stock FROM products WHERE user_id=$1',
        [id],
      ),
      query(
        'SELECT id,name,sku,stock_quantity,low_stock_threshold FROM products WHERE user_id=$1 AND stock_quantity<=low_stock_threshold ORDER BY stock_quantity LIMIT 5',
        [id],
      ),
      query(
        'SELECT m.*,p.name product_name FROM stock_movements m JOIN products p ON p.id=m.product_id WHERE p.user_id=$1 ORDER BY m.created_at DESC LIMIT 8',
        [id],
      ),
      query(
        "SELECT to_char(created_at,'Mon DD') label,sum(abs(quantity))::int quantity FROM stock_movements WHERE user_id=$1 AND created_at>=now()-interval '7 days' GROUP BY 1 ORDER BY min(created_at)",
        [id],
      ),
    ]);
    res.json({
      success: true,
      data: {
        summary: summary.rows[0],
        lowStock: low.rows,
        recentTransactions: recent.rows,
        trend: trend.rows,
      },
    });
  } catch (e) {
    next(e);
  }
});
