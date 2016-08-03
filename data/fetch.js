import parseArgs from 'minimist'
import mkdirp from 'mkdirp'
import colors from 'colors'
import prompt from 'prompt'
import aggregators from './src/aggregators'
import { set as setConfig, config } from './src/config'
import www from './www'

var argv = parseArgs(process.argv.slice(2), {'default': {
    's3': true, 'pa': true, 'loop': true, 'notify': true, 'metric': true, 'test': false, 'uat': true
}});

if (argv.test) {
    argv.s3 = argv.pa = argv.loop = argv.notify = argv.metric = false;
}

// Write args to config
Object.keys(argv).forEach(key => setConfig(`argv.${key}`, argv[key]));

if (argv.uat) {
    setConfig('pa.cacheDir', config.pa.uatCacheDir);
    setConfig('pa.baseUrl', config.pa.uatBaseUrl);
}

if (argv.pa && !argv.uat) {
    console.log('YOU ARE ABOUT TO USE THE LIVE PA DATA FEED'.red.bold);
    console.log('This could interfere with the live Olympics parser');
    console.log('Are you sure you want to do this? Type "Yes" to continue');

    prompt.get(['confirm'], (err, result) => {
        if (!err && result.confirm === 'Yes') run();
    })
} else {
    run();
}

function run() {
    mkdirp.sync('data-out');

    var idWhitelist = argv._;
    aggregators
        .filter(agg => idWhitelist.length === 0 || idWhitelist.indexOf(agg.id) > -1)
        .forEach(aggregator => aggregator.process());

    if (argv.loop) {
        www.run(aggregators);
    }
}
