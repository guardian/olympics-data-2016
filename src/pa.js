import fs from 'fs'
import path from 'path'
import moment from 'moment'
import reqwest from 'reqwest'
import cb2promise from './util/cb2promise'
import writefile from './util/writefile'
import config from '../config'

const BASE_URL = 'http://olympics.api.press.net/v2';

const CACHE_DIR = 'data/';
const CACHE_TIME = moment.duration(30, 'seconds');

var fsp = cb2promise(fs, ['stat', 'readFile']);

export function client(apiKey) {
    function cachePath(endpoint) {
        return path.join(CACHE_DIR, endpoint) + '.json';
    }

    function writeCache(endpoint, content) {
        return writefile(cachePath(endpoint), JSON.stringify(content));
    }

    function requestCache(endpoint) {
        console.log('Requesting cache', endpoint);
        return fsp.readFile(cachePath(endpoint)).then(content => JSON.parse(content));
    }

    function requestUrl(endpoint) {
        console.log('Requesting URL', endpoint);

        return reqwest({
            'url': `${BASE_URL}/${endpoint}`,
            'type': 'json',
            'headers': {
                'Accept': 'application/json',
                'Apikey': apiKey
            }
        }).then(resp => {
            return writeCache(endpoint, resp).then(() => resp);
        });
    }

    function request(endpoint) {
        return fsp.stat(cachePath(endpoint)).then(stat => {
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

    return {request};
}

export default client(config.pa.apiKey);
