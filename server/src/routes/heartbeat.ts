import { Router } from "express";
import { getHeartbeatStatus } from "../runner/heartbeat.js";

export const heartbeatRouter = Router();

heartbeatRouter.get("/status", (_req, res) => {
  res.json(getHeartbeatStatus());
});
