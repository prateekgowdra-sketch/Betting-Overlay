import { handleBackendRequest } from "../backend/server.js";

export default function handler(request, response) {
  return handleBackendRequest(request, response);
}
