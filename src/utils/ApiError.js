/**
 * Error con forma de respuesta HTTP. Los controladores lo lanzan y el
 * middleware errorHandler lo convierte en:
 *   { success: false, error: { code, message, fields } }
 */
export class ApiError extends Error {
  constructor(status, code, message, fields = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  toJSON() {
    return { success: false, error: { code: this.code, message: this.message, fields: this.fields } };
  }

  static badRequest(message = 'Los datos no son válidos', fields = []) { return new ApiError(400, 'VALIDATION_ERROR', message, fields); }
  static unauthorized(message = 'Inicia sesión para continuar') { return new ApiError(401, 'UNAUTHORIZED', message); }
  static forbidden(message = 'No tienes permiso para hacer esto') { return new ApiError(403, 'FORBIDDEN', message); }
  static notFound(message = 'No encontrado') { return new ApiError(404, 'NOT_FOUND', message); }
  static conflict(code, message, fields = []) { return new ApiError(409, code, message, fields); }
  static tooMany(message = 'Demasiadas solicitudes, espera un momento') { return new ApiError(429, 'RATE_LIMITED', message); }
}
