import express from "express";
import cors from "cors";
import { projectsRouter } from "./routes/projects.js";
import { teamsRouter } from "./routes/teams.js";
import { repositoriesRouter } from "./routes/repositories.js";
import { rolesRouter } from "./routes/roles.js";
import { tasksRouter } from "./routes/tasks.js";
import { taskDependenciesRouter } from "./routes/taskDependencies.js";
import { taskCommentsRouter } from "./routes/taskComments.js";
import { taskRunEventsRouter } from "./routes/taskRunEvents.js";
import { teamBudgetRouter } from "./routes/teamBudget.js";
import { heartbeatRouter } from "./routes/heartbeat.js";
import { harnessesRouter } from "./routes/harnesses.js";
import { startHeartbeat } from "./runner/heartbeat.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/projects", projectsRouter);
app.use("/api/projects/:projectId/teams", teamsRouter);
app.use("/api/projects/:projectId/repositories", repositoriesRouter);
app.use("/api/teams/:teamId/roles", rolesRouter);
app.use("/api/teams/:teamId/tasks", tasksRouter);
app.use("/api/teams/:teamId/tasks/:taskId/dependencies", taskDependenciesRouter);
app.use("/api/teams/:teamId/tasks/:taskId/comments", taskCommentsRouter);
app.use("/api/teams/:teamId/tasks/:taskId/runs/:runId/events", taskRunEventsRouter);
app.use("/api/teams/:teamId", teamBudgetRouter);
app.use("/api/heartbeat", heartbeatRouter);
app.use("/api/harnesses", harnessesRouter);

const port = Number(process.env.PORT ?? 3100);
app.listen(port, () => {
  console.log(`sdlc server listening on http://localhost:${port}`);
});

startHeartbeat();
