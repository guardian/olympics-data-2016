import util from 'util'
import parseArgs from 'minimist'
import moment from 'moment'
import fs from 'fs'
import path from 'path'
import mkdirp from 'mkdirp'
import denodeify from 'denodeify'
import aggregators from './src/aggregators'
import PA from './src/pa'
import S3 from './src/s3'
import Metric from './src/metric'
import notify from './src/notify'
import log from './src/log'
import config from './config.json'

import www from './www'

const fsWrite = denodeify(fs.writeFile.bind(fs));

var argv = parseArgs(process.argv.slice(2), {'default': {'s3': true, 'pa': true, 'loop': true, 'notify': true}});
if (argv.test) {
    argv.s3 = argv.pa = argv.loop = argv.notify = false;
}

var regExps = argv._.map(r => new RegExp(r))

function Aggregator(aggregator) {
    let logger = log(`aggregator:${aggregator.id}`);
    let paMetric = new Metric({'aggregator': aggregator.id, 'type': 'PA'})
    let statusMetric = new Metric({'aggregator': aggregator.id, 'type': 'status'});
    let pa = new PA(logger, paMetric);
    let s3 = new S3(logger);

    async function writeData(name, data) {
        let localPath = `data-out/${name}.json`;
        await fsWrite(localPath, JSON.stringify(data, null, 2));
        if (argv.s3) await s3.put(name, data);
    }

    async function processCombiners([combiner, ...combiners], data, fallback=false) {
        if (!combiner) return data;

        let deps = combiner.dependencies ? combiner.dependencies(data) : [];
        logger.info(`Requesting ${deps.length} resources for ${combiner.name}`);
        let contents = await Promise.all(deps.map(dep => pa.request(dep, !argv.pa)));

        let combinerData;

        try {
            combinerData = combiner.process(data, contents);
            await writeData(combiner.name, {
                'timestamp': (new Date).toISOString(),
                'data': combinerData,
                fallback
            });
        } catch (err) {
            let fn = combiner.required ? 'error' : 'warn';
            logger[fn](`Error processing ${combiner.name} - ${err}, stack trace:`);
            logger[fn](err.stack);
            if (argv.notify) {
                notify.error(err);
            }

            if (combiner.required) {
                throw err;
            }
        }

        return await processCombiners(combiners, {...data, [combiner.name]: combinerData}, fallback);
    }


    let timeout;
    let processing = false;
    let lastSuccess;

    this.process = async function process() {
        if (processing) {
            logger.warn('Already processing');
            return;
        }

        logger.info('Starting');

        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
        }

        processing = true;

        try {
            await processCombiners(aggregator.combiners, {});
            statusMetric.put('done');
            lastSuccess = moment();
        } catch (err) {
            statusMetric.put('failed');

            if (aggregator.fallbackCombiners) {
                logger.warn('Using fallbacks');
                try {
                    await processCombiners(aggregator.fallbackCombiners, {}, true);
                } catch (err) {
                    logger.error('Fallbacks failed');
                }
            }
        }


        if (argv.loop) {
            logger.info('Next tick in', aggregator.cacheTime.humanize());
            timeout = setTimeout(process, aggregator.cacheTime.asMilliseconds());
        }

        processing = false;
    };

    let healthThreshold = aggregator.cacheTime.asSeconds() * 1.5;
    this.isHealthy = function isHealthy() {
        return lastSuccess && moment().subtract(healthThreshold, 'seconds').isBefore(lastSuccess);
    };
    this.isProcessing = function isProcessing() { return processing; };

    this.process();
}

mkdirp.sync('data-out');

let aggregatorFns = {};
aggregators
    .filter(agg => regExps.length === 0 || regExps.some(r => r.test(agg.id)))
    .forEach(aggregator => aggregatorFns[aggregator.id] = new Aggregator(aggregator));

if (argv.loop) {
    www.run(aggregatorFns);
}
