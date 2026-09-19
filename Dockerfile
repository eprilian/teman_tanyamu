FROM node:24-alpine
WORKDIR /app

# Only install production dependencies (ignores heavy devDependencies like playwright/jest)
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy stable application codes and static assets
COPY server.js ./
COPY public/ ./public/
COPY lib/ ./lib/

# Set environment variables for optimized production run
ENV NODE_ENV=production
ENV PORT=3000

# Expose internal container port
EXPOSE 3000

# Launch Express server
CMD ["node", "server.js"]
