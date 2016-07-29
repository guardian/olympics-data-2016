import AWS from 'aws-sdk'
import config from '../config'

AWS.config.update(config.aws.auth);

var cloudwatch = new AWS.CloudWatch();

function Metric(name) {

    this.put = function put() {
        cloudwatch.putMetricData({
            'MetricData': [{
                'MetricName': name,
                'Value': 1
            }],
            'Namespace': 'Olympics-' + process.env.USER
        });
    };
}

export default Metric;
