# Axolotl agent — long-lived process (the iMessage agent + background worker).
# This is NOT a Vercel serverless function; it holds a persistent iMessage
# connection and a background timer, so it must run on a long-lived host:
# Fly.io / Railway / a VPS / an always-on machine.
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The agent also serves a local landing page; bind it to the platform's port.
EXPOSE 3000
ENV NODE_ENV=production

CMD ["sh", "-c", "WEB_PORT=${PORT:-3000} npm run start"]
