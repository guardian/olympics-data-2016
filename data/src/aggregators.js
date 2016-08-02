import fs from 'fs'
import moment from 'moment'
import _ from 'lodash'
import denodeify from 'denodeify'
import PA from './pa'
import S3 from './s3'
import Metric from './metric'
import log from './log'
import notify from './notify'
import { config } from './config'

import basicAggregators from './aggregators/basics'
import scheduleAggregator from './aggregators/schedule'

const fsWrite = denodeify(fs.writeFile.bind(fs));

export function forceArray(arr) {
    return arr === undefined ? [] : _.isArray(arr) ? arr : [arr];
}

function Aggregator(opts) {
    let logger = log(`aggregator:${opts.id}`);
    let paMetric = new Metric({'aggregator': opts.id, 'type': 'PA'})
    let statusMetric = new Metric({'aggregator': opts.id, 'type': 'status'});
    let pa = new PA(logger, paMetric);
    let s3 = new S3(logger);

    this.id = opts.id;

    async function writeData(name, data) {
        let localPath = `data-out/${name}.json`;
        await fsWrite(localPath, JSON.stringify(data, null, 2));
        if (config.argv.s3) await s3.put(name, data);
    }

    async function processCombiners([combiner, ...combiners], data, fallback=false) {
        if (!combiner) return data;

        let combinerData;

        try {
            let deps = combiner.dependencies ? combiner.dependencies(data) : [];
            logger.info(`Requesting ${deps.length} resources for ${combiner.name}`);

            let contents = await Promise.all(deps.map(dep => pa.request(dep, !config.argv.pa)));

            combinerData = combiner.process(data, contents);
            await writeData(combiner.name, {
                'timestamp': (new Date).toISOString(),
                'data': combinerData,
                fallback
            });
        } catch (err) {
            logger.error(`Error processing ${combiner.name} - ${err}, stack trace:`);
            logger.error(err.stack);
            notify.error(err);

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
            await processCombiners(opts.combiners, {});
            statusMetric.put('done');
            lastSuccess = moment();
        } catch (err) {
            statusMetric.put('failed');

            if (opts.fallbackCombiners) {
                logger.warn('Using fallbacks');
                try {
                    await processCombiners(opts.fallbackCombiners, {}, true);
                } catch (err) {
                    logger.error('Fallbacks failed');
                }
            }
        }

        if (config.argv.loop) {
            logger.info('Next tick in', opts.cacheTime.humanize());
            timeout = setTimeout(process, opts.cacheTime.asMilliseconds());
        }

        processing = false;
    };

    let healthThreshold = opts.cacheTime.asSeconds() * 1.5;
    this.isHealthy = () => {
        return lastSuccess && moment().subtract(healthThreshold, 'seconds').isBefore(lastSuccess);
    };

    this.getLastSuccess = () => lastSuccess ? lastSuccess.format() : 'never';
    this.isProcessing = () => processing;
}

export default [
    ...basicAggregators,
    scheduleAggregator
].map(agg => new Aggregator(agg));
