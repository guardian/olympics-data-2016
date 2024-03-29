import path from 'path'
import AWS from 'aws-sdk'
import denodeify from 'denodeify'
import Bottleneck from 'bottleneck'
import log from './log'
import { config } from './config'

const limiter = new Bottleneck(0, 100);

AWS.config.update(config.aws.auth);

var s3 = new AWS.S3();
var s3PutObject = denodeify(s3.putObject.bind(s3));

function S3(logger) {
    this.put = function put(id, content) {
        var key = path.join(config.aws.s3.dir, process.env.USER, id) + '.json';

        return limiter.schedule(() => {
            logger.info('Putting', key);
            return s3PutObject({
                'Bucket': config.aws.s3.bucket,
                'Key': key,
                'Body': JSON.stringify(content),
                'ACL': 'public-read',
                'CacheControl': 'max-age=60',
                'ContentType': 'application/json'
            });
        });
    }
}

export default S3;
