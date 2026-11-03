FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY bridge.mjs sync-plan.mjs pantry.mjs notification-plan.mjs notification-worker.mjs addon-start.mjs ./
CMD ["node", "addon-start.mjs"]
