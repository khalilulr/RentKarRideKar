FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 50051

ENV NODE_ENV=development

CMD ["npm", "run", "start:dev", "--", "auth"]