# Build Stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Production Stage
FROM node:18-alpine

WORKDIR /app

# The server's network fallback invokes curl when Node transports fail.
RUN apk add --no-cache curl

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built frontend assets from builder stage
COPY --from=builder /app/dist ./dist

# Copy backend server code
COPY server.cjs ./
COPY server ./server

# Expose port
EXPOSE 3325

# Start the server
CMD ["node", "server.cjs"]
