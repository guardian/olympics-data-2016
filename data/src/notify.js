import AWS from 'aws-sdk'
import denodeify from 'denodeify'
import config from '../config'

AWS.config.update(config.aws.auth);

var sns = new AWS.SNS({'params': {'TopicArn': config.aws.sns.topic}});
var snsPublish = denodeify(sns.publish.bind(sns));

function send(subject, message) {
    console.log('Sending notification');

    return snsPublish({'Subject': subject, 'Message': message}).catch(err => {
        console.log('Failed to send notification', err);
    });
}

export default {send};
