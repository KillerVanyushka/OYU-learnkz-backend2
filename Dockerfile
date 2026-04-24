FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma/
RUN npx prisma generate
COPY . .
EXPOSE 5000
CMD ["npx", "prisma", "db", "push", "--schema=./prisma/schema.prisma", "&&", "node", "src/index.js"]