FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy all project files
COPY . .

# Expose port
EXPOSE 3000

# Start in development mode (matches 'npm run dev')
CMD ["npm", "run", "dev"]
