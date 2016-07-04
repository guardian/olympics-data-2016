import util from 'util'
import parseArgs from 'minimist'
import moment from 'moment'
import fs from 'fs'
import path from 'path'
import mkdirp from 'mkdirp'
import denodeify from 'denodeify'
import aggregators from './src/aggregators'
import queue from './src/queue'
import pa from './src/pa'
import s3 from './src/s3'
import notify from './src/notify'
import config from './config'

import www from './www'

const fsWrite = denodeify(fs.writeFile.bind(fs));

var argv = parseArgs(process.argv.slice(2), {'default': {'s3': true, 'pa': true, 'loop': true, 'notify': true}});
if (argv.test) {
    argv.s3 = argv.pa = argv.loop = argv.notify = false;
}

var aggregatorWhitelist = argv._;

function getDeps(deps) {
    return Promise.all(deps.map(dep => pa.request(dep, !argv.pa)));
}

function getMoreDeps([depFn, ...restDepFns], contents) {
    if (depFn) {
        let moreDeps = depFn(...contents);
        return getDeps(moreDeps).then(moreContents => getMoreDeps(restDepFns, [...contents, moreContents]));
    } else {
        return Promise.resolve(contents);
    }
}

function aggregatorFn(aggregator) {
    function process() {
        console.log(`Processing ${aggregator.id}`);

        return getDeps(aggregator.paDeps).then(contents => {
            return getMoreDeps(aggregator.paMoreDeps || [], contents);
        }).then(contents => {
            var out = aggregator.transform(...contents);
            var p = fsWrite(path.join(config.local.aggregatorDir, aggregator.id + '.json'), JSON.stringify(out));
            return argv.s3 ? p.then(() => s3.put(aggregator.id, out)) : p;
        }).catch(err => {
            console.error(`Error processing ${aggregator.id}`, err);
            console.error(err.stack);
            if (argv.notify) {
                notify.send(`Error processing ${aggregator.id}`, `${util.inspect(err)}`);
            }
        })
        .then(() => {
            if (argv.loop) {
                setTimeout(tick, aggregator.cacheTime.asMilliseconds())
            }
        });
    }

    function tick() {
        return queue.add(process);
    }

    tick();
    return tick;
}

mkdirp.sync(config.local.aggregatorDir);

var aggregatorTickers = {};
aggregators
    .filter(aggregator => aggregatorWhitelist.length === 0 || aggregatorWhitelist.indexOf(aggregator.id) > -1)
    .forEach(aggregator => aggregatorTickers[aggregator.id] = aggregatorFn(aggregator));

www.run(aggregatorTickers);
