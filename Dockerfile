# 1. Base image: small, official Node 22 (same version as your workflow)
FROM node:22-alpine

# 2. All following commands run inside /app
WORKDIR /app

# 3. Tell Node and libraries this is production
ENV NODE_ENV=production

# 4. Copy ONLY dependency files first (for layer caching)
COPY package.json package-lock.json ./

# 5. Install exact production dependencies, then clean the npm cache
RUN npm ci --omit=dev && npm cache clean --force

# 6. Copy the application code
COPY . .

# 7. Run as the non-root "node" user (built into the official image)
USER node

# 8. Document the port the app listens on
EXPOSE 3000

# 9. Start command
CMD ["node", "server.js"]