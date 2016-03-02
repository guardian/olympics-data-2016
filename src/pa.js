import fs from 'fs'
import path from 'path'
import mkdirp from 'mkdirp'
import moment from 'moment'
import denodeify from 'denodeify'
import reqwest from 'reqwest'
import Bottleneck from 'bottleneck'
import config from '../config'

const BASE_URL = 'http://olympics.api.press.net/v2';

const CACHE_DIR = 'data/';
const CACHE_TIME = moment.duration(30, 'seconds');

var fsStat = denodeify(fs.stat);
var fsReadFile = denodeify(fs.readFile);
var fsWriteFile = denodeify(fs.writeFile);
var mkdirpP = denodeify(mkdirp);

var limiter = new Bottleneck(1, 100); // 10 requests per second limit

function cacheFile(endpoint) {
    return path.join(CACHE_DIR, endpoint) + '.json';
}

function writeCache(endpoint, content) {
    var file = cacheFile(endpoint);
    return mkdirpP(path.dirname(file)).then(() => fsWriteFile(file, JSON.stringify(content)));
}

function requestCache(endpoint) {
    console.log('Requesting cache', endpoint);
    return fsReadFile(cacheFile(endpoint)).then(content => JSON.parse(content));
}

function requestUrl(endpoint) {
    return limiter.schedule(() => {
        console.log('Requesting URL', endpoint);

        return reqwest({
            'url': `${BASE_URL}/${endpoint}`,
            'type': 'json',
            'headers': {
                'Accept': 'application/json',
                'Apikey': config.pa.apiKey
            }
        });
    }).then(resp => {
        return writeCache(endpoint, resp).then(() => resp);
    });
}

function request(endpoint) {
    return fsStat(cacheFile(endpoint)).then(stat => {
        var expiryTime = moment(stat.mtime).add(CACHE_TIME);
        return moment().isAfter(expiryTime) ? requestUrl(endpoint) : requestCache(endpoint);
    }).catch(err => {
        if (err.code && err.code === 'ENOENT') {
            return requestUrl(endpoint);
        } else {
            throw err;
        }
    });
}

export default {request};
