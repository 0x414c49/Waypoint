import pino, { type DestinationStream, type Logger } from "pino";

export function createStructuredLogger(
  level = "info",
  destination?: DestinationStream,
): Logger {
  const options = {
    level,
    base: { application: "engineering-journey-tracker" },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "request.body",
        "body.reflection",
        "body.keyLearning",
        "body.content",
        "planSource",
        "aiContent",
      ],
      censor: "[redacted]",
    },
    serializers: {
      req(request: { method?: string; url?: string; hostname?: string }) {
        return {
          method: request.method,
          url: request.url,
          hostname: request.hostname,
        };
      },
      err: pino.stdSerializers.err,
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
