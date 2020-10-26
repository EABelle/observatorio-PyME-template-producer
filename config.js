const env = process.env.NODE_ENV;

const isProd = () => ['production', 'prod', 'p'].includes(env);

const config = {
    isProd,
    get: () => {
        if(isProd()) {
            return {
                EXTERNAL_TEMPLATES_URL: 'http://localhost:8080/templates',
                EXISTING_TEMPLATE_IDS_URL: 'http://localhost:8080/templates/external-ids',
            }
        } return {
            EXTERNAL_TEMPLATES_URL: 'http://localhost:8080/templates',
            EXISTING_TEMPLATE_IDS_URL: 'http://localhost:8080/templates/external-ids',
        }
    }
};

module.exports = config;


