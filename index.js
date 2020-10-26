'use strict';

const amqplib = require('amqplib');
const logger = require('chpr-logger');
const Axios = require('axios');

const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'templates';
const ROUTING_KEY = 'templates.update';

const externalTemplatesURL = 'http://localhost:8080/templates';
const existingTemplateIdsURL = 'http://localhost:8080/templates/external-ids';

const axios = Axios.create();

async function getExternalTemplates(params = {}) {
  try {
    const response = await axios.get(externalTemplatesURL, {
      params,
    });
    return response.data;
  } catch (e) {
    logger.error(e);
    return [];
  }
}

async function getExistingTemplateIds(params = {}) {
  const response = await axios.get(existingTemplateIdsURL, {
    params,
  });
  return response.data;
}

/**
 * Publish the updated state to the exchange
 *
 * @param {object} state
 * @returns {void}
 */
function publish(state) {
  client.channel.publish(EXCHANGE, ROUTING_KEY, Buffer.from(JSON.stringify(state)), {
    persistent: false,
    expiration: 1000 * 60 * 60 // ms
  });
}

function convert(externalTemplate) {
  const { id: externalId, ...templateDetails } = externalTemplate;
  return {
    ...templateDetails,
    externalId,
  };
}

/**
 *
 * @param {array} templates
 * @param {array} existingTemplateIds [string]
 * @param {number} [interval=6000 ms]
 * @param {number} previousInterval
 * @returns {number} The setInterval id

 *
 */
function getTemplates(templates, existingTemplateIds = [], interval = 1000  *  60, previousInterval) {

  if (previousInterval) {
    clearInterval(previousInterval);
  }

  logger.info('> Get Templates');

  return setInterval(async () => {

    const templatesResponse = await getExternalTemplates();
    const newTemplates = templatesResponse.filter(t => !templates.includes(t) && !existingTemplateIds.includes(t.id));
    logger.info({ newTemplates }, '> New templates: ');

    newTemplates.forEach(template => {
      const formattedTemplate = convert(template);
      templates[template.id] = formattedTemplate;
      publish(formattedTemplate);
    });

  }, interval);
}

let client;

/**
 * Initialize the list of templates.
 *
 * @returns {array} List of templates
 */
async function init() {
  logger.info('> RabbitMQ initialization');
  client = await amqplib.connect(AMQP_URL);
  client.channel = await client.createChannel();
  await client.channel.assertExchange(EXCHANGE, 'topic', {
    durable: false
  });

  const templates = [];
  const existingTemplateIds = await getExistingTemplateIds();
  logger.info('> Templates initialized');

  return {templates, existingTemplateIds};
}

/**
 * Main function of the script
 * @returns {void}
 */
async function main() {
  logger.info('> Templates initialization...');
  const {templates, existingTemplateIds} = await init();

  const intervalTime = 1000  *  60;
  let requestInterval;
  while(true) {
    logger.info(intervalTime, 'Templates request at rate');
    requestInterval = await getTemplates(templates, existingTemplateIds, intervalTime, requestInterval);
    await new Promise(resolve => setTimeout(resolve, intervalTime));
  }
}

main()
  .then(() => {
    logger.info('> Worker stopped');
    process.exit(0);
  }).catch(err => {
  logger.error({ err }, '! Worker stopped unexpectedly');
  process.exit(1);
});
