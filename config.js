const env = process.env.NODE_ENV;

const isProd = () => ['production', 'prod', 'p'].includes(env);

const config = {
    isProd,
    get: () => {
        if(isProd()) {
            return {
                EXTERNAL_TEMPLATES_URL: 'https://crear-encuestas-back-g9.herokuapp.com/api/polls/',
                EXTERNAL_LOGIN_URL: 'https://crear-encuestas-back-g9.herokuapp.com/login',
                EXTERNAL_LOGIN_USER: 'integracion',
                EXTERNAL_LOGIN_PASS: 'integracion123',
                EXISTING_TEMPLATE_IDS_URL: 'https://observatorio-pyme-answer-back.herokuapp.com/templates/external-ids',
            }
        } return {
            EXISTING_TEMPLATE_IDS_URL: 'http://localhost:8080/templates/external-ids',
            EXTERNAL_TEMPLATES_URL: 'https://crear-encuestas-back-g9.herokuapp.com/api/polls/',
            EXTERNAL_LOGIN_URL: 'https://crear-encuestas-back-g9.herokuapp.com/login',
            EXTERNAL_LOGIN_USER: 'integracion',
            EXTERNAL_LOGIN_PASS: 'integracion123',
        }
    }
};

module.exports = config;


