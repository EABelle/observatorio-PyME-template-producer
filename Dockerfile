FROM node:10.15

ENV AMQP_URL amqp://guest:guest@rabbitmq:5672

ADD . /code
WORKDIR /code
RUN npm install --production
CMD ["npm", "start"]
