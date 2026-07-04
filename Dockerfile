FROM node:22-bookworm-slim

# Install Chromium and its system dependencies (for puppeteer PDF generation).
# Fonts are REQUIRED: the slim base image ships almost no glyphs, so without these
# headless Chromium renders Kannada (and any non-Latin script) as tofu boxes (□□□)
# in every server-side PDF — counter-replies, escalations, RTI/appeal letters.
#   fonts-liberation  → metric-compatible substitute for "Times New Roman"/serif
#   fonts-noto-core   → Noto Sans/Serif Kannada (+ most other scripts)
#   fonts-lohit-knda  → Lohit Kannada (authentic Kannada letterforms)
#   fonts-gubbi       → Gubbi Kannada (extra fallback)
# fc-cache rebuilds the fontconfig cache so Chromium sees the new fonts.
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-core \
    fonts-noto-ui-core \
    fonts-lohit-knda \
    fonts-gubbi \
    fontconfig \
    --no-install-recommends \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

# Tell puppeteer to skip its own Chrome download and use system Chromium instead
# puppeteer v20+ uses PUPPETEER_SKIP_DOWNLOAD (older PUPPETEER_SKIP_CHROMIUM_DOWNLOAD is ignored)
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Install dependencies (layer cached separately from source for faster rebuilds)
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# Copy source and build Next.js
COPY . .
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

CMD ["npm", "start"]
