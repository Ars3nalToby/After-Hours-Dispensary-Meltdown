# Render/Fly/Railway image. The Playwright base image already contains Chromium and its system libraries.
FROM mcr.microsoft.com/playwright:v1.56.1-noble
WORKDIR /app
ENV NODE_ENV=production PORT=3000 TRUST_PROXY=1 CHROMIUM_NO_SANDBOX=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY index.html ./
COPY css ./css
COPY js ./js
COPY server ./server
# Run as the unprivileged user shipped in the image. Chromium's own sandbox needs extra kernel privileges that
# most hosts do not grant, so it is off; the container boundary and the non-root user are the isolation instead.
USER pwuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
