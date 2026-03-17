# Use the official Playwright image which has all browser dependencies pre-installed
FROM mcr.microsoft.com/playwright:v1.45.0-jammy

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your application code
COPY . .

# Expose the port your server.js uses (usually 3000 or 10000 on Render)
EXPOSE 10000

# Start your application
CMD ["node", "server.js"]
