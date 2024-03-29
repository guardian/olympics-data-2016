import AWS from 'aws-sdk'
import _ from 'lodash'
import Bottleneck from 'bottleneck'
import log from './log'
import { config } from './config'

AWS.config.update(config.aws.auth);

var cloudwatch = new AWS.CloudWatch();

var limiter = new Bottleneck(0, 10);
var logger = log('metric');

function Metric(dimensions) {
    dimensions['user'] = process.env.USER;
    let dims = _.map(dimensions, (value, name) => { return {'Name': name, 'Value': value}; });

    this.put = function put(name) {
        if (!config.argv.metric) return;

        limiter.submit(cloudwatch.putMetricData.bind(cloudwatch), {
            'MetricData': [{
                'MetricName': name,
                'Value': 1,
                'Dimensions': dims
            }],
            'Namespace': 'Olympics'
        }, function (err) {
            if (err) logger.warn('Failed to put metric', err);
        });
    };
}

export default Metric;
