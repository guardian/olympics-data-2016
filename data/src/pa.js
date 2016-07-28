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
    {'endpoint': re`^olympics/[^/]+/schedule/[^/]+$`, 'duration': moment.duration(5, 'minutes')},
    {'endpoint': re`^olympics/[^/]+/medal-cast$`, 'duration': moment.duration(5 'minutes')},
    {'endpoint': re`^olympics/[^/]+/medal-table`, 'duration': moment.duration(5 'minutes')},
    {'endpoint': re`^olympics/[^/]+/event-unit/[^/]+/start-list$`, 'duration' : moment.duration(30, 'minutes')},
    {'endpoint': re`^olympics/[^/]+/event-unit/[^/]+/result$`, 'duration' : moment.duration(30, 'minutes')},

    // default case
    {'endpoint': re`^.*$`, 'duration': moment.duration(6, 'hours')}
];

const fsStat = denodeify(fs.stat);
const fsReadFile = denodeify(fs.readFile);
const fsWriteFile = denodeify(fs.writeFile);
const mkdirpP = denodeify(mkdirp);

const limiter = new Bottleneck(0, 1000 / config.pa.rateLimit);

function cacheFile(endpoint) {
    return path.join(config.pa.cacheDir, endpoint) + '.json';
}

async function writeCache(endpoint, content) {
    var file = cacheFile(endpoint);

    await mkdirpP(path.dirname(file));
    await fsWriteFile(file, JSON.stringify(content, null, 2));
}

function PA(logger) {

    async function requestCache(endpoint) {
        logger.info('Requesting cache', endpoint);
        let content = await fsReadFile(cacheFile(endpoint));
        return JSON.parse(content);
    }

    function newRequest(endpoint) {
        // wrap in a real promise
        return Promise.resolve(
            reqwest({
                'url': `${config.pa.baseUrl}/${endpoint}`,
                'type': 'json',
                'headers': {
                    'Accept': 'application/json',
                    'Apikey': config.pa.apiKey
                }
            })
        );
    }

    let rpCache = {};
    async function requestUrl(endpoint) {
        await limiter.schedule(() => Promise.resolve());

        if (rpCache[endpoint]) {
            logger.info('Reusing request for URL', endpoint);
        } else {
            logger.info('Requesting URL', endpoint);
            rpCache[endpoint] = newRequest(endpoint);
        }

        let resp = await rpCache[endpoint];
        rpCache[endpoint] = null;

        if (resp.olympics) {
            await writeCache(endpoint, resp);
            return resp;
        } else {
            logger.warn('Empty response for URL', endpoint);
            return {'olympics': {}};
        }
    }

    this.request = async function request(endpoint, forceCache=false) {
        try {
            let stat = await fsStat(cacheFile(endpoint));
            var cacheTime = cacheTimes.find(ct => ct.endpoint.test(endpoint)).duration;
            var expiryTime = moment(stat.mtime).add(cacheTime);

            return await (forceCache || moment().isBefore(expiryTime) ? requestCache(endpoint) : requestUrl(endpoint));
        } catch (err) {
            if (err.code && err.code === 'ENOENT') {
                return await requestUrl(endpoint);
            } else {
                throw err;
            }
        }
    };
}

export default PA;
