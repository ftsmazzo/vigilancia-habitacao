FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm install

COPY backend .

RUN npx prisma generate

EXPOSE 3000

# Schema + seed a cada deploy (EasyPanel / container start) — nao exige prisma manual
CMD ["sh", "-c", "npx prisma db push && node prisma/seed.js && node src/server.js"]
