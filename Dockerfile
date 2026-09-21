FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY config ./config
COPY src ./src

USER node

CMD ["npm", "run", "start:publisher"]
