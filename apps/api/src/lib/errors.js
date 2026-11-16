/** Error con código HTTP y un código corto que la web puede traducir. */
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message ?? code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code, message, details) => new HttpError(400, code, message, details);
export const unauthorized = (message = 'Inicia sesión para continuar') =>
  new HttpError(401, 'unauthorized', message);
export const forbidden = (code = 'forbidden', message = 'No tienes permiso para hacer esto') =>
  new HttpError(403, code, message);
export const notFound = (message = 'No encontrado') => new HttpError(404, 'not_found', message);
export const conflict = (code, message) => new HttpError(409, code, message);
