FROM node:20-alpine

WORKDIR /app

# Install deps first (better caching)
COPY package*.json ./
RUN npm ci

# Copy the rest + build
COPY . .
RUN npm run build

# Railway injects PORT automatically
ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
