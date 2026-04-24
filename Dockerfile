FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app

# Dependencies
COPY package*.json ./
RUN npm install

# Prisma: generate client at build time
COPY prisma ./prisma/
RUN npx prisma generate

# App code
COPY . .

EXPOSE 5000

# Run pending migrations, then start the app
# migrate deploy is safe: only applies NEW migrations, skips already-applied ones
CMD ["sh", "-c", "npx prisma migrate deploy --schema=./prisma/schema.prisma && node src/index.js"]