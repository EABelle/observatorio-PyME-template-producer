# Producer

Requirements:
- [Docker](https://docs.docker.com/engine/installation/)
- [nvm](https://github.com/creationix/nvm#installation) or node 10.15

## Docker installation

```bash
# RabbitMQ
docker pull rabbitmq:3-management
docker create --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
docker start rabbitmq

# Producer
docker build --tag 'producer:latest' .
docker create --name producer --link rabbitmq producer:latest
docker start producer
```

> RabbitMQ admin: [http://localhost:15672](http://localhost:15672) - login: `guest` - password: `guest`

## Local installation

```bash
nvm use
npm install
npm start
```

> RabbitMQ is required to work on port `5672`

## Configuration

The following environments variables are available to configure the `producer` worker.

- `N`[=10] - Total number of drivers.
- `GROWTH`[=1000] - Growth interval (ms)
- `UNTRUSTWORTHY_DRIVERS_RATIO`[=0.05] - ratio of drivers that will not sent all their position messages

## Docker Cleanup

```bash
docker stop producer rabbitmq
docker rm producer rabbitmq producer_rabbitmq_1
docker rmi -f producer:latest rabbitmq:3-management
```
