FROM node:12-slim

ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

WORKDIR ./

COPY package*.json ./

RUN npm install -g nodemon
RUN npm install
RUN export NODE_OPTIONS=--max_old_space_size=4096 #4GB

COPY . .

COPY ./.env-example ./.env

WORKDIR ./

CMD [ "npm", "start" ]
