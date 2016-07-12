import fs from 'fs'
import path from 'path'
import mkdirp from 'mkdirp'
import moment from 'moment'
import denodeify from 'denodeify'
import reqwest from 'reqwest'
import Bottleneck from 'bottleneck'
import config from '../config'

const re = (strings, ...values) => new RegExp(String.raw(strings, ...values), 'i');

const cacheTimes = [
    {'endpoint': re`^olympics/[^/]+/discipline$`, 'duration': moment.duration(6, 'hours')},
    {'endpoint': re`^olympics/[^/]+/schedule`, 'duration': moment.duration(6, 'hours')},
    {'endpoint' : re`^olympics/[^/]+/event-unit`, 'duration' : moment.duration(6, 'hours')},
    // default case
    {'endpoint': re`^.*$`, 'duration': moment.duration(30, 'seconds')}
];

const fsStat = denodeify(fs.stat);
const fsReadFile = denodeify(fs.readFile);
const fsWriteFile = denodeify(fs.writeFile);
const mkdirpP = denodeify(mkdirp);

var limiter = new Bottleneck(0, 1000 / config.pa.rateLimit);

function cacheFile(endpoint) {
    return path.join(config.pa.cacheDir, endpoint) + '.json';
}

function writeCache(endpoint, content) {
    var file = cacheFile(endpoint);
    return mkdirpP(path.dirname(file)).then(() => fsWriteFile(file, JSON.stringify(content, null, 2)));
}

function requestCache(endpoint) {
    console.log('Requesting cache', endpoint);
    return fsReadFile(cacheFile(endpoint)).then(content => JSON.parse(content));
}

function requestUrl(endpoint) {
    return limiter.schedule(() => {
        console.log('Requesting URL', endpoint);

        return reqwest({
            'url': `${config.pa.baseUrl}/${endpoint}`,
            'type': 'json',
            'headers': {
                'Accept': 'application/json',
                'Apikey': config.pa.apiKey
            }
        });
    }).then(resp => {

        if(resp.olympics){
            return writeCache(endpoint, resp).then(() => resp);
        } else {
            return {}
        }
    });
}

function request(endpoint, forceCache=false) {
    return fsStat(cacheFile(endpoint)).then(stat => {
        var cacheTime = cacheTimes.find(ct => ct.endpoint.test(endpoint)).duration;
        var expiryTime = moment(stat.mtime).add(cacheTime);
        return forceCache || moment().isBefore(expiryTime) ? requestCache(endpoint) : requestUrl(endpoint);
    }).catch(err => {
        if (err.code && err.code === 'ENOENT') {
            return requestUrl(endpoint);
        } else {
            throw err;
        }
    });
}

export default {request};
