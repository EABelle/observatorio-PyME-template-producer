'use strict';
require('dotenv').config();
require('newrelic');
const amqplib = require('amqplib');
const logger = require('chpr-logger');
const Axios = require('axios');
const config = require('./config');

const AMQP_URL = process.env.AMQP_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE = 'templates';
const ROUTING_KEY = 'templates.update';

const externalTemplatesURL = config.get().EXTERNAL_TEMPLATES_URL;
const externalLoginURL = config.get().EXTERNAL_LOGIN_URL;
const externalLoginUser = config.get().EXTERNAL_LOGIN_USER;
const externalLoginPass = config.get().EXTERNAL_LOGIN_PASS;
const existingTemplateIdsURL = config.get().EXISTING_TEMPLATE_IDS_URL;

const ONE_MINUTE = 1000 * 60;
const ONE_HOUR = ONE_MINUTE * 60;

function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0'); //January is 0!
  const yyyy = date.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
}

let token;

let lastDayFetched = new Date();
let time = lastDayFetched.getTime();
time -= 86400000;
lastDayFetched = new Date(time)
lastDayFetched = formatDate(lastDayFetched);

const axios = Axios.create();

// TODO: Add the day filter on the backend api endpoint
async function getExternalTemplates(params = {}) {
  try {
    const response = await axios.get(
        externalTemplatesURL,
        {
          headers: { Authorization: 'Bearer ' + token },
          params,
        },
        );
    return response.data;
  } catch (e) {
    try {
      const loginResponse = await axios.post(externalLoginURL, {
        username: externalLoginUser,
        password: externalLoginPass
      });
      token = loginResponse.data.loginUser.token;
      console.debug('TOKEN', token)
      const response = await axios.get(
          externalTemplatesURL,
          {
            headers: { Authorization: 'Bearer ' + token },
            params,
          }
      );
      return response.data;
    } catch (retryError) {
      logger.error(e);
      return [];
    }
  }
}

async function getExistingTemplateIds(params = {}) {
  if (!config.isProd()) {
    return [];
  }

  const response = await axios.get(existingTemplateIdsURL, {
    params,
  });
  console.debug('EXISTING TEMPLATE IDS', response.data);
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

function publishNewTemplates(templatesResponse, templates, existingTemplateIds) {
  const newTemplates = templatesResponse.filter(t => !templates.includes(t) && !existingTemplateIds.includes(t.id));
  logger.info({ newTemplates }, '> New templates: ');

  newTemplates.forEach(template => {
    const formattedTemplate = transform(template);
    templates[template.id] = formattedTemplate;
    publish(formattedTemplate);
  });
}

function transform(template) {
  return {
    externalId: template._id,
    modified: template.modified,
    created: template.created,
    name: template.poll_title,
    description: template.description,
    sections: [{
      title: '',
      description: '',
      questions: template.questions && template.questions.values.map(question => ({
        type: question.q_type === 'check' ? 'CHOICE'
            : 'TEXT',
        value: question.value,
        mandatory: question.mandatory,
        options: question.options,
      }))
    }]
  };
}

async function getTodayTemplates() {
  const date = new Date();
  const today = formatDate(date);
  const params = { dateFrom: lastDayFetched, dateTo: today };
  logger.info({ params }, '> Dates: ');
  const templates = await getExternalTemplates(params);
  lastDayFetched = today;
  return templates;
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
  console.debug('Get Templates OK');
  publishNewTemplates(templatesResponse, templates, existingTemplateIds)

  return setInterval(async () => {

    const templatesResponse = await getTodayTemplates();
    publishNewTemplates(templatesResponse, templates, existingTemplateIds)
    console.debug('Get Templates OK');

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

  const date = new Date();
  const today = formatDate(date);
  const templates = [];
  const existingTemplateIds = await getExistingTemplateIds({ dateFrom: lastDayFetched, dateTo: today });
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

  const intervalTime = ONE_MINUTE * 5;
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
