import type { PanelSession } from "../services/auth.js";

// pino-http ya declara req.id y req.log. Aquí se agregan los datos que dejan
// los middlewares propios.
declare global {
  namespace Express {
    interface Request {
      /** Sesión del panel cargada por requirePanel (LN-04). */
      panel?: PanelSession;
    }
  }
}

export {};
