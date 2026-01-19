FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app source
COPY src/ ./src/

# Expose port
EXPOSE 8080

# Start the app
CMD ["node", "src/index.js"]
