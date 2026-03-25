/**
 * Typed error for gateway operations — carries an HTTP status code
 * so the transport layer doesn't need to guess from the message string.
 */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "GatewayError";
  }

  static badRequest(message: string): GatewayError {
    return new GatewayError(message, 400);
  }

  static notFound(message: string): GatewayError {
    return new GatewayError(message, 404);
  }

  static unavailable(message: string): GatewayError {
    return new GatewayError(message, 503);
  }
}

export function gatewayErrorStatusCode(err: unknown): number {
  if (err instanceof GatewayError) {
    return err.statusCode;
  }
  return 500;
}
