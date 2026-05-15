FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Expose the REST/GraphQL port
EXPOSE 3000


ENV NODE_ENV=development

CMD ["npm", "run", "start:dev", "--", "api-gateway"]