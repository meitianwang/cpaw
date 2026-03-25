import { GatewayError } from "../errors.js";

const ENTITY_ID_RE = /^[\w\-]{1,64}$/;

export function requireEntityId(id: string, label = "id"): string {
  const trimmed = id.trim();
  if (!trimmed) {
    throw GatewayError.badRequest(`${label} is required`);
  }
  if (!ENTITY_ID_RE.test(trimmed)) {
    throw GatewayError.badRequest(`${label} must be 1-64 alphanumeric/dash chars`);
  }
  return trimmed;
}
