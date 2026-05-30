FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3002

ENV NODE_ENV=development

CMD ["npm", "run", "start", "--", "booking"]
