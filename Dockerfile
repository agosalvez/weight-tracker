FROM node:22-alpine

# better-sqlite3 necesita compilar binarios nativos
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Volumen para persistir la base de datos
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "server.js"]
