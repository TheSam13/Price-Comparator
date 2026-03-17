FROM mcr.microsoft.com/playwright:v1.45.0-jammy

WORKDIR /app

# Copy from the backend folder specifically
COPY backend/package*.json ./
RUN npm install

# Copy everything from the backend folder into /app
COPY backend/ .

EXPOSE 10000

# This will now find server.js in /app
CMD ["node", "server.js"]
