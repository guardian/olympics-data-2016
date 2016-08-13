import fs from 'fs'
import path from 'path'
import mkdirp from 'mkdirp'
import moment from 'moment'
import denodeify from 'denodeify'
import rp from 'request-promise-native'
import Bottleneck from 'bottleneck'
import { config } from './config'
import notify from './notify'

const re = (strings, ...values) => new RegExp(String.raw(strings, ...values), 'i');

const cacheTimes = [
    {'endpoint': re`^olympics/[^/]+/schedule/[^/]+$`, 'duration': moment.duration(5, 'minutes')},
    {'endpoint': re`^olympics/[^/]+/medal-cast$`, 'duration': moment.duration(5, 'minutes')},
    {'endpoint': re`^olympics/[^/]+/medal-table$`, 'duration': moment.duration(5, 'minutes')},
    {'endpoint': re`^olympics/[^/]+/event-unit/[^/]+/start-list$`, 'duration' : moment.duration(1, 'hour')},
    {'endpoint': re`^olympics/[^/]+/event-unit/[^/]+/result$`, 'duration' : moment.duration(45, 'minutes')},
    {'endpoint': re`^olympics/[^/]+/event-phase/[^/]+/result`, 'duration' : moment.duration(45, 'minutes')},
    {'endpoint': re`^olympics/[^/]+/event/[^/]+/cumulative-result$`, 'duration' : moment.duration(30, 'minutes')},
    {'endpoint': re`^olympics/[^/]+/event/[^/]+/phase$`, 'duration' : moment.duration(30, 'minutes')},

    // default case
    {'endpoint': re`^.*$`, 'duration': moment.duration(6, 'hours')}
];

const fsStat = denodeify(fs.stat);
const fsReadFile = denodeify(fs.readFile);
const fsWriteFile = denodeify(fs.writeFile);
const mkdirpP = denodeify(mkdirp);

const limiter = new Bottleneck(config.pa.rateLimit, 1000 / config.pa.rateLimit);

function cacheFile(endpoint) {
    return path.join(config.pa.cacheDir, endpoint) + '.json';
}

async function writeCache(endpoint, content) {
    var file = cacheFile(endpoint);

    await mkdirpP(path.dirname(file));
    await fsWriteFile(file, JSON.stringify(content, null, 2));
}

function PA(logger, metric) {

    async function requestCache(endpoint) {
        if (Math.random() < 0.1) metric.put('cache');
        logger.info('Requesting cache', endpoint);
        let content = await fsReadFile(cacheFile(endpoint));
        return JSON.parse(content);
    }

    async function requestUrl(endpoint) {
        let _resp = await limiter.schedule(() => {
            logger.info('Requesting URL', endpoint);
            if (Math.random() < 0.1) metric.put('request');

            return rp({
                'uri': `${config.pa.baseUrl}/${endpoint}`,
                'headers': {
                    'Accept': 'application/json',
                    'Apikey': config.pa.apiKey
                }
            });
        });

        if (_resp && _resp.length > 0) {
            let resp = JSON.parse(_resp);

            if (resp.olympics) {
                await writeCache(endpoint, resp);
                return resp;
            }
        } else {
            logger.warn('Empty response for URL', endpoint);
        }

        return {'olympics': {}};
    }

    this.request = async function request(endpoint) {
        try {
            let stat = await fsStat(cacheFile(endpoint));
            let cacheTime = cacheTimes.find(ct => ct.endpoint.test(endpoint)).duration;
            let randomTime = Math.floor(Math.random() * 300);
            let expiryTime = moment(stat.mtime).add(cacheTime).add(randomTime, 'seconds');

            return await (!config.argv.pa || moment().isBefore(expiryTime) ? requestCache(endpoint) : requestUrl(endpoint));
        } catch (err) {
            if (err.code && err.code === 'ENOENT') {
                if (config.argv.pa) {
                    return await requestUrl(endpoint);
                } else {
                    logger.warn('No cached response for', endpoint);
                    return {'olympics': {}};
                }
            } else {
                throw err;
            }
        }
    };
}

export default PA;
