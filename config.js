const env = process.env.NODE_ENV;

const config = {
    get: () => {
        if(env !== 'production' || env !== 'prod' || env !== 'p') {
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


