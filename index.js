'use strict';
require('dotenv').config();
require('newrelic');
const amqplib = require('amqplib');
const logger = require('chpr-logger');
const Axios = require('axios');
const config = require('./config');
const templateMock = require('./template-mock.json');

const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'templates';
const ROUTING_KEY = 'templates.update';

const externalTemplatesURL = config.get().EXTERNAL_TEMPLATES_URL;
const existingTemplateIdsURL = config.get().EXISTING_TEMPLATE_IDS_URL;

const ONE_HOUR = 1000 * 60 * 60;

const generateTemplateMock = () => [{
  ...templateMock,
  id: Math.random().toString(10),
  created: (new Date()).toISOString(),
}];

const axios = Axios.create();

// TODO: Add the day filter on the backend api endpoint
async function getExternalTemplates(params = {}) {
  if (!config.isProd()) {
    return generateTemplateMock();
  }
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
  if (!config.isProd()) {
    return [];
  }

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

function publishNewTemplates(templatesResponse, templates, existingTemplateIds) {
  const newTemplates = templatesResponse.filter(t => !templates.includes(t) && !existingTemplateIds.includes(t.id));
  logger.info({ newTemplates }, '> New templates: ');

  newTemplates.forEach(template => {
    const formattedTemplate = convert(template);
    templates[template.id] = formattedTemplate;
    publish(formattedTemplate);
  });
}

function getTodayTemplates() {
  const date = new Date();
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0'); //January is 0!
  const yyyy = date.getFullYear();
  const today = `${yyyy}-${mm}-${dd}`;
  logger.info({ today }, '> Date: ');
  return getExternalTemplates({ date: today });
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
async function getTemplates(templates, existingTemplateIds = [], interval = 1000  *  60, previousInterval) {

  if (previousInterval) {
    clearInterval(previousInterval);
  }

  logger.info('> Get Templates');
  const templatesResponse = await getTodayTemplates({});
  publishNewTemplates(templatesResponse, templates, existingTemplateIds)

  return setInterval(async () => {

    const templatesResponse = await getTodayTemplates();
    publishNewTemplates(templatesResponse, templates, existingTemplateIds)

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
  await client.channel.assertExchange(EXCHANGE, 'fanout', {
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
  const cleanInterval = ONE_HOUR * 24;
  let cleanFlag = false;
  setInterval(() => {
    cleanFlag = true
  }, cleanInterval);
  let {templates, existingTemplateIds} = await init();

  const intervalTime = ONE_HOUR * 6;
  let requestInterval;
  while(true) {
    logger.info(intervalTime, 'Templates request at rate');
    requestInterval = await getTemplates(templates, existingTemplateIds, intervalTime, requestInterval);
    await new Promise(resolve => setTimeout(resolve, intervalTime));
    if (cleanFlag) {
      const cleanCache = await init();
      templates = cleanCache.templates;
      existingTemplateIds = cleanCache.existingTemplateIds;
      cleanFlag = false;
    }
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
