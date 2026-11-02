/** Fecha opcional a ISO (null se queda en null). */
export const iso = (d) => (d ? new Date(d).toISOString() : null);
