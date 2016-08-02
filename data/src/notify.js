import AWS from 'aws-sdk'
import denodeify from 'denodeify'
import _ from 'lodash'
import log from './log'
import { config } from './config'

const logger = log('notify');

AWS.config.update(config.aws.auth);

var sns = new AWS.SNS({'params': {'TopicArn': config.aws.sns.topic}});
var snsPublish = denodeify(sns.publish.bind(sns));

let interval;
let queue = [];

function process() {
    let queueCopy = queue.slice();
    interval = null;
    queue = [];

    // Try to de-deduplicate repeated errors
    _.uniqWith(queueCopy, _.isEqual).forEach(q => send(q.subject, q.message));
}

function send(subject, message) {
    if (!config.argv.notify) return;

    if (interval) {
        queue.push({subject, message});
    } else {
        interval = setTimeout(process, 1000);
        logger.info('Sending notification');

        snsPublish({'Subject': subject, 'Message': message}).catch(err => {
            logger.error('Failed to send notification', err);
        });
    }
}

function error(err) {
    let subject = `${err.name}: ${err.message}`;
    let message = err.stack;
    return send(subject, message);
}

export default {send, error};
