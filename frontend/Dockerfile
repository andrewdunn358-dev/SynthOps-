# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json ./
COPY yarn.lock* ./

# Install dependencies
RUN yarn install

# Copy source code
COPY . .

# Build argument for backend URL
ARG REACT_APP_BACKEND_URL=http://localhost
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# Build the application
RUN yarn build

# Production stage
FROM nginx:alpine

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files
COPY --from=builder /app/build /usr/share/nginx/html

# Expose ports
EXPOSE 80 443

# Health check — hits the dedicated /health endpoint on port 80 (defined in
# nginx.conf). The previous version hit '/' which got 301'd to HTTPS, and
# wget --spider doesn't follow redirects, so the check failed forever even
# though nginx was serving traffic perfectly fine.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
