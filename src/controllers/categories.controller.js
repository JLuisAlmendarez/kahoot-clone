import { Category } from '../models/index.js';

/** GET /api/categories — categorías con sus etiquetas */
export async function list(req, res) {
  const categories = await Category.find().sort({ _id: 1 });
  res.json(categories.map((c) => c.toPublic()));
}
