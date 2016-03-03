import path from 'path'
import AWS from 'aws-sdk'
import denodeify from 'denodeify'
import config from '../config'

AWS.config.update(config.aws.auth);

var s3 = new AWS.S3();
var s3PutObject = denodeify(s3.putObject.bind(s3));

function put(id, content) {
    var key = path.join(config.aws.s3.dir, id) + '.json';
    console.log('Putting', key);

    return s3PutObject({
        'Bucket': config.aws.s3.bucket,
        'Key': key,
        'Body': JSON.stringify(content),
        'ACL': 'public-read',
        'CacheControl': 'max-age=60',
        'ContentType': 'application/json'
    });
}

export default {put};
