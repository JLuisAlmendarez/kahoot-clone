import { normalize } from '../shared/rules.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OPS = { '>': '$gt', '<': '$lt', '>=': '$gte', '<=': '$lte', '=': '$eq' };

/**
 * Interpreta la caja de búsqueda del catálogo y la traduce a un filtro de MongoDB.
 *   "matrices categoria:matematicas preguntas:>5 sort:populares"
 * Calificadores: categoria, autor, etiqueta, preguntas, sort.
 * Lo que no se reconoce se regresa en `ignored` para avisarle al usuario.
 */
export class SearchQuery {
  static KEYS = ['categoria', 'autor', 'etiqueta', 'preguntas', 'sort'];

  constructor(q = '') {
    this.raw = String(q).slice(0, 200);
    this.text = [];
    this.filters = {};
    this.ignored = [];
    for (const token of this.raw.trim().split(/\s+/).filter(Boolean)) {
      const m = token.match(/^([a-záéíóú]+):(.+)$/i);
      if (!m) { this.text.push(normalize(token)); continue; }
      const key = normalize(m[1]);
      const value = normalize(m[2]).replace(/^@/, '');
      if (key === 'preguntas') {
        const p = value.match(/^(>=|<=|>|<|=)?(\d+)$/);
        if (p) this.filters.preguntas = { op: p[1] || '=', n: Number(p[2]) };
        else this.ignored.push(token);
      } else if (key === 'sort') {
        if (['populares', 'recientes'].includes(value)) this.filters.sort = value;
        else this.ignored.push(token);
      } else if (SearchQuery.KEYS.includes(key)) {
        this.filters[key] = value;
      } else {
        this.ignored.push(token);
      }
    }
  }

  /** Filtro para Quiz.find(). */
  toFilter() {
    const f = this.filters;
    const filter = {};
    if (f.categoria) filter['category.slug'] = f.categoria;
    if (f.autor) filter['owner.username'] = f.autor;
    if (f.etiqueta) filter['tags.slug'] = f.etiqueta;
    if (f.preguntas) filter.questionCount = { [OPS[f.preguntas.op]]: f.preguntas.n };
    // searchText es título + descripción + etiquetas sin acentos; cada palabra debe aparecer
    if (this.text.length) filter.$and = this.text.map((t) => ({ searchText: { $regex: escapeRegex(t) } }));
    return filter;
  }

  toSort() {
    return this.filters.sort === 'populares' ? { likesCount: -1, createdAt: -1 } : { createdAt: -1 };
  }
}
