FROM node:24-trixie-slim
WORKDIR /app
COPY . ./
WORKDIR /app/tests/experiments/analytics/next-app
ENV NEXT_TELEMETRY_DISABLED=1
CMD ["node", "server.js"]
