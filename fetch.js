import util from 'util'
import parseArgs from 'minimist'
import moment from 'moment'
import aggregators from './src/aggregators'
import queue from './src/queue'
import pa from './src/pa'
import s3 from './src/s3'
import notify from './src/notify'
import fs from 'fs'
import mkdirp from 'mkdirp'

import www from './www'

var argv = parseArgs(process.argv.slice(2), {'default': {'s3': true, 'pa': true, 'loop': true, 'notify': true}});
if (argv.test) {
    argv.s3 = argv.pa = argv.loop = argv.notify = false;
}

var aggregatorWhitelist = argv._;

function getDeps(deps) {
    return Promise.all(deps.map(dep => pa.request(dep, !argv.pa)));
}

function aggregatorFn(aggregator) {
    function process() {
        console.log(`Processing ${aggregator.id}`);

        return getDeps(aggregator.paDeps).then(contents => {

            if(aggregator.paMoreDeps) {
                let p = Promise.resolve()
                for(let i=0; i<aggregator.paMoreDeps.length; i++){
                    p = p.then(() => {
                        let moreDeps = aggregator.paMoreDeps[i].apply(null, contents)
                        return getDeps(moreDeps).then(moreContents => {
                            contents = contents.concat([moreContents])
                            return contents
                        })
                    })
                }
                return p
            }
            else {
                return Promise.resolve(contents)
            }
        }).then(contents => {
            var out = aggregator.transform.apply(null, contents)
            if (argv.s3) {
                return s3.put(aggregator.id, out);
            }
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

mkdirp.sync('out')

var aggregatorTickers = {};
aggregators
    .filter(aggregator => aggregatorWhitelist.length === 0 || aggregatorWhitelist.indexOf(aggregator.id) > -1)
    .forEach(aggregator => aggregatorTickers[aggregator.id] = aggregatorFn(aggregator));

www.run(aggregatorTickers);
