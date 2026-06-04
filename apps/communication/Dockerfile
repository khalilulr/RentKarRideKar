FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3003
EXPOSE 50054
ENV NODE_ENV=development
CMD ["npm", "run", "start", "--", "communication"]