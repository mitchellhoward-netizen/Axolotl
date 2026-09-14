# Axolotl agent — long-lived process (the iMessage agent + background worker).
# This is NOT a Vercel serverless function; it holds a persistent iMessage
# connection and a background timer, so it must run on a long-lived host:
# Fly.io / Railway / a VPS / an always-on machine.
FROM node:22-slim
WORKDIR /app

# Local-only document text extraction/OCR; no document vendor API required.
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-eng util-linux \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The agent also serves a local landing page; bind it to the platform's port.
EXPOSE 3000
ENV NODE_ENV=production

CMD ["sh", "-c", "WEB_PORT=${PORT:-3000} npm run start"]
