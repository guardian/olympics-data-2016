import AWS from 'aws-sdk'
import denodeify from 'denodeify'
import config from '../config'
import log from './log'

const logger = log('notify');

AWS.config.update(config.aws.auth);

var sns = new AWS.SNS({'params': {'TopicArn': config.aws.sns.topic}});
var snsPublish = denodeify(sns.publish.bind(sns));

function send(subject, message) {
    logger.info('Sending notification');

    return snsPublish({'Subject': subject, 'Message': message}).catch(err => {
        logger.error('Failed to send notification', err);
    });
}

function error(err) {
    let subject = `${err.name}: ${err.message}`;
    let message = err.stack;
    return send(subject, message);
}

export default {send, error};
