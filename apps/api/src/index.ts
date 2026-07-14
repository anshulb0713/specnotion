import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { ZodError } from "zod";
import { requireAuth } from "./auth.js";
import { config } from "./config.js";
import { ApiProblem, requestId } from "./domain.js";
import { startEmailWorker } from "./email-worker.js";
import { apiRouter } from "./routes.js";

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin: config.WEB_ORIGIN,
    credentials: true,
    allowedHeaders: ["Authorization", "Content-Type", "X-Request-Id"],
    methods: ["GET", "POST", "OPTIONS"],
    maxAge: 600,
  }),
);
app.use(express.json({ limit: "32kb" }));

app.get("/health/live", (_request, response) => response.json({ ok: true }));
app.get("/health/ready", (_request, response) => response.json({ ok: true, service: "speccheck-api" }));
app.use("/api", requireAuth, apiRouter);

const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const id = requestId(request);
  if (error instanceof ApiProblem) {
    response.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details, requestId: id },
    });
    return;
  }
  if (error instanceof ZodError) {
    response.status(400).json({
      error: { code: "INVALID_INPUT", message: "Check the highlighted fields.", details: error.issues, requestId: id },
    });
    return;
  }
  if (error instanceof multer.MulterError) {
    response.status(400).json({
      error: { code: "UPLOAD_FAILED", message: error.code === "LIMIT_FILE_SIZE" ? "Markdown files must be 1 MB or smaller." : error.message, requestId: id },
    });
    return;
  }
  console.error({ requestId: id, error });
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong.", requestId: id } });
};

// Multer is imported lazily here only for its error class in the final handler.
import multer from "multer";
app.use(errorHandler);

const server = app.listen(config.API_PORT, () => {
  console.info(`SpecCheck API listening on http://localhost:${config.API_PORT}`);
});
const stopEmailWorker = startEmailWorker();

function shutdown(): void {
  stopEmailWorker();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
