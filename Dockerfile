FROM node:22-bookworm-slim

# Install Chromium and its system dependencies (for puppeteer PDF generation)
RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends \
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
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

CMD ["npm", "start"]
