import parseArgs from 'minimist'
import mkdirp from 'mkdirp'
import colors from 'colors'
import aggregators from './src/aggregators'

import { set as setConfig, config } from './src/config'

import www from './www'

var argv = parseArgs(process.argv.slice(2), {'default': {
    's3': true, 'pa': true, 'loop': true, 'notify': true, 'test': false, 'uat': true
}});

if (argv.test) {
    argv.s3 = argv.pa = argv.loop = argv.notify = false;
}

if (argv.uat) {
    setConfig('pa.cacheDir', config.pa.uatCacheDir);
    setConfig('pa.baseUrl', config.pa.uatBaseUrl);
} else {
    for (let i = 0; i < 100; i++) {
        console.log('USING LIVE DATA'.red);
    }
}

// Write args to config
Object.keys(argv).forEach(key => setConfig(`argv.${key}`, argv[key]));

mkdirp.sync('data-out');

var idWhitelist = argv._;
aggregators
    .filter(agg => idWhitelist.length === 0 || idWhitelist.indexOf(agg.id) > -1)
    .forEach(aggregator => aggregator.process());

if (argv.loop) {
    www.run(aggregators);
}
