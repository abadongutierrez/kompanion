import { Router } from "express";
import { listBuiltinHarnesses } from "../runner/claudeHarness.js";

export const harnessesRouter = Router();

harnessesRouter.get("/", (_req, res) => {
  res.json(listBuiltinHarnesses());
});
